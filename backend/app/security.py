"""Password/session primitives and bounded, process-local authentication throttling."""

import hashlib
import hmac
import math
import os
import secrets
import threading
import time
from urllib.parse import urlsplit

from fastapi import HTTPException
from starlette.responses import JSONResponse


COOKIE_NAME = "nutri_scan_session"
SESSION_SECONDS = 7 * 24 * 60 * 60
DEV_ORIGINS = {
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in (5173, 5174)
}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1, maxmem=64 * 1024 * 1024)
    return f"scrypt$32768$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if (algorithm, n, r, p) != ("scrypt", "32768", "8", "1"):
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(digest, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def allowed_origins() -> set[str]:
    origins = set(DEV_ORIGINS)
    for entry in os.getenv("NUTRI_SCAN_ORIGINS", "").split(","):
        if not entry.strip():
            continue
        origin = entry.strip().rstrip("/")
        parsed = urlsplit(origin)
        if (parsed.scheme not in {"http", "https"} or not parsed.netloc
                or parsed.path or parsed.query or parsed.fragment
                or parsed.username or parsed.password or "*" in origin):
            raise ValueError("NUTRI_SCAN_ORIGINS must contain explicit http(s) origins")
        origins.add(origin)
    return origins


def secure_cookies() -> bool:
    value = os.getenv("NUTRI_SCAN_COOKIE_SECURE", "false").lower()
    if value not in {"true", "false", "1", "0"}:
        raise ValueError("NUTRI_SCAN_COOKIE_SECURE must be true or false")
    return value in {"true", "1"}


class LoginThrottle:
    """At most ten auth attempts per peer and username per five minutes.

    Fixed-window entries expire; a full table rejects new keys instead of evicting
    active limits. Neither usernames nor supplied passwords are retained.
    """

    def __init__(self, limit: int = 10, window: int = 300, capacity: int = 2048):
        self.limit, self.window, self.capacity = limit, window, capacity
        self.entries: dict[str, tuple[int, float]] = {}
        self.lock = threading.Lock()

    def check(self, peer: str, username: str) -> None:
        keys = ("peer:" + token_hash(peer), "user:" + token_hash(username))
        now = time.monotonic()
        with self.lock:
            self.entries = {key: entry for key, entry in self.entries.items() if entry[1] > now}
            for key in keys:
                count, expires = self.entries.get(key, (0, now + self.window))
                if count >= self.limit:
                    raise HTTPException(429, "Too many authentication attempts", headers={"Retry-After": str(max(1, math.ceil(expires - now)))})
            if len(self.entries) + sum(key not in self.entries for key in keys) > self.capacity:
                raise HTTPException(429, "Authentication temporarily throttled", headers={"Retry-After": str(self.window)})
            for key in keys:
                count, expires = self.entries.get(key, (0, now + self.window))
                self.entries[key] = (count + 1, expires)


class PrivateRequestMiddleware:
    """Origin-based CSRF guard, plus no-store for all private responses/errors."""

    def __init__(self, app, origins: set[str]):
        self.app, self.origins = app, origins

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/v1/"):
            await self.app(scope, receive, send)
            return

        async def private_send(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() not in {b"cache-control", b"x-content-type-options"}]
                message = {**message, "headers": headers + [(b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff")]}
            await send(message)

        if scope["method"] not in {"GET", "HEAD", "OPTIONS"}:
            origins = [value.decode("latin1") for key, value in scope["headers"] if key.lower() == b"origin"]
            hosts = [value.decode("latin1") for key, value in scope["headers"] if key.lower() == b"host"]
            own_origin = f"{scope['scheme']}://{hosts[0]}" if len(hosts) == 1 else None
            if len(origins) != 1 or origins[0] not in self.origins | {own_origin}:
                await JSONResponse({"detail": "A trusted Origin header is required"}, status_code=403)(scope, receive, private_send)
                return
        await self.app(scope, receive, private_send)

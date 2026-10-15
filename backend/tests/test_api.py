"""API contract/security tests. Every database is an isolated temporary file."""

import copy
import io
import os
import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin

from app.engine import analyze
from app.main import MAX_PHOTO_BYTES, create_app
from app.models import AnalyzeRequest
from app.security import COOKIE_NAME, LoginThrottle, token_hash
from app.storage import SQLiteRepository


ORIGIN = {"Origin": "http://localhost:5173"}
PASSWORD = "test-password-123"
INPUTS = {
    "sensor": {"moisture_pct": 62, "ph": 4.2, "temperature_c": 24, "humidity_pct": 68},
    "nir": {"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
    "vision": {"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
}


@contextmanager
def open_database(path):
    connection = sqlite3.connect(path)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def scan_body(**changes):
    return {"batch_id": "SIL-API-01", "sample_type": "silage", "inputs": copy.deepcopy(INPUTS), **changes}


def image_bytes(format="PNG", metadata=False):
    output = io.BytesIO()
    image = Image.new("RGB", (32, 24), "red")
    kwargs = {}
    if metadata:
        exif = Image.Exif()
        exif[270] = "private location"
        kwargs["exif"] = exif
        if format == "PNG":
            info = PngImagePlugin.PngInfo()
            info.add_text("private", "hidden farm metadata")
            kwargs["pnginfo"] = info
    image.save(output, format, **kwargs)
    return output.getvalue()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / "api.sqlite3"
        self.env = patch.dict(os.environ, {"NUTRI_SCAN_ORIGINS": "", "NUTRI_SCAN_COOKIE_SECURE": "false"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = create_app(self.database)
        self.client = self.new_client()

    def new_client(self, app=None, base_url="http://testserver"):
        client = TestClient(app or self.app, base_url=base_url)
        self.addCleanup(client.close)
        return client

    def register(self, client=None, username="owner", farm_name="Owner Farm"):
        client = client or self.client
        response = client.post("/api/v1/auth/register", headers=ORIGIN, json={"username": username, "password": PASSWORD, "farm_name": farm_name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def scan(self, client=None, **changes):
        response = (client or self.client).post("/api/v1/scans", headers=ORIGIN, json=scan_body(**changes))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def photo(self, scan_id, client=None, format="PNG", **headers):
        return (client or self.client).post(
            f"/api/v1/scans/{scan_id}/photos", content=image_bytes(format),
            headers={**ORIGIN, "Content-Type": {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[format], **headers},
        )

    def member_login(self, username, role):
        response = self.client.post("/api/v1/members", headers=ORIGIN, json={"username": username, "password": PASSWORD, "role": role})
        self.assertEqual(response.status_code, 201, response.text)
        member = self.new_client()
        response = member.post("/api/v1/auth/login", headers=ORIGIN, json={"username": username, "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        return member

    def test_signup_login_logout_hashes_cookie_and_replay_revocation(self):
        account = self.register(username=" OWNER ")
        self.assertEqual(account["user"]["username"], "owner")
        self.assertEqual(account["user"]["role"], "owner")
        UUID(account["user"]["id"])
        UUID(account["farm"]["id"])
        token = self.client.cookies.get(COOKIE_NAME)
        with open_database(self.database) as db:
            password_hash = db.execute("SELECT password_hash FROM users").fetchone()[0]
            stored_token = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertTrue(password_hash.startswith("scrypt$32768$8$1$"))
        self.assertNotIn(PASSWORD, password_hash)
        self.assertNotEqual(token, stored_token)
        self.assertEqual(token_hash(token), stored_token)
        self.assertEqual(self.client.get("/api/v1/auth/me").json(), account)
        response = self.client.post("/api/v1/auth/logout", headers=ORIGIN)
        self.assertEqual(response.status_code, 204)
        self.assertIn("Max-Age=0", response.headers["set-cookie"])
        self.assertIsNone(self.client.cookies.get(COOKIE_NAME))
        replay = self.new_client()
        replay.cookies.set(COOKIE_NAME, token)
        self.assertEqual(replay.get("/api/v1/auth/me").status_code, 401)
        response = self.client.post("/api/v1/auth/login", headers=ORIGIN, json={"username": "OWNER", "password": PASSWORD})
        self.assertEqual(response.json(), account)
        cookie = response.headers["set-cookie"]
        for expected in ("HttpOnly", "SameSite=lax", "Max-Age=604800"):
            self.assertIn(expected, cookie)
        self.assertNotIn("; Secure", cookie)
        self.assertNotEqual(self.client.cookies.get(COOKIE_NAME), token)

    def test_registration_validation_duplicate_username_and_no_farm_claiming(self):
        account = self.register()
        payload = {"username": "new-user", "password": "short", "farm_name": "Farm"}
        self.assertEqual(self.client.post("/api/v1/auth/register", headers=ORIGIN, json=payload).status_code, 422)
        payload["password"] = PASSWORD
        payload["farm_id"] = account["farm"]["id"]
        self.assertEqual(self.client.post("/api/v1/auth/register", headers=ORIGIN, json=payload).status_code, 422)
        payload.pop("farm_id")
        payload["username"] = "owner"
        self.assertEqual(self.client.post("/api/v1/auth/register", headers=ORIGIN, json=payload).status_code, 409)
        other = self.register(self.new_client(), "other", "Owner Farm")
        self.assertNotEqual(other["farm"]["id"], account["farm"]["id"])
        with open_database(self.database) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM farms").fetchone()[0], 2)

    def test_email_style_username_is_accepted_and_normalized(self):
        account = self.register(username=" AtifMakandar5@Gmail.Com ")
        self.assertEqual(account["user"]["username"], "atifmakandar5@gmail.com")

    def test_session_expiry_and_invalid_login(self):
        self.register()
        with open_database(self.database) as db:
            db.execute("UPDATE sessions SET expires_at = 0")
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)
        for username, password in (("owner", "wrong-password"), ("unknown", PASSWORD)):
            response = self.client.post("/api/v1/auth/login", headers=ORIGIN, json={"username": username, "password": password})
            self.assertEqual(response.status_code, 401)

    def test_every_private_endpoint_requires_authentication(self):
        for path in ("/auth/me", "/scans", "/scans/search", "/scans/unknown", "/history", "/members", "/scans/unknown/photos", "/scans/unknown/photos/unknown"):
            with self.subTest(path=path):
                response = self.client.get("/api/v1" + path)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.headers["cache-control"], "no-store")
        legacy = {"sample_type": "silage", **INPUTS}
        for path, data in (("/scans", scan_body()), ("/analyze", legacy), ("/members", {"username": "member", "password": PASSWORD, "role": "member"})):
            self.assertEqual(self.client.post("/api/v1" + path, headers=ORIGIN, json=data).status_code, 401)
        self.assertEqual(self.photo("unknown").status_code, 401)
        self.assertEqual(self.client.delete("/api/v1/scans/unknown/photos/unknown", headers=ORIGIN).status_code, 401)

    def test_csrf_origins_cors_and_secure_cookie_environment(self):
        payload = {"username": "owner", "password": PASSWORD, "farm_name": "Farm"}
        for headers in ({}, {"Origin": "https://evil.example"}, {"Origin": "null"}, {"Origin": "http://localhost:5175"}):
            self.assertEqual(self.client.post("/api/v1/auth/register", headers=headers, json=payload).status_code, 403)
        response = self.client.post("/api/v1/auth/register", headers={"Origin": "http://testserver"}, json=payload)
        self.assertEqual(response.status_code, 201)
        for host in ("localhost", "127.0.0.1"):
            for port in (5173, 5174):
                origin = f"http://{host}:{port}"
                response = self.client.options("/api/v1/scans", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
                self.assertEqual(response.headers["access-control-allow-origin"], origin)
                self.assertEqual(response.headers["access-control-allow-credentials"], "true")
        response = self.client.options("/api/v1/scans", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
        self.assertNotIn("access-control-allow-origin", response.headers)
        with patch.dict(os.environ, {"NUTRI_SCAN_ORIGINS": "https://farm.example", "NUTRI_SCAN_COOKIE_SECURE": "true"}):
            secure = self.new_client(create_app(self.database), "https://testserver")
            response = secure.post("/api/v1/auth/login", headers={"Origin": "https://farm.example"}, json={"username": "owner", "password": PASSWORD})
            self.assertEqual(response.status_code, 200)
            self.assertIn("; Secure", response.headers["set-cookie"])
            self.assertEqual(response.headers["access-control-allow-origin"], "https://farm.example")
            self.assertEqual(secure.get("/api/v1/auth/me").status_code, 200)
        with patch.dict(os.environ, {"NUTRI_SCAN_ORIGINS": "*"}):
            with self.assertRaises(ValueError):
                create_app(self.database)

    def test_login_throttle_is_bounded_and_expires(self):
        self.app.state.throttle = LoginThrottle(limit=2, window=300, capacity=8)
        for _ in range(2):
            self.assertEqual(self.client.post("/api/v1/auth/login", headers=ORIGIN, json={"username": "missing", "password": PASSWORD}).status_code, 401)
        response = self.client.post("/api/v1/auth/login", headers=ORIGIN, json={"username": "different", "password": PASSWORD})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response.headers)
        throttle = LoginThrottle(limit=1, window=5, capacity=2)
        with patch("app.security.time.monotonic", return_value=0):
            throttle.check("a", "b")
            with self.assertRaises(Exception) as error:
                throttle.check("different", "different")
            self.assertEqual(error.exception.status_code, 429)
            self.assertLessEqual(len(throttle.entries), 2)
        with patch("app.security.time.monotonic", return_value=6):
            throttle.check("a", "b")

    def test_farm_isolation_on_scans_history_legacy_and_all_photo_operations(self):
        account = self.register()
        saved = self.scan()
        scan_id = saved["scan"]["id"]
        photo = self.photo(scan_id).json()
        other = self.new_client()
        self.register(other, "other")
        for path in (f"/scans/{scan_id}", f"/scans/{scan_id}/photos", photo["url"].removeprefix("/api/v1")):
            self.assertEqual(other.get("/api/v1" + path).status_code, 404)
        self.assertEqual(other.get("/api/v1/scans").json(), [])
        self.assertEqual(other.get("/api/v1/scans/search").json()["total"], 0)
        self.assertEqual(other.get("/api/v1/history").json(), [])
        self.assertEqual(self.photo(scan_id, other).status_code, 404)
        self.assertEqual(other.delete(photo["url"], headers=ORIGIN).status_code, 404)
        for path in ("/scans", "/scans/search", "/history", f"/scans/{scan_id}", f"/scans/{scan_id}/photos", photo["url"].removeprefix("/api/v1")):
            self.assertEqual(other.get("/api/v1" + path, params={"farm_id": account["farm"]["id"]}).status_code, 403)
        response = other.post("/api/v1/scans", headers=ORIGIN, json=scan_body(farm_id=account["farm"]["id"]))
        self.assertEqual(response.status_code, 403)
        legacy = {"sample_type": "silage", **INPUTS, "farm_id": account["farm"]["id"]}
        self.assertEqual(other.post("/api/v1/analyze", headers=ORIGIN, json=legacy).status_code, 403)
        legacy.pop("farm_id")
        self.assertEqual(other.post("/api/v1/analyze", headers=ORIGIN, json=legacy).status_code, 200)
        self.assertEqual(len(other.get("/api/v1/history").json()), 1)
        self.assertEqual(len(self.client.get("/api/v1/history").json()), 1)

    def test_owner_member_and_viewer_permissions(self):
        self.register()
        member = self.member_login("member", "member")
        viewer = self.member_login("viewer", "viewer")
        self.assertEqual({user["role"] for user in self.client.get("/api/v1/members").json()}, {"owner", "member", "viewer"})
        scan_id = self.scan(member)["scan"]["id"]
        photo = self.photo(scan_id, member)
        self.assertEqual(photo.status_code, 201)
        for client in (member, viewer):
            self.assertEqual(client.get("/api/v1/members").status_code, 403)
            self.assertEqual(client.post("/api/v1/members", headers=ORIGIN, json={"username": "new-member", "password": PASSWORD, "role": "member"}).status_code, 403)
        for path in ("/api/v1/scans", "/api/v1/scans/search", f"/api/v1/scans/{scan_id}", f"/api/v1/scans/{scan_id}/photos", photo.json()["url"], "/api/v1/history"):
            self.assertEqual(viewer.get(path).status_code, 200)
        self.assertEqual(viewer.post("/api/v1/scans", headers=ORIGIN, json=scan_body()).status_code, 403)
        self.assertEqual(viewer.post("/api/v1/analyze", headers=ORIGIN, json={"sample_type": "silage", **INPUTS}).status_code, 403)
        self.assertEqual(self.photo(scan_id, viewer).status_code, 403)
        self.assertEqual(viewer.delete(photo.json()["url"], headers=ORIGIN).status_code, 403)
        self.assertEqual(member.delete(photo.json()["url"], headers=ORIGIN).status_code, 204)
        self.assertEqual(self.client.post("/api/v1/members", headers=ORIGIN, json={"username": "new-owner", "password": PASSWORD, "role": "owner"}).status_code, 422)

    def test_offline_idempotency_survives_restart_and_is_farm_scoped(self):
        self.register()
        payload = scan_body(client_request_id="offline-123")
        first = self.client.post("/api/v1/scans", headers=ORIGIN, json=payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.client.post("/api/v1/scans", headers=ORIGIN, json=payload).json(), first.json())
        restarted = self.new_client(create_app(self.database))
        restarted.cookies.update(self.client.cookies)
        self.assertEqual(restarted.post("/api/v1/scans", headers=ORIGIN, json=payload).json(), first.json())
        for changes in ({"batch_id": "DIFFERENT"}, {"collected_at": "2026-01-01T00:00:00Z"}, {"source_mode": "mobile"}):
            self.assertEqual(restarted.post("/api/v1/scans", headers=ORIGIN, json={**payload, **changes}).status_code, 409)
        other = self.new_client()
        self.register(other, "other")
        separate = other.post("/api/v1/scans", headers=ORIGIN, json=payload)
        self.assertEqual(separate.status_code, 201)
        self.assertNotEqual(separate.json()["scan"]["id"], first.json()["scan"]["id"])
        self.assertEqual(len(self.client.get("/api/v1/scans").json()), 1)
        for request_id in ("", "x" * 81):
            self.assertEqual(self.client.post("/api/v1/scans", headers=ORIGIN, json=scan_body(client_request_id=request_id)).status_code, 422)

    def test_concurrent_scan_retries_create_one_row(self):
        self.register()
        token = self.client.cookies.get(COOKIE_NAME)
        def retry(_):
            with TestClient(self.app) as client:
                client.cookies.set(COOKIE_NAME, token)
                return client.post("/api/v1/scans", headers=ORIGIN, json=scan_body(client_request_id="concurrent"))
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(retry, range(4)))
        self.assertTrue(all(response.status_code == 201 for response in responses))
        self.assertEqual(len({response.json()["scan"]["id"] for response in responses}), 1)
        self.assertEqual(self.client.get("/api/v1/scans/search").json()["total"], 1)

    def test_search_literal_filters_pagination_and_inclusive_utc_collection_dates(self):
        self.register()
        for batch, collected, sample in (
            ("LOT%_\\A", "2026-03-01T00:00:00Z", "silage"),
            ("LOT-MIDDLE", "2026-03-02T12:00:00Z", "feed"),
            ("LOT-END", "2026-03-03T23:59:59.999999Z", "silage"),
            ("LOT-OUT", "2026-03-04T00:00:00Z", "silage"),
            ("LOT-OFFSET", "2026-03-04T01:00:00+02:00", "silage"),
        ):
            self.scan(batch_id=batch, collected_at=collected, sample_type=sample)
        def search(**params):
            response = self.client.get("/api/v1/scans/search", params=params)
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()
        result = search(batch_query="%_\\")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["scan"]["batch_id"], "LOT%_\\A")
        self.assertEqual(search(batch_id="LOT-END")["total"], 1)
        self.assertEqual(search(sample_type="feed")["total"], 1)
        risk = result["items"][0]["result"]["risk_level"]
        self.assertGreater(search(risk_level=risk)["total"], 0)
        filtered = search(date_from="2026-03-01", date_to="2026-03-03", batch_query="LOT")
        self.assertEqual(filtered["total"], 4)
        self.assertEqual(search(date_from="2026-03-03", date_to="2026-03-03")["total"], 2)
        page = search(limit=2, offset=1)
        self.assertEqual((page["total"], page["limit"], page["offset"], len(page["items"])), (5, 2, 1, 2))
        self.assertEqual(search()["limit"], 20)
        self.assertEqual(search(offset=100)["items"], [])
        old_list = self.client.get("/api/v1/scans", params={"batch_id": "LOT-END", "sample_type": "silage"}).json()
        self.assertEqual(len(old_list), 1)
        self.assertEqual(set(old_list[0]), {"scan", "result"})
        for params in ({"limit": 101}, {"offset": -1}, {"risk_level": "BAD"}, {"date_from": "2026-02-30"}, {"date_from": "2026-3-1"}, {"date_from": "2026-03-02", "date_to": "2026-03-01"}, {"date_from": "2026-03-01T00:00:00Z"}):
            self.assertEqual(self.client.get("/api/v1/scans/search", params=params).status_code, 422)

    def test_photo_validation_normalization_metadata_visibility_and_limits(self):
        self.register()
        scan_id = self.scan()["scan"]["id"]
        invalid = self.client.post(
            f"/api/v1/scans/{scan_id}/photos", headers={**ORIGIN, "Content-Type": "image/svg+xml"}, content=b"<svg><script>alert(1)</script></svg>",
        )
        self.assertEqual(invalid.status_code, 415)
        mismatch = self.client.post(
            f"/api/v1/scans/{scan_id}/photos", headers={**ORIGIN, "Content-Type": "image/png"}, content=image_bytes("JPEG"),
        )
        self.assertEqual(mismatch.status_code, 400)
        bad = self.client.post(
            f"/api/v1/scans/{scan_id}/photos", headers={**ORIGIN, "Content-Type": "image/png"}, content=b"not an image",
        )
        self.assertEqual(bad.status_code, 400)
        too_big = self.client.post(
            f"/api/v1/scans/{scan_id}/photos", headers={**ORIGIN, "Content-Type": "image/png", "Content-Length": str(MAX_PHOTO_BYTES + 1)}, content=b"x",
        )
        self.assertEqual(too_big.status_code, 413)
        photo = self.client.post(
            f"/api/v1/scans/{scan_id}/photos", headers={**ORIGIN, "Content-Type": "image/png", "X-Filename": "../../secret.svg"}, content=image_bytes("PNG", metadata=True),
        )
        self.assertEqual(photo.status_code, 201, photo.text)
        metadata = photo.json()
        self.assertEqual(metadata["filename"], "secret.png")
        self.assertEqual(set(metadata), {"id", "filename", "content_type", "url", "created_at"})
        listing = self.client.get(f"/api/v1/scans/{scan_id}/photos")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json(), [metadata])
        downloaded = self.client.get(metadata["url"])
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.headers["cache-control"], "no-store")
        self.assertEqual(downloaded.headers["x-content-type-options"], "nosniff")
        self.assertEqual(downloaded.headers["content-type"], "image/png")
        with Image.open(io.BytesIO(downloaded.content)) as normalized:
            self.assertEqual(normalized.info, {})
            self.assertEqual(normalized.getexif(), {})
        self.assertEqual(self.client.get("/uploads/anything").status_code, 404)
        for format in ("JPEG", "WEBP"):
            response = self.photo(scan_id, format=format)
            self.assertEqual(response.status_code, 201, response.text)
        for _ in range(2):
            self.assertEqual(self.photo(scan_id).status_code, 201)
        self.assertEqual(self.photo(scan_id).status_code, 409)
        self.assertEqual(self.client.delete(metadata["url"], headers=ORIGIN).status_code, 204)
        self.assertEqual(self.client.get(metadata["url"]).status_code, 404)

    def test_existing_database_is_additively_migrated_and_legacy_move_keeps_photo_link(self):
        legacy = Path(self.temp.name) / "old.sqlite3"
        now = "2025-12-31T23:59:59+00:00"
        result = analyze(AnalyzeRequest(sample_type="silage", **INPUTS))
        with open_database(legacy) as db:
            db.executescript(
                """
                CREATE TABLE farms (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE scans (
                    id TEXT PRIMARY KEY, farm_id TEXT NOT NULL, batch_id TEXT NOT NULL,
                    sample_type TEXT NOT NULL, source_mode TEXT NOT NULL, device_id TEXT,
                    collected_at TEXT NOT NULL, created_at TEXT NOT NULL, inputs_json TEXT NOT NULL,
                    result_json TEXT NOT NULL
                );
                INSERT INTO farms VALUES ('legacy-farm', 'Old Farm', '2020-01-01T00:00:00+00:00');
                """,
            )
            db.execute(
                "INSERT INTO scans VALUES (?, 'legacy-farm', 'OLD-1', 'silage', 'manual', NULL, ?, ?, ?, ?)",
                (result.id, now, now, json_dumps(INPUTS), json_dumps(result.model_dump(mode="json"))),
            )
        repository = SQLiteRepository(legacy)
        loaded_before = repository.get_scan(result.id, farm_id="legacy-farm")
        self.assertEqual(loaded_before.scan.batch_id, "OLD-1")
        owner = repository.register_owner("new-owner", "scrypt$32768$8$1$00$00", "New Farm")
        photo = repository.add_photo(result.id, "legacy-farm", "old.png", "image/png", image_bytes())
        self.assertEqual(repository.assign_legacy("new-owner", "legacy-farm"), 1)
        moved = repository.get_scan(result.id, farm_id=owner["farm_id"])
        self.assertIsNotNone(moved)
        self.assertEqual(repository.get_scan(result.id, farm_id="legacy-farm"), None)
        self.assertEqual(repository.get_photo(result.id, photo.id, owner["farm_id"])["id"], photo.id)
        with open_database(legacy) as db:
            columns = {row[1] for row in db.execute("PRAGMA table_info(scans)")}
            self.assertTrue({"client_request_id", "request_hash"}.issubset(columns))


def json_dumps(value):
    import json
    return json.dumps(value, separators=(",", ":"))

from __future__ import annotations

import io
import os
import re
import secrets
import time
import warnings
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool
from starlette.staticfiles import StaticFiles

from .engine import analyze
from .fieldwork import install_fieldwork_routes
from .models import (
    AnalysisResult,
    AnalyzeRequest,
    FarmResponse,
    InputBundle,
    LoginRequest,
    MemberCreateRequest,
    PhotoResponse,
    RegisterRequest,
    SampleType,
    ScanCreateRequest,
    ScanResponse,
    ScanSearchResponse,
    SessionResponse,
    UserResponse,
)
from .security import (
    COOKIE_NAME,
    SESSION_SECONDS,
    LoginThrottle,
    PrivateRequestMiddleware,
    allowed_origins,
    hash_password,
    secure_cookies,
    token_hash,
    verify_password,
)
from .storage import ConflictError, MissingScanError, SQLiteRepository


MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTO_PIXELS = 25_000_000
PHOTO_TYPES = {"image/jpeg": ("JPEG", ".jpg"), "image/png": ("PNG", ".png"), "image/webp": ("WEBP", ".webp")}


def normalize_photo(payload: bytes, content_type: str) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(payload)) as image:
                if image.format != PHOTO_TYPES[content_type][0]:
                    raise HTTPException(status_code=400, detail="Image does not match Content-Type")
                if image.width * image.height > MAX_PHOTO_PIXELS or max(image.size) > 8192:
                    raise HTTPException(status_code=413, detail="Photo dimensions are too large")
                image.verify()
            with Image.open(io.BytesIO(payload)) as original:
                # Fresh pixels prevent Pillow from carrying EXIF, ICC, comments,
                # PNG text, or animation metadata into the normalized file.
                oriented = ImageOps.exif_transpose(original)
                mode = "RGB" if content_type == "image/jpeg" else "RGBA"
                pixels = oriented.convert(mode)
                image = Image.frombytes(mode, pixels.size, pixels.tobytes())
                output = io.BytesIO()
                image.save(output, format=PHOTO_TYPES[content_type][0])
                return output.getvalue()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=413, detail="Photo dimensions are too large") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise HTTPException(status_code=400, detail="Invalid image") from exc


def _private_payload(user: dict) -> SessionResponse:
    return SessionResponse(
        user=UserResponse(id=user["id"], username=user["username"], role=user["role"]),
        farm=FarmResponse(id=user["farm_id"], name=user["farm_name"]),
    )


def create_app(db_path: str | os.PathLike[str] | None = None) -> FastAPI:
    # Importing the ASGI entry point must never open the live database in tests.
    # Explicit test paths initialize immediately; the deployed app starts in lifespan.
    repository = SQLiteRepository(db_path) if db_path is not None else None

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        nonlocal repository
        if repository is None:
            repository = SQLiteRepository()
            application.state.repository = repository
        yield

    origins = allowed_origins()
    app = FastAPI(title="Nutri-Scan AI API", version="0.3.0", lifespan=lifespan)
    app.state.repository = repository
    app.state.throttle = LoginThrottle()
    app.state.cookie_secure = secure_cookies()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Filename"],
        expose_headers=[],
    )
    app.add_middleware(PrivateRequestMiddleware, origins=origins)

    def current_user(request: Request) -> dict:
        token = request.cookies.get(COOKIE_NAME)
        user = repository.session_user(token_hash(token)) if token else None
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if any(farm_id != user["farm_id"] for farm_id in request.query_params.getlist("farm_id")):
            raise HTTPException(status_code=403, detail="Farm scope cannot be changed")
        return user

    def writer(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in {"owner", "member"}:
            raise HTTPException(status_code=403, detail="Viewer accounts are read-only")
        return user

    def owner(user: dict = Depends(current_user)) -> dict:
        if user["role"] != "owner":
            raise HTTPException(status_code=403, detail="Owner access required")
        return user

    def check_farm_filter(farm_id: str | None, user: dict) -> None:
        if farm_id is not None and farm_id != user["farm_id"]:
            raise HTTPException(status_code=403, detail="Farm scope cannot be changed")

    def set_session(response: Response, user: dict) -> None:
        token = secrets.token_urlsafe(32)
        repository.create_session(token_hash(token), user["id"], int(time.time()) + SESSION_SECONDS)
        response.set_cookie(
            COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
            secure=app.state.cookie_secure, samesite="lax", path="/",
        )

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "nutri-scan-ai", "storage": "sqlite"}

    @app.post("/api/v1/auth/register", response_model=SessionResponse, status_code=201)
    def register(req: RegisterRequest, response: Response):
        try:
            user = repository.register_owner(req.username, hash_password(req.password), req.farm_name)
        except ConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        set_session(response, user)
        return _private_payload(user)

    @app.post("/api/v1/auth/login", response_model=SessionResponse)
    def login(req: LoginRequest, request: Request, response: Response):
        peer = request.client.host if request.client else "unknown"
        app.state.throttle.check(peer, req.username)
        user = repository.get_user(req.username)
        if user is None:
            # Keep unknown usernames on the same expensive password-hashing path.
            hash_password(req.password)
        if not user or not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        set_session(response, user)
        return _private_payload(user)

    @app.post("/api/v1/auth/logout", status_code=204)
    def logout(request: Request, response: Response):
        token = request.cookies.get(COOKIE_NAME)
        if token:
            repository.revoke_session(token_hash(token))
        response.delete_cookie(COOKIE_NAME, path="/", secure=app.state.cookie_secure, httponly=True, samesite="lax")
        response.status_code = 204
        return response

    @app.get("/api/v1/auth/me", response_model=SessionResponse)
    def me(user: dict = Depends(current_user)):
        return _private_payload(user)

    @app.get("/api/v1/members", response_model=list[UserResponse])
    def members(user: dict = Depends(owner)):
        return repository.list_members(user["farm_id"])

    @app.post("/api/v1/members", response_model=UserResponse, status_code=201)
    def create_member(req: MemberCreateRequest, user: dict = Depends(owner)):
        try:
            created = repository.create_member(user["id"], req.username, hash_password(req.password), req.role)
        except ConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return UserResponse(id=created["id"], username=created["username"], role=created["role"])

    @app.post("/api/v1/analyze", response_model=AnalysisResult)
    def run_analysis(req: AnalyzeRequest, user: dict = Depends(writer)):
        check_farm_filter(req.farm_id, user)
        result = analyze(req)
        repository.save_scan(
            ScanCreateRequest(
                farm_id=user["farm_id"], batch_id=f"LEGACY-{uuid4().hex[:8].upper()}",
                sample_type=req.sample_type, source_mode="esp32",
                inputs=InputBundle(sensor=req.sensor, nir=req.nir, vision=req.vision),
            ), result,
        )
        return result

    @app.get("/api/v1/history", response_model=list[AnalysisResult])
    def get_history(farm_id: str | None = None, user: dict = Depends(current_user)):
        check_farm_filter(farm_id, user)
        return [item.result for item in repository.list_scans(farm_id=user["farm_id"], limit=50)]

    @app.post("/api/v1/scans", response_model=ScanResponse, status_code=201)
    def create_scan(req: ScanCreateRequest, user: dict = Depends(writer)):
        if req.farm_id is not None and req.farm_id != user["farm_id"]:
            raise HTTPException(status_code=403, detail="Farm scope cannot be changed")
        request = req.model_copy(update={"farm_id": user["farm_id"]})
        result = analyze(AnalyzeRequest(sample_type=request.sample_type, sensor=request.inputs.sensor, nir=request.inputs.nir, vision=request.inputs.vision))
        try:
            return repository.save_scan(request, result)
        except ConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/v1/scans/search", response_model=ScanSearchResponse)
    def search_scans(
        farm_id: str | None = None,
        batch_query: str | None = Query(default=None, max_length=80),
        batch_id: str | None = Query(default=None, max_length=80),
        sample_type: SampleType | None = None,
        risk_level: str | None = Query(default=None, pattern=r"^(LOW|MEDIUM|HIGH)$"),
        date_from: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
        date_to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user),
    ):
        check_farm_filter(farm_id, user)
        try:
            for value in (date_from, date_to):
                if value is not None:
                    date.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Dates must be valid YYYY-MM-DD dates") from exc
        if date_from and date_to and date_from > date_to:
            raise HTTPException(status_code=422, detail="date_from must not be after date_to")
        items, total = repository.search_scans(
            farm_id=user["farm_id"], batch_query=batch_query, batch_id=batch_id,
            sample_type=sample_type, risk_level=risk_level,
            date_from=date_from, date_to=date_to, limit=limit, offset=offset,
        )
        return ScanSearchResponse(items=items, total=total, limit=limit, offset=offset)

    @app.get("/api/v1/scans", response_model=list[ScanResponse])
    def list_scans(
        farm_id: str | None = None, batch_id: str | None = None,
        sample_type: SampleType | None = None, limit: int = Query(default=20, ge=1, le=100),
        user: dict = Depends(current_user),
    ):
        check_farm_filter(farm_id, user)
        return repository.list_scans(farm_id=user["farm_id"], batch_id=batch_id, sample_type=sample_type, limit=limit)

    @app.get("/api/v1/scans/{scan_id}", response_model=ScanResponse)
    def get_scan(scan_id: str, user: dict = Depends(current_user)):
        scan = repository.get_scan(scan_id, farm_id=user["farm_id"])
        if scan is None:
            raise HTTPException(status_code=404, detail="Scan not found")
        return scan

    def require_scan(scan_id: str, user: dict) -> ScanResponse:
        scan = repository.get_scan(scan_id, farm_id=user["farm_id"])
        if scan is None:
            raise HTTPException(status_code=404, detail="Scan not found")
        return scan

    def safe_filename(filename: str | None, suffix: str) -> str:
        name = (filename or "photo").replace("\\", "/").rsplit("/", 1)[-1]
        stem = name.rsplit(".", 1)[0] if "." in name else name
        stem = re.sub(r"[^A-Za-z0-9_. -]", "_", stem).strip(" .")[:100]
        return f"{stem or 'photo'}{suffix}"

    @app.post("/api/v1/scans/{scan_id}/photos", response_model=PhotoResponse, status_code=201)
    async def upload_photo(scan_id: str, request: Request, user: dict = Depends(writer)):
        require_scan(scan_id, user)
        content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
        if content_type not in PHOTO_TYPES:
            raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are accepted")
        content_length = request.headers.get("content-length")
        if content_length and (not content_length.isdigit() or int(content_length) > MAX_PHOTO_BYTES):
            raise HTTPException(status_code=413, detail="Photo is larger than 5 MiB")
        payload = bytearray()
        async for chunk in request.stream():
            if len(payload) + len(chunk) > MAX_PHOTO_BYTES:
                raise HTTPException(status_code=413, detail="Photo is larger than 5 MiB")
            payload.extend(chunk)
        photo_bytes = await run_in_threadpool(normalize_photo, payload, content_type)
        if len(photo_bytes) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Normalized photo is larger than 5 MiB")
        try:
            photo = repository.add_photo(
                scan_id, user["farm_id"], safe_filename(request.headers.get("x-filename"), PHOTO_TYPES[content_type][1]),
                content_type, photo_bytes,
            )
        except ConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except MissingScanError as exc:
            raise HTTPException(status_code=404, detail="Scan not found") from exc
        return photo

    @app.get("/api/v1/scans/{scan_id}/photos", response_model=list[PhotoResponse])
    def list_photos(scan_id: str, user: dict = Depends(current_user)):
        require_scan(scan_id, user)
        return repository.list_photos(scan_id, user["farm_id"])

    @app.get("/api/v1/scans/{scan_id}/photos/{photo_id}")
    def get_photo(scan_id: str, photo_id: str, user: dict = Depends(current_user)):
        require_scan(scan_id, user)
        photo = repository.get_photo(scan_id, photo_id, user["farm_id"])
        if photo is None:
            raise HTTPException(status_code=404, detail="Photo not found")
        return Response(content=photo["data"], media_type=photo["content_type"], headers={"Content-Disposition": f'inline; filename="{photo["filename"]}"'})

    @app.delete("/api/v1/scans/{scan_id}/photos/{photo_id}", status_code=204)
    def delete_photo(scan_id: str, photo_id: str, user: dict = Depends(writer)):
        require_scan(scan_id, user)
        if not repository.delete_photo(scan_id, photo_id, user["farm_id"]):
            raise HTTPException(status_code=404, detail="Photo not found")
        return Response(status_code=204)

    install_fieldwork_routes(app, lambda: repository, current_user, writer, normalize_photo)
    static_dir = os.getenv("NUTRI_SCAN_STATIC_DIR", "").strip()
    if static_dir and os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    return app


app = create_app()

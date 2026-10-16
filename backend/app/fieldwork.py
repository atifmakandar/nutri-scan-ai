"""Private fieldwork API installed into the existing authenticated application.

Integration (at the end of create_app, before return)::

    install_fieldwork_routes(app, lambda: repository, current_user, writer, normalize_photo)

The supplier is resolved only by a request, after lifespan initializes storage.
"""

from __future__ import annotations

import math
import re
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from .fieldwork_models import (
    AlertStatus, AuditEventResponse, BatchRequest, BatchResponse, DeviceHealthRequest,
    DeviceHealthResponse, DeviceRequest, DeviceResponse, LabConfirmationRequest,
    LabConfirmationResponse, ObservationRequest, ObservationResponse, Page,
    ReminderRequest, ReminderResponse, ReminderStatusRequest, ReviewAlertResponse,
    ReviewAlertStatusRequest, TestingRequest, TestingResponse, TestingStatusRequest,
)
from .fieldwork_storage import FieldworkError, FieldworkRepository
from .models import PhotoResponse, SampleType


__all__ = ["install_fieldwork_routes"]

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_REPORT_BYTES = 10 * 1024 * 1024
PHOTO_SUFFIXES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def safe_validation_detail(value):
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: safe_validation_detail(item) for key, item in value.items()}
    if isinstance(value, list):
        return [safe_validation_detail(item) for item in value]
    return value


class FieldworkRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def validated(request: Request):
            try:
                return await handler(request)
            except RequestValidationError as exc:
                # JSON parsers may accept NaN/Infinity. Reject them as 422 rather
                # than failing while serializing the validation error's input.
                return JSONResponse({"detail": safe_validation_detail(jsonable_encoder(exc.errors()))}, status_code=422)

        return validated


def safe_filename(filename: str | None, suffix: str, default: str) -> str:
    name = (filename or default).replace("\\", "/").rsplit("/", 1)[-1]
    stem = name.rsplit(".", 1)[0] if "." in name else name
    stem = re.sub(r"[^A-Za-z0-9_. -]", "_", stem).strip(" .")[:100].rstrip(" .")
    return f"{stem or default}{suffix}"


async def bounded_body(request: Request, maximum: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if not content_length.isascii() or not content_length.isdigit() or int(content_length) > maximum:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(413, "Attachment exceeds its size limit") from exc
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > maximum:
            raise HTTPException(413, "Attachment exceeds its size limit")
        payload.extend(chunk)
    return bytes(payload)


def validate_pdf(payload: bytes) -> None:
    # This is only a basic file-shape check, not malware scanning, parsing, or OCR.
    # PDFs (and report images) are served as downloads rather than inline content.
    if not re.match(rb"%PDF-[0-9]\.[0-9](?:\s)", payload) or not payload.rstrip(b" \t\r\n\f").endswith(b"%%EOF"):
        raise HTTPException(400, "Invalid PDF signature or end-of-file marker")


def install_fieldwork_routes(app, repository_supplier, current_user, writer, normalize_photo):
    """Install routes using the parent's repository and auth dependencies, without I/O."""
    lock = Lock()
    storage = None

    def repository() -> FieldworkRepository:
        nonlocal storage
        with lock:
            supplied = repository_supplier()
            if supplied is None:
                raise HTTPException(503, "Storage has not started")
            if storage is None or storage.repository is not supplied:
                storage = FieldworkRepository(supplied)
            return storage

    async def storage_error(request: Request, exc: FieldworkError):
        return JSONResponse({"detail": str(exc)}, status_code=exc.status_code)

    app.add_exception_handler(FieldworkError, storage_error)
    router = APIRouter(prefix="/api/v1", route_class=FieldworkRoute)

    @router.get("/batches", response_model=Page[BatchResponse])
    def batches(
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list("batches", user["farm_id"], limit, offset)

    @router.post("/batches", response_model=BatchResponse, status_code=201)
    def create_batch(req: BatchRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.create("batches", user["farm_id"], req)

    @router.get("/batches/{resource_id}", response_model=BatchResponse)
    def batch(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
        return store.get("batches", resource_id, user["farm_id"])

    @router.post("/batches/{resource_id}", response_model=BatchResponse)
    def update_batch(resource_id: str, req: BatchRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.update_batch(resource_id, user["farm_id"], req)

    @router.get("/observations", response_model=Page[ObservationResponse])
    def observations(
        batch_id: str | None = Query(default=None, min_length=2, max_length=80), sample_type: SampleType | None = None,
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list("observations", user["farm_id"], limit, offset, batch_id=batch_id, sample_type=sample_type)

    @router.post("/observations", response_model=ObservationResponse, status_code=201)
    def create_observation(req: ObservationRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.create("observations", user["farm_id"], req)

    @router.get("/observations/{resource_id}", response_model=ObservationResponse)
    def observation(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
        return store.get("observations", resource_id, user["farm_id"])

    @router.get("/reminders", response_model=Page[ReminderResponse])
    def reminders(
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list("reminders", user["farm_id"], limit, offset)

    @router.post("/reminders", response_model=ReminderResponse, status_code=201)
    def create_reminder(req: ReminderRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.create("reminders", user["farm_id"], req)

    @router.post("/reminders/{resource_id}/status", response_model=ReminderResponse)
    def reminder_status(resource_id: str, req: ReminderStatusRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.reminder_status(resource_id, user["farm_id"], req.status)

    @router.get("/testing-requests", response_model=Page[TestingResponse])
    def testing_requests(
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list("testing-requests", user["farm_id"], limit, offset)

    @router.post("/testing-requests", response_model=TestingResponse, status_code=201)
    def create_testing_request(req: TestingRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.create("testing-requests", user["farm_id"], req, actor_id=user["id"])

    @router.get("/testing-requests/{resource_id}", response_model=TestingResponse)
    def testing_request(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
        return store.get("testing-requests", resource_id, user["farm_id"])

    @router.post("/testing-requests/{resource_id}/status", response_model=TestingResponse)
    def testing_status(resource_id: str, req: TestingStatusRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.testing_status(resource_id, user["farm_id"], req, actor_id=user["id"])

    @router.get("/lab-confirmations", response_model=Page[LabConfirmationResponse])
    def lab_confirmations(
        testing_request_id: str | None = Query(default=None, min_length=2, max_length=80),
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list_lab_confirmations(user["farm_id"], limit, offset, testing_request_id=testing_request_id)

    @router.post("/lab-confirmations", response_model=LabConfirmationResponse, status_code=201)
    def create_lab_confirmation(req: LabConfirmationRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.create_lab_confirmation(user["farm_id"], req, actor_id=user["id"])

    @router.get("/lab-confirmations/{resource_id}", response_model=LabConfirmationResponse)
    def lab_confirmation(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
        return store.get_lab_confirmation(resource_id, user["farm_id"])

    @router.get("/devices", response_model=Page[DeviceResponse])
    def devices(
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list_devices(user["farm_id"], limit, offset)

    @router.post("/devices", response_model=DeviceResponse, status_code=201)
    def create_device(req: DeviceRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.create_device(user["farm_id"], req, actor_id=user["id"])

    @router.get("/devices/{resource_id}", response_model=DeviceResponse)
    def device(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
        return store.get_device(resource_id, user["farm_id"])

    @router.post("/devices/{resource_id}", response_model=DeviceResponse)
    def update_device(resource_id: str, req: DeviceRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.update_device(resource_id, user["farm_id"], req, actor_id=user["id"])

    @router.get("/devices/{resource_id}/health", response_model=Page[DeviceHealthResponse])
    def device_health(
        resource_id: str, limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list_device_health(resource_id, user["farm_id"], limit, offset)

    @router.post("/devices/{resource_id}/health", response_model=DeviceHealthResponse, status_code=201)
    def create_device_health(
        resource_id: str, req: DeviceHealthRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository),
    ):
        return store.add_device_health(resource_id, user["farm_id"], req, actor_id=user["id"])

    @router.get("/review-alerts", response_model=Page[ReviewAlertResponse])
    def review_alerts(
        status: AlertStatus | None = None, scan_id: str | None = Query(default=None, min_length=2, max_length=80),
        batch_id: str | None = Query(default=None, min_length=2, max_length=80),
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list_review_alerts(user["farm_id"], limit, offset, status=status, scan_id=scan_id, batch_id=batch_id)

    @router.get("/review-alerts/{resource_id}", response_model=ReviewAlertResponse)
    def review_alert(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
        return store.get_review_alert(resource_id, user["farm_id"])

    @router.post("/review-alerts/{resource_id}/status", response_model=ReviewAlertResponse)
    def review_alert_status(resource_id: str, req: ReviewAlertStatusRequest, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.review_alert_status(resource_id, user["farm_id"], req.status, actor_id=user["id"])

    @router.post("/review-alerts/{resource_id}/acknowledge", response_model=ReviewAlertResponse)
    def acknowledge_review_alert(resource_id: str, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
        return store.review_alert_status(resource_id, user["farm_id"], "acknowledged", actor_id=user["id"])

    @router.get("/audit-events", response_model=Page[AuditEventResponse])
    def audit_events(
        limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0),
        user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository),
    ):
        return store.list_audit_events(user["farm_id"], limit, offset)

    app.include_router(router)

    def install_attachments(collection: str, segment: str):
        attachments = APIRouter(prefix=f"/api/v1/{collection}/{{resource_id}}/{segment}", route_class=FieldworkRoute)
        reports = segment == "reports"

        @attachments.get("", response_model=list[PhotoResponse])
        def list_attachments(resource_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
            # Attachment metadata intentionally remains an array (contract section 65+).
            return store.list_attachments(collection, resource_id, user["farm_id"])

        @attachments.post("", response_model=PhotoResponse, status_code=201)
        async def upload_attachment(resource_id: str, request: Request, user: dict = Depends(writer), store: FieldworkRepository = Depends(repository)):
            await run_in_threadpool(store.require, collection, resource_id, user["farm_id"])
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            pdf = reports and content_type == "application/pdf"
            if not pdf and content_type not in PHOTO_SUFFIXES:
                raise HTTPException(415, "Only JPEG, PNG, WebP" + (", and PDF are accepted" if reports else " images are accepted"))
            maximum = MAX_REPORT_BYTES if pdf else MAX_PHOTO_BYTES
            payload = await bounded_body(request, maximum)
            if pdf:
                validate_pdf(payload)
                suffix = ".pdf"
            else:
                payload = await run_in_threadpool(normalize_photo, payload, content_type)
                suffix = PHOTO_SUFFIXES[content_type]
                if len(payload) > maximum:
                    raise HTTPException(413, "Normalized image exceeds 5 MiB")
            filename = safe_filename(request.headers.get("x-filename"), suffix, "report" if reports else "photo")
            return await run_in_threadpool(
                store.add_attachment, collection, resource_id, user["farm_id"], filename, content_type, payload,
                actor_id=user["id"],
            )

        @attachments.get("/{attachment_id}")
        def download_attachment(resource_id: str, attachment_id: str, user: dict = Depends(current_user), store: FieldworkRepository = Depends(repository)):
            attachment = store.get_attachment(collection, resource_id, attachment_id, user["farm_id"])
            disposition = "attachment" if reports else "inline"
            return Response(
                content=attachment["data"], media_type=attachment["content_type"],
                headers={
                    "Content-Disposition": f'{disposition}; filename="{attachment["filename"]}"',
                    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                },
            )

        app.include_router(attachments)

    install_attachments("batches", "photos")
    install_attachments("observations", "photos")
    install_attachments("testing-requests", "reports")

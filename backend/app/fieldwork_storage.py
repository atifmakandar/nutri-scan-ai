"""Additive fieldwork persistence using the application's existing connection factory.

No repository or database is opened at import. Every read and write is scoped to
the authenticated farm; multi-step writes take SQLite's writer lock first.
"""

from __future__ import annotations

import sqlite3
import json
from datetime import datetime, timezone
from uuid import uuid4

from .fieldwork_models import (
    BatchRequest, DeviceHealthRequest, DeviceRequest, LabConfirmationRequest,
    ObservationRequest, ReminderRequest, TestingRequest,
)


class FieldworkError(ValueError):
    status_code = 422


class FieldworkNotFound(FieldworkError):
    status_code = 404


class FieldworkConflict(FieldworkError):
    status_code = 409


# Names/columns below are internal constants, never interpolated user input.
RESOURCES = {
    "batches": ("fieldwork_batches", BatchRequest, "batch_id"),
    "observations": ("fieldwork_observations", ObservationRequest, "observation_id"),
    "reminders": ("fieldwork_reminders", ReminderRequest, None),
    "testing-requests": ("fieldwork_testing_requests", TestingRequest, "request_id"),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS fieldwork_batches (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    batch_id TEXT NOT NULL CHECK(length(batch_id) BETWEEN 2 AND 80),
    sample_type TEXT NOT NULL CHECK(sample_type IN ('feed', 'silage')),
    name TEXT NOT NULL,
    storage_location TEXT NOT NULL,
    prepared_on TEXT,
    opened_on TEXT,
    quantity REAL CHECK(quantity IS NULL OR quantity >= 0),
    quantity_unit TEXT CHECK(quantity_unit IS NULL OR quantity_unit IN ('kg', 'tonne', 'bales', 'bags')),
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(farm_id, batch_id, sample_type),
    CHECK(prepared_on IS NULL OR opened_on IS NULL OR opened_on >= prepared_on)
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_batches_farm ON fieldwork_batches(farm_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS fieldwork_observations (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    batch_id TEXT NOT NULL,
    sample_type TEXT NOT NULL CHECK(sample_type IN ('feed', 'silage')),
    observed_on TEXT,
    mould TEXT NOT NULL CHECK(mould IN ('yes', 'no', 'unknown')),
    unusual_heat TEXT NOT NULL CHECK(unusual_heat IN ('yes', 'no', 'unknown')),
    unusual_smell TEXT NOT NULL CHECK(unusual_smell IN ('yes', 'no', 'unknown')),
    cover_damage TEXT NOT NULL CHECK(cover_damage IN ('yes', 'no', 'unknown')),
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_observations_farm ON fieldwork_observations(farm_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_fieldwork_observations_batch ON fieldwork_observations(farm_id, batch_id, sample_type, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS fieldwork_reminders (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    title TEXT NOT NULL,
    batch_id TEXT,
    sample_type TEXT CHECK(sample_type IS NULL OR sample_type IN ('feed', 'silage')),
    due_on TEXT,
    notes TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'completed')),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK((batch_id IS NULL) = (sample_type IS NULL)),
    CHECK((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_reminders_farm ON fieldwork_reminders(farm_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS fieldwork_testing_requests (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    batch_id TEXT NOT NULL,
    sample_type TEXT NOT NULL CHECK(sample_type IN ('feed', 'silage')),
    requested_on TEXT,
    contact_name TEXT NOT NULL,
    contact_details TEXT NOT NULL,
    notes TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('requested', 'collected', 'report_received')),
    collected_on TEXT,
    report_received_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(status = 'requested' OR collected_on IS NOT NULL),
    CHECK(status != 'report_received' OR report_received_on IS NOT NULL),
    CHECK(status != 'requested' OR collected_on IS NULL),
    CHECK(status = 'report_received' OR report_received_on IS NULL),
    CHECK(requested_on IS NULL OR collected_on IS NULL OR collected_on >= requested_on),
    CHECK(collected_on IS NULL OR report_received_on IS NULL OR report_received_on >= collected_on)
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_requests_farm ON fieldwork_testing_requests(farm_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS fieldwork_attachments (
    id TEXT PRIMARY KEY,
    batch_id TEXT REFERENCES fieldwork_batches(id) ON DELETE CASCADE,
    observation_id TEXT REFERENCES fieldwork_observations(id) ON DELETE CASCADE,
    request_id TEXT REFERENCES fieldwork_testing_requests(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    CHECK((batch_id IS NOT NULL) + (observation_id IS NOT NULL) + (request_id IS NOT NULL) = 1),
    CHECK(content_type != 'application/pdf' OR request_id IS NOT NULL),
    CHECK(length(data) > 0 AND length(data) <= CASE WHEN content_type = 'application/pdf' THEN 10485760 ELSE 5242880 END)
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_attachments_batch ON fieldwork_attachments(batch_id);
CREATE INDEX IF NOT EXISTS idx_fieldwork_attachments_observation ON fieldwork_attachments(observation_id);
CREATE INDEX IF NOT EXISTS idx_fieldwork_attachments_request ON fieldwork_attachments(request_id);

CREATE TABLE IF NOT EXISTS fieldwork_devices (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    device_id TEXT NOT NULL CHECK(length(device_id) BETWEEN 1 AND 120),
    label TEXT NOT NULL,
    device_type TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(farm_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_devices_farm ON fieldwork_devices(farm_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS fieldwork_device_health (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    device_registry_id TEXT NOT NULL REFERENCES fieldwork_devices(id),
    status TEXT NOT NULL CHECK(status IN ('unknown', 'operational', 'needs_attention', 'offline')),
    source TEXT NOT NULL CHECK(source IN ('operator_reported', 'reviewed_capture')),
    scan_id TEXT REFERENCES scans(id),
    notes TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK((source = 'reviewed_capture') = (scan_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fieldwork_device_health_scan ON fieldwork_device_health(device_registry_id, scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fieldwork_device_health_device ON fieldwork_device_health(farm_id, device_registry_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS fieldwork_lab_confirmations (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    testing_request_id TEXT NOT NULL REFERENCES fieldwork_testing_requests(id),
    report_attachment_id TEXT NOT NULL REFERENCES fieldwork_attachments(id),
    scan_id TEXT REFERENCES scans(id),
    batch_id TEXT NOT NULL,
    sample_type TEXT NOT NULL CHECK(sample_type IN ('feed', 'silage')),
    analyte TEXT NOT NULL,
    reported_value TEXT NOT NULL,
    unit TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_lab_confirmations_farm ON fieldwork_lab_confirmations(farm_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_fieldwork_lab_confirmations_request ON fieldwork_lab_confirmations(farm_id, testing_request_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS fieldwork_review_alerts (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    scan_id TEXT NOT NULL REFERENCES scans(id),
    batch_id TEXT NOT NULL,
    sample_type TEXT NOT NULL CHECK(sample_type IN ('feed', 'silage')),
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    observed_value REAL NOT NULL,
    threshold TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open', 'acknowledged')),
    acknowledged_at TEXT,
    acknowledged_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    CHECK((status = 'acknowledged') = (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)),
    UNIQUE(scan_id, code)
);
CREATE INDEX IF NOT EXISTS idx_fieldwork_review_alerts_farm ON fieldwork_review_alerts(farm_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_fieldwork_review_alerts_scan ON fieldwork_review_alerts(farm_id, scan_id, code);

CREATE TABLE IF NOT EXISTS app_audit_events (
    id TEXT PRIMARY KEY,
    farm_id TEXT NOT NULL REFERENCES farms(id),
    actor_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_audit_events_farm ON app_audit_events(farm_id, created_at DESC, id DESC);
CREATE TRIGGER IF NOT EXISTS prevent_app_audit_events_update
BEFORE UPDATE ON app_audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS prevent_app_audit_events_delete
BEFORE DELETE ON app_audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;
"""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_audit_event(connection, *, farm_id: str, actor_id: str | None, action: str,
                       resource_type: str, resource_id: str | None, details: dict) -> str:
    """Write a small metadata-only event; callers never pass request bodies."""
    import json

    event_id = str(uuid4())
    connection.execute(
        """INSERT INTO app_audit_events
           (id, farm_id, actor_id, action, resource_type, resource_id, details_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (event_id, farm_id, actor_id, action, resource_type, resource_id,
         json.dumps(details, sort_keys=True, separators=(",", ":")), now_utc()),
    )
    return event_id


class FieldworkRepository:
    def __init__(self, repository):
        self.repository = repository
        # Called lazily by the route dependency, after the ASGI lifespan has run.
        # DDL and indexes are atomic and never alter legacy tables or their rows.
        with repository._connect() as connection:
            connection.executescript("BEGIN IMMEDIATE;\n" + SCHEMA)

    @staticmethod
    def _require(connection, collection: str, resource_id: str, farm_id: str):
        table = RESOURCES[collection][0]
        row = connection.execute(
            f"SELECT * FROM {table} WHERE id = ? AND farm_id = ?", (resource_id, farm_id),
        ).fetchone()
        if row is None:
            raise FieldworkNotFound("Resource not found")
        return row

    def require(self, collection: str, resource_id: str, farm_id: str) -> None:
        with self.repository._connect() as connection:
            self._require(connection, collection, resource_id, farm_id)

    def create(self, collection: str, farm_id: str, request, *, actor_id: str | None = None) -> dict:
        table = RESOURCES[collection][0]
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            values = {"id": str(uuid4()), "farm_id": farm_id, **request.model_dump(mode="json"), "created_at": now_utc()}
            if collection != "observations":
                values["updated_at"] = values["created_at"]
            if collection == "reminders":
                values.update(status="pending", completed_at=None)
            if collection == "testing-requests":
                values.update(status="requested", collected_on=None, report_received_on=None)
            try:
                connection.execute(
                    f"INSERT INTO {table} ({', '.join(values)}) VALUES ({', '.join('?' for _ in values)})",
                    list(values.values()),
                )
            except sqlite3.IntegrityError as exc:
                if collection == "batches" and exc.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
                    raise FieldworkConflict("A batch with this batch_id and sample_type already exists") from exc
                raise
            if collection == "testing-requests":
                record_audit_event(
                    connection, farm_id=farm_id, actor_id=actor_id,
                    action="testing_request.created", resource_type="testing_request", resource_id=values["id"],
                    details={"batch_id": values["batch_id"], "sample_type": values["sample_type"]},
                )
            return self._present(connection, collection, self._require(connection, collection, values["id"], farm_id))

    def update_batch(self, resource_id: str, farm_id: str, request: BatchRequest) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._require(connection, "batches", resource_id, farm_id)
            if (row["batch_id"], row["sample_type"]) != (request.batch_id, request.sample_type):
                raise FieldworkConflict("batch_id and sample_type are immutable")
            values = {**request.model_dump(mode="json"), "updated_at": now_utc()}
            connection.execute(
                f"UPDATE fieldwork_batches SET {', '.join(key + ' = ?' for key in values)} WHERE id = ? AND farm_id = ?",
                [*values.values(), resource_id, farm_id],
            )
            return self._present(connection, "batches", self._require(connection, "batches", resource_id, farm_id))

    def get(self, collection: str, resource_id: str, farm_id: str) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            return self._present(connection, collection, self._require(connection, collection, resource_id, farm_id))

    def list(self, collection: str, farm_id: str, limit: int, offset: int, *, batch_id=None, sample_type=None) -> dict:
        table = RESOURCES[collection][0]
        clauses, values = ["farm_id = ?"], [farm_id]
        for key, value in (("batch_id", batch_id), ("sample_type", sample_type)):
            if value is not None:
                clauses.append(f"{key} = ?")
                values.append(value)
        where = " AND ".join(clauses)
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            total = connection.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", values).fetchone()[0]
            rows = connection.execute(
                f"SELECT * FROM {table} WHERE {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                [*values, limit, offset],
            ).fetchall()
            return {"items": [self._present(connection, collection, row) for row in rows], "total": total, "limit": limit, "offset": offset}

    @staticmethod
    def _attachment_count(connection, collection: str, resource_id: str) -> int:
        column = RESOURCES[collection][2]
        return connection.execute(f"SELECT COUNT(*) FROM fieldwork_attachments WHERE {column} = ?", (resource_id,)).fetchone()[0]

    def _present(self, connection, collection: str, row) -> dict:
        result = dict(row)
        if collection in {"batches", "observations"}:
            result["photo_count"] = self._attachment_count(connection, collection, row["id"])
        if collection == "observations":
            result["kind"] = "observation_only"
        elif collection == "testing-requests":
            result["report_count"] = self._attachment_count(connection, collection, row["id"])
        elif collection == "batches":
            keys = (row["farm_id"], row["batch_id"], row["sample_type"])
            scan = connection.execute(
                "SELECT * FROM scans WHERE farm_id = ? AND batch_id = ? AND sample_type = ? ORDER BY created_at DESC, id DESC LIMIT 1", keys,
            ).fetchone()
            # Use the existing saved card, never run the scoring engine here.
            result["latest_scan"] = self.repository._row_to_response(scan) if scan else None
            observation = connection.execute(
                "SELECT * FROM fieldwork_observations WHERE farm_id = ? AND batch_id = ? AND sample_type = ? ORDER BY created_at DESC, id DESC LIMIT 1", keys,
            ).fetchone()
            result["latest_observation"] = self._present(connection, "observations", observation) if observation else None
        return result

    def reminder_status(self, resource_id: str, farm_id: str, status: str) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._require(connection, "reminders", resource_id, farm_id)
            if row["status"] != status:
                now = now_utc()
                connection.execute(
                    "UPDATE fieldwork_reminders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND farm_id = ?",
                    (status, now if status == "completed" else None, now, resource_id, farm_id),
                )
            return self._present(connection, "reminders", self._require(connection, "reminders", resource_id, farm_id))

    def testing_status(self, resource_id: str, farm_id: str, request, *, actor_id: str | None = None) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._require(connection, "testing-requests", resource_id, farm_id)
            order = {"requested": 0, "collected": 1, "report_received": 2}
            if order[request.status] < order[row["status"]]:
                raise FieldworkError("Testing requests may only move forward")
            # Omission preserves a previously recorded date; explicit null cannot
            # erase a date required by the selected state.
            collected = request.collected_on if "collected_on" in request.model_fields_set else row["collected_on"]
            reported = request.report_received_on if "report_received_on" in request.model_fields_set else row["report_received_on"]
            if request.status == "requested" and (collected or reported):
                raise FieldworkError("Collection/report dates require the corresponding status")
            if request.status != "requested" and not collected:
                raise FieldworkError("collected_on is required")
            if request.status != "report_received" and reported:
                raise FieldworkError("report_received_on requires report_received status")
            if request.status == "report_received":
                if not reported:
                    raise FieldworkError("report_received_on is required")
                if self._attachment_count(connection, "testing-requests", resource_id) == 0:
                    raise FieldworkError("A report attachment is required before report_received")
            if row["requested_on"] and collected and collected < row["requested_on"]:
                raise FieldworkError("collected_on must not precede requested_on")
            if collected and reported and reported < collected:
                raise FieldworkError("report_received_on must not precede collected_on")
            connection.execute(
                "UPDATE fieldwork_testing_requests SET status = ?, collected_on = ?, report_received_on = ?, updated_at = ? WHERE id = ? AND farm_id = ?",
                (request.status, collected, reported, now_utc(), resource_id, farm_id),
            )
            if row["status"] != request.status or row["collected_on"] != collected or row["report_received_on"] != reported:
                record_audit_event(
                    connection, farm_id=farm_id, actor_id=actor_id,
                    action="testing_request.status_changed", resource_type="testing_request", resource_id=resource_id,
                    details={"status": request.status, "has_collected_on": collected is not None,
                             "has_report_received_on": reported is not None},
                )
            return self._present(connection, "testing-requests", self._require(connection, "testing-requests", resource_id, farm_id))

    @staticmethod
    def _attachment_metadata(collection: str, resource_id: str, row) -> dict:
        segment = "reports" if collection == "testing-requests" else "photos"
        return {
            "id": row["id"], "filename": row["filename"], "content_type": row["content_type"],
            "url": f"/api/v1/{collection}/{resource_id}/{segment}/{row['id']}", "created_at": row["created_at"],
        }

    def add_attachment(self, collection: str, resource_id: str, farm_id: str, filename: str, content_type: str, data: bytes, *, actor_id: str | None = None) -> dict:
        column = RESOURCES[collection][2]
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._require(connection, collection, resource_id, farm_id)
            if self._attachment_count(connection, collection, resource_id) >= 5:
                raise FieldworkConflict("A resource may have at most five attachments")
            attachment = {"id": str(uuid4()), "filename": filename, "content_type": content_type, "created_at": now_utc()}
            connection.execute(
                f"INSERT INTO fieldwork_attachments (id, {column}, filename, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (attachment["id"], resource_id, filename, content_type, data, attachment["created_at"]),
            )
            if collection == "testing-requests":
                record_audit_event(
                    connection, farm_id=farm_id, actor_id=actor_id,
                    action="testing_report.uploaded", resource_type="testing_report", resource_id=attachment["id"],
                    details={"testing_request_id": resource_id, "content_type": content_type},
                )
            return self._attachment_metadata(collection, resource_id, attachment)

    def list_attachments(self, collection: str, resource_id: str, farm_id: str) -> list[dict]:
        column = RESOURCES[collection][2]
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            self._require(connection, collection, resource_id, farm_id)
            rows = connection.execute(
                f"SELECT id, filename, content_type, created_at FROM fieldwork_attachments WHERE {column} = ? ORDER BY created_at, id", (resource_id,),
            ).fetchall()
            return [self._attachment_metadata(collection, resource_id, row) for row in rows]

    def get_attachment(self, collection: str, resource_id: str, attachment_id: str, farm_id: str):
        table, _, column = RESOURCES[collection]
        with self.repository._connect() as connection:
            row = connection.execute(
                f"SELECT a.* FROM fieldwork_attachments a JOIN {table} p ON p.id = a.{column} WHERE a.id = ? AND p.id = ? AND p.farm_id = ?",
                (attachment_id, resource_id, farm_id),
            ).fetchone()
            if row is None:
                raise FieldworkNotFound("Attachment not found")
            return row

    @staticmethod
    def _device_require(connection, resource_id: str, farm_id: str):
        row = connection.execute(
            """SELECT * FROM fieldwork_devices
               WHERE farm_id = ? AND (id = ? OR device_id = ?)""",
            (farm_id, resource_id, resource_id),
        ).fetchone()
        if row is None:
            raise FieldworkNotFound("Device not found")
        return row

    @staticmethod
    def _health_present(row) -> dict:
        return {
            "id": row["id"], "farm_id": row["farm_id"],
            "device_registry_id": row["device_registry_id"], "status": row["status"],
            "source": row["source"], "scan_id": row["scan_id"], "notes": row["notes"],
            "reviewed_at": row["reviewed_at"], "created_at": row["created_at"],
        }

    def _device_present(self, connection, row) -> dict:
        health = connection.execute(
            """SELECT * FROM fieldwork_device_health
               WHERE farm_id = ? AND device_registry_id = ?
               ORDER BY created_at DESC, id DESC LIMIT 1""",
            (row["farm_id"], row["id"]),
        ).fetchone()
        result = dict(row)
        result["latest_health"] = self._health_present(health) if health else None
        return result

    def create_device(self, farm_id: str, request: DeviceRequest, *, actor_id: str | None = None) -> dict:
        values = request.model_dump(mode="json")
        device_id = str(uuid4())
        created_at = now_utc()
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute(
                    """INSERT INTO fieldwork_devices
                       (id, farm_id, device_id, label, device_type, notes, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (device_id, farm_id, values["device_id"], values["label"], values["device_type"],
                     values["notes"], created_at, created_at),
                )
            except sqlite3.IntegrityError as exc:
                if exc.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
                    raise FieldworkConflict("A device with this device_id already exists") from exc
                raise
            record_audit_event(
                connection, farm_id=farm_id, actor_id=actor_id,
                action="device.registered", resource_type="device", resource_id=device_id,
                details={"source": "operator"},
            )
            return self._device_present(connection, self._device_require(connection, device_id, farm_id))

    def update_device(self, resource_id: str, farm_id: str, request: DeviceRequest, *, actor_id: str | None = None) -> dict:
        values = request.model_dump(mode="json")
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._device_require(connection, resource_id, farm_id)
            if row["device_id"] != values["device_id"]:
                raise FieldworkConflict("device_id is immutable")
            updated_at = now_utc()
            connection.execute(
                """UPDATE fieldwork_devices
                   SET label = ?, device_type = ?, notes = ?, updated_at = ?
                   WHERE id = ? AND farm_id = ?""",
                (values["label"], values["device_type"], values["notes"], updated_at, row["id"], farm_id),
            )
            record_audit_event(
                connection, farm_id=farm_id, actor_id=actor_id,
                action="device.updated", resource_type="device", resource_id=row["id"],
                details={"source": "operator"},
            )
            return self._device_present(connection, self._device_require(connection, row["id"], farm_id))

    def list_devices(self, farm_id: str, limit: int, offset: int) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            total = connection.execute(
                "SELECT COUNT(*) FROM fieldwork_devices WHERE farm_id = ?", (farm_id,),
            ).fetchone()[0]
            rows = connection.execute(
                """SELECT * FROM fieldwork_devices WHERE farm_id = ?
                   ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                (farm_id, limit, offset),
            ).fetchall()
            return {"items": [self._device_present(connection, row) for row in rows],
                    "total": total, "limit": limit, "offset": offset}

    def get_device(self, resource_id: str, farm_id: str) -> dict:
        with self.repository._connect() as connection:
            return self._device_present(connection, self._device_require(connection, resource_id, farm_id))

    def add_device_health(self, resource_id: str, farm_id: str, request: DeviceHealthRequest, *, actor_id: str | None = None) -> dict:
        values = request.model_dump(mode="json")
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            device = self._device_require(connection, resource_id, farm_id)
            scan_id = values["scan_id"]
            source = "operator_reported"
            reviewed_at = now_utc()
            if scan_id is not None:
                scan = connection.execute(
                    "SELECT id, device_id, instrument_capture_json FROM scans WHERE id = ? AND farm_id = ?",
                    (scan_id, farm_id),
                ).fetchone()
                if scan is None:
                    raise FieldworkNotFound("Scan not found")
                capture = json.loads(scan["instrument_capture_json"]) if scan["instrument_capture_json"] else None
                if not capture or scan["device_id"] != device["device_id"] or capture.get("device_id") != device["device_id"]:
                    raise FieldworkError("scan_id must reference a reviewed instrument capture for this device")
                source = "reviewed_capture"
                reviewed_at = capture["captured_at"]
                existing = connection.execute(
                    """SELECT * FROM fieldwork_device_health
                       WHERE farm_id = ? AND device_registry_id = ? AND scan_id = ?""",
                    (farm_id, device["id"], scan_id),
                ).fetchone()
                if existing is not None:
                    # Scan persistence already records the last reviewed capture;
                    # repeating this explicit health submission is idempotent.
                    return self._health_present(existing)
            health_id = str(uuid4())
            created_at = now_utc()
            try:
                connection.execute(
                    """INSERT INTO fieldwork_device_health
                       (id, farm_id, device_registry_id, status, source, scan_id, notes, reviewed_at, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (health_id, farm_id, device["id"], values["status"], source, scan_id,
                     values["notes"], reviewed_at, created_at),
                )
            except sqlite3.IntegrityError as exc:
                if exc.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
                    raise FieldworkConflict("A reviewed capture already has a health record for this device") from exc
                raise
            record_audit_event(
                connection, farm_id=farm_id, actor_id=actor_id,
                action="device.health_recorded", resource_type="device_health", resource_id=health_id,
                details={"device_id": device["id"], "source": source, "status": values["status"]},
            )
            row = connection.execute("SELECT * FROM fieldwork_device_health WHERE id = ?", (health_id,)).fetchone()
            return self._health_present(row)

    def list_device_health(self, resource_id: str, farm_id: str, limit: int, offset: int) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            device = self._device_require(connection, resource_id, farm_id)
            total = connection.execute(
                "SELECT COUNT(*) FROM fieldwork_device_health WHERE farm_id = ? AND device_registry_id = ?",
                (farm_id, device["id"]),
            ).fetchone()[0]
            rows = connection.execute(
                """SELECT * FROM fieldwork_device_health
                   WHERE farm_id = ? AND device_registry_id = ?
                   ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                (farm_id, device["id"], limit, offset),
            ).fetchall()
            return {"items": [self._health_present(row) for row in rows],
                    "total": total, "limit": limit, "offset": offset}

    @staticmethod
    def _confirmation_present(row) -> dict:
        return {
            "id": row["id"], "farm_id": row["farm_id"],
            "testing_request_id": row["testing_request_id"],
            "report_attachment_id": row["report_attachment_id"], "scan_id": row["scan_id"],
            "analyte": row["analyte"], "reported_value": row["reported_value"],
            "unit": row["unit"], "notes": row["notes"], "batch_id": row["batch_id"],
            "sample_type": row["sample_type"], "created_at": row["created_at"],
        }

    def create_lab_confirmation(self, farm_id: str, request: LabConfirmationRequest, *, actor_id: str | None = None) -> dict:
        values = request.model_dump(mode="json")
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            testing_request = self._require(connection, "testing-requests", values["testing_request_id"], farm_id)
            if testing_request["status"] != "report_received":
                raise FieldworkError("A testing request must be report_received before confirmation")
            attachment = connection.execute(
                """SELECT a.id FROM fieldwork_attachments a
                   WHERE a.id = ? AND a.request_id = ?""",
                (values["report_attachment_id"], testing_request["id"]),
            ).fetchone()
            if attachment is None:
                raise FieldworkError("report_attachment_id must be an attachment on this testing request")
            scan_id = values["scan_id"]
            if scan_id is not None:
                scan = connection.execute(
                    "SELECT id, farm_id, batch_id, sample_type FROM scans WHERE id = ? AND farm_id = ?",
                    (scan_id, farm_id),
                ).fetchone()
                if scan is None:
                    raise FieldworkNotFound("Scan not found")
                if (scan["batch_id"], scan["sample_type"]) != (testing_request["batch_id"], testing_request["sample_type"]):
                    raise FieldworkError("scan_id must match the testing request batch and sample_type")
            confirmation_id = str(uuid4())
            created_at = now_utc()
            connection.execute(
                """INSERT INTO fieldwork_lab_confirmations
                   (id, farm_id, testing_request_id, report_attachment_id, scan_id,
                    batch_id, sample_type, analyte, reported_value, unit, notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (confirmation_id, farm_id, testing_request["id"], values["report_attachment_id"], scan_id,
                 testing_request["batch_id"], testing_request["sample_type"], values["analyte"],
                 values["reported_value"], values["unit"], values["notes"], created_at),
            )
            record_audit_event(
                connection, farm_id=farm_id, actor_id=actor_id,
                action="lab_confirmation.created", resource_type="lab_confirmation", resource_id=confirmation_id,
                details={"testing_request_id": testing_request["id"], "has_scan": scan_id is not None},
            )
            row = connection.execute(
                "SELECT * FROM fieldwork_lab_confirmations WHERE id = ?", (confirmation_id,),
            ).fetchone()
            return self._confirmation_present(row)

    def list_lab_confirmations(self, farm_id: str, limit: int, offset: int, *, testing_request_id: str | None = None) -> dict:
        clauses = ["farm_id = ?"]
        values: list[str | int] = [farm_id]
        if testing_request_id is not None:
            clauses.append("testing_request_id = ?")
            values.append(testing_request_id)
        where = " AND ".join(clauses)
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            total = connection.execute(
                f"SELECT COUNT(*) FROM fieldwork_lab_confirmations WHERE {where}", values,
            ).fetchone()[0]
            rows = connection.execute(
                f"""SELECT * FROM fieldwork_lab_confirmations WHERE {where}
                    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                [*values, limit, offset],
            ).fetchall()
            return {"items": [self._confirmation_present(row) for row in rows],
                    "total": total, "limit": limit, "offset": offset}

    def get_lab_confirmation(self, resource_id: str, farm_id: str) -> dict:
        with self.repository._connect() as connection:
            row = connection.execute(
                "SELECT * FROM fieldwork_lab_confirmations WHERE id = ? AND farm_id = ?",
                (resource_id, farm_id),
            ).fetchone()
            if row is None:
                raise FieldworkNotFound("Lab confirmation not found")
            return self._confirmation_present(row)

    @staticmethod
    def _alert_present(row) -> dict:
        return {
            "id": row["id"], "farm_id": row["farm_id"], "scan_id": row["scan_id"],
            "batch_id": row["batch_id"], "sample_type": row["sample_type"], "code": row["code"],
            "message": row["message"], "observed_value": row["observed_value"],
            "threshold": row["threshold"], "status": row["status"],
            "acknowledged_at": row["acknowledged_at"], "acknowledged_by": row["acknowledged_by"],
            "created_at": row["created_at"],
        }

    def list_review_alerts(self, farm_id: str, limit: int, offset: int, *, status: str | None = None,
                           scan_id: str | None = None, batch_id: str | None = None) -> dict:
        clauses = ["farm_id = ?"]
        values: list[str | int] = [farm_id]
        for column, value in (("status", status), ("scan_id", scan_id), ("batch_id", batch_id)):
            if value is not None:
                clauses.append(f"{column} = ?")
                values.append(value)
        where = " AND ".join(clauses)
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            total = connection.execute(
                f"SELECT COUNT(*) FROM fieldwork_review_alerts WHERE {where}", values,
            ).fetchone()[0]
            rows = connection.execute(
                f"""SELECT * FROM fieldwork_review_alerts WHERE {where}
                    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                [*values, limit, offset],
            ).fetchall()
            return {"items": [self._alert_present(row) for row in rows],
                    "total": total, "limit": limit, "offset": offset}

    def get_review_alert(self, resource_id: str, farm_id: str) -> dict:
        with self.repository._connect() as connection:
            row = connection.execute(
                "SELECT * FROM fieldwork_review_alerts WHERE id = ? AND farm_id = ?",
                (resource_id, farm_id),
            ).fetchone()
            if row is None:
                raise FieldworkNotFound("Review alert not found")
            return self._alert_present(row)

    def review_alert_status(self, resource_id: str, farm_id: str, status: str, *, actor_id: str | None = None) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM fieldwork_review_alerts WHERE id = ? AND farm_id = ?",
                (resource_id, farm_id),
            ).fetchone()
            if row is None:
                raise FieldworkNotFound("Review alert not found")
            if row["status"] != status:
                if status == "acknowledged":
                    if actor_id is None:
                        raise FieldworkError("An authenticated actor is required to acknowledge an alert")
                    acknowledged_at, acknowledged_by = now_utc(), actor_id
                else:
                    acknowledged_at = acknowledged_by = None
                connection.execute(
                    """UPDATE fieldwork_review_alerts
                       SET status = ?, acknowledged_at = ?, acknowledged_by = ?
                       WHERE id = ? AND farm_id = ?""",
                    (status, acknowledged_at, acknowledged_by, resource_id, farm_id),
                )
                record_audit_event(
                    connection, farm_id=farm_id, actor_id=actor_id,
                    action="review_alert.acknowledged" if status == "acknowledged" else "review_alert.reopened",
                    resource_type="review_alert", resource_id=resource_id,
                    details={"status": status},
                )
            return self._alert_present(connection.execute(
                "SELECT * FROM fieldwork_review_alerts WHERE id = ? AND farm_id = ?",
                (resource_id, farm_id),
            ).fetchone())

    @staticmethod
    def _audit_present(row) -> dict:
        return {
            "id": row["id"], "farm_id": row["farm_id"], "actor_id": row["actor_id"],
            "action": row["action"], "resource_type": row["resource_type"],
            "resource_id": row["resource_id"], "details": json.loads(row["details_json"]),
            "created_at": row["created_at"],
        }

    def list_audit_events(self, farm_id: str, limit: int, offset: int) -> dict:
        with self.repository._connect() as connection:
            connection.execute("BEGIN")
            total = connection.execute(
                "SELECT COUNT(*) FROM app_audit_events WHERE farm_id = ?", (farm_id,),
            ).fetchone()[0]
            rows = connection.execute(
                """SELECT * FROM app_audit_events WHERE farm_id = ?
                   ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                (farm_id, limit, offset),
            ).fetchall()
            return {"items": [self._audit_present(row) for row in rows],
                    "total": total, "limit": limit, "offset": offset}

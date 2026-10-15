"""Additive fieldwork persistence using the application's existing connection factory.

No repository or database is opened at import. Every read and write is scoped to
the authenticated farm; multi-step writes take SQLite's writer lock first.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

from .fieldwork_models import (
    BatchRequest, ObservationRequest, ReminderRequest, TestingRequest,
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
"""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


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

    def create(self, collection: str, farm_id: str, request) -> dict:
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

    def testing_status(self, resource_id: str, farm_id: str, request) -> dict:
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
            return self._present(connection, "testing-requests", self._require(connection, "testing-requests", resource_id, farm_id))

    @staticmethod
    def _attachment_metadata(collection: str, resource_id: str, row) -> dict:
        segment = "reports" if collection == "testing-requests" else "photos"
        return {
            "id": row["id"], "filename": row["filename"], "content_type": row["content_type"],
            "url": f"/api/v1/{collection}/{resource_id}/{segment}/{row['id']}", "created_at": row["created_at"],
        }

    def add_attachment(self, collection: str, resource_id: str, farm_id: str, filename: str, content_type: str, data: bytes) -> dict:
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

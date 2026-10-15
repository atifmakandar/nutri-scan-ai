"""Small SQLite repository for the Phase 1 traceability loop.

The repository is intentionally isolated from FastAPI routes so the API can be
swapped to PostgreSQL later without changing the screening contract.
"""

from __future__ import annotations

import json
import hashlib
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .models import AnalysisResult, PhotoResponse, ScanCreateRequest, ScanResponse, ScanSummary


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "nutri_scan.sqlite3"


class ConflictError(ValueError):
    pass


class MissingScanError(ValueError):
    pass


def utc_date(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return (parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)).date().isoformat()


class SQLiteRepository:
    def __init__(self, database_path: str | os.PathLike[str] | None = None):
        configured_path = database_path or os.getenv("NUTRI_SCAN_DB") or DEFAULT_DB_PATH
        self.database_path = Path(configured_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        connection.create_function("utc_date", 1, utc_date, deterministic=True)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS farms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS scans (
                    id TEXT PRIMARY KEY,
                    farm_id TEXT NOT NULL,
                    batch_id TEXT NOT NULL,
                    sample_type TEXT NOT NULL CHECK(sample_type IN ('feed', 'silage')),
                    source_mode TEXT NOT NULL CHECK(source_mode IN ('manual', 'mobile', 'esp32')),
                    device_id TEXT,
                    collected_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    inputs_json TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    FOREIGN KEY (farm_id) REFERENCES farms(id)
                );

                CREATE INDEX IF NOT EXISTS idx_scans_farm_created
                    ON scans (farm_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_scans_batch
                    ON scans (batch_id);

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('owner', 'member', 'viewer')),
                    farm_id TEXT NOT NULL REFERENCES farms(id),
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
                CREATE TABLE IF NOT EXISTS photos (
                    id TEXT PRIMARY KEY,
                    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    data BLOB NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_photos_scan ON photos(scan_id);
                """
            )
            # Additive migration: no changes to historical farms, scans or inputs.
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(scans)")}
            for column in ("client_request_id", "request_hash", "instrument_capture_json"):
                if column not in columns:
                    connection.execute(f"ALTER TABLE scans ADD COLUMN {column} TEXT")
            connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_request ON scans(farm_id, client_request_id)"
            )

    def save_scan(self, request: ScanCreateRequest, result: AnalysisResult) -> ScanResponse:
        # The standalone repository retains its old local-use contract. HTTP
        # callers always supply the authenticated farm before reaching here.
        farm_id = request.farm_id or "demo-farm"
        excluded = {"farm_id", "client_request_id"}
        if request.instrument_capture is None:
            # Preserve fingerprints of existing requests without provenance.
            excluded.add("instrument_capture")
        if "collected_at" not in request.model_fields_set:
            excluded.add("collected_at")
        fingerprint = hashlib.sha256(json.dumps(
            request.model_dump(mode="json", exclude=excluded), sort_keys=True,
            separators=(",", ":"), allow_nan=False,
        ).encode()).hexdigest()
        scan = ScanSummary(
            id=result.id,
            farm_id=farm_id,
            batch_id=request.batch_id,
            sample_type=request.sample_type,
            source_mode=request.source_mode,
            device_id=request.device_id,
            collected_at=request.collected_at,
            created_at=result.created_at,
            instrument_capture=request.instrument_capture,
        )

        scan_data = scan.model_dump(mode="json")
        inputs_data = request.inputs.model_dump(mode="json")
        result_data = result.model_dump(mode="json")

        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if request.client_request_id is not None:
                existing = connection.execute(
                    "SELECT * FROM scans WHERE farm_id = ? AND client_request_id = ?",
                    (farm_id, request.client_request_id),
                ).fetchone()
                if existing:
                    if existing["request_hash"] != fingerprint:
                        raise ConflictError("client_request_id was already used for a different request")
                    return self._row_to_response(existing)
            connection.execute(
                """
                INSERT OR IGNORE INTO farms (id, name, created_at)
                VALUES (?, ?, datetime('now'))
                """,
                (farm_id, farm_id.replace("-", " ").title()),
            )
            connection.execute(
                """
                INSERT INTO scans (
                    id, farm_id, batch_id, sample_type, source_mode, device_id,
                    collected_at, created_at, inputs_json, result_json,
                    client_request_id, request_hash, instrument_capture_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scan.id,
                    scan.farm_id,
                    scan.batch_id,
                    scan.sample_type,
                    scan.source_mode,
                    scan.device_id,
                    scan_data["collected_at"],
                    scan_data["created_at"],
                    json.dumps(inputs_data),
                    json.dumps(result_data),
                    request.client_request_id,
                    fingerprint if request.client_request_id is not None else None,
                    request.instrument_capture.model_dump_json(exclude_none=True) if request.instrument_capture is not None else None,
                ),
            )
        return ScanResponse(scan=scan, result=result)

    def get_scan(self, scan_id: str, *, farm_id: str | None = None) -> ScanResponse | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM scans WHERE id = ?" + (" AND farm_id = ?" if farm_id is not None else ""),
                (scan_id, farm_id) if farm_id is not None else (scan_id,),
            ).fetchone()
        return self._row_to_response(row) if row else None

    def list_scans(
        self,
        *,
        farm_id: str | None = None,
        batch_id: str | None = None,
        sample_type: str | None = None,
        limit: int = 50,
        **filters,
    ) -> list[ScanResponse]:
        items, _ = self.search_scans(
            farm_id=farm_id, batch_id=batch_id, sample_type=sample_type,
            limit=limit, **filters,
        )
        return items

    def search_scans(
        self, *, farm_id: str | None = None, batch_id: str | None = None,
        batch_query: str | None = None, sample_type: str | None = None,
        risk_level: str | None = None, date_from: str | None = None,
        date_to: str | None = None, limit: int = 20, offset: int = 0,
    ) -> tuple[list[ScanResponse], int]:
        clauses: list[str] = []
        values: list[str | int] = []
        for column, value in (("farm_id", farm_id), ("batch_id", batch_id), ("sample_type", sample_type)):
            if value is not None:
                clauses.append(f"{column} = ?")
                values.append(value)
        if batch_query is not None:
            clauses.append("batch_id LIKE ? ESCAPE '\\'")
            values.append("%" + batch_query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
        if risk_level is not None:
            clauses.append("json_extract(result_json, '$.risk_level') = ?")
            values.append(risk_level)
        for operator, value in ((">=", date_from), ("<=", date_to)):
            if value is not None:
                clauses.append(f"utc_date(collected_at) {operator} ?")
                values.append(value)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as connection:
            connection.execute("BEGIN")
            total = connection.execute(f"SELECT COUNT(*) FROM scans {where}", values).fetchone()[0]
            rows = connection.execute(
                f"SELECT * FROM scans {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                [*values, max(1, min(limit, 100)), offset],
            ).fetchall()
        return [self._row_to_response(row) for row in rows], total

    def register_owner(self, username: str, password_hash: str, farm_name: str) -> dict:
        user_id, farm_id = str(uuid4()), str(uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self._connect() as connection:
                connection.execute("INSERT INTO farms VALUES (?, ?, ?)", (farm_id, farm_name, now))
                connection.execute(
                    "INSERT INTO users VALUES (?, ?, ?, 'owner', ?, ?)",
                    (user_id, username, password_hash, farm_id, now),
                )
        except sqlite3.IntegrityError as exc:
            raise ConflictError("Username already exists") from exc
        return self.get_user(username)

    def get_user(self, username: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT users.*, farms.name AS farm_name FROM users JOIN farms ON users.farm_id = farms.id WHERE username = ?",
                (username,),
            ).fetchone()
        return dict(row) if row else None

    def create_member(self, owner_id: str, username: str, password_hash: str, role: str) -> dict:
        if role not in {"member", "viewer"}:
            raise ValueError("Member role must be member or viewer")
        try:
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                owner = connection.execute("SELECT farm_id FROM users WHERE id = ? AND role = 'owner'", (owner_id,)).fetchone()
                if not owner:
                    raise ValueError("Only an owner can create members")
                connection.execute(
                    "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid4()), username, password_hash, role, owner["farm_id"], datetime.now(timezone.utc).isoformat()),
                )
        except sqlite3.IntegrityError as exc:
            raise ConflictError("Username already exists") from exc
        return self.get_user(username)

    def list_members(self, farm_id: str) -> list[dict]:
        with self._connect() as connection:
            return [dict(row) for row in connection.execute(
                "SELECT id, username, role FROM users WHERE farm_id = ? ORDER BY created_at, id", (farm_id,),
            )]

    def create_session(self, token_digest: str, user_id: str, expires_at: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            connection.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_digest, user_id, expires_at))

    def session_user(self, token_digest: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                """SELECT users.*, farms.name AS farm_name FROM sessions
                   JOIN users ON users.id = sessions.user_id JOIN farms ON farms.id = users.farm_id
                   WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
                (token_digest, int(time.time())),
            ).fetchone()
        return dict(row) if row else None

    def revoke_session(self, token_digest: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest,))

    def assign_legacy(self, username: str, source_farm_id: str) -> int:
        """Local admin operation: atomically move unowned scans, preserving IDs/photos."""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            owner = connection.execute("SELECT * FROM users WHERE username = ? AND role = 'owner'", (username,)).fetchone()
            if not owner:
                raise ValueError("Target username must be an existing owner")
            if not connection.execute("SELECT 1 FROM farms WHERE id = ?", (source_farm_id,)).fetchone():
                raise ValueError("Legacy farm does not exist")
            if connection.execute("SELECT 1 FROM users WHERE farm_id = ?", (source_farm_id,)).fetchone():
                raise ValueError("Source farm already has accounts; only unowned legacy farms may be assigned")
            try:
                return connection.execute(
                    "UPDATE scans SET farm_id = ? WHERE farm_id = ?", (owner["farm_id"], source_farm_id),
                ).rowcount
            except sqlite3.IntegrityError as exc:
                raise ConflictError("Request-ID collision; migration rolled back") from exc

    def add_photo(self, scan_id: str, farm_id: str, filename: str, content_type: str, data: bytes) -> PhotoResponse:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if not connection.execute("SELECT 1 FROM scans WHERE id = ? AND farm_id = ?", (scan_id, farm_id)).fetchone():
                raise MissingScanError("Scan not found")
            count = connection.execute(
                "SELECT COUNT(*) FROM photos JOIN scans ON scans.id = photos.scan_id WHERE scan_id = ? AND scans.farm_id = ?",
                (scan_id, farm_id),
            ).fetchone()[0]
            if count >= 5:
                raise ConflictError("A scan may have at most five photos")
            photo_id = str(uuid4())
            created_at = datetime.now(timezone.utc)
            connection.execute(
                "INSERT INTO photos (id, scan_id, filename, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (photo_id, scan_id, filename, content_type, data, created_at.isoformat()),
            )
        return PhotoResponse(id=photo_id, filename=filename, content_type=content_type, url=f"/api/v1/scans/{scan_id}/photos/{photo_id}", created_at=created_at)

    def list_photos(self, scan_id: str, farm_id: str) -> list[PhotoResponse]:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT photos.id, photos.scan_id, photos.filename, photos.content_type, photos.created_at
                   FROM photos JOIN scans ON scans.id = photos.scan_id
                   WHERE photos.scan_id = ? AND scans.farm_id = ? ORDER BY photos.created_at, photos.id""",
                (scan_id, farm_id),
            ).fetchall()
        return [self._row_to_photo(row) for row in rows]

    def get_photo(self, scan_id: str, photo_id: str, farm_id: str) -> sqlite3.Row | None:
        with self._connect() as connection:
            return connection.execute(
                """SELECT photos.* FROM photos JOIN scans ON scans.id = photos.scan_id
                   WHERE photos.id = ? AND photos.scan_id = ? AND scans.farm_id = ?""",
                (photo_id, scan_id, farm_id),
            ).fetchone()

    def delete_photo(self, scan_id: str, photo_id: str, farm_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                """DELETE FROM photos WHERE id = ? AND scan_id = ? AND scan_id IN
                   (SELECT id FROM scans WHERE id = ? AND farm_id = ?)""",
                (photo_id, scan_id, scan_id, farm_id),
            )
            return cursor.rowcount == 1

    @staticmethod
    def _row_to_photo(row: sqlite3.Row) -> PhotoResponse:
        return PhotoResponse(
            id=row["id"], filename=row["filename"], content_type=row["content_type"],
            url=f"/api/v1/scans/{row['scan_id']}/photos/{row['id']}",
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _row_to_response(row: sqlite3.Row) -> ScanResponse:
        return ScanResponse(
            scan=ScanSummary.model_validate(
                {
                    "id": row["id"],
                    "farm_id": row["farm_id"],
                    "batch_id": row["batch_id"],
                    "sample_type": row["sample_type"],
                    "source_mode": row["source_mode"],
                    "device_id": row["device_id"],
                    "collected_at": row["collected_at"],
                    "created_at": row["created_at"],
                    "instrument_capture": json.loads(row["instrument_capture_json"]) if row["instrument_capture_json"] else None,
                }
            ),
            result=AnalysisResult.model_validate(json.loads(row["result_json"])),
        )

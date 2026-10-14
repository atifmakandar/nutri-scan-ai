"""Small SQLite repository for the Phase 1 traceability loop.

The repository is intentionally isolated from FastAPI routes so the API can be
swapped to PostgreSQL later without changing the screening contract.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from .models import AnalysisResult, ScanCreateRequest, ScanResponse, ScanSummary


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "nutri_scan.sqlite3"


class SQLiteRepository:
    def __init__(self, database_path: str | os.PathLike[str] | None = None):
        configured_path = database_path or os.getenv("NUTRI_SCAN_DB") or DEFAULT_DB_PATH
        self.database_path = Path(configured_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

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
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO farms (id, name, created_at)
                VALUES ('demo-farm', 'Demo Dairy Farm', datetime('now'))
                """
            )

    def save_scan(self, request: ScanCreateRequest, result: AnalysisResult) -> ScanResponse:
        scan = ScanSummary(
            id=result.id,
            farm_id=request.farm_id,
            batch_id=request.batch_id,
            sample_type=request.sample_type,
            source_mode=request.source_mode,
            device_id=request.device_id,
            collected_at=request.collected_at,
            created_at=result.created_at,
        )

        scan_data = scan.model_dump(mode="json")
        inputs_data = request.inputs.model_dump(mode="json")
        result_data = result.model_dump(mode="json")

        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO farms (id, name, created_at)
                VALUES (?, ?, datetime('now'))
                """,
                (request.farm_id, request.farm_id.replace("-", " ").title()),
            )
            connection.execute(
                """
                INSERT INTO scans (
                    id, farm_id, batch_id, sample_type, source_mode, device_id,
                    collected_at, created_at, inputs_json, result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                ),
            )
        return ScanResponse(scan=scan, result=result)

    def get_scan(self, scan_id: str) -> ScanResponse | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM scans WHERE id = ?", (scan_id,)
            ).fetchone()
        return self._row_to_response(row) if row else None

    def list_scans(
        self,
        *,
        farm_id: str | None = None,
        batch_id: str | None = None,
        sample_type: str | None = None,
        limit: int = 50,
    ) -> list[ScanResponse]:
        clauses: list[str] = []
        values: list[str | int] = []
        if farm_id:
            clauses.append("farm_id = ?")
            values.append(farm_id)
        if batch_id:
            clauses.append("batch_id = ?")
            values.append(batch_id)
        if sample_type:
            clauses.append("sample_type = ?")
            values.append(sample_type)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        values.append(max(1, min(limit, 100)))
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT * FROM scans {where} ORDER BY created_at DESC LIMIT ?",
                values,
            ).fetchall()
        return [self._row_to_response(row) for row in rows]

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
                }
            ),
            result=AnalysisResult.model_validate(json.loads(row["result_json"])),
        )

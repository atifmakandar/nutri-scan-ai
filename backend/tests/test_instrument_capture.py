"""Optional provenance contract and additive persistence; all databases are temporary."""
import copy
import hashlib
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from app.engine import analyze
from app.models import AnalyzeRequest, InstrumentCapture, ScanCreateRequest
from app.storage import ConflictError, SQLiteRepository


def body():
    return {
        "farm_id": "instrument-test-farm", "batch_id": "measured-01", "sample_type": "silage",
        "source_mode": "esp32", "device_id": "meter-17", "collected_at": "2026-10-15T11:20:30+05:30",
        "inputs": {
            "sensor": {"moisture_pct": 62, "ph": 4.2, "temperature_c": 24, "humidity_pct": 68},
            "nir": {"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
            "vision": {"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
        },
        "instrument_capture": {
            "device_id": "meter-17", "captured_at": "2026-10-15T11:20:30+05:30",
            "calibration_status": "reported_current", "calibration_reference": "operator-reference-23",
            "readings": [{"field": "moisture_pct", "value": 62, "unit": "%"}, {"field": "ph", "value": 4.2, "unit": "pH"}],
        },
    }


def assessment(request):
    return analyze(AnalyzeRequest(sample_type=request.sample_type, **request.inputs.model_dump()))


@contextmanager
def open_database(path):
    connection = sqlite3.connect(path)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


class InstrumentCaptureTests(unittest.TestCase):
    def test_api_retains_optional_provenance_after_restart_and_rejects_mismatch(self):
        from fastapi.testclient import TestClient

        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"NUTRI_SCAN_ORIGINS": "", "NUTRI_SCAN_COOKIE_SECURE": "false", "NUTRI_SCAN_DB": str(Path(directory) / "default-unused.sqlite3")}):
            from app.main import create_app

            path = Path(directory) / "api.sqlite3"
            headers = {"Origin": "http://localhost:5173"}
            credentials = {"username": "instrument-test", "password": "isolated-test-password"}
            payload = body()
            del payload["farm_id"]
            with TestClient(create_app(path)) as client:
                self.assertEqual(client.post("/api/v1/auth/register", headers=headers, json={**credentials, "farm_name": "Temporary Test Farm"}).status_code, 201)
                saved = client.post("/api/v1/scans", headers=headers, json=payload)
                self.assertEqual(saved.status_code, 201, saved.text)
                record = saved.json()
                self.assertEqual(record["scan"]["instrument_capture"]["readings"], payload["instrument_capture"]["readings"])
                self.assertEqual(record["result"]["assessment"]["calibration_status"], "uncalibrated")
                mismatch = copy.deepcopy(payload)
                mismatch["inputs"]["sensor"]["moisture_pct"] = 61
                self.assertEqual(client.post("/api/v1/scans", headers=headers, json=mismatch).status_code, 422)
                unknown = copy.deepcopy(payload)
                unknown["instrument_capture"]["readings"][0]["field"] = "vision"
                self.assertEqual(client.post("/api/v1/scans", headers=headers, json=unknown).status_code, 422)
            with TestClient(create_app(path)) as restarted:
                self.assertEqual(restarted.post("/api/v1/auth/login", headers=headers, json=credentials).status_code, 200)
                loaded = restarted.get(f"/api/v1/scans/{record['scan']['id']}")
                self.assertEqual(loaded.status_code, 200)
                self.assertEqual(loaded.json(), record)

    def test_retained_after_restart_and_in_summary_search_without_changing_scoring(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "capture.sqlite3"
            request = ScanCreateRequest.model_validate(body())
            repository = SQLiteRepository(path)
            result = assessment(request)
            saved = repository.save_scan(request, result)
            reopened = SQLiteRepository(path)
            loaded = reopened.get_scan(saved.scan.id, farm_id=request.farm_id)
            self.assertEqual(loaded.scan.instrument_capture, request.instrument_capture)
            self.assertEqual(loaded.scan.collected_at, request.instrument_capture.captured_at)
            self.assertEqual(reopened.list_scans(farm_id=request.farm_id)[0], loaded)
            self.assertEqual(reopened.search_scans(farm_id=request.farm_id)[0][0], loaded)
            self.assertEqual(loaded.result, result)
            self.assertEqual(loaded.result.assessment.calibration_status, "uncalibrated")
            with open_database(path) as connection:
                stored = json.loads(connection.execute("SELECT instrument_capture_json FROM scans").fetchone()[0])
            self.assertEqual(stored["readings"], body()["instrument_capture"]["readings"])

    def test_malformed_capture_rejected(self):
        changes = [
            {"device_id": ""}, {"device_id": " meter"}, {"device_id": "meter\n17"}, {"device_id": "x" * 121},
            {"calibration_status": "verified"}, {"calibration_status": "current"}, {"calibration_reference": " "},
            {"calibration_reference": "x" * 201}, {"extra": "no"}, {"captured_at": "2026-10-15T11:20:30"},
            {"captured_at": "2026-02-30T11:20:30Z"}, {"captured_at": 1792063230}, {"readings": []},
            {"readings": [{"field": "mold_score", "value": 0.1, "unit": "%"}]},
            {"readings": [{"field": "unknown", "value": 1, "unit": "%"}]},
            {"readings": [{"field": "ph", "value": 4.2, "unit": "%"}]},
            {"readings": [{"field": "ph", "value": 15, "unit": "pH"}]},
            {"readings": [{"field": "temperature_c", "value": 81, "unit": "°C"}]},
            {"readings": [{"field": "temperature_c", "value": -21, "unit": "°C"}]},
            {"readings": [{"field": "ph", "value": "4.2", "unit": "pH"}]},
            {"readings": [{"field": "ph", "value": True, "unit": "pH"}]},
            {"readings": [{"field": "ph", "value": float("nan"), "unit": "pH"}]},
            {"readings": [{"field": "ph", "value": float("inf"), "unit": "pH"}]},
            {"readings": [{"field": "ph", "value": 4.2, "unit": "pH", "verified": True}]},
            {"readings": [{"field": "ph", "value": 4.2, "unit": "pH"}] * 2},
            {"readings": [{"field": "ph", "value": 4.2, "unit": "pH"}] * 8},
        ]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                InstrumentCapture.model_validate({**body()["instrument_capture"], **change})

    def test_metadata_must_match_submitted_readings_source_device_and_aware_time(self):
        for change in [{"source_mode": "manual"}, {"device_id": "other"}, {"device_id": None},
                       {"collected_at": "2026-10-15T11:20:31+05:30"}, {"collected_at": "2026-10-15T11:20:30"},
                       {"collected_at": None}]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                ScanCreateRequest.model_validate({**body(), **change})
        missing = body()
        del missing["collected_at"]
        with self.assertRaises(ValidationError):
            ScanCreateRequest.model_validate(missing)
        mismatch = body()
        mismatch["inputs"]["sensor"]["moisture_pct"] = 61
        with self.assertRaises(ValidationError):
            ScanCreateRequest.model_validate(mismatch)
        equivalent = body()
        equivalent["collected_at"] = "2026-10-15T05:50:30Z"
        self.assertIsNotNone(ScanCreateRequest.model_validate(equivalent).instrument_capture)

    def test_idempotency_includes_provenance_not_only_measurements(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = SQLiteRepository(Path(directory) / "fingerprint.sqlite3")
            original = {**body(), "client_request_id": "instrument-capture-request"}
            request = ScanCreateRequest.model_validate(original)
            saved = repo.save_scan(request, assessment(request))
            self.assertEqual(repo.save_scan(request, assessment(request)), saved)
            for status in ["unknown", "reported_expired"]:
                changed = copy.deepcopy(original)
                changed["instrument_capture"]["calibration_status"] = status
                updated = ScanCreateRequest.model_validate(changed)
                with self.assertRaises(ConflictError):
                    repo.save_scan(updated, assessment(updated))

    def test_additive_migration_keeps_original_requests_rows_and_fingerprints(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.sqlite3"
            # A real pre-extension schema/row, with the original idempotency hash.
            original = body()
            for key in ["source_mode", "device_id", "collected_at", "instrument_capture"]:
                del original[key]
            original["client_request_id"] = "existing-request"
            request = ScanCreateRequest.model_validate(original)
            self.assertEqual(request.source_mode, "manual")
            self.assertIsNone(request.instrument_capture)
            result = assessment(request)
            digest = hashlib.sha256(json.dumps(request.model_dump(mode="json", exclude={
                "farm_id", "client_request_id", "collected_at", "instrument_capture"
            }), sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
            with open_database(path) as connection:
                connection.executescript("""
                    CREATE TABLE farms (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
                    CREATE TABLE scans (id TEXT PRIMARY KEY, farm_id TEXT NOT NULL, batch_id TEXT NOT NULL,
                        sample_type TEXT NOT NULL, source_mode TEXT NOT NULL, device_id TEXT, collected_at TEXT NOT NULL,
                        created_at TEXT NOT NULL, inputs_json TEXT NOT NULL, result_json TEXT NOT NULL,
                        client_request_id TEXT, request_hash TEXT);
                """)
                connection.execute("INSERT INTO farms VALUES (?, ?, ?)", (request.farm_id, "Legacy Farm", result.created_at.isoformat()))
                connection.execute("INSERT INTO scans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                    result.id, request.farm_id, request.batch_id, request.sample_type, "manual", None,
                    request.collected_at.isoformat(), result.created_at.isoformat(), request.inputs.model_dump_json(),
                    result.model_dump_json(), request.client_request_id, digest,
                ))
            repo = SQLiteRepository(path)
            old = repo.get_scan(result.id)
            self.assertIsNone(old.scan.instrument_capture)
            self.assertEqual(repo.save_scan(request, assessment(request)), old)
            with open_database(path) as connection:
                columns = {row[1] for row in connection.execute("PRAGMA table_info(scans)")}
                self.assertIn("instrument_capture_json", columns)
                self.assertIsNone(connection.execute("SELECT instrument_capture_json FROM scans").fetchone()[0])
            # Existing naive collection times retain their original UTC normalization.
            legacy = ScanCreateRequest.model_validate({**original, "collected_at": "2026-10-15T11:20:30"})
            self.assertEqual(legacy.collected_at.utcoffset().total_seconds(), 0)


if __name__ == "__main__":
    unittest.main()

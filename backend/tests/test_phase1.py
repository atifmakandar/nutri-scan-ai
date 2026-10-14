import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from app.engine import analyze
from app.models import AnalyzeRequest, InputBundle, ScanCreateRequest
from app.storage import SQLiteRepository


def sample_request(batch_id: str = "SIL-TEST-01") -> ScanCreateRequest:
    return ScanCreateRequest(
        farm_id="test-farm",
        batch_id=batch_id,
        sample_type="silage",
        inputs=InputBundle(
            sensor={
                "moisture_pct": 62,
                "ph": 4.2,
                "temperature_c": 24,
                "humidity_pct": 68,
            },
            nir={"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
            vision={"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
        ),
    )


class PhaseOneTests(unittest.TestCase):
    def test_screening_engine_returns_explainable_result(self):
        request = sample_request()
        result = analyze(
            AnalyzeRequest(
                sample_type=request.sample_type,
                sensor=request.inputs.sensor,
                nir=request.inputs.nir,
                vision=request.inputs.vision,
            )
        )

        self.assertGreaterEqual(result.quality_score, 0)
        self.assertLessEqual(result.quality_score, 100)
        self.assertIn(result.risk_level, {"LOW", "MEDIUM", "HIGH"})
        self.assertEqual(result.assessment.calibration_status, "uncalibrated")
        self.assertTrue(result.advisory)

    def test_scan_is_persisted_and_readable_after_repository_reopen(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "phase1.sqlite3"
            repository = SQLiteRepository(database)
            request = sample_request()
            result = analyze(
                AnalyzeRequest(
                    sample_type=request.sample_type,
                    sensor=request.inputs.sensor,
                    nir=request.inputs.nir,
                    vision=request.inputs.vision,
                )
            )
            saved = repository.save_scan(request, result)

            reopened = SQLiteRepository(database)
            loaded = reopened.get_scan(saved.scan.id)
            history = reopened.list_scans(farm_id="test-farm")

            self.assertIsNotNone(loaded)
            self.assertEqual(loaded.scan.batch_id, "SIL-TEST-01")
            self.assertEqual(loaded.result.id, result.id)
            self.assertEqual(len(history), 1)

    def test_invalid_measurement_is_rejected_before_analysis(self):
        with self.assertRaises(ValidationError):
            ScanCreateRequest(
                farm_id="test-farm",
                batch_id="SIL-INVALID",
                sample_type="silage",
                inputs={
                    "sensor": {
                        "moisture_pct": 140,
                        "ph": 4.2,
                        "temperature_c": 24,
                        "humidity_pct": 68,
                    },
                    "nir": {"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
                    "vision": {"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
                },
            )


if __name__ == "__main__":
    unittest.main()

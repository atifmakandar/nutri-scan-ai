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
        self.assertEqual([factor.code for factor in result.score_breakdown], [
            "ph_fit", "moisture_fit", "nutrition_indicator", "visual_indicator",
        ])
        self.assertAlmostEqual(sum(factor.contribution for factor in result.score_breakdown), result.quality_score, places=1)

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

        for temperature in (-20.001, 80.001):
            with self.subTest(temperature=temperature), self.assertRaises(ValidationError):
                ScanCreateRequest(
                    farm_id="test-farm",
                    batch_id="SIL-TEMP",
                    sample_type="silage",
                    inputs={
                        "sensor": {
                            "moisture_pct": 62, "ph": 4.2, "temperature_c": temperature, "humidity_pct": 68,
                        },
                        "nir": {"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
                        "vision": {"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
                    },
                )

    def test_optional_reported_capabilities_are_preserved_without_becoming_detection_claims(self):
        request = sample_request()
        result = analyze(
            AnalyzeRequest(
                sample_type=request.sample_type,
                sensor=request.inputs.sensor,
                nir=request.inputs.nir,
                vision=request.inputs.vision,
                supplemental={
                    "energy_mj_per_kg": 10.5,
                    "calcium_pct": 0.7,
                    "urea_concern_score": 0.8,
                    "aflatoxin_concern_score": 0.2,
                },
            )
        )

        self.assertEqual(result.parameters["energy_mj_per_kg"], 10.5)
        self.assertEqual(result.parameters["calcium_pct"], 0.7)
        self.assertEqual(result.parameters["urea_concern_score"], 0.8)
        self.assertEqual(
            [(signal.code, signal.status) for signal in result.capability_signals],
            [("energy_reported", "reported"), ("minerals_reported", "reported"), ("urea_concern", "review_required"), ("aflatoxin_concern", "review_required")],
        )
        self.assertNotIn("Urea adulteration detected", result.anomalies)
        self.assertTrue(any("qualified laboratory" in advisory for advisory in result.advisory))


if __name__ == "__main__":
    unittest.main()

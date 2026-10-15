import json
import sys
import tempfile
import unittest
from pathlib import Path


CALIBRATION_DIR = Path(__file__).resolve().parent
if str(CALIBRATION_DIR) not in sys.path:
    sys.path.insert(0, str(CALIBRATION_DIR))

import calibrate  # noqa: E402


REFERENCE_CSV = CALIBRATION_DIR / "sample_reference.csv"


class CalibrationWorkflowTests(unittest.TestCase):
    def test_synthetic_flag_and_optional_coefficients_are_reported(self):
        report = calibrate.build_report(REFERENCE_CSV, fit_calibration=True)

        self.assertEqual(
            report["data_status"], "synthetic_demo_not_for_field_use"
        )
        self.assertTrue(report["calibration"]["requested"])
        for target in calibrate.TARGET_COLUMNS:
            self.assertEqual(
                report["calibration"]["targets"][target]["status"], "fitted"
            )
            self.assertGreaterEqual(
                report["calibration"]["targets"][target]["n_train"], 3
            )

    def test_metric_calculation(self):
        metrics = calibrate.calculate_metrics([2.0, 4.0, 8.0], [1.0, 5.0, 6.0])

        self.assertEqual(metrics["n"], 3)
        self.assertAlmostEqual(metrics["mae"], 4 / 3)
        self.assertAlmostEqual(metrics["rmse"], (6 / 3) ** 0.5)
        self.assertAlmostEqual(metrics["bias"], 2 / 3)
        self.assertAlmostEqual(metrics["r2"], 1 - 6 / 14)

    def test_farm_groups_do_not_leak_and_split_is_deterministic(self):
        rows = calibrate.load_reference_csv(REFERENCE_CSV)
        first = calibrate.split_rows_by_farm(rows)
        second = calibrate.split_rows_by_farm(list(reversed(rows)))

        first_assignments = {
            row["sample_id"]: split
            for split, split_rows in first.items()
            for row in split_rows
        }
        second_assignments = {
            row["sample_id"]: split
            for split, split_rows in second.items()
            for row in split_rows
        }
        self.assertEqual(first_assignments, second_assignments)
        first_sample_ids = {
            row["sample_id"]
            for split_rows in first.values()
            for row in split_rows
        }
        self.assertEqual(first_sample_ids, {row["sample_id"] for row in rows})
        for farm_id in {row["farm_id"] for row in rows}:
            memberships = {
                split
                for split, split_rows in first.items()
                if any(row["farm_id"] == farm_id for row in split_rows)
            }
            self.assertEqual(len(memberships), 1, farm_id)

    def test_invalid_csv_reports_missing_columns_nonfinite_and_duplicate_ids(self):
        header = ",".join(calibrate.REQUIRED_COLUMNS)
        valid_values = [
            "sample-a",
            "farm-a",
            "feed",
            "1",
            "1",
            "2",
            "2",
            "3",
            "3",
            "4",
            "4",
        ]
        with tempfile.TemporaryDirectory() as directory:
            directory_path = Path(directory)
            missing_path = directory_path / "missing.csv"
            missing_path.write_text("sample_id,farm_id\na,b\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing required column"):
                calibrate.load_reference_csv(missing_path)

            nonfinite_path = directory_path / "nonfinite.csv"
            nonfinite_values = list(valid_values)
            nonfinite_values[3] = "NaN"
            nonfinite_path.write_text(
                header + "\n" + ",".join(nonfinite_values) + "\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "nonfinite"):
                calibrate.load_reference_csv(nonfinite_path)

            duplicate_path = directory_path / "duplicate.csv"
            duplicate_values = list(valid_values)
            duplicate_path.write_text(
                header
                + "\n"
                + ",".join(valid_values)
                + "\n"
                + ",".join(duplicate_values)
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "duplicate sample_id"):
                calibrate.load_reference_csv(duplicate_path)

    def test_report_json_is_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            first_path = Path(directory) / "first.json"
            second_path = Path(directory) / "second.json"
            first_report = calibrate.build_report(REFERENCE_CSV, fit_calibration=True)
            second_report = calibrate.build_report(REFERENCE_CSV, fit_calibration=True)
            calibrate.write_report(first_report, first_path)
            calibrate.write_report(second_report, second_path)

            self.assertEqual(
                first_path.read_text(encoding="utf-8"),
                second_path.read_text(encoding="utf-8"),
            )
            self.assertEqual(
                json.loads(first_path.read_text(encoding="utf-8")), first_report
            )

    def test_fit_requires_three_paired_train_rows(self):
        header = ",".join(calibrate.REQUIRED_COLUMNS)
        rows = [
            ["small-1", "small-farm", "synthetic_demo_feed", "1", "1", "2", "2", "3", "3", "4", "4"],
            ["small-2", "small-farm", "synthetic_demo_feed", "2", "2", "3", "3", "4", "4", "5", "5"],
        ]
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "two_rows.csv"
            input_path.write_text(
                header + "\n" + "\n".join(",".join(row) for row in rows) + "\n",
                encoding="utf-8",
            )
            report = calibrate.build_report(input_path, fit_calibration=True)

        for target in calibrate.TARGET_COLUMNS:
            target_report = report["calibration"]["targets"][target]
            self.assertEqual(target_report["status"], "not_fitted")
            self.assertEqual(target_report["n_train"], 2)

    def test_cli_writes_report_and_returns_readable_error(self):
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "report.json"
            result = calibrate.main(
                [
                    "--input",
                    str(REFERENCE_CSV),
                    "--output",
                    str(output_path),
                    "--fit",
                ]
            )
            self.assertEqual(result, 0)
            self.assertEqual(
                json.loads(output_path.read_text(encoding="utf-8"))["data_status"],
                calibrate.DATA_STATUS,
            )

            bad_path = Path(directory) / "bad.csv"
            bad_path.write_text("sample_id,farm_id\nonly,row\n", encoding="utf-8")
            result = calibrate.main(
                ["--input", str(bad_path), "--output", str(directory) + "/bad.json"]
            )
            self.assertEqual(result, 2)


if __name__ == "__main__":
    unittest.main()

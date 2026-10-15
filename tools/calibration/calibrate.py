#!/usr/bin/env python3
"""Validate reference CSV data and produce a transparent calibration report.

This module intentionally uses only the Python standard library.  It is a
stand-alone demo tool and does not import or modify the Nutri-Scan app.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple


DATA_STATUS = "synthetic_demo_not_for_field_use"
DEFAULT_SPLIT_SEED = "nutriscan-calibration-demo-v1"

REQUIRED_COLUMNS = (
    "sample_id",
    "farm_id",
    "sample_type",
    "moisture_sensor",
    "moisture_lab",
    "protein_nir",
    "protein_lab",
    "fiber_nir",
    "fiber_lab",
    "ph_sensor",
    "ph_lab",
)

TARGET_COLUMNS = {
    "moisture": ("moisture_sensor", "moisture_lab"),
    "protein": ("protein_nir", "protein_lab"),
    "fiber": ("fiber_nir", "fiber_lab"),
    "ph": ("ph_sensor", "ph_lab"),
}

SPLIT_NAMES = ("train", "validation", "test")


class CalibrationError(ValueError):
    """A readable input or calibration error suitable for a CLI user."""


def _rounded(value: Optional[float]) -> Optional[float]:
    """Make JSON output compact and avoid emitting a negative zero."""

    if value is None:
        return None
    result = round(float(value), 12)
    return 0.0 if result == 0 else result


def _row_value(row: Mapping[str, str], column: str, line_number: int) -> str:
    value = row.get(column)
    if value is None or not value.strip():
        raise CalibrationError(
            f"row {line_number}: column '{column}' must contain a non-empty value"
        )
    return value.strip()


def _optional_number(
    row: Mapping[str, str], column: str, line_number: int
) -> Optional[float]:
    raw_value = row.get(column)
    if raw_value is None or not raw_value.strip():
        return None
    value_text = raw_value.strip()
    try:
        value = float(value_text)
    except ValueError as exc:
        raise CalibrationError(
            f"row {line_number}: column '{column}' has invalid numeric value {value_text!r}"
        ) from exc
    if not math.isfinite(value):
        raise CalibrationError(
            f"row {line_number}: column '{column}' contains nonfinite value {value_text!r}"
        )
    return value


def load_reference_csv(input_path: Path) -> List[Dict[str, Any]]:
    """Load and validate the required reference CSV schema.

    Numeric cells may be blank so a target can be reported as unavailable for
    that row.  Whenever both members of a sensor/lab pair are present, they
    are used for that target's metrics.
    """

    try:
        handle = input_path.open("r", encoding="utf-8-sig", newline="")
    except OSError as exc:
        raise CalibrationError(f"cannot open input CSV '{input_path}': {exc}") from exc

    with handle:
        try:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames
            if not fieldnames:
                raise CalibrationError("input CSV is empty or has no header row")

            duplicate_columns = sorted(
                {
                    name
                    for name in fieldnames
                    if name is not None and fieldnames.count(name) > 1
                }
            )
            if duplicate_columns:
                names = ", ".join(repr(name) for name in duplicate_columns)
                raise CalibrationError(f"input CSV has duplicate column names: {names}")

            missing_columns = [
                column for column in REQUIRED_COLUMNS if column not in fieldnames
            ]
            if missing_columns:
                raise CalibrationError(
                    "input CSV is missing required column(s): "
                    + ", ".join(missing_columns)
                )

            rows: List[Dict[str, Any]] = []
            seen_sample_ids = set()
            for row in reader:
                line_number = reader.line_num
                if None in row:
                    raise CalibrationError(
                        f"row {line_number}: contains more values than the CSV header"
                    )

                sample_id = _row_value(row, "sample_id", line_number)
                farm_id = _row_value(row, "farm_id", line_number)
                sample_type = _row_value(row, "sample_type", line_number)
                if sample_id in seen_sample_ids:
                    raise CalibrationError(
                        f"row {line_number}: duplicate sample_id {sample_id!r}"
                    )
                seen_sample_ids.add(sample_id)

                parsed: Dict[str, Any] = {
                    "sample_id": sample_id,
                    "farm_id": farm_id,
                    "sample_type": sample_type,
                }
                for column in REQUIRED_COLUMNS[3:]:
                    parsed[column] = _optional_number(row, column, line_number)
                rows.append(parsed)
        except csv.Error as exc:
            raise CalibrationError(f"input CSV could not be parsed: {exc}") from exc

    if not rows:
        raise CalibrationError("input CSV contains no data rows")

    # Sorting makes the report independent of CSV row order while preserving
    # the duplicate-ID guarantee above.
    rows.sort(key=lambda row: row["sample_id"])
    return rows


def calculate_metrics(
    predictions: Sequence[float], references: Sequence[float]
) -> Dict[str, Optional[float]]:
    """Return MAE, RMSE, signed bias, and R2 for paired values.

    Bias is ``prediction - reference``.  R2 is unavailable for fewer than two
    rows or a constant reference vector and is represented as JSON null.
    """

    if len(predictions) != len(references):
        raise CalibrationError("cannot calculate metrics for vectors of different lengths")
    if any(
        not math.isfinite(value)
        for value in list(predictions) + list(references)
    ):
        raise CalibrationError("cannot calculate metrics from nonfinite values")

    count = len(predictions)
    if count == 0:
        return {"n": 0, "mae": None, "rmse": None, "bias": None, "r2": None}

    errors = [prediction - reference for prediction, reference in zip(predictions, references)]
    mae = sum(abs(error) for error in errors) / count
    rmse = math.sqrt(sum(error * error for error in errors) / count)
    bias = sum(errors) / count

    r2: Optional[float] = None
    if count >= 2:
        reference_mean = sum(references) / count
        total_sum_squares = sum(
            (reference - reference_mean) ** 2 for reference in references
        )
        if total_sum_squares > 0:
            residual_sum_squares = sum(error * error for error in errors)
            r2 = 1.0 - residual_sum_squares / total_sum_squares

    return {
        "n": count,
        "mae": _rounded(mae),
        "rmse": _rounded(rmse),
        "bias": _rounded(bias),
        "r2": _rounded(r2),
    }


def split_rows_by_farm(
    rows: Sequence[Mapping[str, Any]], seed: str = DEFAULT_SPLIT_SEED
) -> Dict[str, List[Mapping[str, Any]]]:
    """Split rows by farm with stable hashing and no farm crossing splits.

    Farms are ranked by SHA-256(seed + farm_id), then assigned approximately
    60/20/20 as whole groups.  Very small inputs remain usable: one farm is
    train-only, and two farms produce train/test with an empty validation
    split.  The report makes those small-input limitations visible.
    """

    farm_ids = sorted({str(row["farm_id"]) for row in rows})
    ranked_farms = sorted(
        farm_ids,
        key=lambda farm_id: hashlib.sha256(
            f"{seed}\0{farm_id}".encode("utf-8")
        ).hexdigest(),
    )

    if len(ranked_farms) <= 1:
        test_farms: List[str] = []
        validation_farms: List[str] = []
        train_farms = ranked_farms
    elif len(ranked_farms) == 2:
        test_farms = ranked_farms[:1]
        validation_farms = []
        train_farms = ranked_farms[1:]
    else:
        test_count = max(1, len(ranked_farms) // 5)
        validation_count = max(1, len(ranked_farms) // 5)
        test_farms = ranked_farms[:test_count]
        validation_farms = ranked_farms[test_count : test_count + validation_count]
        train_farms = ranked_farms[test_count + validation_count :]

    farm_to_split = {
        farm_id: "test" for farm_id in test_farms
    }
    farm_to_split.update({farm_id: "validation" for farm_id in validation_farms})
    farm_to_split.update({farm_id: "train" for farm_id in train_farms})

    split_rows: Dict[str, List[Mapping[str, Any]]] = {
        split_name: [] for split_name in SPLIT_NAMES
    }
    for row in rows:
        split_rows[farm_to_split[str(row["farm_id"])]].append(row)
    for split_name in SPLIT_NAMES:
        split_rows[split_name].sort(key=lambda row: str(row["sample_id"]))
    return split_rows


def _paired_values(
    rows: Iterable[Mapping[str, Any]], sensor_column: str, lab_column: str
) -> Tuple[List[float], List[float]]:
    predictions: List[float] = []
    references: List[float] = []
    for row in rows:
        sensor = row[sensor_column]
        lab = row[lab_column]
        if sensor is not None and lab is not None:
            predictions.append(sensor)
            references.append(lab)
    return predictions, references


def _fit_linear(
    predictions: Sequence[float], references: Sequence[float]
) -> Tuple[float, float]:
    """Fit reference = intercept + slope * sensor using least squares."""

    if len(predictions) < 3:
        raise CalibrationError("at least 3 paired train rows are required for calibration")
    sensor_mean = sum(predictions) / len(predictions)
    reference_mean = sum(references) / len(references)
    denominator = sum((value - sensor_mean) ** 2 for value in predictions)
    if denominator == 0:
        raise CalibrationError("cannot fit calibration with constant sensor values")
    numerator = sum(
        (sensor - sensor_mean) * (reference - reference_mean)
        for sensor, reference in zip(predictions, references)
    )
    slope = numerator / denominator
    intercept = reference_mean - slope * sensor_mean
    return _rounded(intercept) or 0.0, _rounded(slope) or 0.0


def build_report(input_path: Path, fit_calibration: bool = False) -> Dict[str, Any]:
    """Build a JSON-serializable report from a validated reference CSV."""

    rows = load_reference_csv(Path(input_path))
    split_rows = split_rows_by_farm(rows)

    farm_ids = sorted({row["farm_id"] for row in rows})
    split_groups = {
        split_name: sorted({row["farm_id"] for row in split_rows[split_name]})
        for split_name in SPLIT_NAMES
    }
    split_sample_ids = {
        split_name: [row["sample_id"] for row in split_rows[split_name]]
        for split_name in SPLIT_NAMES
    }

    baseline: Dict[str, Any] = {}
    calibration: Dict[str, Any] = {
        "requested": fit_calibration,
        "fit_split": "train",
        "targets": {},
    }

    for target_name, (sensor_column, lab_column) in TARGET_COLUMNS.items():
        all_predictions, all_references = _paired_values(rows, sensor_column, lab_column)
        baseline[target_name] = {
            "sensor_column": sensor_column,
            "lab_column": lab_column,
            "available": bool(all_predictions),
            "metrics": calculate_metrics(all_predictions, all_references),
            "by_split": {
                split_name: calculate_metrics(
                    *_paired_values(split_rows[split_name], sensor_column, lab_column)
                )
                for split_name in SPLIT_NAMES
            },
        }

        train_predictions, train_references = _paired_values(
            split_rows["train"], sensor_column, lab_column
        )
        calibration_target: Dict[str, Any] = {
            "sensor_column": sensor_column,
            "lab_column": lab_column,
            "n_train": len(train_predictions),
        }
        if not fit_calibration:
            calibration_target["status"] = "not_requested"
        elif len(train_predictions) < 3:
            calibration_target["status"] = "not_fitted"
            calibration_target["reason"] = (
                "requires at least 3 paired train rows; "
                f"found {len(train_predictions)}"
            )
        else:
            try:
                intercept, slope = _fit_linear(train_predictions, train_references)
            except CalibrationError as exc:
                calibration_target["status"] = "not_fitted"
                calibration_target["reason"] = str(exc)
            else:
                calibration_target.update(
                    {
                        "status": "fitted",
                        "intercept": intercept,
                        "slope": slope,
                        "metrics": {},
                    }
                )
                for split_name in SPLIT_NAMES:
                    sensor_values, lab_values = _paired_values(
                        split_rows[split_name], sensor_column, lab_column
                    )
                    calibrated_values = [
                        intercept + slope * sensor for sensor in sensor_values
                    ]
                    calibration_target["metrics"][split_name] = calculate_metrics(
                        calibrated_values, lab_values
                    )
        calibration["targets"][target_name] = calibration_target

    return {
        "report_version": 1,
        "data_status": DATA_STATUS,
        "schema": {
            "required_columns": list(REQUIRED_COLUMNS),
            "targets": {
                target: {"sensor": columns[0], "lab": columns[1]}
                for target, columns in TARGET_COLUMNS.items()
            },
        },
        "summary": {
            "row_count": len(rows),
            "farm_count": len(farm_ids),
            "farm_ids": farm_ids,
            "sample_types": sorted({row["sample_type"] for row in rows}),
        },
        "split": {
            "strategy": "deterministic_farm_group_sha256",
            "group_column": "farm_id",
            "seed": DEFAULT_SPLIT_SEED,
            "requested_fraction": {"train": 0.6, "validation": 0.2, "test": 0.2},
            "groups": split_groups,
            "sample_ids": split_sample_ids,
            "row_counts": {
                split_name: len(split_rows[split_name]) for split_name in SPLIT_NAMES
            },
        },
        "baseline": baseline,
        "calibration": calibration,
    }


def write_report(report: Mapping[str, Any], output_path: Path) -> None:
    """Write stable, finite JSON and create a missing output directory."""

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n",
            encoding="utf-8",
        )
    except (OSError, TypeError, ValueError) as exc:
        raise CalibrationError(f"cannot write output JSON '{output_path}': {exc}") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate a reference CSV and write a transparent calibration report."
    )
    parser.add_argument("--input", required=True, type=Path, help="reference CSV path")
    parser.add_argument("--output", required=True, type=Path, help="JSON report path")
    parser.add_argument(
        "--fit-calibration",
        "--fit",
        dest="fit_calibration",
        action="store_true",
        help="fit train-only univariate coefficients when a target has at least 3 paired rows",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.input.resolve() == args.output.resolve():
            raise CalibrationError("--input and --output must be different files")
        report = build_report(args.input, fit_calibration=args.fit_calibration)
        write_report(report, args.output)
    except CalibrationError as exc:
        print(f"calibrate.py: error: {exc}", file=sys.stderr)
        return 2
    print(f"Calibration report written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

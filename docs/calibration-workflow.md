# Calibration workflow: transparent demo scaffold

This document describes the small, offline calibration scaffold in
`tools/calibration/`. It is intended for today's AI prototype demonstration.
It makes the data boundary and calculations visible without changing the
backend, frontend, firmware, or app dependencies.

## Demo status and data boundary

`tools/calibration/sample_reference.csv` is **synthetic demo data**. It is not
real laboratory data, does not represent any farm, and must not be used for
field decisions. The CLI places
`data_status=synthetic_demo_not_for_field_use` in every JSON report, including
reports generated from another input file. A report from this scaffold is
evidence that the workflow runs; it is not evidence that the app is accurate.

The CSV contains paired sensor/NIR readings and reference-like values for
moisture, protein, fiber, and pH. The columns are:

```text
sample_id,farm_id,sample_type,moisture_sensor,moisture_lab,protein_nir,protein_lab,fiber_nir,fiber_lab,ph_sensor,ph_lab
```

The tool uses only Python's standard library. It never calls a network, does
not import the app, and writes only the requested report path.

## What the demo CLI does

`calibrate.py`:

1. Checks the required header and row shape.
2. Rejects blank identifiers, duplicate `sample_id` values, invalid numbers,
   and nonfinite numbers such as `NaN` or `inf`.
3. Sorts by `sample_id` for stable processing.
4. Assigns complete `farm_id` groups to train, validation, or test using a
   deterministic SHA-256 ranking. A farm cannot occur in more than one split,
   so samples from one farm cannot leak across the split boundary.
5. Reports baseline sensor/NIR-versus-lab MAE, RMSE, signed bias
   (`prediction - reference`), and R2 for every target with available pairs.
6. Optionally fits a separate univariate least-squares model per target on
   train pairs only. A target is fitted only when it has at least three paired
   train rows and non-constant sensor values. The model is:

   ```text
   calibrated_lab_estimate = intercept + slope * sensor_or_nir_value
   ```

   Validation and test metrics for a fitted coefficient are reported
   separately. Coefficients are not connected to the application.

## Run the synthetic demonstration

From the repository root:

```bash
python3 tools/calibration/calibrate.py \
  --input tools/calibration/sample_reference.csv \
  --output /tmp/nutriscan-calibration-demo.json \
  --fit-calibration
```

Inspect the JSON report:

```bash
python3 -m json.tool /tmp/nutriscan-calibration-demo.json
```

To validate and report baseline metrics without fitting coefficients, omit
`--fit-calibration` (the short alias `--fit` is also accepted):

```bash
python3 tools/calibration/calibrate.py \
  --input tools/calibration/sample_reference.csv \
  --output /tmp/nutriscan-calibration-baseline.json
```

Run the focused tests with:

```bash
python3 -m unittest discover -s tools/calibration -p 'test_*.py' -v
```

No package installation is needed.

## Real collection protocol before calibration

Replace the demo CSV only with a controlled, versioned collection dataset.
Before any model or coefficient is considered for field use:

1. **Define the measurement contract.** Freeze sample types, units, moisture
   basis (wet or dry), allowable ranges, sensor/NIR firmware and preprocessing
   versions, lab methods, and the model target definitions.
2. **Create traceable samples.** Assign an immutable `sample_id` at collection
   and record farm, field or storage location, batch/lot, collection time,
   operator, device serial, sensor settings, sample type, environmental
   conditions, and handling events. Keep the raw instrument output and a
   checksum or immutable object reference.
3. **Use representative variation.** Collect across farms, feed varieties,
   seasons, moisture/protein/fiber/pH ranges, storage states, devices, and
   operators that the intended product will encounter. Plan repeated samples
   and duplicate readings to quantify repeatability.
4. **Standardize the physical sample.** Use a written sampling plan, clean
   containers, mixing/homogenization instructions, temperature and time limits,
   and a chain-of-custody record. Record whether the sensor and lab aliquot
   came from the same homogenized material.
5. **Measure with the field device before shipment.** Capture the exact raw
   sensor/NIR observations and metadata that the deployed workflow will have;
   do not hand-pick a reading after seeing the lab result.

## Laboratory ground truth

The lab reference must come from a qualified laboratory using documented,
validated methods appropriate to the sample type. Request the laboratory
method, units and basis, instrument/QC status, analyst or run identifier,
replicate results, detection/quantification limits where applicable, and test
time. Map every result back to the original immutable `sample_id`; never join
lab rows by row order or by an informal sample description.

Record sample receipt, storage, preparation, and time from field collection to
analysis. Define rules before looking at model performance for rejected,
contaminated, insufficient, out-of-range, or failed-QC samples. Preserve raw
lab reports and an audit trail for corrections. Resolve unit and basis
conversions once in a documented preprocessing step; do not silently mix wet-
and dry-matter results.

## Split design and leakage controls

Do not randomly distribute rows from the same real-world source across all
sets. Create the split assignment before fitting and retain it with the data
release:

- **Train:** fit preprocessing and coefficients/models.
- **Validation:** choose model form, transformations, thresholds, and tuning
  decisions. It must not influence the final test result.
- **Test:** one locked final estimate, opened only after the model and
  acceptance criteria are fixed.

Group by the strongest shared source of dependence. At minimum, keep every
farm together; when a batch/lot, animal, field, storage stack, device session,
or near-time collection can create correlated rows, group or time-block those
as well. For deployment claims, use a held-out farm and, where the product
will face drift, a later time window. Never let duplicate aliquots, repeat
instrument scans, or lab replicates cross a group boundary. Fit scalers,
imputation values, feature selection, and calibration coefficients on train
only, then apply the frozen transform to validation and test.

The demo uses `farm_id` grouping and a deterministic seed solely to show this
no-leakage behavior. Its six synthetic farm groups are not a statistically
adequate validation design.

## Acceptance metrics and review

Choose thresholds before evaluating the locked test set with domain experts.
At minimum report, by target and split:

- sample count and coverage/missingness;
- MAE, RMSE, signed bias, and R2 with confidence intervals where feasible;
- error by farm, batch, time period, sample type, device, and relevant value
  range;
- repeatability/reproducibility and lab uncertainty;
- clinically or operationally important threshold sensitivity, specificity,
  false-negative rate, and false-positive rate when decisions use thresholds;
- calibration/uncertainty coverage if the product exposes confidence.

Metrics should meet an agreed domain-specific tolerance on the locked test set,
not merely improve over the synthetic baseline. Review plots and outliers,
confirm that failures are not hidden by exclusions, and obtain sign-off from
the laboratory/domain owner and product safety reviewer. A good aggregate R2
does not authorize a feed-safety claim or replace laboratory testing.

## Contamination and contamination-like failures

Treat contamination as a data-quality and safety event. Define the sample
types and lab rules for biological, chemical, mold/mycotoxin, foreign-material,
cross-sample, container, instrument, and environmental contamination. Include
positive/negative controls and blanks when the lab method supports them.

Do not label contaminated or failed-QC samples as ordinary ground truth. Keep
them traceable, quarantine them from training until an expert decides their
status, and document exclusions with reasons. If contamination is an intended
real-world condition, collect and label it deliberately and evaluate it as its
own class or range; do not hide it through cleaning. Leakage from duplicate
aliquots or post-result data edits is also contamination of the evaluation and
must be prevented with immutable IDs, locked split manifests, access logs, and
reviewable dataset hashes.

## Demo scaffold versus validated model

| Demo scaffold | Validated model requirement |
|---|---|
| Synthetic, hand-authored rows | Traceable samples from the intended domain |
| Standard-library metrics and optional univariate fit | Locked preprocessing and documented model version |
| Deterministic farm split for demonstration | Pre-registered group/time split with held-out farms/batches |
| No uncertainty, safety claim, or app integration | Lab QC, uncertainty, subgroup analysis, and expert sign-off |
| `synthetic_demo_not_for_field_use` report status | Explicit release approval for a defined use and population |

The generated coefficients are educational artifacts. Do not copy them into
the backend or present this report as laboratory validation.

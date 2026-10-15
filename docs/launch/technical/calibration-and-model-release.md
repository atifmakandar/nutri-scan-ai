# Calibration and model release control

The application currently reports `kind=prototype_screening`,
`model_version=prototype-baseline-0.1`, `calibration_status=uncalibrated` in its
[assessment model](../../../backend/app/models.py). Its
[engine](../../../backend/app/engine.py) is a transparent formula, not a trained
field model. Device calibration, model calibration and qualification of advisory
language are **separate approvals**.

Source procedures: [calibration workflow](../../calibration-workflow.md),
[demo runbook](../../today-demo.md), [hardware integration](hardware-integration-and-wiring.md).

## 1. Lifecycle and accountable owners

| Stage | Required record / owner | Promotion gate |
| --- | --- | --- |
| Intended use | Sample types, population, outputs/units/basis, exclusions and claims; product/domain lead | Qualified expert agrees the measurement contract |
| Device qualification | Wiring, firmware/time source, sensor reference checks; hardware lead | Defined-use electrical and repeatability criteria pass |
| Collection design | Sampling plan, farm/batch/time grouping, lab methods and thresholds; calibration lead | Protocol frozen before examining performance |
| Collection + reference | Raw instrument data, custody events, lab reports/QC; field/lab leads | Traceable matched sample IDs and acceptable handling/QC |
| Dataset freeze | Version, manifest/hash, exclusions, split assignment; data steward | Reviewed provenance and leakage audit; synthetic excluded |
| Fit + validate | Train-only preprocessing/fit, validation decisions and reproducible artifacts; model lead | Predeclared criteria and independent review |
| Locked test | Held-out farms/batches/time, uncertainty and subgroup results; independent reviewer | Test opened only after design/model frozen; all approved thresholds met |
| Release | Model card, runtime integration tests, compatibility and rollback; release authority | Signed scope-specific approval and staged QA |
| Monitor / retire | Drift, reference rechecks, incidents, replacement/withdrawal record; model/calibration leads | Trigger-based revalidation and controlled retirement |

No automatic model loader, artifact registry or runtime coefficient import is
provided by the current scaffold. Promoting a future model requires an explicitly
implemented and tested application change; a JSON coefficient file alone changes
no application behavior.

## 2. Synthetic scaffold — exact demonstration commands

From the root, use an existing private temporary output directory. These commands
are instructions, not claimed results from this pack:

```bash
export CAL_DEMO_DIR="$(mktemp -d)"
python3 -m unittest discover -s tools/calibration -p 'test_*.py' -v
python3 tools/calibration/calibrate.py \
  --input tools/calibration/sample_reference.csv \
  --output "$CAL_DEMO_DIR/calibration-demo.json" \
  --fit-calibration
python3 -m json.tool "$CAL_DEMO_DIR/calibration-demo.json"
```

The CLI checks headers/row shape/IDs/finite numbers/duplicates, deterministically
splits whole farm groups using SHA-256 ranking, reports baseline MAE/RMSE/signed
bias/R², and optionally fits one univariate line per target on **train only**.
Fitting needs at least three train pairs and nonconstant input for a target.
Validation/test metrics are separate. The sample CSV has six **synthetic** farm
groups; it is not an adequate real evaluation dataset.

**Every CLI report is labelled `synthetic_demo_not_for_field_use`, even if another
input file is supplied.** Do not remove that marker, rebrand the scaffold as field
validation or paste coefficients into the backend. Keep real evaluation in a
controlled, separately approved workflow with true provenance and review.

The CLI's input header is exactly:

```text
sample_id,farm_id,sample_type,moisture_sensor,moisture_lab,protein_nir,protein_lab,fiber_nir,fiber_lab,ph_sensor,ph_lab
```

The new operational [calibration record](../templates/technical/calibration-record.csv)
and [custody record](../templates/technical/sample-chain-of-custody.csv) are **not**
drop-in inputs to that CLI. Maintain reviewed sample-ID joins and a documented
transform if exporting paired measurements to an evaluation dataset.

## 3. Provenance and laboratory reference

1. Assign immutable sample IDs at collection. Record pseudonymous farm, batch/lot,
   sample type/variety, date/time/timezone, operator, storage/handling conditions,
   device/sensor IDs, firmware, preprocessing and sampling-plan version.
2. Use the qualified sampling plan for representative subsamples, homogenization,
   clean containers, preservation, transport time/temperature and disposal. Record
   whether the field measurement and lab aliquot used the same homogenized material.
   Do not invent universal holding times: the selected lab method specifies them.
3. Preserve exact raw ADC/spectral/other output before viewing reference results,
   with immutable evidence reference and SHA-256. Record repeated readings rather
   than selecting whichever reading later agrees best with the lab.
4. Log each custody event in [sample-chain-of-custody.csv](../templates/technical/sample-chain-of-custody.csv):
   transfer parties by ID, seal/container condition, time, storage temperature,
   handling, received lab ID and related report reference. Do not join by row order.
5. Obtain results from a qualified lab using a documented validated method suitable
   for the sample/target. Capture method/version, units and wet/dry basis, receipt,
   preparation/analysis time, instrument/QC run, replicate results, uncertainty and
   detection/quantification limits where relevant, analyst/run and report checksum.
6. Predefine exclusions for failed QC, insufficient/contaminated samples, broken
   custody, unknown basis or impossible values. Quarantine such records for expert
   review, retain reasons/corrections and do not silently convert them to ground truth.
7. Resolve unit/basis conversions once in versioned preprocessing. Obtain permission
   for collection/use, minimize identifiers and follow [governance](data-governance-and-privacy.md).
   Keep a restricted ID mapping separate from analysis exports.

Sensor calibration records additionally capture reference/buffer lots/certificates,
raw counts/voltage, environmental temperature, as-found/as-left values, tolerances,
due time and reviewer. Plan pre/post-session checks and assess samples since the
last known good check if a sensor drifts or fails.

## 4. Leakage prevention and locked evaluation

- Freeze dataset hashes and a split manifest **before fitting**. Keep farms together
  at minimum; strengthen groups for shared batches/lots, storage stacks, device
  sessions, near-time sampling and related sources. Use later-time evaluation where
  intended deployment faces drift.
- Keep duplicate aliquots, repeat instrument scans and lab replicates in one group.
  Audit cross-split duplicates/raw hashes and relationships, not just sample IDs.
- Fit scalers, imputation, feature selection, preprocessing and calibration on train
  only. Choose hyperparameters/thresholds on validation; do not use test labels to
  select features, exclusions, acceptable error or model form.
- Lock final model/transform/criteria before opening test results. A test-driven
  redesign needs a new independent test set; do not relabel the same test as unseen.
- Preserve collection chronology, access history, exclusions, corrections and all
  failed experiments in reviewable controlled records. Synthetic examples, lab-result
  derived features and post-result manual edits cannot enter the real evaluation.

## 5. Model card and numeric release gates

Create a controlled card for each scoring/model/advisory release. Required fields:

| Section | Required contents |
| --- | --- |
| Identity | Release ID/version, artifact SHA-256, source/worktree digest, training/evaluation code and dependency versions, owner/reviewer/date |
| Intended use | Feed/silage domain, regions/varieties/devices/population, user decision, prohibited uses and human escalation |
| Inputs/outputs | Required measurements, units/basis/ranges, preparation/preprocessing, missing-input handling, runtime compatibility |
| Data | Collection period, sample/farm/batch counts, provenance/permission, lab methods/QC/uncertainty, dataset and split hashes, exclusions |
| Evaluation | Per-target/split/subgroup coverage, missingness, MAE/RMSE/bias/R², confidence intervals, repeatability, held-out farm/time performance |
| Decision behavior | Sensitivity/specificity/false negative/false positive rates at approved thresholds where relevant; uncertainty coverage, abstention and out-of-domain behavior |
| Limitations | Known failure modes, unsupported contaminants/claims, device/season/language limitations and operator requirements |
| Operations | Monitoring/stop triggers, reference-check cadence, artifact/config compatibility, rollback version and owner, retirement/revalidation plan |
| Approval | Lab/domain, hardware, data, QA, safety/product and release-authority decisions with evidence refs |

Before evaluating the locked test, fill and approve a gate record with **numeric**
limits per target/subgroup: minimum independent farms/batches/samples and coverage,
maximum MAE/RMSE/absolute bias, acceptable uncertainty, repeatability, and maximum
false-negative rate at relevant decision thresholds. These limits are currently
**PLACEHOLDER_UNSET** and must be set by qualified domain/lab reviewers, not invented
from the synthetic metrics. Unset or unmet required gates mean **no model promotion**.
A good aggregate R² or higher heuristic confidence is insufficient.

## 6. Staged release, monitoring and withdrawal

Run shadow evaluation against lab/reference results first, then a bounded authorized
pilot with predefined sample coverage/stop rules, then only the approved use. Retain
the prior runtime/configuration/artifact and run [QA](qa-test-plan.md), including old
record readback and report/model-version labeling. Historical saved results are not
silently recomputed on model change; any reanalysis must be a separately traceable
record/workflow.

Monitor device drift, out-of-range/missing inputs, subgroup error, reference failures,
operator overrides, safety complaints and unsupported use. Thresholds, sampling
cadence and responsible reviewer must be named in the card. On a breach, suspend
affected use/claims, identify affected device/time/model/sample ranges, preserve
evidence, refer to a qualified lab/adviser and follow the
[incident runbook](support-and-incident-runbook.md). A new sensor, firmware conversion,
lab method, season/domain expansion or preprocessing change requires impact review
and appropriate recalibration/revalidation, not a version-label-only release.

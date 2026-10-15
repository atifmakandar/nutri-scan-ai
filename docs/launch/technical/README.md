# Nutri-Scan technical and operations launch pack

Prepared against the working tree on **2026-10-15**. This is an operational
planning pack, **not a launch approval or evidence that application checks ran**.
All checklist boxes start unverified. Assign named owners and attach dated evidence
for the exact release, environment and device before changing their status.

## Current product boundary

- The API uses an explainable, **uncalibrated prototype scoring engine**. Scores,
  risk bands and confidence are screening indicators, not laboratory results,
  calibrated probabilities or feed-safety certification.
- All ten screening inputs are required. Numeric NIR/vision inputs are adapters;
  uploaded photos are private evidence, not automatic image analysis. No validated
  protein/fiber prediction or contaminant/mycotoxin detection is established.
- Farm accounts use SQLite and HttpOnly sessions with owner/member/viewer roles.
  This is an MVP; a broad production multi-tenant release requires further review.
- The ESP32 sketch defaults to **synthetic demonstration readings**, USB serial,
  unknown calibration and a manually fixed timestamp. Real sensors require validated
  integrations. Serial and voice entry propose values for explicit review only.
- Offline drafts work in an already-loaded signed-in app and need explicit sync.
  The production PWA's offline reload provides **public help only**, not farm history,
  private attachments or authenticated offline workflows. Drafts discard instrument
  provenance. Testing requests and reminders are farm-local records, not lab bookings
  or SMS services.

## Documents and operating order

| Document | Use / accountable role |
| --- | --- |
| [Technical readiness checklist](technical-readiness-checklist.md) | Establish scope, owners and evidence; release lead |
| [Deployment runbook](deployment-runbook.md) | Dev, staging, HTTPS deployment, backup, migration and rollback; operations |
| [Hardware integration and wiring](hardware-integration-and-wiring.md) | Serial contract, electrical review and device records; hardware lead |
| [QA test plan](qa-test-plan.md) | Regression, acceptance, target-device and field pilot gates; QA lead |
| [Calibration and model release](calibration-and-model-release.md) | Sample/lab provenance, leakage controls and release criteria; calibration lead |
| [Data governance and privacy](data-governance-and-privacy.md) | Access, retention, deletion, backup and incident operations; data steward |
| [Support and incident runbook](support-and-incident-runbook.md) | Triage, containment, recovery and escalation; support/on-call lead |
| [Risk register](risk-register.md) | Product, technical, safety and business decisions; release lead |
| [Field operator SOP](field-operator-sop.md) | Preflight, sample handling, capture, review and handover; field lead |
| [Production launch checklist](production-launch-checklist.md) | Final go/no-go and monitored handover; release authority |

Start with readiness, rehearse deployment and QA in staging, resolve the risk
register, then complete the final launch checklist. Use the field SOP for every
pilot visit and the incident runbook when evidence or safety is in doubt.

## CSV templates

These are **manual operational records**, not API import files or the calibration
CLI's input schema. Each has a header and one `placeholder_not_for_use` row; remove
that row in a controlled operational copy before recording real activity. Blank
timestamps/measurements mean **not recorded**, never zero, passed or calibrated.

| Template | Row meaning and key |
| --- | --- |
| [calibration-record.csv](../templates/technical/calibration-record.csv) | One reference point/check per device sensor; `calibration_record_id` + `point_id` |
| [device-inventory.csv](../templates/technical/device-inventory.csv) | One physical board/instrument; stable `device_id` |
| [qa-test-results.csv](../templates/technical/qa-test-results.csv) | One execution of one test; `run_id` + `test_case_id` |
| [incident-log.csv](../templates/technical/incident-log.csv) | One incident summary, with timeline in restricted evidence; `incident_id` |
| [sample-chain-of-custody.csv](../templates/technical/sample-chain-of-custody.csv) | One collection/transfer/receipt/analysis event; `sample_id` + `event_id` |

### Record conventions

- UTF-8, comma-delimited, one header; quote text containing commas/newlines/quotes.
  Preserve headers when copying. Treat spreadsheet formula-like text as text rather
  than executing it. No passwords, cookies, keys, raw personal contacts or full farm
  reports in these repository templates.
- `data_status`: `placeholder_not_for_use`, `synthetic_demo_not_for_field_use`, or
  `real_field_record`. Real status describes origin, **not validation or approval**.
  Keep synthetic and real collections in separate controlled files/releases.
- `*_at` and `due_at`: timezone-aware ISO 8601; calendar dates: `YYYY-MM-DD`.
  `*_pct`: percent; `temperature_c`: degrees Celsius. Record wet/dry basis explicitly.
  Numeric cells are finite decimal numbers or blank; do not use `NaN`, `inf` or `0`
  to fill a missing measurement. SHA-256 fields hold the lowercase 64-digit digest
  of the referenced artifact when available.
- IDs and `*_ref` fields point to restricted records; use pseudonymous farm/operator
  IDs. Evidence references must resolve for reviewers without making files public.
- QA `status`: `not_run|pass|fail|blocked|not_applicable`; a pass requires actual
  results/evidence and executor/time. Calibration `result`: `pending|pass|fail`;
  protocol calibration states remain `unknown|reported_current|reported_expired`.
- Inventory `mode`: `demo|real_pending_validation|validated_for_defined_use`;
  inventory `status`: `not_in_service|in_service|quarantined|retired`.
  Incident `status`: `open|contained|monitoring|closed`; severity follows the
  [incident runbook](support-and-incident-runbook.md). Custody `event_type`:
  `collection|transfer|receipt|preparation|analysis|disposal`.

## Source of truth and reconciliation

Read these existing sources alongside the pack:

1. [Project README](../../../README.md): current scope, accounts and normal commands.
2. [Same-day demo](../../today-demo.md): emulator/ESP32 demonstration and its limits.
3. [Fieldwork verification](../../fieldwork-verification.md): **previously reported**
   checks and remaining real-device gaps, not a result from this documentation task.
4. [Fieldwork contract](../../fieldwork-contract.md): private routes, attachment
   limits, observation/request state machines and current PWA boundary.
5. [ESP32 README](../../../firmware/esp32/README.md): serial and sensor hooks.
6. [Calibration workflow](../../calibration-workflow.md): synthetic scaffold and
   requirements for real reference data.
7. [Backend operations](../../../backend/README.md), [architecture](../../architecture.md)
   and [farmer usability](../../farmer-usability.md): supporting context.

Some earlier architecture/usability text predates the fieldwork PWA extension.
For installation/offline behavior use the current fieldwork contract and PWA
implementation: public offline help exists; private offline reload does not.
The README's legacy analyze route is authenticated today; the default ESP32 sketch
does not POST to it. [Deployment](deployment-runbook.md) records the current runtime
configuration, including always-present localhost origins and SameSite=Lax limits.

## Evidence and placeholders

`PLACEHOLDER_*`, `.example.invalid` hostnames and sample service/path names are
operator substitutions, never existing infrastructure or credentials. Commands
are instructions to run in the stated directory with pre-existing dependencies;
their inclusion does not mean they were executed. No default account, API key,
model registry, automated retention job or production service unit is supplied.

Record a release ID, source revision **and working-tree/artifact digest**, backend
and frontend artifact digests, configuration revision (redacted), device/firmware
versions, QA results and named approvals in a restricted release evidence location.
A Git revision alone cannot identify a build made with uncommitted changes.

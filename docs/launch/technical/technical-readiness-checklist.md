# Technical readiness checklist

**Status: unassessed.** Every item below needs an owner, date, evidence reference and
decision in the release record. Use [QA results](../templates/technical/qa-test-results.csv)
for executed checks. Missing evidence is `not_run` or `blocked`, never a pass.

## 1. Scope and ownership — release lead

- [ ] Select scope: synthetic demo, restricted real-data pilot, or broader production.
  State farms, users, languages, sample types, devices and permitted claims.
- [ ] Assign release, operations, QA, hardware, calibration, data, field and support
  leads plus backups and an out-of-band contact route. Fill actual support hours.
- [ ] Record the exact build/source/configuration and approved rollback artifacts.
  Preserve unrelated working-tree work; do not deploy an unidentified dirty tree.
- [ ] Confirm the uncalibrated-prototype statement is visible in onboarding, saved
  results, reports, share previews, demo scripts and operator training.
- [ ] Explicitly exclude lab equivalence, certified contaminants and automated photo
  diagnosis until the [calibration gates](calibration-and-model-release.md) are met.
- [ ] Review [risks](risk-register.md); document residual risk owners and expiry dates.

## 2. Hosting and persistence — operations lead

- [ ] Rehearse [deployment](deployment-runbook.md) in an isolated staging database.
  Dev Compose and Vite preview are not production process management.
- [ ] Use HTTPS with a valid certificate, root-path PWA hosting, restricted backend
  network access and explicit trusted reverse-proxy settings.
- [ ] Verify `NUTRI_SCAN_COOKIE_SECURE=true`, allowed frontend origins and actual
  cookie behavior in deployed browsers. No wildcard credentialed CORS.
- [ ] Review always-added localhost origins, server-own-origin acceptance and
  SameSite=Lax constraints; edge controls and topology must match the approved scope.
- [ ] Use an absolute `NUTRI_SCAN_DB` on durable local storage with restricted access;
  confirm free space, attachment growth, SQLite writer load and restart persistence.
- [ ] Complete consistent encrypted backups, checksum/integrity checks, restore
  drill and migration rehearsal including first fieldwork access (lazy table creation).
- [ ] Approve numeric RPO/RTO and backup schedule. Proposed defaults in
  [governance](data-governance-and-privacy.md) require actual operational evidence.
- [ ] Provide an owned service supervisor, TLS renewal, monitoring and alert routing.
  `/health` alone does not prove DB readability, capacity or authenticated writes.

## 3. Identity and privacy — data/security lead

- [ ] Verify owner/member writes, viewer read-only, cross-farm isolation, trusted
  Origin checks and private `no-store` responses, including errors/attachments.
- [ ] Confirm there is no default account or embedded credential. Keep runtime
  configuration and protected TLS/backup credentials out of builds and logs.
- [ ] Resolve public registration, account withdrawal, password recovery and session
  revocation for the chosen scope. These administrative workflows are incomplete
  in the MVP; use a documented restricted-pilot procedure or block broader launch.
- [ ] Approve the retention/access/deletion policy, local draft/shared-device handling,
  sharing education and restore-time deletion reconciliation.
- [ ] Assess trusted PDF handling (basic validation is not malware scanning), logging
  redaction and optional browser speech-provider processing.

## 4. Hardware and data validity — hardware/calibration leads

- [ ] Complete [wiring review](hardware-integration-and-wiring.md) against the exact
  ESP32 board/module datasheets; no raw pH probe or 5 V ADC connection.
- [ ] Record [inventory](../templates/technical/device-inventory.csv), firmware digest,
  pins, voltage limits, time source and sensor IDs for each device.
- [ ] Mark demo units and synthetic data unmistakably. Do not treat `DEMO_MODE=false`
  as validated; moisture/pH conversions are placeholders and temperature/humidity
  hooks need implementation before real measurement.
- [ ] Record reference checks, calibration intervals/tolerances and signed results
  using [calibration records](../templates/technical/calibration-record.csv).
- [ ] Test real port permission, unplug/reconnect, invalid frames, timeout, partial
  readings and reviewed-only application on actual target devices.
- [ ] Establish sample/lab chain of custody and immutable raw records for any
  accuracy evaluation. Synthetic scaffold metrics cannot approve field use.

## 5. Product and field operation — QA/field leads

- [ ] Execute [regression and acceptance tests](qa-test-plan.md) for the candidate;
  retain outputs and discrepancies without importing historical pass counts.
- [ ] Verify all ten inputs, saved-record reports, batch/sample separation, photos,
  QR authentication and explicit idempotent offline sync.
- [ ] Verify observation-only records have no score; requests do not imply lab
  booking; reminders have no SMS/background delivery promise.
- [ ] Verify built PWA update/rollback, public-only Cache Storage and offline help
  in English/Hindi/Marathi. Private responses must remain network-only.
- [ ] Demonstrate the loss of device/time/calibration provenance through draft
  save/load and define a traceable manual fallback for field sessions.
- [ ] Obtain qualified review of translated safety guidance and target-device
  readability/voice behavior; mocked browser speech does not prove a real microphone.
- [ ] Train operators with the [SOP](field-operator-sop.md), escalation script and
  sample handling plan. Unknown observations and absent measurements stay unknown.

## 6. Decision

The release authority records `go|restricted_go|no_go`, permitted scope, blocked
items and next review date. Safety, farm isolation, durable data/restore and
required QA failures are **no-go** for real-data operation. An approved synthetic
demo does not approve a field pilot. A pilot does not approve laboratory or safety
claims. Complete the [production checklist](production-launch-checklist.md) for
the actual cutover and handover.

Source baseline: [README](../../../README.md), [fieldwork contract](../../fieldwork-contract.md),
[verification/gaps](../../fieldwork-verification.md), [ESP32](../../../firmware/esp32/README.md).

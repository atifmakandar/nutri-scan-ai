# Field operator standard operating procedure

Use for an **authorized pilot or clearly labelled synthetic demonstration**.
The field lead supplies the approved sampling method, qualified adviser/lab contacts
and support route before travel. Nutri-Scan is an uncalibrated screening prototype;
neither a low-risk score nor a photo establishes that feed/silage is safe.

Source workflows: [same-day demo](../../today-demo.md),
[fieldwork contract](../../fieldwork-contract.md),
[farmer usability](../../farmer-usability.md) and
[hardware instructions](hardware-integration-and-wiring.md).

## 1. Preflight and start-of-shift record

- Confirm scope (demo versus real pilot), site permission, operator training and
  support/qualified adviser availability. Record date/time/timezone, release,
  operator ID and weather/storage conditions as needed by the sampling plan.
- Confirm phone/browser/USB support, charged equipment, reachable HTTPS app and
  correct individual account/farm. Owner/member can submit; viewer can only read.
  Do not share accounts or store passwords in notes/templates.
- Inspect electronics, leads, enclosure and clean sample-contact surfaces. Do not
  modify powered wiring, attach raw pH probes or put a 5 V output on ESP32 ADC.
- Check device ID, firmware/mode, real time source and calibration/reference records
  against [inventory](../templates/technical/device-inventory.csv). Perform the
  approved reference check and record it in
  [calibration-record.csv](../templates/technical/calibration-record.csv).
- If reference checks fail, calibration is unverified/expired, equipment is damaged
  or capture time is stale, stop using that instrument for real measurements. Record
  the issue and use a qualified alternative or observation-only workflow.
- For a demo, label devices, batch IDs and every associated file **synthetic demo —
  not field/lab measurements**. Default ESP32/emulator numbers cannot populate real
  farm records. The serial wire has no demo flag, so the external label is essential.

## 2. Identify the batch and take a representative sample

1. In **Farm fieldwork**, create/select the exact feed/silage batch. Record human
   batch ID, name/location and known preparation/opening dates/quantity. Do not
   guess dates, invent expiry or convert quantity units silently. Batch identity
   (ID + sample type) is immutable after creation; fix errors through the field lead.
2. Assign immutable sample ID(s), including aliquot relationships, **before**
   measurement. Follow the qualified plan for representative subsamples, mixing,
   clean containers, preservation/transport limits and protective equipment.
   Do not taste or deliberately inhale suspect material.
3. Record collection and each handover/receipt/preparation/analysis event in
   [sample-chain-of-custody.csv](../templates/technical/sample-chain-of-custody.csv).
   Include timezone-aware time, sample/batch/device/operator IDs, seal/condition,
   storage temperature/handling and restricted evidence reference. Keep the actual
   ID mapping private. Unknown conditions remain explicitly unknown/blank.
4. Clean equipment between samples per method to prevent carryover. If handling,
   contamination or custody is uncertain, quarantine the record/sample for qualified
   review; never “correct” readings after seeing a lab report.

## 3. Choose observation or full screening

**Observation only:** choose **Quick observations**, answer visible mould, unusual
heat, unusual smell and cover damage as Yes/No/Unknown. Leave unknown as Unknown,
save and confirm **Observation only — no screening score**. Add private evidence if
authorized. Concerning/unknown observations require qualified follow-up, not an
invented numeric diagnosis.

**Full screening:** **Use this batch** copies identity only, not previous readings.
The four steps are sample → batch → readings → review/submit. All ten inputs are
required; incomplete readings cannot be submitted or saved as complete-reading drafts:

| Input group | What to enter |
| --- | --- |
| Storage/sensor | Moisture %, pH, temperature °C, humidity % from suitable measured methods |
| Nutrient | Protein %, dry matter %, crude fiber % from a suitable report/instrument with known basis |
| Visual prototype inputs | `mold_score`, `color_anomaly`, `surface_damage`, each 0–1 from the trained operator's approved scoring method; a photo does not generate these automatically |

Use **How to measure…** and language/listening help, but do not replace the approved
method with a guessed value. Missing is not zero. If any required actual value or
validated scoring method is unavailable, use observation-only tracking and arrange
qualified measurement/testing instead of filling demo values.

## 4. Optional instrument/voice capture

1. For a validated serial device, close the serial monitor, connect safely and open
   **Read from instrument (USB serial)** on reading step 3. Supported Chromium needs
   HTTPS/localhost, user permission, the documented JSON protocol and 115200 baud.
2. Explicitly choose the port, review device/time/calibration/reference/units/values,
   select only trustworthy readings, acknowledge review and confirm. Calibration
   status is reported by the device, not verified by the app.
3. On timeout, denied permission, unplug or invalid output, record the failure and
   continue with a measured manual alternative. The app neither commands the device
   nor submits a scan automatically. A new capture replaces prior provenance; edits
   to captured values remove their provenance.
4. Voice is optional and requires microphone consent. Review every proposed value;
   browser speech may use a network/provider service. Nutri-Scan does not save audio.
   Typed entry remains available. Listening/recognition on real devices can differ
   from software mocks and draft translated safety guidance needs expert review.

## 5. Final review, save and interpretation

- Compare every value/unit/basis to the actual measurement record, plus batch/sample,
  capture time/source and any device provenance. Correct mistakes **before** final
  confirmation; edits invalidate the prior confirmation.
- Submit once when online. Wait for the saved result/scan ID, then refresh history
  and confirm readback. A spinner/error is not proof that the scan was saved; inspect
  history before repeating an uncertain submission. Record sample-to-scan linkage
  in the controlled field record.
- Read saved advisories and prototype status. Never certify safety or change feeding
  decisions solely because of score/confidence. If spoilage, unusual heat/smell,
  suspect material or conflicting lab results are reported, stop using the affected
  screening as assurance and contact the qualified adviser/lab under the site plan.
- Photos are optional private evidence, not diagnosis: up to five JPEG/PNG/WebP,
  each <=5 MiB. Avoid identifying bystanders/locations and upload only with authority.

## 6. Offline, drafts and retry

- In an **already-open signed-in app**, complete actual readings, choose **Save
  draft**, then **Queue** if an upload is intended. Unsaved edits are not saved.
  Reconnection alone does not upload; press **Sync now** explicitly while signed in
  with permission for the same farm.
- Check draft/queue counts, last confirmed queued upload and saved history. Failed
  uploads keep actionable state; a 409 needs history/support review before changes.
  Do not create a new request ID just to force an ambiguous queued item through.
- **Drafts retain readings but discard instrument device/time/calibration provenance.**
  Keep an independent protected measurement/custody log. If provenance is required,
  use direct online capture/submission under the approved plan or escalate; never
  claim draft sync retained it. Incomplete readings need a protected field record,
  not invented values to satisfy draft validation.
- An offline reload of the installed PWA shows **public help only**. Farm history,
  fieldwork writes, reports/photos and authenticated reload need reconnection.
  Do not clear browser/site storage or accept disruptive updates with unresolved
  local work. Follow the field lead's approved backup/reconciliation procedure.

## 7. Follow-up, reports and sharing

- Create an in-app reminder and check it manually; it sends no SMS or background
  alert. Complete/reopen it as actual work progresses.
- For testing help, contact the chosen qualified provider **outside the app**,
  confirm method/handling/time/price yourself and record only necessary contacts.
  The saved request is local tracking, not a booked lab service. Mark collected with
  the actual date; upload a trusted report (PDF <=10 MiB or supported photo, max five)
  before marking report received. Do not treat basic PDF validation as malware scanning
  or an uploaded report as automatically interpreted by Nutri-Scan.
- Download saved-result HTML; use browser Print/Save PDF if needed. Reports include
  farm identifiers and reproduce saved readings, not later form edits. Review before
  sharing. Use the preview-first summary and verify recipient/identity/photo choices;
  identity/photos are off by default. Text actions do not send private photo URLs.
- Batch QR routes require sign-in and grant no access. A localhost QR cannot serve
  another phone; use the approved reachable HTTPS deployment.

## 8. End-of-shift handover and stop conditions

Reconcile samples, custody events, scans, device checks, drafts/queues, reminders,
testing requests and lab handovers with the field lead. Confirm every purported saved
record by readback, note unresolved items and retain only approved protected evidence.
Perform any required post-session reference check; a failure triggers review of
samples since the last known good check. Clean/store equipment per method.

Resolve/retain unsynced work before deleting drafts. Log out, secure the device,
protect downloads/print copies and follow [retention/privacy](data-governance-and-privacy.md);
logout alone does not erase local drafts or exported files. Record device returns,
remaining battery/damage and next calibration/referral tasks.

**Stop and escalate** unsafe wiring, failed reference checks, unknown sample identity,
privacy exposure, data loss or potentially harmful interpretation through
[support/incidents](support-and-incident-runbook.md). Record time, scope and observed
facts; do not ask the farmer to treat a prototype score as confirmation of safety.

# Production launch and monitored handover checklist

**Initial decision: not assessed / no approval recorded.** This checklist does not
convert the MVP into a production multi-tenant service. Distinguish a synthetic demo,
a restricted pilot and broader production; approval applies only to the recorded
scope. Every checked item needs named owner/date/evidence in the release record.

## Release record — fill before review

| Field | Required value |
| --- | --- |
| Release ID / candidate | PLACEHOLDER_RELEASE_ID; source revision plus working-tree/artifact digest |
| Scope / environment / URL | PLACEHOLDER_SCOPE; authorized farms/users/devices/sample types/languages; HTTPS origin |
| Backend / frontend / config | PLACEHOLDER_ARTIFACT_DIGESTS; redacted config revision; DB/schema pairing |
| Firmware / sensors / model | PLACEHOLDER_VERSIONS; demo/real status, calibration refs; current model is uncalibrated prototype |
| Cutover window / rollback artifact | PLACEHOLDER_TIME_WITH_TIMEZONE; previous known-good artifact/DB/backup refs |
| Named accountable people | PLACEHOLDER_RELEASE_AUTHORITY; operations, QA, hardware/calibration, data, domain, field, support and backups |
| Evidence location / support hours | PLACEHOLDER_RESTRICTED_EVIDENCE_REF; staffed hours and out-of-band escalation |

## Before the cutover window

### Product, safety and field ownership — product/domain/field leads

- [ ] [Readiness](technical-readiness-checklist.md) completed for the exact scope;
  unresolved items and [risk register](risk-register.md) have named dispositions.
- [ ] Prototype/lab-replacement limits verified in UI, exports, sharing, training and
  launch script. No unsupported feed-safety, nutrient accuracy or contaminant claims.
- [ ] If releasing a calibrated model, [model/data/lab gates](calibration-and-model-release.md)
  have approved numeric limits, locked real evaluation evidence and signed card.
  Otherwise retain explicit uncalibrated status; synthetic metrics authorize no claims.
- [ ] Target hardware wiring, actual sensor hooks/time source, inventory and reference
  checks approved. Demo units/data unmistakably separated from real pilot records.
- [ ] [Operator SOP](field-operator-sop.md) rehearsed; qualified adviser/provider contacts
  and actual sampling/handling limits available; translation safety review completed.
- [ ] Local-only requests/reminders and public-only offline reload explained; no
  promised lab booking, SMS, private offline history or draft provenance retention.

### Deployment, identity and data — operations/data leads

- [ ] Candidate artifacts/configuration identified and staging rehearsal completed
  under the [deployment runbook](deployment-runbook.md); actual services/owners known.
- [ ] HTTPS/certificate renewal, DNS, root-path static assets and proxy forwarding
  verified. API not directly public; `NUTRI_SCAN_COOKIE_SECURE=true` and exact origins
  set; deployed cookie login/reload/logout exercised on target browsers.
- [ ] Always-present dev origins, SameSite=Lax and server-own-origin behavior reviewed.
  Any separate-origin topology proven; no wildcard CORS/private CDN cache.
- [ ] Registration exposure, access withdrawal, account recovery/reset and session
  revocation procedures resolved for scope. Incomplete controls block broader launch
  or require explicitly approved restricted-pilot containment.
- [ ] Absolute durable SQLite path/permissions, disk/attachment headroom and measured
  expected load acceptable. No assumption that more workers fix SQLite/throttling.
- [ ] Latest consistent backup verified, encrypted off-host copy available, restore
  drill meets approved numeric RPO/RTO, sessions/deletion reconciliation rehearsed.
- [ ] Startup + first fieldwork lazy migration and any separate legacy assignment
  verified on a copy; prior artifact/data compatibility or restore fallback proven.
- [ ] [Governance](data-governance-and-privacy.md) retention/access/deletion schedule
  approved with actual operators/jobs; local-device/export handling and backup expiry owned.
- [ ] Runtime secrets/TLS/backup credentials restricted; no secrets in frontend,
  firmware, templates, logs or evidence; upload/PDF trust procedure confirmed.

### QA and recovery — QA/support leads

- [ ] Required [regression commands and acceptance cases](qa-test-plan.md) executed
  on the final candidate; actual results/outputs recorded, no historical counts reused.
- [ ] Cross-farm/role/Origin/private attachment/no-store gates pass. Viewer remains
  read-only. All required input and idempotent retry paths pass.
- [ ] Saved-report/download/print, batch/history, observation-only, request/reminder,
  explicit draft sync/provenance limits and field pilot smoke have evidence.
- [ ] Real-device serial permission/unplug/time/calibration and voice/manual fallback
  tested for advertised devices; unavailable tests are blocked, not passed.
- [ ] PWA install/update/explicit activation/offline help/cache privacy and rollback
  tested on the actual HTTPS host/browser matrix; coherent old hashed assets retained.
- [ ] Incident contacts/coverage, alert routing, rollback decision authority, restricted
  evidence access and [incident exercise](support-and-incident-runbook.md) confirmed.

## Cutover — operations lead with release authority

1. Confirm go/no-go authorization and operator/support presence. Notify pilot users
   of maintenance, explicit sync/update behavior and approved stop/manual fallback.
2. Pause writes at the edge, drain/stop the previous API, take the final verified
   backup and record counts/checksum/time. Preserve the prior code/config/static
   artifact; do not overwrite the only rollback copy.
3. Deploy the complete candidate backend/static/worker/config pairing. Start under
   the approved supervisor, initialize core tables, then exercise authenticated
   fieldwork to cover lazy schema creation. Do not auto-run legacy ownership assignment.
4. Run edge health/unauthenticated privacy probes and authorized scope-specific
   read/write/attachment/report smoke. Verify DB readback, session flags, cache policy
   and sample/scan/provenance linkage. Delete/dispose of launch fixtures by policy.
5. Reopen only the authorized scope if checks pass. For unsafe claims, privacy/data
   failures, corruption, broken core flows or unknown migration compatibility, keep
   service restricted and execute the [rollback procedure](deployment-runbook.md).

## Observation and support handover

Proposed initial observation: a **staffed first two hours** plus daily review for
the first seven pilot days; approve coverage and actual numeric alert/stop thresholds
in the release record before opening. These are planning defaults, not an SLA.

- [ ] Watch availability, request failures/latency, 401/403/429 patterns, disk/DB
  growth/locks, backup age/failures, missing scans/queue conflicts, attachment errors,
  PWA update failures, sensor/reference drift and safety/privacy complaints.
- [ ] Confirm at least one real backup completes on schedule and assign the next
  restore/access/retention review. A green `/health` is not sufficient evidence.
- [ ] Log deviations/incidents and next update times. Stop affected workflows for
  cross-farm exposure, failed sensor checks, data loss or harmful interpretation.
- [ ] Hand over current release/DB/backup/rollback refs, device roster, sample/custody
  gaps, unresolved queues, accepted exceptions, support contacts and next shift owner.

## Final decision and approval

Record **go / restricted_go / no_go** with actual time, permitted scope, conditions,
accepted risk IDs, expiry/next review, and named release-authority, operations, QA,
data and domain approvals. Hardware/calibration approval is required for real-device
claims. Missing critical safety/privacy/restore evidence means no real-data go-live.
Publish only the approved scope; retain the decision and
[QA results](../templates/technical/qa-test-results.csv) in restricted evidence.

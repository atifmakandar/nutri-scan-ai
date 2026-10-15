# Support and incident runbook

**Before launch:** replace `PLACEHOLDER_SUPPORT_ROUTE`,
`PLACEHOLDER_ON_CALL_CONTACT`, `PLACEHOLDER_DATA_STEWARD` and
`PLACEHOLDER_QUALIFIED_ADVISER` in the restricted contact sheet. Name primary/backup
owners, actual coverage hours and escalation route. These placeholders are not
working contact details or a 24/7 support promise.

Use [incident-log.csv](../templates/technical/incident-log.csv) for incident summaries
and a restricted linked timeline for updates. Do not place passwords, cookies, full
private reports, raw farm contacts or identifiable screenshots in public tickets.

## 1. Intake and ordinary support

Collect: opaque ticket ID, user role/farm alias, time/timezone, release, page/action,
browser/OS, online/offline state, error/status, reproduction steps and affected
record IDs only where needed. Ask permission for minimized screenshots. Never ask
the farmer to send a password/session token or run an unreviewed database command.

| Symptom | First checks / resolution |
| --- | --- |
| Login returns 401/403 | Check correct account, HTTPS/Secure cookie, origin/proxy configuration and system time; 403 may be Origin/role policy, not a bad password. No in-app password reset is supplied. |
| Login returns 429 | Respect Retry-After; review throttling/proxy client-IP behavior. Do not repeatedly retry or disable controls as a quick fix. |
| Scan cannot submit | Confirm all ten actual inputs, valid units/bounds and final review; member/owner role. If measurements are unavailable, use observation-only tracking rather than demo fillers. |
| Queue appears stuck | Confirm correct user/farm, connectivity and explicit Sync now. Check saved history/request ID before retry; unchanged requests are idempotent. A 409 needs review, not a new ID to force a duplicate. |
| Device details missing after draft load | Expected allowlist limitation: readings retained, instrument provenance stripped. Use independent field records; do not claim the original device timestamp survived. |
| Serial/voice unavailable | HTTPS/localhost, supported browser, permission, correct port/115200, close serial monitor, inspect timeout/frame. Keep manual measured entry available. Speech may depend on an external browser service/network. |
| Cannot upload evidence | Check supported type, <=5 MiB photo/<=10 MiB PDF, max five per parent, valid file and writer role. PDF checks are basic; do not open untrusted reports. |
| Print/install fails | Permit report popup or download HTML then print. Install depends on browser; test built root-path PWA over HTTPS. Offline reload is public help only. |
| Missing testing/reminder notification | Requests are farm-local tracking, not lab bookings. Reminders are in-app, not SMS/background notifications. Confirm manually with the selected provider. |
| Conflicting score/lab result or suspect feed | Stop relying on the score for that batch, preserve IDs/measurements, refer to a qualified lab/adviser. Scores/confidence are uncalibrated and never authorize feeding. |

## 2. Severity and response targets

Targets below apply **during the explicitly staffed coverage window** and must be
approved before launch. Record actual acknowledgment times; never backfill a target
as an achieved response.

| Severity | Examples | Target acknowledgment / coordination |
| --- | --- | --- |
| SEV1 critical | Cross-farm exposure, active credential/backup compromise, suspected harmful safety claim/use, widespread corruption/data loss | 15 minutes; incident lead + operations + data/domain lead immediately; stop affected real-data use |
| SEV2 high | Core login/scan unavailable, failed restores/backups threatening RPO, major wrong result/provenance, failed calibration affecting collected samples | 1 hour; incident lead coordinates same-window containment and qualified review |
| SEV3 medium | One optional feature/device failing with safe manual fallback; isolated report/UI defect | 1 business day; support/feature owner tracks workaround and fix |
| SEV4 low | Cosmetic/documentation issue without behavior or safety impact | 3 business days; backlog with owner and next review |

Outside coverage, document the actual escalation channel and safe stop/manual
fallback instructions. Upgrade severity if scope is unknown and safety/privacy
could be affected; incident lead records the reasoning and later reclassification.

## 3. Response sequence

1. **Declare / assign.** Create incident ID, severity, detection time, affected
   environment/version, reporter alias, incident lead, operations owner, data/domain
   reviewer and next update time. Start a timezone-aware timeline.
2. **Contain.** Pause affected capture/writes/exports or restrict the edge; quarantine
   affected hardware/sample batches. For private cache exposure, prevent further
   distribution and correct worker/static policy under controlled recovery. For
   potential feed harm, tell operators to obtain qualified advice, not to use a
   higher/lower prototype score as a safety test.
3. **Preserve evidence.** Keep a protected consistent DB snapshot, artifact/config
   digests, redacted logs, request/scan/sample/device IDs, clock/calibration status,
   error counts and minimal screenshots. Follow custody/access controls. Do not
   delete or alter the only record of what happened.
4. **Assess.** Determine start/end time, farms/users/records, app/firmware/model
   version, data categories, potential recipients, affected calibration interval and
   whether backup/deletion obligations are involved. Separate observed facts from
   hypotheses and list unknowns.
5. **Recover.** Fix/redeploy or use the [rollback runbook](deployment-runbook.md).
   Do not change DB schema, replay queues or downgrade code against an unknown
   schema ad hoc. A DB restore needs session revocation and deletion reconciliation.
6. **Verify.** Reproduce the failed path in isolation; rerun scoped
   [QA acceptance](qa-test-plan.md), isolation/attachment/readback checks and the
   affected real-device/reference checks. Observe service/queue/error metrics for
   an incident-lead-approved period before reopening.
7. **Communicate / close.** Report impact, containment, user action, remaining
   uncertainty and next update. Data steward coordinates privacy communications;
   domain lead approves safety wording. Record actual recovery/data loss and obtain
   closure approval. Schedule corrective actions, owners and due dates.

## 4. Operator diagnostics

Use actual environment paths/hostnames. These read-only probes do not authenticate
or prove DB health. Expected unauthenticated private status is 401, not 200:

```bash
export APP_ORIGIN=https://nutriscan.example.invalid
curl --fail --show-error --silent "$APP_ORIGIN/health"
curl --show-error --silent -D - -o /dev/null "$APP_ORIGIN/api/v1/auth/me"
curl --fail --show-error --silent -I "$APP_ORIGIN/sw.js"
```

Authorized host operators can check a protected DB **read-only**; results may be
resource-intensive on a large DB, so schedule appropriately. This does not migrate
or create tables. From any directory, with the correct absolute path:

```bash
export NUTRI_SCAN_DB=/srv/nutriscan-data/PLACEHOLDER_PRODUCTION.sqlite3
python3 - <<'PY'
import os, sqlite3
from pathlib import Path
path = Path(os.environ['NUTRI_SCAN_DB']).resolve()
assert path.is_file()
db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
try:
    print('integrity:', db.execute('PRAGMA integrity_check').fetchall())
    print('foreign_key_violations:', len(db.execute('PRAGMA foreign_key_check').fetchall()))
finally:
    db.close()
PY
```

Record output in restricted evidence. A green health endpoint with a failed DB
check is not recovery. Inspect disk/backup status through the host's existing
monitoring, and confirm an authenticated scan/fieldwork read on an authorized test
scope without logging response bodies or secrets.

### Emergency session revocation

This is a **privileged, global write**: it signs out every user, not just the
reporter. Incident lead approval, edge restriction, stopped/drained API, verified
backup and confirmed environment are prerequisites. With the correct `NUTRI_SCAN_DB`:

```bash
python3 - <<'PY'
import os, sqlite3
from pathlib import Path
path = Path(os.environ['NUTRI_SCAN_DB']).resolve()
assert path.is_file()
db = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True)
try:
    with db:
        revoked = db.execute('DELETE FROM sessions').rowcount
    print('Sessions revoked:', revoked)
finally:
    db.close()
PY
```

This does **not** disable accounts, reset passwords or prevent a compromised
credential from logging in again. Keep affected access restricted until an approved
identity recovery/removal process resolves the compromise. Rotate compromised host,
TLS/backup or future integration credentials using the responsible secret store;
there is no shared application session-signing secret to rotate in this MVP.

## 5. Communication, post-incident review and handover

Use this redacted update structure:

> Incident PLACEHOLDER_ID, detected PLACEHOLDER_TIME: observed impact and affected
> workflow/scope. Containment in place: PLACEHOLDER_ACTION. Operator action:
> PLACEHOLDER_ACTION. Known unknowns: PLACEHOLDER_UNKNOWNS. Next update:
> PLACEHOLDER_TIME via the approved support route. Prototype outputs remain screening
> indicators; seek qualified advice for feed/silage safety concerns.

For SEV1/SEV2 propose a review within two business days after stabilization. Capture
timeline, cause/contributing conditions, detection/response gaps, actual data loss,
sample/model implications, backup/restore results, deletion reconciliation, affected
user follow-up, failed controls and concrete prevention actions with owners/dates.
Update the [risk register](risk-register.md), SOP/training and relevant QA cases.
Close only after evidence is reviewed, access is safe, affected samples are dispositioned
by the domain lead and residual work is owned. Hand over open incidents explicitly
at every shift change; silence is not a completed handover.

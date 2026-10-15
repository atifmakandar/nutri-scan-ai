# Data governance and privacy operations

This is an **operational policy proposal, not legal advice**. The data steward and
release authority must approve scope, retention periods, access and local obligations
before real-data launch. No scheduled retention, deletion service or audit-log system
is implemented by this document. Current behavior comes from the
[README](../../../README.md), [backend README](../../../backend/README.md) and
[fieldwork contract](../../fieldwork-contract.md).

## 1. Data map and minimization

| Location / category | Current contents and handling | Operational owner |
| --- | --- | --- |
| SQLite accounts | Username, farm identity, role, scrypt password hash; session token digests/expiry (not plaintext tokens) | Identity/data steward |
| SQLite screening/history | Farm/batch/sample IDs, input readings, outputs/advisory, timestamps, request IDs, optional instrument provenance | Farm data steward |
| SQLite fieldwork | Batch metadata, observation answers/notes, reminders, testing-request contacts/status/dates | Field/data lead |
| SQLite attachments | Private normalized photo BLOBs and lab report/photo BLOBs; request PDFs are downloaded, not OCR-interpreted | Data/operations lead |
| Browser local drafts | Complete readings scoped by user/farm, queue/request metadata; no password, token, photo or API response; instrument metadata stripped | Device user/field lead |
| Browser Cache Storage | Public help/manifest/icons/allowlisted assets only; not private farm data or personalized HTML | Frontend/operations lead |
| Exports and sharing | Downloaded HTML, browser PDF, QR batch routes, optional previewed summaries/native photo sharing | Exporting user/farm owner |
| Optional voice | Browser speech service may process microphone input externally/network-dependently; Nutri-Scan does not save audio | Device user/data steward |
| Host logs/backups/evidence | Operator-configured logs, DB snapshots, calibration/custody/incident/QA records | Operations/data steward |

Keep contact details out of batch notes unless needed for the chosen testing provider.
Use pseudonymous farm/operator IDs in calibration analysis and operational CSVs;
store re-identification mappings in a separate restricted location. Avoid faces,
addresses, number plates and unrelated material in photos. Photo metadata stripping
does not remove identifying content visible in pixels or document text.

QRs contain a route, not a token or access grant, but may expose a batch identifier.
Reports include farm details; preview before sharing. WhatsApp/native share is an
explicit user action, not automatic background transmission. Once exported to another
device/recipient, files are outside server-side access controls; include them in
handling/deletion instructions and avoid uncontrolled support attachments.

## 2. Access and identity operations

- Owners add member/viewer accounts; owners and members can write scans/evidence/
  fieldwork, viewers are read-only. Farm scope comes from the session, not client
  claims. Verify foreign-resource isolation in [QA](qa-test-plan.md).
- There is no default account. Give each operator an individual account; prefer
  viewer access for review. Verify a farm owner's identity before adding users or
  assigning legacy data. Document grants, purpose, approver and review/expiry time.
- Proposed review cadence: at pilot onboarding, staff changes and monthly while
  active. Host DB/backup operators are privileged across farms; keep that group small,
  use protected host access and record all administrative data access externally.
- Session cookie: HttpOnly, SameSite=Lax, seven days; Secure requires explicit HTTPS
  configuration. Password/session hashes remain sensitive and do not make a stolen
  DB anonymous. Runtime/backup credentials belong in protected operator-managed
  secret storage, never Git, frontend `VITE_*`, logs or CSV evidence.
- Member removal, account disable/reset/recovery and farm erasure are not complete
  self-service administrative workflows in this MVP. Resolve the operational process
  for a closed pilot and block broader exposure until approved controls exist.
  Logging out or deleting a session does not disable future credential-based login.
- Scrub request bodies, `Cookie`, `Set-Cookie`, credentials, attachment bytes and
  identifying query strings from logs/support bundles. Minimize proxy URL logging;
  literal history filters can contain farm/batch information. No audit-log completeness
  is asserted for the app; maintain a restricted operations/change log separately.

## 3. Proposed retention schedule — approval required

These are concrete **starting defaults**, not current automatic behavior or legal
requirements. Enter approved values, owner and purge job/manual procedure in the
release evidence before capture. Document exceptions and expiry; do not silently
extend retention because a job was never scheduled.

| Category | Proposed operational period / trigger | Disposal / verification |
| --- | --- | --- |
| Synthetic staging/demo data | 14 days after demonstration/test completion | Destroy isolated DB/profile and test exports; retain minimized QA summary |
| Real pilot scans, fieldwork, photos/reports | Pilot closure + 90 days unless a documented purpose requires another period | Reviewed scoped erasure/export process; verify parent and attachment removal |
| Account/member data | Active pilot access; review/remove within 30 days of authorized closure/withdrawal | Apply approved account/farm administrative process; revoke sessions, verify scope |
| Browser drafts/queue | End-of-shift reconciliation; remove confirmed/unneeded copies within 7 days | User checks history before deleting; resolve queue/conflict first; confirm device storage |
| Downloaded/shared exports | Task completion, target within 7 days unless explicitly retained | User/recipient handles downloads, print copies, share apps and device backups |
| Redacted host access/error logs | 30 days | Restricted log rotation and verified expiry; incident hold only by approval |
| Incident/change/release/QA summaries | 12 months; raw private evidence separately minimized | Keep needed non-identifying outcomes; retire raw evidence by category-specific expiry |
| Real calibration/custody/raw lab evidence | Model/measurement release lifetime + 12 months | Preserve reproducibility and withdrawals; controlled de-identification/erasure review |
| Encrypted DB backups | Daily points for 30 days, then expire | Verify off-host expiry/replicas and record deletion-ledger reconciliation on restore |

An incident/evaluation hold needs a named authority, reason, restricted scope and
review date; track it in the same retention ledger. Do not conceal a pending deletion
or promise erasure while a documented exception remains active.

## 4. Backup, restore and deletion reconciliation

Proposed minimum service objectives for approval: **RPO 24 hours**, **RTO 4 hours**,
daily consistent DB backups plus a pre-change backup, encrypted off-host copy, daily
backup failure review and monthly restore drill. More frequent capture may require
a shorter RPO. These are targets, **not measured service guarantees**.

Use the [SQLite backup/restore commands](deployment-runbook.md). Record timestamp,
checksum, size, integrity/FK check, encryption/storage reference, release pairing,
retention expiry and drill result. Restrict directory/file access; HTTPS and mode
0600 do not encrypt a DB at rest. Prove that a restore includes attachments, legacy
visibility, roles and lazy fieldwork tables. A backup is not qualified until a restore
and authenticated readback have succeeded in isolation.

Keep a restricted **deletion ledger** outside restorable DB snapshots: request ID,
authorized scope, opaque farm/user/resource IDs needed to reapply deletion, backups
containing the data, hold/expiry, executor/reviewer, completion and verification.
This ledger itself requires access limits and retention. On restore, revoke old
sessions and apply approved erasures **before reopening access**; otherwise a backup
can resurrect deleted records. Restore-time reconciliation is mandatory even when
the app rollback succeeds technically.

## 5. Manual deletion/withdrawal workflow

There is no farm-erasure HTTP endpoint or generic purge command. Do not improvise
ad-hoc live SQL or assume deleting one farm row cascades all data.

1. Verify requester identity and authority without asking for their password/cookie.
   Log opaque request ID, scope (account, farm, scan, attachment, exports or dataset),
   requested action and acknowledgment date.
2. Inventory affected accounts/sessions, scans/photos, batches/observations/reminders,
   testing contacts/reports, legacy-assigned data, local drafts, logs, exports,
   datasets/model artifacts and all backup copies. Confirm scope with the owner;
   identify approved holds and downstream recipients.
3. Data steward approves a reviewed, schema-aware administrative procedure in a
   maintenance window. Take the protected pre-operation backup under its approved
   retention/hold, rehearse on a copy, define row/attachment counts and test foreign
   keys/remaining farms. If a reliable procedure is unavailable, mark the request
   pending and escalate; never mark it completed merely by hiding data in the UI.
4. Restrict access/revoke sessions as needed, execute the reviewed scoped procedure,
   verify affected bytes/records are gone and other farms unchanged. A logical delete
   alone does not prove physical secure erasure from SQLite pages, journals, SSDs or
   filesystem snapshots. Select an approved storage-level erasure/rewrite method
   and verify it in isolation.
5. Guide the authorized user through draft/download/shared-device cleanup after
   resolving unsynced work. Logout clears displayed scope, **not necessarily stored
   drafts or downloads**. Notify identified recipients through the approved process;
   record limitations without claiming remote recall.
6. Track encrypted backup expiry or controlled destruction and prevent resurrection
   through the deletion ledger. Assess dataset withdrawal and any need to retire or
   retrain affected models; do not promise removal from an artifact by deleting CSV rows.
7. Record executor/reviewer, actual completion/remaining copies, expiry and user-facing
   response. Retain only the minimized evidence necessary to prove the operation.

## 6. Incident and operational checklist

Suspected exposure, lost device, wrong-recipient share, backup theft or cross-farm
access triggers the [incident runbook](support-and-incident-runbook.md). Contain the
affected route/device/account, preserve minimal restricted evidence, identify data
categories/time/farms/recipients, and assign the incident/data leads. Determine any
external communications or obligations with the responsible organization; this pack
does not invent a legal notification deadline.

- [ ] Named data steward, access approvers and recovery/deletion operators recorded.
- [ ] Data map and chosen retention schedule approved; actual purge/rotation duties assigned.
- [ ] Registration/access withdrawal/session revocation gaps resolved for scope.
- [ ] HTTPS/Secure cookie/origin/isolation and private cache checks executed.
- [ ] Device-local storage, exported reports, sharing and speech-provider handling explained.
- [ ] Backup encryption, failure alerting, restore drill and deletion ledger tested.
- [ ] Scoped deletion procedure rehearsed, including attachments/backups/other-farm checks.
- [ ] Incident contacts, redaction procedure and restricted evidence access verified.

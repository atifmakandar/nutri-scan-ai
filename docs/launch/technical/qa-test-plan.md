# QA test plan and acceptance criteria

**Execution status: not run by this documentation pack.** Prior results in
[fieldwork verification](../../fieldwork-verification.md) describe an earlier run;
they do not certify this candidate, production HTTPS or physical sensors.
QA lead records release/configuration/device versions and every execution in
[qa-test-results.csv](../templates/technical/qa-test-results.csv).

## 1. Test policy and fixtures

- Test generated accounts and **clearly labelled synthetic demo data** against a
  disposable SQLite DB, not the normal backend DB or real farm accounts. Use at
  least two farms, an owner/member/viewer, feed and silage, and repeated batch IDs
  across farms/sample types. No real external sharing, lab booking or SMS is needed.
- Run commands from the stated directories using existing dependencies. Browser
  scripts additionally need an existing Playwright module, Chromium and runtime
  libraries; these are not installed by `npm test`. Record `blocked` if unavailable.
- Preserve stdout/stderr and exit status in restricted evidence. Include expected
  versus actual behavior, issue reference and operator/time. Scrub passwords/cookies.
- `pass`: all assertions/expected outcomes met with evidence; `fail`: observed mismatch;
  `blocked`: prerequisite missing; `not_run`: no execution. `not_applicable` needs a
  scope rationale and approver. Do not convert missing device testing into a pass.

## 2. Exact regression commands

From `backend/`:

```bash
.venv/bin/python -m unittest discover -s tests -p "test_*.py"
```

From `frontend/`:

```bash
npm test
VITE_PUBLIC_API_URL= VITE_API_URL= npm run build
```

From the repository root, for the independent synthetic calibration scaffold:

```bash
python3 -m unittest discover -s tools/calibration -p 'test_*.py' -v
```

Pass criteria: commands exit 0, no unexpected test failures/skips, build emits the
production PWA files and no unresolved error/warning affecting scope. Record actual
counts; do not expect historical 48/309 counts to remain fixed. Existing docs note a
FastAPI/Python deprecation warning; review the actual output. There is no configured
separate lint/typecheck script. `git diff --check` from the root can check tracked
whitespace; it does not check new untracked documentation by itself.

## 3. Isolated live browser setup

Ensure ports 8123/5174 are free; **do not stop existing user services to free them**.
If occupied, arrange a separate test window/workspace. Live farmer/fieldwork scripts
assert frontend port 5174; pointing them at arbitrary existing preview servers is
unsafe because the scripts create test accounts/data.

From the root, create a fresh private disposable test location outside the repository:

```bash
export SMOKE_DIR="$(mktemp -d)"
python3 -c 'import os; print(os.environ["SMOKE_DIR"])'
```

Use that **same printed path** as `SMOKE_DIR` in each terminal. Terminal A, from
`backend/`, starts the disposable API:

```bash
NUTRI_SCAN_DB="$SMOKE_DIR/smoke.sqlite3" NUTRI_SCAN_COOKIE_SECURE=false \
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8123
```

Terminal B, from `frontend/`, builds the app with no absolute API override and proxies
to that API. A build replaces `dist/`; use a disposable test workspace if an existing
build must be retained:

```bash
VITE_PUBLIC_API_URL= VITE_API_URL= npm run build
VITE_PUBLIC_API_URL= VITE_API_URL= VITE_PROXY_TARGET=http://127.0.0.1:8123 \
npm run preview -- --host 127.0.0.1 --port 5174 --strictPort
```

Terminal C, from `frontend/`, set an existing module path (omit that variable only
if `playwright` already resolves), then run:

```bash
export NUTRISCAN_PLAYWRIGHT_MODULE=/PLACEHOLDER_EXISTING_INSTALL/node_modules/playwright
NUTRISCAN_SMOKE_URL=http://127.0.0.1:5174 NUTRISCAN_ALLOW_TEST_ACCOUNTS=1 \
node tests/farmer-flow.browser.mjs
NUTRISCAN_SMOKE_URL=http://127.0.0.1:5174 NUTRISCAN_ALLOW_TEST_ACCOUNTS=1 \
node tests/fieldwork-live.browser.mjs
NUTRISCAN_PREVIEW_URL=http://127.0.0.1:5174 node tests/pwa-live.browser.mjs
```

Optional isolated/mock browser scripts from `frontend/`, with the same Playwright
prerequisite; they manage their own fixtures/servers:

```bash
node tests/fieldwork.browser.mjs
node tests/reading-assist.browser.mjs
node tests/pwa.browser.mjs
```

Pass: script exit 0 and expected assertions fulfilled; inspect actual output. Mocked
serial/speech/share APIs do not prove permission prompts, physical transport, audio
or external delivery. Stop only the test processes you started, retain needed
redacted evidence and dispose of the isolated DB/profile under the retention policy.

## 4. Acceptance cases

Execute these against the candidate. Rows identify **required behavior**, not results.
For API writes use the correct trusted `Origin` and authenticated session unless the
test deliberately checks missing/foreign identity. Unknown/foreign object lookups
should not leak another farm's existence.

| ID | Exercise | Pass criteria |
| --- | --- | --- |
| AUTH-01 | Register, login, reload, logout; bad login | New farm/owner, password length >=10; HttpOnly session, no token/password in localStorage; logout revokes session; bad login 401; HTTPS cookie has Secure and SameSite=Lax |
| AUTH-02 | Owner creates member/viewer; roles attempt writes | Owner manages members; member can scan/upload; viewer reads/downloads but scan/fieldwork/upload writes return 403; non-owner member creation denied |
| AUTH-03 | Second farm, forged `farm_id`, guessed IDs, foreign attachments | No cross-farm read/write; explicit mismatched farm filter/body 403 where supported; missing/foreign private resources 404; no-session routes 401 |
| AUTH-04 | Missing/untrusted Origin on mutation, allowed Origin, repeated bad logins | Missing/untrusted Origin 403; legitimate origin succeeds; throttle returns 429 under its documented limit; all private responses/errors no-store/nosniff |
| SCAN-01 | Blank, malformed, nonfinite and out-of-range inputs; actual zero | UI blocks missing/invalid values and requires all ten; zero remains zero; visual inputs 0–1; percent inputs 0–100, pH 0–14, UI/instrument temperature -20–80; no fabricated defaults |
| SCAN-02 | Four steps, Back, edit after confirmation, submit/refresh | Back retains values; edits invalidate review; persisted result/IDs match reviewed request; prototype and uncalibrated metadata visible |
| SCAN-03 | Repeat same farm/request ID with same/changed payload after restart | Equivalent request returns same saved scan, no duplicate; changed payload 409; scope remains farm-local |
| HIST-01 | Search text/exact batch, UTC date bounds, filters and pagination | Literal matching; inclusive UTC dates; all expected farm records reachable; feed/silage not merged; missing trend values remain missing |
| REPORT-01 | Export then edit unsaved form; refresh/export history; popup blocked | HTML represents saved record/ID only; print hides controls but keeps measurements/advisory/disclaimer; PDF saved via browser dialog; blocked popup explains HTML fallback |
| PHOTO-01 | Valid JPEG/PNG/WebP; metadata-bearing, bad type, too large, sixth photo | Private evidence saved/readable by farm; normalized and metadata stripped; <=5 MiB and max five/parent; invalid payload/type/size/count rejected; no AI-image claim |
| SHARE-01 | QR on another device; preview summary and selected evidence | QR contains batch route, no token or access grant; sign-in required; farm identity/photos off by default; text share has no private URLs/tokens; photos only through supported explicit native file sharing |
| DRAFT-01 | Save/queue offline in open signed-in app; reconnect/retry; switch user | No implicit upload on reconnect; explicit sync idempotent; failures remain actionable; no other user's drafts visible; no photos/tokens/API responses stored |
| DRAFT-02 | Save/load instrument-origin draft | Readings can persist but device/time/calibration provenance is stripped; warning visible; resulting record is not presented as retaining instrument provenance |
| FIELD-01 | Create/edit batch; duplicate identity; Use this batch | Unique farm/batch/sample, immutable batch/sample identity; valid dates/quantity; reuse copies identity only, never old readings |
| FIELD-02 | Save Yes/No/Unknown observations, including untouched answers | Unknown stays unknown; `observation_only`; no engine call, score, confidence or safety verdict |
| FIELD-03 | Reminder complete/reopen; local date due groups | Correct persistence and calendar grouping; no promise of SMS/background delivery |
| FIELD-04 | Request → collected → report_received, invalid backward/date paths | Forward transitions/date rules enforced; report required before received; tracker never says booked/sent automatically |
| FIELD-05 | Request report upload/download; photo/report limits | Max five attachments; photos <=5 MiB, PDF <=10 MiB; basic PDF signature/EOF validation, attachment download/no inline execution; no OCR/malware-scan claim |
| SERIAL-01 | Valid 1–7 reading frame, select subset, cancel/edit/recapture | Explicit user port/review/application only, no commands/submit; unselected readings unchanged; provenance matches selected values; edits drop affected provenance |
| SERIAL-02 | Unknown/duplicate keys/fields, numeric strings, wrong units/time, oversize, timeout/disconnect | Invalid frames not applied; no invented readings or scan; clear failure/manual fallback; 16,384-byte/15-second boundaries exercised |
| VOICE-01 | Consent denied, stop/unmount, reviewed value, language unavailable | No automatic microphone use or submission; typed fallback always available; browser/provider/network dependence clear; app stores no audio |
| PWA-01 | HTTPS production install, inspect caches, offline reload in three languages | Correct manifest/icons/root scope; only public assets/help cached; API/auth/photos/reports network-only; offline page exposes no farm data/login form |
| PWA-02 | Candidate update, explicit activation and old-release rollback | No forced activation while unsaved; coherent worker/assets; old namespaces removed on activation; private cache boundary survives both versions |
| OPS-01 | Backup, restore, startup + first fieldwork call, role/attachment readback | Integrity/FK checks pass, accounts/scans/attachments recover, sessions revoked in restore, deletion ledger reconciled; approved RPO/RTO met |
| CAL-01 | Synthetic scaffold tests/report and label review | CLI report is explicitly `synthetic_demo_not_for_field_use`; coefficients not connected to app; no lab-accuracy claims |
| UX-01 | 390px and target devices; English/Hindi/Marathi; listening and keyboard | No hidden required control/overflow blocker; readable text/icons and focus; actual voices/translation approval recorded; manual fallbacks usable |

The raw manual API `SensorData.temperature_c` currently accepts finite numbers
without the UI/instrument -20–80 bound. Do not assert API parity for that field;
record the difference and decide whether a broader-input API is acceptable for the
release scope. Client validation is not a substitute for server validation.

## 5. Field pilot smoke — field lead + QA witness

Use authorized pilot accounts on the pilot environment and actual approved devices;
label any demo fixtures synthetic. Preserve real and synthetic records separately.

1. Record site/date, target phone/browser/OS, network, release, device/sensor IDs,
   calibration/time checks and operator training. Confirm support can be reached.
2. Sign in; create/select the correct batch/sample; capture one observation with
   Unknown preserved and confirm it has no score.
3. Run reference checks, then an actual instrument capture (or measured manual
   fallback), review all ten inputs and submit **only if complete**. Refresh saved
   history/provenance; compare readings against the operator record.
4. Download a saved HTML report and review the print/PDF flow. Test authenticated
   QR access from another device. Review a share preview without sending externally.
5. On a disposable complete-reading draft, disconnect/reconnect and demonstrate
   explicit sync, count/history confirmation and the provenance-loss warning. Test
   offline public help separately; do not expect private history after offline reload.
6. Demonstrate reminder complete/reopen and local testing-request/report tracking
   with a clearly synthetic trusted report; never claim a lab was contacted.
7. Record serial unplug/permission denial, real speech/manual fallback, logout/shared
   device handling, discrepancy/referral and end-of-shift reconciliation.

Pass: every in-scope step meets acceptance criteria, no unaccounted sample/scan/queue
item, no misleading safety claim and no unresolved critical/high failure. Stop
real-data capture for failed reference checks, unsafe hardware or farm isolation
failures. Record unavailable conditions as blocked and schedule a witnessed rerun.

## 6. Exit and regression policy

Required regression commands and all scope-required acceptance cases must pass for
the exact candidate. Critical safety/privacy/data-loss failures are no-go; high
functional failures block affected workflows. Lower-priority exceptions need a named
owner, bounded scope, workaround, expiry and release-authority approval. Device-specific
features cannot be advertised as verified while their real-device checks are blocked.

On a fix, rerun the failing case and affected neighboring cases; rerun the broader
required suites when the candidate changes. Attach QA summary to
[production launch](production-launch-checklist.md), and log incidents/discrepancies
under the [support runbook](support-and-incident-runbook.md).

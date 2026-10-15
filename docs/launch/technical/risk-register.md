# Technical, product, safety and business risk register

Initial assessment on **2026-10-15**; all entries are **open / mitigation unverified**.
Likelihood/impact are qualitative planning estimates (`L|M|H`), not measured rates.
Named individuals, numeric thresholds, review dates and residual-risk acceptance
belong in the restricted release record. Role titles below are unassigned owners
until a person accepts them. No mitigation is considered completed by documenting it.

| ID / category | Failure and consequence | Likelihood / impact | Mitigation and required evidence | Accountable role / review trigger |
| --- | --- | --- | --- | --- |
| R01 safety/product | Prototype risk/confidence mistaken for lab accuracy or safe-to-feed approval | H / H | Prominent uncalibrated disclaimer in results/reports/shares/training; qualified referral; no certification/contaminant claims; wording review and field comprehension evidence | Domain/product lead; every claims/score/translation change |
| R02 hardware/safety | Raw pH probe, 5 V ADC signal, unsuitable supply or wet damaged wiring harms board/operator or corrupts readings | M / H | Exact-board datasheets, conditioned interface, powered-off inspection, measured voltage limits, protected enclosure and qualified wiring sign-off | Hardware lead; every module/wiring change or damage |
| R03 validity | Demo constants, placeholder ADC conversions, missing temperature/humidity hooks or stale manual time appear to be real observations | H / H | Label demo units/sessions; separate synthetic records; implement validated hooks/clock; inventory/calibration evidence and actual reference tests | Hardware/calibration lead; each device/firmware/session |
| R04 data/model | Unrepresentative samples, lab basis mismatch, contaminated material or split leakage produces optimistic accuracy | H / H | Custody and lab QC, immutable raw hashes, train-only transforms, farm/batch/time grouping, locked test and subgroup thresholds; independent release review | Calibration/data leads; dataset/model/method/domain change |
| R05 security/privacy | Cross-farm reads/writes or trusted-Origin/cookie misconfiguration exposes farm data | M / H | Farm-scoped auth/role/attachment tests, HTTPS/Secure cookie and exact origins; review always-on localhost/own origins and edge restrictions | Security/operations lead; deployment/auth/proxy change |
| R06 identity/business | Public account creation abuse, incomplete reset/removal workflow or process-local throttle enables unauthorized use/support overload | H / H | Restricted-pilot edge access, named account/admin process and incident contacts; resolve public registration/withdrawal/recovery controls before broad launch; abuse/load evidence | Product/security lead; exposure expansion or staff change |
| R07 operations/data | SQLite write contention, attachment growth, disk exhaustion or corruption loses scans/availability | M / H | Single-process starting topology, real load/capacity measurement, storage alerts, bounded uploads, consistent encrypted backups and restore drill; capacity-based DB migration decision | Operations lead; load/storage trend or backup failure |
| R08 release/data | Additive/lazy schema changes or legacy assignment break old code, misassign ownership or make rollback unsafe | M / H | Copy-based startup + first-fieldwork migration rehearsal, ownership review, before/after IDs/counts, compatibility pairing, pre-change backup, rollback drill | Release/operations lead; migration/assignment/release |
| R09 offline/data | User assumes private offline reload, auto-sync or preserved provenance; loses drafts/traceability or duplicates a scan | H / H | Public-help-only messaging, explicit sync/idempotency tests, draft provenance warning, protected independent capture log, end-of-shift reconciliation and no blind storage clearing | Field/frontend lead; queue/PWA/storage change |
| R10 PWA/privacy | Cache policy change/CDN caches private data, or mixed worker/assets strand old tabs | M / H | Allowlist cache inspection, private no-store/network-only tests, atomic artifact/worker update, retained old hashed assets, explicit activation and rollback test | Frontend/operations lead; build/cache/CDN update |
| R11 browser/product | Web Serial, microphone, speech language, native sharing, printing or install unsupported on target devices | H / M | Actual HTTPS phone/browser matrix, permission/unplug tests and usable measured manual/readable/download fallback; do not equate mocks with device evidence | QA/field lead; new device/browser/OS |
| R12 attachments/privacy | Trusted-looking PDF is malicious; photos/reports/exports/shared devices reveal identity | M / H | Basic PDF validation explicitly not scanning; trusted-provider handling, isolated review, photo metadata stripping, preview-first sharing, local/export deletion guidance and privacy incident drills | Data/support lead; new file flow or exposure |
| R13 UX/safety | Draft translations, unclear units/visual scores or inaccessible controls change an operator's decision | M / H | Expert English/Hindi/Marathi review, units/basis training, unknown stays unknown, no fabricated values, 390px/actual-device operator comprehension checks | Domain/field lead; copy/language/workflow change |
| R14 product/safety | Local testing request/reminder implies real lab booking, certified provider, report interpretation or SMS | H / H | Explicit local-tracker labels, manual provider/contact confirmation, report-received gating, qualified interpretation and SOP comprehension test | Product/field lead; testing/reminder integration change |
| R15 governance/business | Unexecuted retention/deletion, resurrected backup data, lost device or unowned support creates privacy/reputation cost | M / H | Approved schedule/owners, deletion ledger, restore reconciliation, access reviews, local-device cleanup and incident/on-call exercise | Data/operations lead; restore, withdrawal or lost device |
| R16 business/scale | Sensor/lab/logistics costs, support load, poor repeatability or low farmer adoption defeats viability | H / H | Bounded pilot records actual cost per usable sample, lab turnaround, repeat visits, support tickets and farmer comprehension/value; pre-agreed budget/service thresholds before expansion | Business/product lead; pilot review or budget breach |
| R17 contract/validity | Raw manual API accepts finite temperatures outside UI/serial -20–80 range; integrations assume identical validation | M / M | Document current contract, inventory clients, test UI/serial bounds separately and decide server-range policy before third-party API exposure; record exception/scope | Backend/product lead; external integration/schema change |

## Review and acceptance procedure

1. At readiness review, assign a named owner, target date, evidence reference,
   current/residual rating and proposed disposition (`mitigate|avoid|accept|block`).
2. Review weekly during a pilot, before each candidate release and immediately
   after any trigger/incident. Track actual likelihood evidence rather than reducing
   ratings because a checklist exists.
3. Safety/privacy/data-loss risks with missing critical controls block real-data
   operation. A synthetic-only demo can proceed only under that explicit scope;
   it does not accept the same risks for farmers or production data.
4. Release authority and the relevant domain/data owner approve bounded residual
   risk with a reason, scope, expiry and stop trigger. No numeric validation gate
   may be waived by citing a synthetic scaffold result.
5. Escalate materialized risks through [support/incidents](support-and-incident-runbook.md)
   and feed corrective actions into [QA](qa-test-plan.md),
   [readiness](technical-readiness-checklist.md) and
   [final launch](production-launch-checklist.md).

Sources for current limitations: [README](../../../README.md),
[fieldwork contract](../../fieldwork-contract.md),
[real-device gaps](../../fieldwork-verification.md),
[ESP32](../../../firmware/esp32/README.md),
[calibration workflow](../../calibration-workflow.md).

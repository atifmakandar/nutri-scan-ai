# Nutri-Scan business launch pack

> **DRAFT — legal/accounting review required.** Prepared against the repository state reviewed on 15 October 2026. Commercial terms, budgets, targets and schedules below are proposals, not offers, forecasts or achieved results.

**Owner:** [FOUNDER NAME], [LEGAL ENTITY] · **Contact:** [CONTACT] · **Next review:** [REVIEW DATE]

Start with the one-pager, rehearse the demo, then use discovery to qualify a bounded workflow pilot. Complete the proposal and obtain reviewed terms before collecting customer data or charging. This pack provides no certification or legal opinion.

## Index

| Artifact | Use |
| --- | --- |
| [Student-founder start plan](student-founder-start-plan.md) | Low-cost mentor/team/farmer discovery and a proposed 14-day target |
| [Executive one-pager](executive-one-pager.md) | First customer/investor introduction |
| [Business plan](business-plan.md) | Wedge, scope, differentiation, milestones and risks |
| [Go-to-market plan](go-to-market-plan.md) | ICP, funnel, partners and conversion |
| [Pricing and unit economics](pricing-and-unit-economics.md) | Illustrative INR model and break-even |
| [Investor pitch outline](investor-pitch-outline.md) | Ten-slide evidence-led narrative |
| [Sales demo script](sales-demo-script.md) | Current app and ESP32-compatible emulator walkthrough |
| [Customer FAQ](customer-faq.md) | Approved practical answers |
| [Pilot proposal](pilot-proposal-template.md) | Customer-specific scope and success measures |
| [Pilot agreement](pilot-agreement-template.md) | Non-legal discussion template for counsel |
| [Lab partner MoU](lab-partner-mou-outline.md) | Non-legal collaboration outline |
| [Discovery interview](customer-discovery-interview.md) | Problem and willingness-to-pay evidence |
| [Partner outreach](partner-outreach-emails.md) | Editable introduction/follow-up emails |
| [Launch checklist](launch-checklist.md) | Business readiness and accountable next actions |
| [Privacy notice template](privacy-notice-template.md) | Customer-facing data notice; review before collection |
| [Customer service terms outline](customer-terms-outline.md) | Counsel drafting decisions for continuation/service |
| [Separate data/publicity permissions](data-permission-and-publicity-form.md) | Granular optional reuse and branding decisions |
| [Website and announcement copy](website-and-launch-copy.md) | Claims-bounded drafts, not a deployed website |
| [Business setup and IP](business-setup-and-ip-checklist.md) | Entity, rights, applicability, finance and insurance questions |
| [Cash-flow and funding plan](cash-flow-and-funding-plan.md) | Worked scenario and spending gates, not a forecast |
| [Quote and order schedule](quote-and-order-template.md) | Customer scope, charges and review record |

## CSV working templates

| Template | Instructions |
| --- | --- |
| [Pricing scenarios](../templates/business/pricing-scenarios.csv) | All four rows are illustrative calculations; replace assumptions before quoting. |
| [Discovery log](../templates/business/customer-discovery-log.csv) | Placeholder row only; use consented, pseudonymous notes. |
| [Pilot KPI log](../templates/business/pilot-kpi-log.csv) | Placeholder row only; record denominators, evidence and missing data. |
| [Partner pipeline](../templates/business/partner-pipeline.csv) | Placeholder row only; no verified partners or contacts are supplied. |
| [12-month cash flow](../templates/business/12-month-cash-flow.csv) | Static illustrative arithmetic; see the cash-flow plan before editing. |
| [90-day action plan](../templates/business/90-day-action-plan.csv) | Proposed relative days; all actions unstarted and approvals unset. |

CSV use: preserve headers and remove the placeholder row before logging real work. Quote fields containing commas/newlines. Keep evidence links access-restricted and use explicit `not_measured`/`not_applicable` rather than zero for missing numeric data. The KPI log holds one metric per period; define its unit, numerator and denominator before measuring. Set `record_type` to `real` or `demo` and exclude demo rows from adoption/acceptance summaries. The partner contact column is a reference to an approved restricted contact record, not permission to publish personal details. `review_status` records review state; its initial value is not approval.

The cash-flow CSV is a separate worked scenario, not an actuals ledger; its zeros and
excluded costs follow the [cash-flow assumptions](cash-flow-and-funding-plan.md).
The action plan's day 1 is the agreed planning start, not a calendar commitment.
Move dates when gates are blocked; schedule pressure never overrides approval.
Replace owner tokens, track actual completion/evidence privately, and adapt the plan
to the real pilot start. The example assumes pilot days 36–77 (six weeks).

## Product truth and source priority

- [Today's demo](../../today-demo.md): actual same-day app/serial demonstration.
- [Fieldwork contract](../../fieldwork-contract.md): current persistence, permissions, local testing requests and offline boundaries.
- [Calibration workflow](../../calibration-workflow.md): synthetic scaffold, real collection protocol and validation gates.
- [Fieldwork verification](../../fieldwork-verification.md): recorded software checks and real-device gaps; these are existing results, not checks performed for this pack.
- [Farmer usability](../../farmer-usability.md): guided entry, evidence, explicit draft sync and all-ten-readings requirement.
- [Serial firmware guide](../../../firmware/esp32/README.md), [input model](../../../backend/app/models.py), [prototype engine](../../../backend/app/engine.py), [guided form](../../../frontend/src/screening.js): implementation references.

Older architecture/marketing text includes future capabilities. For business copy, use the current contract and implementation. In particular, the later fieldwork contract adds an installable **public-help** PWA shell beyond the earlier usability guide; it does not add offline private-record access. Recheck these sources before each external demo or quote.

## Claims matrix

“Can say now” means supported by the reviewed prototype; rehearse on the actual demo device. A future gate is necessary evidence, not permission to promise a capability today. Any future claim requires a separately approved, bounded statement.

| Topic | Can say now | Must not say | Validation gate for any expanded claim |
| --- | --- | --- | --- |
| Core value | Record feed/silage batches, observations and follow-up; demonstrate a reviewed screening workflow. | Proven savings, higher milk yield, disease prevention or improved feed safety. | Consented baseline and prospective customer study; measured outcomes, attribution limits and expert review. |
| Scoring / AI | Transparent, deterministic, uncalibrated prototype score and heuristic confidence from supplied inputs. | Lab accuracy; trained field model; confidence is diagnostic accuracy or a validated probability; LOW means safe to feed. | Representative paired references; train-only fitting; locked held-out farm/batch/time evaluation, uncertainty and expert release approval for a defined use. |
| ESP32 / serial | User-selected serial capture and confirmation; emulator/default sketch emits illustrative moisture, pH, temperature and humidity values. | Live field measurements from the emulator, plug-and-play meter compatibility, certified calibration, autonomous submission. | Validated sensor hooks, traceable calibration/maintenance records, repeatability and target-browser/device field tests. Device-reported status alone proves none of these. |
| Nutrients / NIR | Accepts reviewed protein, dry matter and crude-fiber numerical inputs. | Measures/predicts protein, fiber or energy from a phone/photo or this ESP32 demo; deployed calibrated NIR. | Suitable hardware, defined units/basis and methods, real paired lab-labelled dataset and target-specific held-out validation. |
| Photos / contamination | Private evidence photos and operator-supplied visual indicators; observations preserve Unknown. | AI photo diagnosis, toxin detection, aflatoxin/mycotoxin detection, certified adulteration detection, absence of contamination. | Separate analyte-specific method/hardware and qualified reference testing, limits and false-negative evaluation; expert/legal review. A generic score cannot clear this gate. |
| Advice / safety | Prototype guidance prompts qualified review and confirmatory testing. | Diagnosis, guaranteed safety, feeding clearance or replacement for a laboratory/adviser. | Qualified domain review of guidance and translations; any regulated intended use needs its own applicable review. No guarantee is offered. |
| Testing help | Farm-local request/status tracking, manual contact details and private report download. | Automatic lab booking, sending samples/requests, lab directory, OCR or automatic interpretation; named/accredited partner without evidence. | Executed partner scope, verified methods/contact details, explicit farmer authorization and an implemented/tested integration before claiming automation. |
| Offline / reminders | Public-help PWA shell; explicit local complete-reading drafts/queue in an already-loaded signed-in app; in-app reminders. | Fully offline private records, background auto-sync, retained instrument provenance in drafts, SMS/background notifications. | Implemented/tested scope and device tests before changing copy. Direct online submission currently preserves selected instrument provenance. |
| Accounts / reports | Farm-scoped owner/member/viewer access, saved history, HTML reports and browser Print / Save PDF. | Certified compliance, audited security, public QR access, guaranteed production uptime or native PDF generation. | Deployment/privacy review, access and restore tests, supported-browser checks and any specifically commissioned audit. |
| Calibration demo | Offline synthetic cleaning/splitting/metrics/fitting scaffold; coefficients are not integrated into the app. | Synthetic metrics demonstrate accuracy or certified calibration. | Follow the real-data protocol in the calibration workflow and obtain a separate release decision. |

## Placeholder register

Keep the exact tokens below across this pack. Square-bracket values are unresolved fields, never real identities, quotes or commitments. Retain `ILLUSTRATIVE` / `PLACEHOLDER` labels in working CSVs; replace tokens and remove example rows in a reviewed customer copy. Use YYYY-MM-DD for dates and timezone-aware timestamps for captures. Do not paste credentials or identifiable farm notes into pipeline sheets.

| Group | Canonical tokens and meaning |
| --- | --- |
| Identity / review | [LEGAL ENTITY] = Nutri-Scan contracting entity; [FOUNDER NAME] = accountable founder; [CONTACT] = verified Nutri-Scan contact; [REVIEW DATE] = next review date. |
| Customer / pilot | [CUSTOMER LEGAL NAME], [CUSTOMER CONTACT], [PILOT ID], [PILOT START DATE], [PILOT END DATE]. |
| Commercial | [PILOT PRICE] = total pilot fee in INR; [MONTHLY PRICE] = recurring fee per farm/month in INR; [PAYMENT TERMS] = schedule/due dates/refund treatment; [TAX TREATMENT] = accountant-reviewed invoicing/taxes. |
| Delivery | [SUPPORT HOURS], [RESPONSE TARGET], [SAMPLE COUNT], [ACCEPTANCE TARGET], [NOTICE PERIOD]. Sample count means paired physical samples only when a separately agreed reference study exists. |
| Data / counsel | [DATA USE PERMISSION], [RETENTION PERIOD], [EXPORT WINDOW], [LIABILITY CAP], [GOVERNING LAW], [DISPUTE PROCESS]. |
| Partner / funding | [LAB PARTNER], [LAB CONTACT], [LAB METHOD], [LAB FEES], [FUNDING ASK], [RUNWAY MONTHS]. None implies an existing relationship or funding. |
| Tracking | [OWNER], [DUE DATE], [NEXT ACTION], [STATUS], [EVIDENCE LINK], [SEGMENT], [CONSENT STATUS], [INTERVIEW ID], [DATE], [SUMMARY], [PARTNER ID], [ROLE], [KPI NAME], [KPI VALUE], [BASELINE MINUTES], [CURRENT MINUTES]. |

**Release rule:** [FOUNDER NAME] checks the claims matrix and evidence; counsel reviews customer/data/partner terms; an accountant reviews prices, tax treatment and costs. Record the review date and decision in the [launch checklist](launch-checklist.md). Unresolved placeholders block a customer-ready copy.

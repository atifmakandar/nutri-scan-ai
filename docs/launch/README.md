# Nutri-Scan launch pack — start here

**Prepared:** 2026-10-15 · **Owner:** [FOUNDER NAME] · **Entity/contact:** [LEGAL ENTITY] / [CONTACT]

**Status: planning documents saved; commercial, legal, scientific and production approval not recorded.**
This pack prepares a restricted, paid **workflow pilot**, not a laboratory replacement
or a feed-safety product launch. Drafts, example prices and schedules are not offers,
certifications, forecasts, customer evidence or professional advice. Do not send a
template externally until its placeholders and reviews are complete.

**Starting as a student?** Read the [student-founder start plan](business/student-founder-start-plan.md)
for a low-cost first 14 days: one mentor, two teammates, three farmer interviews
and one agreed small pilot. Real-data use still requires the relevant readiness gates.

## Recommended launch decision

Lead with **silage/feed batch records, observation-only checks, evidence and follow-up**.
Find a farm with a named operator, a repeated record-retrieval problem and an authorized
buyer. Propose a six-week, one-farm pilot with explicit caps and measured workflow
outcomes. Keep scientific validation and any hardware/laboratory service separately
scoped and funded. Cooperatives/advisers can introduce or sponsor farms; a cooperative
multi-farm administration console and in-app billing are not implemented.

The existing complete-screening flow uses ten supplied inputs and an **uncalibrated
prototype score**. Photos do not diagnose feed; the ESP32 default sketch/emulator uses
synthetic values. No toxin detection, lab accuracy, certified calibration or feeding
clearance is established. Read the [claims matrix](business/README.md#claims-matrix)
before a pitch, demo, quotation or website publication.

## Start with these seven steps

1. Read the [one-pager](business/executive-one-pager.md), [business plan](business/business-plan.md)
   and [go-to-market plan](business/go-to-market-plan.md); confirm buyer and narrow scope.
2. Run [customer discovery](business/customer-discovery-interview.md) and record permissioned,
   pseudonymous evidence in the [discovery log](templates/business/customer-discovery-log.csv).
3. Rehearse the [demo script](business/sales-demo-script.md) on the actual browser/device.
   Keep synthetic data separate; disclose unsupported serial/manual fallback honestly.
4. Review [unit economics](business/pricing-and-unit-economics.md) and the
   [cash-flow plan](business/cash-flow-and-funding-plan.md); replace assumptions before quoting.
5. Complete the [proposal](business/pilot-proposal-template.md) and
   [quotation](business/quote-and-order-template.md); have counsel/accountant review terms,
   data handling, taxes and payment prerequisites before signature or collection.
6. Resolve both the [business checklist](business/launch-checklist.md) and
   [technical readiness checklist](technical/technical-readiness-checklist.md).
   Missing privacy, access, restore or safety evidence blocks real-data use.
7. Record the permitted scope and actual go/no-go decision in the
   [production/pilot launch checklist](technical/production-launch-checklist.md).
   Use the [90-day action tracker](templates/business/90-day-action-plan.csv), not assumed approvals.

## Document library

| Section | Saved materials |
| --- | --- |
| [Student-founder start plan](business/student-founder-start-plan.md) | Practical first steps for a mechanical engineering student at Sinhgad, Solapur |
| [Business and sales index](business/README.md) | Strategy, market approach, pricing, pitch, demo, FAQ, interviews, outreach, pilot proposal/agreement and laboratory MoU outline |
| [Customer privacy notice draft](business/privacy-notice-template.md) | Customer-facing data categories, purposes, optional services, retention and request process |
| [Customer service terms outline](business/customer-terms-outline.md) | Counsel-reviewed continuation/service terms beyond a one-off pilot |
| [Data and publicity permissions](business/data-permission-and-publicity-form.md) | Separate, optional research, case-study, logo and marketing decisions |
| [Website and launch copy](business/website-and-launch-copy.md) | Bounded landing-page, announcement and short introduction drafts |
| [Business setup and IP checklist](business/business-setup-and-ip-checklist.md) | Entity, authority, finance, IP, regulatory applicability and insurance review |
| [Cash flow and funding](business/cash-flow-and-funding-plan.md) | Assumptions, formulas, funding-gap illustration and spending gates |
| [Quote and order template](business/quote-and-order-template.md) | Scope, itemized charges, exclusions and commercial review; not an invoice or ready-to-sign agreement |
| [Technical and operations index](technical/README.md) | Readiness, deployment/restore, hardware, QA, calibration, privacy, incidents, risks, field SOP and go/no-go |

Business CSVs: [pricing scenarios](templates/business/pricing-scenarios.csv),
[12-month cash flow](templates/business/12-month-cash-flow.csv),
[90-day actions](templates/business/90-day-action-plan.csv),
[discovery](templates/business/customer-discovery-log.csv),
[pilot KPIs](templates/business/pilot-kpi-log.csv),
[partner pipeline](templates/business/partner-pipeline.csv).

Technical CSVs: [calibration](templates/technical/calibration-record.csv),
[device inventory](templates/technical/device-inventory.csv),
[QA results](templates/technical/qa-test-results.csv),
[incidents](templates/technical/incident-log.csv),
[sample custody](templates/technical/sample-chain-of-custody.csv).

## PDF exports

These generated PDFs are convenience copies of the saved Markdown/CSV sources;
edit the source files, then regenerate the PDFs when content changes.

| PDF | Contents |
| --- | --- |
| [Complete launch pack](pdf/Nutri-Scan-Launch-Pack.pdf) | All 35 launch Markdown documents and 11 CSV templates |
| [Business pack](pdf/Nutri-Scan-Business-Pack.pdf) | Business, sales, customer/commercial documents and business CSVs |
| [Technical pack](pdf/Nutri-Scan-Technical-Pack.pdf) | Technical/operations documents and technical CSVs |
| [Student start plan](pdf/Nutri-Scan-Student-Start-Plan.pdf) | Short student-focused first-14-day plan |

The PDF copies are planning/review drafts, not legal agreements or launch approval.
Do not add private customer forms, credentials or raw field data to repository PDFs.

## Working-copy and privacy rules

- Keep these repository files as reusable, redacted templates. Put completed customer
  forms, contracts, contact mappings, actual financials, field evidence and release
  approvals in access-controlled storage outside Git. Do not replace placeholders
  here with private information, credentials, tokens or raw customer data.
- Use the [canonical placeholder register](business/README.md#placeholder-register).
  Technical `PLACEHOLDER_*` values and `.example.invalid` domains are also unresolved.
  A published/signed customer copy must have its own completed, reviewed version.
- CSVs are ordinary UTF-8 tables, not application import files. Illustrative numbers
  are not facts; blank or not-recorded values do not mean zero, pass or calibrated.
  Treat untrusted spreadsheet-like text as text rather than executable formulas.
- All checklists and action statuses begin unverified/unstarted. Documentation
  completion does not complete the work they describe. A scheduled day is not a
  release gate or evidence that someone performed an action.

## Inputs needed before a customer-ready offer

| Decision to supply/verify | Where it is used |
| --- | --- |
| Founder/entity, authority, contact and operating jurisdiction | Business setup, quotation, reviewed legal/data documents |
| First customer farm, operator, sponsor/payer and repeated task | Discovery, proposal, acceptance baseline |
| Actual pilot fee, included effort, exclusions, support and payment/tax treatment | Pricing, cash flow, quote and agreement |
| Actual deployment, providers, privacy roles, retention and closeout operators | Privacy notice, governance and technical gates |
| Demo versus real sensor scope, actual modules and qualified methods | Hardware records, SOP and any separate validation program |
| Named approvals, funded budget, dated QA/restore/access evidence | Scoped go/no-go; not supplied by this pack |

No real outreach, payment collection, company registration, trademark application,
partner execution, deployment or public website publication is performed by saving
these documents. Account recovery/disablement, full erasure and broad production
administration gaps must be resolved for the approved scope; unsupported guarantees
cannot be fixed merely by adding contract language.

## Evidence and review

The [document validation report](validation-report.md) records checks performed for
this pack. Existing [application verification](../fieldwork-verification.md) and
[calibration workflow](../calibration-workflow.md) are historical references, not
new production checks. Before a release, rerun the real application checks on the
identified candidate, test actual devices/environment, and record current results
under the [QA plan](technical/qa-test-plan.md).

**Immediate next action:** assign owners and review the first-week discovery and
cash-budget actions. Choose **proceed / revise / pause** only after the relevant
business and technical gates have evidence; no launch approval is prefilled here.

# Nutri-Scan business plan

> **DRAFT — legal/accounting review required.** Strategy and milestones are hypotheses; dates run from an agreed pilot start, not a promise of readiness.

**Accountable owner:** [FOUNDER NAME], [LEGAL ENTITY] · [CONTACT] · [REVIEW DATE]

## Problem and customer segments

Test whether fragmented batch notes, incomplete readings and disconnected testing reports create repeated work or missed follow-up. Quantify recent examples before proposing software.

| Segment | Job / likely buying condition | Initial priority |
| --- | --- | --- |
| Dairy farm with several silage batches | Retrieve batch evidence, assign checks and coordinate adviser review; named operator and budget owner. | Primary ICP |
| Cooperative or producer organization | Help member farms adopt a consistent workflow. | Introductions/pilot sponsor; cross-farm management console is not present. |
| Independent nutrition adviser | Review farmer-shared records and identify where qualified testing is needed. | Referral/design partner, not an automated adviser replacement. |
| Feed/silage supplier | Preserve lot evidence and handle queries. | Later discovery; no lot certification or dispute guarantee. |
| Qualified laboratory | Receive traceable samples under an agreed protocol and return reference reports. | Validation/service partner, not presumed software buyer. |

## Wedge: silage/feed screening workflow

Lead with one silage storage/batch routine: create identity → record observations → set follow-up → retain testing report. A complete screening is optional and only possible with all required inputs from appropriate sources. This avoids making nutrient instrumentation a prerequisite for basic recordkeeping. Feed is supported, but keep the first pilot's sample type and operator routine narrow.

## Product scope

**Current prototype:** authenticated farm roles; batch/observation/reminder/test-request records; evidence photos; guided reviewed screening; serial protocol capture with device-reported calibration; uncalibrated deterministic scoring; history/trends; HTML/browser-print reports; multilingual guidance; explicit local drafts; public-help PWA shell.

**Contract boundaries:** testing requests are local and manually acted upon; no lab booking, OCR or report interpretation. Photos do not drive AI analysis. All ten scoring inputs remain required. Draft save/load drops instrument provenance; direct online submission preserves selected capture metadata. Private fieldwork writes need connectivity. See the [current contract](../../fieldwork-contract.md).

**Future research, separately gated:** real sensor module validation, calibrated NIR/nutrient targets and lab-labelled evaluation. The [synthetic calibration scaffold](../../calibration-workflow.md) is not an app model or evidence of accuracy. No future research item belongs in a pilot acceptance promise without its own funded protocol.

## Business model

1. Fixed-fee, time-boxed workflow pilot with capped delivery effort and explicit exclusions.
2. Optional per-farm recurring software/support service after measured value and a signed continuation; no automatic renewal assumption.
3. Separately quoted hardware, visits or reference testing where feasible. Show laboratory costs transparently; do not assume referral margins or bundling rights.

Use [pricing hypotheses](pricing-and-unit-economics.md); verify willingness to pay and delivery load before fixing packages. The current farm-scoped app is not a cooperative-wide tenant-management product.

## Competition and positioning

| Alternative | Customer advantage to respect | Nutri-Scan positioning to test |
| --- | --- | --- |
| Notebook / spreadsheet / messaging | Familiar, inexpensive and flexible. | Easier batch retrieval and structured follow-up, measured in the customer's routine. |
| Laboratory testing | Qualified methods and reference results for specific tests. | Organize sampling/report follow-up; complement testing, never replace it. |
| Standalone meter / NIR system | Direct measurements under its validated operating conditions. | Reviewed record capture where protocol-compatible; no equivalence claim. |
| Farm-management software | Established broader farm workflows. | Narrow silage/feed evidence loop; test whether switching/integration burden outweighs value. |
| Adviser-led service | Context and professional judgment. | Shared evidence and history supporting human review. |

No competitor-specific superiority, price comparison or logo is asserted. Discovery should record the actual incumbent and reason to switch.

## Potential moat and evidence needed

- **Workflow fit:** repeat usage with low training/support burden; evidence = cohort retention and task completion.
- **Operational reliability:** traceability, retrieval and repeatable onboarding; evidence = readback, permissions and recovery checks on pilot setup.
- **Partner trust:** defined methods, handling and responsibilities; evidence = reviewed written arrangements, not outreach responses alone.
- **Data learning:** only explicitly authorized, representative and traceable reference data could support later validation. Ownership/permission, label quality and held-out evaluation are prerequisites. No exclusive data or accuracy moat is claimed today.

## Proposed milestones and go/no-go gates

| Window | Deliverable | Gate / evidence |
| --- | --- | --- |
| Weeks 1–2 | Proposed 12 discovery interviews across farm operators, managers and advisers. | Document recent problem instances, existing spend and buyer/payer; revise ICP if no repeated need. |
| Weeks 3–4 | Proposed three qualified pilot discussions. | Named sponsor/operator, lawful data scope, baseline task and reviewed price/terms. |
| Six-week pilot per farm | Bounded one-farm workflow and weekly KPI review. | Customer-agreed [ACCEPTANCE TARGET]; logs distinguish real use from demo/test entries. |
| Within 14 days of pilot end | Outcome review and written continuation decision. | Signed paid scope plus first payment; otherwise document objection/closeout. |
| Separate validation program | Protocol, lab methods, representative paired samples and split manifest. | Predefined target thresholds, locked tests, uncertainty/subgroups and expert release approval; no calendar-based accuracy promise. |

## Principal risks and response

| Risk | Early signal | Owner / response |
| --- | --- | --- |
| Users interpret score as safety clearance | Interview/demo comprehension failure. | [FOUNDER NAME]: restate boundary, change sales emphasis; qualified review remains necessary. |
| Missing nutrient/visual inputs | Screening cannot be completed reliably. | Pilot lead: use observation-only workflow; never invent readings. |
| Weak willingness to pay | Interest without sponsor, signature or payment. | Sales owner: test smaller scope/price; stop free open-ended delivery. |
| Support/hardware costs overwhelm margin | Hours/visits exceed agreed cap. | Delivery owner: log costs weekly and re-scope; no unpriced hardware promise. |
| Connectivity, browser or device failure | Serial unavailable or private saves fail. | Delivery owner: rehearse manual fallback; distinguish unsaved data and offline public help. |
| Data/confidentiality concerns | Unclear permissions, sharing or retention. | [LEGAL ENTITY]: agree purpose/access/export and separate training permission; review deployment. |
| Biased/insufficient validation data | Correlated farms/batches or unit/basis mismatches. | Methods owner with [LAB PARTNER]: freeze protocol, quarantine failed QC and preserve independent test groups. |

Operational next steps: [go-to-market plan](go-to-market-plan.md), [proposal](pilot-proposal-template.md), [launch checklist](launch-checklist.md). All public wording follows the [claims matrix](README.md#claims-matrix).

# Customer privacy notice — review template

> **DRAFT — NOT FOR PUBLICATION.** This describes the reviewed MVP and proposed pilot
> handling; it is not a legal opinion or a compliance certification. The responsible
> organization must complete its roles, jurisdiction, providers, retention and request
> procedures with qualified counsel before collecting real customer data.

**Responsible organization:** [LEGAL ENTITY] · **Privacy contact:** [CONTACT]
**Version/effective date:** [DATE] · **Next review:** [REVIEW DATE]
**Pilot/customer:** [PILOT ID] / [CUSTOMER LEGAL NAME]

## Why we process information

Nutri-Scan is a prototype for recording feed/silage batches, observations, supplied
readings, evidence and follow-up. We process the minimum agreed information to provide
the pilot, manage authorized access, support users and protect/recover the service.
Scoring is uncalibrated and does not certify feed safety or replace a laboratory.

The final notice must identify the applicable organization roles and lawful grounds
for each purpose. A farm owner's authorization does not automatically authorize
processing of everyone else's personal information. Obtain required notices and
permissions before recording workers, laboratory contacts or other individuals.

## What may be recorded and where

| Category | Current behavior / customer choice |
| --- | --- |
| Account and farm | Username, farm name, role, password hash and session records; the browser receives an HttpOnly session cookie, not a plaintext server token in local storage. |
| Farm activity | Batch/sample details, observations and notes, reminders, testing-request contacts/status, readings, results and optional reviewed device provenance. |
| Evidence | Uploaded farm photos and laboratory PDFs/images are private farm records. Normalized photos have metadata stripped, but faces/addresses visible in pixels can remain. Do not upload unrelated or unauthorized material. |
| Local drafts | User/farm-scoped readings and queue metadata remain in that browser until managed by the user. Drafts do not contain passwords, photos or API responses; instrument provenance is stripped. Logout does not guarantee stored drafts/downloads are erased. |
| Public offline help | The production PWA caches allowlisted public assets/help, not private API responses, photos, reports or personalized HTML. |
| Support and recovery | Restricted operator-configured logs/backups and minimized support/incident records; actual providers, location and access must be disclosed below. |
| Billing | Only the information necessary for reviewed invoices/payments. In-app billing is not implemented; never send passwords, card details or banking credentials in a support message. |

## Optional microphone, instrument and sharing features

- **Voice:** requires a deliberate browser permission/action. The browser's speech
  provider may process audio externally and require a network; Nutri-Scan does not
  save audio. Identify the selected browser/provider and its policy before offering
  this feature in the pilot. Manual reading entry remains available.
- **USB serial:** requires port selection and explicit review/confirmation. Device ID,
  capture time, selected units and device-reported calibration can be stored with a
  direct online submission. This is not independently verified calibration.
- **Sharing/export:** review before sending. Downloads, browser PDFs, printouts and
  manually shared summaries/photos create copies outside server role controls.
  Selected recipients/apps apply their own terms. A QR exposes a batch route/identifier,
  not an access token or public safety certificate.
- **Laboratory requests:** stored in the farm only; creating a request does not send
  it to a laboratory. Any manual transfer needs an agreed recipient, purpose and authority.

## Access, hosting and other recipients — complete before issue

| Required disclosure | Approved entry and evidence |
| --- | --- |
| Organization roles and lawful purpose/ground by category | [SUMMARY] / [EVIDENCE LINK] |
| Actual hosting/backup providers, countries and restricted operator access | [SUMMARY] / [EVIDENCE LINK] |
| Authorized farm owner/member/viewer access and staff confidentiality | [SUMMARY] / [EVIDENCE LINK] |
| Payment/support/speech providers actually used and their purposes | [SUMMARY] / [EVIDENCE LINK] |
| Any international transfers and applicable review/safeguards | [SUMMARY] / [EVIDENCE LINK] |
| Required disclosures to authorities and applicable process | [SUMMARY] / [EVIDENCE LINK] |

No research/model-training reuse, sale, cross-customer disclosure, testimonial, logo or
public case study is authorized by this notice alone. Use the separate
[permission form](data-permission-and-publicity-form.md); do not bundle optional
permission into access to the core pilot.

## Retention, requests and security limits

Approved pilot retention: [RETENTION PERIOD]; exit/export window: [EXPORT WINDOW].
Before issue, attach a category-specific schedule covering accounts, farm records,
attachments, drafts, exports, logs, backups and any separately authorized research.
The [operations proposal](../technical/data-governance-and-privacy.md) suggests starting
periods; these are **not an implemented automatic retention policy**.

Contact [CONTACT] for access/correction/export, permission withdrawal or deletion
requests. We must verify identity/authority without asking for passwords or cookies.
The final notice must explain applicable rights, acknowledgment/response timing,
complaint/escalation route and any legally required retention exceptions. The MVP
does not offer complete self-service bulk export, farm erasure or account disablement.
Only promise a manual process once its scope, operator and reliability are approved.

Backups and recipient-held exports can remain until approved expiry or disposal;
do not promise immediate complete erasure or remote recall of shared files. Any
restore must reconcile approved deletions before reopening access. Users should
resolve unsynced drafts before clearing local storage and protect shared devices.

Farm roles and private routes are prototype controls, not an audited-security claim.
Real-data use requires HTTPS, secure session configuration, restricted administrative
access, tested backup/restore and the approved incident process. No system is
represented as risk-free or already certified compliant.

## Publisher checklist — all unverified

- [ ] Identity, contact, jurisdiction, organization roles and applicable grounds confirmed.
- [ ] Actual providers/locations, optional speech handling and transfers disclosed.
- [ ] Retention, manual rights/closeout process and incident responsibilities tested.
- [ ] Optional permissions remain separate, granular and initially unset.
- [ ] Counsel review, accessible language and version/change notification approved.
- [ ] Final notice issued before collection; evidence of delivery kept privately.

**Reviewer/decision:** [OWNER] / [DATE] / [STATUS] / [EVIDENCE LINK].

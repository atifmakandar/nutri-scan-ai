# Launch pack document validation

**Review date:** 2026-10-15

**Status: document checks passed.** This records checks run for these saved planning
materials, not product-release approval, legal/accounting advice, a security audit or
scientific validation. Application behavior was not changed for this documentation task.

## Saved scope

- 46 launch artifacts: **35 Markdown documents and 11 CSV templates**.
- One master index, business/customer/commercial drafts, technical/operations pack,
  reusable records, worked financial scenarios and a proposed 90-day action tracker.
- A student-founder start plan covering mentor/team formation, three farmer
  interviews, a proposed 14-day target and a low-spend, observation-first approach.
- Four generated convenience PDFs are saved under `docs/launch/pdf/`: the complete
  launch pack, business pack, technical pack and student start plan. They contain
  source documentation only; regenerate them after Markdown/CSV edits.

PDF generation used the locally available Playwright Chromium renderer. The outputs
were opened as valid PDF 1.4 files and ended with `%%EOF`: launch pack (8 pages),
business pack (8 pages), technical pack (8 pages), and student plan (4 pages).
Page counts were independently checked with the system `file` utility; generated
PDFs are convenience exports, not the editable source of truth.
- Root `README.md` linked to the pack and clarified to distinguish current input
  adapters/prototype scoring from the presentation's future architecture.
- No company registration, public publication/deployment, outreach, partner execution,
  payment collection or actual launch approval performed.

## Consolidated checks actually run

An external, session-local read-only validator was run from the repository root with
an equivalent Python command. The validator is intentionally not part of the project
runtime or source tree:

```bash
python3 <temporary-launch-pack-validator>.py
```

This temporary validator is diagnostic tooling for the current workspace, not an
application dependency or a portable file shipped in the launch pack. Its checks:

- Resolve local Markdown destinations and heading anchors in the launch pack plus
  root README navigation; ignore illustrative timestamp syntax inside inline code.
- Confirm every launch artifact is reachable from the master index; check Markdown
  table widths/separators, balanced fenced blocks and trailing whitespace, including
  new/untracked files that Git's whitespace check alone would miss.
- Parse all CSVs with strict quoting and consistent row widths/unique headers;
  reject obvious formula-leading and nonfinite cells. Values stay synthetic,
  illustrative or placeholder-labelled rather than fabricated customer records.
- Check square-bracket business placeholders against the 46-token canonical register;
  verify action dates/dependencies/statuses and that no checklist is pre-approved.
- Recalculate all four pricing scenarios with decimal arithmetic: variable cost,
  contribution, margin, ceiling break-even count and CAC payback.
- Recalculate all 12 cash-flow rows and roll-forwards: active/new/churned farms,
  receipts, delivery/acquisition costs, net cash flow, closing cash and cumulative gap.
  The worked scenario first goes negative in month 5 and ends at −₹841,382.46;
  this is not a forecast or a verified financing need.
- Parse shell examples with `bash -n` without running deployment, deletion, migration
  or service commands; parse embedded Python and JSON examples without operating them.
- Extract the synthetic sales-demo frame (using a fixed aware timestamp for this
  check) and pass it through the current frontend `parseInstrumentFrame` in Node;
  verify four readings, unknown calibration and humidity unit `%`.
- Scan launch files for common private-key/token/credential-URL patterns. This is a
  bounded heuristic check, not proof that a repository or a deployment has no secrets.
- Run `git diff --check`; it passed. All launch files are separately whitespace-checked.

The first run identified five Markdown hard-break trailing-space lines in the outreach
draft; these were converted to blank-line breaks. A timestamp-format expression was
initially misread as a link by the diagnostic parser; inline-code handling was corrected.
The consolidated rerun passed after those changes.

## Claims and review boundaries

Customer-facing one-pager, business plan, pricing, pilot terms, sales script, FAQ,
outreach and website copy were reviewed against the pack's claims matrix. Drafts
explicitly distinguish uncalibrated scoring, synthetic firmware, evidence-only photos,
local laboratory requests, in-app reminders, public-help offline reload and private
data needing connection. No lab accuracy, toxin detection, certified calibration,
diagnosis, feeding guarantee or automatic laboratory booking is represented as available.

Prices/costs/volumes remain illustrative. Legal/privacy documents are drafting aids,
not executed agreements or an implemented retention/deletion service. Completed forms,
real customer contacts, financial records and release evidence belong outside Git.

## Not rerun or established by this task

- Backend/frontend/calibration application suites, production build and live browser
  flows were **not rerun** solely for these documentation edits. Prior results are
  recorded in `docs/fieldwork-verification.md` and `docs/calibration-workflow.md`.
- Shell/Python syntax checks do not prove deployment, restore, Nginx configuration,
  firmware compilation, real USB/microphone behavior or production compatibility.
- External URLs, provider identity/qualification, customer demand, tax/regulatory
  applicability, insurance, actual costs and available cash were not independently verified.
- Founder details, approved prices/dates, customer scope, professional review and
  real-device/security/restore evidence remain required before customer-ready use.

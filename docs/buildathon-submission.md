# NutriScan AI — buildathon submission pack

Use this document as the final submission and presentation checklist. It is written
for the current working prototype, so it keeps the product story strong without
claiming laboratory accuracy or automated toxin detection.

## Project title

**NutriScan AI — traceable feed and silage screening for safer dairy decisions**

## One-line pitch

NutriScan turns scattered farm readings into a guided, explainable prototype
screening workflow with review flags, practical advisories, private farm history,
and a clear path to calibrated sensor and laboratory models.

## The problem

Dairy farmers often make feed decisions using paper notes, disconnected readings,
and incomplete batch history. A suspicious batch can be difficult to identify,
compare, or share with an adviser quickly.

## The solution

NutriScan provides one field workflow:

```text
Create batch → review readings → screen → understand factors → act → retrieve history
```

The product:

- requires ten baseline readings instead of silently guessing missing values;
- validates units and ranges before submission;
- applies a transparent weighted prototype baseline;
- separates the prototype risk band from safety-critical review flags;
- stores farm-scoped traceability history in SQLite;
- supports reports, batch comparison, multilingual guidance, offline drafts,
  evidence-only photos, and reviewed USB serial input;
- keeps every prototype limitation visible to the operator and judges.

## What makes it different

1. **Explainability first:** the result includes the factor score, weight, and
   contribution instead of presenting an opaque confidence number as truth.
2. **Safety separation:** reported aflatoxin, urea, fungal, mineral, and silica
   concerns produce a prominent independent review banner. A low prototype score
   never hides a concern input.
3. **Field traceability:** batch identity, saved readings, advisories, reports,
   and comparison history stay together for one farm.
4. **Honest hardware path:** reviewed ESP32 serial capture preserves device
   provenance without pretending that demo firmware is calibrated telemetry.

## 90-second demo flow

1. Open the deployed app and sign in with the prepared demo account.
2. Select **Check feed or silage**.
3. Continue to **Choose batch** and click **Load synthetic demo scenario**.
4. Show the clearly labelled `DEMO-SILAGE-01` batch and the synthetic-data notice.
5. Advance to **Review and submit**. Check the confirmation box and submit.
6. Point out the prototype score and the separate **Review required before feeding
   decisions** banner.
7. Expand **Transparent score breakdown** and explain pH, moisture, nutrition, and
   visual factors with their weights and contributions.
8. Show the saved batch in history, then open the report or comparison view.
9. End on the disclaimer: this is decision support, not a certified laboratory
   result or feed-safety clearance.

### Demo narration

> Farmers should not have to combine paper notes and scattered readings to decide
> what happens to a feed batch. NutriScan keeps the batch, readings, screening,
> explanation, advisory, and history in one workflow. The demo scenario is
> explicitly synthetic and still passes through the normal review gate. The result
> shows a transparent prototype score, while a reported safety concern is surfaced
> independently for qualified confirmation. NutriScan does not claim to replace a
> laboratory; it makes field evidence more consistent, traceable, and actionable
> today, with calibrated NIR, camera, and laboratory-labelled models as the next
> validation step.

## Judge criteria mapping

| Criterion | Evidence to show |
|---|---|
| Problem impact | The farmer story: scattered readings, missing history, slow adviser handoff |
| Innovation | Transparent factor contributions plus independent review-required safety flags |
| Technical execution | React/Vite dashboard, FastAPI API, SQLite persistence, strict validation, PWA/offline drafts |
| Usability | Four-step farmer flow, measurement help, English/Hindi/Marathi copy, explicit empty/error states |
| Responsible AI | Uncalibrated status, no fabricated readings, evidence-only photos, no toxin-detection claim |
| Scalability | Device provenance contract, calibration scaffold, future NIR/CV adapters, PostgreSQL direction |

## Submission links and files

- Product source: repository root
- Demo script: `docs/demo/buildathon-demo-script.md`
- Rendered demo: `docs/demo/NutriScan-AI-Buildathon-Demo.mp4`
- Presentation: `FeedIQ_SIH_Presentation.pptx`
- Architecture: `docs/architecture.md`
- Capability/claims matrix: `docs/capability-matrix.md`
- Same-day runbook: `docs/today-demo.md`

## Final pre-submit checklist

- [ ] Production URL opens in a private/incognito window.
- [ ] Demo account credentials are available to the team and not committed to git.
- [ ] The synthetic demo action is visible and the review checkbox is still required.
- [ ] The result, review banner, score breakdown, history, and report all load.
- [ ] The presentation fits the event time limit.
- [ ] A two-minute backup video is downloaded locally.
- [ ] No API keys, passwords, `.env` files, private farm data, or local database files are submitted.
- [ ] Every technical claim matches the capability matrix.
- [ ] Submission is completed before the deadline, not during the presentation.

## Required honesty statement

NutriScan AI is a working field-screening prototype. Its score is an uncalibrated
deterministic baseline; its confidence is a heuristic indicator; photos are private
evidence only; optional nutrition and concern values are operator- or
laboratory-supplied; and reviewed ESP32 capture is a transport demonstration.
Production nutrient prediction, contamination detection, safety decisions, and
laboratory-equivalent claims require real sensors, laboratory-labelled data,
calibration, held-out farm testing, uncertainty analysis, and qualified review.

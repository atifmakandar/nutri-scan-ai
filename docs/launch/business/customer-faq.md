# Customer FAQ

> **DRAFT — legal/accounting review required.** Use with the [claims matrix](README.md#claims-matrix); customer-specific fees, support and data terms need review.

**Contact:** [CONTACT] · [LEGAL ENTITY] · **Review:** [REVIEW DATE]

## What can Nutri-Scan help us do today?

Record feed/silage batches, private evidence photos, observations, in-app follow-up tasks and local testing-request/report records. The prototype also supports reviewed complete-input screening, saved history, trends and HTML/browser-print reports. Start with the task your team needs to retrieve or follow up.

## Is a score a laboratory result or permission to feed?

No. Scoring is a transparent, uncalibrated prototype. Quality/risk, nutrient-related scores, fermentation/spoilage labels and heuristic confidence are not validated measurements, probabilities, diagnoses or safety guarantees. Even a LOW result does not clear feed for use. Seek a qualified adviser and appropriate confirmatory testing for concerns.

## Does it detect toxins, adulterants or disease?

No toxin detection, aflatoxin/mycotoxin detection, certified adulteration detection or diagnosis is offered. Operator observations and numerical visual indicators do not establish presence or absence of contamination. A photo is evidence, not an AI diagnosis.

## Does my phone or the ESP32 measure protein, fiber or energy?

Not in this demo. The app accepts numerical nutrient inputs; it does not produce them from a photograph or the default ESP32 sketch. Real nutrient entries must come from a suitable report/instrument with the right method, units and basis. Do not substitute NDF/ADF for crude fiber. Energy prediction is not a validated current capability.

## What if we do not have all readings?

All ten inputs are required for scoring: moisture, pH, temperature, humidity, protein, dry matter, crude fiber, mould indicator, colour anomaly and surface damage. Do not guess or replace missing values with zero. Use **Quick observations** instead: Yes/No/Unknown records are explicitly observation-only and have no screening score. Real visual scoring requires a defined, reviewed method and trained operator.

## Is the device calibrated? Which meters work?

Calibration status is reported by the device, not verified or certified by Nutri-Scan. The emulator/default firmware uses synthetic values and `unknown` calibration. Supported capture requires the documented newline JSON protocol, units and 115200 baud on a compatible Chromium browser at HTTPS/localhost. A particular real meter/sensor needs separate compatibility and method checks; manual entry remains available.

## Will a lab receive my testing request automatically?

No. **Testing help** tracks a farm-local request, collection date and report. You or an agreed human coordinator must contact the chosen provider separately. There is no automatic lab booking, directory, OCR or report interpretation. Qualified providers set sample requirements, fees and turnaround; none is assumed here.

## What works offline?

The production PWA caches public shell/help, including public English/Hindi/Marathi help, not private API data, photos, reports or sign-in details. In an already-loaded signed-in app, deliberately saved complete-reading drafts can be queued locally; reconnect and press **Sync now**. Reconnection alone does not upload. Instrument provenance is not retained in draft save/load; use direct online submission to preserve reviewed capture metadata. Private fieldwork writes need connectivity.

## Who sees our farm data? What happens when we share?

The current app uses farm-scoped roles: owners/members can write, viewers are read-only. QR links still require sign-in. Review report contents and sharing previews before sending outside the farm; shared files/text can be retained by recipients. Photos are evidence only. These prototype controls do not imply a security audit or certification. Deployment, access, backup and recovery responsibilities must be agreed for each pilot.

## Who owns our records, and may they train a model?

Proposed terms retain customer rights in its supplied farm records, subject to third-party rights; [LEGAL ENTITY] retains its software. Record [DATA USE PERMISSION] explicitly. Training, research, onward sharing and publicity require separately agreed permission and applicable review; they are not presumed from app use. Agree [RETENTION PERIOD] and [EXPORT WINDOW]. Current HTML reports/individual downloads are not a promise of self-service bulk export or deletion.

## Can the app remind us by SMS or give professional advice?

Reminders are in-app tasks, not SMS/background notifications. Guidance and English/Hindi/Marathi translations are prototype material requiring qualified review. Listening and voice entry depend on browser/device support; voice may use network speech services, proposes a reviewed value and never submits a scan. No nutrition prescription, diagnosis or professional service is included by default.

## What does a pilot cost and what happens afterward?

Customer quote: [PILOT PRICE] for the written scope; optional continuation: [MONTHLY PRICE] per farm/month. [PAYMENT TERMS] and [TAX TREATMENT] require review. The [financial model](pricing-and-unit-economics.md) contains illustrative hypotheses only. Hardware, laboratory work and extra visits are separately scoped. Continuation requires a separate written decision; no silent renewal.

## What support and results can we expect?

Agree [SUPPORT HOURS], [RESPONSE TARGET], support contact [CONTACT] and measurable [ACCEPTANCE TARGET] before kickoff. Evaluate adoption, retrieval and follow-up, not feed-safety outcomes. No production uptime, regulatory certification, lab accuracy or savings guarantee is offered. See the [proposal](pilot-proposal-template.md) and [non-legal agreement discussion template](pilot-agreement-template.md).

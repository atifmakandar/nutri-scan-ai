# NutriScan capability matrix

NutriScan is a buildathon-grade field workflow prototype. It records supplied
measurements, keeps batch traceability, applies transparent prototype rules, and
generates qualified-review advisories. It does not claim laboratory-equivalent
measurement or safety certification.

## Included in the current demo

| Requested area | Current implementation | Honest claim |
| --- | --- | --- |
| Nutritional quality | Moisture, dry matter, protein, crude fiber, plus optional reported energy, calcium, and phosphorus | Records operator/report values and calculates an uncalibrated indicator. No validated nutrient prediction. |
| Silage quality | pH, moisture, temperature, humidity, fermentation/spoilage prototype signals | Uses supplied spot-check readings. Not a validated fermentation or spoilage test. |
| Adulteration | Optional operator/report concern inputs for urea and sand/silica | Flags inputs for qualified confirmation. Does not detect, rule out, or certify adulteration. |
| Toxins | Optional aflatoxin concern input | Stores a concern for review. Does not test for aflatoxin or mycotoxins. |
| Fungal contamination | Mould indicator and optional fungal concern input; private photos remain evidence only | Supports operator-reported evidence and advisories. No image diagnosis, fungal identification, or toxin result. |
| Storage conditions | Storage metadata, manual condition readings, saved history, batch comparisons, reminders | Provides spot-check history. Not continuous IoT monitoring or automatic background alerting. |
| Advisories | Explainable prototype anomalies, next steps, and qualified-testing guidance | Decision support only; low risk is not feed-safety clearance. |
| Portable / IoT path | Reviewed ESP32 serial transport contract and demo emulator | Demonstrates transport and review. Sensor calibration and conversion remain integration work. |
| Offline use | Public help plus complete signed-in reading drafts and explicit sync | Private history, fieldwork, photos, and reports still require connectivity. |
| Multilingual UI | English, Hindi, and Marathi interface/help copy | Draft translations; qualified safety-language review is still required. |
| Traceability | Farm-scoped accounts, batch IDs, timestamps, reports, evidence, QR route state | Server-backed local MVP using SQLite; not production cloud durability or laboratory chain-of-custody. |

## Local validation and operations extension

The current local prototype also includes a review loop around the screening
workflow:

| Extension | Available now | Boundary |
| --- | --- | --- |
| Laboratory confirmation | Manually transcribe text values such as `<0.1`, `trace`, or `not detected` from an uploaded report | The app does not read, validate, accredit, or interpret the laboratory report. |
| Measurement provenance | Reviewed instrument captures retain device, time, selected readings, and device-reported calibration state | A reported capture is not proof of sensor accuracy or calibration. |
| Device registry | Farm-scoped device records and operator/reviewed-capture health entries | No live heartbeat, MQTT ingestion, firmware verification, or automatic offline claim. |
| Review alerts | Persisted, deduplicated prototype threshold prompts with acknowledgement state | Alerts are review prompts, not safety limits or confirmed detection results. |
| Audit history | Append-only local application mutation events with redacted metadata | This is not a tamper-proof infrastructure audit or complete laboratory chain of custody. |

These records are implemented as a local SQLite extension so the user flow can
be demonstrated and tested before selecting PostgreSQL, object storage, device
transport, notification providers, or laboratory integrations.

## Explicitly not claimed

The prototype does not detect or certify urea adulteration, mineral deficiency,
sand/silica, aflatoxins, mycotoxins, fungal contamination, energy value, or milk
production impact. Those capabilities require analyte-specific hardware or methods,
paired laboratory reference data, calibration, held-out farm validation, detection
limits, false-negative analysis, and expert release review.

## Buildathon walkthrough

1. Create a farm account and a feed/silage batch.
2. Enter the ten required supplied readings.
3. Expand **Reported nutrition & safety concerns** and optionally enter reported
   energy/mineral values or concern inputs.
4. Review the values before submission.
5. Show the prototype score, capability-input review flags, advisories, and the
   prominent laboratory disclaimer.
6. Save the scan, open history, compare a later spot-check, and export the report.
7. Use fieldwork observations for unknown/observation-only checks; do not present
   them as a score or lab result.

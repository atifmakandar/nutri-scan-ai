# Sales demo — today's app and ESP32-compatible emulator

> **DRAFT — legal/accounting review required.** Customer-facing wording must follow the [claims matrix](README.md#claims-matrix). This is a rehearsal script based on current sources, not a record that a live demo was run for this pack.

**Presenter:** [FOUNDER NAME] · [CONTACT] · **Review:** [REVIEW DATE] · **Duration:** approximately 12 minutes plus optional calibration/offline segment.

## Before the meeting

1. Follow the existing [same-day runbook](../../today-demo.md) for services: frontend `http://localhost:5173`, API `http://localhost:8000`. Use an existing suitable environment; this script needs no added package for the emulator.
2. Use a dedicated demo farm/account, synthetic records and a clearly labelled demo PDF/photo. Prepare a 10+ character password privately; do not put it in slides or CSVs.
3. Rehearse on supported Chromium with Web Serial on localhost/HTTPS. Confirm browser/OS port availability; a PTY may not appear on every setup. Have manual-entry fallback ready and say when it is used.
4. For PWA-only extras, use an already prepared production preview at `http://localhost:5174` per the runbook. Do not promise offline private records.
5. Start the Linux PTY emitter below in a terminal and retain its printed `/dev/pts/...` path. Stop with Ctrl-C after the demo. It emits fixed **synthetic** values with a timestamp generated at emitter startup, not measurements.

```bash
python3 - <<'PY'
import json, os, pty, time
from datetime import datetime

master, slave = pty.openpty()
print(os.ttyname(slave), flush=True)
frame = {
    "device_id": "host-emulator-01",
    "captured_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    "calibration_status": "unknown",
    "readings": [
        {"field": "moisture_pct", "value": 62.0, "unit": "%"},
        {"field": "ph", "value": 4.2, "unit": "pH"},
        {"field": "temperature_c", "value": 24.0, "unit": "°C"},
        {"field": "humidity_pct", "value": 68.0, "unit": "%"},
    ],
}
line = (json.dumps(frame, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
try:
    while True:
        os.write(master, line)
        time.sleep(1)
except KeyboardInterrupt:
    pass
PY
```

For a physical board, follow the [firmware guide](../../../firmware/esp32/README.md): default `DEMO_MODE=true`, calibration unknown, manual capture timestamp refreshed. Default firmware emits demo values, sends no HTTP request and accepts no serial commands. Replacing conversion hooks and validating real sensors is separate work.

## Walkthrough and exact talk track

| Time | Action | Say / check |
| --- | --- | --- |
| 0:00–1:00 | Open app; identify demo farm. | “These are synthetic demo records. Nutri-Scan organizes silage/feed evidence and demonstrates uncalibrated prototype screening. It does not establish feeding safety.” Ask who currently records and reviews batches. |
| 1:00–3:00 | Open **Farm fieldwork** / **Batches, observations, reminders and testing help**. Create `DEMO-SILAGE-01`, name `Maize silage — West shed`, sample `Silage`, location `West shed`. Save/view a demo photo. | “This batch has a persistent identity. Photos are private evidence, not AI analysis.” Confirm the saved record can be read back. |
| 3:00–4:00 | **Quick observations**: leave unexamined answers **Unknown**, save. | Show **Observation only — no screening score**. “You can record observations without inventing measurements. Unknown is not No; concerns need qualified review.” |
| 4:00–5:00 | Add a reminder; complete/reopen it. In **Testing help**, create a farm request with clearly fictional demo contact text. Mark collected, upload/download a trusted demo PDF and mark report received. | “Reminders are in-app tasks. This request is tracked here, not sent or booked with a lab. The uploaded report is downloaded, not automatically interpreted.” A report attachment is required before report-received status. |
| 5:00–6:00 | Choose batch **Use this batch**, then **Check feed or silage** and reach **Enter readings**. | “Only batch identity is copied. Old readings do not carry over, and all ten screening inputs are required.” |
| 6:00–8:00 | Open **Read from instrument (USB serial)**; acknowledge protocol/115200 baud; **Choose port and capture**; select printed PTY. | “This is a software emulator of the ESP32-compatible newline JSON transport, not a sensor measurement.” Review `host-emulator-01`, time, units and **Unknown calibration (device report)**. Select the four readings, acknowledge review, press **Confirm selected readings**. Nothing auto-submits. |
| 8:00–9:00 | Enter the six remaining synthetic fields from the table below. Review all values, confirm and submit directly online. | “These additional values are illustrative. A real screening needs suitable measured nutrient inputs and a defined operator method for visual scores; photos do not populate them.” |
| 9:00–10:30 | Expand saved result details/provenance, refresh/read back history, download HTML report or use browser **Print / Save PDF**. | “Score, risk, fermentation/spoilage labels and confidence are heuristic outputs from supplied inputs, not validated laboratory findings or probabilities. LOW is not clearance to feed. Selected instrument metadata is retained on this direct online submission.” |
| 10:30–12:00 | Return to useful task, ask for pilot baseline and sponsor. | “Would a six-week pilot of batch retrieval and follow-up be useful? Which task should we measure, who operates it, and who approves payment?” Use [proposal](pilot-proposal-template.md); price remains [PILOT PRICE] until reviewed. |

**Synthetic supplemental inputs — demo only, never field defaults:**

| Field | Illustrative value | Meaning in demo |
| --- | ---: | --- |
| Protein | 8.8% | Typed synthetic nutrient input, not ESP32 prediction. |
| Dry matter | 38% | Typed synthetic nutrient input. |
| Crude fiber | 28% | Typed synthetic nutrient input; not NDF/ADF. |
| Mould indicator | 0.08 | Typed synthetic score on 0–1 scale, not a toxin test. |
| Colour anomaly | 0.05 | Typed synthetic visual score. |
| Surface damage | 0.02 | Typed synthetic visual score. |

## Optional two-minute extensions

- **Calibration:** follow the [calibration run command](../../calibration-workflow.md#run-the-synthetic-demonstration), writing only to an appropriate temporary output. Show `synthetic_demo_not_for_field_use`, farm-group splits, MAE/RMSE/bias/R² and train-only fitting. Say: “This demonstrates evaluation mechanics. Coefficients are not integrated into the app and do not validate its accuracy.”
- **Offline:** show public multilingual help on the prepared production PWA. In an already-loaded signed-in app, explain deliberate complete-reading draft save/queue and explicit **Sync now**. Drafts discard instrument provenance; do not use that path to demonstrate retained device metadata. Private history, photos, reports and fieldwork saves need reconnection/authentication.
- **Languages/voice:** English/Hindi/Marathi text and optional listening/voice entry depend on browser/device support; translations need qualified review. Voice proposes reviewed readings and never submits them.

## Failure handling and close

- If serial is unsupported, unavailable, denied, malformed or times out, disclose the failure and use manual entry of the labelled synthetic values. Do not describe the fallback as successful serial capture. Never fill missing real data with demo numbers.
- If private save/readback fails, show the error and retry after connectivity is restored; do not claim persistence before readback. If printing is blocked, download HTML and use the browser print path.
- Preview any sharing action and use synthetic content only. A QR is an authenticated batch link, not public access or a safety certificate.
- Ask the prospect to explain three limits: prototype output, emulator data, and local-only testing requests. Log misconceptions and next action in the [discovery log](../templates/business/customer-discovery-log.csv).

**Approved close:** “Nutri-Scan demonstrates reviewed ESP32-to-browser acquisition, batch records, observations and follow-up. Real nutrient prediction and contamination-related claims require suitable methods, laboratory-labelled data and separate validation. This demonstration offers no lab accuracy, toxin detection, certified calibration, diagnosis, guaranteed safety or automatic lab booking.”

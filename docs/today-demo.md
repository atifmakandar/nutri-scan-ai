# Nutri-Scan — same-day demo runbook

This runbook produces a complete **demo-ready** software + ESP32 serial story
today. It does not claim lab accuracy. The supplied ESP32 sketch is intentionally
in `DEMO_MODE`; use the PTY emulator if a board/sensor set is not connected.

## 1. Start the services

The normal services are already usable when these ports respond:

```text
Frontend development: http://localhost:5173
Backend:              http://localhost:8000
Production PWA preview: http://localhost:5174
```

If needed:

```bash
# Terminal 1
cd ~/nutriscan/nutri-scan-ai/backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2
cd ~/nutriscan/nutri-scan-ai/frontend
npm run dev -- --host 0.0.0.0
```

For installation/offline demonstration, build and preview in another terminal:

```bash
cd ~/nutriscan/nutri-scan-ai/frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 5174 --strictPort
```

## 2. Run the complete farmer demo

1. Open `http://localhost:5173` and hard-refresh.
2. Create a farm account with an email-style username and a 10+ character password.
3. Open **Farm fieldwork** and create a batch, for example:
   - Batch ID: `DEMO-SILAGE-01`
   - Name: `Maize silage — West shed`
   - Sample type: `Silage`
   - Storage location: `West shed`
4. Add a private batch photo and confirm it can be viewed after saving.
5. Open **Quick observations**. Leave unchecked items as **Unknown**, save the
   observation, and show the explicit **Observation only — no screening score** label.
6. Create a reminder, mark it complete, then reopen it.
7. Open **Testing help**. Create a farm-local testing request, mark it collected,
   upload a demo PDF report, download it, and mark the request report received.
8. Open **Check feed or silage**. Use the batch card’s **Use this batch** action.
   Only the batch identity is copied; the old readings are not copied.

## 3. Use the serial emulator without hardware

In a third terminal from the repository root, run the no-dependency PTY emulator:

```bash
cd ~/nutriscan/nutri-scan-ai
python3 - <<'PY'
import json, os, pty, time

master, slave = pty.openpty()
print(os.ttyname(slave), flush=True)
frame = {
    "device_id": "host-emulator-01",
    "captured_at": "2026-10-15T12:00:00+05:30",
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

Copy the printed `/dev/pts/...` path. In Chrome at `localhost:5173`:

1. Start a screening and reach **Enter readings**.
2. Open **Read from instrument (USB serial)**.
3. Confirm the protocol and 115200 baud.
4. Click **Choose port and capture** and select the printed PTY device.
5. Review the device ID, timestamp, units, and values.
6. Select only the readings to apply.
7. Confirm the selection.
8. Complete any remaining fields manually.
9. Review and submit the screening.
10. Expand result details and show the saved device provenance.

The browser does not automatically submit the scan. Stop the emulator with `Ctrl-C`.

## 4. Use a physical ESP32

Open `firmware/esp32/esp32_sensor_template.ino` in Arduino IDE with the ESP32
core. Before uploading:

1. Set `MANUAL_CAPTURED_AT` to the current timezone-aware timestamp.
2. Keep `DEMO_MODE = true` for a software demonstration, or replace every marked
   sensor conversion hook with the actual validated modules first.
3. Never connect a raw pH probe or 5 V output directly to an ESP32 ADC pin.
4. Configure the correct board and USB port.
5. Upload and open the serial monitor at 115200.
6. Confirm every line is one valid JSON object.
7. Choose the board’s serial port in the same browser flow above.

The default sketch does not use Wi-Fi, does not contain credentials, does not POST
automatically, and does not accept serial commands.

## 5. Show the AI/calibration story

Run the transparent synthetic calibration scaffold:

```bash
cd ~/nutriscan/nutri-scan-ai
python3 -m unittest discover -s tools/calibration -p 'test_*.py' -v
python3 tools/calibration/calibrate.py \
  --input tools/calibration/sample_reference.csv \
  --output /tmp/nutriscan-calibration-demo.json \
  --fit-calibration
python3 -m json.tool /tmp/nutriscan-calibration-demo.json
```

Explain that the report contains `data_status:
synthetic_demo_not_for_field_use`. It demonstrates cleaning, farm-group splits,
MAE/RMSE/bias/R², and train-only linear fitting. It is not a trained field model.

## 6. Final demo statement

Use this wording:

> Nutri-Scan demonstrates a portable ESP32-to-browser acquisition workflow for
> moisture, pH, temperature, and humidity, combined with reviewed farmer inputs,
> traceable storage, prototype scoring, observations, advisories, and offline
> public help. Nutrient prediction and contamination detection require calibrated
> NIR/biosensor methods and laboratory-labelled data before making lab-equivalent
> or feed-safety claims.

## What is not completed by a same-day software demo

- Laboratory-equivalent accuracy
- Validated crude protein/fiber/energy prediction
- Certified urea, mineral, sand/silica, aflatoxin, or mycotoxin detection
- Calibrated physical sensor modules across real feed varieties
- Expert approval for feeding or safety decisions

Those require real sensors, reference samples, qualified laboratory results,
controlled calibration, held-out farm/batch testing, uncertainty analysis, and
expert sign-off. See `docs/calibration-workflow.md`.

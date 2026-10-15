# Nutri-Scan ESP32 serial demo

This folder contains a deliberately small ESP32 Arduino template for today's
Nutri-Scan demo. The default transport is USB serial, not WiFi:

- **Serial:** 115200 baud, 8 data bits, no parity, 1 stop bit, no flow control.
- **Wire format:** UTF-8 JSON, exactly one object followed by LF (`\n`) per loop.
- **Frontend contract:** `INSTRUMENT_PROTOCOL v1` in
  `frontend/src/reading-assist.js`.
- **Device behavior:** emits frames; it accepts no commands and does not wait
  for a browser request.
- **Default interval:** one frame per second, within the frontend's 15-second
  capture window.

## Demo safety

`DEMO_MODE` is `true` in `esp32_sensor_template.ino`. Its values are
illustrative demo values only; they are **not field or lab measurements** and
must be replaced with validated sensor reads before any real use. The emitted
`calibration_status` is intentionally `unknown`.

The sketch omits a reading when a non-demo hook returns a non-finite or
out-of-range value. The ReadingAssist frontend requires at least one valid
reading, so a real integration must implement and validate the sensor hooks
before switching `DEMO_MODE` to `false`.

## Timestamp and device ID

There is no RTC or network time synchronization in this template. Before each
demo/build, set `MANUAL_CAPTURED_AT` to the actual capture time, including the
local UTC offset, for example:

```cpp
const char *MANUAL_CAPTURED_AT = "2026-10-15T12:00:00+05:30";
```

Use the required timezone-aware form
`YYYY-MM-DDTHH:mm:ss[.fraction](Z|+/-HH:mm)`. A stale manual timestamp is not a
measurement timestamp and must be updated for the demo.

The device ID is generated from the ESP32 eFuse MAC as
`nutriscan-esp32-<hex>`. It contains no WiFi credential or secret. The ID is
stable for a board but is not an authentication mechanism.

## Wiring and conversion hooks

The GPIO values are explicit, editable placeholders near the top of the
sketch:

- `PH_ADC_PIN` (default GPIO 35): conditioned pH-interface ADC output. Do not
  connect a raw pH probe or a 5 V signal directly to an ESP32 ADC pin.
- `MOISTURE_ADC_PIN` (default GPIO 34): validated moisture-module analog
  output, with common ground and a signal in the ESP32 ADC input range.
- `DHT_DATA_PIN` (default GPIO 4): placeholder digital pin for a DHT-like
  temperature/humidity sensor.
- `BME_SDA_PIN` / `BME_SCL_PIN` (default GPIO 21/22): placeholder I2C pins for
  a BME-like temperature/humidity sensor.

`readMoisturePct()` and `readPH()` show `analogRead()` conversion hooks only.
Their raw-count constants and pH transfer function are placeholders, not
calibration data. Replace them with the validated sensor module's transfer
function, ADC attenuation/configuration, and calibration procedure.

`readTemperatureC()` and `readHumidityPct()` return invalid values outside demo
mode until a validated DHT/BME-like library integration is added. No actual
temperature or humidity measurement is claimed by this template.

## Compile and upload

Open `esp32_sensor_template.ino` with the standard Arduino ESP32 core and
select the correct ESP32 board and USB port. Upload it, open the serial monitor
at **115200**, and confirm that each line is a complete JSON object. This
environment may not have the Arduino toolchain, board package, or target board;
conceptual compatibility is limited to standard Arduino ESP32 APIs (`Arduino.h`,
`analogRead`, `analogReadResolution`, `ESP.getEfuseMac`, `Serial`, and `String`).

The sketch intentionally contains no WiFi credentials, HTTP client, API URL,
or automatic POST. An optional `NUTRISCAN_ENABLE_WIFI` compile guard is present
only for a future explicitly controlled integration; it is `0` by default and
does not add a WiFi or POST path here.

## Host serial smoke check

After uploading, replace `/dev/ttyUSB0` with the actual port. This uses only
Python's standard library to configure the port and check received lines for
valid JSON and the required top-level keys; it does not install `pyserial`.

```bash
stty -F /dev/ttyUSB0 115200 cs8 -cstopb -parenb -ixon -ixoff raw -echo
timeout 10s python3 -c 'import json,sys; [(__import__("builtins").print(json.dumps(json.loads(line)))) for line in sys.stdin if (lambda x: all(k in x for k in ("device_id","captured_at","calibration_status","readings")))(json.loads(line))]' < /dev/ttyUSB0
```

For a repeatable no-hardware emulator on Linux, this standard-library command
creates a pseudo-terminal, prints the path to give Chrome, and emits a valid
frame once per second. Keep it running while using **Read from instrument
(USB serial)** in the frontend; choose the printed `/dev/pts/...` port. Stop
with `Ctrl-C`.

```bash
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

The emulator is transport-only demo data and does not represent field or lab
measurements. The frontend still requires the normal user-selected port,
review, and per-reading confirmation; it sends no commands to the port.

## Chrome localhost test

1. Start the repository backend and frontend using the project instructions;
   open the frontend at `http://localhost:5173` (Chrome Web Serial is allowed
   on localhost).
2. Open a screening and reach the measured-reading step. Open **Read from
   instrument (USB serial)** and check the 115200 protocol confirmation.
3. Upload the sketch or run the PTY emulator, click **Choose port and capture**,
   select the ESP32/PTY port, and wait for the review frame.
4. Confirm the device ID, timezone-aware timestamp, `Unknown calibration`, units,
   and displayed values. Select only the readings to apply, acknowledge the
   review checkbox, then click **Confirm selected readings**.

The browser does not submit a scan automatically. It only proposes the received
frame for explicit review. If the browser cannot use Web Serial, continue with
manual entry; the app requires a supported Chromium browser and localhost or
HTTPS.

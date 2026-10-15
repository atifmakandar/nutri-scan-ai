# Hardware integration and wiring

Current source: [ESP32 README](../../../firmware/esp32/README.md),
[sketch](../../../firmware/esp32/esp32_sensor_template.ino),
[same-day demo](../../today-demo.md), and
[instrument validator](../../../frontend/src/reading-assist.js).
This document does not certify a wiring design or a sensor's accuracy.

## 1. Demo mode versus real measurement

| Item | Current implementation | Required before real use |
| --- | --- | --- |
| `DEMO_MODE` | `true`; illustrative 62% moisture, pH 4.2, 24°C, 68% humidity | Label the entire session synthetic; replace/validate hooks before disabling demo mode |
| Moisture | ADC hook with placeholder dry/wet counts | Material-specific reference method, measured transfer function and repeatability |
| pH | ADC hook with placeholder voltage/slope | Conditioned probe interface, appropriate sample preparation, buffer calibration and temperature handling |
| Temperature/humidity | Non-demo hooks return `NAN` | Actual validated DHT/BME-like library/module integration and error handling |
| Clock | Fixed `MANUAL_CAPTURED_AT`; no RTC/network sync | Validated real capture-time source for real sessions, including timezone and drift check |
| Nutrient values | Not measured by this sketch | Suitable validated report/NIR instrument; never derive protein/fiber from demo readings |
| Network | No automatic Wi-Fi, credentials, POST or serial commands | A separately reviewed integration if networking is introduced later |

Non-finite/out-of-range hook results are omitted. The browser requires at least one
valid reading and the screening still requires all ten inputs. A plausible emitted
number does not make the placeholder conversion calibrated. Even after updating a
manual timestamp before a demo build, repeated frames carry the same timestamp;
that is not continuous real measurement time.

## 2. Electrical preflight — hardware lead sign-off required

Disconnect power before changing wiring. Identify the **exact board variant**,
module supply/output limits, ADC configuration and interface circuit from datasheets.
The following pins are editable placeholders, not universal ESP32 pin assignments:

| Signal | Sketch default | Integration caution |
| --- | --- | --- |
| Conditioned pH analog output | GPIO 35 | **Never connect a raw pH probe or a 5 V output directly to ADC.** Use the probe manufacturer's high-input-impedance signal-conditioning/interface circuit and verify its output range. |
| Moisture analog output | GPIO 34 | Verify material suitability, common ground and worst-case signal voltage; supply voltage is not the same as safe output voltage. |
| DHT-like data | GPIO 4 | Placeholder only; review pull-ups/logic voltage and board boot-strapping constraints; no measurement library is present. |
| BME-like I2C SDA / SCL | GPIO 21 / 22 | Placeholder alternative; verify module supply, pull-ups to safe logic voltage, address and wiring length. |
| Power / ground | Board/module specific | Use a suitable protected supply, common reference as required by the interface, strain relief and dry enclosure; avoid unintended USB/external supply back-powering. |

- ESP32 ADC inputs are **not 5 V tolerant**. “0–3.3 V conditioned output” is not a
  promise of linear/full-scale ADC accuracy; confirm the actual board's permitted
  input and usable ADC range at the selected attenuation. Measure output limits
  before attaching the ADC. Add appropriate conditioning/protection under qualified
  hardware review; do not choose a resistor divider without considering probe loading.
- GPIO 34/35 on classic ESP32 boards are input-only and lack internal pull-ups;
  other variants may differ. Avoid assuming the same pin map on every ESP32 family.
- The sketch sets 12-bit reads but does not validate reference voltage, attenuation,
  ADC nonlinearity, grounding/noise, sensor excitation or temperature compensation.
  Do not treat `3.3/4095`, raw-count endpoints or pH slope constants as calibration.
- Keep electronics/connectors dry and separate from sample containers. Clean sensor
  contact surfaces between samples using the manufacturer's procedure. Do not taste
  samples or deliberately inhale suspect material. Follow the qualified sampling
  plan for protective equipment, biological hazards and disposal.

Record the reviewed wiring revision, voltage measurements, board/module datasheets,
sensor IDs and reviewer in the [device inventory](../templates/technical/device-inventory.csv).
Hold a device out of service for damaged cables, unknown voltage limits, failed
reference checks, contamination or expired calibration under the approved method.

## 3. ESP32-to-browser serial contract

- **115200 baud, 8 data bits, no parity, one stop bit, no flow control.**
- UTF-8 JSON: one object followed by LF; the browser accepts CRLF too. No boot
  banners, debug text or pretty-printed multi-line objects in the capture stream.
- Template emits approximately once per second. The app sends **no commands** and
  reads one frame per explicit capture. Port selection is included in the **15-second**
  window; maximum frame size **16,384 bytes**.
- Required keys: `device_id`, `captured_at`, `calibration_status`, `readings`.
  Optional: `calibration_reference`. Unknown keys, duplicate object keys and duplicate
  reading fields are rejected; do not add a `demo` or `protocol_version` wire key.
- `device_id`: 1–120 characters; optional reference: 1–200; neither accepts surrounding
  whitespace/control characters. Stable eFuse-derived `nutriscan-esp32-<hex>` is an
  identifier, **not authentication**.
- Timestamp: `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)` (fraction up to six digits).
  It must be an actual valid timezone-aware timestamp; the parser does not establish
  that a clock is fresh or trustworthy.
- Calibration: `unknown|reported_current|reported_expired`, a device claim rather
  than app verification. Check the underlying calibration record independently.

Allowed `readings` array: **1–7 unique fields**, finite JSON numbers (not strings),
exact units and bounds:

| Fields | Unit | Inclusive range |
| --- | --- | --- |
| `moisture_pct`, `humidity_pct`, `protein_pct`, `dry_matter_pct`, `fiber_pct` | `%` | 0–100 |
| `ph` | `pH` | 0–14 |
| `temperature_c` | `°C` | -20–80 |

The three visual scores cannot be captured over this protocol. An example frame
below is **synthetic demo data**, with a fixed illustrative timestamp, not a field
measurement. Keep the demo label in session records because the wire has no demo flag:

```json
{"device_id":"host-emulator-01","captured_at":"2026-10-15T12:00:00+05:30","calibration_status":"unknown","readings":[{"field":"moisture_pct","value":62.0,"unit":"%"},{"field":"ph","value":4.2,"unit":"pH"},{"field":"temperature_c","value":24.0,"unit":"°C"},{"field":"humidity_pct","value":68.0,"unit":"%"}]}
```

## 4. Bring-up and capture procedure

1. Log device/mode/firmware digest; inspect wiring with power removed. For a demo,
   keep `DEMO_MODE=true` and update the manual timestamp before compiling. For real
   operation, use a separately validated sensor/time implementation and reference checks.
2. Open the sketch in an existing Arduino IDE/ESP32 core environment, choose the
   correct board and port, compile/upload and retain the actual build/upload result.
   No successful firmware compile or physical wiring check is asserted by this pack.
3. Check serial output at 115200. Close the serial monitor before the browser opens
   the port; only one process should own it. The README's host smoke only checks JSON
   and keys; it is not full protocol, calibration or electrical validation.
4. On Linux, an optional host transport check (substitute the actual port) is:

   ```bash
   stty -F /dev/ttyUSB0 115200 cs8 -cstopb -parenb -ixon -ixoff raw -echo
   timeout 10s python3 -c 'import json,sys; [print(json.dumps(json.loads(line))) for line in sys.stdin]' < /dev/ttyUSB0
   ```

   A timeout exit status of 124 is expected when bounded streaming ends; inspect
   output/errors and valid frames, rather than calling that exit code a QA pass.
   For no-hardware transport use the exact [PTY emulator](../../today-demo.md).
5. In a supported Chromium browser on HTTPS or localhost, sign in as owner/member,
   enter screening step 3, open instrument capture and explicitly select the port.
   Review ID, actual time, calibration reference/state, values and units. Select
   readings and acknowledge review before confirming. No automatic scan is submitted.
6. Fill remaining actual measurements and perform the normal final review/submit.
   Direct online saves retain selected-field provenance. Editing a captured value
   removes that field's provenance; changing source/device/time removes the capture.
   A new capture replaces previous capture provenance, not all previous form values.
7. Refresh history and confirm saved values/provenance. On timeout, unplug, malformed
   frame or unsupported browser, record the failure and use measured manual entry;
   never fill absent values from the demo constants.

## 5. Device and sensor calibration records

Use [inventory](../templates/technical/device-inventory.csv) for board ID, asset tag,
sensor/module serials, firmware and wiring revision, mode, owner, clock source,
validated voltage limits and calibration references. Store actual sensor serials
and multiple calibration IDs in the controlled `sensor_inventory_ref` record.

Use [calibration-record.csv](../templates/technical/calibration-record.csv) for **each
reference point**: sensor, method/version, buffer/reference lot and certificate,
sample/basis, environmental temperature, raw ADC count/voltage, as-found and as-left
value, reference value/unit, tolerance, error (`as_left - reference`), result, due
time, reviewer and raw evidence hash. Multiple points share a calibration record ID
but have distinct point IDs. A failed as-found check can affect earlier samples even
if adjustment makes as-left pass; assess that interval explicitly.

Choose calibration frequency and acceptance tolerance with the module supplier and
qualified measurement lead; there is no app-enforced due-date or device registry.
Keep sample-linked checks in the [custody record](../templates/technical/sample-chain-of-custody.csv)
and follow [calibration/model release](calibration-and-model-release.md) before
using sensor results to substantiate accuracy claims.

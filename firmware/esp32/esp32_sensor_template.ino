/*
 * Nutri-Scan AI — ESP32 serial sensor template
 *
 * Protocol version: INSTRUMENT_PROTOCOL v1. Keep this wire shape aligned with
 * frontend/src/reading-assist.js. The device emits UTF-8 JSON plus LF at
 * 115200 8-N-1 and never reads commands from USB serial.
 *
 * This is a demonstration template. Replace the marked hooks and constants
 * with validated, calibrated sensor integrations before field or lab use.
 */
#include <Arduino.h>
#include <math.h>
#include <stdio.h>

// --------------------------- Demo and wire settings ------------------------

// DEMO_MODE intentionally defaults to true for the Nutri-Scan demo. Values
// emitted in demo mode are illustrative only: they are NOT field or lab
// measurements and must be replaced with validated sensor reads before use.
const bool DEMO_MODE = true;

// There is no RTC integration in this template. Set this compile-time/manual
// timestamp to the actual local time and UTC offset before each demo/build.
// Format required by ReadingAssist: YYYY-MM-DDTHH:mm:ss[.fraction](Z|+/-HH:mm).
const char *MANUAL_CAPTURED_AT = "2026-10-15T12:00:00+05:30";

// A bounded interval keeps the stream usable by the browser capture timeout.
// The frontend asks the device for no command and selects one emitted frame.
const unsigned long EMIT_INTERVAL_MS = 1000UL;

// Demo constants are deliberately explicit and must not be mistaken for
// measurements. Change only after replacing DEMO_MODE and validating sensors.
const float DEMO_MOISTURE_PCT = 62.0f;
const float DEMO_PH = 4.2f;
const float DEMO_TEMPERATURE_C = 24.0f;
const float DEMO_HUMIDITY_PCT = 68.0f;

// ------------------------- Wiring and conversion hooks ----------------------

// ADC pH signal: connect a properly conditioned 0–3.3 V output to this pin.
// Do not connect a raw pH probe or a 5 V signal directly to an ESP32 ADC pin.
const int PH_ADC_PIN = 35;

// ADC moisture signal: connect the validated moisture-module analog output to
// this pin, with common ground and a signal within the ESP32 ADC input range.
const int MOISTURE_ADC_PIN = 34;

// DHT-like digital temperature/humidity placeholder. A DHT library or a
// validated BME-like I2C integration must be added in the hook below.
const int DHT_DATA_PIN = 4;
const int BME_SDA_PIN = 21;
const int BME_SCL_PIN = 22;

// These are placeholder ADC assumptions, not calibration data. Replace them
// after measuring each sensor's transfer function and configuring attenuation.
const float ADC_REFERENCE_VOLTAGE = 3.3f;
const float ADC_MAX_COUNTS = 4095.0f;
const float MOISTURE_ADC_DRY_RAW = 3200.0f;
const float MOISTURE_ADC_WET_RAW = 1200.0f;
const float PH_CALIBRATION_PH7 = 7.0f;
const float PH_CALIBRATION_VOLTAGE_AT_PH7 = 2.50f;
const float PH_CALIBRATION_SLOPE_PH_PER_VOLT = -3.0f;

// Optional networking is compile-guarded and off. This template deliberately
// has no WiFi credentials, connection-start call, HTTP client, or automatic
// POST path.
#ifndef NUTRISCAN_ENABLE_WIFI
#define NUTRISCAN_ENABLE_WIFI 0
#endif

#if NUTRISCAN_ENABLE_WIFI
#include <WiFi.h>
// Integrators may add an explicitly invoked networking experiment here. Do not
// add credentials or automatic networking to the default serial demo path.
#endif

char DEVICE_ID[32] = "nutriscan-esp32-uninitialized";

void initializeDeviceId() {
  // The ESP32 eFuse MAC gives each board a stable, non-secret wire identifier.
  const uint64_t mac = ESP.getEfuseMac();
  snprintf(DEVICE_ID, sizeof(DEVICE_ID), "nutriscan-esp32-%04lX%08lX",
           static_cast<unsigned long>(mac >> 32),
           static_cast<unsigned long>(mac & 0xFFFFFFFFULL));
}

float convertAdcToRange(int raw, float rawAtMinimum, float rawAtMaximum,
                        float minimum, float maximum) {
  if (raw < 0 || raw > static_cast<int>(ADC_MAX_COUNTS)
      || !isfinite(rawAtMinimum) || !isfinite(rawAtMaximum)
      || rawAtMinimum == rawAtMaximum) {
    return NAN;
  }
  const float fraction = (static_cast<float>(raw) - rawAtMinimum)
                         / (rawAtMaximum - rawAtMinimum);
  return minimum + fraction * (maximum - minimum);
}

float readMoisturePct() {
  if (DEMO_MODE) return DEMO_MOISTURE_PCT;

  // TODO: replace the placeholder raw-count transfer function and calibrate
  // against the intended material and validated reference method.
  return convertAdcToRange(analogRead(MOISTURE_ADC_PIN), MOISTURE_ADC_DRY_RAW,
                           MOISTURE_ADC_WET_RAW, 0.0f, 100.0f);
}

float readPH() {
  if (DEMO_MODE) return DEMO_PH;

  // TODO: replace all constants below with the calibrated pH interface
  // transfer function. This is only an ADC conversion hook.
  const int raw = analogRead(PH_ADC_PIN);
  if (raw < 0 || raw > static_cast<int>(ADC_MAX_COUNTS)) return NAN;
  const float voltage = static_cast<float>(raw) * ADC_REFERENCE_VOLTAGE
                        / ADC_MAX_COUNTS;
  if (!isfinite(voltage)) return NAN;
  return PH_CALIBRATION_PH7
         + (voltage - PH_CALIBRATION_VOLTAGE_AT_PH7)
               * PH_CALIBRATION_SLOPE_PH_PER_VOLT;
}

float readTemperatureC() {
  if (DEMO_MODE) return DEMO_TEMPERATURE_C;

  // TODO: replace with a validated DHT/BME-like read using DHT_DATA_PIN or
  // BME_SDA_PIN/BME_SCL_PIN. No temperature measurement is claimed here.
  return NAN;
}

float readHumidityPct() {
  if (DEMO_MODE) return DEMO_HUMIDITY_PCT;

  // TODO: replace with the matching validated DHT/BME-like humidity read.
  return NAN;
}

bool appendReading(String &payload, const char *field, float value,
                   const char *unit, float minimum, float maximum,
                   bool &firstReading) {
  // JSON must never contain NaN, infinity, or an out-of-range value: the
  // frontend accepts finite numeric values only. Invalid hook values are
  // omitted instead of being represented as fabricated measurements.
  if (!isfinite(value) || value < minimum || value > maximum) return false;

  if (!firstReading) payload += ",";
  payload += "{\"field\":\"";
  payload += field;
  payload += "\",\"value\":";
  payload += String(value, 3);
  payload += ",\"unit\":\"";
  payload += unit;
  payload += "\"}";
  firstReading = false;
  return true;
}

String buildInstrumentFrame() {
  String payload;
  payload.reserve(600);
  payload += "{\"device_id\":\"";
  payload += DEVICE_ID;
  payload += "\",\"captured_at\":\"";
  payload += MANUAL_CAPTURED_AT;
  payload += "\",\"calibration_status\":\"unknown\",\"readings\":[";

  bool firstReading = true;
  appendReading(payload, "moisture_pct", readMoisturePct(), "%", 0.0f,
                100.0f, firstReading);
  appendReading(payload, "ph", readPH(), "pH", 0.0f, 14.0f, firstReading);
  appendReading(payload, "temperature_c", readTemperatureC(), "°C", -20.0f,
                80.0f, firstReading);
  appendReading(payload, "humidity_pct", readHumidityPct(), "%", 0.0f,
                100.0f, firstReading);
  payload += "]}";
  return payload;
}

void setup() {
  // USB serial is the only default transport. Do not print a banner: every
  // line after setup must be one JSON frame that ReadingAssist can review.
  Serial.begin(115200);
  initializeDeviceId();

  pinMode(DHT_DATA_PIN, INPUT_PULLUP);
  analogReadResolution(12);
}

void loop() {
  // No Serial.read(), command parser, or remote trigger exists by design.
  // One JSON line is emitted on every bounded loop interval.
  Serial.println(buildInstrumentFrame());
  delay(EMIT_INTERVAL_MS);
}

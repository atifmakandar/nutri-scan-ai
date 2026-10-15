import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { INSTRUMENT_FIELDS, INSTRUMENT_PROTOCOL, applyInstrumentCapture, createReadingAssistTranslator } from './reading-assist.js';
import { createInstrumentController } from './reading-assist-serial.js';
import { readingAssistStatus } from './reading-assist-messages.js';

export default function InstrumentCapture({ form, onChange, disabled = false, t, locale = t?.locale || 'en' }) {
  const id = useId();
  const g = createReadingAssistTranslator(t, locale);
  const controller = useRef(null);
  const [state, setState] = useState({ status: 'idle' });
  const [selected, setSelected] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [baud, setBaud] = useState(false);
  useLayoutEffect(() => {
    let live = true;
    setSelected([]); setConfirmed(false); setBaud(false);
    const capture = createInstrumentController({ browser: globalThis.window, onState: (next) => {
      if (live) { setState(next); setSelected([]); setConfirmed(false); }
    } });
    controller.current = capture;
    setState({ status: capture.availability === 'ready' ? 'idle' : capture.availability });
    return () => { live = false; controller.current = null; capture.dispose(); };
  }, [form, locale, t, disabled]);
  const busy = ['selecting', 'receiving'].includes(state.status);
  const capture = state.status === 'review' ? state.capture : null;
  const missing = INSTRUMENT_FIELDS.filter((field) => !capture?.readings.some((record) => record.field === field.key));
  const calibration = { unknown: 'Unknown calibration (device report)', reported_current: 'Current calibration (device report)', reported_expired: 'Expired calibration (device report)' };
  return (
    <details className="reading-assist-card">
      <summary>{g('Read from instrument (USB serial)')}</summary>
      <p>{g('Connect your real instrument. Web Serial requires a supported browser on HTTPS or localhost. No device readings are supplied by the app.')}</p>
      <details className="reading-assist-protocol"><summary>{g('Instrument protocol')}</summary>
        <p>{g('Send one UTF-8 JSON object ending with a newline. Maximum 16 KiB and 15 seconds, including port selection. Only sensor and nutrient fields are accepted. Use the exact keys and units below.')}</p>
        <code>{'{device_id,captured_at,calibration_status,calibration_reference?,readings:[{field,value,unit}]}'}</code>
        <p>{g('Device ID and timezone-aware ISO capture time are required. Calibration is unknown, reported_current or reported_expired; an optional reference is device-reported too.')}</p>
        <ul>{INSTRUMENT_FIELDS.map((field) => <li key={field.key}><code>{field.key}</code> — {g(field.label)}: {field.min}–{field.max} {field.unit}</li>)}</ul>
        <p>{g('Serial settings: 115200 baud, 8 data bits, no parity, 1 stop bit, no flow control. The app sends no commands. Configure the instrument to emit its measured frame after connection.')}</p>
        <p>{g('Use 1–7 unique readings with JSON numeric values. Unknown keys, duplicate fields, invalid dates, wrong units and out-of-range values reject the entire frame.')}</p>
      </details>
      <label className="reading-assist-check"><input type="checkbox" checked={baud} disabled={disabled || busy}
        onChange={(event) => setBaud(event.target.checked)} />{g('My instrument uses this protocol and 115200 baud.')}</label>
      <div className="reading-assist-actions">
        <button type="button" disabled={disabled || busy || !baud || ['insecure', 'serial-unsupported'].includes(state.status)}
          onClick={() => controller.current?.capture()}>{g('Choose port and capture')}</button>
        <button type="button" disabled={disabled || !busy} onClick={() => controller.current?.cancel()}>{g('Cancel capture')}</button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true">{g(readingAssistStatus(state.status))}</p>
      {capture && <div className="reading-assist-review">
        <dl><dt>{g('Device')}</dt><dd>{capture.device_id}</dd><dt>{g('Captured at')}</dt><dd><time dateTime={capture.captured_at}>{capture.captured_at}</time></dd>
          <dt>{g('Calibration')}</dt><dd>{g(calibration[capture.calibration_status])}</dd>
          {capture.calibration_reference && <><dt>{g('Calibration reference (device report)')}</dt><dd>{capture.calibration_reference}</dd></>}
        </dl>
        <p>{g('Calibration is reported by the device, not verified by Nutri-Scan. Check the instrument and sample before applying.')}</p>
        <p>{g('Missing instrument fields: {fields}', { fields: missing.length ? missing.map((field) => g(field.label)).join(', ') : g('None') })}</p>
        <p>{g('Choose each reading to apply. Existing values are shown. Only selected records are saved as provenance; previous capture provenance is replaced.')}</p>
        {capture.readings.map((record) => {
          const field = INSTRUMENT_FIELDS.find((item) => item.key === record.field);
          const old = form?.inputs?.[field.group]?.[field.key];
          return <label className="reading-assist-check" key={record.field}><input type="checkbox" disabled={disabled}
            checked={selected.includes(record.field)} onChange={(event) => {
              setSelected(event.target.checked ? [...selected, record.field] : selected.filter((key) => key !== record.field));
              setConfirmed(false);
            }} />{g('Replace {field}: {old} → {value} {unit}', { field: g(field.label), old: old === '' || old == null ? g('Not entered') : String(old), value: record.value, unit: record.unit })}</label>;
        })}
        <label className="reading-assist-check"><input type="checkbox" checked={confirmed} disabled={disabled || !selected.length}
          onChange={(event) => setConfirmed(event.target.checked)} />{g('I reviewed the selected values, units, device, time and calibration report and agree to replace these readings.')}</label>
        <button type="button" disabled={disabled || !selected.length || !confirmed} onClick={() => {
          if (disabled || !confirmed || !selected.length) return;
          onChange(applyInstrumentCapture(form, capture, selected));
          setSelected([]); setConfirmed(false); setState({ status: 'applied' });
        }}>{g('Confirm selected readings')}</button>
        <button type="button" disabled={disabled} onClick={() => { setState({ status: 'cancelled' }); setSelected([]); setConfirmed(false); }}>{g('Discard capture')}</button>
      </div>}
      <p>{g('You can always type measured readings directly in the form.')}</p>
    </details>
  );
}

export { INSTRUMENT_PROTOCOL };

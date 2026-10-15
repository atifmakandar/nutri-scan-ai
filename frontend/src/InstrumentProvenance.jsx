import React from 'react';
import { createReadingAssistTranslator, INSTRUMENT_FIELDS, validateInstrumentCapture } from './reading-assist.js';

/** Saved device reports are traceability metadata, never proof of calibration. */
export default function InstrumentProvenance({ capture, t }) {
  if (!capture) return null;
  let saved;
  try {
    const { calibration_reference, ...rest } = capture;
    saved = validateInstrumentCapture({ ...rest, ...(calibration_reference ? { calibration_reference } : {}) });
  } catch { return null; }
  const g = createReadingAssistTranslator(t);
  const calibration = { unknown: 'Unknown calibration (device report)', reported_current: 'Current calibration (device report)', reported_expired: 'Expired calibration (device report)' };
  return <section className="saved-instrument-provenance">
    <h4>{g('Device')}</h4>
    <dl className="fr-values">
      <div><dt>{g('Device')}</dt><dd>{saved.device_id}</dd></div>
      <div><dt>{g('Captured at')}</dt><dd><time dateTime={saved.captured_at}>{saved.captured_at}</time></dd></div>
      <div><dt>{g('Calibration')}</dt><dd>{g(calibration[saved.calibration_status])}</dd></div>
      {saved.calibration_reference && <div><dt>{g('Calibration reference (device report)')}</dt><dd>{saved.calibration_reference}</dd></div>}
    </dl>
    <ul>{saved.readings.map((reading) => <li key={reading.field}>{g(INSTRUMENT_FIELDS.find(({ key }) => key === reading.field).label)}: {reading.value} {reading.unit}</li>)}</ul>
    <p>{g('Calibration is reported by the device, not verified by Nutri-Scan. Check the instrument and sample before applying.')}</p>
  </section>;
}

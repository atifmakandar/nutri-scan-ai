import React from 'react';
import VoiceReading from './VoiceReading.jsx';
import InstrumentCapture from './InstrumentCapture.jsx';
import { assistLocale, createReadingAssistTranslator } from './reading-assist.js';
import './reading-assist.css';

export { reconcileReadingCapture, readingCapturePayload, INSTRUMENT_PROTOCOL } from './reading-assist.js';

/** Render on the reading step, keyed by authenticated account. No submission or storage. */
export default function ReadingAssist({ form, onChange, disabled = false, t, locale = t?.locale || 'en' }) {
  const g = createReadingAssistTranslator(t, locale);
  const props = { form, onChange, disabled, t, locale };
  return (
    <section className="reading-assist" lang={assistLocale(locale)} aria-label={g('Optional reading assistance')}>
      <h3>{g('Optional reading assistance')}</h3>
      <p>{g('Use measured values only. Review before applying; screening is never submitted automatically. Manual entry remains available.')}</p>
      <VoiceReading {...props} />
      <InstrumentCapture {...props} />
      <p className="reading-assist-notice">{g('Offline drafts save readings only; instrument device, time and calibration metadata will not persist in drafts.')}</p>
    </section>
  );
}

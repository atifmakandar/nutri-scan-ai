import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { updateScreeningReading } from './screening.js';
import { READING_FIELDS, assistLocale, createReadingAssistTranslator, reconcileReadingCapture } from './reading-assist.js';
import { createVoiceReadingController, parseVoiceReading } from './reading-assist-voice.js';
import { readingAssistStatus } from './reading-assist-messages.js';

export default function VoiceReading({ form, onChange, disabled = false, t, locale = t?.locale || 'en' }) {
  const id = useId();
  const g = createReadingAssistTranslator(t, locale);
  const controller = useRef(null);
  const [consent, setConsent] = useState(false);
  const [fieldKey, setFieldKey] = useState('');
  const [language, setLanguage] = useState(`${assistLocale(locale)}-IN`);
  const [text, setText] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [state, setState] = useState({ status: 'idle' });

  useLayoutEffect(() => { setLanguage(`${assistLocale(locale)}-IN`); setConsent(false); }, [locale]);
  useLayoutEffect(() => {
    let live = true;
    setText('');
    setCandidate(null);
    const reader = createVoiceReadingController({ browser: globalThis.window, locale: language, onState: (next) => {
      if (!live) return;
      setState(next);
      if (next.status === 'transcript') {
        setText(next.transcript);
        try { setCandidate(parseVoiceReading(next.transcript, fieldKey, language)); }
        catch (error) { setState({ status: error.code || 'ambiguous' }); }
      }
    } });
    controller.current = reader;
    setState({ status: reader.supported ? 'idle' : 'unsupported' });
    return () => { live = false; controller.current = null; reader.dispose(); };
  }, [form, locale, language, fieldKey, disabled, t]);

  const editText = (value) => {
    controller.current?.stop();
    setText(value);
    setCandidate(null);
    setState({ status: 'idle' });
  };
  const review = () => {
    controller.current?.stop();
    try { setCandidate(parseVoiceReading(text, fieldKey, language)); setState({ status: 'transcript' }); }
    catch (error) { setCandidate(null); setState({ status: error.code || 'ambiguous' }); }
  };
  const field = READING_FIELDS.find((item) => item.key === fieldKey);
  const busy = state.status === 'listening';
  const current = field ? form?.inputs?.[field.group]?.[field.key] : '';
  const display = (value) => value === '' || value === null || value === undefined ? g('Not entered') : String(value);
  return (
    <details className="reading-assist-card">
      <summary>{g('Voice entry')}</summary>
      <p id={`${id}-voice-notice`}>{g('Microphone audio may be processed by your browser or its speech vendor and may require internet. Enable only if you agree. No audio is saved by Nutri-Scan.')}</p>
      <label className="reading-assist-check"><input type="checkbox" checked={consent} disabled={disabled}
        aria-describedby={`${id}-voice-notice`} onChange={(event) => {
          controller.current?.stop(); setConsent(event.target.checked); setText(''); setCandidate(null);
        }} />{g('I agree to microphone speech processing for voice entry.')}</label>
      <div className="reading-assist-grid">
        <div><label htmlFor={`${id}-field`}>{g('Target reading')}</label>
          <select id={`${id}-field`} value={fieldKey} disabled={disabled} onChange={(event) => setFieldKey(event.target.value)}>
            <option value="">{g('Choose a reading')}</option>
            {READING_FIELDS.map((item) => <option key={item.key} value={item.key}>{g(item.label)}{item.unit ? ` (${item.unit})` : ''}</option>)}
          </select>
        </div>
        <div><label htmlFor={`${id}-language`}>{g('Speech language')}</label>
          <select id={`${id}-language`} value={language} disabled={disabled} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en-IN">{g('English (India)')}</option><option value="hi-IN">{g('Hindi (India)')}</option><option value="mr-IN">{g('Marathi (India)')}</option>
          </select>
        </div>
      </div>
      <div className="reading-assist-actions">
        <button type="button" disabled={disabled || !consent || !field || busy || state.status === 'unsupported'}
          onClick={() => { setText(''); setCandidate(null); controller.current?.start({ consent }); }}>{g('Start microphone')}</button>
        <button type="button" disabled={disabled || !busy} onClick={() => controller.current?.stop()}>{g('Stop microphone')}</button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true">{g(readingAssistStatus(state.status))}</p>
      <label htmlFor={`${id}-transcript`}>{g('Transcript or typed value')}</label>
      <textarea id={`${id}-transcript`} value={text} maxLength={300} disabled={disabled} onChange={(event) => editText(event.target.value)} />
      <p>{g('Say one value with its matching unit, or omit the unit. Digits, Devanagari digits and number words in the selected language are supported. Say decimal digits individually after point. Multiple values and unclear units are rejected.')}</p>
      <button type="button" disabled={disabled || !field || !text.trim() || busy} onClick={review}>{g('Review value')}</button>
      {candidate && field && <div className="reading-assist-review">
        <p>{g('Replace {field}: {old} → {value} {unit}', { field: g(field.label), old: display(current), value: candidate.value, unit: candidate.unit })}</p>
        <button type="button" disabled={disabled || busy} onClick={() => {
          if (disabled) return;
          onChange(reconcileReadingCapture(updateScreeningReading(form, candidate.field, candidate.value)));
          setText(''); setCandidate(null); setState({ status: 'applied' });
        }}>{g('Confirm this reading')}</button>
      </div>}
      <p>{g('You can always type measured readings directly in the form.')}</p>
    </details>
  );
}

import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  createGuidanceTranslator, createSpeechController, normalizeGuidanceLocale,
  speechLanguage, speechStatusMessage, VOICE_NOTICE,
} from './guidance.js';
import './farmer-guidance.css';

/**
 * Pass already-localized text. For private results, key this component (or its
 * containing subtree) by session/account identity and unmount it on logout.
 */
export default function ListenButton({ text, t, locale = t?.locale || 'en' }) {
  const g = createGuidanceTranslator(t, locale);
  const language = normalizeGuidanceLocale(locale);
  const id = useId();
  const controller = useRef(null);
  const [state, setState] = useState({ status: 'idle' });
  const hasText = typeof text === 'string' && Boolean(text.trim());

  // Layout cleanup cancels the old snapshot during the same commit as a prop
  // change or keyed account remount, before the replacement UI can be used.
  // SSR never accesses window or starts speech.
  useLayoutEffect(() => {
    const reader = createSpeechController({
      browser: typeof window === 'undefined' ? undefined : window,
      locale,
      onState: setState,
    });
    controller.current = reader;
    return () => {
      controller.current = null;
      reader.dispose();
    };
  }, [text, locale]);

  const busy = ['starting', 'speaking'].includes(state.status);
  const fallback = ['unsupported', 'unavailable', 'error'].includes(state.status);
  const languageName = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi' }[speechLanguage(locale)]
    || 'the selected language';
  const status = hasText ? state.status : 'empty';

  return (
    <div className="guidance-listen" lang={language}>
      <div className="guidance-listen-actions">
        <button
          type="button"
          className="guidance-listen-button"
          disabled={!hasText || busy || state.status === 'unsupported'}
          aria-describedby={`${id}-notice ${id}-status`}
          aria-controls={`${id}-text`}
          onClick={() => controller.current?.read(text)}
        >
          <span aria-hidden="true">▷</span> {g('Listen')}
        </button>
        <button
          type="button"
          className="guidance-stop-button"
          disabled={!busy}
          aria-describedby={`${id}-status`}
          onClick={() => controller.current?.stop()}
        >
          <span aria-hidden="true">■</span> {g('Stop reading')}
        </button>
      </div>
      <p id={`${id}-notice`} className="guidance-voice-notice">{g(VOICE_NOTICE)}</p>
      <p id={`${id}-status`} className="guidance-speech-status" role="status" aria-live="polite" aria-atomic="true">
        {g(speechStatusMessage(status), { language: g(languageName) })}
      </p>
      <details className="guidance-transcript" open={fallback}>
        <summary>{g('Read the text')}</summary>
        <p id={`${id}-text`}>{hasText ? text : g('There is no text to read.')}</p>
      </details>
    </div>
  );
}

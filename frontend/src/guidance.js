import { guidanceMessages } from './guidance-messages.js';

export function normalizeGuidanceLocale(locale = 'en') {
  const base = String(locale).toLowerCase().replaceAll('_', '-').split('-')[0];
  return ['en', 'hi', 'mr'].includes(base) ? base : 'en';
}

export function interpolateGuidance(message, values = {}) {
  return String(message).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, key) => (
    Object.hasOwn(values, key) && values[key] != null ? String(values[key]) : token
  ));
}

// Honour a compatible parent translator, with bundled fallbacks for new keys.
// No dependency on the central translator or any browser/storage API.
export function createGuidanceTranslator(t, locale = t?.locale || 'en') {
  const language = normalizeGuidanceLocale(locale);
  return (key, values = {}) => {
    const english = interpolateGuidance(key, values);
    const parent = typeof t === 'function' && (!t.locale || normalizeGuidanceLocale(t.locale) === language)
      ? t(key, values) : key;
    const template = typeof parent === 'string' && parent !== key && parent !== english
      ? parent : guidanceMessages[language]?.[key] || key;
    return interpolateGuidance(template, values);
  };
}

export const QUICK_STEPS = Object.freeze([
  'Sign in and choose the correct batch and sample type.',
  'Take readings with the stated instrument or copy the matching sample report.',
  'Check units and report basis, then enter values in the matching fields.',
  'Review the screening advice with a trained operator; it is not a feed-safety certificate.',
]);

export const VISUAL_SCORE_NOTICE = 'Visual scores are 0–1 prototype indicators, not objective safety measurements. A trained operator must use a validated method; do not guess.';
export const PHOTO_NOTICE = 'Photos are evidence only, not an AI diagnosis.';
export const VOICE_NOTICE = 'Reading uses voices installed on your device or supplied by your browser. A voice for the selected language may need installation; offline listening is not guaranteed.';

export const MEASUREMENT_GUIDANCE = Object.freeze([
  {
    fieldKey: 'moisture_pct', label: 'Moisture', unit: '% water in the sample',
    instrument: 'Feed moisture meter with probes in a sample', illustration: 'moisture',
    where: 'Use a feed-suitable calibrated moisture meter or sample report. Enter the sample’s water percentage in Moisture.',
    mistake: 'Do not enter air humidity or judge water content by touch.',
  },
  {
    fieldKey: 'ph', label: 'pH', unit: 'pH units (0–14; no %)',
    instrument: 'Calibrated pH probe in a prepared sample', illustration: 'ph',
    where: 'Use a calibrated pH meter and the sample preparation specified by your method. Enter its reading in pH.',
    mistake: 'Do not enter a percentage or infer pH from smell.',
  },
  {
    fieldKey: 'temperature_c', label: 'Temperature', unit: '°C (degrees Celsius)',
    instrument: 'Probe thermometer in the feed sample', illustration: 'temperature',
    where: 'Use a probe thermometer at the sample location specified by your method. Enter the stable Celsius reading in Temperature.',
    mistake: 'Do not enter weather-app temperature or a Fahrenheit value.',
  },
  {
    fieldKey: 'humidity_pct', label: 'Humidity', unit: '% relative humidity of air',
    instrument: 'Hygrometer measuring storage air', illustration: 'humidity',
    where: 'Use a hygrometer in the storage air at the specified sampling location. Enter relative humidity in Humidity.',
    mistake: 'Do not confuse air humidity with moisture inside the feed.',
  },
  {
    fieldKey: 'protein_pct', label: 'Protein', unit: '% on the report’s stated basis',
    instrument: 'Protein result on a laboratory or calibrated report', illustration: 'protein',
    where: 'Copy protein % for this sample from a laboratory or calibrated instrument report into Protein; check the report basis.',
    mistake: 'Do not estimate protein from appearance or mix dry-basis and as-fed values.',
  },
  {
    fieldKey: 'dry_matter_pct', label: 'Dry matter', unit: '% dry material in the sample',
    instrument: 'Dry-matter result on a laboratory or calibrated report', illustration: 'dry-matter',
    where: 'Copy dry matter % for this sample from a laboratory or calibrated instrument report into Dry matter.',
    mistake: 'Do not guess from dryness or replace a report with an unvalidated calculation.',
  },
  {
    fieldKey: 'fiber_pct', label: 'Crude fiber', unit: '% on the report’s stated basis',
    instrument: 'Fiber result on a laboratory or calibrated report', illustration: 'fiber',
    where: 'Copy crude fiber % for this sample from a laboratory or calibrated instrument report into Crude fiber; check the basis and method.',
    mistake: 'Do not substitute NDF or ADF for crude fiber, or estimate it by eye.',
  },
  {
    fieldKey: 'mold_score', label: 'Mould indicator', unit: '0–1 prototype score (no unit)',
    instrument: 'Magnifier showing a possible mould observation', illustration: 'mould', visual: true,
    where: 'A trained operator must use a validated observation method. Enter its mould indicator score in Mould indicator.',
    mistake: 'Do not guess a score from a photo or treat 0 as proof of safety.',
  },
  {
    fieldKey: 'color_anomaly', label: 'Colour anomaly', unit: '0–1 prototype score (no unit)',
    instrument: 'Sample beside a method-specific colour reference', illustration: 'colour', visual: true,
    where: 'A trained operator must compare the sample with the validated method’s colour reference. Enter its score in Colour anomaly.',
    mistake: 'Do not score lighting or camera colour changes as sample damage.',
  },
  {
    fieldKey: 'surface_damage', label: 'Surface damage', unit: '0–1 prototype score (no unit)',
    instrument: 'Magnifier showing damaged feed surfaces', illustration: 'damage', visual: true,
    where: 'A trained operator must assess surfaces using a validated method. Enter its score in Surface damage.',
    mistake: 'Do not confuse ordinary texture with damage or guess a percentage.',
  },
].map(Object.freeze));

export function getMeasurementGuidance(fieldKey) {
  return MEASUREMENT_GUIDANCE.find((item) => item.fieldKey === fieldKey);
}

export function measurementHelpText(fieldKey, t, locale = t?.locale || 'en') {
  const item = getMeasurementGuidance(fieldKey);
  if (!item) return '';
  const g = createGuidanceTranslator(t, locale);
  return [item.label, item.instrument, item.unit, item.where, item.mistake,
    ...(item.visual ? [VISUAL_SCORE_NOTICE, PHOTO_NOTICE] : [])].map((key) => g(key)).join('\n');
}

// Never turn an unknown speech locale into English: UI fallback and voice
// selection are deliberately separate. Regional fallback stays in-language.
export function speechLanguage(locale = 'en') {
  const base = String(locale).toLowerCase().replaceAll('_', '-').split('-')[0];
  return { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }[base] || null;
}

export function matchingSpeechVoice(voices, locale = 'en') {
  const target = speechLanguage(locale)?.toLowerCase();
  if (!target) return null;
  const base = target.split('-')[0];
  const matching = Array.from(voices || []).filter((voice) => (
    typeof voice?.lang === 'string' && voice.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === base
  ));
  const exact = matching.filter((voice) => voice.lang.toLowerCase().replaceAll('_', '-') === target);
  const candidates = exact.length ? exact : matching;
  return candidates.find((voice) => voice.localService === true) || candidates[0] || null;
}

export function speechStatusMessage(status) {
  return {
    idle: 'Listen reads only after you press it. Text is always available.',
    ready: 'Ready. Press Listen to read this text.',
    starting: 'Starting reading…',
    speaking: 'Reading aloud. Press Stop reading to cancel.',
    ended: 'Reading finished.',
    stopped: 'Reading stopped.',
    unsupported: 'This browser does not support reading aloud. Read the text below.',
    unavailable: 'No matching voice is available for {language}. Read the text below. Check device or browser voice settings, then press Listen again.',
    error: 'Reading could not continue. Read the text below or press Listen to try again.',
    empty: 'There is no text to read.',
  }[status] || 'Listen reads only after you press it. Text is always available.';
}

// Speech synthesis has one queue per window. Only its current owner may cancel
// on cleanup, so unmounting an idle help button cannot stop another reader.
const activeReaders = new WeakMap();
const legacyVoiceObservers = new WeakMap();

function observeVoices(synthesis, listener) {
  if (typeof synthesis.addEventListener === 'function' && typeof synthesis.removeEventListener === 'function') {
    synthesis.addEventListener('voiceschanged', listener);
    return () => synthesis.removeEventListener('voiceschanged', listener);
  }
  // Older implementations expose only onvoiceschanged. Share one wrapper and
  // restore the previous handler even when several buttons unmount out of order.
  let entry = legacyVoiceObservers.get(synthesis);
  if (!entry) {
    entry = { listeners: new Set(), previous: synthesis.onvoiceschanged };
    entry.handler = (event) => {
      try {
        if (typeof entry.previous === 'function') entry.previous.call(synthesis, event);
      } finally {
        for (const callback of entry.listeners) callback();
      }
    };
    synthesis.onvoiceschanged = entry.handler;
    legacyVoiceObservers.set(synthesis, entry);
  }
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) {
      if (synthesis.onvoiceschanged === entry.handler) synthesis.onvoiceschanged = entry.previous;
      legacyVoiceObservers.delete(synthesis);
    }
  };
}

/**
 * Inject the browser in tests (or pass window in the component). Construction,
 * voice discovery and voiceschanged never speak. Only read(text) may speak,
 * and it never queues text while waiting for a missing voice.
 */
export function createSpeechController({ browser, locale = 'en', onState = () => {} } = {}) {
  let synthesis;
  let Utterance;
  try {
    synthesis = browser?.speechSynthesis;
    Utterance = browser?.SpeechSynthesisUtterance;
  } catch { /* Treat blocked browser APIs like unsupported APIs. */ }
  const supported = Boolean(synthesis && typeof Utterance === 'function'
    && typeof synthesis.getVoices === 'function' && typeof synthesis.speak === 'function'
    && typeof synthesis.cancel === 'function');
  let disposed = false;
  let current = null;
  let state = { status: 'idle', supported, language: speechLanguage(locale) };

  function publish(status) {
    if (disposed) return;
    state = { ...state, status };
    onState(state);
  }

  function findVoice() {
    try { return matchingSpeechVoice(synthesis.getVoices(), locale); } catch { return null; }
  }

  function release(cancel) {
    const utterance = current;
    current = null;
    if (!utterance) return;
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
    const ownsQueue = activeReaders.get(synthesis) === stop;
    if (ownsQueue) activeReaders.delete(synthesis);
    if (cancel && ownsQueue) {
      try { synthesis.cancel(); } catch { /* Still invalidate all stale callbacks. */ }
    }
    // Drop the private text snapshot as soon as it is no longer needed.
    try { utterance.text = ''; } catch { /* Some implementations freeze utterances. */ }
  }

  function stop() {
    if (disposed || !current) return;
    release(true);
    publish('stopped');
  }

  function refreshVoices() {
    if (disposed) return;
    if (!supported) { publish('unsupported'); return; }
    const voice = findVoice();
    if (!voice) {
      release(true);
      publish('unavailable');
    } else if (['idle', 'ready', 'unavailable'].includes(state.status)) {
      publish('ready');
    }
  }

  function read(text) {
    if (disposed) return false;
    if (!supported) { publish('unsupported'); return false; }
    release(true);
    if (typeof text !== 'string' || !text.trim()) { publish('empty'); return false; }
    const voice = findVoice();
    if (!voice) { publish('unavailable'); return false; }
    try {
      const previousReader = activeReaders.get(synthesis);
      if (previousReader) previousReader();
      else synthesis.cancel();
      const utterance = new Utterance(text);
      current = utterance;
      utterance.lang = speechLanguage(locale);
      utterance.voice = voice;
      // Explicitly select a matching voice; never let the browser choose a
      // default voice from another language, including on errors.
      utterance.onstart = () => {
        if (!disposed && current === utterance) publish('speaking');
      };
      utterance.onend = () => {
        if (disposed || current !== utterance) return;
        release(false);
        publish('ended');
      };
      utterance.onerror = (event) => {
        if (disposed || current !== utterance) return;
        release(true);
        publish(['canceled', 'interrupted'].includes(event?.error) ? 'stopped' : 'error');
      };
      activeReaders.set(synthesis, stop);
      publish('starting');
      synthesis.speak(utterance);
      return true;
    } catch {
      release(true);
      publish('error');
      return false;
    }
  }

  let unsubscribe = () => {};
  if (supported) {
    try { unsubscribe = observeVoices(synthesis, refreshVoices); } catch { /* Recheck on each explicit click. */ }
  }
  refreshVoices();

  return {
    read,
    stop,
    getState: () => ({ ...state }),
    dispose() {
      if (disposed) return;
      disposed = true;
      release(true);
      unsubscribe();
    },
  };
}

import { READING_FIELDS, assistFail, assistLocale } from './reading-assist.js';
import { parseReading } from './screening.js';

const english = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const tens = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
// Hindi/Marathi have compound words, not compositional English-style tens.
const hindi = 'शून्य एक दो तीन चार पांच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे सौ'.split(' ');
const marathi = 'शून्य एक दोन तीन चार पाच सहा सात आठ नऊ दहा अकरा बारा तेरा चौदा पंधरा सोळा सतरा अठरा एकोणीस वीस एकवीस बावीस तेवीस चोवीस पंचवीस सव्वीस सत्तावीस अठ्ठावीस एकोणतीस तीस एकतीस बत्तीस तेहतीस चौतीस पस्तीस छत्तीस सदतीस अडतीस एकोणचाळीस चाळीस एकेचाळीस बेचाळीस त्रेचाळीस चव्वेचाळीस पंचेचाळीस सेहेचाळीस सत्तेचाळीस अठ्ठेचाळीस एकोणपन्नास पन्नास एक्कावन्न बावन्न त्रेपन्न चोपन्न पंचावन्न छप्पन्न सत्तावन्न अठ्ठावन्न एकोणसाठ साठ एकसष्ट बासष्ट त्रेसष्ट चौसष्ट पासष्ट सहासष्ट सदुसष्ट अडुसष्ट एकोणसत्तर सत्तर एकाहत्तर बाहत्तर त्र्याहत्तर चौऱ्याहत्तर पंच्याहत्तर शहात्तर सत्याहत्तर अठ्ठ्याहत्तर एकोणऐंशी ऐंशी एक्याऐंशी ब्याऐंशी त्र्याऐंशी चौऱ्याऐंशी पंच्याऐंशी शहाऐंशी सत्त्याऐंशी अठ्ठ्याऐंशी एकोणनव्वद नव्वद एक्याण्णव ब्याण्णव त्र्याण्णव चौऱ्याण्णव पंच्याण्णव शहाण्णव सत्त्याण्णव अठ्ठ्याण्णव नव्याण्णव शंभर'.split(' ');
const normalize = (text) => text.normalize('NFC').toLowerCase().replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));
function wordsFor(locale) {
  const words = new Map();
  const language = assistLocale(locale);
  (language === 'hi' ? hindi : language === 'mr' ? marathi : english).forEach((word, index) => words.set(normalize(word), index));
  if (language === 'hi') for (const [word, number] of [['पाँच', 5], ['छः', 6], ['जीरो', 0]]) words.set(normalize(word), number);
  if (language === 'mr') words.set('झिरो', 0);
  return words;
}
function wholeNumber(text, locale, words) {
  if (/^\d+$/.test(text)) return Number(text);
  if (words.has(text)) return words.get(text);
  if (assistLocale(locale) === 'en') {
    if (text === 'one hundred') return 100;
    const tokens = text.split(/[ -]/);
    const ten = tens.indexOf(tokens[0]);
    if (ten !== -1 && (tokens.length === 1 || (tokens.length === 2 && english.indexOf(tokens[1]) >= 1 && english.indexOf(tokens[1]) <= 9))) {
      return (ten + 2) * 10 + (tokens.length === 2 ? english.indexOf(tokens[1]) : 0);
    }
  }
  assistFail('ambiguous');
}

/** Conservative grammar: one number, optional matching suffix unit. Never guesses
 * punctuation/group separators, ranges, corrections, multiple values or unfamiliar words.
 * Fractional words must be individual digits ("four point two", "चार दशमलव दो").
 */
export function parseVoiceReading(transcript, fieldKey, locale = 'en') {
  const field = READING_FIELDS.find((item) => item.key === fieldKey);
  if (!field || typeof transcript !== 'string' || !transcript.trim() || transcript.length > 300) assistFail('ambiguous');
  let text = normalize(transcript).trim().replace(/[।!?]$/, '').trim().replace(/\.$/, '').trim().replace(/\s+/g, ' ');
  const suffix = /\s*(%|percent|per cent|percentage|प्रतिशत|टक्के|टक्का|°c|degrees? celsius|degrees? c|celsius|डिग्री सेल्सियस|अंश सेल्सिअस|सेल्सिअस|सेल्सियस|°f|fahrenheit|degrees? fahrenheit|फारेनहाइट|फॅरेनहाइट|kg|grams?|किलो|ph|p h|पीएच|पी एच)$/u.exec(text);
  if (suffix) {
    const unit = /^(%|percent|per cent|percentage|प्रतिशत|टक्के|टक्का)$/u.test(suffix[1]) ? '%'
      : /^(ph|p h|पीएच|पी एच)$/u.test(suffix[1]) ? 'pH'
        : /^(°c|degrees? celsius|degrees? c|celsius|डिग्री सेल्सियस|अंश सेल्सिअस|सेल्सिअस|सेल्सियस)$/u.test(suffix[1]) ? '°C' : 'other';
    if (unit !== field.unit) assistFail('unit');
    text = text.slice(0, suffix.index).trim();
  }
  let sign = 1;
  const minus = /^(?:minus |negative |माइनस |ऋण |उणे |वजा |−|-)/u.exec(text);
  if (minus) { sign = -1; text = text.slice(minus[0].length).trim(); }
  const words = wordsFor(locale);
  let value;
  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) value = Number(text);
  else {
    const pieces = text.split(/ (?:point|decimal|दशमलव|बिंदु|बिंदू|पॉइंट|दशांश) /u);
    if (pieces.length > 2) assistFail('ambiguous');
    value = wholeNumber(pieces[0], locale, words);
    if (pieces.length === 2) {
      const fraction = pieces[1].split(' ').map((token) => /^\d$/.test(token) ? token : words.has(token) && words.get(token) < 10 ? String(words.get(token)) : null);
      if (!fraction.length || fraction.some((digit) => digit === null)) assistFail('ambiguous');
      value = Number(`${value}.${fraction.join('')}`);
    }
  }
  value *= sign;
  if (parseReading(value, field).error) assistFail('range');
  return { field: field.key, value, unit: field.unit };
}

export function createVoiceReadingController({ browser, locale = 'en', onState = () => {}, maxTimeMs = 15000 } = {}) {
  const Recognition = browser?.SpeechRecognition || browser?.webkitSpeechRecognition;
  let disposed = false;
  let generation = 0;
  let active = null;
  const emit = (state) => { if (!disposed) onState(state); };
  function stop(publish = true) {
    generation += 1;
    const previous = active;
    active = null;
    if (previous) {
      clearTimeout(previous.timer);
      previous.recognition.onresult = previous.recognition.onerror = previous.recognition.onend = previous.recognition.onnomatch = null;
      try { previous.recognition.abort(); } catch { /* Already stopped. */ }
    }
    if (publish) emit({ status: 'cancelled' });
  }
  return {
    supported: typeof Recognition === 'function',
    start({ consent = false } = {}) {
      if (disposed || active || !consent) return false;
      if (typeof Recognition !== 'function') { emit({ status: 'unsupported' }); return false; }
      const token = ++generation;
      let recognition;
      try { recognition = new Recognition(); } catch { emit({ status: 'voice-error' }); return false; }
      const live = () => !disposed && generation === token && active?.recognition === recognition;
      const finish = (state) => { if (live()) { stop(false); emit(state); } };
      active = { recognition };
      recognition.lang = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }[assistLocale(locale)];
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        if (!live()) return;
        const results = Array.from(event.results || []);
        if (results.length !== 1 || results[0].isFinal !== true || results[0].length !== 1 || typeof results[0][0]?.transcript !== 'string') {
          finish({ status: 'ambiguous' }); return;
        }
        finish({ status: 'transcript', transcript: results[0][0].transcript });
      };
      recognition.onerror = (event) => finish({ status: ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error) ? 'permission' : 'voice-error' });
      recognition.onnomatch = () => finish({ status: 'ambiguous' });
      recognition.onend = () => finish({ status: 'no-speech' });
      active.timer = setTimeout(() => finish({ status: 'timeout' }), maxTimeMs);
      emit({ status: 'listening' });
      try { recognition.start(); } catch { finish({ status: 'voice-error' }); return false; }
      return true;
    },
    stop() { if (!disposed) stop(); },
    dispose() { disposed = true; stop(false); },
  };
}

import {
  buildHistorySearchPath, english, finiteMeasurement, formatScanDate, measurement,
  SAMPLE_TYPES, scanTimestamp, TREND_LIMIT,
} from './history-utils.js';
import { translateAdvisory } from './i18n.js';
import { resultsMessages } from './results-messages.js';

export const SCREENING_NOTICE = 'Uncalibrated prototype screening. This is not a laboratory test and cannot guarantee feed safety, even with a low risk result.';
export const CONFIDENCE_NOTICE = 'Confidence is a heuristic from the prototype formula, not a probability of correctness or feed safety.';

// Extend the parent's translator without changing its catalog or locale ownership.
export function resultsText(t = english) {
  const locale = t.locale || 'en';
  const dictionary = Object.hasOwn(resultsMessages, locale) ? resultsMessages[locale] : {};
  return Object.assign((key, values = {}) => Object.hasOwn(dictionary, key)
    ? english(dictionary[key], values) : t(key, values), { locale });
}

const riskBands = {
  LOW: { icon: 'ⓘ', tone: 'low', heading: 'Lower screening risk — keep monitoring' },
  MEDIUM: { icon: '!', tone: 'medium', heading: 'Moderate screening risk — review before use' },
  HIGH: { icon: '⚠', tone: 'high', heading: 'Higher screening risk — seek qualified advice' },
};

const savedStrings = (values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [];

export function resultSummary(record, t = english) {
  const text = resultsText(t);
  const band = Object.hasOwn(riskBands, record?.result?.risk_level) ? riskBands[record.result.risk_level]
    : { icon: '?', tone: 'unknown', heading: 'Screening risk not recorded — review needed' };
  return {
    ...band,
    heading: text(band.heading),
    anomalies: savedStrings(record?.result?.anomalies).map((value) => translateAdvisory(text.locale, value)),
    advisory: savedStrings(record?.result?.advisory).map((value) => translateAdvisory(text.locale, value)),
    notice: text(SCREENING_NOTICE),
    confidenceNotice: text(CONFIDENCE_NOTICE),
  };
}

export function spokenSummary(record, t = english) {
  const text = resultsText(t);
  const summary = resultSummary(record, t);
  return [summary.heading, summary.notice, text('Why this result needs context'),
    ...(summary.anomalies.length ? summary.anomalies : [text('No anomaly information was saved.')]),
    text('Next steps from the saved advice'),
    ...(summary.advisory.length ? summary.advisory : [text('No advice was saved. Ask a qualified adviser before making a feeding decision.')]),
    summary.confidenceNotice].join('\n');
}

export const RESULT_METRICS = [
  { key: 'quality_score', label: 'Prototype score', unit: '/ 100', differenceUnit: 'points' },
  { key: 'moisture_pct', label: 'Moisture', unit: '%', differenceUnit: 'percentage points' },
  { key: 'dry_matter_pct', label: 'Dry matter', unit: '%', differenceUnit: 'percentage points' },
  { key: 'protein_pct', label: 'Protein', unit: '%', differenceUnit: 'percentage points' },
  { key: 'fiber_pct', label: 'Crude fiber', unit: '%', differenceUnit: 'percentage points' },
  { key: 'ph', label: 'pH', unit: '', differenceUnit: 'pH units' },
  { key: 'temperature_c', label: 'Temperature', unit: '°C', differenceUnit: '°C' },
  { key: 'nutritional_score', label: 'Nutritional score', unit: '/ 100', differenceUnit: 'points' },
];

// Reuse the history timezone contract, additionally rejecting calendar rollover dates.
export function savedTimestamp(record) {
  const timestamp = scanTimestamp(record);
  if (timestamp === null) return null;
  const value = record.scan.created_at;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || Number(value.slice(11, 13)) > 23) return null;
  return timestamp;
}

export function savedDate(record) {
  if (savedTimestamp(record) === null) return null;
  const fraction = record.scan.created_at.match(/\.(\d+)/)?.[1];
  const formatted = formatScanDate(record);
  return fraction ? formatted.replace(/\.\d{3} UTC$/, `.${fraction.padEnd(3, '0')} UTC`) : formatted;
}

// Python saves microseconds; Date.parse alone collapses distinct sub-millisecond
// results into a tie. Compare the remaining decimal digits without coercing them.
function compareSavedTimes(a, b) {
  const milliseconds = savedTimestamp(a) - savedTimestamp(b);
  if (milliseconds) return milliseconds;
  const tail = (value) => (value.scan.created_at.match(/\.(\d+)/)?.[1] || '').slice(3).replace(/0+$/, '');
  const aTail = tail(a);
  const bTail = tail(b);
  const length = Math.max(aTail.length, bTail.length);
  return aTail === bTail ? 0 : aTail.padEnd(length, '0') < bTail.padEnd(length, '0') ? -1 : 1;
}

const identifier = (value) => typeof value === 'string' && value.trim().length > 0;

export function isSavedResult(record) {
  const scan = record?.scan;
  return Boolean(scan && identifier(scan.id) && identifier(scan.farm_id) && identifier(scan.batch_id)
    && SAMPLE_TYPES.includes(scan.sample_type) && record?.result && typeof record.result === 'object'
    && !Array.isArray(record.result) && (!record.result.sample_type || record.result.sample_type === scan.sample_type)
    && savedTimestamp(record) !== null);
}

export function comparisonSearchPath(record) {
  return isSavedResult(record) ? buildHistorySearchPath({
    batch_id: record.scan.batch_id, sample_type: record.scan.sample_type,
  }, { offset: 0, limit: TREND_LIMIT }) : null;
}

export function boundedComparisonRecords(records) {
  // The synchronous view may receive a larger array; use only its latest 100 saved records.
  return (Array.isArray(records) ? [...records] : [])
    .sort((a, b) => {
      const aTime = savedTimestamp(a);
      const bTime = savedTimestamp(b);
      if (aTime === null || bTime === null) return aTime === bTime ? 0 : aTime === null ? 1 : -1;
      return compareSavedTimes(b, a);
    })
    .slice(0, TREND_LIMIT);
}

export function compareSavedRecords(records, record) {
  const sample = boundedComparisonRecords(records);
  if (!isSavedResult(record)) return { status: 'invalid', sample };
  const eligible = sample.filter((candidate) => isSavedResult(candidate)
    && candidate.scan.farm_id === record.scan.farm_id && candidate.scan.batch_id === record.scan.batch_id
    && candidate.scan.sample_type === record.scan.sample_type && candidate.scan.id !== record.scan.id
    && compareSavedTimes(candidate, record) < 0);
  if (!eligible.length) return { status: 'missing', sample };
  const unique = new Map();
  for (const candidate of eligible) {
    const prior = unique.get(candidate.scan.id);
    if (prior && (compareSavedTimes(prior, candidate) !== 0
      || JSON.stringify(prior.result) !== JSON.stringify(candidate.result))) return { status: 'ambiguous', sample };
    unique.set(candidate.scan.id, candidate);
  }
  // The bounded sample is newest first; eligible retains that chronological order.
  const nearest = [...unique.values()].filter((candidate) => compareSavedTimes(candidate, eligible[0]) === 0);
  if (nearest.length !== 1) return { status: 'ambiguous', sample };
  const previous = nearest[0];
  const metrics = RESULT_METRICS.map((metric) => {
    const before = measurement(previous, metric.key);
    const current = measurement(record, metric.key);
    const rawDifference = before === null || current === null ? null : finiteMeasurement(current - before);
    // Avoid binary floating point noise without rounding small differences down to zero.
    const difference = rawDifference === null ? null : Number(rawDifference.toPrecision(12));
    return { ...metric, before, current, difference };
  });
  return { status: 'ready', sample, previous, record, metrics };
}

// Do not serialize records. Only allowlisted fields enter the sharing payload.
// Free text containing URL/credential patterns is omitted as a whole, not linked.
export function privateShareText(value, t = english) {
  const text = resultsText(t);
  if (typeof value !== 'string') return text('Not recorded');
  const plain = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ');
  if (/(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\/\/\S|\b(?:data|blob|mailto|javascript):|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\b|\/))/i.test(plain)
    || /\b(?:password|passwd|secret|token|api[_ -]?key|authorization|cookie|username|user[_ -]?name)\b\s*[:=]|\bbearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(plain)) {
    return text('[Private content omitted]');
  }
  return plain.trim() || text('Not recorded');
}

export function buildShareSummary(record, { t = english, includeFarmId = false, includeFarmName = false, farmName = '', includePhotos = false } = {}) {
  if (!isSavedResult(record)) return null;
  const text = resultsText(t);
  const safe = (value) => privateShareText(value, text);
  const lines = [text('Nutri-Scan screening summary'),
    `${text('Saved at (UTC)')}: ${savedDate(record)}`,
    `${text('Batch ID')}: ${safe(record.scan.batch_id)}`,
    `${text('Sample type')}: ${text(record.scan.sample_type === 'feed' ? 'Cattle feed' : 'Silage')}`];
  if (includeFarmId === true) lines.push(`${text('Farm ID')}: ${safe(record.scan.farm_id)}`);
  if (includeFarmName === true && typeof farmName === 'string' && farmName.trim()) lines.push(`${text('Farm name')}: ${safe(farmName)}`);
  lines.push(text('Measurements'));
  for (const metric of RESULT_METRICS) {
    const value = measurement(record, metric.key);
    lines.push(`${text(metric.label)}: ${value === null ? text('Not recorded') : `${value}${metric.unit ? ` ${metric.unit}` : ''}`}`);
  }
  // Saved advice/anomalies use the same exact translator as the on-screen summary.
  const summary = resultSummary(record, text);
  lines.push(summary.heading, summary.notice, text('Why this result needs context'),
    ...(summary.anomalies.length ? summary.anomalies.map(safe) : [text('No anomaly information was saved.')]),
    text('Next steps from the saved advice'),
    ...(summary.advisory.length ? summary.advisory.map(safe) : [text('No advice was saved. Ask a qualified adviser before making a feeding decision.')]),
    summary.confidenceNotice);
  lines.push(includePhotos === true
    ? text('Selected evidence photos are included only in supported native device sharing. Copy and WhatsApp send text only, without photo URLs.')
    : text('Photos are excluded: private photo evidence cannot be safely shared automatically.'));
  return lines.join('\n');
}

// Browser dependencies are injected for testing. These functions are invoked only
// by explicit clicks after preview; none fetches or uploads data.
export async function shareSummaryText(text, browser = globalThis.window, files = []) {
  if (!Array.isArray(files)) return { status: 'photosUnsupported' };
  const withPhotos = files.length > 0;
  const payload = withPhotos ? { text, files } : { text };
  try {
    const navigator = browser?.navigator;
    if (withPhotos) {
      // canShare must explicitly accept the complete snapshot. Never fall back to
      // text-only when the farmer selected attachments. No await before share().
      try {
        if (typeof navigator?.share !== 'function' || typeof navigator.canShare !== 'function'
          || navigator.canShare(payload) !== true) return { status: 'photosUnsupported' };
      } catch { return { status: 'photosUnsupported' }; }
    }
    if (typeof navigator?.share !== 'function'
      || (!withPhotos && typeof navigator.canShare === 'function' && !navigator.canShare(payload))) return { status: 'unsupported' };
    await navigator.share(payload);
    return { status: 'shared' };
  } catch (error) {
    return { status: error?.name === 'AbortError' ? 'cancelled' : 'failed' };
  }
}

export async function copySummaryText(text, browser = globalThis.window, selectionTarget) {
  try {
    if (typeof browser?.navigator?.clipboard?.writeText !== 'function') throw new Error();
    await browser.navigator.clipboard.writeText(text);
    return { status: 'copied' };
  } catch {
    // No automatic permission prompts/legacy document writes. The visible readonly
    // preview remains selectable even if focus/select itself is unsupported.
    try { selectionTarget?.focus(); selectionTarget?.select(); } catch { /* Manual selection remains available. */ }
    return { status: 'manual' };
  }
}

export function whatsappSummaryUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function openWhatsAppSummary(text, browser = globalThis.window) {
  try {
    if (typeof browser?.open !== 'function') return { status: 'failed' };
    // noopener/noreferrer protects the app; no photo URLs or attachment fields.
    browser.open(whatsappSummaryUrl(text), '_blank', 'noopener,noreferrer');
    // With noopener, browsers may return null even when the tab opens.
    return { status: 'requested' };
  } catch {
    return { status: 'failed' };
  }
}

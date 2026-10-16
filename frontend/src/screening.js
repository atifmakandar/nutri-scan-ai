/** Shared form contract. No storage, browser state, fabricated readings or API calls. */
export const SCREENING_GROUPS = [
  {
    key: 'sensor', title: 'Storage & sensor readings',
    description: 'Enter measured moisture, pH, temperature and air humidity.',
    fields: [
      { key: 'moisture_pct', label: 'Moisture', unit: '%', min: 0, max: 100 },
      { key: 'ph', label: 'pH', unit: '', min: 0, max: 14 },
      { key: 'temperature_c', label: 'Temperature', unit: '°C', min: -20, max: 80 },
      { key: 'humidity_pct', label: 'Humidity', unit: '%', min: 0, max: 100 },
    ],
  },
  {
    key: 'nir', title: 'Nutrient readings',
    description: 'Use measured nutrient values from a report or suitable instrument. Do not guess.',
    fields: [
      { key: 'protein_pct', label: 'Protein', unit: '%', min: 0, max: 100 },
      { key: 'dry_matter_pct', label: 'Dry matter', unit: '%', min: 0, max: 100 },
      { key: 'fiber_pct', label: 'Crude fiber', unit: '%', min: 0, max: 100 },
    ],
  },
  {
    key: 'vision', title: 'Visual indicators',
    description: 'Use recorded scores from 0 (not observed) to 1 (strong indicator). A missing score is not zero.',
    fields: [
      { key: 'mold_score', label: 'Mould indicator', unit: '', min: 0, max: 1 },
      { key: 'color_anomaly', label: 'Colour anomaly', unit: '', min: 0, max: 1 },
      { key: 'surface_damage', label: 'Surface damage', unit: '', min: 0, max: 1 },
    ],
  },
];

// Optional reported values and concern indicators. These are never required to
// submit the ten-reading baseline and are not treated as validated detection.
export const SCREENING_OPTIONAL_GROUPS = [
  {
    key: 'supplemental', title: 'Reported nutrition & safety concerns',
    description: 'Optional operator or laboratory inputs. These values require qualified confirmation and do not prove presence or absence.',
    fields: [
      { key: 'energy_mj_per_kg', label: 'Energy value', unit: 'MJ/kg', min: 0, max: 30 },
      { key: 'calcium_pct', label: 'Calcium', unit: '%', min: 0, max: 20 },
      { key: 'phosphorus_pct', label: 'Phosphorus', unit: '%', min: 0, max: 10 },
      { key: 'mineral_concern_score', label: 'Mineral concern', unit: '0–1', min: 0, max: 1 },
      { key: 'urea_concern_score', label: 'Urea concern', unit: '0–1', min: 0, max: 1 },
      { key: 'sand_silica_concern_score', label: 'Sand/silica concern', unit: '0–1', min: 0, max: 1 },
      { key: 'aflatoxin_concern_score', label: 'Aflatoxin concern', unit: '0–1', min: 0, max: 1 },
      { key: 'fungal_concern_score', label: 'Fungal concern', unit: '0–1', min: 0, max: 1 },
    ],
  },
];

export const SCREENING_SOURCES = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'mobile', label: 'Mobile capture' },
  { value: 'esp32', label: 'ESP32 field unit' },
];

export function english(text, values = {}) {
  return text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

export function createEmptyScreening(farmId = '') {
  return {
    farm_id: farmId, batch_id: '', sample_type: 'silage', source_mode: 'manual',
    inputs: Object.fromEntries(SCREENING_GROUPS.map((group) => [group.key,
      Object.fromEntries(group.fields.map((field) => [field.key, ''])),
    ])),
  };
}

// Match decimal number inputs without Number('') / Number(null) silently becoming 0.
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function numericValue(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string' || !DECIMAL.test(raw.trim())) return NaN;
  return Number(raw);
}

/** Returns { value, error }; invalid/missing readings have value: null. */
export function parseReading(raw, field, t = english) {
  const label = t(field.label);
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: null, error: t('Enter the {field} reading. Missing measurements block screening.', { field: label }) };
  }
  const value = numericValue(raw);
  if (!Number.isFinite(value)) return { value: null, error: t('{field} must be a finite number.', { field: label }) };
  if (value < field.min || value > field.max) {
    return { value: null, error: t('{field} must be between {min} and {max}.', { field: label, min: field.min, max: field.max }) };
  }
  return { value, error: '' };
}

function parseOptionalReading(raw, field, t = english) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return { value: null, error: '' };
  return parseReading(raw, field, t);
}

const validId = (value) => typeof value === 'string' && value.length >= 2 && value.length <= 80
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

/** Errors are keyed by farm_id, batch_id, sample_type, source_mode or a reading's bare key. */
export function validateScreening(form, t = english) {
  const errors = {};
  if (!validId(form?.farm_id)) errors.farm_id = t('Select a signed-in farm with a valid Farm ID before screening.');
  if (!validId(form?.batch_id)) errors.batch_id = t('Batch ID must contain 2–80 characters without surrounding whitespace or control characters.');
  if (!['feed', 'silage'].includes(form?.sample_type)) errors.sample_type = t('Choose cattle feed or silage.');
  if (!SCREENING_SOURCES.some((source) => source.value === form?.source_mode)) errors.source_mode = t('Choose a valid input source.');
  for (const group of SCREENING_GROUPS) {
    for (const field of group.fields) {
      const { error } = parseReading(form?.inputs?.[group.key]?.[field.key], field, t);
      if (error) errors[field.key] = error;
    }
  }
  for (const group of SCREENING_OPTIONAL_GROUPS) {
    for (const field of group.fields) {
      const { error } = parseOptionalReading(form?.inputs?.[group.key]?.[field.key], field, t);
      if (error) errors[field.key] = error;
    }
  }
  return errors;
}

/** Canonical allowlisted API/draft payload, or null plus every validation error. Never mutates form. */
export function parseScreening(form, t = english) {
  const errors = validateScreening(form, t);
  if (Object.keys(errors).length) return { value: null, errors };
  const value = createEmptyScreening(form.farm_id);
  for (const key of ['batch_id', 'sample_type', 'source_mode']) value[key] = form[key];
  for (const group of SCREENING_GROUPS) {
    for (const field of group.fields) value.inputs[group.key][field.key] = numericValue(form.inputs[group.key][field.key]);
  }
  const supplemental = {};
  for (const field of SCREENING_OPTIONAL_GROUPS[0].fields) {
    const parsed = parseOptionalReading(form.inputs?.supplemental?.[field.key], field, t);
    if (parsed.value !== null) supplemental[field.key] = parsed.value;
  }
  if (Object.keys(supplemental).length) value.inputs.supplemental = supplemental;
  return { value, errors };
}

/** Edits preserve the complete parent's form, including any extra parent-owned metadata. */
export function updateScreeningReading(form, fieldKey, raw) {
  const group = [...SCREENING_GROUPS, ...SCREENING_OPTIONAL_GROUPS].find((candidate) => candidate.fields.some((field) => field.key === fieldKey));
  if (!group) throw new Error(`Unknown screening field: ${fieldKey}`);
  const number = numericValue(raw);
  const value = typeof raw === 'string' && raw.trim() === '' ? '' : Number.isFinite(number) ? number : raw;
  return { ...form, inputs: { ...form.inputs, [group.key]: { ...form.inputs?.[group.key], [fieldKey]: value } } };
}

/** History contains { scan, result } records; only the current farm/sample can supply batch IDs. */
export function getScreeningBatches(history, farmId, sampleType) {
  const records = Array.isArray(history) ? history : Array.isArray(history?.items) ? history.items : [];
  const seen = new Set();
  return records.flatMap((record) => {
    const scan = record?.scan;
    if (!scan || scan.farm_id !== farmId || scan.sample_type !== sampleType || !validId(scan.batch_id)) return [];
    const identity = JSON.stringify([scan.farm_id, scan.sample_type, scan.batch_id]);
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{ farm_id: scan.farm_id, sample_type: scan.sample_type, batch_id: scan.batch_id }];
  });
}

export function screeningFieldStep(key) {
  if (key === 'sample_type') return 0;
  if (['farm_id', 'batch_id'].includes(key)) return 1;
  return 2;
}

export function screeningStepErrors(form, step, t = english) {
  return Object.fromEntries(Object.entries(validateScreening(form, t)).filter(([key]) => step === 3 || screeningFieldStep(key) === step));
}

/** Pure navigation/submission gate shared by button clicks and form-submit (Enter). */
export function screeningTransition(form, { step, disabled = false, busy = false, online = false, confirmed = false }, t = english) {
  if (disabled || busy) return { kind: 'blocked', reason: disabled ? 'disabled' : 'busy' };
  if (!Number.isInteger(step) || step < 0 || step > 3) return { kind: 'blocked', reason: 'step' };
  const errors = screeningStepErrors(form, step, t);
  if (Object.keys(errors).length) return { kind: 'invalid', errors };
  if (step < 3) return { kind: 'next', step: step + 1 };
  if (online !== true) return { kind: 'blocked', reason: 'offline' };
  if (!confirmed) return { kind: 'blocked', reason: 'confirmation' };
  return { kind: 'submit' };
}

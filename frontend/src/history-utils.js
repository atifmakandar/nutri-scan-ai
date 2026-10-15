export const HISTORY_PAGE_SIZE = 25;
export const TREND_LIMIT = 100;
export const SAMPLE_TYPES = ['feed', 'silage'];
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

export const TREND_METRICS = [
  { key: 'quality_score', label: 'Quality', unit: '/ 100', domain: [0, 100] },
  { key: 'moisture_pct', label: 'Moisture', unit: '%', domain: [0, 100] },
  { key: 'temperature_c', label: 'Temperature', unit: '°C' },
  { key: 'ph', label: 'pH', unit: 'unitless', domain: [0, 14] },
];

export function english(text, replacements = {}) {
  return text.replace(/\{(\w+)\}/g, (match, key) => String(replacements[key] ?? match));
}

export function emptyHistoryFilters() {
  return { batch_query: '', batch_id: '', sample_type: '', risk_level: '', date_from: '', date_to: '' };
}

export function historyFromSearch(search = '') {
  const params = new URLSearchParams(search);
  const filters = emptyHistoryFilters();
  filters.batch_id = params.get('batch') || '';
  filters.sample_type = SAMPLE_TYPES.includes(params.get('sample_type')) ? params.get('sample_type') : '';
  return {
    filters,
    selectedBatch: filters.batch_id && filters.sample_type
      ? { batchId: filters.batch_id, sampleType: filters.sample_type }
      : null,
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Return English message keys so components can localize validation failures.
export function validateHistoryFilters(filters) {
  if ((filters.date_from && !validDate(filters.date_from)) || (filters.date_to && !validDate(filters.date_to))) {
    return 'Enter valid dates in YYYY-MM-DD format.';
  }
  if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
    return 'The start date must be on or before the end date.';
  }
  if (filters.sample_type && !SAMPLE_TYPES.includes(filters.sample_type)) return 'Choose feed or silage.';
  if (filters.risk_level && !RISK_LEVELS.includes(filters.risk_level)) return 'Choose a valid risk level.';
  return '';
}

function integerInRange(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

export function buildHistorySearchPath(filters = {}, { offset = 0, limit = HISTORY_PAGE_SIZE } = {}) {
  const error = validateHistoryFilters(filters);
  if (error) throw new Error(error);
  const params = new URLSearchParams();
  // An exact identifier is preserved byte-for-byte, including whitespace.
  if (filters.batch_id) params.set('batch_id', filters.batch_id);
  else if (filters.batch_query) params.set('batch_query', filters.batch_query);
  for (const key of ['sample_type', 'risk_level', 'date_from', 'date_to']) {
    if (filters[key]) params.set(key, filters[key]);
  }
  params.set('offset', String(integerInRange(offset, 0, 0, Number.MAX_SAFE_INTEGER)));
  params.set('limit', String(integerInRange(limit, HISTORY_PAGE_SIZE, 1, 100)));
  return `/api/v1/scans/search?${params}`;
}

export function historyPagination({ total, offset, limit, items }) {
  const lastOffset = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;
  return {
    start: items.length ? offset + 1 : 0,
    end: items.length ? Math.min(offset + items.length, total) : 0,
    previous: Math.max(0, offset - limit),
    next: offset + limit,
    lastOffset,
    hasPrevious: offset > 0,
    hasNext: offset + limit < total,
  };
}

export function finiteMeasurement(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function scanTimestamp(record) {
  const value = record?.scan?.created_at;
  if (typeof value !== 'string' || !value.trim()) return null;
  // A date without a recorded timezone cannot be placed on a UTC axis reliably.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function formatScanDate(record) {
  const timestamp = scanTimestamp(record);
  return timestamp === null ? null : new Date(timestamp).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export function measurement(record, key) {
  return finiteMeasurement(key === 'quality_score'
    ? (record?.result?.quality_score ?? record?.result?.parameters?.quality_score)
    : record?.result?.parameters?.[key]);
}

export function groupTrendRecords(items, batchId, sampleType) {
  const farms = new Map();
  let excluded = 0;
  for (const record of items) {
    const scan = record?.scan;
    if (!SAMPLE_TYPES.includes(sampleType) || scan?.batch_id !== batchId || scan?.sample_type !== sampleType
      || (record.result?.sample_type && record.result.sample_type !== sampleType)
      || typeof scan.farm_id !== 'string' || !scan.farm_id.trim()) {
      excluded += 1;
      continue;
    }
    if (!farms.has(scan.farm_id)) farms.set(scan.farm_id, []);
    farms.get(scan.farm_id).push(record);
  }
  const groups = [...farms].map(([farmId, records]) => ({
    farmId,
    records: records.sort((a, b) => (scanTimestamp(a) ?? Infinity) - (scanTimestamp(b) ?? Infinity)
      || String(a.scan.id).localeCompare(String(b.scan.id))),
  })).sort((a, b) => a.farmId.localeCompare(b.farmId));
  return { groups, excluded };
}

// Missing dates/measurements create gaps rather than invented zeroes or interpolated readings.
export function trendSeries(records, key) {
  const points = [];
  const segments = [];
  let segment = [];
  const sorted = [...records].sort((a, b) => (scanTimestamp(a) ?? Infinity) - (scanTimestamp(b) ?? Infinity));
  for (const record of sorted) {
    const value = measurement(record, key);
    const timestamp = scanTimestamp(record);
    if (value === null || timestamp === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    const point = { value, timestamp, record };
    points.push(point);
    segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return { points, segments, omitted: records.length - points.length };
}

export function buildBatchUrl(origin, batchId, sampleType) {
  if (typeof batchId !== 'string' || !batchId.length || !SAMPLE_TYPES.includes(sampleType)) {
    throw new Error('Choose a batch and sample type to create a QR label.');
  }
  const source = new URL(origin);
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error('QR labels require an HTTP or HTTPS app URL.');
  // Start from origin: never copy login parameters, tokens, userinfo, or current query/hash.
  const url = new URL('/', source.origin);
  url.searchParams.set('batch', batchId);
  url.searchParams.set('sample_type', sampleType);
  url.hash = 'history';
  return url.href;
}

export function isLoopbackUrl(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]'
    || hostname === '0.0.0.0' || /^127\./.test(hostname);
}

export function qrFilename(batchId, sampleType) {
  const batch = String(batchId).normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'batch';
  return `nutriscan-${batch}-${SAMPLE_TYPES.includes(sampleType) ? sampleType : 'sample'}-qr.png`;
}

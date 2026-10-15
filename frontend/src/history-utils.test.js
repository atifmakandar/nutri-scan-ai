import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBatchUrl, buildHistorySearchPath, emptyHistoryFilters, formatScanDate,
  groupTrendRecords, historyFromSearch, historyPagination, isLoopbackUrl, qrFilename, scanTimestamp, trendSeries,
  validateHistoryFilters,
} from './history-utils.js';

function record({ id, batch = 'BATCH', farm = 'farm-a', sample = 'silage', date = '2026-10-14T08:00:00Z', quality = 50, parameters = {} } = {}) {
  return {
    scan: { id, batch_id: batch, farm_id: farm, sample_type: sample, created_at: date },
    result: { sample_type: sample, quality_score: quality, parameters },
  };
}

test('history search encodes dangerous and unicode identifiers and preserves pagination filters', () => {
  const filters = { ...emptyHistoryFilters(), batch_query: '羊 <& " feed', sample_type: 'feed', risk_level: 'HIGH', date_from: '2026-01-01', date_to: '2026-01-31' };
  const url = new URL(`http://example.test${buildHistorySearchPath(filters, { offset: 100, limit: 100 })}`);
  assert.equal(url.searchParams.get('batch_query'), '羊 <& " feed');
  assert.equal(url.searchParams.get('sample_type'), 'feed');
  assert.equal(url.searchParams.get('risk_level'), 'HIGH');
  assert.equal(url.searchParams.get('date_from'), '2026-01-01');
  assert.equal(url.searchParams.get('date_to'), '2026-01-31');
  assert.equal(url.searchParams.get('offset'), '100');
  assert.equal(url.searchParams.get('limit'), '100');
  const exact = new URL(`http://example.test${buildHistorySearchPath({ ...filters, batch_id: ' B/羊?& ', batch_query: 'ignored' })}`);
  assert.equal(exact.searchParams.get('batch_id'), ' B/羊?& ');
  assert.equal(exact.searchParams.get('batch_query'), null);
});

test('pagination parameters remain bounded integers without dropping literal substring input', () => {
  const params = new URLSearchParams(buildHistorySearchPath({ batch_query: '%_[] &x=1' }, { offset: -12, limit: 1000 }).split('?')[1]);
  assert.equal(params.get('batch_query'), '%_[] &x=1');
  assert.equal(params.get('offset'), '0');
  assert.equal(params.get('limit'), '100');
  const fallback = new URLSearchParams(buildHistorySearchPath({}, { offset: NaN, limit: Infinity }).split('?')[1]);
  assert.equal(fallback.get('offset'), '0');
  assert.equal(fallback.get('limit'), '25');
  const fractional = new URLSearchParams(buildHistorySearchPath({}, { offset: 26.9, limit: 0 }).split('?')[1]);
  assert.equal(fractional.get('offset'), '26');
  assert.equal(fractional.get('limit'), '1');
});

test('invalid date ranges are rejected before an API request is built', () => {
  assert.match(validateHistoryFilters({ ...emptyHistoryFilters(), date_from: '2026-02-30' }), /valid dates/);
  assert.match(validateHistoryFilters({ ...emptyHistoryFilters(), date_from: '2026-02-02', date_to: '2026-02-01' }), /on or before/);
  assert.throws(() => buildHistorySearchPath({ ...emptyHistoryFilters(), sample_type: 'other' }), /feed or silage/);
  assert.throws(() => buildHistorySearchPath({ risk_level: 'URGENT' }), /risk level/);
  assert.equal(validateHistoryFilters({ date_from: '2024-02-29', date_to: '2024-02-29' }), '');
});

test('query state initializes exact batch and sample from a QR history URL', () => {
  const state = historyFromSearch('?batch=%E7%BE%8A%20%3C%26&sample_type=silage');
  assert.equal(state.filters.batch_id, '羊 <&');
  assert.equal(state.filters.sample_type, 'silage');
  assert.deepEqual(state.selectedBatch, { batchId: '羊 <&', sampleType: 'silage' });
  assert.equal(historyFromSearch('?batch=BATCH').selectedBatch, null);
  assert.deepEqual(historyFromSearch('?batch=BATCH&sample_type=other'), { filters: { ...emptyHistoryFilters(), batch_id: 'BATCH' }, selectedBatch: null });
});

test('pagination spans the full total, including empty pages', () => {
  assert.deepEqual(historyPagination({ total: 251, offset: 100, limit: 100, items: [record({ id: 'a' })] }), {
    start: 101, end: 101, previous: 0, next: 200, lastOffset: 200, hasPrevious: true, hasNext: true,
  });
  assert.deepEqual(historyPagination({ total: 0, offset: 0, limit: 25, items: [] }), {
    start: 0, end: 0, previous: 0, next: 25, lastOffset: 0, hasPrevious: false, hasNext: false,
  });
  assert.equal(historyPagination({ total: 250, offset: 200, limit: 100, items: Array(50).fill({}) }).hasNext, false);
  assert.equal(historyPagination({ total: 2, offset: 25, limit: 25, items: [] }).hasPrevious, true);
  assert.equal(historyPagination({ total: 2, offset: 25, limit: 25, items: [] }).lastOffset, 0);
});

test('trend records are chronological, keep zero values, omit missing values, and separate farms', () => {
  const records = [
    record({ id: 'late', farm: 'farm-a', date: '2026-10-14T10:00:00Z', quality: 0, parameters: { moisture_pct: 0 } }),
    record({ id: 'early', farm: 'farm-a', date: '2026-10-14T08:00:00Z', quality: 20, parameters: { moisture_pct: 62 } }),
    record({ id: 'missing', farm: 'farm-a', date: '2026-10-14T09:00:00Z', quality: 30, parameters: {} }),
    record({ id: 'other-farm', farm: 'farm-b', date: '2026-10-14T07:00:00Z', quality: 90 }),
    record({ id: 'other-type', farm: 'farm-a', sample: 'feed', date: '2026-10-14T06:00:00Z', quality: 80 }),
  ];
  const grouped = groupTrendRecords(records, 'BATCH', 'silage');
  assert.deepEqual(grouped.groups.map((group) => group.farmId), ['farm-a', 'farm-b']);
  assert.deepEqual(grouped.groups[0].records.map((item) => item.scan.id), ['early', 'missing', 'late']);
  assert.equal(grouped.excluded, 1);
  const series = trendSeries(grouped.groups[0].records, 'quality_score');
  assert.deepEqual(series.points.map((point) => point.value), [20, 30, 0]);
  const moisture = trendSeries(grouped.groups[0].records, 'moisture_pct');
  assert.deepEqual(moisture.points.map((point) => point.value), [62, 0]);
  assert.equal(moisture.omitted, 1);
  assert.deepEqual(moisture.segments.map((segment) => segment.map((point) => point.value)), [[62], [0]], 'do not connect across an absent measurement');
  assert.deepEqual(records.map((item) => item.scan.id), ['late', 'early', 'missing', 'other-farm', 'other-type'], 'source snapshots are not mutated');
});

test('mismatched batch/result types and unknown farms are never plotted with a valid farm', () => {
  const badResult = record({ id: 'bad-result' });
  badResult.result.sample_type = 'feed';
  const items = [record({ id: 'ok' }), record({ batch: 'BATCH-extra' }), badResult, record({ farm: '' }), record({ farm: null }), null];
  const { groups, excluded } = groupTrendRecords(items, 'BATCH', 'silage');
  assert.equal(excluded, 5);
  assert.deepEqual(groups[0].records.map((item) => item.scan.id), ['ok']);
  assert.equal(groupTrendRecords(items, 'BATCH', 'invalid').groups.length, 0);
});

test('non-numeric/missing/non-finite readings and unrecorded dates are omitted, never coerced to zero', () => {
  const items = [null, undefined, NaN, Infinity, '12', false, {}].map((quality, index) => {
    const item = record({ id: String(index) });
    item.result.quality_score = quality;
    return item;
  });
  items.push(record({ id: 'zero', quality: 0 }), record({ id: 'no-date', quality: 75, date: null }));
  assert.deepEqual(trendSeries(items, 'quality_score').points.map((point) => point.value), [0]);
  assert.equal(trendSeries(items, 'quality_score').omitted, 8);
  assert.equal(scanTimestamp(record({ date: '2026-10-14T08:00:00' })), null);
  assert.equal(scanTimestamp(record({ date: 'invalid' })), null);
  assert.equal(formatScanDate(record({ date: '2026-10-14T13:30:00+05:30' })), '2026-10-14 08:00:00.000 UTC');
  assert.equal(formatScanDate(record({ date: null })), null);
});

test('QR URLs contain only encoded batch/sample route state and safe filenames', () => {
  const qr = buildBatchUrl('https://farm.example/app?token=secret#private', '羊 <&/"', 'silage');
  assert.equal(qr, 'https://farm.example/?batch=%E7%BE%8A+%3C%26%2F%22&sample_type=silage#history');
  assert.doesNotMatch(qr, /token|secret|private/);
  assert.equal(qrFilename('羊 <&/"', 'silage'), 'nutriscan-batch-silage-qr.png');
  assert.match(formatScanDate(record({ date: '2026-10-14T08:00:00Z' })), /2026-10-14 08:00:00\.000 UTC/);
  assert.deepEqual([...new URL(buildBatchUrl('https://user:pass@farm.example:8443/?token=s', ' BATCH ', 'feed')).searchParams], [['batch', ' BATCH '], ['sample_type', 'feed']]);
  assert.doesNotMatch(buildBatchUrl('https://user:pass@farm.example', 'BATCH', 'feed'), /user|pass/);
  assert.throws(() => buildBatchUrl('https://example.test', '', 'feed'), /Choose a batch/);
  assert.throws(() => buildBatchUrl('https://example.test', 'BATCH', 'anything'), /sample type/);
  assert.throws(() => buildBatchUrl('file:///app', 'BATCH', 'feed'), /HTTP or HTTPS/);
});

test('loopback warnings recognize localhost, IPv4 and IPv6 without flagging a private LAN host', () => {
  for (const host of ['localhost', 'unit.localhost', '127.0.0.1', '127.10.20.30', '[::1]', '0.0.0.0']) assert.equal(isLoopbackUrl(`http://${host}:5173/`), true);
  for (const host of ['farm.example', '192.168.1.20', 'localhost.example']) assert.equal(isLoopbackUrl(`https://${host}/`), false);
});

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { english } from './history-utils.js';

let server;
let HistoryPanel;
let HistoryResults;
let BatchTrends;
let BatchTrendData;
let SearchError;
let BatchQr;
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const noFetch = () => assert.fail('SSR must not make requests');

before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: HistoryPanel, HistoryResults } = await server.ssrLoadModule('/src/HistoryPanel.jsx'));
  ({ default: BatchTrends, BatchTrendData, SearchError } = await server.ssrLoadModule('/src/BatchTrends.jsx'));
  ({ default: BatchQr } = await server.ssrLoadModule('/src/BatchQr.jsx'));
});
after(async () => { await server?.close(); });

function saved(id, date, values = {}, farm = 'farm-a', sample = 'silage') {
  return {
    scan: { id, batch_id: 'BATCH', farm_id: farm, sample_type: sample, created_at: date },
    result: { sample_type: sample, quality_score: values.quality_score, risk_level: 'LOW', parameters: values },
  };
}

test('history initially renders labeled filters, UTC date constraints and an accessible loading state', () => {
  const html = render(HistoryPanel, { api: noFetch, onSelect() {}, canWrite: false });
  assert.match(html, /id="history"/);
  assert.match(html, /aria-label="Filter saved scans"/);
  assert.match(html, /name="batch_query"/);
  assert.match(html, /type="date"[^>]*name=|name="date_from"[^>]*type="date"/);
  assert.match(html, /name="date_to"/);
  assert.match(html, /Dates include the full start and end days in UTC/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status">Loading saved scans/);
  assert.match(html, /type="submit">Search history/);
  assert.match(html, /type="button">Reset filters/);
});

test('QR query initializes exact batch filters and selected batch trends without rendering identifiers as HTML', () => {
  const batch = '"><img src=x onerror=alert(1)>羊';
  const oldWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://farm.example', search: `?batch=${encodeURIComponent(batch)}&sample_type=feed` } };
  try {
    const html = render(HistoryPanel, { api: noFetch, onSelect() {} });
    assert.match(html, /name="batch_id"/);
    assert.match(html, /value="exact" selected/);
    assert.match(html, /value="feed" selected/);
    assert.match(html, /Batch trends/);
    assert.match(html, /Loading batch trends/);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img/);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('history empty and out-of-range states expose pagination and read-only-safe actions', () => {
  for (const canWrite of [false, true]) {
    const html = render(HistoryResults, { data: { items: [], total: 0, offset: 0, limit: 25 }, canWrite });
    assert.match(html, /role="status">Showing 0–0 of 0 saved scans/);
    assert.match(html, /No saved scans match these filters/);
    assert.equal(html.includes('Start a screening'), canWrite);
    assert.match(html, /aria-label="History pages"/);
    assert.equal((html.match(/disabled=""/g) || []).length, 4);
  }
  const html = render(HistoryResults, { data: { items: [], total: 10, offset: 25, limit: 25 } });
  assert.match(html, /This page has no scans/);
  assert.match(html, /type="button">First page/);
  assert.match(html, /type="button">Previous page/);
});

test('saved rows retain zero, identify farm/sample, expose view/batch/QR and existing report actions', () => {
  const record = saved('id-zero', '2026-10-14T08:00:00Z', { quality_score: 0 });
  record.scan.batch_id = '<script>羊&"';
  const html = render(HistoryResults, { data: { items: [record], total: 251, offset: 100, limit: 100 }, canWrite: false });
  assert.match(html, /Showing 101–101 of 251/);
  assert.match(html, /<caption>Saved scans matching the applied filters/);
  assert.match(html, /Farm: farm-a/);
  assert.match(html, /<td>Silage<\/td>/);
  assert.match(html, /<td>0<\/td>/);
  assert.match(html, /View result/);
  assert.match(html, /View batch/);
  assert.match(html, /QR label/);
  assert.match(html, /Download report \(\.html\)/);
  assert.match(html, /Print \/ Save PDF/);
  assert.match(html, /type="button">Next page/);
  assert.match(html, /type="button">Last page/);
  assert.match(html, /&lt;script&gt;羊&amp;&quot;/);
  assert.doesNotMatch(html, /<script/);
});

test('request errors expose a retry action and specific authentication/permission messages', () => {
  for (const [status, expected] of [[401, /Sign in again/], [403, /permission/], [500, /Request failed/]]) {
    const html = render(SearchError, { error: Object.assign(new Error('Request failed'), { status }) });
    assert.match(html, /role="alert"/);
    assert.match(html, expected);
    assert.match(html, /type="button">Try again/);
  }
});

test('batch/QR components provide accessible empty states without a valid batch and type', () => {
  for (const props of [{}, { batchId: 'BATCH', sampleType: 'bad' }, { batchId: '', sampleType: 'feed' }]) {
    assert.match(render(BatchTrends, { api: noFetch, ...props }), /role="status">Choose a batch and sample type to view trends/);
    assert.match(render(BatchQr, props), /role="status">Choose a batch and sample type to create a QR label/);
  }
  const html = render(BatchTrendData, { items: [], total: 0, batchId: 'BATCH', sampleType: 'silage' });
  assert.match(html, /Loaded 0 of 0/);
  assert.match(html, /role="status">No matching scans/);
  assert.doesNotMatch(html, /<svg/);
});

test('batch trends disclose count/total and show four separate chronologically ordered charts and a data table', () => {
  const items = [
    saved('late', '2026-10-14T10:00:00Z', { quality_score: 100, moisture_pct: 63, temperature_c: 24, ph: 4.2 }),
    saved('early', '2026-10-14T08:00:00Z', { quality_score: 0, moisture_pct: 0, temperature_c: 0, ph: 0 }),
    saved('middle', '2026-10-14T09:00:00Z', {}),
    saved('other-type', '2026-10-14T07:00:00Z', { quality_score: 90 }, 'farm-a', 'feed'),
  ];
  const html = render(BatchTrendData, { items, total: 130, batchId: 'BATCH', sampleType: 'silage' });
  assert.match(html, /Loaded 4 of 130.*latest 100 maximum/);
  assert.match(html, /Older scans are not included/);
  assert.equal((html.match(/<svg /g) || []).length, 4);
  assert.equal((html.match(/role="img"/g) || []).length, 4);
  for (const title of ['Quality (/ 100)', 'Moisture (%)', 'Temperature (°C)', 'pH (unitless)']) assert.ok(html.includes(title), title);
  assert.match(html, /<caption>Saved measurements/);
  assert.match(html, /scope="row"/);
  assert.equal((html.match(/<td>0<\/td>/g) || []).length, 4);
  assert.equal((html.match(/<td>Not recorded<\/td>/g) || []).length, 4);
  assert.equal((html.match(/<polyline /g) || []).length, 0, 'missing middle scan must break the plotted line');
  assert.ok(html.indexOf('<td>early</td>') < html.indexOf('<td>middle</td>'));
  assert.ok(html.indexOf('<td>middle</td>') < html.indexOf('<td>late</td>'));
  assert.doesNotMatch(html, /other-type/);
  assert.doesNotMatch(html, /undefined|NaN|Invalid Date/);
});

test('multiple farms require selection and never expose a combined line or combined data table', () => {
  const html = render(BatchTrendData, {
    items: [saved('a', '2026-10-14T08:00:00Z', { quality_score: 10 }), saved('b', '2026-10-14T09:00:00Z', { quality_score: 80 }, 'farm-b')],
    total: 2, batchId: 'BATCH', sampleType: 'silage',
  });
  assert.match(html, /Farm for these trends/);
  assert.match(html, /value="farm-a"/);
  assert.match(html, /value="farm-b"/);
  assert.match(html, /Choose one farm to keep its trends separate/);
  assert.doesNotMatch(html, /<svg|<table/);
});

test('single/missing measurements show insufficient-data notices and unitful accessible chart names', () => {
  const html = render(BatchTrendData, { items: [saved('a', '2026-10-14T08:00:00Z', { quality_score: 0 })], total: 1, batchId: 'BATCH', sampleType: 'silage' });
  assert.equal((html.match(/At least two recorded measurements/g) || []).length, 4);
  assert.equal((html.match(/No recorded measurements/g) || []).length, 3);
  assert.equal((html.match(/<circle /g) || []).length, 1);
  assert.match(html, /1 recorded measurements/);
});

test('all panels pass complete English messages and replacement values through the supplied translator', () => {
  const t = (text, values) => `localized:${english(text, values)}`;
  assert.match(render(HistoryPanel, { api: noFetch, onSelect() {}, t }), /localized:Screening history/);
  assert.match(render(BatchQr, { t }), /localized:Choose a batch/);
  const html = render(BatchTrendData, { items: [], total: 0, batchId: 'BATCH', sampleType: 'feed', t });
  assert.match(html, /localized:Loaded 0 of 0/);
  assert.doesNotMatch(html, /\{count\}|\{total\}/);
});

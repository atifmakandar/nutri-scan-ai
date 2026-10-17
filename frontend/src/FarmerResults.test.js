import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { translate, translateAdvisory } from './i18n.js';
import { resultsText, SCREENING_NOTICE, spokenSummary } from './farmer-results.js';

let server;
let FarmerResults;
let BatchComparison;
let SavedComparison;
let ShareSummary;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: FarmerResults, BatchComparison, SavedComparison, ShareSummary } = await server.ssrLoadModule('/src/FarmerResults.jsx'));
});
after(async () => { await server?.close(); });

const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const saved = (id = 'selected', date = '2026-10-15T00:00:00Z') => ({
  scan: { id, farm_id: 'private-farm', batch_id: 'BATCH-1', sample_type: 'silage', created_at: date },
  result: { id: `result-${id}`, sample_type: 'silage', quality_score: 0, confidence: 0, risk_level: 'LOW',
    parameters: { moisture_pct: 0, dry_matter_pct: 0, protein_pct: 0, fiber_pct: 0, ph: 0, temperature_c: 0, nutritional_score: 0, fermentation_quality: 'Review', spoilage_risk: 'Low', future_parameter: 0 },
    assessment: { kind: 'prototype_screening', model_version: 'prototype-baseline-0.1', calibration_status: 'uncalibrated' },
    anomalies: ['Visual mould indicator detected', 'Unusual sample colour pattern', 'Elevated storage temperature', 'Silage pH outside prototype target range'],
    advisory: ['Isolate the affected batch and verify with a qualified test before feeding.', 'Inspect storage ventilation and temperature conditions.', 'Review fermentation and storage conditions; confirm pH with a validated method.', 'Use the result as a screening signal and consider confirmatory laboratory testing.'],
  },
});

test('empty SSR requires no browser, API call or speech component', () => {
  const html = render(FarmerResults, { api: () => assert.fail('no SSR request'), renderListen: () => assert.fail('no empty speech') });
  assert.match(html, /Select a result to see its summary/);
  assert.doesNotMatch(html, /Preview summary|<img|<iframe|https?:/);
});

test('saved instrument provenance survives nullable API metadata and stays explicitly device-reported', () => {
  const record = saved();
  record.scan.instrument_capture = {
    device_id: 'METER<farm>', captured_at: '2026-10-15T03:00:00Z', calibration_status: 'reported_current',
    calibration_reference: null, readings: [{ field: 'moisture_pct', value: 0, unit: '%' }],
  };
  const html = render(FarmerResults, { record });
  assert.match(html, /saved-instrument-provenance/);
  assert.match(html, /METER&lt;farm&gt;/);
  assert.match(html, /Current calibration \(device report\)/);
  assert.match(html, /not verified by Nutri-Scan/);
  assert.match(html, /Moisture: 0 %/);
  assert.doesNotMatch(html, /METER<farm>|Calibration reference \(device report\)/);
});

test('review-required inputs are prominent and transparent score factors are visible', () => {
  const record = saved();
  record.result.capability_signals = [{ code: 'aflatoxin_concern', status: 'review_required' }];
  record.result.score_breakdown = [
    { code: 'ph_fit', score: 100, weight: 0.28, contribution: 28 },
    { code: 'moisture_fit', score: 100, weight: 0.22, contribution: 22 },
  ];
  const html = render(FarmerResults, { record });
  assert.match(html, /Review required before feeding decisions/);
  assert.match(html, /not a detection result and does not change the prototype score/);
  assert.match(html, /Aflatoxin concern input/);
  assert.match(html, /Transparent score breakdown/);
  assert.match(html, /pH fit/);
  assert.match(html, /28%/);
  assert.match(html, /28 points/);
});

test('risk has readable text plus icon; prominent uncalibrated safety and heuristic qualifications stay outside details', () => {
  for (const [risk, expected] of [['LOW', 'Lower screening risk'], ['MEDIUM', 'Moderate screening risk'], ['HIGH', 'Higher screening risk'], ['<unsafe>', 'Screening risk not recorded']]) {
    const record = saved();
    record.result.risk_level = risk;
    const html = render(FarmerResults, { record });
    assert.ok(html.includes(expected));
    assert.match(html, /fr-risk-icon" aria-hidden="true"/);
    assert.match(html, /<p class="fr-safety" role="note"><strong>Uncalibrated/);
    const firstDetails = html.indexOf('<details');
    assert.ok(html.indexOf(SCREENING_NOTICE) < firstDetails);
    assert.ok(html.indexOf('Confidence is a heuristic') < firstDetails);
    assert.doesNotMatch(html, /Good quality|fr-risk-&lt;|<unsafe>/);
  }
});

test('all saved advisories and anomalies remain readable; measurements/details are collapsed and numerical zero survives', () => {
  const record = saved();
  record.result.anomalies.push('<script>alert("not markup")</script>', 'duplicate', 'duplicate');
  const html = render(FarmerResults, { record });
  for (const value of [...record.result.anomalies.slice(0, 4), ...record.result.advisory]) assert.ok(html.includes(value), value);
  assert.equal((html.match(/<li>duplicate<\/li>/g) || []).length, 2);
  assert.match(html, /&lt;script&gt;alert\(&quot;not markup&quot;\)&lt;\/script&gt;/);
  assert.match(html, /<details class="fr-details"><summary>Measurements and model details/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.match(html, /<dt>Moisture<\/dt><dd>0 %<\/dd>/);
  assert.match(html, /<dt>Temperature<\/dt><dd>0 °C<\/dd>/);
  assert.match(html, /<dt>Confidence indicator<\/dt><dd>0 %<\/dd>/);
  assert.match(html, /<dt>Prototype score<\/dt><dd>0 \/ 100<\/dd>/);
  assert.match(html, /<dt>Nutritional score<\/dt><dd>0 \/ 100<\/dd>/);
  assert.match(html, /<dt>future_parameter<\/dt><dd>0<\/dd>/);
  assert.match(html, /Fermentation<\/dt><dd>Review/);
  assert.match(html, /Spoilage risk<\/dt><dd>Low/);
  assert.match(html, /prototype-baseline-0.1/);
  assert.doesNotMatch(html, /<img|<iframe|photos are analyzed/i);
});

test('missing data is marked as absent instead of implying a clear result or inventing values', () => {
  const html = render(FarmerResults, { record: { result: {} } });
  assert.match(html, /Screening risk not recorded/);
  assert.match(html, /No anomaly information was saved/);
  assert.match(html, /No advice was saved/);
  assert.match(html, /<dt>Moisture<\/dt><dd>Not recorded/);
  assert.match(html, /Only saved results can be shared/);
  assert.doesNotMatch(html, /No major anomaly indicator|undefined|NaN|Infinity/);
});

test('parent speech hook receives the complete localized summary and does not run browser speech itself', () => {
  const record = saved();
  for (const locale of ['hi', 'mr']) {
    const t = Object.assign((key, values) => translate(locale, key, values), { locale });
    const calls = [];
    const html = render(FarmerResults, { record, t, renderListen: (text) => { calls.push(text); return createElement('button', { type: 'button' }, 'speech supplied by parent'); } });
    assert.deepEqual(calls, [spokenSummary(record, t)]);
    assert.ok(calls[0].includes(resultsText(t)(SCREENING_NOTICE)));
    for (const value of [...record.result.advisory, ...record.result.anomalies]) assert.ok(calls[0].includes(translateAdvisory(locale, value)));
    assert.match(html, /speech supplied by parent/);
    assert.ok(html.includes(resultsText(t)('Lower screening risk — keep monitoring')));
    assert.doesNotMatch(html, /speechSynthesis|https?:/);
  }
});

test('synchronous comparison is chronological, selected-relative and neutral, with missing values kept incomparable', () => {
  const record = saved();
  const previous = saved('previous', '2026-10-14T00:00:00Z');
  const future = saved('future', '2099-01-01T00:00:00Z');
  record.result.parameters.moisture_pct = 2;
  previous.result.parameters.ph = Infinity;
  const html = render(BatchComparison, { records: [future, record, previous], record });
  assert.match(html, /Previous saved result: 2026-10-14 00:00:00.000 UTC → Selected saved result: 2026-10-15 00:00:00.000 UTC/);
  assert.match(html, /\+2 percentage points/);
  assert.match(html, /Moisture increased from 0 % to 2 %\./);
  assert.match(html, /No numerical change/);
  assert.match(html, /Not comparable/);
  assert.match(html, /at most 100 supplied records/);
  assert.match(html, /bounded sample/);
  assert.match(html, /immediately previous strictly earlier/);
  assert.match(html, /not automatically good or bad and does not establish a cause/);
  assert.doesNotMatch(html, /2099|Infinity|NaN|improved|worsened/);
});

test('no previous result and ambiguous timestamps have explicit non-comparison states', () => {
  const record = saved();
  assert.match(render(BatchComparison, { records: [record], record }), /No strictly earlier matching saved result/);
  assert.match(render(BatchComparison, { records: [saved('one', '2026-10-14T00:00:00Z'), saved('two', '2026-10-14T00:00:00Z')], record }), /previous saved result is ambiguous/);
  assert.match(render(BatchComparison, { records: [record] }), /valid saved-at timezone is needed/);
});

test('saved comparison SSR loads only after mounting and displays a loading state for an exact saved batch', () => {
  const api = () => assert.fail('SSR must not request history');
  const html = render(SavedComparison, { record: saved(), api });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading the saved batch comparison/);
  const invalid = saved();
  invalid.scan.created_at = '';
  assert.match(render(SavedComparison, { record: invalid, api }), /valid saved-at timezone is needed/);
  assert.match(render(SavedComparison, { record: saved() }), /Saved history is unavailable/);
});

test('share controls are saved-only and privacy-preview-first, with both farm identity options off', () => {
  const browser = { navigator: { share: () => assert.fail('no action before preview'), clipboard: { writeText: () => assert.fail('no copy before preview') } }, open: () => assert.fail('no external action before preview') };
  const record = saved();
  record.photos = [{ url: 'https://private.invalid/photo' }];
  record.user = { username: 'private-user' };
  const html = render(ShareSummary, { record, browser, farmName: 'private-farm-name' });
  assert.match(html, /Preview summary/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
  assert.doesNotMatch(html, /\bchecked=|<textarea|Share using this device|Copy summary|Send text to WhatsApp|https?:|private-user|private-farm-name|private-farm/);
  assert.match(html, /Photos are excluded: private photo evidence cannot be safely shared automatically/);
  const unsaved = render(ShareSummary, { record: { result: record.result }, browser });
  assert.match(unsaved, /Only saved results can be shared/);
  assert.doesNotMatch(unsaved, /Preview summary|type="checkbox"/);
});

test('FarmerResults wires the authenticated API through sharing without loading photos or selecting attachments on render', () => {
  const html = render(FarmerResults, { record: saved(), api: () => assert.fail('SSR never loads evidence') });
  assert.match(html, />Choose saved photos<\/button>/);
  assert.doesNotMatch(html, /disabled="">Choose saved photos|Saved photo sharing is unavailable|<img|<textarea/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2, 'only existing farm opt-ins until the choose action');
});

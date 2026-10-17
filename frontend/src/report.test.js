import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportHtml, reportFilename, downloadReport, printReport } from './report.js';

function savedRecord() {
  return {
    scan: {
      id: 'scan-123', farm_id: 'farm-456', batch_id: 'SIL-2026-0142',
      sample_type: 'silage', source_mode: 'esp32', device_id: 'field-unit-04',
      collected_at: '2026-10-14T13:45:00+05:30', created_at: '2026-10-14T08:16:00Z',
    },
    result: {
      id: 'result-789', created_at: '2026-10-14T08:16:01.123456+00:00', sample_type: 'silage',
      quality_score: 81.7, confidence: 75.5, risk_level: 'LOW',
      parameters: {
        moisture_pct: 62, dry_matter_pct: 38, protein_pct: 8.8, fiber_pct: 28,
        ph: 4.2, temperature_c: 24, fermentation_quality: 'Good',
        spoilage_risk: 'Low', nutritional_score: 84.4,
      },
      anomalies: ['No major anomaly indicator in supplied prototype inputs', 'Second saved indicator'],
      advisory: ['Continue routine monitoring.', 'Confirm with a qualified laboratory.'],
      capability_signals: [
        { code: 'energy_reported', status: 'reported', source: 'operator_or_lab_input' },
        { code: 'urea_concern', status: 'review_required', source: 'operator_or_lab_input' },
      ],
      assessment: {
        kind: 'prototype_screening', model_version: 'prototype-baseline-0.1', calibration_status: 'uncalibrated',
      },
    },
  };
}

test('reports preserve optional capability inputs as reported/review flags without detection claims', () => {
  const html = buildReportHtml(savedRecord());
  assert.match(html, /Capability inputs &amp; review flags/);
  assert.match(html, /Reported energy value/);
  assert.match(html, /Urea concern input/);
  assert.match(html, /Qualified confirmation required/);
  assert.match(html, /not confirmed detection results/);
});

test('reports make review-required concerns and transparent score contributions prominent', () => {
  const record = savedRecord();
  record.result.score_breakdown = [{ code: 'ph_fit', score: 100, weight: 0.28, contribution: 28 }];
  const html = buildReportHtml(record);
  assert.match(html, /Review required before feeding decisions/);
  assert.match(html, /not a detection result and does not change the prototype score/);
  assert.match(html, /Transparent score breakdown/);
  assert.match(html, /pH fit/);
  assert.match(html, /28 points/);
});

function deepFreeze(value) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') deepFreeze(child);
  });
  return Object.freeze(value);
}

function downloadBrowser() {
  const state = { blobs: [], revoked: [], timers: [], children: [], clicks: 0, removed: 0 };
  const anchor = {
    click() {
      assert.ok(state.children.includes(this), 'anchor must be attached when clicked');
      state.clicks += 1;
    },
    remove() {
      state.children = state.children.filter((child) => child !== this);
      state.removed += 1;
    },
  };
  const browser = {
    Blob,
    URL: {
      createObjectURL(blob) { state.blobs.push(blob); return 'blob:test-report'; },
      revokeObjectURL(url) { state.revoked.push(url); },
    },
    document: {
      body: { appendChild(child) { state.children.push(child); } },
      createElement(tag) { assert.equal(tag, 'a'); return anchor; },
    },
    setTimeout(callback, delay) { state.timers.push({ callback, delay }); return 1; },
  };
  return { browser, state, anchor };
}

function printBrowser() {
  const state = { events: [], html: '', closed: false, opener: 'original window' };
  const popup = {
    get opener() { return state.opener; },
    set opener(value) { state.events.push('null opener'); state.opener = value; },
    document: {
      open() { state.events.push('document.open'); },
      write(html) {
        assert.equal(state.opener, null, 'opener is removed before any markup is written');
        state.events.push('document.write'); state.html += html;
      },
      close() { state.events.push('document.close'); },
    },
    close() { state.closed = true; },
    print() { assert.fail('printing must remain a user action'); },
  };
  const browser = {
    open(...args) { state.events.push(args); return popup; },
    fetch() { assert.fail('reports must not fetch'); },
    document: { querySelector() { assert.fail('reports must not consult the form'); } },
  };
  return { browser, popup, state };
}

test('complete saved record includes traceability, UTC dates and all engine measurements', () => {
  const record = savedRecord();
  const html = buildReportHtml(record);
  for (const value of ['farm-456', 'SIL-2026-0142', 'scan-123', 'result-789', 'silage', 'esp32', 'field-unit-04']) {
    assert.ok(html.includes(value), `missing ${value}`);
  }
  assert.match(html, /<dt>Collected at<\/dt><dd>2026-10-14 08:15:00\.000 UTC<\/dd>/);
  assert.match(html, /<dt>Scan saved at<\/dt><dd>2026-10-14 08:16:00\.000 UTC<\/dd>/);
  assert.match(html, /<dt>Result created at<\/dt><dd>2026-10-14 08:16:01\.123 UTC<\/dd>/);
  assert.match(html, /<dt>Quality score<\/dt><dd>81\.7 \/ 100<\/dd>/);
  assert.match(html, /<dt>Heuristic confidence<\/dt><dd>75\.5 \/ 100<\/dd>/);
  assert.match(html, /<dd class="risk-low">LOW<\/dd>/);
  for (const [label, value, unit] of [
    ['Moisture', '62', '%'], ['Dry matter', '38', '%'], ['Protein', '8.8', '%'],
    ['Crude fiber', '28', '%'], ['pH', '4.2', 'unitless'], ['Temperature', '24', '°C'],
    ['Fermentation quality', 'Good', '—'], ['Spoilage risk', 'Low', '—'], ['Nutritional score', '84.4', '/ 100'],
  ]) {
    assert.ok(html.includes(`<th scope="row">${label}</th><td>${value}</td><td>${unit}</td>`), label);
  }
  for (const item of [...record.result.anomalies, ...record.result.advisory]) {
    assert.ok(html.includes(`<li>${item}</li>`));
  }
  for (const value of Object.values(record.result.assessment)) assert.ok(html.includes(value));
});

test('prototype and confidence qualifications remain prominent even for low risk', () => {
  const html = buildReportHtml(savedRecord());
  assert.match(html, /<section class="disclaimer"/);
  assert.match(html, /<h2[^>]*>Uncalibrated prototype — not a certified laboratory report<\/h2>/);
  assert.match(html, /not a validated probability/);
  assert.match(html, /low risk label does not guarantee safety or suitability for feeding/);
});

test('zero scores and measurements are retained without treating zero as absent', () => {
  const record = savedRecord();
  record.result.quality_score = 0;
  record.result.confidence = 0;
  for (const key of Object.keys(record.result.parameters)) record.result.parameters[key] = 0;
  const html = buildReportHtml(record);
  assert.match(html, /<dt>Quality score<\/dt><dd>0 \/ 100<\/dd>/);
  assert.match(html, /<dt>Heuristic confidence<\/dt><dd>0 \/ 100<\/dd>/);
  assert.equal((html.match(/<td>0<\/td>/g) || []).length, 9);
});

test('missing optional fields and empty arrays give neutral, readable placeholders', () => {
  const html = buildReportHtml({ scan: { id: 'saved-scan' }, result: {} });
  assert.match(html, /<dt>Device ID<\/dt><dd>Not recorded<\/dd>/);
  assert.match(html, /<dt>Quality score<\/dt><dd>Not recorded<\/dd>/);
  assert.match(html, /<dt>Calibration status<\/dt><dd>Not recorded<\/dd>/);
  assert.match(html, /No measurements recorded/);
  assert.match(html, /No anomaly entries recorded/);
  assert.match(html, /No advisory entries recorded/);
  assert.doesNotMatch(html, /undefined|NaN|Invalid Date|\[object Object\]/);
  const empty = savedRecord();
  empty.result.anomalies = [];
  empty.result.advisory = [];
  empty.result.parameters = {};
  assert.match(buildReportHtml(empty), /No advisory entries recorded/);
});

test('invalid optional types and non-finite numbers are never formatted as values', () => {
  const record = savedRecord();
  record.scan.device_id = {};
  record.scan.collected_at = Infinity;
  record.result.quality_score = NaN;
  record.result.confidence = Infinity;
  record.result.parameters = { moisture_pct: NaN, protein_pct: Infinity, other: null, object: {} };
  record.result.anomalies = null;
  record.result.advisory = 'not an array';
  record.result.assessment = [];
  const html = buildReportHtml(record);
  assert.doesNotMatch(html, /undefined|NaN|Infinity|Invalid Date|\[object Object\]/);
  assert.match(html, /<dt>Heuristic confidence<\/dt><dd>Not recorded<\/dd>/);
  for (const value of [-1, 101, '90', null]) {
    record.result.quality_score = value;
    assert.match(buildReportHtml(record), /<dt>Quality score<\/dt><dd>Not recorded<\/dd>/);
  }
});

test('timezone-less and invalid saved dates never acquire a guessed local timezone', () => {
  const record = savedRecord();
  record.scan.collected_at = '2026-10-14T13:45:00';
  record.scan.created_at = 'not-a-date';
  record.result.created_at = null;
  const html = buildReportHtml(record);
  assert.match(html, /2026-10-14 13:45:00 \(timezone not recorded\)/);
  assert.match(html, /not-a-date \(unrecognized saved date; timezone unavailable\)/);
  assert.match(html, /<dt>Result created at<\/dt><dd>Not recorded<\/dd>/);
  assert.doesNotMatch(html, /Invalid Date|NaN/);
});

const attack = '</title><script>alert("x")</script><img src=x onerror=alert(1)>&\'é';
const escapedAttack = '&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;é';

test('every dynamic text location, including the title and saved dates, escapes markup', () => {
  const paths = [
    ['scan', 'id'], ['scan', 'farm_id'], ['scan', 'batch_id'], ['scan', 'sample_type'],
    ['scan', 'source_mode'], ['scan', 'device_id'], ['scan', 'collected_at'], ['scan', 'created_at'],
    ['result', 'id'], ['result', 'created_at'], ['result', 'sample_type'], ['result', 'risk_level'],
    ['result', 'parameters', 'fermentation_quality'], ['result', 'parameters', 'moisture_pct'],
    ['result', 'anomalies', 0], ['result', 'advisory', 0], ['result', 'assessment', 'kind'],
    ['result', 'assessment', 'model_version'], ['result', 'assessment', 'calibration_status'],
  ];
  for (const path of paths) {
    const record = savedRecord();
    const target = path.slice(0, -1).reduce((value, key) => value[key], record);
    target[path.at(-1)] = attack;
    const html = buildReportHtml(record);
    assert.ok(html.includes(escapedAttack), `escaped value is missing at ${path.join('.')}`);
    assert.ok(!html.includes(attack), `raw markup at ${path.join('.')}`);
    assert.doesNotMatch(html, /<script\b|<img\b/i);
    assert.equal((html.match(/<\/title>/g) || []).length, 1);
    assert.equal((html.match(/\sonclick="/g) || []).length, 1, 'only the static print handler exists');
  }
  const record = savedRecord();
  record.scan.batch_id = attack;
  assert.ok(buildReportHtml(record).includes(`<title>Nutri-Scan AI report — ${escapedAttack} — scan-123</title>`));
});

test('unrecognized measurement keys are escaped and prototype-like keys stay ordinary text', () => {
  const record = savedRecord();
  record.result.parameters = JSON.parse('{"__proto__":"saved value","constructor":3,"toString":0}');
  record.result.parameters[attack] = attack;
  const html = buildReportHtml(record);
  assert.ok(html.includes(`<th scope="row">${escapedAttack}</th><td>${escapedAttack}</td>`));
  assert.match(html, /<th scope="row">__proto__<\/th><td>saved value<\/td><td>Not specified<\/td>/);
  assert.match(html, /<th scope="row">constructor<\/th><td>3<\/td>/);
  assert.match(html, /<th scope="row">toString<\/th><td>0<\/td>/);
});

test('risk classes are fixed allowlisted values, never saved HTML or CSS', () => {
  const record = savedRecord();
  const originalStyle = buildReportHtml(record).match(/<style>([\s\S]*?)<\/style>/)[1];
  for (const risk of ['HIGH" onclick="alert(1)', '</style><script>alert(1)</script>', '__proto__', 'constructor', 'low', attack]) {
    record.result.risk_level = risk;
    const html = buildReportHtml(record);
    assert.match(html, /<dd class="risk-unknown">/);
    assert.doesNotMatch(html, /<script\b/);
    assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], originalStyle);
    assert.equal((html.match(/\sonclick="/g) || []).length, 1);
  }
  for (const [risk, className] of [['LOW', 'risk-low'], ['MEDIUM', 'risk-medium'], ['HIGH', 'risk-high']]) {
    record.result.risk_level = risk;
    assert.ok(buildReportHtml(record).includes(`<dd class="${className}">${risk}</dd>`));
  }
});

test('long Unicode snapshot values are preserved and the document supports wrapping', () => {
  const record = savedRecord();
  const longValue = 'पोषण 🌾 農場 café — '.repeat(1000);
  record.scan.batch_id = longValue;
  record.result.advisory.push(longValue);
  const html = buildReportHtml(record);
  assert.ok(html.includes(`<li>${longValue}</li>`));
  assert.ok(html.includes(`<dd>${longValue}</dd>`));
  assert.match(html, /overflow-wrap: anywhere/);
  assert.match(html, /<meta charset="utf-8">/);
});

test('HTML is standalone with static printing controls and legible print CSS', () => {
  const html = buildReportHtml(savedRecord());
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<button type="button" onclick="window\.print\(\)">Print \/ Save PDF<\/button>/);
  assert.match(html, /Ctrl\+P/);
  assert.match(html, /Cmd\+P/);
  assert.match(html, /@page\s*\{\s*margin: 16mm/);
  assert.match(html, /@media print\s*\{[\s\S]*\.report-actions\s*\{\s*display: none !important/);
  assert.match(html, /thead\s*\{\s*display: table-header-group/);
  assert.match(html, /break-inside: avoid/);
  assert.doesNotMatch(html, /https?:\/\/|(?:src|href)\s*=|@import\b|url\s*\(|<script\b|<iframe\b|<link\b|<img\b/i);
  assert.equal((html.match(/window\.print/g) || []).length, 1);
});

test('build and filename are deterministic from the snapshot and work in Node without a DOM', (t) => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');
  const record = savedRecord();
  const expected = buildReportHtml(record);
  const before = structuredClone(record);
  deepFreeze(record);
  const RealDate = globalThis.Date;
  class SavedDateOnly extends RealDate {
    constructor(...args) {
      assert.notEqual(args.length, 0, 'current time must not be used');
      super(...args);
    }
    static now() { assert.fail('current time must not be used'); }
  }
  t.mock.method(globalThis, 'Date', SavedDateOnly);
  t.mock.method(Math, 'random', () => assert.fail('random values must not be used'));
  t.mock.method(globalThis, 'fetch', () => assert.fail('reports must not fetch'));
  assert.equal(buildReportHtml(record), expected);
  assert.equal(reportFilename(record), 'nutri-scan-report-SIL-2026-0142-scan-123.html');
  assert.deepEqual(record, before);
});

test('filenames are portable, bounded and contain both sanitized batch and scan components', () => {
  const record = savedRecord();
  assert.equal(reportFilename(record), 'nutri-scan-report-SIL-2026-0142-scan-123.html');
  for (const value of ['../../CON:*?"<>|\\\r\n', 'élevage 🌾 農場', attack, 'x'.repeat(5000), '....', 'NUL', '  ']) {
    record.scan.batch_id = value;
    record.scan.id = value;
    const name = reportFilename(record);
    assert.match(name, /^nutri-scan-report-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.html$/);
    assert.ok(name.length <= 120);
    assert.equal(name.split('.').length, 2);
    assert.equal(name, reportFilename(record));
  }
  record.scan.batch_id = 'café / silo';
  record.scan.id = 'scan:123';
  assert.equal(reportFilename(record), 'nutri-scan-report-cafe-silo-scan-123.html');
});

test('filename fallbacks cover absent or entirely nonportable identifiers', () => {
  assert.equal(reportFilename({ scan: {}, result: {} }), 'nutri-scan-report-batch-scan.html');
  assert.equal(reportFilename({ scan: { batch_id: '🌾', id: '農場' }, result: {} }), 'nutri-scan-report-batch-scan.html');
  assert.equal(reportFilename({ scan: { batch_id: 0, id: 0 }, result: {} }), 'nutri-scan-report-0-0.html');
});

test('invalid records throw readable errors before any browser side effects', () => {
  const browser = new Proxy({}, { get() { assert.fail('invalid records must not access the browser'); } });
  for (const record of [
    undefined, null, 0, '', [], {}, { result: {} }, { scan: {} },
    { scan: null, result: {} }, { scan: [], result: {} }, { scan: 'scan', result: {} },
    { scan: {}, result: [] }, { scan: {}, result: null }, { scan: new Date(0), result: {} },
  ]) {
    for (const fn of [buildReportHtml, reportFilename, downloadReport, printReport]) {
      assert.throws(() => fn(record, browser), /saved scan with scan and result objects is required/i);
    }
  }
});

test('download creates a UTF-8 HTML Blob, clicks the named anchor and delays URL cleanup', async () => {
  const record = savedRecord();
  record.scan.farm_id = 'पोषण 🌾';
  const expectedHtml = buildReportHtml(record);
  const expectedName = reportFilename(record);
  const { browser, state, anchor } = downloadBrowser();
  const name = downloadReport(record, browser);
  assert.equal(name, expectedName, 'the API returns synchronously');
  assert.equal(state.blobs.length, 1);
  assert.ok(state.blobs[0] instanceof Blob);
  assert.equal(state.blobs[0].type, 'text/html;charset=utf-8');
  record.scan.farm_id = 'unsaved changed form';
  assert.equal(await state.blobs[0].text(), expectedHtml, 'the Blob captures the provided snapshot');
  assert.equal(anchor.href, 'blob:test-report');
  assert.equal(anchor.download, expectedName);
  assert.equal(anchor.hidden, true);
  assert.equal(state.clicks, 1);
  assert.deepEqual(state.children, []);
  assert.equal(state.removed, 1);
  assert.deepEqual(state.revoked, [], 'URL must not be revoked immediately');
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].delay, 60_000);
  state.timers[0].callback();
  assert.deepEqual(state.revoked, ['blob:test-report']);
});

test('download removes the temporary anchor and schedules URL cleanup when clicking fails', () => {
  const { browser, state, anchor } = downloadBrowser();
  const cause = new Error('click failed');
  anchor.click = () => { throw cause; };
  assert.throws(() => downloadReport(savedRecord(), browser), (error) => {
    assert.match(error.message, /download could not be started/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.deepEqual(state.children, []);
  assert.equal(state.removed, 1);
  assert.deepEqual(state.revoked, []);
  state.timers[0].callback();
  assert.deepEqual(state.revoked, ['blob:test-report']);
});

test('download schedules object URL cleanup even if anchor creation or attachment fails', () => {
  for (const stage of ['create', 'append']) {
    const { browser, state } = downloadBrowser();
    const fail = () => { throw new Error('DOM unavailable'); };
    if (stage === 'create') browser.document.createElement = fail;
    else browser.document.body.appendChild = fail;
    assert.throws(() => downloadReport(savedRecord(), browser), /download could not be started/);
    assert.deepEqual(state.children, []);
    assert.deepEqual(state.revoked, []);
    assert.equal(state.timers.length, 1);
    state.timers[0].callback();
    assert.deepEqual(state.revoked, ['blob:test-report']);
  }
});

test('download handles Blob and object URL allocation failures without clicking or leaking anchors', () => {
  for (const stage of ['blob', 'url']) {
    const { browser, state } = downloadBrowser();
    const cause = new Error('allocation failed');
    if (stage === 'blob') browser.Blob = class { constructor() { throw cause; } };
    else browser.URL.createObjectURL = () => { throw cause; };
    assert.throws(() => downloadReport(savedRecord(), browser), { cause });
    assert.equal(state.clicks, 0);
    assert.equal(state.children.length, 0);
    assert.equal(state.timers.length, 0);
  }
});

test('browser exports report unavailable browser APIs clearly, while Node imports stay usable', () => {
  for (const browser of [undefined, null, {}]) {
    assert.throws(() => downloadReport(savedRecord(), browser), /requires a browser/);
    assert.throws(() => printReport(savedRecord(), browser), /requires a browser/);
  }
  const { browser } = downloadBrowser();
  browser.URL.revokeObjectURL = undefined;
  assert.throws(() => downloadReport(savedRecord(), browser), /requires a browser/);
});

test('print opens a fresh blank window synchronously and writes only the escaped saved snapshot', () => {
  const record = savedRecord();
  record.scan.batch_id = attack;
  record.scan.farm_id = 'saved-farm-not-current-form';
  const html = buildReportHtml(record);
  const { browser, popup, state } = printBrowser();
  assert.equal(printReport(record, browser), popup);
  assert.deepEqual(state.events, [
    ['about:blank', '_blank'], 'null opener', 'document.open', 'document.write', 'document.close',
  ]);
  assert.equal(state.opener, null);
  assert.equal(state.closed, false);
  assert.equal(state.html, html);
  assert.ok(state.html.includes(escapedAttack));
  assert.ok(state.html.includes('saved-farm-not-current-form'));
  assert.doesNotMatch(state.html, /<script\b/);
  record.scan.farm_id = 'changed-after-opening';
  record.result.quality_score = 12;
  assert.equal(state.html, html, 'the opened report remains the saved snapshot');
});

test('browser globals can be used directly by click handlers without injection', (t) => {
  const printing = printBrowser();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: printing.browser });
  assert.equal(printReport(savedRecord()), printing.popup);
  const downloading = downloadBrowser();
  globalThis.window = downloading.browser;
  assert.equal(downloadReport(savedRecord()), reportFilename(savedRecord()));
  assert.equal(downloading.state.clicks, 1);
});

test('blocked popups explain how to allow popups or use downloaded HTML', () => {
  for (const popup of [null, undefined, { closed: true }]) {
    assert.throws(() => printReport(savedRecord(), { open: () => popup }), (error) => {
      assert.match(error.message, /popup was blocked/);
      assert.match(error.message, /Allow popups/);
      assert.match(error.message, /downloaded HTML report/);
      return true;
    });
  }
});

test('window.open exceptions retain their cause and provide a usable fallback', () => {
  const cause = new Error('popup policy');
  assert.throws(() => printReport(savedRecord(), { open() { throw cause; } }), (error) => {
    assert.equal(error.cause, cause);
    assert.match(error.message, /could not be opened/);
    assert.match(error.message, /Allow popups.*downloaded HTML/);
    return true;
  });
});

test('a report preparation failure closes the incomplete popup', () => {
  for (const stage of ['opener', 'open', 'write', 'close']) {
    const { browser, popup, state } = printBrowser();
    const cause = new Error(`${stage} failed`);
    const fail = () => { throw cause; };
    if (stage === 'opener') Object.defineProperty(popup, 'opener', { set: fail });
    else popup.document[stage] = fail;
    assert.throws(() => printReport(savedRecord(), browser), (error) => {
      assert.equal(error.cause, cause);
      assert.match(error.message, /could not be prepared/);
      assert.match(error.message, /downloaded HTML/);
      return true;
    });
    assert.equal(state.closed, true, stage);
    if (stage === 'opener' || stage === 'open') assert.equal(state.html, '');
  }
});

test('popup cleanup failures do not hide the original report error', () => {
  const { browser, popup } = printBrowser();
  const cause = new Error('write failed');
  popup.document.write = () => { throw cause; };
  popup.close = () => { throw new Error('close failed'); };
  assert.throws(() => printReport(savedRecord(), browser), { cause });
});

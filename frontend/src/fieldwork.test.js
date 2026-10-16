import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFieldworkClient, downloadFieldworkBlob, emptyFieldworkForm, FIELDWORK_CHECKS, fieldworkAttachments,
  fieldworkError, fieldworkFilename, fieldworkListPath, fieldworkLocalDay, fieldworkNextDayDelay, fieldworkPage,
  fieldworkPagination, fieldworkPath, fieldworkTestingTransition, groupFieldworkReminders,
  emptyLabConfirmationForm, parseLabConfirmationForm,
  matchingFieldworkRecord, parseFieldworkForm, validFieldworkDate, validateFieldworkFile,
} from './fieldwork.js';
import { buildFieldworkRequestHtml, printFieldworkRequest } from './fieldwork-print.js';
import { fieldworkMessages, fieldworkText } from './fieldwork-messages.js';

const farm = 'farm-1';
const record = (id) => ({ id, farm_id: farm });
const batchDraft = () => ({ ...emptyFieldworkForm('batches'), batch_id: 'SILAGE 01', sample_type: 'silage' });
const savedRequest = (extra = {}) => ({
  id: 'request-1', farm_id: farm, batch_id: 'SILAGE 01', sample_type: 'silage', status: 'requested',
  requested_on: '2026-10-15', created_at: '2026-10-15T02:00:00Z', report_count: 0, ...extra,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('attachment filenames keep their safe prefix exactly once across upload and download', () => {
  const name = fieldworkFilename('lab report.pdf', 'application/pdf');
  assert.equal(name, 'fieldwork-lab-report.pdf');
  assert.equal(fieldworkFilename(name, 'application/pdf'), name);
  assert.equal(fieldworkFilename('fieldwork-fieldwork-batch.png', 'image/png'), 'fieldwork-batch.png');
});
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('contract routes encode exact identities and paginate with limit/offset; filters apply only to observations', () => {
  assert.equal(fieldworkPath('batches', 'one/two', 'photos', '?x'), '/api/v1/batches/one%2Ftwo/photos/%3Fx');
  assert.equal(fieldworkPath('testing-requests', 'r', 'reports', 'p'), '/api/v1/testing-requests/r/reports/p');
  assert.equal(fieldworkPath('reminders', 'r', 'status'), '/api/v1/reminders/r/status');
  const query = new URL(`https://test.invalid${fieldworkListPath('observations', { batch_id: ' AB &/01 ', sample_type: 'feed', limit: 50, offset: 100 })}`);
  assert.equal(query.searchParams.get('batch_id'), ' AB &/01 ');
  assert.equal(query.searchParams.get('sample_type'), 'feed');
  assert.equal(query.searchParams.get('limit'), '50');
  assert.equal(query.searchParams.get('offset'), '100');
  assert.equal(fieldworkListPath('batches', { batch_id: 'ignored' }), '/api/v1/batches?limit=20&offset=0');
  for (const options of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { offset: 1.2 }]) assert.throws(() => fieldworkListPath('batches', options));
  for (const args of [['batches', 'a', 'status'], ['batches', 'a', 'reports'], ['testing-requests', 'a', 'photos'], ['batches', 'a', null, 'file']]) assert.throws(() => fieldworkPath(...args));
});

test('local extension routes and lab confirmation form preserve report text and reject unsafe extras', () => {
  assert.equal(fieldworkPath('devices', 'device-1', 'health'), '/api/v1/devices/device-1/health');
  assert.equal(fieldworkPath('review-alerts', 'alert-1', 'acknowledge'), '/api/v1/review-alerts/alert-1/acknowledge');
  assert.equal(fieldworkPath('lab-confirmations', 'confirmation-1'), '/api/v1/lab-confirmations/confirmation-1');
  const query = new URL(`https://test.invalid${fieldworkListPath('lab-confirmations', { testing_request_id: 'request-1' })}`);
  assert.equal(query.searchParams.get('testing_request_id'), 'request-1');
  const draft = { ...emptyLabConfirmationForm(), report_attachment_id: 'report-1', analyte: 'aflatoxin', reported_value: '<0.1', unit: 'mg/kg' };
  assert.deepEqual(parseLabConfirmationForm(draft), { value: draft, errors: {} });
  assert.equal(parseLabConfirmationForm({ ...draft, reported_value: ' ' }).value, null);
  assert.equal(parseLabConfirmationForm({ ...draft, farm_id: 'foreign' }).value.farm_id, undefined);
});

test('known API failures have localized actionable errors, including attachment conflicts rather than duplicate-batch guidance', () => {
  for (const status of [400, 403, 404, 409, 413, 415, 422, 500, 503]) {
    const message = fieldworkError(Object.assign(new Error('server detail'), { status }));
    assert.ok(Object.hasOwn(fieldworkMessages.hi, message), message);
    assert.ok(Object.hasOwn(fieldworkMessages.mr, message), message);
  }
  assert.match(fieldworkError(Object.assign(new Error('A resource may have at most five attachments'), { status: 409 })), /Five attachments/);
  assert.match(fieldworkError(Object.assign(new Error('Duplicate batch'), { status: 409 })), /batch ID and sample already exist/);
});

test('batch creates whitelist full metadata and preserve zero, nulls, units and exact history identity', () => {
  const draft = { ...batchDraft(), batch_id: ' Exact Batch ', quantity: '0', quantity_unit: 'bales', farm_id: 'foreign', owner: 'x', latest_scan: {} };
  const { value, errors } = parseFieldworkForm('batches', draft);
  assert.deepEqual(errors, {});
  assert.equal(value.quantity, 0); assert.equal(value.quantity_unit, 'bales');
  assert.equal(value.batch_id, ' Exact Batch ');
  assert.deepEqual(Object.keys(value).sort(), ['batch_id', 'name', 'sample_type', 'storage_location', 'prepared_on', 'opened_on', 'quantity', 'quantity_unit', 'notes'].sort());
  assert.equal(value.prepared_on, null); assert.equal(value.opened_on, null);
  assert.equal(parseFieldworkForm('batches', batchDraft()).value.quantity, null);
  for (const unit of ['kg', 'tonne', 'bales', 'bags']) {
    assert.equal(parseFieldworkForm('batches', { ...draft, quantity: '1.25', quantity_unit: unit }).value.quantity, 1.25);
  }
});

test('batch edits keep original identity even if the draft attempts to detach history', () => {
  const original = { batch_id: 'OLD-01 ', sample_type: 'silage' };
  const { value } = parseFieldworkForm('batches', { ...batchDraft(), batch_id: 'NEW-02', sample_type: 'feed', name: 'New display name' }, original);
  assert.equal(value.batch_id, 'OLD-01 '); assert.equal(value.sample_type, 'silage'); assert.equal(value.name, 'New display name');
});

test('quantity rejects nonfinite, negative, blank-space and ambiguous values without silently converting units', () => {
  for (const quantity of ['-1', '-0.1', 'Infinity', 'NaN', ' ', '0x10', '1,5', '1kg', {}, Infinity, NaN]) {
    assert.equal(parseFieldworkForm('batches', { ...batchDraft(), quantity, quantity_unit: 'kg' }).value, null, String(quantity));
  }
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), quantity: '1' }).value, null);
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), quantity: '1', quantity_unit: 'litres' }).value, null);
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), quantity: '1e2', quantity_unit: 'tonne' }).value.quantity, 100);
});

test('real calendar dates include leap days, reject normalization, and enforce batch date ordering', () => {
  for (const date of ['2024-02-29', '2026-01-01', '0001-01-01', '9999-12-31']) assert.ok(validFieldworkDate(date), date);
  for (const date of ['2026-02-29', '2024-04-31', '2026-13-01', '0000-01-01', '2026-1-01', '2026-01-01T00:00:00Z', null]) assert.equal(validFieldworkDate(date), false, String(date));
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), prepared_on: '2026-10-15', opened_on: '2026-10-14' }).value, null);
  assert.ok(parseFieldworkForm('batches', { ...batchDraft(), prepared_on: '2026-10-15', opened_on: '2026-10-15' }).value);
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), opened_on: '2026-02-30' }).value, null);
});

test('observation defaults and missing answers remain unknown; payload never contains scores or measurements', () => {
  const draft = { ...emptyFieldworkForm('observations', '2026-10-15'), batch_id: 'OBS-01' };
  for (const [key] of FIELDWORK_CHECKS) assert.equal(draft[key], 'unknown');
  const { value } = parseFieldworkForm('observations', { batch_id: 'OBS-01', sample_type: 'feed', observed_on: '', mould: 'yes', unusual_heat: 'no', quality_score: 99, inputs: {} });
  assert.deepEqual(value, { batch_id: 'OBS-01', sample_type: 'feed', notes: '', observed_on: null, mould: 'yes', unusual_heat: 'no', unusual_smell: 'unknown', cover_damage: 'unknown' });
  for (const answer of [false, 0, '', 'safe']) assert.equal(parseFieldworkForm('observations', { ...draft, mould: answer }).value, null);
});

test('optional reminder batch/sample must be paired and dates can be absent', () => {
  const draft = { ...emptyFieldworkForm('reminders'), title: 'Check cover', due_on: '' };
  assert.deepEqual(parseFieldworkForm('reminders', draft).value, { batch_id: null, sample_type: null, title: 'Check cover', due_on: null, notes: '' });
  for (const extra of [{ batch_id: 'BA-01' }, { sample_type: 'feed' }, { title: '   ' }, { due_on: '2026-02-30' }]) assert.equal(parseFieldworkForm('reminders', { ...draft, ...extra }).value, null);
});

test('text bounds are validated and testing request bodies exclude status and farm ownership', () => {
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), name: 'a'.repeat(121) }).value, null);
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), storage_location: 'a'.repeat(201) }).value, null);
  assert.equal(parseFieldworkForm('batches', { ...batchDraft(), notes: 'a'.repeat(4001) }).value, null);
  const value = parseFieldworkForm('testing-requests', { ...emptyFieldworkForm('testing-requests', '2026-10-15'), batch_id: 'REQ-01', status: 'report_received', farm_id: 'foreign' }).value;
  assert.deepEqual(Object.keys(value).sort(), ['batch_id', 'sample_type', 'requested_on', 'contact_name', 'contact_details', 'notes'].sort());
});

test('local-day grouping uses local calendar dates across UTC midnight and DST rather than elapsed hours', () => {
  const old = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Kolkata';
    assert.equal(fieldworkLocalDay(new Date('2026-10-14T20:00:00Z')), '2026-10-15');
    const groups = groupFieldworkReminders([
      { id: 'yesterday', status: 'pending', due_on: '2026-10-14' },
      { id: 'today', status: 'pending', due_on: '2026-10-15' },
      { id: 'tomorrow', status: 'pending', due_on: '2026-10-16' },
      { id: 'done', status: 'completed', due_on: '2026-10-01' },
      { id: 'undated', status: 'pending', due_on: null },
    ], fieldworkLocalDay(new Date('2026-10-14T20:00:00Z')));
    assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.map((item) => item.id)])), {
      Overdue: ['yesterday'], 'Due today': ['today'], Upcoming: ['tomorrow'], 'No due date': ['undated'], Completed: ['done'],
    });
    process.env.TZ = 'America/New_York';
    assert.equal(fieldworkLocalDay(new Date('2026-10-15T02:00:00Z')), '2026-10-14');
    assert.equal(fieldworkNextDayDelay(new Date('2026-03-08T00:00:00-05:00')), 23 * 60 * 60 * 1000);
    assert.equal(fieldworkNextDayDelay(new Date('2026-11-01T00:00:00-04:00')), 25 * 60 * 60 * 1000);
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});

test('forward-only testing transitions require ordered dates and an uploaded report', () => {
  const requested = savedRequest();
  assert.throws(() => fieldworkTestingTransition(requested, '2026-10-14'), /precede/);
  assert.throws(() => fieldworkTestingTransition(requested, '2026-02-30'), /real date/);
  const collectedBody = fieldworkTestingTransition(requested, '2026-10-15');
  assert.deepEqual(collectedBody, { status: 'collected', collected_on: '2026-10-15', report_received_on: null });
  const collected = { ...requested, ...collectedBody };
  assert.throws(() => fieldworkTestingTransition(collected, '2026-10-16'), /Upload a report/);
  assert.throws(() => fieldworkTestingTransition(collected, '2026-10-14', 1), /precede collection/);
  assert.deepEqual(fieldworkTestingTransition(collected, '2026-10-16', 1), { status: 'report_received', collected_on: '2026-10-15', report_received_on: '2026-10-16' });
  assert.throws(() => fieldworkTestingTransition({ ...collected, status: 'report_received' }, '2026-10-17', 1), /only move forward/);
});

test('page validation prevents foreign records, duplicates and broken pagination while supporting empty out-of-range pages', () => {
  const page = { items: [record('a'), record('b')], total: 42, limit: 20, offset: 40 };
  assert.equal(fieldworkPage(page, farm), page);
  assert.deepEqual(fieldworkPagination(page), { start: 41, end: 42, previous: 20, next: 60, last: 40, hasPrevious: true, hasNext: false });
  assert.equal(fieldworkPagination({ ...page, items: [], offset: 60 }).start, 0);
  assert.ok(fieldworkPage({ ...page, items: [], offset: 60 }, farm));
  for (const bad of [null, [], { ...page, total: 1 }, { ...page, limit: 101 }, { ...page, offset: -1 }, { ...page, items: [record('a'), record('a')] }, { ...page, items: [{ ...record('a'), farm_id: 'foreign' }] }]) assert.throws(() => fieldworkPage(bad, farm));
});

test('latest snapshots must match farm, exact batch ID and sample; observations are not scan-shaped', () => {
  const batch = { farm_id: farm, batch_id: 'EXACT ', sample_type: 'silage' };
  assert.ok(matchingFieldworkRecord(batch, batch));
  assert.ok(matchingFieldworkRecord(batch, { scan: batch }, true));
  for (const extra of [{ farm_id: 'foreign' }, { batch_id: 'EXACT' }, { sample_type: 'feed' }]) {
    assert.equal(matchingFieldworkRecord(batch, { ...batch, ...extra }), false);
    assert.equal(matchingFieldworkRecord(batch, { scan: { ...batch, ...extra } }, true), false);
  }
  assert.equal(matchingFieldworkRecord(batch, batch, true), false);
});

test('photo/report MIME and size boundaries are enforced without ever treating PDF as a photo', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validateFieldworkFile({ type, size: 5 * 1024 * 1024 }), '');
    assert.ok(validateFieldworkFile({ type, size: 5 * 1024 * 1024 + 1 }, true));
  }
  assert.equal(validateFieldworkFile({ type: 'application/pdf', size: 10 * 1024 * 1024 }, true), '');
  assert.ok(validateFieldworkFile({ type: 'application/pdf', size: 100 }));
  for (const file of [{ type: 'text/html', size: 12 }, { type: 'image/svg+xml', size: 12 }, { type: 'image/png', size: 0 }, { type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }]) assert.ok(validateFieldworkFile(file, true));
  assert.throws(() => fieldworkAttachments([{ id: 'a' }]));
  assert.throws(() => fieldworkAttachments(Array.from({ length: 6 }, (_, i) => ({ id: String(i), filename: 'x', content_type: 'image/png' }))));
});

test('attachment downloads use local Blob URLs, safe filenames, attachment intent and delayed URL cleanup', () => {
  const events = [];
  const anchor = { click() { events.push(['click', this.href, this.download]); }, remove() { events.push(['remove']); } };
  let timer;
  const browser = {
    URL: { createObjectURL: (blob) => { assert.equal(blob.type, 'application/pdf'); return 'blob:private'; }, revokeObjectURL: (url) => events.push(['revoke', url]) },
    document: { body: { appendChild: () => {} }, createElement: (tag) => { assert.equal(tag, 'a'); return anchor; } },
    setTimeout: (callback, ms) => { assert.equal(ms, 60_000); timer = callback; },
  };
  const filename = fieldworkFilename('../../evil\r\n.html', 'application/pdf');
  assert.match(filename, /^fieldwork-[a-zA-Z0-9_-]+\.pdf$/);
  downloadFieldworkBlob(new Blob(['%PDF-1.7\n%%EOF'], { type: 'application/pdf' }), filename, browser);
  assert.deepEqual(events, [['click', 'blob:private', filename], ['remove']]);
  timer(); assert.deepEqual(events[2], ['revoke', 'blob:private']);
});

test('request printing requires saved records and escapes all farm/contact text and translated markup', () => {
  const attack = '</dd><script>alert("x")</script>&\'';
  const record = savedRequest({ batch_id: attack, farm_id: attack, contact_name: attack, contact_details: attack, notes: attack });
  const before = JSON.stringify(record);
  const html = buildFieldworkRequestHtml(record);
  assert.equal(JSON.stringify(record), before);
  assert.doesNotMatch(html, /<script|<iframe|<embed|<object|https?:\/\//i);
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;'));
  assert.match(html, /onclick="window.print\(\)"/);
  assert.match(html, /not sent or booked automatically/);
  assert.throws(() => buildFieldworkRequestHtml({ ...record, id: undefined }), /saved testing request/);
  assert.throws(() => buildFieldworkRequestHtml({ batch_id: 'live unsaved form' }), /saved testing request/);
  const translated = Object.assign(() => '<img src=x onerror=alert(1)>', { locale: 'evil" onload="x' });
  assert.doesNotMatch(buildFieldworkRequestHtml(record, translated), /<img|onload=/);
});

test('print window is detached from opener and blocked popups give retry guidance', () => {
  const chunks = [];
  const popup = { document: { open() {}, write(html) { chunks.push(html); }, close() {} } };
  assert.equal(printFieldworkRequest(savedRequest(), null, { open: () => popup }), popup);
  assert.equal(popup.opener, null); assert.equal(chunks.length, 1);
  assert.throws(() => printFieldworkRequest(savedRequest(), null, { open: () => null }), /Allow popups/);
});

test('Hindi/Marathi catalogs have complete key/string/placeholder parity and respect t.locale and parent translations', () => {
  assert.deepEqual(Object.keys(fieldworkMessages.hi), Object.keys(fieldworkMessages.mr));
  assert.ok(Object.keys(fieldworkMessages.hi).length > 170);
  const placeholders = (value) => [...value.matchAll(/\{\w+\}/g)].map(([match]) => match).sort();
  for (const [locale, catalog] of Object.entries(fieldworkMessages)) {
    for (const [english, translated] of Object.entries(catalog)) {
      assert.equal(typeof translated, 'string'); assert.ok(translated.trim(), `${locale}: ${english}`);
      assert.deepEqual(placeholders(translated), placeholders(english), `${locale}: ${english}`);
    }
    const t = Object.assign((key, values) => key.replace('{count}', values?.count), { locale });
    assert.equal(fieldworkText(t, 'Photos ({count})', { count: 0 }), `${locale === 'hi' ? 'फ़ोटो' : 'फोटो'} (0)`);
    assert.notEqual(fieldworkText(t, 'Batches'), 'Batches');
  }
  assert.equal(fieldworkText(() => 'Parent translation', 'Batches'), 'Parent translation');
  assert.equal(fieldworkText(null, 'Reports ({count})', { count: 2 }), 'Reports (2)');
});

test('scope gate aborts reads and writes and ignores late success and unauthorized from old scopes, even with ignored abort', async () => {
  for (const unauthorized of [false, true]) {
    const pending = deferred(); let signal; let expirations = 0;
    const client = createFieldworkClient((_, options) => { signal = options.signal; return pending.promise; }, () => expirations++);
    const result = client.request('/api/v1/batches', { method: 'POST', body: batchDraft() }).catch((error) => error);
    client.stop(); client.start();
    assert.equal(signal.aborted, true);
    if (unauthorized) pending.reject(Object.assign(new Error('old'), { status: 401 })); else pending.resolve({ private: 'old' });
    assert.equal((await result).name, 'AbortError'); assert.equal(expirations, 0);
  }
});

test('current unauthorized expires the whole scope and aborts unrelated in-flight requests', async () => {
  const first = deferred(); const second = deferred(); let expirations = 0; const signals = [];
  const client = createFieldworkClient((path, options) => { signals.push(options.signal); return path.includes('batches') ? first.promise : second.promise; }, () => expirations++);
  const one = client.request('/api/v1/batches').catch((error) => error);
  const two = client.request('/api/v1/reminders').catch((error) => error);
  first.reject(Object.assign(new Error('expired'), { status: 401 })); await tick();
  assert.equal(expirations, 1); assert.ok(signals.every((signal) => signal.aborted));
  second.resolve({ private: 'must not display' });
  assert.equal((await one).name, 'AbortError'); assert.equal((await two).name, 'AbortError');
  client.start(); await assert.rejects(client.request('/api/v1/batches'), { name: 'AbortError' });
});

test('individual abort does not expire scope and resource failures preserve original status for retry', async () => {
  const pending = deferred(); const signal = new AbortController(); let expirations = 0;
  const original = Object.assign(new Error('temporarily down'), { status: 503 });
  const client = createFieldworkClient((path) => path.includes('batches') ? pending.promise : Promise.reject(original), () => expirations++);
  const request = client.request('/api/v1/batches', { signal: signal.signal }).catch((error) => error);
  signal.abort(); pending.reject(Object.assign(new Error('late 401'), { status: 401 }));
  assert.equal((await request).name, 'AbortError'); assert.equal(expirations, 0);
  await assert.rejects(client.request('/api/v1/reminders'), (error) => error === original);
});

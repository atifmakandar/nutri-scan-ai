import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundedComparisonRecords, buildShareSummary, compareSavedRecords, comparisonSearchPath,
  CONFIDENCE_NOTICE, copySummaryText, isSavedResult, openWhatsAppSummary, privateShareText,
  resultSummary, resultsText, savedDate, savedTimestamp, SCREENING_NOTICE, shareSummaryText,
  spokenSummary, whatsappSummaryUrl,
} from './farmer-results.js';
import { translate, translateAdvisory } from './i18n.js';
import { File } from 'node:buffer';

function scan(id, createdAt = '2026-10-15T12:00:00Z', overrides = {}) {
  return {
    scan: { id, farm_id: 'farm-one', batch_id: ' BATCH/1 &? ', sample_type: 'silage', created_at: createdAt, collected_at: '2099-01-01T00:00:00Z', ...overrides.scan },
    result: { id: `result-${id}`, sample_type: 'silage', quality_score: 75, confidence: 0, risk_level: 'LOW', parameters: { moisture_pct: 62, ph: 4.2, temperature_c: 0 },
      anomalies: ['No major anomaly indicator in supplied prototype inputs'], advisory: ['Prototype assessment is within the acceptable screening band; continue routine monitoring.'], ...overrides.result },
  };
}
const localize = (locale) => Object.assign((key, values) => translate(locale, key, values), { locale });

test('summary uses saved risk, every anomaly/advisory in order, and qualifies confidence and safety', () => {
  const record = scan('now', undefined, { result: { quality_score: 100, risk_level: 'HIGH', anomalies: ['first', 'duplicate', 'duplicate', '{future_unknown}'], advisory: ['one', 'two'] } });
  const summary = resultSummary(record);
  assert.match(summary.heading, /Higher screening risk/);
  assert.deepEqual(summary.anomalies, record.result.anomalies);
  assert.deepEqual(summary.advisory, ['one', 'two']);
  assert.equal(summary.notice, SCREENING_NOTICE);
  assert.match(summary.notice, /Uncalibrated.*cannot guarantee feed safety.*low risk/);
  assert.equal(summary.confidenceNotice, CONFIDENCE_NOTICE);
  assert.match(summary.confidenceNotice, /heuristic.*not a probability/);
  assert.match(spokenSummary(record), /first\nduplicate\nduplicate\n\{future_unknown\}/);
  assert.match(spokenSummary(record), /one\ntwo/);
  assert.match(resultSummary(scan('x', undefined, { result: { risk_level: '<script>' } })).heading, /not recorded/);
});

test('saved advice and anomalies use exact existing Hindi/Marathi translations without interpolating unknown text', () => {
  const record = scan('a');
  for (const locale of ['hi', 'mr']) {
    const t = localize(locale);
    const summary = resultSummary(record, t);
    assert.equal(summary.advisory[0], translateAdvisory(locale, record.result.advisory[0]));
    assert.equal(summary.anomalies[0], translateAdvisory(locale, record.result.anomalies[0]));
    assert.notEqual(summary.notice, SCREENING_NOTICE);
    assert.ok(spokenSummary(record, t).includes(summary.advisory[0]));
    assert.equal(resultsText(t)('Loaded {count} of {total} matching saved records (latest {limit} maximum).', { count: 0, total: 20, limit: 100 }).includes('{count}'), false);
  }
  assert.deepEqual(resultSummary({ result: { anomalies: ['Keep {batch} exactly.'], advisory: [] } }, localize('hi')).anomalies, ['Keep {batch} exactly.']);
  const empty = spokenSummary({ result: {} });
  assert.match(empty, /No anomaly information was saved/);
  assert.match(empty, /No advice was saved/);
});

test('saved dates require real calendar dates and an explicit timezone; never use collected/result date', () => {
  assert.equal(savedTimestamp(scan('epoch', '1970-01-01T00:00:00Z')), 0);
  assert.equal(savedDate(scan('offset', '2026-10-15T17:30:00+05:30')), '2026-10-15 12:00:00.000 UTC');
  for (const date of [undefined, '', 'invalid', '2026-10-15', '2026-10-15T12:00:00', '2026-02-30T00:00:00Z', '2026-10-15T24:00:00Z', '2026-13-01T00:00:00Z']) {
    const record = scan('invalid');
    record.scan.created_at = date;
    record.result.created_at = '2026-10-15T00:00:00Z';
    assert.equal(savedTimestamp(record), null, String(date));
    assert.equal(savedDate(record), null);
    assert.equal(isSavedResult(record), false);
    assert.equal(comparisonSearchPath(record), null);
  }
  assert.notEqual(savedTimestamp(scan('leap', '2024-02-29T00:00:00Z')), null);
  assert.equal(savedTimestamp(scan('not-leap', '2025-02-29T00:00:00Z')), null);
});

test('comparison search uses the existing exact batch/sample helper, offset zero and limit 100', () => {
  const path = comparisonSearchPath(scan('now'));
  const url = new URL(path, 'https://local.invalid');
  assert.equal(url.pathname, '/api/v1/scans/search');
  assert.equal(url.searchParams.get('batch_id'), ' BATCH/1 &? ');
  assert.equal(url.searchParams.get('sample_type'), 'silage');
  assert.equal(url.searchParams.get('limit'), '100');
  assert.equal(url.searchParams.get('offset'), '0');
  assert.equal(url.searchParams.has('batch_query'), false);
  for (const override of [{ farm_id: '' }, { batch_id: '' }, { sample_type: 'hay' }, { id: '' }]) {
    assert.equal(comparisonSearchPath(scan('x', undefined, { scan: override })), null);
  }
});

test('selected result compares only to its immediately previous strictly earlier same-identity saved record', () => {
  const selected = scan('selected', '2026-10-12T00:00:00Z');
  const previous = scan('previous', '2026-10-11T00:00:00Z');
  const records = [scan('future', '2026-10-15T00:00:00Z'), scan('oldest', '2026-10-01T00:00:00Z'), selected,
    scan('same-time', '2026-10-12T05:30:00+05:30'), scan('selected', '2026-10-11T23:00:00Z'),
    scan('other-farm', '2026-10-11T23:00:00Z', { scan: { farm_id: 'farm-two' } }),
    scan('other-batch', '2026-10-11T23:00:00Z', { scan: { batch_id: 'BATCH/1 &?' } }),
    scan('other-sample', '2026-10-11T23:00:00Z', { scan: { sample_type: 'feed' }, result: { sample_type: 'feed' } }),
    scan('inconsistent', '2026-10-11T23:00:00Z', { result: { sample_type: 'feed' } }),
    scan('no-zone', '2026-10-11T23:00:00'), previous];
  const before = JSON.stringify(records);
  const comparison = compareSavedRecords(records, selected);
  assert.equal(comparison.status, 'ready');
  assert.equal(comparison.previous, previous);
  assert.equal(comparison.record, selected);
  assert.equal(JSON.stringify(records), before, 'must not mutate parent trend records');
});

test('missing identity/dates and future/equal/self-only samples never fabricate a previous result', () => {
  const selected = scan('now');
  assert.equal(compareSavedRecords([selected, scan('future', '2099-01-01T00:00:00Z'), scan('equal')], selected).status, 'missing');
  assert.equal(compareSavedRecords([scan('old', '1970-01-01T00:00:00Z')], selected).status, 'ready');
  for (const value of [null, {}, { result: selected.result }, scan('x', undefined, { scan: { farm_id: null } }), scan('x', undefined, { result: { sample_type: 'feed' } })]) {
    assert.equal(compareSavedRecords([selected], value).status, 'invalid');
  }
});

test('tied previous timestamps and conflicting duplicates are ambiguous; identical duplicates are harmless', () => {
  const selected = scan('now');
  const previous = scan('old', '2026-10-14T00:00:00Z');
  assert.equal(compareSavedRecords([previous, structuredClone(previous)], selected).status, 'ready');
  assert.equal(compareSavedRecords([previous, scan('tie', '2026-10-14T05:30:00+05:30')], selected).status, 'ambiguous');
  assert.equal(compareSavedRecords([previous, scan('old', '2026-10-13T00:00:00Z')], selected).status, 'ambiguous');
  assert.equal(compareSavedRecords([previous, scan('old', previous.scan.created_at, { result: { quality_score: 1 } })], selected).status, 'ambiguous');
});

test('backend microsecond timestamps remain strictly ordered, including timezone-equivalent fractional instants', () => {
  const selected = scan('selected', '2026-10-15T12:00:00.123456Z');
  const previous = scan('previous', '2026-10-15T17:30:00.123455+05:30');
  const older = scan('older', '2026-10-15T12:00:00.123454Z');
  const equal = scan('equal', '2026-10-15T12:00:00.1234560Z');
  const future = scan('future', '2026-10-15T12:00:00.123457Z');
  assert.equal(compareSavedRecords([older, equal, future, previous], selected).previous, previous);
  assert.equal(savedDate(previous), '2026-10-15 12:00:00.123455 UTC');
  assert.equal(compareSavedRecords([equal, selected, future], selected).status, 'missing');
  const tiedPrevious = scan('tie', '2026-10-15T12:00:00.1234550Z');
  assert.equal(compareSavedRecords([previous, tiedPrevious], selected).status, 'ambiguous');
});

test('missing, nonnumeric and nonfinite measurements stay incomparable; no older-value fallback; zero survives', () => {
  const previous = scan('prior', '2026-10-14T00:00:00Z', { result: { quality_score: 0, parameters: { moisture_pct: NaN, ph: '4.2', temperature_c: 0, protein_pct: Infinity, fiber_pct: -Number.MAX_VALUE } } });
  const selected = scan('now', undefined, { result: { quality_score: 0, parameters: { moisture_pct: 1, ph: 4.2, temperature_c: 0, protein_pct: 0, fiber_pct: Number.MAX_VALUE } } });
  const comparison = compareSavedRecords([scan('older', '2026-10-01T00:00:00Z'), previous], selected);
  const metrics = Object.fromEntries(comparison.metrics.map((metric) => [metric.key, metric]));
  assert.equal(metrics.quality_score.difference, 0);
  assert.equal(metrics.temperature_c.before, 0);
  assert.equal(metrics.temperature_c.current, 0);
  assert.equal(metrics.temperature_c.difference, 0);
  for (const key of ['moisture_pct', 'ph', 'protein_pct', 'dry_matter_pct', 'fiber_pct']) assert.equal(metrics[key].difference, null, key);
  const decimal = compareSavedRecords([scan('p', '2026-10-14T00:00:00Z', { result: { parameters: { ph: 4.1 } } })], scan('n', undefined, { result: { parameters: { ph: 4.2 } } }));
  assert.equal(decimal.metrics.find((metric) => metric.key === 'ph').difference, 0.1);
});

test('synchronous comparison is explicitly bounded to the latest 100 supplied records', () => {
  const records = Array.from({ length: 110 }, (_, i) => scan(`s${i}`, new Date(Date.UTC(2026, 0, i + 1)).toISOString()));
  const sample = boundedComparisonRecords(records);
  assert.equal(sample.length, 100);
  assert.equal(sample[0].scan.id, 's109');
  assert.equal(sample[99].scan.id, 's10');
  assert.equal(records[0].scan.id, 's0');
  assert.equal(compareSavedRecords(records, records[9]).status, 'missing');
  assert.equal(compareSavedRecords(records, records[109]).previous.scan.id, 's108');
  assert.deepEqual(boundedComparisonRecords(null), []);
});

test('share text allowlists saved result fields, keeps zero and every advisory, excludes identity by default', () => {
  const record = scan('saved', undefined, {
    scan: { farm_id: 'private-farm-id', username: 'private-user', token: 'private-token', device_id: 'private-device' },
    result: { parameters: { moisture_pct: 0, temperature_c: 0, secret: 'private-secret', image_url: 'https://photos.invalid/private.jpg' },
      anomalies: ['indicator one', 'indicator two'], advisory: ['advice one', 'advice two'] },
  });
  record.user = { username: 'private-user', password: 'private-password' };
  record.photos = [{ url: 'https://photos.invalid/private.jpg' }];
  record.inputs = { photo: 'data:image/png;base64,private-image' };
  record.url = 'https://app.invalid/?token=private-token';
  const text = buildShareSummary(record, { farmName: 'private-farm-name' });
  assert.match(text, /Saved at \(UTC\): 2026-10-15 12:00:00.000 UTC/);
  assert.match(text, /Batch ID: BATCH\/1 &\?/);
  assert.match(text, /Sample type: Silage/);
  assert.match(text, /Moisture: 0 %/);
  assert.match(text, /Temperature: 0 °C/);
  assert.match(text, /indicator one\nindicator two/);
  assert.match(text, /advice one\nadvice two/);
  assert.ok(text.includes(SCREENING_NOTICE));
  assert.ok(text.includes(CONFIDENCE_NOTICE));
  assert.match(text, /Photos are excluded/);
  assert.doesNotMatch(text, /private-|https?:|data:image|Farm ID:|Farm name:|<img/);
  assert.match(buildShareSummary(record, { includeFarmId: true }), /Farm ID: private-farm-id/);
  assert.match(buildShareSummary(record, { includeFarmName: true, farmName: 'private-farm-name' }), /Farm name: private-farm-name/);
  assert.doesNotMatch(buildShareSummary(record, { includeFarmId: 'false', includeFarmName: 'yes', farmName: 'private-farm-name' }), /private-farm/);
  assert.equal(buildShareSummary({ result: record.result }), null);
});

test('free-text sharing omits URLs and credential patterns, removes control characters, and is localized', () => {
  for (const content of ['https://private.invalid/p?t=secret', 'www.private.invalid', 'private.example/path', '//private.invalid/p', 'data:image/png;base64,abc', 'blob:private', 'mailto:private@invalid', 'token=abc', 'password: abc', 'Username: owner', 'Authorization: Bearer abc', 'Bearer abc', 'eyJabcd.abcdef.signature']) {
    assert.equal(privateShareText(content), '[Private content omitted]', content);
  }
  assert.equal(privateShareText('safe\ntext\u202e'), 'safe text');
  const record = scan('a', undefined, { scan: { batch_id: 'https://private.invalid/?token=abc' }, result: { advisory: ['password:\nprivate-value', 'plain advice'] } });
  const shared = buildShareSummary(record);
  assert.doesNotMatch(shared, /private-value|https:|token=/);
  assert.match(shared, /plain advice/);
  for (const locale of ['hi', 'mr']) {
    const text = buildShareSummary(scan('a'), { t: localize(locale) });
    assert.ok(text.includes(translateAdvisory(locale, scan('a').result.advisory[0])));
    assert.match(text, /\p{Script=Devanagari}/u);
    assert.doesNotMatch(text, /Uncalibrated prototype screening/);
  }
});

test('native sharing receives only preview text and preserves method binding; cancellation never triggers copy', async () => {
  const calls = [];
  const navigator = {
    canShare(payload) { assert.equal(this, navigator); assert.deepEqual(payload, { text: 'preview only' }); return true; },
    async share(payload) { assert.equal(this, navigator); calls.push(payload); },
    clipboard: { writeText: () => assert.fail('sharing must never copy automatically') },
  };
  const browser = { navigator, fetch: () => assert.fail('no fetch allowed'), open: () => assert.fail('native sharing must not open WhatsApp') };
  assert.deepEqual(await shareSummaryText('preview only', browser), { status: 'shared' });
  assert.deepEqual(calls, [{ text: 'preview only' }]);
  navigator.share = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
  assert.deepEqual(await shareSummaryText('preview only', browser), { status: 'cancelled' });
  navigator.share = () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  assert.deepEqual(await shareSummaryText('preview only', browser), { status: 'failed' });
});

test('unsupported, canShare rejection and device errors remain explicit recoverable outcomes', async () => {
  assert.equal((await shareSummaryText('text', null)).status, 'unsupported');
  assert.equal((await shareSummaryText('text', { navigator: {} })).status, 'unsupported');
  assert.equal((await shareSummaryText('text', { navigator: { canShare: () => false, share: () => assert.fail('cannot share') } })).status, 'unsupported');
  assert.equal((await shareSummaryText('text', { navigator: { canShare: () => { throw new Error('blocked'); }, share() {} } })).status, 'failed');
  assert.equal((await shareSummaryText('text', { navigator: { share: async () => { throw new Error('device error'); } } })).status, 'failed');
});

test('copy uses clipboard only on action; missing/denied/failed clipboard selects the visible text for manual copy', async () => {
  const calls = [];
  const clipboard = { async writeText(text) { assert.equal(this, clipboard); calls.push(text); } };
  assert.equal((await copySummaryText('exact preview', { navigator: { clipboard } }, { select: () => assert.fail('successful copy need not select') })).status, 'copied');
  assert.deepEqual(calls, ['exact preview']);
  for (const browser of [null, { navigator: {} }, { navigator: { clipboard: { writeText: async () => { throw new Error('permission denied'); } } } }, { navigator: { clipboard: { writeText: () => { throw new Error('sync error'); } } } }]) {
    const selection = [];
    const target = { focus: () => selection.push('focus'), select: () => selection.push('select') };
    assert.equal((await copySummaryText('exact preview', browser, target)).status, 'manual');
    assert.deepEqual(selection, ['focus', 'select']);
  }
  assert.equal((await copySummaryText('text', null, { focus: () => { throw new Error('no focus support'); } })).status, 'manual');
});

test('WhatsApp is an encoded text-only URL, opened only by its explicit action with no referrer/opener', () => {
  const preview = 'नमूना & batch=#12\n0 % ? sample';
  const url = new URL(whatsappSummaryUrl(preview));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/');
  assert.deepEqual([...url.searchParams], [['text', preview]]);
  assert.equal(url.hash, '');
  const calls = [];
  const browser = { open: (...args) => { calls.push(args); return null; }, fetch: () => assert.fail('must not fetch') };
  assert.equal(calls.length, 0);
  assert.equal(openWhatsAppSummary(preview, browser).status, 'requested');
  assert.deepEqual(calls, [[whatsappSummaryUrl(preview), '_blank', 'noopener,noreferrer']]);
  assert.equal(openWhatsAppSummary(preview, null).status, 'failed');
  assert.equal(openWhatsAppSummary(preview, { open: () => { throw new Error('popup failed'); } }).status, 'failed');
});

test('photo summary opt-in replaces only the exclusion notice, never serializes photo metadata, and is strict/localized', () => {
  const record = scan('saved');
  record.photos = [{ id: 'private-id', filename: 'private.jpg', url: 'https://private.invalid/photo', data: 'private-bytes' }];
  const notice = 'Selected evidence photos are included only in supported native device sharing. Copy and WhatsApp send text only, without photo URLs.';
  for (const locale of ['en', 'hi', 'mr']) {
    const t = localize(locale);
    const summary = buildShareSummary(record, { t, includePhotos: true });
    assert.ok(summary.endsWith(resultsText(t)(notice)));
    assert.doesNotMatch(summary, /private-|private\.jpg|https:|blob:/);
    const defaultText = buildShareSummary(record, { t });
    assert.equal(summary.slice(0, summary.lastIndexOf('\n')), defaultText.slice(0, defaultText.lastIndexOf('\n')));
    assert.equal(buildShareSummary(record, { t, includePhotos: 'true' }), defaultText);
  }
});

test('native photo sharing synchronously receives the exact prepared File snapshot and text after strict canShare', async () => {
  const files = [new File(['jpeg'], 'selected.jpg', { type: 'image/jpeg' })];
  const calls = [];
  const navigator = {
    canShare(payload) { assert.equal(this, navigator); calls.push(['canShare', payload]); return true; },
    share(payload) { assert.equal(this, navigator); calls.push(['share', payload]); return Promise.resolve(); },
    clipboard: { writeText: () => assert.fail('never copy automatically') },
  };
  const pending = shareSummaryText('exact preview', { navigator, fetch: () => assert.fail('all bytes prepared before share click') }, files);
  assert.equal(calls.length, 2, 'share must be invoked before yielding user activation');
  assert.equal(calls[0][1].files, files);
  assert.deepEqual(calls, [['canShare', { text: 'exact preview', files }], ['share', { text: 'exact preview', files }]]);
  assert.equal((await pending).status, 'shared');
});

test('selected photos require canShare true; missing, false, truthy and throwing capability checks never silently send text', async () => {
  const files = [new File(['png'], 'selected.png', { type: 'image/png' })];
  for (const canShare of [undefined, () => false, () => 1, () => { throw new Error('blocked'); }]) {
    const navigator = { share: () => assert.fail('never drop attachments'), canShare,
      clipboard: { writeText: () => assert.fail('never fallback to copy') } };
    assert.equal((await shareSummaryText('preview', { navigator }, files)).status, 'photosUnsupported');
  }
  assert.equal((await shareSummaryText('preview', null, files)).status, 'photosUnsupported');
  assert.equal((await shareSummaryText('preview', { navigator: { canShare: () => true } }, files)).status, 'photosUnsupported');
});

test('photo share cancellation and device failure never trigger copy, WhatsApp or a text-only retry', async () => {
  const files = [new File(['webp'], 'selected.webp', { type: 'image/webp' })];
  for (const [name, status] of [['AbortError', 'cancelled'], ['NotAllowedError', 'failed']]) {
    const calls = [];
    const browser = { navigator: { canShare: () => true, share: (payload) => {
      calls.push(payload); throw Object.assign(new Error('cancelled/blocked'), { name });
    }, clipboard: { writeText: () => assert.fail('never automatic copy') } }, open: () => assert.fail('never automatic WhatsApp') };
    assert.equal((await shareSummaryText('preview', browser, files)).status, status);
    assert.deepEqual(calls, [{ text: 'preview', files }]);
  }
});

test('attachment preview text copied or sent to WhatsApp contains no photo fields or URLs', async () => {
  const record = scan('saved');
  record.photos = [{ url: 'https://private.invalid/photo' }];
  const text = buildShareSummary(record, { includePhotos: true });
  const calls = [];
  await copySummaryText(text, { navigator: { clipboard: { writeText: (value) => calls.push(value) } } });
  openWhatsAppSummary(text, { open: (url) => calls.push(new URL(url).searchParams.get('text')) });
  assert.deepEqual(calls, [text, text]);
  assert.doesNotMatch(calls.join('\n'), /https?:|blob:|private\.invalid|filename|image\//);
});

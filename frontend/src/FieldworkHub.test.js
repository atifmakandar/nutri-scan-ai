import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fieldworkMessages } from './fieldwork-messages.js';

let server; let Hub; let Forms; let Workflows; let Attachments; let Controls;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: Hub } = await server.ssrLoadModule('/src/FieldworkHub.jsx'));
  Forms = await server.ssrLoadModule('/src/FieldworkForms.jsx');
  Workflows = await server.ssrLoadModule('/src/FieldworkWorkflows.jsx');
  ({ default: Attachments } = await server.ssrLoadModule('/src/FieldworkAttachments.jsx'));
  Controls = await server.ssrLoadModule('/src/FieldworkControls.jsx');
});
after(async () => { await server?.close(); });
const session = { user: { id: 'user-1', role: 'owner' }, farm: { id: 'farm-1' } };
const props = { api: () => assert.fail('SSR must not request private records'), session, farmId: 'farm-1', canWrite: true, online: true, onSaved() {}, onChanged() {} };
const render = (Component, properties = {}) => renderToStaticMarkup(createElement(Component, { ...props, ...properties }));
const batch = { id: 'batch-1', farm_id: 'farm-1', batch_id: 'BATCH 01', sample_type: 'feed', name: 'West shed feed', quantity: 0, quantity_unit: 'bags', photo_count: 0 };

test('hub supplies four accessible keyboard tabs, linked panels and isolated loading states without SSR API reads', () => {
  const html = render(Hub);
  assert.match(html, /<section id="fieldwork"/);
  for (const label of ['Batches', 'Quick observations', 'Reminders', 'Testing help']) assert.ok(html.includes(`>${label}</button>`));
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 4);
  assert.equal((html.match(/ hidden=""/g) || []).length, 3);
  assert.equal((html.match(/Loading farm records…/g) || []).length, 4);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, targets] of html.matchAll(/aria-(?:controls|labelledby|describedby)="([^"]+)"/g)) {
    for (const target of targets.split(' ')) assert.ok(ids.includes(target), target);
  }
});

test('signed-out and incomplete scopes never render private workflow forms', () => {
  for (const session of [null, { user: { id: 'u' } }, { farm: { id: 'f' } }]) {
    const html = render(Hub, { session });
    assert.match(html, /Sign in to view saved farm fieldwork/);
    assert.doesNotMatch(html, /<form|<input|role="tab"/);
  }
});

test('viewer and offline states disable mutation fieldsets and explain persistence boundaries', () => {
  const viewer = render(Hub, { session: { ...session, user: { ...session.user, role: 'viewer' } } });
  assert.match(viewer, /Read-only account/);
  assert.equal((viewer.match(/<fieldset disabled=""/g) || []).length, 4);
  const offline = render(Hub, { online: false });
  assert.match(offline, /nothing is queued automatically/);
  assert.equal((offline.match(/<fieldset disabled=""/g) || []).length, 4);
  assert.doesNotMatch(offline, /Loading farm records/);
});

test('batch edit makes history identity read-only, exposes meaningful metadata and no sample readings', () => {
  const html = render(Forms.FieldworkBatchForm, { initial: batch });
  assert.match(html, /<input(?=[^>]*name="batch_id")(?=[^>]*readOnly="")[^>]*>/);
  assert.match(html, /name="sample_type"[^>]*disabled=""/);
  for (const label of ['Display name', 'Storage location', 'Prepared on', 'Opened on', 'Quantity', 'Quantity unit', 'Notes']) assert.ok(html.includes(label));
  assert.match(html, /does not convert the quantity/);
  assert.doesNotMatch(html, /moisture_pct|temperature_c|protein_pct|expiry/);
});

test('observations start with all four unknown answers, never zero/no and supply no score', () => {
  const html = render(Forms.FieldworkObservationForm);
  assert.equal((html.match(/type="radio"/g) || []).length, 12);
  assert.equal((html.match(/checked="" value="unknown"/g) || []).length, 4);
  assert.equal((html.match(/checked="" value="no"/g) || []).length, 0);
  assert.match(html, /without a screening score/);
  const readback = render(Workflows.FieldworkObservationCard, { observation: { ...batch, kind: 'observation_only', observed_on: '2026-10-15', mould: 'yes', unusual_heat: 'no', unusual_smell: 'unknown', cover_damage: 'unknown' } });
  assert.match(readback, /qualified adviser or testing provider/);
  assert.doesNotMatch(readback, /confidence|quality_score|risk_level|Prototype score/);
});

test('batch cards show only exact matching latest screening and separate observation readback, with identity-only use guidance', () => {
  const scan = { farm_id: batch.farm_id, batch_id: batch.batch_id, sample_type: batch.sample_type, created_at: '2026-10-15T01:00:00Z' };
  const html = render(Workflows.FieldworkBatchCard, { batch: { ...batch, latest_scan: { scan, result: { quality_score: 73 } }, latest_observation: { ...scan, id: 'obs-1', kind: 'observation_only', observed_on: '2026-10-15', mould: 'yes', notes: 'Saved observation' } }, onUseBatch() {}, onEdit() {} });
  assert.match(html, /Latest matching screening/); assert.match(html, /73 \/ 100/);
  assert.match(html, /Latest matching observation/); assert.match(html, /Saved observation/);
  assert.match(html, /old readings are not filled in/); assert.match(html, /0 bags/);
  for (const extra of [{ farm_id: 'foreign' }, { batch_id: `${batch.batch_id} ` }, { sample_type: 'silage' }]) {
    const rejected = render(Workflows.FieldworkBatchCard, { batch: { ...batch, latest_scan: { scan: { ...scan, ...extra }, result: { quality_score: 73 } } }, onEdit() {} });
    assert.match(rejected, /No matching screening saved/); assert.doesNotMatch(rejected, /73 \/ 100/);
  }
});

test('testing cards require upload before report-received and only offer the next forward status', () => {
  const request = { ...batch, status: 'requested', requested_on: '2026-10-15', created_at: '2026-10-15T01:00:00Z', report_count: 0 };
  const first = render(Workflows.FieldworkTestingCard, { request });
  assert.match(first, /Mark collected/); assert.doesNotMatch(first, />Mark report received</);
  assert.match(first, /not sent or booked automatically/); assert.match(first, /Print saved request/);
  const collected = render(Workflows.FieldworkTestingCard, { request: { ...request, status: 'collected', collected_on: '2026-10-15' } });
  assert.match(collected, /Upload a report before marking it received/);
  assert.match(collected, /<button type="submit" disabled="">Mark report received/);
  const done = render(Workflows.FieldworkTestingCard, { request: { ...request, status: 'report_received', report_count: 1 } });
  assert.doesNotMatch(done, /fw-status-form/);
});

test('attachments never embed PDF/remote URLs and viewer upload is disabled', () => {
  const html = render(Attachments, { collection: 'testing-requests', recordId: 'r', reports: true, canWrite: false });
  assert.match(html, /image\/jpeg,image\/png,image\/webp,application\/pdf/);
  assert.match(html, /download as attachments/);
  assert.match(html, /type="file"[^>]*disabled=""/);
  assert.doesNotMatch(html, /<iframe|<embed|<object|src="https?:|src="\/api|href="\/api|<img/);
});

test('failed list keeps previously loaded cards visible alongside a resource-specific retry and correct pagination', () => {
  const data = { items: [batch], total: 21, limit: 20, offset: 20 };
  const html = render(Controls.FieldworkList, {
    resource: { data, loading: false, error: 'The farm service is unavailable. Retry when connected.', refresh() {}, setOffset() {}, setLimit() {} },
    empty: 'No batches saved yet. Create a batch to keep its records together.',
    children: (items) => createElement('p', null, items[0].name),
  });
  assert.match(html, /West shed feed/); assert.match(html, /Retry this list/); assert.match(html, /may be out of date/);
  assert.match(html, /Showing 21–21 of 21 records/); assert.match(html, /disabled="">Next page/);
});

test('Hindi and Marathi render every form and workflow instruction from t.locale without English fallback', () => {
  for (const locale of ['hi', 'mr']) {
    const t = Object.assign((key) => key, { locale });
    const html = render(Hub, { t });
    for (const key of ['Farm fieldwork', 'Batches', 'Quick observations', 'Reminders', 'Testing help', 'Collection checklist', 'Display name', 'Save observation', 'Task title', 'Contact details']) assert.ok(html.includes(fieldworkMessages[locale][key]), key);
    for (const key of ['Leave anything you did not check as Unknown. This saves observations only, without a screening score.', 'Farm tracking only. This request is not sent or booked automatically.', 'In-app tasks only. No background notifications or SMS are sent.']) assert.ok(html.includes(fieldworkMessages[locale][key]), key);
    assert.doesNotMatch(html, /\{date\}|\{count\}|Private farm records|Save batch|Save observation|Create reminder|Create testing request/);
  }
});

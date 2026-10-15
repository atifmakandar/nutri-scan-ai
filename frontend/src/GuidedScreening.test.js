import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createEmptyScreening, english, SCREENING_GROUPS, updateScreeningReading, validateScreening } from './screening.js';

let server;
let GuidedScreening;
let ScreeningSample;
let ScreeningBatch;
let ScreeningReadings;
let ScreeningReview;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: GuidedScreening, ScreeningSample, ScreeningBatch, ScreeningReadings, ScreeningReview } = await server.ssrLoadModule('/src/GuidedScreening.jsx'));
});
after(async () => { await server?.close(); });
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const fields = SCREENING_GROUPS.flatMap((group) => group.fields);
function complete() {
  let form = { ...createEmptyScreening('farm-a'), batch_id: 'BATCH-01' };
  for (const field of fields) form = updateScreeningReading(form, field.key, String(field.min));
  return form;
}
// Hook-free step elements expose the same controlled handlers used by the wizard.
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!element || typeof element !== 'object') return [];
  return [element, ...nodes(element.props?.children)];
}

test('SSR starts at sample step with accessible progress, inline local illustrations and no side effects', () => {
  const form = createEmptyScreening('farm-a');
  const before = structuredClone(form);
  const html = render(GuidedScreening, { form, online: true, onChange: () => assert.fail('no initial form writes'), onSubmit: () => assert.fail('no automatic submission') });
  assert.match(html, /<form[^>]*noValidate=""/i);
  assert.match(html, /aria-label="Screening progress"/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /role="status">Step 1 of 4: Choose sample/);
  assert.equal((html.match(/<section hidden=""/g) || []).length, 3);
  assert.equal((html.match(/<svg /g) || []).length, 2);
  assert.doesNotMatch(html, /<img|https?:\/\//);
  assert.match(html, /type="button">Next/);
  assert.doesNotMatch(html, /type="submit"/, 'no submit button is exposed before review');
  assert.match(html, /href="#drafts"/);
  assert.doesNotMatch(html, /Correct the marked fields|aria-invalid="true"/);
  assert.deepEqual(form, before);
});

test('all ten required number inputs are grouped, blank without zero defaults, with ranges and measurement-help hooks', () => {
  const helped = [];
  const html = render(ScreeningReadings, { form: createEmptyScreening('farm-a'), onChange() {}, renderHelp: (key) => {
    helped.push(key);
    return createElement('button', { type: 'button' }, `Measure ${key}`);
  } });
  assert.deepEqual(helped, fields.map((field) => field.key));
  assert.equal((html.match(/type="number"/g) || []).length, 10);
  assert.equal((html.match(/required=""/g) || []).length, 10);
  assert.equal((html.match(/value=""/g) || []).length, 11, 'ten blanks and source placeholder');
  assert.equal((html.match(/<fieldset /g) || []).length, 3);
  assert.match(html, /min="-20" max="80"/);
  assert.match(html, /min="0" max="14"/);
  assert.equal((html.match(/min="0" max="1"/g) || []).length, 3);
  assert.match(html, /Missing measurements block screening/);
  assert.match(html, /does not measure the sample or fill missing readings/);
  assert.match(html, /does not connect a camera or device/);
  for (const field of fields) {
    assert.ok(html.includes(`for="readings-${field.key}"`));
    assert.ok(html.includes(`aria-describedby="readings-${field.key}-range"`));
  }
});

test('default measurement help exists for every reading, including when the insertion hook returns null', () => {
  const html = render(ScreeningReadings, { form: complete(), renderHelp: () => null });
  assert.equal((html.match(/href="#farmer-help"/g) || []).length, 10);
  assert.match(html, /Help with pH/);
});

test('inline validation errors are associated with inputs and invalid source details open for focus', () => {
  const form = { ...createEmptyScreening('farm-a'), source_mode: 'bad' };
  const errors = validateScreening(form);
  const html = render(ScreeningReadings, { form, errors });
  assert.equal((html.match(/aria-invalid="true"/g) || []).length, 11);
  assert.match(html, /aria-describedby="readings-ph-range readings-ph-error"/);
  assert.match(html, /id="readings-ph-error">Enter the pH reading/);
  assert.match(html, /<details[^>]*open=""/);
  assert.match(html, /data-screening-field="source_mode"/);
  assert.match(render(ScreeningBatch, { form, errors }), /id="batch-batch_id-error"/);
});

test('sample changes emit the complete immutable form without clearing batch, source or measured values', () => {
  const form = { ...complete(), extra: { parent: true }, source_mode: 'esp32' };
  const before = structuredClone(form);
  let emitted;
  const tree = ScreeningSample({ form, onChange: (next) => { emitted = next; } });
  nodes(tree).find((node) => node.type === 'input' && node.props.value === 'feed').props.onChange();
  assert.deepEqual(emitted, { ...form, sample_type: 'feed' });
  assert.notEqual(emitted, form);
  assert.deepEqual(form, before);
});

test('batch selection uses current farm/sample history, deduplicates IDs and emits only an explicit batch edit', () => {
  const form = complete();
  const record = (farm, sample, batch) => ({ scan: { farm_id: farm, sample_type: sample, batch_id: batch } });
  const history = [record('farm-a', 'silage', 'OLD'), record('farm-a', 'silage', 'OLD'), record('farm-b', 'silage', 'OTHER-FARM'), record('farm-a', 'feed', 'OTHER-SAMPLE')];
  const html = render(ScreeningBatch, { form, history });
  assert.equal((html.match(/value="OLD"/g) || []).length, 1);
  assert.doesNotMatch(html, /OTHER-FARM|OTHER-SAMPLE/);
  let emitted;
  const tree = ScreeningBatch({ form, history, onChange: (next) => { emitted = next; } });
  const select = nodes(tree).find((node) => node.type === 'select');
  select.props.onChange({ target: { value: '' } });
  assert.equal(emitted, undefined, 'placeholder must not erase a loaded draft batch');
  select.props.onChange({ target: { value: 'OLD' } });
  assert.deepEqual(emitted, { ...form, batch_id: 'OLD' });
  assert.equal(emitted.inputs, form.inputs);
  nodes(tree).find((node) => node.type === 'input' && node.props.name === 'batch_id').props.onChange({ target: { value: 'NEW' } });
  assert.deepEqual(emitted, { ...form, batch_id: 'NEW' });
});

test('readings and source callbacks preserve parent metadata, blank versus zero, and all unrelated readings', () => {
  const form = { ...complete(), parentMetadata: 'keep' };
  let emitted;
  const tree = ScreeningReadings({ form, onChange: (next) => { emitted = next; } });
  const input = nodes(tree).find((node) => node.type === 'input' && node.props['data-screening-field'] === 'ph');
  input.props.onChange({ target: { value: '' } });
  assert.equal(emitted.inputs.sensor.ph, '');
  assert.equal(emitted.parentMetadata, 'keep');
  assert.equal(emitted.inputs.nir, form.inputs.nir);
  input.props.onChange({ target: { value: '0' } });
  assert.equal(emitted.inputs.sensor.ph, 0);
  nodes(tree).find((node) => node.type === 'select').props.onChange({ target: { value: 'mobile' } });
  assert.deepEqual(emitted, { ...form, source_mode: 'mobile' });
});

test('review shows farm, batch, sample, source and every reading including real zero and temperature units', () => {
  const form = { ...complete(), batch_id: '<script>alert(1)</script>', source_mode: 'esp32' };
  const html = render(ScreeningReview, { form });
  assert.equal((html.match(/<dd>/g) || []).length, 14);
  assert.match(html, /<dd>farm-a<\/dd>/);
  assert.match(html, /<dd>ESP32 field unit<\/dd>/);
  assert.match(html, /<dd>-20 °C<\/dd>/);
  assert.match(html, /<dd>0<\/dd>/);
  assert.match(html, /<dd>0 %<\/dd>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|Not entered|undefined|NaN/);
  for (const field of fields) assert.ok(html.includes(`<dt>${field.label}</dt>`));
  const empty = render(ScreeningReview, { form: createEmptyScreening() });
  assert.equal((empty.match(/Not entered/g) || []).length, 12);
});

test('parent-loaded numeric drafts and subsequent replacements render current data without initialization writes', () => {
  const form = complete();
  const props = { online: true, onChange: () => assert.fail('draft loads must not be normalized automatically'), onSubmit: () => assert.fail('draft loads must not submit') };
  assert.match(render(GuidedScreening, { ...props, form }), /name="batch_id"[^>]*value="BATCH-01"/);
  const loaded = updateScreeningReading({ ...form, batch_id: 'DRAFT-02', sample_type: 'feed', source_mode: 'mobile' }, 'ph', 4.3);
  const html = render(GuidedScreening, { ...props, form: loaded });
  assert.match(html, /value="DRAFT-02"/);
  assert.match(html, /name="inputs.sensor.ph"[^>]*value="4.3"/);
  assert.match(html, /type="checkbox"[^>]*data-|data-screening-field="confirmation" type="checkbox"/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked=""/);
  assert.equal(form.batch_id, 'BATCH-01');
});

test('offline/viewer/busy states block submission and accurately explain complete-only drafts', () => {
  for (const state of [{ online: false }, { online: true, disabled: true }, { online: true, busy: true }]) {
    const html = render(GuidedScreening, { form: complete(), ...state });
    assert.doesNotMatch(html, /type="submit"/, 'the initial step cannot submit');
    if (state.disabled || state.busy) assert.match(html, /<fieldset[^>]*disabled=""/);
    if (state.disabled) assert.match(html, /Screening is read-only/);
    if (state.busy) assert.match(html, /aria-busy="true"/);
    if (!state.online) assert.match(html, /partial readings cannot be saved/);
    assert.match(html, /does not save automatically/);
  }
});

test('supplied translator receives whole sentences and interpolation values for progress, limits and help', () => {
  const html = render(GuidedScreening, { form: complete(), online: true, t: (text, values) => `localized:${english(text, values)}` });
  assert.match(html, /localized:Step 1 of 4: localized:Choose sample/);
  assert.match(html, /localized:Allowed range: -20 to 80 °C/);
  assert.match(html, /localized:Help with localized:pH/);
  assert.doesNotMatch(html, /\{step\}|\{min\}|\{field\}/);
});

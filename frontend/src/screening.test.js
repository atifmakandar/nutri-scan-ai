import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyScreening, english, getScreeningBatches, parseReading, parseScreening,
  SCREENING_GROUPS, screeningStepErrors, screeningTransition, updateScreeningReading, validateScreening,
} from './screening.js';
import { snapshotDraftForm } from './drafts.js';

const fields = SCREENING_GROUPS.flatMap((group) => group.fields);
function complete() {
  let form = { ...createEmptyScreening('farm-a'), batch_id: 'BATCH-01' };
  for (const field of fields) form = updateScreeningReading(form, field.key, String(field.min));
  return form;
}

test('empty screenings have exactly the API groups and ten blank readings, with independent instances', () => {
  const first = createEmptyScreening();
  assert.deepEqual(first, {
    farm_id: '', batch_id: '', sample_type: 'silage', source_mode: 'manual',
    inputs: {
      sensor: { moisture_pct: '', ph: '', temperature_c: '', humidity_pct: '' },
      nir: { protein_pct: '', dry_matter_pct: '', fiber_pct: '' },
      vision: { mold_score: '', color_anomaly: '', surface_damage: '' },
    },
  });
  const second = createEmptyScreening('farm-b');
  first.inputs.sensor.ph = 1;
  assert.equal(second.inputs.sensor.ph, '');
  assert.equal(second.farm_id, 'farm-b');
});

test('every missing measurement blocks screening, with field-specific errors and no fabricated payload', () => {
  const form = { ...createEmptyScreening('farm-a'), batch_id: 'AB' };
  assert.equal(Object.keys(validateScreening(form)).length, 10);
  for (const field of fields) assert.match(validateScreening(form)[field.key], /Missing measurements block screening/);
  assert.equal(parseScreening(form).value, null);
  assert.equal(Object.keys(validateScreening(null)).length, 14);
});

test('all numeric fields reject blank/nondecimal/nonfinite values and enforce inclusive limits', () => {
  for (const field of fields) {
    for (const raw of ['', ' ', null, undefined]) assert.match(parseReading(raw, field).error, /Missing measurements/);
    for (const raw of [NaN, Infinity, -Infinity, 'Infinity', '1e309', 'NaN', '0x10', [], {}, false, '2 litres', '1,2']) {
      assert.match(parseReading(raw, field).error, /finite number/, `${field.key}: ${String(raw)}`);
    }
    for (const value of [field.min, field.max]) assert.deepEqual(parseReading(String(value), field), { value, error: '' });
    for (const raw of [field.min - .001, field.max + .001]) assert.match(parseReading(raw, field).error, /must be between/);
  }
  assert.equal(parseReading('0', fields[0]).value, 0);
  assert.equal(parseReading('1e1', fields[0]).value, 10);
  assert.equal(parseReading(' .5 ', fields[0]).value, .5);
});

test('editing a number preserves blank separately from zero, all other readings and parent metadata', () => {
  const original = { ...complete(), device_id: 'parent-device' };
  const before = structuredClone(original);
  const blank = updateScreeningReading(original, 'ph', '');
  assert.equal(blank.inputs.sensor.ph, '');
  assert.equal(parseScreening(blank).value, null);
  const zero = updateScreeningReading(blank, 'ph', '0');
  assert.equal(zero.inputs.sensor.ph, 0);
  assert.equal(zero.device_id, 'parent-device');
  assert.equal(zero.inputs.nir, original.inputs.nir);
  assert.notEqual(blank.inputs.sensor, original.inputs.sensor);
  assert.deepEqual(original, before);
  assert.equal(updateScreeningReading(original, 'ph', ' ').inputs.sensor.ph, '');
  assert.equal(updateScreeningReading(original, 'ph', '1e309').inputs.sensor.ph, '1e309');
  assert.throws(() => updateScreeningReading(original, 'unknown', ''), /Unknown screening field/);
});

test('batch IDs use the existing 2–80 character draft limits; farm/sample/source errors stay clear', () => {
  const form = complete();
  for (const batch_id of ['', 'a', 'x'.repeat(81), ' AB', 'AB ', 'A\nB', '\u0000AB']) {
    assert.match(validateScreening({ ...form, batch_id }).batch_id, /2–80 characters/);
  }
  for (const batch_id of ['AB', 'x'.repeat(80), 'गाव-बॅच']) assert.equal(validateScreening({ ...form, batch_id }).batch_id, undefined);
  assert.match(validateScreening({ ...form, farm_id: '' }).farm_id, /signed-in farm/);
  assert.match(validateScreening({ ...form, sample_type: 'hay' }).sample_type, /cattle feed or silage/);
  assert.match(validateScreening({ ...form, source_mode: 'auto' }).source_mode, /valid input source/);
});

test('canonical parsing returns only validated finite numbers accepted by the existing complete draft contract', () => {
  const identity = { user: { id: 'user-a', role: 'member' }, farm: { id: 'farm-a' } };
  let form = { ...complete(), device_id: 'do-not-copy', client_request_id: 'do-not-reuse' };
  form = { ...form, inputs: { ...form.inputs, sensor: { ...form.inputs.sensor, ph: '4.25' } } };
  const before = structuredClone(form);
  const parsed = parseScreening(form);
  assert.deepEqual(parsed.errors, {});
  assert.equal(parsed.value.inputs.sensor.ph, 4.25);
  assert.equal(parsed.value.inputs.vision.mold_score, 0);
  assert.equal(parsed.value.device_id, undefined);
  assert.equal(parsed.value.client_request_id, undefined);
  assert.deepEqual(snapshotDraftForm(parsed.value, identity), parsed.value);
  assert.deepEqual(form, before);
  assert.throws(() => snapshotDraftForm(updateScreeningReading(form, 'ph', ''), identity), /Complete every reading/);
});

test('saved batches deduplicate by farm/sample/batch and never mix farms or sample types', () => {
  const saved = (farm_id, sample_type, batch_id) => ({ scan: { farm_id, sample_type, batch_id } });
  const history = [
    saved('farm-a', 'silage', 'SAME'), saved('farm-a', 'silage', 'SAME'),
    saved('farm-b', 'silage', 'SAME'), saved('farm-a', 'feed', 'SAME'),
    saved('farm-a', 'silage', 'NEXT'), saved('farm-a', 'silage', ' '), null, {},
  ];
  const before = structuredClone(history);
  assert.deepEqual(getScreeningBatches(history, 'farm-a', 'silage').map((batch) => batch.batch_id), ['SAME', 'NEXT']);
  assert.equal(getScreeningBatches({ items: history }, 'farm-a', 'feed').length, 1);
  assert.equal(getScreeningBatches(history, 'farm-b', 'silage').length, 1);
  assert.deepEqual(getScreeningBatches(history, 'unknown', 'silage'), []);
  assert.deepEqual(getScreeningBatches(undefined, 'farm-a', 'silage'), []);
  assert.deepEqual(history, before);
});

test('step validation blocks only the current step until the full review gate', () => {
  const form = createEmptyScreening('farm-a');
  assert.deepEqual(screeningStepErrors(form, 0), {});
  assert.deepEqual(Object.keys(screeningStepErrors(form, 1)), ['batch_id']);
  assert.equal(Object.keys(screeningStepErrors(form, 2)).length, 10);
  assert.equal(Object.keys(screeningStepErrors(form, 3)).length, 11);
});

test('next/Enter transitions never submit before review and final submission needs permission, online and confirmation', () => {
  const form = complete();
  for (const step of [0, 1, 2]) assert.deepEqual(screeningTransition(form, { step, online: true, confirmed: true }), { kind: 'next', step: step + 1 });
  assert.deepEqual(screeningTransition(form, { step: 3, online: true, confirmed: true }), { kind: 'submit' });
  for (const [options, reason] of [
    [{ disabled: true, online: true, confirmed: true }, 'disabled'],
    [{ busy: true, online: true, confirmed: true }, 'busy'],
    [{ online: false, confirmed: true }, 'offline'], [{ confirmed: true }, 'offline'],
    [{ online: true, confirmed: false }, 'confirmation'],
  ]) assert.deepEqual(screeningTransition(form, { step: 3, ...options }), { kind: 'blocked', reason });
  for (const step of [-1, 4, NaN]) assert.equal(screeningTransition(form, { step, online: true, confirmed: true }).reason, 'step');
  const action = screeningTransition(updateScreeningReading(form, 'ph', ''), { step: 3, online: true, confirmed: true });
  assert.equal(action.kind, 'invalid');
  assert.match(action.errors.ph, /Missing measurements/);
  assert.equal(form.inputs.sensor.ph, 0);
});

test('the English fallback interpolates placeholders including zero', () => {
  assert.equal(english('Step {step} of {total}: {title}', { step: 0, total: 4, title: 'Choose sample' }), 'Step 0 of 4: Choose sample');
  assert.equal(english('{missing}', {}), '{missing}');
});

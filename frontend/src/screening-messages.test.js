import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { screeningMessages } from './screening-messages.js';
import { english, SCREENING_GROUPS, SCREENING_SOURCES, validateScreening, createEmptyScreening } from './screening.js';

const placeholders = (text) => [...text.matchAll(/\{\w+\}/g)].map(([value]) => value).sort();

test('Hindi and Marathi provide matching nonempty dictionaries and preserve every placeholder', () => {
  assert.deepEqual(Object.keys(screeningMessages).sort(), ['hi', 'mr']);
  assert.deepEqual(Object.keys(screeningMessages.hi).sort(), Object.keys(screeningMessages.mr).sort());
  for (const [locale, messages] of Object.entries(screeningMessages)) {
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim(), `${locale}: ${key}`);
      assert.deepEqual(placeholders(value), placeholders(key), `${locale}: ${key}`);
      assert.ok(/[\u0900-\u097f]/.test(value) || key === 'pH', `${locale} needs a translation: ${key}`);
    }
  }
});

test('every literal translation call and metadata label in the owned components/helpers is translated', async () => {
  const keys = new Set();
  for (const file of ['FarmerHome.jsx', 'GuidedScreening.jsx', 'screening.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) keys.add(match[1]);
  }
  for (const group of SCREENING_GROUPS) {
    keys.add(group.title);
    keys.add(group.description);
    for (const field of group.fields) keys.add(field.label);
  }
  for (const source of SCREENING_SOURCES) keys.add(source.label);
  // Conditional/lookup strings are passed to t as whole messages at runtime.
  for (const key of [
    'Choose sample', 'Choose batch', 'Enter readings', 'Review and submit', 'Silage', 'Cattle feed', 'Not selected',
    'Start a guided screening with your measurements.', 'View screening steps. Submitting needs write access.',
    'Chopped green fodder preserved by fermentation.', 'Dry or mixed cattle feed, such as grain or pellets.',
    'Only batches in the supplied history are listed. Selecting a batch reuses its ID, not its old readings.',
    'No matching batches in the supplied history. Enter a new batch ID below.',
    'Submitting screening…', 'Submit screening',
  ]) keys.add(key);
  for (const locale of ['hi', 'mr']) {
    for (const key of keys) assert.ok(Object.hasOwn(screeningMessages[locale], key), `${locale} missing: ${key}`);
  }
});

test('translated errors and instructions interpolate field labels, limits, progress and zero without English fallback', () => {
  for (const locale of ['hi', 'mr']) {
    const t = (key, values) => english(screeningMessages[locale][key] ?? assert.fail(`missing ${locale}: ${key}`), values);
    const errors = validateScreening(createEmptyScreening(), t);
    assert.equal(Object.keys(errors).length, 12);
    assert.ok(errors.moisture_pct.includes(t('Moisture')));
    for (const error of Object.values(errors)) assert.doesNotMatch(error, /\{\w+\}/);
    const progress = t('Step {step} of {total}: {title}', { step: 1, total: 4, title: t('Choose sample') });
    assert.doesNotMatch(progress, /\{\w+\}/);
    assert.ok(progress.includes('1') && progress.includes('4'));
    const range = t('Allowed range: {min} to {max}{unit}', { min: 0, max: 100, unit: ' %' });
    assert.match(range, /0.*100.*%/);
  }
});

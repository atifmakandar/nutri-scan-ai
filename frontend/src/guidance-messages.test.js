import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guidanceMessages } from './guidance-messages.js';
import {
  createGuidanceTranslator, MEASUREMENT_GUIDANCE, PHOTO_NOTICE, QUICK_STEPS,
  speechStatusMessage, VISUAL_SCORE_NOTICE, VOICE_NOTICE,
} from './guidance.js';

const placeholders = (value) => (value.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || []).sort();

test('Hindi and Marathi catalogues have the same complete keys and retain every placeholder', () => {
  assert.deepEqual(Object.keys(guidanceMessages.hi).sort(), Object.keys(guidanceMessages.mr).sort());
  for (const locale of ['hi', 'mr']) {
    for (const [english, translation] of Object.entries(guidanceMessages[locale])) {
      assert.ok(translation.trim(), `${locale}: ${english}`);
      assert.deepEqual(placeholders(translation), placeholders(english), `${locale}: ${english}`);
      if (english !== 'pH') assert.match(translation, /[\u0900-\u097f]/, `${locale}: ${english}`);
    }
  }
});

test('all measurement, listening-status and component message keys have bundled translations', async () => {
  const keys = new Set([
    ...QUICK_STEPS, PHOTO_NOTICE, VISUAL_SCORE_NOTICE, VOICE_NOTICE,
    ...MEASUREMENT_GUIDANCE.flatMap(({ label, unit, instrument, where, mistake }) => [label, unit, instrument, where, mistake]),
    ...['idle', 'ready', 'starting', 'speaking', 'ended', 'stopped', 'unsupported', 'unavailable', 'error', 'empty'].map(speechStatusMessage),
    'English', 'Hindi', 'Marathi', 'the selected language',
  ]);
  // Include literal component labels too, so a newly added label cannot silently
  // ship in English in the Hindi/Marathi help screens.
  for (const file of ['FarmerHelp.jsx', 'ListenButton.jsx']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const [, key] of source.matchAll(/\bg\('([^']+)'/g)) keys.add(key);
  }
  for (const locale of ['hi', 'mr']) {
    for (const key of keys) assert.ok(Object.hasOwn(guidanceMessages[locale], key), `${locale}: ${key}`);
  }
});

test('localized status and field summaries interpolate whole sentences without losing values', () => {
  for (const locale of ['en', 'hi', 'mr']) {
    const g = createGuidanceTranslator(undefined, locale);
    const message = g(speechStatusMessage('unavailable'), { language: g('Marathi') });
    assert.ok(message.includes(g('Marathi')));
    assert.doesNotMatch(message, /\{language\}/);
    const field = g('How to measure {measurement}', { measurement: g('Moisture') });
    assert.ok(field.includes(g('Moisture')));
    assert.doesNotMatch(field, /\{measurement\}/);
  }
});

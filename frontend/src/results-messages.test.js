import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resultsMessages } from './results-messages.js';
import { dictionaries, translate } from './i18n.js';
import { CONFIDENCE_NOTICE, resultsText, SCREENING_NOTICE } from './farmer-results.js';
import { shareEvidenceMessages } from './share-evidence.js';

test('Hindi and Marathi catalogs have matching real translations and unchanged placeholders', () => {
  assert.deepEqual(Object.keys(resultsMessages), ['hi', 'mr']);
  assert.deepEqual(Object.keys(resultsMessages.hi).sort(), Object.keys(resultsMessages.mr).sort());
  for (const [locale, dictionary] of Object.entries(resultsMessages)) {
    for (const [english, translated] of Object.entries(dictionary)) {
      assert.equal(typeof translated, 'string', `${locale}: ${english}`);
      assert.notEqual(translated, english, `${locale}: ${english}`);
      assert.match(translated, /\p{Script=Devanagari}/u, `${locale}: ${english}`);
      assert.deepEqual((translated.match(/\{\w+\}/g) || []).sort(), (english.match(/\{\w+\}/g) || []).sort(), `${locale}: ${english}`);
    }
    for (const key of [SCREENING_NOTICE, CONFIDENCE_NOTICE, ...Object.values(shareEvidenceMessages), 'Photos are excluded: private photo evidence cannot be safely shared automatically.', 'This device cannot share the selected photos. No text-only share was sent. Remove photo choices to share text only, or use copy or WhatsApp for text.', 'WhatsApp is an external service. Clicking sends this preview text to WhatsApp; check the recipient before sending.']) assert.ok(dictionary[key]);
  }
});

test('all literal UI message calls have coverage in the new or existing catalogs', async () => {
  for (const filename of ['FarmerResults.jsx', 'farmer-results.js', 'ShareEvidencePicker.jsx']) {
    const source = await readFile(new URL(filename, import.meta.url), 'utf8');
    const keys = [...source.matchAll(/\b(?:text|t)\('([^']+)'/g)].map((match) => match[1]);
    for (const key of keys) {
      for (const locale of ['hi', 'mr']) assert.ok(Object.hasOwn(resultsMessages[locale], key) || Object.hasOwn(dictionaries[locale], key), `${filename}: ${locale}: ${key}`);
    }
  }
});

test('parent locale works without changing its translator; English and unknown locales remain readable', () => {
  const key = 'Loaded {count} of {total} matching saved records (latest {limit} maximum).';
  const parent = Object.assign((key, values) => translate('hi', key, values), { locale: 'hi' });
  const text = resultsText(parent);
  assert.equal(text.locale, 'hi');
  assert.equal(text(key, { count: 0, total: 120, limit: 100 }), 'मेल खाती 120 सहेजी जांचों में से 0 लोड हुईं (अधिकतम नवीनतम 100)।');
  assert.equal(text('Batch ID'), translate('hi', 'Batch ID'));
  assert.equal(parent(key), key, 'the existing translator/catalog remains untouched');
  assert.equal(resultsText()(key, { count: 0, total: 120, limit: 100 }), 'Loaded 0 of 120 matching saved records (latest 100 maximum).');
  const fallback = Object.assign((key, values) => translate('unknown', key, values), { locale: 'unknown' });
  assert.equal(resultsText(fallback)(SCREENING_NOTICE), SCREENING_NOTICE);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dictionaries, translate } from './i18n.js';
import { offlineMessages, offlineText } from './offline-messages.js';

const translator = (locale) => Object.assign((key, values) => translate(locale, key, values), { locale });
const placeholders = (text) => [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();

test('Hindi and Marathi catalogs have exact key/placeholder parity and localized nonblank text', () => {
  assert.deepEqual(Object.keys(offlineMessages).sort(), ['hi', 'mr']);
  assert.deepEqual(Object.keys(offlineMessages.hi).sort(), Object.keys(offlineMessages.mr).sort());
  for (const [locale, messages] of Object.entries(offlineMessages)) {
    for (const [key, value] of Object.entries(messages)) {
      assert.ok(value.trim());
      assert.equal(value, value.trim());
      assert.notEqual(value, key);
      assert.match(value, /\p{Script=Devanagari}/u);
      assert.deepEqual(placeholders(value), placeholders(key), `${locale}: ${key}`);
      const values = { count: 0, time: '09:15' };
      const rendered = offlineText(translator(locale), key, values);
      assert.notEqual(rendered, translate('en', key, values), `${locale} fell back: ${key}`);
      assert.doesNotMatch(rendered, /\{count\}|\{time\}/);
    }
  }
});

test('all literal panel/status labels and metadata errors have bundled translations', async () => {
  const keys = [];
  for (const file of ['DraftsPanel.jsx', 'OfflineStatus.jsx', 'offline-status.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:translate|text|super)\('([^']+)'/g)) keys.push(match[1]);
  }
  // Branch labels are not the first literal argument to text().
  keys.push('Online', 'Offline — readings stay on this device.', 'Checking local drafts…', 'Local draft counts are unavailable.');
  for (const key of keys) {
    for (const locale of ['hi', 'mr']) {
      assert.ok(Object.hasOwn(offlineMessages[locale], key) || Object.hasOwn(dictionaries[locale], key), `${locale}: ${key}`);
    }
  }
});

test('replacement values reach the existing translator; interpolated English misses still use the supplemental catalog', () => {
  const key = '{count} saved local drafts';
  assert.equal(offlineText(translator('hi'), key, { count: 2 }), '2 सहेजे गए स्थानीय मसौदे');
  assert.equal(offlineText(translator('mr'), key, { count: 0 }), '0 जतन केलेले स्थानिक मसुदे');
  let received;
  const custom = (message, values) => { received = values; return `${values.count} custom drafts`; };
  assert.equal(offlineText(custom, key, { count: 3 }), '3 custom drafts');
  assert.deepEqual(received, { count: 3 });
  assert.equal(offlineText(translator('hi'), 'Save draft'), translate('hi', 'Save draft'));
  assert.equal(offlineText(translator('mr'), 'Viewer access is read-only. You can load drafts, but cannot save, queue, delete, or sync them.'), translate('mr', 'Viewer access is read-only. You can load drafts, but cannot save, queue, delete, or sync them.'));
});

test('fallback interpolation preserves missing placeholders, own zero/false values and nonrecursive replacement text', () => {
  assert.equal(offlineText(undefined, '{count} / {enabled}', { count: 0, enabled: false }), '0 / false');
  assert.equal(offlineText(translator('unsupported'), '{count} saved local drafts', { count: 2 }), '2 saved local drafts');
  assert.equal(offlineText(translator('hi'), '{count} saved local drafts'), '{count} सहेजे गए स्थानीय मसौदे');
  assert.equal(offlineText(undefined, '{inherited}', Object.create({ inherited: 'no' })), '{inherited}');
  assert.equal(offlineText(undefined, '{x} {y}', { x: '{y}', y: '<value>' }), '{y} <value>');
  assert.equal(offlineText(translator('hi'), 'Last confirmed upload: {time}', { time: '{time}<value>' }), 'अंतिम पुष्टि किए गए अपलोड का समय: {time}<value>');
});

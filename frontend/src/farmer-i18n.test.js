import test from 'node:test';
import assert from 'node:assert/strict';
import { createFarmerTranslator, farmerDictionaries } from './farmer-i18n.js';
import { translate } from './i18n.js';

test('farmer screening/app catalogs extend existing translations without losing the locale', () => {
  assert.deepEqual(Object.keys(farmerDictionaries.hi).sort(), Object.keys(farmerDictionaries.mr).sort());
  for (const locale of ['hi', 'mr']) {
    const t = createFarmerTranslator(locale);
    assert.equal(t.locale, locale);
    assert.equal(t('Sign in'), translate(locale, 'Sign in'));
    for (const [key, value] of Object.entries(farmerDictionaries[locale])) {
      assert.ok(value.trim());
      assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(([v]) => v).sort(), [...value.matchAll(/\{\w+\}/g)].map(([v]) => v).sort());
      assert.equal(t(key), value);
    }
  }
});

test('farmer translator retains safe English fallback and single-pass own-value interpolation', () => {
  assert.equal(createFarmerTranslator('unknown').locale, 'en');
  assert.equal(createFarmerTranslator('en')('Step {step} of {total}: {title}', { step: 0, total: 4, title: '{step}' }), 'Step 0 of 4: {step}');
  const t = createFarmerTranslator('hi');
  assert.equal(t('constructor'), 'constructor');
  assert.match(t('Step {step} of {total}: {title}', { step: 0 }), /0/);
  assert.match(t('Step {step} of {total}: {title}', Object.create({ step: 3 })), /\{step\}/);
  assert.match(t('Step {step} of {total}: {title}', { step: null }), /\{step\}/);
});

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MEASUREMENT_GUIDANCE } from './guidance.js';

let server;
let FarmerHelp;
let MeasurementHelp;

before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ default: FarmerHelp, MeasurementHelp } = await server.ssrLoadModule('/src/FarmerHelp.jsx'));
});
after(async () => { await server?.close(); });

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test('help renders ten locally illustrated measurements and simple instructions with no browser or image requests', () => {
  const html = render(FarmerHelp, {});
  assert.match(html, /<section id="farmer-help"/);
  assert.match(html, /Quick steps/);
  assert.match(html, /Sign in and choose the correct batch and sample type/);
  assert.equal((html.match(/data-field="/g) || []).length, 10);
  assert.equal((html.match(/<svg /g) || []).length, 10);
  assert.equal((html.match(/role="img"/g) || []).length, 10);
  assert.equal((html.match(/<figcaption>/g) || []).length, 10);
  assert.doesNotMatch(html, /<img|<image|https?:\/\/|<audio|<input/);
  for (const item of MEASUREMENT_GUIDANCE) assert.ok(html.includes(`data-field="${item.fieldKey}"`));
});

test('each field detail supplies units, entry location, common mistake and an accessible inlined picture', () => {
  for (const item of MEASUREMENT_GUIDANCE) {
    const html = render(MeasurementHelp, { fieldKey: item.fieldKey });
    assert.match(html, /^<details/);
    assert.ok(html.includes(`<summary>How to measure ${item.label}</summary>`));
    assert.ok(html.includes(item.unit));
    assert.ok(html.includes(item.where));
    assert.ok(html.includes(item.mistake));
    assert.ok(html.includes(`<title id=`));
    assert.ok(html.includes(item.instrument));
    assert.match(html, /<dt>Units<\/dt>/);
    assert.match(html, /<dt>Where and what to enter<\/dt>/);
    assert.match(html, /<dt>Common mistake<\/dt>/);
    assert.match(html, /aria-labelledby="[^"]+" focusable="false"/);
    assert.match(html, /Read the text/);
  }
  assert.equal(render(MeasurementHelp, { fieldKey: 'not-a-measurement' }), '');
});

test('nutrient entry requires a matching lab/calibrated report instead of visual or invented precision', () => {
  for (const fieldKey of ['protein_pct', 'dry_matter_pct', 'fiber_pct']) {
    const html = render(MeasurementHelp, { fieldKey });
    assert.match(html, /laboratory or calibrated instrument report/);
    assert.match(html, /for this sample/);
    assert.doesNotMatch(html, /\b99\.?\d*%|accuracy|lab.precision/i);
  }
  assert.match(render(MeasurementHelp, { fieldKey: 'protein_pct' }), /dry-basis and as-fed/);
  assert.match(render(MeasurementHelp, { fieldKey: 'fiber_pct' }), /NDF or ADF/);
});

test('every visual score explains its prototype scale, trained method, no guesses, and photo limitations', () => {
  for (const fieldKey of ['mold_score', 'color_anomaly', 'surface_damage']) {
    const html = render(MeasurementHelp, { fieldKey });
    assert.match(html, /0–1 prototype score \(no unit\)/);
    assert.match(html, /not objective safety measurements/);
    assert.match(html, /trained operator must use a validated method; do not guess/);
    assert.match(html, /Photos are evidence only, not an AI diagnosis/);
  }
  assert.match(render(MeasurementHelp, { fieldKey: 'mold_score' }), /treat 0 as proof of safety/);
});

test('English, Hindi and Marathi render complete field help and listening from a parent locale or explicit prop', () => {
  for (const [locale, heading, units, listen] of [
    ['en', 'Measure, enter, then review', 'Units', 'Listen'],
    ['hi', 'मापें, दर्ज करें, फिर समीक्षा करें', 'इकाइयां', 'सुनें'],
    ['mr', 'मोजा, नोंदवा, मग आढावा घ्या', 'एकके', 'ऐका'],
  ]) {
    const t = Object.assign((key) => key, { locale });
    const html = render(FarmerHelp, { t });
    for (const expected of [heading, `<dt>${units}</dt>`, listen]) assert.ok(html.includes(expected), expected);
    assert.equal((html.match(/<svg /g) || []).length, 10);
    assert.doesNotMatch(html, /\{measurement\}|\{language\}/);
    if (locale !== 'en') assert.doesNotMatch(html, /How to measure|Where and what to enter|Common mistake|No matching voice/);
  }
  const t = Object.assign((key) => key, { locale: 'hi' });
  assert.match(render(MeasurementHelp, { fieldKey: 'ph', t, locale: 'mr' }), /कसे मोजावे/);
});

test('all SVG names and listening status references are unique and resolve within the rendered section', () => {
  const html = render(FarmerHelp, {});
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of html.matchAll(/aria-(?:labelledby|describedby|controls)="([^"]+)"/g)) {
    for (const id of match[1].split(' ')) assert.ok(ids.includes(id), `Missing accessible target ${id}`);
  }
});

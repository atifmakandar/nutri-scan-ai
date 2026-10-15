import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let ReportActions;

before(async () => {
  // Use the project's JSX compiler without adding a DOM or browser dependency.
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  ({ default: ReportActions } = await server.ssrLoadModule('/src/ReportActions.jsx'));
});

after(async () => { await server?.close(); });

test('report actions are absent until a saved scan and result are available', () => {
  for (const record of [undefined, null, {}, { scan: {} }, { result: {} }]) {
    assert.equal(renderToStaticMarkup(createElement(ReportActions, { record })), '');
  }
});

test('latest and history actions identify the saved batch and offer HTML and PDF paths', () => {
  const record = { scan: { id: 'saved-id', batch_id: 'SAVED-BATCH-17' }, result: {} };
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(ReportActions, { record, compact }));
    assert.equal((html.match(/<button /g) || []).length, 2);
    assert.match(html, /Download report \(\.html\)/);
    assert.match(html, /Print \/ Save PDF/);
    assert.match(html, /Download HTML report for batch SAVED-BATCH-17/);
    assert.match(html, /Print or save PDF report for batch SAVED-BATCH-17 \(opens a new tab\)/);
    assert.equal((html.match(/type="button"/g) || []).length, 2, 'exports must not submit the scan form');
    assert.equal(html.includes('report-actions-compact'), compact);
    assert.equal(html.includes('report-hint'), !compact);
  }
});

test('saved identifiers cannot inject HTML into the export controls', () => {
  const record = { scan: { id: 'scan', batch_id: '\"><img src=x onerror=alert(1)>' }, result: {} };
  const html = renderToStaticMarkup(createElement(ReportActions, { record }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&quot;/);
});

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let startScanSearch;
before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: { port: 30000 + Math.floor(Math.random() * 10000) } } });
  ({ startScanSearch } = await server.ssrLoadModule('/src/BatchTrends.jsx'));
});
after(async () => { await server?.close(); });

const page = (id) => ({ items: [{ scan: { id }, result: {} }], total: 1, offset: 0, limit: 25 });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('superseded history/trend responses never replace the current request, even if api ignores abort', async () => {
  const old = deferred();
  const latest = deferred();
  const displayed = [];
  const signals = [];
  const api = (path, options) => {
    signals.push(options.signal);
    return path === '/old' ? old.promise : latest.promise;
  };
  const fail = () => assert.fail('unexpected request failure');
  const cancelOld = startScanSearch(api, '/old', (data) => displayed.push(data.items[0].scan.id), fail);
  cancelOld();
  const cancelLatest = startScanSearch(api, '/latest', (data) => displayed.push(data.items[0].scan.id), fail);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  latest.resolve(page('latest'));
  await tick();
  old.resolve(page('old'));
  await tick();
  assert.deepEqual(displayed, ['latest']);
  cancelLatest();
});

test('cleanup suppresses both a late success and a late request rejection', async () => {
  for (const reject of [false, true]) {
    const pending = deferred();
    let signal;
    const stop = startScanSearch((_, options) => { signal = options.signal; return pending.promise; }, '/pending',
      () => assert.fail('unmounted request updated the view'), () => assert.fail('unmounted request surfaced an error'));
    stop();
    assert.equal(signal.aborted, true);
    if (reject) pending.reject(new Error('late failure'));
    else pending.resolve(page('late'));
    await tick();
  }
});

test('request failures keep Error.status and synchronous api exceptions become visible errors', async () => {
  for (const synchronous of [false, true]) {
    const original = Object.assign(new Error('Please sign in'), { status: 401 });
    const errors = [];
    const stop = startScanSearch(() => {
      if (synchronous) throw original;
      return Promise.reject(original);
    }, '/private', () => assert.fail('failed request succeeded'), (error) => errors.push(error));
    await tick();
    assert.equal(errors[0], original);
    assert.equal(errors[0].status, 401);
    stop();
  }
});

test('invalid API page envelopes fail clearly rather than rendering broken pagination', async () => {
  for (const data of [null, [], {}, { ...page('a'), limit: 101 }, { ...page('a'), offset: -1 }, { ...page('a'), total: 0 }, { ...page('a'), items: [null] }]) {
    const errors = [];
    const stop = startScanSearch(async () => data, '/search', () => assert.fail('invalid response rendered'), (error) => errors.push(error));
    await tick();
    assert.match(errors[0].message, /invalid history response/);
    stop();
  }
});

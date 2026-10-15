import test from 'node:test';
import assert from 'node:assert/strict';
import { Blob, File } from 'node:buffer';
import {
  createShareEvidenceSession, MAX_SHARE_PHOTO_BYTES, MAX_SHARE_PHOTOS, safeShareEvidenceMetadata,
  shareEvidenceMessages, shareEvidencePath, supportsShareEvidence,
} from './share-evidence.js';

const photo = (id = 'p1', content_type = 'image/jpeg') => ({ id, filename: `evidence-${id}.jpg`, content_type, url: 'https://private.invalid/never-fetch?token=secret' });
const blob = (type = 'image/jpeg', size = 3) => new Blob([new Uint8Array(size)], { type });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);

function harness({ metadata = [photo()], fetchBlob = () => blob(), browser: override, api: request } = {}) {
  const calls = [];
  const changes = [];
  const states = [];
  const created = [];
  const revoked = [];
  const browser = override || { Blob, File, URL: {
    createObjectURL(file) { assert.ok(file instanceof File); const url = `blob:local-${created.length}`; created.push({ file, url }); return url; },
    revokeObjectURL(url) { revoked.push(url); },
  }, fetch: () => assert.fail('never use browser.fetch'), localStorage: { setItem: () => assert.fail('never persist photos') } };
  const api = (path, options) => {
    calls.push({ path, options });
    return request ? request(path, options) : options.responseType === 'blob' ? fetchBlob(path, options) : metadata;
  };
  const session = createShareEvidenceSession({ api, scanId: 'scan/one', browser,
    onState: (state) => states.push(state), onChange: (files, selection) => changes.push({ files, ...selection }) });
  return { session, browser, calls, changes, states, created, revoked,
    get state() { return states.at(-1); }, get change() { return changes.at(-1); } };
}

test('evidence routes encode both identifiers and reject empty, traversal and malformed IDs', () => {
  assert.equal(shareEvidencePath('scan/one'), '/api/v1/scans/scan%2Fone/photos');
  assert.equal(shareEvidencePath('scan/one', 'photo?x=#1'), '/api/v1/scans/scan%2Fone/photos/photo%3Fx%3D%231');
  for (const id of ['', ' ', '.', '..', null, '\u0000bad', '\ud800']) {
    assert.throws(() => shareEvidencePath(id));
    assert.throws(() => shareEvidencePath('scan', id));
  }
});

test('metadata is a five-item allowlist with safe filenames, unique IDs, supported types and no URL access', () => {
  const unsafe = { ...photo('safe'), filename: '../../private\\<unsafe>\u202e.jpg', token: 'never-copy' };
  Object.defineProperty(unsafe, 'url', { get: () => assert.fail('metadata URLs must never be read') });
  const values = [null, { ...photo(), id: '..' }, photo('gif', 'image/gif'), unsafe, photo('safe'),
    ...Array.from({ length: 8 }, (_, i) => photo(`p${i}`))];
  const metadata = safeShareEvidenceMetadata(values);
  assert.equal(metadata.length, MAX_SHARE_PHOTOS);
  assert.deepEqual(metadata[0], { id: 'safe', filename: '_unsafe__.jpg', content_type: 'image/jpeg' });
  assert.equal(new Set(metadata.map((item) => item.id)).size, 5);
  assert.doesNotMatch(JSON.stringify(metadata), /token|url|private|https:|\u202e/);
  assert.throws(() => safeShareEvidenceMetadata({ items: values }));
  assert.deepEqual(safeShareEvidenceMetadata([]), []);
});

test('load and select are explicit metadata-only actions; prepare fetches only chosen local IDs as authenticated Blobs', async () => {
  const h = harness({ metadata: [photo('p1'), photo('p2')] });
  assert.deepEqual(h.calls, []);
  await h.session.load();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].path, '/api/v1/scans/scan%2Fone/photos');
  assert.equal(h.calls[0].options.method, 'GET');
  assert.equal(h.calls[0].options.credentials, 'include');
  assert.ok(h.calls[0].options.signal instanceof AbortSignal);
  assert.equal(h.calls[0].options.responseType, undefined);
  h.session.select(['p2', 'unknown', 'p2']);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.state.selectedIds, ['p2']);
  assert.equal(h.change.ready, false);
  await h.session.prepare();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].path, '/api/v1/scans/scan%2Fone/photos/p2');
  assert.equal(h.calls[1].options.responseType, 'blob');
  assert.equal(h.calls[1].options.credentials, 'include');
  assert.equal(h.state.status, 'prepared');
  assert.equal(h.change.ready, true);
  assert.equal(h.change.files.length, 1);
  assert.equal(h.change.files[0].name, 'evidence-p2.jpg');
  assert.equal(h.change.files[0].type, 'image/jpeg');
  assert.equal(h.change.files[0].size, 3);
  assert.deepEqual([...new Uint8Array(await h.change.files[0].arrayBuffer())], [0, 0, 0]);
  assert.equal(h.state.prepared[0].url, 'blob:local-0');
  h.session.dispose();
  assert.deepEqual(h.revoked, ['blob:local-0']);
});

test('preparation is capped to five allowed metadata IDs, including a selection containing extra arbitrary IDs', async () => {
  const h = harness({ metadata: Array.from({ length: 9 }, (_, i) => photo(`p${i}`)) });
  await h.session.load();
  h.session.select(Array.from({ length: 20 }, (_, i) => `p${i}`));
  await h.session.prepare();
  assert.equal(h.change.files.length, 5);
  assert.equal(h.calls.length, 6);
  h.session.dispose();
  assert.equal(h.revoked.length, 5);
});

test('a changed or repeated selection drops all prepared files and revokes previews; old selection never reuses files', async () => {
  const h = harness({ metadata: [photo('p1'), photo('p2')] });
  await h.session.load();
  h.session.select(['p1']);
  await h.session.prepare();
  h.session.select(['p2']);
  assert.deepEqual(h.change, { files: [], selectedCount: 1, ready: false });
  assert.deepEqual(h.state.prepared, []);
  assert.deepEqual(h.revoked, ['blob:local-0']);
  h.session.select(['p1']);
  assert.deepEqual(h.change.files, []);
  await h.session.prepare();
  assert.equal(h.calls.length, 3);
  h.session.select(['p1']);
  assert.deepEqual(h.change.files, []);
  assert.equal(h.change.ready, false);
  assert.deepEqual(h.revoked, ['blob:local-0', 'blob:local-1']);
  h.session.clear();
  assert.equal(h.change.ready, true);
  assert.equal(h.state.status, 'idle');
  assert.deepEqual(h.state.photos, []);
});

test('empty and invalid lists and metadata errors are recoverable and never reflect private server details', async () => {
  for (const metadata of [[], null]) {
    const h = harness({ metadata });
    await h.session.load();
    assert.equal(h.state.status, metadata ? 'ready' : 'error');
    assert.deepEqual(h.state.photos, []);
    assert.equal(h.change.ready, true);
    await h.session.prepare();
    assert.equal(h.calls.length, 1);
    h.session.dispose();
  }
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [500, 'list']]) {
    let fail = true;
    const h = harness({ api: () => { if (fail) throw Object.assign(new Error('token=private https://private.invalid'), { status }); return [photo()]; } });
    await h.session.load();
    assert.equal(h.state.error, code);
    assert.doesNotMatch(JSON.stringify(h.state), /private|token|https:/);
    assert.ok(shareEvidenceMessages[code]);
    fail = false;
    await h.session.load();
    assert.equal(h.state.status, 'ready');
    assert.equal(h.state.error, null);
    h.session.dispose();
  }
});

test('missing File, Blob or local URL capabilities fail explicitly before downloading selected bytes', async () => {
  for (const missing of ['File', 'Blob', 'URL', 'createObjectURL', 'revokeObjectURL']) {
    const browser = { Blob, File, URL: { createObjectURL() {}, revokeObjectURL() {} } };
    if (missing.endsWith('ObjectURL')) delete browser.URL[missing];
    else delete browser[missing];
    assert.equal(supportsShareEvidence(browser), false, missing);
    const h = harness({ browser });
    await h.session.load();
    h.session.select(['p1']);
    await h.session.prepare();
    assert.equal(h.state.error, 'unsupported', missing);
    assert.deepEqual(h.change.files, []);
    assert.equal(h.change.ready, false);
    assert.equal(h.calls.length, 1);
    h.session.dispose();
  }
  assert.equal(supportsShareEvidence(null), false);
});

test('actual Blob MIME and size are validated; only nonempty JPEG/PNG/WebP up to 5 MiB become Files', async () => {
  for (const value of [blob('image/gif'), blob('text/html'), blob('image/png', 0), blob('image/jpeg', MAX_SHARE_PHOTO_BYTES + 1), { size: 3, type: 'image/jpeg' }]) {
    const h = harness({ fetchBlob: () => value });
    await h.session.load();
    h.session.select(['p1']);
    await h.session.prepare();
    assert.equal(h.state.error, 'invalid');
    assert.deepEqual(h.change.files, []);
    assert.equal(h.created.length, 0);
    h.session.dispose();
  }
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const h = harness({ fetchBlob: () => blob(type, MAX_SHARE_PHOTO_BYTES) });
    await h.session.load();
    h.session.select(['p1']);
    await h.session.prepare();
    assert.equal(h.state.status, 'prepared');
    assert.equal(h.change.files[0].type, type);
    assert.match(h.change.files[0].name, type === 'image/jpeg' ? /\.jpg$/ : type === 'image/png' ? /\.png$/ : /\.webp$/);
    h.session.dispose();
  }
});

test('partial fetch and File/URL errors revoke prepared previews and publish no partial attachments', async () => {
  for (const status of [401, 403, 500]) {
    const h = harness({ metadata: [photo('p1'), photo('p2')], fetchBlob: (path) => {
      if (path.endsWith('/p2')) throw Object.assign(new Error('private server detail'), { status });
      return blob();
    } });
    await h.session.load();
    h.session.select(['p1', 'p2']);
    await h.session.prepare();
    assert.equal(h.state.error, status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'prepare');
    assert.deepEqual(h.state.prepared, []);
    assert.deepEqual(h.change.files, []);
    assert.deepEqual(h.revoked, ['blob:local-0']);
    h.session.dispose();
  }
  for (const failAt of ['File', 'URL']) {
    const h = harness();
    if (failAt === 'File') h.browser.File = class { constructor() { throw new Error('blocked'); } };
    else h.browser.URL.createObjectURL = () => { throw new Error('blocked'); };
    await h.session.load();
    h.session.select(['p1']);
    await h.session.prepare();
    assert.equal(h.state.error, 'prepare');
    assert.deepEqual(h.change.files, []);
    h.session.dispose();
  }
});

test('metadata reload aborts and ignores stale metadata even when the API ignores its AbortSignal', async () => {
  const old = deferred();
  let count = 0;
  const h = harness({ api: () => ++count === 1 ? old.promise : [photo('new')] });
  const pending = h.session.load();
  await h.session.load();
  assert.equal(h.calls[0].options.signal.aborted, true);
  old.resolve([photo('old')]);
  await pending;
  assert.deepEqual(h.state.photos.map((item) => item.id), ['new']);
  h.session.dispose();
});

test('selection changes abort an in-flight preparation and ignore its late bytes without creating a URL', async () => {
  const bytes = deferred();
  const h = harness({ fetchBlob: () => bytes.promise });
  await h.session.load();
  h.session.select(['p1']);
  const pending = h.session.prepare();
  const signal = h.calls[1].options.signal;
  h.session.select([]);
  assert.equal(signal.aborted, true);
  const changes = h.changes.length;
  bytes.resolve(blob());
  await pending;
  assert.equal(h.created.length, 0);
  assert.equal(h.changes.length, changes);
  assert.deepEqual(h.change.files, []);
  h.session.dispose();
});

test('cancel during a partially prepared batch revokes immediately, and a newer preparation survives the old response', async () => {
  const late = deferred();
  let count = 0;
  const h = harness({ metadata: [photo('p1'), photo('p2')], fetchBlob: () => ++count === 2 ? late.promise : blob() });
  await h.session.load();
  h.session.select(['p1', 'p2']);
  const pending = h.session.prepare();
  await tick();
  assert.equal(h.created.length, 1);
  h.session.select(['p2']);
  assert.deepEqual(h.revoked, ['blob:local-0']);
  assert.equal(h.calls[2].options.signal.aborted, true);
  await h.session.prepare();
  assert.equal(h.change.files[0].name, 'evidence-p2.jpg');
  late.resolve(blob());
  await pending;
  assert.equal(h.state.status, 'prepared');
  assert.equal(h.change.files[0].name, 'evidence-p2.jpg');
  h.session.dispose();
  assert.deepEqual(h.revoked, ['blob:local-0', 'blob:local-1']);
});

test('unmount/source/account disposal aborts pending work, drops files and prevents all later callbacks/actions', async () => {
  for (const phase of ['metadata', 'bytes', 'prepared']) {
    const late = deferred();
    const h = phase === 'metadata' ? harness({ api: () => late.promise })
      : harness({ fetchBlob: () => phase === 'bytes' ? late.promise : blob() });
    let pending = h.session.load();
    if (phase !== 'metadata') {
      await pending;
      h.session.select(['p1']);
      pending = h.session.prepare();
      if (phase === 'prepared') await pending;
    }
    h.session.dispose();
    assert.equal(h.calls.at(-1).options.signal.aborted, true);
    const changes = h.changes.length;
    const states = h.states.length;
    late.resolve(phase === 'metadata' ? [photo('stale')] : blob());
    await pending;
    await h.session.load();
    await h.session.prepare();
    h.session.select(['p1']);
    h.session.clear();
    assert.equal(h.changes.length, changes);
    assert.equal(h.states.length, states);
    assert.equal(h.created.length, phase === 'prepared' ? 1 : 0);
    assert.equal(h.revoked.length, h.created.length);
  }
});

test('reloading metadata discards prepared attachments before the next list is available', async () => {
  const h = harness();
  await h.session.load();
  h.session.select(['p1']);
  await h.session.prepare();
  const pending = h.session.load();
  assert.deepEqual(h.change.files, []);
  assert.equal(h.change.ready, false);
  assert.deepEqual(h.revoked, ['blob:local-0']);
  await pending;
  assert.deepEqual(h.state.selectedIds, []);
  assert.equal(h.change.ready, true);
  h.session.dispose();
});

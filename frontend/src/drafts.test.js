import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DraftsError,
  deleteDraft,
  getDraftScope,
  loadDraft,
  MAX_DRAFTS,
  MAX_RECORD_BYTES,
  MAX_STORAGE_BYTES,
  queueDraft,
  readDrafts,
  saveDraft,
  snapshotDraftForm,
  syncQueuedDrafts,
} from './drafts.js';

const ID = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const identity = (userId = 'user-a', farmId = 'farm-a', role = 'operator') => ({
  user: { id: userId, username: `${userId}@example.test`, role },
  farm: { id: farmId, name: 'Test farm' },
});

function storage({ setError = null } = {}) {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (setError) throw setError; values.set(key, String(value)); },
  };
}

function form(batch = 'BATCH-1') {
  return {
    farm_id: 'farm-a', batch_id: batch, sample_type: 'silage', source_mode: 'manual',
    inputs: {
      sensor: { moisture_pct: 62, ph: 4.2, temperature_c: 24, humidity_pct: 68 },
      nir: { protein_pct: 8.8, dry_matter_pct: 38, fiber_pct: 28 },
      vision: { mold_score: 0.08, color_anomaly: 0.05, surface_damage: 0.02 },
    },
    password: 'must-not-persist', photo: { bytes: 'must-not-persist' }, api_response: { token: 'secret' },
  };
}

async function queued(identityValue, testStorage, id = ID(1), batch = 'BATCH-1') {
  const draft = await saveDraft(identityValue, form(batch), { storage: testStorage, uuid: () => id, now: 0 });
  return queueDraft(identityValue, draft.id, { storage: testStorage });
}

test('drafts are isolated by authenticated user and farm scope', async () => {
  const store = storage();
  const first = identity('user-a', 'farm-a');
  const otherUser = identity('user-b', 'farm-a');
  const otherFarm = identity('user-a', 'farm-b');
  await saveDraft(first, form(), { storage: store, uuid: () => ID(1), now: 0 });

  assert.equal(readDrafts(first, { storage: store }).length, 1);
  assert.deepEqual(readDrafts(otherUser, { storage: store }), []);
  assert.deepEqual(readDrafts(otherFarm, { storage: store }), []);
  assert.notEqual(getDraftScope(first).key, getDraftScope(otherUser).key);
});

test('malformed storage is reported and left untouched', () => {
  const store = storage();
  const scope = getDraftScope(identity());
  const malformed = '{"version":1,"user_id":"user-a","farm_id":"farm-a","records":[{"status":"queued"}]}';
  store.setItem(scope.key, malformed);

  assert.throws(() => readDrafts(identity(), { storage: store }), (error) => {
    assert.ok(error instanceof DraftsError);
    assert.equal(error.code, 'corrupt');
    return true;
  });
  assert.equal(store.getItem(scope.key), malformed);
});

test('twenty record limit and storage quota failures never claim a save', async () => {
  const store = storage();
  for (let number = 1; number <= MAX_DRAFTS; number += 1) {
    await saveDraft(identity(), form(`BATCH-${number}`), { storage: store, uuid: () => ID(number), now: number });
  }
  await assert.rejects(
    saveDraft(identity(), form('BATCH-21'), { storage: store, uuid: () => ID(21), now: 21 }),
    (error) => error.code === 'limit',
  );
  assert.equal(readDrafts(identity(), { storage: store }).length, MAX_DRAFTS);

  const quotaStore = storage({ setError: new Error('quota') });
  await assert.rejects(
    saveDraft(identity(), form(), { storage: quotaStore, uuid: () => ID(90), now: 0 }),
    (error) => error.code === 'storage' && /could not be saved/.test(error.message),
  );
  assert.deepEqual(readDrafts(identity(), { storage: quotaStore }), []);
});

test('save snapshots only validated fields and queue keeps an immutable payload', async () => {
  const store = storage();
  const input = form();
  const saved = await saveDraft(identity(), input, { storage: store, uuid: () => ID(2), now: 0 });
  input.batch_id = 'CHANGED-AFTER-SAVE';
  input.inputs.sensor.ph = 9;
  const loaded = loadDraft(identity(), saved.id, { storage: store });
  assert.equal(loaded.batch_id, 'BATCH-1');
  assert.equal(loaded.inputs.sensor.ph, 4.2);
  assert.equal(Object.hasOwn(loaded, 'password'), false);
  assert.equal(Object.hasOwn(loaded, 'photo'), false);
  assert.equal(Object.hasOwn(loaded, 'api_response'), false);

  const queuedRecord = await queueDraft(identity(), saved.id, { storage: store });
  assert.equal(queuedRecord.payload.client_request_id, ID(2));
  assert.equal(queuedRecord.payload.password, undefined);
  loaded.batch_id = 'EDITED-COPY';
  assert.equal(loadDraft(identity(), saved.id, { storage: store }).batch_id, 'BATCH-1');
  assert.equal(readDrafts(identity(), { storage: store })[0].payload.batch_id, 'BATCH-1');
  const queuedCopy = loadDraft(identity(), saved.id, { storage: store });
  assert.equal(queuedCopy.client_request_id, undefined);
  queuedCopy.batch_id = 'CORRECTED-BATCH';
  queuedCopy.inputs.sensor.ph = 4.5;
  const correction = await saveDraft(identity(), queuedCopy, { storage: store, uuid: () => ID(20) });
  assert.notEqual(correction.id, saved.id);
  const originalQueue = readDrafts(identity(), { storage: store })[0];
  assert.equal(originalQueue.payload.inputs.sensor.ph, 4.2);
  assert.equal(originalQueue.payload.client_request_id, saved.id);
});

test('queue state is persisted before the request starts and an ambiguous retry keeps its ID', async () => {
  const store = storage();
  await queued(identity(), store, ID(3));
  const sent = [];
  let attempt = 0;
  const api = async (_path, request) => {
    sent.push(request.body);
    const persisted = readDrafts(identity(), { storage: store })[0];
    assert.equal(persisted.attempts, attempt + 1);
    assert.equal(persisted.error, 'interrupted');
    attempt += 1;
    if (attempt === 1) throw new Error('connection dropped after request');
    return { scan: { id: 'scan-3', farm_id: 'farm-a' }, result: { quality_score: 80 } };
  };

  const first = await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
  assert.deepEqual(first, { synced: 0, failed: 1, stopped: 'failed' });
  const afterFailure = readDrafts(identity(), { storage: store })[0];
  assert.equal(afterFailure.status, 'queued');
  assert.equal(afterFailure.error, 'network');
  assert.equal(afterFailure.payload.client_request_id, ID(3));

  const second = await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
  assert.deepEqual(second, { synced: 1, failed: 0, stopped: null });
  assert.deepEqual(sent.map((body) => body.client_request_id), [ID(3), ID(3)]);
  assert.deepEqual(readDrafts(identity(), { storage: store }), []);
});

test('successful responses are removed and never replayed', async () => {
  const store = storage();
  await queued(identity(), store, ID(4));
  let calls = 0;
  const api = async () => {
    calls += 1;
    return { scan: { id: 'scan-4', farm_id: 'farm-a' } };
  };
  await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
  const again = await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
  assert.equal(calls, 1);
  assert.deepEqual(again, { synced: 0, failed: 0, stopped: null });
});

test('conflict and validation failures retain the exact queued payload', async () => {
  for (const [number, status, code] of [[5, 409, 'conflict'], [6, 422, 'validation']]) {
    const store = storage();
    await queued(identity(), store, ID(number), `BATCH-${number}`);
    const before = readDrafts(identity(), { storage: store })[0].payload;
    const api = async () => { throw Object.assign(new Error('server detail must not persist'), { status }); };
    const result = await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
    const after = readDrafts(identity(), { storage: store })[0];
    assert.equal(result.failed, 1);
    assert.equal(after.error, code);
    assert.deepEqual(after.payload, before);
    assert.equal(JSON.stringify(after).includes('server detail'), false);
  }
});

test('offline and another account never send another account’s queue; viewer cannot sync', async () => {
  const store = storage();
  await queued(identity('user-a', 'farm-a'), store, ID(7));
  let calls = 0;
  const api = async () => { calls += 1; return { scan: { id: 'never', farm_id: 'farm-a' } }; };
  const offline = await syncQueuedDrafts({ identity: identity('user-a', 'farm-a'), storage: store, online: false, api });
  const otherAccount = await syncQueuedDrafts({ identity: identity('user-b', 'farm-a'), storage: store, online: true, api });
  assert.deepEqual(offline, { synced: 0, failed: 0, stopped: 'offline' });
  assert.deepEqual(otherAccount, { synced: 0, failed: 0, stopped: null });
  assert.equal(calls, 0);
  assert.equal(readDrafts(identity('user-a', 'farm-a'), { storage: store }).length, 1);
  await assert.rejects(
    saveDraft(identity('viewer', 'farm-a', 'viewer'), form(), { storage: store, uuid: () => ID(8), now: 0 }),
    (error) => error.code === 'readonly',
  );
  await assert.rejects(
    syncQueuedDrafts({ identity: identity('user-a', 'farm-a', 'viewer'), storage: store, online: true, api }),
    (error) => error.code === 'readonly',
  );
  assert.equal(calls, 0);
});

test('cancellation after an in-flight response ignores the response and leaves the request retryable', async () => {
  const store = storage();
  await queued(identity(), store, ID(9));
  await queued(identity(), store, ID(10), 'BATCH-2');
  let current = true;
  let synced = 0;
  let calls = 0;
  const result = await syncQueuedDrafts({
    identity: identity(), storage: store, online: true,
    isCurrent: () => current,
    onSynced: () => { synced += 1; },
    api: async () => {
      calls += 1;
      current = false;
      return { scan: { id: 'scan-late', farm_id: 'farm-a' } };
    },
  });
  assert.deepEqual(result, { synced: 0, failed: 0, stopped: 'cancelled' });
  assert.equal(synced, 0);
  assert.equal(calls, 1, 'signout cannot launch the second queued request');
  const retained = readDrafts(identity(), { storage: store })[0];
  assert.equal(retained.status, 'queued');
  assert.equal(retained.payload.client_request_id, ID(9));
  assert.equal(readDrafts(identity(), { storage: store })[1].attempts, 0);
});

test('strict corruption checks reject unexpected secrets, identity mismatch, invalid queue IDs, and oversized data without writes', async () => {
  const baseline = storage();
  await queued(identity(), baseline);
  const key = getDraftScope(identity()).key;
  const raw = baseline.getItem(key);
  const mutate = (callback) => { const value = JSON.parse(raw); callback(value); return JSON.stringify(value); };
  const badValues = [
    '{broken JSON', 'null', '[]',
    mutate((data) => { data.version = 2; }),
    mutate((data) => { data.user_id = 'user-b'; }),
    mutate((data) => { data.records[0].payload.farm_id = 'farm-b'; }),
    mutate((data) => { data.records[0].payload.client_request_id = ID(2); }),
    mutate((data) => { data.records[0].payload.token = 'secret'; }),
    mutate((data) => { data.records[0].payload.inputs.sensor.password = 'secret'; }),
    mutate((data) => { data.records[0].attempts = -1; }),
    mutate((data) => { data.records[0].error = 'arbitrary response'; }),
    mutate((data) => { data.records[0].created_at = 'not-a-date'; }),
    mutate((data) => { data.records.push(data.records[0]); }),
    mutate((data) => { data.records = Array(MAX_DRAFTS + 1).fill(data.records[0]); }),
    mutate((data) => { data.records[0].payload.batch_id = 'x'.repeat(MAX_RECORD_BYTES); }),
    ' '.repeat(MAX_STORAGE_BYTES),
  ];
  for (const bad of badValues) {
    const store = storage();
    store.setItem(key, bad);
    let calls = 0;
    const api = async () => { calls += 1; };
    assert.throws(() => readDrafts(identity(), { storage: store }), (error) => error.code === 'corrupt');
    await assert.rejects(syncQueuedDrafts({ identity: identity(), storage: store, api, online: true }), (error) => error.code === 'corrupt');
    assert.equal(calls, 0);
    assert.equal(store.getItem(key), bad);
  }
});

test('snapshots strip nested secrets and reject invalid numbers and foreign farms', () => {
  const input = form();
  input.inputs.sensor.token = 'TOKEN';
  input.inputs.nir.password = 'PASSWORD';
  input.inputs.vision.photo = 'data:image/png;base64,PHOTO';
  input.inputs.extra = { apiResponse: 'RESPONSE' };
  input.client_request_id = 'old-request-id';
  const snapshot = snapshotDraftForm(input, identity());
  assert.deepEqual(Object.keys(snapshot).sort(), ['batch_id', 'farm_id', 'inputs', 'sample_type', 'source_mode']);
  assert.doesNotMatch(JSON.stringify(snapshot), /TOKEN|PASSWORD|PHOTO|RESPONSE|old-request-id/);
  for (const value of [NaN, Infinity, -1, 101, null, '', '62', true]) {
    const invalid = form();
    invalid.inputs.sensor.moisture_pct = value;
    assert.throws(() => snapshotDraftForm(invalid, identity()), (error) => error.code === 'validation');
  }
  for (const invalid of [
    { ...form(), farm_id: 'farm-b' },
    { ...form(), batch_id: 'x'.repeat(81) },
    { ...form(), batch_id: '  batch' },
    { ...form(), sample_type: 'unknown' },
    { ...form(), source_mode: 'unknown' },
    { ...form(), inputs: {} },
  ]) assert.throws(() => snapshotDraftForm(invalid, identity()), (error) => error.code === 'validation');
  const zero = form();
  for (const fields of Object.values(zero.inputs)) for (const key of Object.keys(fields)) fields[key] = 0;
  assert.deepEqual(snapshotDraftForm(zero, identity()).inputs, zero.inputs);
});

test('storage failures stop requests before send and stop success claims after server acceptance', async () => {
  const store = storage();
  await queued(identity(), store);
  const originalSet = store.setItem;
  let failWrites = true;
  store.setItem = function (key, value) {
    if (failWrites) throw new Error('quota');
    originalSet.call(this, key, value);
  };
  let calls = 0;
  let synced = 0;
  const api = async () => {
    calls += 1;
    failWrites = true;
    return { scan: { id: 'server-accepted', farm_id: 'farm-a' }, token: 'never-store-response' };
  };
  const options = { identity: identity(), storage: store, online: true, api, onSynced: () => { synced += 1; } };
  await assert.rejects(syncQueuedDrafts(options), (error) => error.code === 'storage');
  assert.equal(calls, 0);
  assert.equal(readDrafts(identity(), { storage: store })[0].attempts, 0);
  failWrites = false;
  await assert.rejects(syncQueuedDrafts(options), (error) => error.code === 'storage');
  assert.equal(calls, 1);
  assert.equal(synced, 0);
  const retained = readDrafts(identity(), { storage: store })[0];
  assert.equal(retained.payload.client_request_id, ID(1));
  assert.equal(retained.error, 'interrupted');
  assert.doesNotMatch(JSON.stringify(retained), /server-accepted|never-store-response/);
  failWrites = false;
  await syncQueuedDrafts({ ...options, api: async () => ({ scan: { id: 'server-accepted', farm_id: 'farm-a' } }) });
  assert.equal(synced, 1);
});

test('silently discarded writes and denied reads give storage errors', async () => {
  const silent = { getItem: () => null, setItem() {} };
  await assert.rejects(saveDraft(identity(), form(), { storage: silent, uuid: () => ID(1) }), (error) => error.code === 'storage');
  const denied = { getItem() { throw new Error('denied'); }, setItem() {} };
  assert.throws(() => readDrafts(identity(), { storage: denied }), (error) => error.code === 'storage');
});

test('repeated syncs and mutations are locked while a request is in flight', async () => {
  const store = storage();
  await queued(identity(), store);
  let finish;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  const api = async () => {
    calls += 1;
    started();
    return new Promise((resolve) => { finish = resolve; });
  };
  // Explicitly exercise the single-tab fallback independently of Web Locks.
  const options = { identity: identity(), storage: store, locks: null, online: true, api };
  const pending = syncQueuedDrafts(options);
  await ready;
  await assert.rejects(syncQueuedDrafts(options), (error) => error.code === 'busy');
  await assert.rejects(deleteDraft(identity(), ID(1), { storage: store, locks: null }), (error) => error.code === 'busy');
  finish({ scan: { id: 'scan-single', farm_id: 'farm-a' } });
  await pending;
  assert.equal(calls, 1);
  assert.deepEqual(readDrafts(identity(), { storage: store }), []);
});

test('browser lock contention and cancellation before a delayed lock never send', async () => {
  const store = storage();
  await queued(identity(), store);
  let calls = 0;
  const api = async () => { calls += 1; };
  const unavailable = { request: async (name, options, callback) => {
    assert.equal(name, getDraftScope(identity()).key);
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    return callback(null);
  } };
  await assert.rejects(syncQueuedDrafts({ identity: identity(), storage: store, api, online: true, locks: unavailable }), (error) => error.code === 'busy');
  const controller = new AbortController();
  const delayed = { request: async (_name, _options, callback) => { controller.abort(); return callback({}); } };
  const result = await syncQueuedDrafts({ identity: identity(), storage: store, api, online: true, signal: controller.signal, locks: delayed });
  assert.equal(result.stopped, 'cancelled');
  assert.equal(calls, 0);
  assert.equal(readDrafts(identity(), { storage: store })[0].attempts, 0);
});

test('scope cancellation in progress callback stops before API; reconnect is explicit', async () => {
  const store = storage();
  await queued(identity(), store);
  const controller = new AbortController();
  let calls = 0;
  const result = await syncQueuedDrafts({
    identity: identity(), storage: store, online: true, signal: controller.signal,
    onProgress: () => controller.abort(),
    api: async () => { calls += 1; },
  });
  assert.equal(result.stopped, 'cancelled');
  assert.equal(calls, 0);
  assert.equal(readDrafts(identity(), { storage: store })[0].payload.client_request_id, ID(1));
});

test('offline transition prevents the next request while recording a confirmed in-flight success', async () => {
  const store = storage();
  await queued(identity(), store, ID(1));
  await queued(identity(), store, ID(2), 'BATCH-2');
  let online = true;
  let calls = 0;
  const result = await syncQueuedDrafts({
    identity: identity(), storage: store, online: () => online,
    api: async () => { calls += 1; online = false; return { scan: { id: 'scan-1', farm_id: 'farm-a' } }; },
  });
  assert.deepEqual(result, { synced: 1, failed: 0, stopped: 'offline' });
  assert.equal(calls, 1);
  assert.equal(readDrafts(identity(), { storage: store })[0].id, ID(2));
  assert.equal(readDrafts(identity(), { storage: store })[0].attempts, 0);
});

test('onSynced receives JSON only after removal; callback failure does not replay a confirmed scan', async () => {
  const store = storage();
  await queued(identity(), store);
  let calls = 0;
  const response = { scan: { id: 'saved-scan', farm_id: 'farm-a' }, result: { arbitrary: 'not stored' } };
  const api = async () => { calls += 1; return response; };
  await assert.rejects(syncQueuedDrafts({
    identity: identity(), storage: store, online: true, api,
    onSynced: (record) => {
      assert.equal(record, response);
      assert.deepEqual(readDrafts(identity(), { storage: store }), []);
      throw new Error('parent failed to update history');
    },
  }), (error) => error.code === 'callback');
  await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
  assert.equal(calls, 1);
  assert.doesNotMatch(store.getItem(getDraftScope(identity()).key), /saved-scan|not stored/);
});

test('unconfirmed JSON and wrong-farm responses remain queued and stop subsequent requests', async () => {
  for (const response of [null, {}, { scan: { id: 'scan', farm_id: 'other-farm' } }]) {
    const store = storage();
    await queued(identity(), store, ID(1));
    await queued(identity(), store, ID(2), 'BATCH-2');
    let calls = 0;
    const result = await syncQueuedDrafts({
      identity: identity(), storage: store, online: true,
      api: async () => { calls += 1; return response; },
    });
    assert.equal(result.failed, 1);
    assert.equal(calls, 1);
    assert.equal(readDrafts(identity(), { storage: store })[0].error, 'response');
    assert.equal(readDrafts(identity(), { storage: store })[1].attempts, 0);
  }
});

test('unknown identity never sends, different farms do not sync each other, and failed queues survive requeue', async () => {
  const store = storage();
  await queued(identity(), store);
  let calls = 0;
  const api = async () => { calls += 1; throw Object.assign(new Error('denied'), { status: 403 }); };
  await assert.rejects(syncQueuedDrafts({ identity: null, storage: store, online: true, api }), (error) => error.code === 'identity');
  const otherFarm = await syncQueuedDrafts({ identity: identity('user-a', 'farm-b'), storage: store, online: true, api });
  assert.equal(otherFarm.synced, 0);
  assert.equal(calls, 0);
  await syncQueuedDrafts({ identity: identity(), storage: store, online: true, api });
  const failed = readDrafts(identity(), { storage: store })[0];
  assert.equal(failed.error, 'auth');
  await queueDraft(identity(), failed.id, { storage: store });
  assert.deepEqual(readDrafts(identity(), { storage: store })[0], failed);
});

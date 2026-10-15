import test from 'node:test';
import assert from 'node:assert/strict';
import { getDraftScope, queueDraft, readDrafts, saveDraft, syncQueuedDrafts } from './drafts.js';
import {
  getOfflineStatusKey, OFFLINE_STATUS_PREFIX, OfflineStatusError,
  readLastSyncedAt, recordConfirmedSync, validSyncTimestamp,
} from './offline-status.js';

const identity = (user = 'user-a', farm = 'farm-a', role = 'owner') => ({
  user: { id: user, username: 'PRIVATE NAME', role }, farm: { id: farm, name: 'PRIVATE FARM NAME' },
});
const session = identity();
const firstTime = '2026-10-15T08:00:00.000Z';
const secondTime = '2026-10-15T09:00:00.000Z';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const form = {
  farm_id: 'farm-a', batch_id: 'BATCH-1', sample_type: 'silage', source_mode: 'manual',
  inputs: {
    sensor: { moisture_pct: 62, ph: 4.2, temperature_c: 24, humidity_pct: 68 },
    nir: { protein_pct: 8.8, dry_matter_pct: 38, fiber_pct: 28 },
    vision: { mold_score: 0.08, color_anomaly: 0.05, surface_damage: 0.02 },
  },
};
function memoryStorage(values = new Map()) {
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
async function queue(store, n = 1) {
  await saveDraft(session, form, { storage: store, uuid: () => id(n) });
  await queueDraft(session, id(n), { storage: store });
}
const confirmation = () => ({ scan: { id: 'server-scan', farm_id: 'farm-a' }, password: 'SECRET', photo: 'PHOTO', names: ['PRIVATE'] });

test('missing metadata stays unknown without writes, and opaque user/farm keys are isolated', () => {
  const storage = memoryStorage();
  assert.equal(readLastSyncedAt(session, { storage }), null);
  assert.equal(storage.values.size, 0);
  const key = getOfflineStatusKey(session);
  assert.ok(key.startsWith(OFFLINE_STATUS_PREFIX));
  assert.notEqual(key, getDraftScope(session).key);
  assert.notEqual(key, getOfflineStatusKey(identity('user-b')));
  assert.notEqual(key, getOfflineStatusKey(identity('user-a', 'farm-b')));
  assert.notEqual(getOfflineStatusKey(identity('a","b', 'cc')), getOfflineStatusKey(identity('a', 'b","cc')));
  assert.doesNotMatch(key, /PRIVATE/);
  assert.throws(() => readLastSyncedAt(null, { storage }));
});

test('only minimal canonical metadata persists across refresh; drafts and unrelated keys are untouched', async () => {
  const storage = memoryStorage();
  await queue(storage);
  storage.setItem('unrelated', 'preserve');
  const before = new Map(storage.values);
  assert.equal(recordConfirmedSync(session, { storage, now: firstTime, response: confirmation() }), firstTime);
  assert.deepEqual(JSON.parse(storage.getItem(getOfflineStatusKey(session))), { version: 1, last_synced_at: firstTime });
  for (const [key, value] of before) assert.equal(storage.getItem(key), value);
  assert.equal(readLastSyncedAt(session, { storage: memoryStorage(storage.values) }), firstTime);
  assert.equal(readLastSyncedAt(identity('user-b'), { storage }), null);
  assert.equal(readLastSyncedAt(identity('user-a', 'farm-b'), { storage }), null);
  assert.doesNotMatch(storage.getItem(getOfflineStatusKey(session)), /SECRET|PHOTO|PRIVATE|server-scan|farm-a|user-a/);
  // A backwards clock cannot replace a later, already recorded confirmation.
  assert.equal(recordConfirmedSync(session, { storage, now: 0 }), firstTime);
});

test('timestamps must be finite canonical ISO strings, not arbitrary values or normalized invalid dates', () => {
  assert.equal(validSyncTimestamp(firstTime), true);
  assert.equal(validSyncTimestamp('1970-01-01T00:00:00.000Z'), true);
  for (const value of [null, undefined, 0, {}, '', 'invalid', '2026-10-15', '2026-02-30T08:00:00.000Z', '2026-10-15T08:00:00Z', '+010000-01-01T00:00:00.000Z']) {
    assert.equal(validSyncTimestamp(value), false, String(value));
  }
});

test('corrupt, oversized, extra-field metadata is never overwritten or cleared', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'keep');
  for (const raw of ['{broken', 'null', '[]', '1', ' '.repeat(129),
    JSON.stringify({ version: 2, last_synced_at: firstTime }),
    JSON.stringify({ version: 1, last_synced_at: 'not-a-date' }),
    JSON.stringify({ version: 1, last_synced_at: firstTime, token: 'SECRET' }),
    JSON.stringify({ last_synced_at: firstTime }),
  ]) {
    storage.setItem(getOfflineStatusKey(session), raw);
    assert.throws(() => readLastSyncedAt(session, { storage }), OfflineStatusError);
    assert.throws(() => recordConfirmedSync(session, { storage, now: secondTime }), OfflineStatusError);
    assert.equal(storage.getItem(getOfflineStatusKey(session)), raw);
    assert.equal(storage.getItem('unrelated'), 'keep');
  }
});

test('denied access, quota, silent writes and read-back failures cannot report persisted time', () => {
  const denied = { getItem() { throw new Error('PRIVATE denial'); }, setItem() {} };
  assert.throws(() => readLastSyncedAt(session, { storage: denied }), OfflineStatusError);
  assert.throws(() => recordConfirmedSync(session, { storage: denied }), OfflineStatusError);
  for (const setItem of [() => { throw new Error('PRIVATE quota'); }, () => {}]) {
    const storage = { getItem: () => null, setItem };
    assert.throws(() => recordConfirmedSync(session, { storage }), (error) => error instanceof OfflineStatusError && !error.message.includes('PRIVATE'));
    assert.equal(readLastSyncedAt(session, { storage }), null);
  }
  const storage = memoryStorage();
  storage.setItem = () => { storage.getItem = () => { throw new Error('read-back denied'); }; };
  assert.throws(() => recordConfirmedSync(session, { storage }), OfflineStatusError);
});

test('unavailable browser storage and throwing localStorage getter are handled with fixed text', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SECRET'); } });
    assert.throws(() => readLastSyncedAt(session), OfflineStatusError);
    assert.throws(() => recordConfirmedSync(session), OfflineStatusError);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('viewers/unknown roles cannot write metadata; cancelled identities do not write', () => {
  const storage = memoryStorage();
  for (const role of ['viewer', 'operator', 'unknown', 'read-only']) {
    assert.equal(readLastSyncedAt(identity('user-a', 'farm-a', role), { storage }), null);
    assert.throws(() => recordConfirmedSync(identity('user-a', 'farm-a', role), { storage }), OfflineStatusError);
  }
  const controller = new AbortController();
  controller.abort();
  assert.equal(recordConfirmedSync(session, { storage, signal: controller.signal }), null);
  assert.equal(recordConfirmedSync(session, { storage, isCurrent: () => false }), null);
  assert.equal(storage.values.size, 0);
  assert.equal(recordConfirmedSync(identity('user-a', 'farm-a', 'member'), { storage, now: firstTime }), firstTime);
});

test('empty/offline/failed/unconfirmed queues never invent a confirmation', async () => {
  const storage = memoryStorage();
  const options = {
    identity: session, storage, online: true, api: async () => ({}),
    onSynced: () => recordConfirmedSync(session, { storage, now: firstTime }),
  };
  await syncQueuedDrafts(options);
  assert.equal(readLastSyncedAt(session, { storage }), null);
  await queue(storage);
  await syncQueuedDrafts({ ...options, online: false });
  assert.equal(readLastSyncedAt(session, { storage }), null);
  await syncQueuedDrafts(options);
  assert.equal(readLastSyncedAt(session, { storage }), null);
  await syncQueuedDrafts({ ...options, api: async () => { throw new Error('network'); } });
  assert.equal(readLastSyncedAt(session, { storage }), null);
  assert.equal(readDrafts(session, { storage }).length, 1);
});

test('confirmation time is recorded only after durable removal; failed removal keeps the same ID without metadata', async () => {
  const storage = memoryStorage();
  await queue(storage);
  const originalSet = storage.setItem;
  let confirmed = 0;
  await assert.rejects(syncQueuedDrafts({
    identity: session, storage, online: true,
    api: async () => {
      storage.setItem = (key, value) => {
        if (key === getDraftScope(session).key) throw new Error('removal blocked');
        originalSet(key, value);
      };
      return confirmation();
    },
    onSynced: () => { confirmed += 1; recordConfirmedSync(session, { storage, now: firstTime }); },
  }), (error) => error.code === 'storage');
  assert.equal(confirmed, 0);
  assert.equal(readLastSyncedAt(session, { storage }), null);
  assert.equal(readDrafts(session, { storage })[0].payload.client_request_id, id(1));
  storage.setItem = originalSet;
  await syncQueuedDrafts({
    identity: session, storage, online: true, api: async () => confirmation(),
    onSynced: () => {
      assert.deepEqual(readDrafts(session, { storage }), []);
      recordConfirmedSync(session, { storage, now: firstTime });
    },
  });
  assert.equal(readLastSyncedAt(session, { storage }), firstTime);
});

test('partial success records the latest completed upload even if a later record fails or throws', async () => {
  for (const failure of ['network', 'storage']) {
    const storage = memoryStorage();
    await queue(storage, 1);
    await queue(storage, 2);
    await queue(storage, 3);
    const originalSet = storage.setItem;
    let calls = 0;
    let successes = 0;
    const pending = syncQueuedDrafts({
      identity: session, storage, online: true,
      api: async () => {
        calls += 1;
        if (calls === 3) {
          if (failure === 'network') throw new Error('network');
          storage.setItem = (key, value) => {
            if (key === getDraftScope(session).key) throw new Error('cannot remove third record');
            originalSet(key, value);
          };
        }
        return confirmation();
      },
      onSynced: () => {
        successes += 1;
        assert.equal(readDrafts(session, { storage }).length, 3 - successes);
        recordConfirmedSync(session, { storage, now: successes === 1 ? firstTime : secondTime });
      },
    });
    if (failure === 'storage') await assert.rejects(pending, (error) => error.code === 'storage');
    else assert.equal((await pending).failed, 1);
    assert.equal(successes, 2);
    assert.equal(readLastSyncedAt(session, { storage }), secondTime);
    assert.equal(readDrafts(session, { storage })[0].id, id(3));
  }
});

test('metadata write failure after confirmation never replays the scan or suppresses the response', async () => {
  const storage = memoryStorage();
  await queue(storage);
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === getOfflineStatusKey(session)) throw new Error('metadata quota');
    originalSet(key, value);
  };
  let calls = 0;
  let parentUpdates = 0;
  let metadataError = false;
  const options = {
    identity: session, storage, online: true,
    api: async () => { calls += 1; return confirmation(); },
    onSynced: (response) => {
      assert.deepEqual(readDrafts(session, { storage }), []);
      try { recordConfirmedSync(session, { storage, now: firstTime }); } catch { metadataError = true; }
      assert.deepEqual(response, confirmation());
      parentUpdates += 1;
    },
  };
  assert.equal((await syncQueuedDrafts(options)).synced, 1);
  assert.equal(metadataError, true);
  assert.equal(parentUpdates, 1);
  assert.equal(readLastSyncedAt(session, { storage }), null);
  assert.equal((await syncQueuedDrafts(options)).synced, 0);
  assert.equal(calls, 1);
});

test('a late response after identity cancellation cannot update either account’s metadata', async () => {
  const storage = memoryStorage();
  await queue(storage, 1);
  await queue(storage, 2);
  const controller = new AbortController();
  let calls = 0;
  const result = await syncQueuedDrafts({
    identity: session, storage, online: true, signal: controller.signal,
    api: async () => { calls += 1; controller.abort(); return confirmation(); },
    onSynced: () => assert.fail('cancelled confirmation cannot be published or persisted'),
  });
  assert.equal(result.stopped, 'cancelled');
  assert.equal(calls, 1);
  assert.equal(readLastSyncedAt(session, { storage }), null);
  assert.equal(readLastSyncedAt(identity('user-b'), { storage }), null);
  assert.equal(readDrafts(session, { storage }).length, 2);
});

test('confirmed timestamp survives a failing parent callback without replaying the completed upload', async () => {
  const storage = memoryStorage();
  await queue(storage);
  let calls = 0;
  const options = {
    identity: session, storage, online: true,
    api: async () => { calls += 1; return confirmation(); },
    onSynced: () => {
      recordConfirmedSync(session, { storage, now: firstTime });
      throw new Error('history update failed');
    },
  };
  await assert.rejects(syncQueuedDrafts(options), (error) => error.code === 'callback');
  assert.equal(readLastSyncedAt(session, { storage }), firstTime);
  await syncQueuedDrafts(options);
  assert.equal(calls, 1);
});

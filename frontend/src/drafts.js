/**
 * Local readings only. Identity must come from the parent's authenticated session.
 * No credentials, photos, identity display names, or API responses are persisted.
 *
 * readDrafts/loadDraft are synchronous; saveDraft/queueDraft/deleteDraft are async.
 * All accept { storage, locks }; saveDraft also accepts { uuid, now } for tests.
 * Editing is copy-on-load + save-as-new: a queued payload can never be replaced.
 */
export const DRAFTS_PREFIX = 'nutriscan:readings-drafts:v1:';
export const MAX_DRAFTS = 20;
export const MAX_RECORD_BYTES = 4096;
export const MAX_STORAGE_BYTES = 64 * 1024;

export class DraftsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DraftsError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new DraftsError(code, message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORM_KEYS = ['farm_id', 'batch_id', 'sample_type', 'source_mode', 'inputs'];
const INPUT_RANGES = {
  sensor: { moisture_pct: [0, 100], ph: [0, 14], temperature_c: [-20, 80], humidity_pct: [0, 100] },
  nir: { protein_pct: [0, 100], dry_matter_pct: [0, 100], fiber_pct: [0, 100] },
  vision: { mold_score: [0, 1], color_anomaly: [0, 1], surface_damage: [0, 1] },
};
const FAILURE_MESSAGES = Object.freeze({
  interrupted: 'The last attempt was interrupted. Retry uses the same request ID.',
  network: 'The scan could not be confirmed. Retry uses the same request ID.',
  response: 'The server response could not confirm this scan. Retry uses the same request ID.',
  conflict: 'The server reported a conflict (409). This queued payload is unchanged. Check scan history before retrying.',
  validation: 'The server rejected these readings (400/422). Load a copy, correct it, and save a new draft.',
  auth: 'The server denied this request (401/403). Sign in with permission for this farm before retrying.',
  server: 'The server could not accept the scan. The unchanged payload remains queued.',
});

export function draftFailureMessage(code) {
  return FAILURE_MESSAGES[code] || '';
}

function validText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function identityId(value, min, max) {
  const id = Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  return validText(id, min, max) ? id : null;
}

export function getDraftScope(identity) {
  const userId = identityId(identity?.user?.id, 1, 128);
  const farmId = identityId(identity?.farm?.id, 2, 80);
  const role = typeof identity?.user?.role === 'string' ? identity.user.role.trim().toLowerCase() : '';
  if (!userId || !farmId || !role) {
    fail('identity', 'Sign in and select a farm to use local drafts.');
  }
  return {
    userId, farmId, role,
    // JSON array avoids delimiter collisions between user and farm identifiers.
    key: DRAFTS_PREFIX + JSON.stringify([userId, farmId]),
    writable: !['viewer', 'readonly', 'read-only', 'read_only'].includes(role),
  };
}

function writableScope(identity) {
  const scope = getDraftScope(identity);
  if (!scope.writable) fail('readonly', 'Viewer access is read-only. Drafts cannot be saved, queued, deleted, or synced.');
  return scope;
}

function snapshotForm(form, farmId) {
  const submittedFarmId = Number.isSafeInteger(form?.farm_id) && form.farm_id >= 0 ? String(form.farm_id) : form?.farm_id;
  if (!isObject(form) || submittedFarmId !== farmId) {
    fail('validation', 'The readings must belong to the selected farm.');
  }
  if (!validText(form.batch_id, 2, 80)) {
    fail('validation', 'Batch ID must contain 2–80 characters without surrounding whitespace or control characters.');
  }
  if (!['feed', 'silage'].includes(form.sample_type) || !['manual', 'mobile', 'esp32'].includes(form.source_mode)) {
    fail('validation', 'Choose a valid sample type and input source.');
  }
  const inputs = {};
  for (const [group, fields] of Object.entries(INPUT_RANGES)) {
    inputs[group] = {};
    for (const [field, [min, max]] of Object.entries(fields)) {
      const value = form.inputs?.[group]?.[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        fail('validation', 'Readings must be finite numbers within the form limits. Complete every reading before saving.');
      }
      inputs[group][field] = value;
    }
  }
  return { farm_id: farmId, batch_id: form.batch_id, sample_type: form.sample_type, source_mode: form.source_mode, inputs };
}

export function snapshotDraftForm(form, identity) {
  return snapshotForm(form, getDraftScope(identity).farmId);
}

function storageFor(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (target && typeof target.getItem === 'function' && typeof target.setItem === 'function') return target;
  } catch { /* Browser privacy/security settings can throw on property access. */ }
  fail('storage', 'Local draft storage is unavailable. Nothing can be saved or synced until storage is available.');
}

function rawRead(storage, key) {
  try { return storage.getItem(key); } catch {
    fail('storage', 'Local drafts could not be read. Check browser storage access and retry.');
  }
}

function exactKeys(value, keys) {
  if (!isObject(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Unexpected stored fields');
  }
}

function validateForm(form, farmId, queuedId) {
  exactKeys(form, queuedId ? [...FORM_KEYS, 'client_request_id'] : FORM_KEYS);
  exactKeys(form.inputs, Object.keys(INPUT_RANGES));
  for (const [group, fields] of Object.entries(INPUT_RANGES)) exactKeys(form.inputs[group], Object.keys(fields));
  snapshotForm(form, farmId);
  if (queuedId && form.client_request_id !== queuedId) throw new Error('Mismatched request ID');
}

function validateRecords(records, scope) {
  if (!Array.isArray(records) || records.length > MAX_DRAFTS) throw new Error('Invalid record count');
  const ids = new Set();
  for (const record of records) {
    if (!isObject(record) || !UUID.test(record.id) || ids.has(record.id)) throw new Error('Invalid draft ID');
    ids.add(record.id);
    if (typeof record.created_at !== 'string' || new Date(record.created_at).toISOString() !== record.created_at) {
      throw new Error('Invalid timestamp');
    }
    if (record.status === 'draft') {
      exactKeys(record, ['id', 'created_at', 'status', 'form']);
      validateForm(record.form, scope.farmId);
    } else if (record.status === 'queued') {
      exactKeys(record, ['id', 'created_at', 'status', 'payload', 'attempts', 'error']);
      validateForm(record.payload, scope.farmId, record.id);
      if (!Number.isSafeInteger(record.attempts) || record.attempts < 0
        || (record.error !== null && !Object.hasOwn(FAILURE_MESSAGES, record.error))) throw new Error('Invalid queue state');
    } else {
      throw new Error('Invalid status');
    }
    if (JSON.stringify(record).length * 2 > MAX_RECORD_BYTES) throw new Error('Oversized record');
  }
}

function readSnapshot(storage, scope) {
  const raw = rawRead(storage, scope.key);
  if (raw === null) return { raw, records: [] };
  try {
    if (typeof raw !== 'string' || raw.length * 2 > MAX_STORAGE_BYTES) throw new Error('Oversized storage');
    const data = JSON.parse(raw);
    exactKeys(data, ['version', 'user_id', 'farm_id', 'records']);
    if (data.version !== 1 || data.user_id !== scope.userId || data.farm_id !== scope.farmId) throw new Error('Invalid scope');
    validateRecords(data.records, scope);
    return { raw, records: data.records };
  } catch {
    fail('corrupt', 'Local draft data is invalid or too large. It has been left untouched. Recover or clear this account/farm draft key in browser storage before retrying.');
  }
}

function writeSnapshot(storage, scope, previous, records) {
  if (records.length > MAX_DRAFTS) fail('limit', 'This account and farm already have 20 local drafts. Delete a draft or sync queued readings first.');
  validateRecords(records, scope);
  const raw = JSON.stringify({ version: 1, user_id: scope.userId, farm_id: scope.farmId, records });
  if (raw.length * 2 > MAX_STORAGE_BYTES) fail('limit', 'Local drafts exceed the storage size limit. Delete a draft before saving another.');
  if (rawRead(storage, scope.key) !== previous.raw) {
    fail('changed', 'Local drafts changed in another tab. Refresh the draft list and retry.');
  }
  try { storage.setItem(scope.key, raw); } catch {
    fail('storage', 'Local draft changes could not be saved. Browser storage may be full or blocked. No successful save or sync can be confirmed; retry with the same queued draft.');
  }
  if (rawRead(storage, scope.key) !== raw) {
    fail('storage', 'Local draft changes could not be verified. Refresh the list before retrying; a queued scan may already have reached the server.');
  }
}

// In-process lock covers repeated clicks and multiple mounted panels. Web Locks
// also serialize tabs when supported. Without Web Locks, API idempotency is the
// duplicate-scan guard; localStorage's read/check/write is not an atomic CAS.
const activeScopes = new WeakMap();
const localLeaseOwners = new WeakMap();
const LOCK_TTL_MS = 120000;

function localLockKey(scope) {
  return `${DRAFTS_PREFIX}lock:${JSON.stringify([scope.userId, scope.farmId])}`;
}

function lockToken() {
  try { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; } catch { return `${Date.now()}-${Math.random()}`; }
}

async function withLocalStorageLease(storage, scope, options, task) {
  const key = localLockKey(scope);
  const token = lockToken();
  const ttl = Number.isSafeInteger(options.lockTtlMs) && options.lockTtlMs > 0 ? options.lockTtlMs : LOCK_TTL_MS;
  const now = Date.now();
  let existing;
  const raw = rawRead(storage, key);
  try { existing = raw ? JSON.parse(raw) : null; } catch { fail('busy', 'Another tab is using drafts for this account and farm. Wait and retry.'); }
  let owners = localLeaseOwners.get(storage);
  if (!owners) { owners = new Map(); localLeaseOwners.set(storage, owners); }
  const ownStaleLease = existing?.token && existing.token === owners.get(key);
  if (existing?.token && Number.isFinite(existing.expires) && existing.expires > now && !ownStaleLease) {
    fail('busy', 'Drafts are busy in another tab. Wait for the current action, then retry.');
  }
  const lease = JSON.stringify({ token, expires: now + ttl });
  try { storage.setItem(key, lease); } catch {
    fail('storage', 'Draft locking could not be saved. No draft was sent or changed. Retry when browser storage is available.');
  }
  if (rawRead(storage, key) !== lease) fail('storage', 'Local draft locking could not be verified. No draft was sent or changed. Retry when browser storage is available.');
  owners.set(key, token);
  let lost = false;
  const heartbeat = globalThis.setInterval?.(() => {
    try {
      const current = rawRead(storage, key);
      let currentToken = null;
      try { currentToken = current ? JSON.parse(current)?.token : null; } catch { /* The lease was replaced or corrupted. */ }
      if (currentToken !== token) { lost = true; return; }
      const refreshed = JSON.stringify({ token, expires: Date.now() + ttl });
      storage.setItem(key, refreshed);
      if (rawRead(storage, key) !== refreshed) lost = true;
    } catch { lost = true; }
  }, Math.max(1000, Math.floor(ttl / 3)));
  try {
    const result = await task();
    if (lost) fail('busy', 'Draft lock ownership changed in another tab. Refresh drafts before retrying.');
    return result;
  } finally {
    if (heartbeat !== undefined) globalThis.clearInterval?.(heartbeat);
    try {
      let currentToken = null;
      try { currentToken = JSON.parse(rawRead(storage, key) || 'null')?.token; } catch { /* Leave an invalid/stolen lease untouched. */ }
      if (currentToken === token) {
        if (typeof storage.removeItem === 'function') storage.removeItem(key);
        else storage.setItem(key, '');
        owners.delete(key);
      }
    } catch { /* A stale lease expires safely. */ }
  }
}

async function withScopeLock(storage, scope, options, task) {
  let keys = activeScopes.get(storage);
  if (!keys) { keys = new Set(); activeScopes.set(storage, keys); }
  const busy = () => fail('busy', 'Drafts are busy in this or another tab. Wait for the current action, then retry.');
  if (keys.has(scope.key)) busy();
  keys.add(scope.key);
  try {
    const locks = options.locks === undefined ? globalThis.navigator?.locks : options.locks;
    const lockedTask = () => withLocalStorageLease(storage, scope, options, task);
    return await (locks?.request
      ? locks.request(scope.key, { mode: 'exclusive', ifAvailable: true }, async (lock) => lock ? lockedTask() : busy())
      : lockedTask());
  } finally {
    keys.delete(scope.key);
  }
}

function checkCurrent(options) {
  if (options.signal?.aborted || (options.isCurrent && !options.isCurrent())) {
    fail('cancelled', 'The draft action stopped because the active account, farm, or session changed.');
  }
}

export function readDrafts(identity, options = {}) {
  return readSnapshot(storageFor(options.storage), getDraftScope(identity)).records;
}

export function loadDraft(identity, id, options = {}) {
  const record = readDrafts(identity, options).find((item) => item.id === id);
  if (!record) fail('missing', 'This draft no longer exists. Refresh the list.');
  // Rebuild from the allowlist, dropping client_request_id even for queued loads.
  return snapshotDraftForm(record.form || record.payload, identity);
}

export async function saveDraft(identity, form, options = {}) {
  const scope = writableScope(identity);
  const snapshot = snapshotForm(form, scope.farmId);
  const storage = storageFor(options.storage);
  return withScopeLock(storage, scope, options, () => {
    checkCurrent(options);
    const previous = readSnapshot(storage, scope);
    if (previous.records.length >= MAX_DRAFTS) fail('limit', 'This account and farm already have 20 local drafts. Delete a draft or sync queued readings first.');
    let id;
    try { id = options.uuid ? options.uuid() : globalThis.crypto.randomUUID(); } catch {
      fail('uuid', 'A secure draft ID could not be generated. Use a browser with secure UUID support.');
    }
    if (!UUID.test(id) || previous.records.some((record) => record.id === id)) fail('uuid', 'A unique draft ID could not be generated. Retry saving.');
    const time = new Date(typeof options.now === 'function' ? options.now() : (options.now ?? Date.now()));
    if (!Number.isFinite(time.getTime())) fail('validation', 'The draft timestamp is invalid. Check the device clock and retry.');
    const record = { id, created_at: time.toISOString(), status: 'draft', form: snapshot };
    writeSnapshot(storage, scope, previous, [...previous.records, record]);
    return clone(record);
  });
}

async function changeDraft(identity, id, options, update) {
  const scope = writableScope(identity);
  const storage = storageFor(options.storage);
  return withScopeLock(storage, scope, options, () => {
    checkCurrent(options);
    const previous = readSnapshot(storage, scope);
    const record = previous.records.find((item) => item.id === id);
    if (!record) fail('missing', 'This draft no longer exists. Refresh the list.');
    const replacement = update(record);
    const records = previous.records.flatMap((item) => item.id === id ? (replacement ? [replacement] : []) : [item]);
    writeSnapshot(storage, scope, previous, records);
    return replacement ? clone(replacement) : null;
  });
}

export function queueDraft(identity, id, options = {}) {
  return changeDraft(identity, id, options, (record) => record.status === 'queued' ? record : {
    id: record.id, created_at: record.created_at, status: 'queued',
    payload: { ...record.form, client_request_id: record.id }, attempts: 0, error: null,
  });
}

export function deleteDraft(identity, id, options = {}) {
  return changeDraft(identity, id, options, () => null);
}

function submissionFailure(error) {
  // Persist only fixed codes, never server detail/error.message (which can echo
  // request headers, credentials, or arbitrary API response content).
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  if (status === 401 || status === 403) return 'auth';
  return status >= 400 ? 'server' : 'network';
}

/**
 * Explicit sync only; never runs on reconnect or identity discovery.
 *
 * options: { identity, api, storage?, locks?, online: boolean | () => boolean,
 *   signal?, isCurrent?: () => boolean, onSynced?: (apiRecord) => void | Promise,
 *   onProgress?: ({ id, status: 'syncing' | 'failed' | 'synced' }) => void | Promise }
 * api('/api/v1/scans', { method: 'POST', body: object }) must reject non-2xx
 * responses, preferably with numeric error.status. Success is { scan: { id,
 * farm_id }, ... }; the full JSON is delivered to onSynced, never to storage.
 *
 * Returns { synced, failed, stopped: null | 'offline' | 'cancelled' | 'failed' }.
 * Stops at the first failed request. Storage/lock/callback errors reject with
 * DraftsError. An unabortable in-flight request may complete remotely: cancellation
 * ignores its response and leaves the SAME queued ID for an idempotent retry.
 */
export async function syncQueuedDrafts(options) {
  const { identity, api, onSynced, onProgress } = options;
  const scope = writableScope(identity);
  const summary = { synced: 0, failed: 0, stopped: null };
  const active = () => !options.signal?.aborted && (!options.isCurrent || options.isCurrent());
  const connected = () => (typeof options.online === 'function' ? options.online() : options.online) === true;
  const stop = () => {
    if (!active()) summary.stopped = 'cancelled';
    else if (!connected()) summary.stopped = 'offline';
    return summary.stopped !== null;
  };
  if (stop()) return summary;
  if (typeof api !== 'function') fail('api', 'The scan API is unavailable. Queued readings have not been sent.');
  const storage = storageFor(options.storage);
  const notify = async (callback, value) => {
    if (active() && callback) {
      try { await callback(value); } catch {
        fail('callback', 'The draft list or scan history could not be updated. Refresh both before retrying; a confirmed scan will not be queued again.');
      }
    }
  };
  return withScopeLock(storage, scope, options, async () => {
    if (stop()) return summary;
    const ids = readSnapshot(storage, scope).records.filter((record) => record.status === 'queued').map((record) => record.id);
    for (const id of ids) {
      if (stop()) break;
      const before = readSnapshot(storage, scope);
      const record = before.records.find((item) => item.id === id && item.status === 'queued');
      if (!record) continue;
      const attempt = { ...record, attempts: record.attempts + 1, error: 'interrupted' };
      // This write and read-back MUST succeed before even the first API call.
      writeSnapshot(storage, scope, before, before.records.map((item) => item.id === id ? attempt : item));
      await notify(onProgress, { id, status: 'syncing' });
      if (stop()) break;
      let response;
      let failure = null;
      try {
        // A fresh object prevents the parent API adapter from mutating storage.
        response = await api('/api/v1/scans', { method: 'POST', body: clone(record.payload) });
      } catch (error) {
        failure = submissionFailure(error);
      }
      if (!active()) { summary.stopped = 'cancelled'; break; }
      if (!failure && (!validText(response?.scan?.id, 1, 128) || response.scan.farm_id !== scope.farmId)) {
        failure = 'response';
      }
      const after = readSnapshot(storage, scope);
      const current = after.records.find((item) => item.id === id);
      // Another tab without Web Locks may have already completed/deleted it.
      if (!current) continue;
      if (current.status !== 'queued' || JSON.stringify(current.payload) !== JSON.stringify(record.payload)) {
        fail('changed', 'The queued payload changed in another tab. Sync stopped; refresh the draft list.');
      }
      if (failure) {
        writeSnapshot(storage, scope, after, after.records.map((item) => item.id === id ? { ...current, error: failure } : item));
        summary.failed += 1;
        summary.stopped = 'failed';
        await notify(onProgress, { id, status: 'failed' });
        break;
      }
      // A storage failure here must NOT announce success or call onSynced.
      // The server may already have accepted it; the persisted ID makes retry safe.
      writeSnapshot(storage, scope, after, after.records.filter((item) => item.id !== id));
      summary.synced += 1;
      await notify(onSynced, response);
      await notify(onProgress, { id, status: 'synced' });
    }
    return summary;
  });
}

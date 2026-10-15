import { getDraftScope } from './drafts.js';

// Separate from the tested drafts/queue schema. Only opaque scope IDs occur in
// the key; the value contains a version and one locally observed confirmation time.
export const OFFLINE_STATUS_PREFIX = 'nutriscan:offline-status:v1:';
const MAX_METADATA_LENGTH = 128;

export class OfflineStatusError extends Error {
  constructor() {
    super('The last confirmed sync time could not be read or saved. Local sync metadata was left untouched where possible.');
    this.name = 'OfflineStatusError';
  }
}

export function getOfflineStatusKey(identity) {
  const { userId, farmId } = getDraftScope(identity);
  return OFFLINE_STATUS_PREFIX + JSON.stringify([userId, farmId]);
}

export function validSyncTimestamp(value) {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function storageFor(storage) {
  const target = storage ?? globalThis.localStorage;
  if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') throw new OfflineStatusError();
  return target;
}

function readMetadata(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return { raw, lastSyncedAt: null };
  if (typeof raw !== 'string' || raw.length > MAX_METADATA_LENGTH) throw new OfflineStatusError();
  const data = JSON.parse(raw);
  if (!data || Array.isArray(data) || Object.keys(data).length !== 2
    || !Object.hasOwn(data, 'version') || data.version !== 1
    || !Object.hasOwn(data, 'last_synced_at') || !validSyncTimestamp(data.last_synced_at)) throw new OfflineStatusError();
  return { raw, lastSyncedAt: data.last_synced_at };
}

export function readLastSyncedAt(identity, options = {}) {
  const key = getOfflineStatusKey(identity);
  try { return readMetadata(storageFor(options.storage), key).lastSyncedAt; } catch { throw new OfflineStatusError(); }
}

/**
 * Call ONLY from syncQueuedDrafts.onSynced: that callback follows both a valid
 * server confirmation and durable, read-back-verified local queue removal.
 * Never infer a confirmation from connectivity, an empty queue, or onProgress.
 * Accepts no API response. Failure must not put the confirmed scan back in queue.
 */
export function recordConfirmedSync(identity, options = {}) {
  const scope = getDraftScope(identity);
  if (!['owner', 'member'].includes(scope.role)) throw new OfflineStatusError();
  if (options.signal?.aborted || (options.isCurrent && !options.isCurrent())) return null;
  try {
    const storage = storageFor(options.storage);
    const key = getOfflineStatusKey(identity);
    const previous = readMetadata(storage, key);
    const now = typeof options.now === 'function' ? options.now() : (options.now ?? Date.now());
    const timestamp = new Date(now).toISOString();
    if (!validSyncTimestamp(timestamp)) throw new OfflineStatusError();
    // Keep the latest valid confirmation if the device clock moved backwards.
    const lastSyncedAt = previous.lastSyncedAt && previous.lastSyncedAt > timestamp ? previous.lastSyncedAt : timestamp;
    const raw = JSON.stringify({ version: 1, last_synced_at: lastSyncedAt });
    if (storage.getItem(key) !== previous.raw) throw new OfflineStatusError();
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new OfflineStatusError();
    return lastSyncedAt;
  } catch { throw new OfflineStatusError(); }
}

// Private evidence is fetched only by explicit picker actions. Never read metadata.url.
export const MAX_SHARE_PHOTOS = 5;
export const MAX_SHARE_PHOTO_BYTES = 5 * 1024 * 1024;
export const SHARE_PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export const shareEvidenceMessages = {
  unsupported: 'Photo preparation is unavailable on this browser. File, Blob and local preview URL support are required.',
  list: 'Saved photos could not be loaded. Try choosing photos again.',
  prepare: 'Selected photos could not be prepared. Try again; no photos are attached.',
  invalid: 'Each selected photo must be a nonempty JPEG, PNG or WebP file of 5 MiB or smaller.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have permission to view these photos.',
};

function validId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200
    || /^[.]{1,2}$|[\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}

export function shareEvidencePath(scanId, photoId) {
  if (!validId(scanId) || (photoId !== undefined && !validId(photoId))) throw new Error('Invalid evidence identifier.');
  return `/api/v1/scans/${encodeURIComponent(scanId)}/photos${photoId === undefined ? '' : `/${encodeURIComponent(photoId)}`}`;
}

function photoName(filename, type) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  const base = String(filename).split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N} _()-]/gu, '_').trim().slice(0, 100) || 'photo';
  return `${base}.${extension}`;
}

export function safeShareEvidenceMetadata(value) {
  if (!Array.isArray(value)) throw new Error('Invalid evidence list.');
  const photos = [];
  const ids = new Set();
  for (const item of value) {
    if (!validId(item?.id) || ids.has(item.id) || typeof item.filename !== 'string'
      || !SHARE_PHOTO_TYPES.includes(item.content_type)) continue;
    ids.add(item.id);
    photos.push({ id: item.id, filename: photoName(item.filename, item.content_type), content_type: item.content_type });
    if (photos.length === MAX_SHARE_PHOTOS) break;
  }
  return photos;
}

export function supportsShareEvidence(browser = globalThis.window) {
  return typeof browser?.File === 'function' && typeof browser?.Blob === 'function'
    && typeof browser?.URL?.createObjectURL === 'function' && typeof browser?.URL?.revokeObjectURL === 'function';
}

const emptyState = () => ({ status: 'idle', photos: [], selectedIds: [], prepared: [], error: null });
const errorCode = (error, fallback) => error?.status === 401 ? 'unauthorized' : error?.status === 403 ? 'forbidden' : fallback;

/**
 * One mounted source/account scope. api is the authenticated JSON/Blob adapter.
 * load() requests metadata; select(ids) discards prepared bytes; prepare() fetches
 * only selected local routes. onChange(files, { selectedCount, ready }) invalidates
 * the parent's preview. dispose() aborts, ignores late responses and revokes URLs.
 * No storage, external requests, sharing or automatic photo downloads occur here.
 */
export function createShareEvidenceSession({ api, scanId, browser = globalThis.window, onState = () => {}, onChange = () => {} }) {
  let active = true;
  let revision = 0;
  let controller;
  let preparing = [];
  let state = emptyState();

  function release(items) {
    for (const item of items) {
      try { browser?.URL?.revokeObjectURL(item.url); } catch { /* Continue releasing the remaining URLs. */ }
    }
    items.length = 0;
  }
  function cancel() {
    revision += 1;
    controller?.abort();
    controller = null;
    release(preparing);
    preparing = [];
  }
  function begin() {
    cancel();
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    return { revision, signal: controller?.signal };
  }
  const current = (work) => active && work.revision === revision && !work.signal?.aborted;
  function dropPrepared() {
    release(state.prepared);
    state = { ...state, prepared: [] };
  }
  function emit() {
    if (!active) return;
    onState({ ...state, prepared: [...state.prepared] });
    onChange(state.prepared.map((item) => item.file), {
      selectedCount: state.selectedIds.length,
      ready: !['loading', 'preparing'].includes(state.status) && state.selectedIds.length === state.prepared.length,
    });
  }
  async function request(path, options) {
    if (typeof api !== 'function') throw new Error('Missing authenticated API.');
    return api(path, { method: 'GET', credentials: 'include', ...options });
  }

  async function load() {
    if (!active) return;
    const work = begin();
    dropPrepared();
    state = { ...emptyState(), status: 'loading' };
    emit();
    try {
      const value = await request(shareEvidencePath(scanId), { signal: work.signal });
      if (!current(work)) return;
      state = { ...state, status: 'ready', photos: safeShareEvidenceMetadata(value) };
    } catch (error) {
      if (!current(work)) return;
      state = { ...state, status: 'error', error: errorCode(error, 'list') };
    }
    emit();
  }

  function select(ids) {
    if (!active || !Array.isArray(ids)) return;
    const selectedIds = state.photos.filter((photo) => ids.includes(photo.id)).map((photo) => photo.id);
    cancel();
    dropPrepared();
    state = { ...state, status: 'ready', selectedIds, error: null };
    emit();
  }

  async function prepare() {
    if (!active || !state.selectedIds.length) return;
    const work = begin();
    dropPrepared();
    state = { ...state, status: 'preparing', error: null };
    emit();
    const owned = [];
    preparing = owned;
    try {
      if (!supportsShareEvidence(browser)) throw Object.assign(new Error(), { evidenceCode: 'unsupported' });
      const selected = state.photos.filter((photo) => state.selectedIds.includes(photo.id));
      for (const photo of selected) {
        const blob = await request(shareEvidencePath(scanId, photo.id), { responseType: 'blob', signal: work.signal });
        if (!current(work)) return;
        const type = String(blob?.type || '').toLowerCase();
        if (!(blob instanceof browser.Blob) || !Number.isFinite(blob.size) || blob.size <= 0
          || blob.size > MAX_SHARE_PHOTO_BYTES || !SHARE_PHOTO_TYPES.includes(type)) {
          throw Object.assign(new Error(), { evidenceCode: 'invalid' });
        }
        const file = new browser.File([blob], photoName(photo.filename, type), { type });
        const url = browser.URL.createObjectURL(file);
        owned.push({ id: photo.id, file, url });
      }
      if (!current(work)) return;
      state = { ...state, status: 'prepared', prepared: [...owned] };
      owned.length = 0; // Ownership transfers to this scope until select/clear/dispose.
    } catch (error) {
      if (!current(work)) return;
      const fallback = ['unsupported', 'invalid'].includes(error?.evidenceCode) ? error.evidenceCode : 'prepare';
      state = { ...state, status: 'ready', error: errorCode(error, fallback) };
    } finally {
      release(owned); // Also releases partially prepared batches and stale results.
      if (preparing === owned) preparing = [];
    }
    if (current(work)) emit();
  }

  function clear() {
    if (!active) return;
    cancel();
    dropPrepared();
    state = emptyState();
    emit();
  }
  function dispose() {
    active = false;
    cancel();
    dropPrepared();
    state = emptyState();
  }
  return { load, select, prepare, clear, dispose };
}

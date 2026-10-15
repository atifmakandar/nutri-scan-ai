import React, { useEffect, useRef, useState } from 'react';
import './auth-photo.css';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

const fallbackText = (value, values = {}) => String(value).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => (
  Object.hasOwn(values, key) && values[key] != null ? String(values[key]) : match
));

function text(t, value, values) {
  return typeof t === 'function' ? t(value, values) : fallbackText(value, values);
}

export function validatePhotoFile(file) {
  if (!file || typeof file !== 'object') return 'Choose a photo to upload.';
  if (!Number.isFinite(file.size) || file.size > MAX_PHOTO_BYTES) return 'Photo must be 5 MiB or smaller.';
  if (!PHOTO_MIME_TYPES.includes(String(file.type || '').toLowerCase())) return 'Only JPEG, PNG, and WebP photos are accepted.';
  return '';
}

export function photoEndpoint(scanId, photoId) {
  return `/api/v1/scans/${encodeURIComponent(String(scanId))}/photos${photoId == null ? '' : `/${encodeURIComponent(String(photoId))}`}`;
}

function isPhoto(value) {
  return Boolean(value && typeof value === 'object' && typeof value.id === 'string' && typeof value.filename === 'string');
}

function safeErrorMessage(error, fallback) {
  if (error?.status === 401) return 'Your session has expired. Please sign in again.';
  if (error?.status === 403) return 'You do not have permission to change photo evidence.';
  const detail = Array.isArray(error?.detail)
    ? error.detail.map((item) => item?.msg || item?.message || '').filter(Boolean).join(', ')
    : error?.detail || error?.message || '';
  return typeof detail === 'string' && detail ? detail : fallback;
}

async function requestApi(api, path, options = {}) {
  if (typeof api !== 'function') throw new Error('An API request function is required.');
  return api(path, { credentials: 'include', ...options });
}

async function fetchPhotoBlob(api, path, signal) {
  // The parent API adapter must return a Blob for responseType:'blob'. This
  // keeps the HttpOnly cookie handling and API base URL in one integration
  // point while still avoiding public/static photo URLs.
  const value = await requestApi(api, path, { method: 'GET', responseType: 'blob', signal });
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (value && typeof value.blob === 'function') return value.blob();
  if (value && typeof Blob !== 'undefined' && value.data instanceof Blob) return value.data;
  throw new Error('The photo preview could not be loaded.');
}

/**
 * Parent integration contract:
 * - api(path, options) returns parsed JSON for normal endpoints and a Blob
 *   when responseType:'blob' is supplied. It includes the backend session
 *   cookie and serializes object bodies, but leaves File bodies untouched.
 */
export default function PhotoEvidence({ api, scanId, canWrite = false, t = fallbackText }) {
  const validScan = typeof scanId === 'string' && scanId.trim().length > 0;
  const scanPath = validScan ? photoEndpoint(scanId.trim()) : '';
  const [photos, setPhotos] = useState([]);
  const [images, setImages] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(Boolean(validScan));
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (!validScan) {
      setPhotos([]);
      setImages({});
      setLoading(false);
      setError('');
      return () => { active = false; controller?.abort(); };
    }
    if (typeof api !== 'function') {
      setPhotos([]);
      setLoading(false);
      setError('An API request function is required.');
      return () => { active = false; controller?.abort(); };
    }
    setLoading(true);
    setError('');
    requestApi(api, scanPath, { signal: controller?.signal }).then((value) => {
      if (!Array.isArray(value) || value.some((photo) => !isPhoto(photo))) throw new Error('The server returned an invalid photo list.');
      if (active) setPhotos(value);
    }).catch((requestError) => {
      if (active && requestError?.name !== 'AbortError') setError(safeErrorMessage(requestError, 'Photos could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      controller?.abort();
    };
  }, [api, scanPath, validScan]);

  useEffect(() => {
    let active = true;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const ownedUrls = [];
    const initial = Object.fromEntries(photos.map((photo) => [photo.id, { status: 'loading' }]));
    setImages(initial);

    if (!photos.length) return () => { active = false; controller?.abort(); };

    Promise.all(photos.map(async (photo) => {
      try {
        const blob = await fetchPhotoBlob(api, photoEndpoint(scanId.trim(), photo.id), controller?.signal);
        if (!active) return [photo.id, { status: 'cancelled' }];
        if (typeof globalThis.URL?.createObjectURL !== 'function') throw new Error('Photo previews require browser URL support.');
        const url = globalThis.URL.createObjectURL(blob);
        ownedUrls.push(url);
        return [photo.id, { status: 'ready', url }];
      } catch (requestError) {
        if (requestError?.name === 'AbortError' || !active) return [photo.id, { status: 'cancelled' }];
        return [photo.id, { status: 'error', message: safeErrorMessage(requestError, 'Photo preview unavailable.') }];
      }
    })).then((results) => {
      if (active) setImages(Object.fromEntries(results));
    });

    return () => {
      active = false;
      controller?.abort();
      for (const url of ownedUrls) globalThis.URL?.revokeObjectURL?.(url);
    };
  }, [api, photos, scanId]);

  function chooseFile(event) {
    const file = event.target.files?.[0] || null;
    const validation = validatePhotoFile(file);
    setError(validation);
    setSelectedFile(validation ? null : file);
  }

  async function uploadPhoto(event) {
    event.preventDefault();
    if (!validScan || !canWrite || !selectedFile || uploading) return;
    const validation = validatePhotoFile(selectedFile);
    setError(validation);
    if (validation) return;
    const file = selectedFile;
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = '';
    setUploading(true);
    setError('');
    try {
      const photo = await requestApi(api, scanPath, {
        method: 'POST',
        body: file,
        headers: { 'content-type': file.type.toLowerCase(), 'x-filename': file.name || 'photo' },
      });
      if (!isPhoto(photo)) throw new Error('The server did not return a valid photo.');
      setPhotos((current) => [photo, ...current.filter((item) => item.id !== photo.id)]);
    } catch (requestError) {
      setError(safeErrorMessage(requestError, 'Photo upload failed.'));
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo) {
    if (!validScan || !canWrite || deletingId || !photo?.id) return;
    setDeletingId(photo.id);
    setError('');
    try {
      await requestApi(api, photoEndpoint(scanId.trim(), photo.id), { method: 'DELETE' });
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (requestError) {
      setError(safeErrorMessage(requestError, 'Photo could not be removed.'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="auth-photo photo-evidence" aria-labelledby="photo-evidence-title" aria-busy={loading || uploading || Boolean(deletingId)}>
      <div className="auth-photo-heading">
        <div>
          <p className="auth-photo-eyebrow">{text(t, 'Photos')}</p>
          <h2 id="photo-evidence-title">{text(t, 'Photo evidence')}</h2>
        </div>
        {validScan && <span className="auth-photo-badge">{photos.length}</span>}
      </div>
      <p className="auth-photo-notice">{text(t, 'Evidence only — photos are not analyzed by AI.')}</p>
      {!validScan && <p className="auth-photo-empty" role="status">{text(t, 'Select a saved scan to view photo evidence.')}</p>}
      {validScan && !canWrite && <p className="auth-photo-notice" role="status">{text(t, 'Viewer accounts cannot submit scans or upload photos.')}</p>}
      {validScan && <form className="auth-photo-upload" onSubmit={uploadPhoto}>
        <label className="auth-photo-field" htmlFor="photo-evidence-file">{text(t, 'Attach photo')}
          <input id="photo-evidence-file" ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={chooseFile} disabled={!canWrite || loading || uploading} />
        </label>
        {selectedFile && <p className="auth-photo-file">{selectedFile.name}</p>}
        <button className="primary-button" type="submit" disabled={!canWrite || loading || !selectedFile || uploading}>
          {text(t, uploading ? 'Uploading photo…' : 'Upload photo')}
        </button>
      </form>}
      {error && <p className="auth-photo-feedback is-error" role="alert">{text(t, error)}</p>}
      {loading && <p className="auth-photo-loading" role="status">{text(t, 'Loading…')}</p>}
      {!loading && validScan && !error && photos.length === 0 && <p className="auth-photo-empty" role="status">{text(t, 'No photo attachments.')}</p>}
      {!loading && photos.length > 0 && <ul className="auth-photo-grid">
        {photos.map((photo) => {
          const image = images[photo.id];
          return <li className="auth-photo-card" key={photo.id}>
            <div className="auth-photo-thumb">
              {image?.status === 'ready' ? <img src={image.url} alt={text(t, 'Photo for batch {batchId}', { batchId: photo.filename })} /> : image?.status === 'error' ? <span role="status">{text(t, image.message)}</span> : <span role="status">{text(t, 'Loading…')}</span>}
            </div>
            <div className="auth-photo-card-footer"><span title={photo.filename}>{photo.filename}</span>{canWrite && <button className="text-button" type="button" onClick={() => deletePhoto(photo)} disabled={deletingId === photo.id}>{text(t, deletingId === photo.id ? 'Removing…' : 'Remove')}</button>}</div>
          </li>;
        })}
      </ul>}
    </section>
  );
}

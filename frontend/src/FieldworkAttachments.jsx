import React, { useEffect, useRef, useState } from 'react';
import { FieldworkFeedback } from './FieldworkControls.jsx';
import { useFieldworkAction } from './fieldwork-hooks.js';
import { fieldworkText } from './fieldwork-messages.js';
import {
  downloadFieldworkBlob, fieldworkAttachments, fieldworkError, fieldworkFilename, fieldworkPath,
  FIELDWORK_PHOTO_TYPES, validateFieldworkFile,
} from './fieldwork.js';

function usePreview(blob) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!blob || !FIELDWORK_PHOTO_TYPES.includes(blob.type)) { setPreview(null); return; }
    const url = URL.createObjectURL(blob);
    setPreview({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return preview && preview.blob === blob ? preview.url : '';
}

export default function FieldworkAttachments({ api, collection, recordId, reports = false, canWrite, online, onCount, t }) {
  const path = fieldworkPath(collection, recordId, reports ? 'reports' : 'photos');
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(Boolean(online));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState(null);
  const [view, setView] = useState(null);
  const [message, setMessage] = useState('');
  const input = useRef(null);
  const countCallback = useRef(onCount);
  countCallback.current = onCount;
  const action = useFieldworkAction();
  const localPreview = usePreview(file);
  const savedPreview = usePreview(view?.blob);
  const tr = (key, values) => fieldworkText(t, key, values);

  useEffect(() => {
    if (!online) { setLoading(false); return; }
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.resolve().then(() => api(path, { signal: controller.signal })).then((value) => {
      const metadata = fieldworkAttachments(value);
      if (active) { setItems(metadata); countCallback.current?.(metadata.length); }
    }).catch((failure) => {
      if (active && failure?.name !== 'AbortError') setError(fieldworkError(failure));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [api, path, online, revision]);

  function choose(event) {
    const selected = event.target.files?.[0];
    const validation = validateFieldworkFile(selected, reports);
    action.setError(validation); setMessage(''); setFile(validation ? null : selected);
    if (validation && input.current) input.current.value = '';
  }

  async function upload(event) {
    event.preventDefault();
    if (!canWrite || !online || !file || action.busy || !items || items.length >= 5) return;
    const selected = file;
    const metadata = await action.run(async (signal) => {
      const validation = validateFieldworkFile(selected, reports);
      if (validation) throw new Error(validation);
      const result = await api(path, {
        method: 'POST', body: selected, signal,
        headers: { 'content-type': selected.type, 'x-filename': fieldworkFilename(selected.name, selected.type) },
      });
      return fieldworkAttachments([result])[0];
    });
    if (metadata) {
      const next = [...items.filter((item) => item.id !== metadata.id), metadata];
      setItems(next); countCallback.current?.(next.length);
      setFile(null); if (input.current) input.current.value = '';
      setMessage('Attachment saved on the farm.');
    }
  }

  async function read(item) {
    if (!online || action.busy) return;
    setMessage('');
    const blob = await action.run(async (signal) => {
      const value = await api(fieldworkPath(collection, recordId, reports ? 'reports' : 'photos', item.id), {
        responseType: 'blob', signal,
      });
      if (!(value instanceof Blob)) throw new Error('The attachment could not be read.');
      const validation = validateFieldworkFile(value, reports);
      if (validation) throw new Error(validation);
      return value;
    });
    if (!blob) return;
    if (reports) {
      try {
        downloadFieldworkBlob(blob, fieldworkFilename(item.filename, blob.type));
        setMessage('Download started. Check your browser downloads.');
      } catch { action.setError('The download could not be started.'); }
    } else setView({ id: item.id, filename: item.filename, blob });
  }

  return <section className="fw-attachments" aria-label={tr(reports ? 'Private reports' : 'Private photos')} aria-busy={loading || action.busy}>
    <h4>{tr(reports ? 'Private reports' : 'Private photos')}</h4>
    <p className="fw-hint">{tr(reports ? 'Upload JPEG, PNG, WebP (up to 5 MiB) or PDF (up to 10 MiB). Reports download as attachments; open only files you trust.' : 'Photos are private evidence, not an AI assessment. JPEG, PNG, WebP up to 5 MiB.')}</p>
    <p>{tr('At most five attachments per record.')}</p>
    <button type="button" disabled={!online || loading || action.busy} onClick={() => setRevision((value) => value + 1)}>{tr('Refresh attachments')}</button>
    {loading && <p role="status">{tr('Loading attachments…')}</p>}
    <FieldworkFeedback error={error || action.error} message={message} t={t} />
    {error && <button type="button" disabled={!online || loading} onClick={() => setRevision((value) => value + 1)}>{tr('Retry attachments')}</button>}
    {!online && <p role="status">{tr('Connect to load or upload attachments.')}</p>}
    {items?.length === 0 && <p>{tr('No attachments saved.')}</p>}
    {items?.length >= 5 && <p role="status">{tr('Five attachments are already saved. The limit has been reached.')}</p>}
    <form onSubmit={upload} className="fw-upload">
      <label>{tr(reports ? 'Choose report' : 'Choose photo')}<input ref={input} type="file" accept={reports ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp'} onChange={choose} disabled={!canWrite || !online || loading || action.busy || !items || items.length >= 5} /></label>
      {file && <p>{file.name}</p>}
      {localPreview && <figure><img src={localPreview} alt={tr('Selected photo preview — not yet uploaded')} /><figcaption>{tr('Selected photo preview — not yet uploaded')}</figcaption></figure>}
      <button type="submit" disabled={!canWrite || !online || loading || action.busy || !file || !items || items.length >= 5}>{tr(action.busy ? 'Working…' : reports ? 'Upload report' : 'Upload photo')}</button>
    </form>
    <ul className="fw-attachment-list">{items?.map((item) => <li key={item.id}><span>{item.filename}</span>
      <button type="button" onClick={() => read(item)} disabled={!online || action.busy}>{tr(reports ? 'Download report: {filename}' : 'View photo: {filename}', { filename: item.filename })}</button>
    </li>)}</ul>
    {savedPreview && <figure><img src={savedPreview} alt={tr('Saved photo: {filename}', { filename: view.filename })} /><figcaption>{view.filename}</figcaption>
      <button type="button" onClick={() => setView(null)}>{tr('Close photo')}</button></figure>}
  </section>;
}

export function FieldworkAttachmentToggle(props) {
  const [open, setOpen] = useState(false);
  return <div className="fw-attachment-toggle"><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
    {fieldworkText(props.t, open ? 'Close attachments' : props.reports ? 'Reports ({count})' : 'Photos ({count})', { count: props.count ?? 0 })}
  </button>{open && <FieldworkAttachments {...props} />}</div>;
}

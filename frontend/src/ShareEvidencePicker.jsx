import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resultsText } from './farmer-results.js';
import { createShareEvidenceSession, MAX_SHARE_PHOTOS, shareEvidenceMessages } from './share-evidence.js';

export default function ShareEvidencePicker({ api, scanId, browser, t, onChange, disabled = false }) {
  const text = resultsText(t);
  const id = useId();
  const scope = useMemo(() => ({}), [api, scanId, browser, onChange]);
  const sessionRef = useRef(null);
  const [resource, setResource] = useState(null);
  useEffect(() => {
    const session = createShareEvidenceSession({ api, scanId, browser, onChange,
      onState: (state) => setResource({ scope, ...state }) });
    sessionRef.current = { scope, session };
    session.clear();
    return () => { session.dispose(); sessionRef.current = null; };
  }, [api, scanId, browser, onChange, scope]);
  const state = resource?.scope === scope ? resource : { status: 'idle', photos: [], selectedIds: [], prepared: [] };
  const session = sessionRef.current?.scope === scope ? sessionRef.current.session : null;
  const working = ['loading', 'preparing'].includes(state.status);

  return <section className="fr-evidence" aria-labelledby={`${id}-title`} aria-busy={working}>
    <h5 id={`${id}-title`}>{text('Optional photos for native sharing')}</h5>
    <p className="fr-note">{text('Photos start off. Choose saved photos, select their checkboxes, then prepare them before previewing the summary.')}</p>
    <p className="fr-external-note">{text('Selected photos go only through supported native device sharing. Copy and WhatsApp are text-only and never send photo URLs.')}</p>
    <p className="fr-note">{text('Up to {limit} saved JPEG, PNG or WebP photos; 5 MiB maximum per photo. Photos are evidence only, not AI analysis.', { limit: MAX_SHARE_PHOTOS })}</p>
    <button className="fr-button" type="button" disabled={disabled || typeof api !== 'function' || state.status === 'loading'} onClick={() => session?.load()}>{text('Choose saved photos')}</button>
    {typeof api !== 'function' && <p role="status">{text('Saved photo sharing is unavailable without the authenticated API.')}</p>}
    {state.status === 'loading' && <p role="status">{text('Loading saved photo choices…')}</p>}
    {state.error && <p role="alert">{text(shareEvidenceMessages[state.error])}</p>}
    {state.status === 'ready' && !state.error && !state.photos.length && <p role="status">{text('No saved photos are available for sharing.')}</p>}
    {state.photos.length > 0 && <fieldset disabled={disabled}>
      <legend>{text('Select photos by filename')}</legend>
      <ul className="fr-evidence-list">{state.photos.map((photo) => <li key={photo.id}>
        <label><input type="checkbox" value={photo.id} checked={state.selectedIds.includes(photo.id)} onChange={(event) => session?.select(event.target.checked
          ? [...state.selectedIds, photo.id] : state.selectedIds.filter((value) => value !== photo.id))} />{photo.filename}</label>
      </li>)}</ul>
      <button className="fr-button" type="button" disabled={!state.selectedIds.length || state.status === 'preparing'} onClick={() => session?.prepare()}>{text('Prepare selected photos')}</button>
    </fieldset>}
    {state.status === 'preparing' && <p role="status">{text('Preparing selected photos…')}</p>}
    {state.selectedIds.length > 0 && state.status !== 'prepared' && <p role="status">{text('Prepare the current selection before previewing. No photos are attached yet.')}</p>}
    {state.prepared.length > 0 && <>
      <p role="status">{text('{count} photos prepared for native sharing. Review them before sharing.', { count: state.prepared.length })}</p>
      <ul className="fr-evidence-thumbnails">{state.prepared.map((item) => <li key={item.id}>
        <img src={item.url} alt={text('Selected evidence photo: {filename}', { filename: item.file.name })} />
        <span>{item.file.name}</span>
      </li>)}</ul>
    </>}
    {state.status !== 'idle' && <button className="fr-button fr-button-quiet" type="button" disabled={disabled} onClick={() => session?.clear()}>{text('Remove photo choices — use text only')}</button>}
  </section>;
}

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  deleteDraft,
  draftFailureMessage,
  DraftsError,
  getDraftScope,
  loadDraft,
  MAX_DRAFTS,
  queueDraft,
  readDrafts,
  saveDraft,
  snapshotDraftForm,
  syncQueuedDrafts,
} from './drafts.js';
import OfflineStatus from './OfflineStatus.jsx';
import { offlineText } from './offline-messages.js';
import { getOfflineStatusKey, readLastSyncedAt, recordConfirmedSync } from './offline-status.js';
import './drafts.css';

const fallbackText = (value) => value;
const errorText = (error) => error instanceof DraftsError ? error.message : 'Local draft action failed. No saved or synced state was confirmed.';

/**
 * Parent integration contract:
 * - identity is the current authenticated { user: { id, username, role }, farm: { id, name } }.
 * - form is the live screening form; onLoad receives a sanitized form snapshot.
 * - api(path, { method, body }) receives an object body and owns JSON serialization/auth.
 *   It should reject non-2xx responses with error.status. It must not reuse/mutate body.
 * - onSynced receives the successful JSON response from POST /api/v1/scans.
 * - online is the parent's browser online state. This component never auto-syncs.
 * - t(English, replacements) may carry t.locale for supplemental translations/dates.
 * - optional onStatus receives { draftCount, queuedCount, lastSyncedAt,
 *   storageError, syncing } only on value changes. Unknown counts/time are null;
 *   draftCount excludes queued records. Time is a persisted queue-upload confirmation,
 *   not connectivity or the live form's submission time. Scope the header state by
 *   user/farm too; unmount clears the summary and a remount reports fresh status
 *   before paint. The callback does not receive API response or identity data.
 */
export default function DraftsPanel(props) {
  let scope = null;
  try { scope = getDraftScope(props.identity); } catch { /* Wait for authenticated identity. */ }
  // A scope/role change unmounts the entire old session, hiding its list in the
  // same render and invalidating its in-flight actions before the next commit.
  return <ScopedDraftsPanel key={scope ? JSON.stringify([scope.key, scope.role]) : 'signed-out'} {...props} scope={scope} />;
}

function ScopedDraftsPanel({ identity, form, onLoad, api, onSynced, onStatus, t = fallbackText, online, scope }) {
  const translate = (key, values) => offlineText(t, key, values);
  const scopeKey = scope?.key;
  const metadataKey = scopeKey ? getOfflineStatusKey(identity) : null;
  const writable = scopeKey && ['owner', 'member'].includes(scope.role);
  const [records, setRecords] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [metadataError, setMetadataError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const mounted = useRef(false);
  const running = useRef(false);
  const lifetime = useRef(null);
  const metadataWriteFailed = useRef(false);
  const reportedStatus = useRef(null);
  const latest = useRef({ online, api, onSynced, onStatus });

  useLayoutEffect(() => { latest.current = { online, api, onSynced, onStatus }; });
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.abort();
      const cleared = { draftCount: null, queuedCount: null, lastSyncedAt: null, storageError: false, syncing: false };
      const signature = JSON.stringify(cleared);
      if (reportedStatus.current !== signature) {
        reportedStatus.current = signature;
        latest.current.onStatus?.(cleared);
      }
    };
  }, []);

  function refresh() {
    if (!scopeKey) {
      setRecords(null);
      return false;
    }
    // A metadata failure does not corrupt the queue or prevent its explicit sync.
    try {
      const persistedTime = readLastSyncedAt(identity);
      setLastSyncedAt(metadataWriteFailed.current ? null : persistedTime);
      setMetadataError(metadataWriteFailed.current);
    } catch (error) {
      setLastSyncedAt(null);
      setMetadataError(true);
      setFeedback({ error: error.message });
    }
    try {
      setRecords(readDrafts(identity));
      setDraftStorageError(false);
      return true;
    } catch (error) {
      setRecords(null);
      setDraftStorageError(true);
      setFeedback({ error: errorText(error) });
      return false;
    }
  }

  useEffect(() => {
    refresh();
    const onStorage = (event) => {
      if ((event.key === scopeKey || event.key === metadataKey || event.key === null) && !running.current) {
        setFeedback(null);
        refresh();
      }
    };
    globalThis.addEventListener?.('storage', onStorage);
    return () => globalThis.removeEventListener?.('storage', onStorage);
    // This child is remounted when the scope or role changes.
  }, [scopeKey, metadataKey]);

  function actionOptions() {
    const controller = lifetime.current;
    return { signal: controller.signal, isCurrent: () => mounted.current && !controller.signal.aborted };
  }

  async function runAction(action, success, savedForm) {
    if (!mounted.current || !writable || !scopeKey || running.current) return;
    running.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await action(actionOptions());
      if (mounted.current && refresh() && success) setFeedback({ success, savedForm });
    } catch (error) {
      if (mounted.current) {
        refresh();
        if (['storage', 'corrupt'].includes(error.code)) setDraftStorageError(true);
        setFeedback({ error: errorText(error) });
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function saveCurrent() {
    runAction((options) => saveDraft(identity, form, options), 'A complete reading draft was saved on this device. Later form edits are not saved automatically.', form);
  }

  function loadRecord(id) {
    if (!scopeKey) return;
    try {
      onLoad(loadDraft(identity, id));
      setFeedback({ success: 'A copy was loaded into the form. Save it as a new draft; queued values keep their original request ID.' });
    } catch (error) { setFeedback({ error: errorText(error) }); }
  }

  function queueRecord(id) {
    runAction((options) => queueDraft(identity, id, options), 'Readings queued on this device. Use Sync now when online to send them.');
  }

  function removeRecord(id) {
    runAction((options) => deleteDraft(identity, id, options), 'Local draft deleted. This does not delete a scan already received by the server.');
  }

  async function syncNow() {
    if (!mounted.current || !writable || !scopeKey || running.current || latest.current.online !== true) {
      return;
    }
    running.current = true;
    setBusy(true);
    setSyncing(true);
    setSyncingId('all');
    setFeedback(null);
    try {
      const result = await syncQueuedDrafts({
        identity, api: latest.current.api, online: () => latest.current.online, ...actionOptions(),
        onProgress: ({ id, status }) => {
          if (status === 'syncing' && mounted.current) setSyncingId(id);
          if (status !== 'syncing' && mounted.current) setSyncingId(null);
        },
        onSynced: async (record) => {
          if (!mounted.current || lifetime.current.signal.aborted) return;
          // This callback runs per record, AFTER server confirmation and verified
          // removal. Never defer the timestamp until the whole batch succeeds.
          try {
            const timestamp = recordConfirmedSync(identity, actionOptions());
            metadataWriteFailed.current = false;
            setLastSyncedAt(timestamp);
            setMetadataError(false);
          } catch {
            // The upload is already completed. Metadata failure cannot requeue it
            // or suppress the parent's confirmed response/history update.
            metadataWriteFailed.current = true;
            setLastSyncedAt(null);
            setMetadataError(true);
          }
          refresh();
          await latest.current.onSynced?.(record);
        },
      });
      if (mounted.current && refresh()) {
        if (result.failed) setFeedback({ error: 'A queued reading was not accepted. It remains queued with the same request ID.' });
        else if (result.synced && result.stopped === 'offline') setFeedback({ error: 'Some readings were confirmed and removed, but the remaining queue stopped when the connection went offline.' });
        else if (result.synced) setFeedback({ success: 'Confirmed readings synced and removed from the local queue.' });
        else if (result.stopped === 'offline') setFeedback({ error: 'You are offline. Queued readings remain local and were not sent.' });
      }
    } catch (error) {
      if (mounted.current) {
        refresh();
        if (['storage', 'corrupt'].includes(error.code)) setDraftStorageError(true);
        setFeedback({ error: errorText(error) });
      }
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        setSyncing(false);
        setSyncingId(null);
      }
    }
  }

  const draftCount = records ? records.filter((record) => record.status === 'draft').length : null;
  const queuedCount = records ? records.filter((record) => record.status === 'queued').length : null;
  const storageError = draftStorageError || metadataError;
  const status = { draftCount, queuedCount, lastSyncedAt, storageError, syncing };
  // Depend on values, not callback identity. Inline parent callbacks/setState must
  // not cause a reporting loop; each keyed child starts with unexposed null data.
  useLayoutEffect(() => {
    const next = { draftCount, queuedCount, lastSyncedAt, storageError, syncing };
    const signature = JSON.stringify(next);
    if (reportedStatus.current === signature) return;
    reportedStatus.current = signature;
    latest.current.onStatus?.(next);
  }, [draftCount, queuedCount, lastSyncedAt, storageError, syncing]);

  let completeForm = false;
  if (writable) {
    try { snapshotDraftForm(form, identity); completeForm = true; } catch { /* Saving still validates the snapshot again. */ }
  }
  const visibleFeedback = feedback && (!feedback.savedForm || feedback.savedForm === form) ? feedback : null;
  const identityMessage = scopeKey ? null : 'Sign in and select a farm to use local readings drafts.';
  const readonlyMessage = scopeKey && !writable ? scope.role === 'viewer'
    ? 'Viewer access is read-only. You can load drafts, but cannot save, queue, delete, or sync them.'
    : 'Only authenticated owners and members can save, queue, delete, or sync readings.' : null;

  return (
    <section className="drafts-panel" aria-labelledby="drafts-title">
      <div className="drafts-panel-heading">
        <div>
          <p className="drafts-eyebrow">{translate('LOCAL ONLY')}</p>
          <h2 id="drafts-title">{translate('Saved readings')}</h2>
        </div>
        <span className="drafts-count">{records ? records.length : '—'} / {MAX_DRAFTS}</span>
      </div>
      <OfflineStatus online={online} status={status} t={t} />
      <p className="drafts-copy">{translate('Readings are stored on this device for this signed-in user and farm. Credentials, photos, and API results are never stored.')}</p>
      <p className="drafts-copy">{translate('Loading makes a copy. Save changes as a new draft with a new request ID; queued values never change. Do not queue a replacement until you have checked any uncertain earlier submission in scan history.')}</p>
      {identityMessage && <p className="drafts-notice" role="status">{translate(identityMessage)}</p>}
      {readonlyMessage && <p className="drafts-notice" role="status">{translate(readonlyMessage)}</p>}
      <p className="drafts-copy" id="drafts-save-help">{translate('The live form is not a saved draft. Only complete, valid readings can be saved; incomplete readings cannot be saved.')}</p>
      <p className="drafts-copy">{translate('Queue saved drafts, then choose Sync now to upload. Nothing is sent automatically.')}</p>
      {metadataWriteFailed.current && <p className="drafts-feedback drafts-feedback-error" role="alert">{translate('Upload confirmed and removed from the local queue, but its sync time could not be saved. The confirmed reading will not be sent again.')}</p>}
      {visibleFeedback && <p className={`drafts-feedback${visibleFeedback.error ? ' drafts-feedback-error' : ''}`} role={visibleFeedback.error ? 'alert' : 'status'}>{translate(visibleFeedback.error || visibleFeedback.success)}</p>}
      <div className="drafts-actions">
        <button type="button" className="primary-button drafts-sync-button" onClick={syncNow} disabled={!writable || typeof api !== 'function' || online !== true || busy || draftStorageError || !queuedCount}>
          {syncing ? translate('Syncing…') : translate('Sync now')}
        </button>
        <button type="button" className="secondary-button" onClick={saveCurrent} aria-describedby="drafts-save-help" disabled={!writable || !completeForm || busy || draftStorageError || !records || records.length >= MAX_DRAFTS}>
          {translate('Save draft')}
        </button>
        <button type="button" className="text-button" disabled={!scopeKey || busy} onClick={() => { setFeedback(null); metadataWriteFailed.current = false; refresh(); }}>{translate('Refresh drafts')}</button>
      </div>
      {!records ? null : records.length === 0 ? (
        <p className="drafts-empty">{translate('No local reading drafts for this user and farm.')}</p>
      ) : (
        <ul className="drafts-list">
          {records.map((record) => (
            <li className="drafts-item" key={record.id}>
              <div className="drafts-item-main">
                <strong>{record.form?.batch_id || record.payload?.batch_id}</strong>
                <span>{translate((record.form || record.payload).sample_type === 'silage' ? 'Silage' : 'Cattle feed')} · {new Date(record.created_at).toLocaleString()}</span>
                {record.status === 'queued' && <small>{translate('Request ID')}: {record.id}</small>}
              </div>
              <span className={`drafts-status drafts-status-${record.error ? 'failed' : record.status}`}>
                {syncingId === record.id ? translate('Syncing…') : translate(record.status === 'draft' ? 'Draft' : record.error ? 'Failed' : 'Queued')}
              </span>
              {record.error && syncingId !== record.id && <span className="drafts-item-error">{translate(draftFailureMessage(record.error))}</span>}
              <div className="drafts-item-actions">
                <button type="button" className="text-button" onClick={() => loadRecord(record.id)} disabled={busy || typeof onLoad !== 'function'}>{translate('Load')}</button>
                {record.status === 'draft' && <button type="button" className="text-button" onClick={() => queueRecord(record.id)} disabled={!writable || busy || draftStorageError}>{translate('Queue')}</button>}
                <button type="button" className="text-button drafts-delete" onClick={() => removeRecord(record.id)} disabled={!writable || busy || draftStorageError}>{translate('Delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

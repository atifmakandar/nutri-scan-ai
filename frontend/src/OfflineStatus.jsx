import React from 'react';
import { offlineText } from './offline-messages.js';
import { validSyncTimestamp } from './offline-status.js';
import './drafts.css';

/** Reusable in a header (compact) or panel; online is connection state only. */
export function OfflineStatus({ online, status = {}, t, compact = false }) {
  const text = (key, values) => offlineText(t, key, values);
  const { draftCount, queuedCount, lastSyncedAt, storageError, syncing } = status || {};
  const countsKnown = Number.isSafeInteger(draftCount) && draftCount >= 0 && Number.isSafeInteger(queuedCount) && queuedCount >= 0;
  const timestamp = validSyncTimestamp(lastSyncedAt) ? lastSyncedAt : null;
  const timeMessage = storageError || (lastSyncedAt != null && !timestamp) ? 'Last confirmed sync time is unavailable.'
    : countsKnown ? 'No confirmed sync time recorded on this device.' : 'Checking last confirmed sync time…';
  let time;
  if (timestamp) {
    try { time = new Date(timestamp).toLocaleString(t?.locale || undefined); }
    catch { time = new Date(timestamp).toLocaleString(); }
  }

  return (
    <div className={`offline-status${compact ? ' offline-status-compact' : ''}${online === true ? ' offline-status-online' : ' offline-status-offline'}`} role="status" aria-live="polite" aria-atomic="true">
      <strong className="offline-status-connection"><span className="offline-status-dot" aria-hidden="true" />{text(online === true ? 'Online' : 'Offline — readings stay on this device.')}</strong>
      {online === true && <p>{text('Connection indicator only — online does not mean readings have been uploaded.')}</p>}
      <p>{text('Only saved drafts and queued readings are kept locally. Unsaved form edits are not stored automatically.')}</p>
      {countsKnown ? <div className="offline-status-counts"><span>{text('{count} saved local drafts', { count: draftCount })}</span><span>{text('{count} queued — waiting for upload', { count: queuedCount })}</span></div>
        : <p>{text(storageError ? 'Local draft counts are unavailable.' : 'Checking local drafts…')}</p>}
      {syncing && <p className="offline-status-syncing">{text('Syncing queued readings… Confirmation is pending for each upload.')}</p>}
      <p className="offline-status-time">{timestamp ? <time dateTime={timestamp}>{text('Last confirmed upload: {time}', { time })}</time> : text(timeMessage)}</p>
      {storageError && <p className="offline-status-error">{text('Local storage could not be fully verified. Counts or sync time may be unavailable. Refresh drafts to retry.')}</p>}
    </div>
  );
}

export default OfflineStatus;

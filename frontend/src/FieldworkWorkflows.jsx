import React, { useEffect, useRef, useState } from 'react';
import { FieldworkAttachmentToggle } from './FieldworkAttachments.jsx';
import { FieldworkDetails, FieldworkFeedback, FieldworkField, FieldworkList } from './FieldworkControls.jsx';
import { FieldworkBatchForm, FieldworkObservationForm, FieldworkReminderForm, FieldworkTestingForm } from './FieldworkForms.jsx';
import { useFieldworkAction, useFieldworkDay, useFieldworkPage } from './fieldwork-hooks.js';
import { fieldworkText } from './fieldwork-messages.js';
import { printFieldworkRequest } from './fieldwork-print.js';
import {
  FIELDWORK_CHECKS, fieldworkLocalDay, fieldworkPath, fieldworkRecord, fieldworkTestingTransition,
  groupFieldworkReminders, matchingFieldworkRecord,
} from './fieldwork.js';

const sampleLabel = (sample) => sample === 'silage' ? 'Silage' : 'Feed';
const statusLabel = (status) => ({ requested: 'Requested', collected: 'Collected', report_received: 'Report received', pending: 'Pending', completed: 'Completed' }[status] || 'Not recorded');

function useWorkflow(props, collection) {
  const resource = useFieldworkPage(props.api, collection, props.farmId, props.online, {}, props.refreshKey);
  const [recent, setRecent] = useState(null);
  const [message, setMessage] = useState('');
  function saved(record) {
    setRecent(record); setMessage('Saved on the farm.');
    resource.replace(record); resource.setOffset(0); resource.refresh();
  }
  function changed(record) {
    resource.replace(record);
    setRecent((current) => current?.id === record.id ? record : current);
  }
  return { resource, saved, changed, recent: recent && !resource.data?.items.some((item) => item.id === recent.id) ? recent : null, message };
}

export function FieldworkObservationSummary({ observation, t }) {
  const tr = (key) => fieldworkText(t, key);
  return <>
    <FieldworkDetails t={t} values={[
      ['Observed on', observation.observed_on],
      ...FIELDWORK_CHECKS.map(([key, label]) => [label, tr({ yes: 'Yes', no: 'No', unknown: 'Unknown' }[observation[key]] || 'Unknown')]),
      ['Notes', observation.notes],
    ]} />
    <p className="fw-hint">{tr('If anything is concerning or unknown, ask a qualified adviser or testing provider to review it. These observations do not establish feeding safety.')}</p>
  </>;
}

export function FieldworkBatchCard({ batch, api, online, canWrite, onUseBatch, onEdit, t }) {
  const tr = (key, values) => fieldworkText(t, key, values);
  const [photoCount, setPhotoCount] = useState(batch.photo_count);
  useEffect(() => setPhotoCount(batch.photo_count), [batch.photo_count]);
  const latestScan = matchingFieldworkRecord(batch, batch.latest_scan, true) ? batch.latest_scan : null;
  const latestObservation = matchingFieldworkRecord(batch, batch.latest_observation) && batch.latest_observation?.kind === 'observation_only' ? batch.latest_observation : null;
  return <article className="fw-card">
    <h3>{batch.name || batch.batch_id}</h3>
    <FieldworkDetails t={t} values={[
      ['Batch ID', batch.batch_id], ['Sample type', tr(sampleLabel(batch.sample_type))], ['Storage location', batch.storage_location],
      ['Prepared on', batch.prepared_on], ['Opened on', batch.opened_on],
      ['Quantity', batch.quantity == null ? null : `${batch.quantity}${batch.quantity_unit ? ` ${tr(batch.quantity_unit)}` : ''}`], ['Notes', batch.notes],
    ]} />
    <div className="fw-actions">
      <button className="fw-primary" type="button" disabled={!canWrite || typeof onUseBatch !== 'function'} onClick={() => onUseBatch?.(batch)}>{tr('Use this batch')}</button>
      <button type="button" disabled={!canWrite || !online} onClick={() => onEdit(batch)}>{tr('Edit metadata')}</button>
    </div>
    <p className="fw-hint">{tr('Uses this batch identity only. Enter fresh readings; old readings are not filled in.')}</p>
    <section className="fw-snapshot"><h4>{tr('Latest matching screening')}</h4>
      {latestScan ? <><FieldworkDetails t={t} values={[
        ['Saved at', latestScan.scan.created_at],
        ['Prototype score', Number.isFinite(latestScan.result?.quality_score) ? `${latestScan.result.quality_score} / 100` : null],
      ]} /><p>{tr('Prototype screening only, not a laboratory result or safety guarantee.')}</p></> : <p>{tr('No matching screening saved.')}</p>}
    </section>
    <section className="fw-snapshot"><h4>{tr('Latest matching observation')}</h4>
      {latestObservation ? <FieldworkObservationSummary observation={latestObservation} t={t} /> : <p>{tr('No matching observation saved.')}</p>}
    </section>
    <FieldworkAttachmentToggle api={api} collection="batches" recordId={batch.id} count={photoCount} onCount={setPhotoCount} online={online} canWrite={canWrite} t={t} />
  </article>;
}

export function FieldworkBatches(props) {
  const workflow = useWorkflow(props, 'batches');
  const [editing, setEditing] = useState(null);
  const formRegion = useRef(null);
  useEffect(() => { if (editing) { formRegion.current?.focus(); formRegion.current?.scrollIntoView?.({ block: 'nearest' }); } }, [editing]);
  const card = (batch) => <FieldworkBatchCard key={batch.id} {...props} batch={batch} onEdit={setEditing} />;
  return <>
    <div ref={formRegion} tabIndex={-1} className="fw-editor"><FieldworkBatchForm key={editing?.id || 'create'} {...props} initial={editing}
      onSaved={(record) => { workflow.saved(record); setEditing(null); }} onCancel={editing ? () => setEditing(null) : undefined} /></div>
    <FieldworkFeedback message={workflow.message} t={props.t} />
    {workflow.recent && card(workflow.recent)}
    <FieldworkList resource={workflow.resource} online={props.online} empty="No batches saved yet. Create a batch to keep its records together." t={props.t}>
      {(items) => <div className="fw-cards">{items.map(card)}</div>}
    </FieldworkList>
  </>;
}

export function FieldworkObservationCard({ observation, api, online, canWrite, t }) {
  const [count, setCount] = useState(observation.photo_count);
  useEffect(() => setCount(observation.photo_count), [observation.photo_count]);
  return <article className="fw-card">
    <h3>{observation.batch_id} · {fieldworkText(t, sampleLabel(observation.sample_type))}</h3>
    <p className="fw-badge">{fieldworkText(t, 'Observation only — no screening score')}</p>
    <FieldworkObservationSummary observation={observation} t={t} />
    <FieldworkAttachmentToggle api={api} collection="observations" recordId={observation.id} count={count} onCount={setCount} online={online} canWrite={canWrite} t={t} />
  </article>;
}

export function FieldworkObservations(props) {
  const workflow = useWorkflow(props, 'observations');
  const card = (observation) => <FieldworkObservationCard key={observation.id} {...props} observation={observation} />;
  return <>
    <FieldworkObservationForm {...props} onSaved={workflow.saved} />
    <FieldworkFeedback message={workflow.message} t={props.t} />
    {workflow.recent && card(workflow.recent)}
    <FieldworkList resource={workflow.resource} online={props.online} empty="No quick observations saved yet." t={props.t}>
      {(items) => <div className="fw-cards">{items.map(card)}</div>}
    </FieldworkList>
  </>;
}

export function FieldworkReminderCard({ reminder, api, farmId, online, canWrite, onChanged, t }) {
  const action = useFieldworkAction();
  const tr = (key) => fieldworkText(t, key);
  async function toggle() {
    if (!canWrite || !online) return;
    const saved = await action.run(async (signal) => fieldworkRecord(await api(fieldworkPath('reminders', reminder.id, 'status'), {
      method: 'POST', body: { status: reminder.status === 'completed' ? 'pending' : 'completed' }, signal,
    }), farmId));
    if (saved) onChanged(saved);
  }
  return <article className="fw-card" aria-busy={action.busy}>
    <h4>{reminder.title}</h4><p className="fw-badge">{tr(statusLabel(reminder.status))}</p>
    <FieldworkDetails t={t} values={[
      ['Due on', reminder.due_on], ['Batch ID', reminder.batch_id],
      ['Sample type', reminder.sample_type ? tr(sampleLabel(reminder.sample_type)) : null],
      ['Completed at', reminder.completed_at], ['Notes', reminder.notes],
    ]} />
    <button type="button" disabled={!canWrite || !online || action.busy} onClick={toggle}>{tr(action.busy ? 'Saving…' : reminder.status === 'completed' ? 'Reopen task' : 'Mark complete')}</button>
    <FieldworkFeedback error={action.error} t={t} />
  </article>;
}

export function FieldworkReminders(props) {
  const workflow = useWorkflow(props, 'reminders');
  const today = useFieldworkDay();
  const card = (reminder) => <FieldworkReminderCard key={reminder.id} {...props} reminder={reminder} onChanged={workflow.changed} />;
  return <>
    <p className="fw-notice">{fieldworkText(props.t, 'In-app tasks only. No background notifications or SMS are sent.')}</p>
    <FieldworkReminderForm {...props} onSaved={workflow.saved} />
    <FieldworkFeedback message={workflow.message} t={props.t} />
    {workflow.recent && card(workflow.recent)}
    <p>{fieldworkText(props.t, 'Your local day: {date}. Groups cover this page only.', { date: today })}</p>
    <FieldworkList resource={workflow.resource} online={props.online} empty="No reminders saved yet." t={props.t}>
      {(items) => Object.entries(groupFieldworkReminders(items, today)).map(([label, reminders]) => reminders.length > 0 && <section className="fw-group" key={label}>
        <h3>{fieldworkText(props.t, label)}</h3><div className="fw-cards">{reminders.map(card)}</div>
      </section>)}
    </FieldworkList>
  </>;
}

export function FieldworkCollectionChecklist({ t }) {
  return <fieldset className="fw-collection"><legend>{fieldworkText(t, 'Collection checklist')}</legend>
    <p>{fieldworkText(t, 'Preparation aid only. These ticks are not saved or sent.')}</p>
    {[
      'Ask your chosen qualified testing provider which sample, container, quantity, storage, and delivery method they require.',
      'Label the sample with its batch ID, sample type, and collection date; keep different batches separate.',
      'Arrange collection and contact the provider yourself. Follow their instructions before collecting.',
    ].map((key) => <label key={key}><input type="checkbox" />{fieldworkText(t, key)}</label>)}
  </fieldset>;
}

export function FieldworkTestingCard({ request, api, farmId, online, canWrite, onChanged, t }) {
  const [date, setDate] = useState(fieldworkLocalDay);
  const [reportCount, setReportCount] = useState(request.report_count);
  const [printError, setPrintError] = useState('');
  const action = useFieldworkAction();
  const tr = (key) => fieldworkText(t, key);
  useEffect(() => { setReportCount(request.report_count); }, [request.report_count]);
  async function advance(event) {
    event.preventDefault();
    if (!online || !canWrite) return;
    const saved = await action.run(async (signal) => {
      const body = fieldworkTestingTransition(request, date, reportCount);
      return fieldworkRecord(await api(fieldworkPath('testing-requests', request.id, 'status'), { method: 'POST', body, signal }), farmId);
    });
    if (saved) onChanged(saved);
  }
  return <article className="fw-card" aria-busy={action.busy}>
    <h3>{request.batch_id} · {tr(sampleLabel(request.sample_type))}</h3><p className="fw-badge">{tr(statusLabel(request.status))}</p>
    <p className="fw-hint">{tr('Farm tracking only. This request is not sent or booked automatically.')}</p>
    <FieldworkDetails t={t} values={[
      ['Requested on', request.requested_on], ['Collected on', request.collected_on], ['Report received on', request.report_received_on],
      ['Contact name', request.contact_name], ['Contact details', request.contact_details], ['Notes', request.notes],
    ]} />
    <button type="button" onClick={() => {
      setPrintError('');
      try { printFieldworkRequest(request, t); } catch (error) { setPrintError(error.message); }
    }}>{tr('Print saved request')}</button>
    <FieldworkFeedback error={printError} t={t} />
    <FieldworkAttachmentToggle api={api} collection="testing-requests" recordId={request.id} reports count={reportCount} onCount={setReportCount} online={online} canWrite={canWrite} t={t} />
    {request.status !== 'report_received' && <form className="fw-status-form" onSubmit={advance}>
      <fieldset disabled={!online || !canWrite || action.busy}><legend>{tr('Update saved request')}</legend>
        <FieldworkField label={request.status === 'requested' ? 'Collected on' : 'Report received on'} name="transition_date" type="date" value={date} onChange={(_, value) => setDate(value)} required min={request.collected_on || request.requested_on || undefined} max="9999-12-31" t={t} />
        {request.status === 'collected' && reportCount < 1 && <p>{tr('Upload a report before marking it received.')}</p>}
        <button type="submit" disabled={request.status === 'collected' && reportCount < 1}>{tr(action.busy ? 'Saving…' : request.status === 'requested' ? 'Mark collected' : 'Mark report received')}</button>
      </fieldset>
    </form>}
    <FieldworkFeedback error={action.error} t={t} />
  </article>;
}

export function FieldworkTesting(props) {
  const workflow = useWorkflow(props, 'testing-requests');
  const card = (request) => <FieldworkTestingCard key={request.id} {...props} request={request} onChanged={workflow.changed} />;
  return <>
    <p className="fw-notice">{fieldworkText(props.t, 'Farm tracking only. This request is not sent or booked automatically.')}</p>
    <FieldworkCollectionChecklist t={props.t} />
    <FieldworkTestingForm {...props} onSaved={workflow.saved} />
    <FieldworkFeedback message={workflow.message} t={props.t} />
    {workflow.recent && card(workflow.recent)}
    <FieldworkList resource={workflow.resource} online={props.online} empty="No testing requests saved yet." t={props.t}>
      {(items) => <div className="fw-cards">{items.map(card)}</div>}
    </FieldworkList>
  </>;
}

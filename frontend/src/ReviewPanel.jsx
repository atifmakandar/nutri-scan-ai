import React, { useState } from 'react';
import { FieldworkDetails, FieldworkFeedback, FieldworkField, FieldworkList } from './FieldworkControls.jsx';
import { useFieldworkAction, useFieldworkPage } from './fieldwork-hooks.js';
import { fieldworkPath, fieldworkRecord } from './fieldwork.js';
import { fieldworkText } from './fieldwork-messages.js';

const trFor = (t) => (key, values) => fieldworkText(t, key, values);

function DeviceRegistrationForm({ api, farmId, online, canWrite, t, onSaved }) {
  const [draft, setDraft] = useState({ device_id: '', label: '', device_type: '', notes: '' });
  const [error, setError] = useState('');
  const action = useFieldworkAction();
  const tr = trFor(t);
  function update(name, value) { setDraft((current) => ({ ...current, [name]: value })); setError(''); action.setError(''); }
  async function submit(event) {
    event.preventDefault();
    if (!draft.device_id.trim()) { setError('Enter a device ID.'); return; }
    const saved = await action.run(async (signal) => fieldworkRecord(await api('/api/v1/devices', { method: 'POST', body: draft, signal }), farmId));
    if (saved) { setDraft({ device_id: '', label: '', device_type: '', notes: '' }); onSaved(saved); }
  }
  return <form className="fw-form" onSubmit={submit} noValidate aria-label={tr('Register a device')} aria-busy={action.busy}>
    <fieldset disabled={!canWrite || !online || action.busy}>
      <legend>{tr('Register a device')}</legend>
      <p className="fw-wide fw-hint">{tr('Local registry only. Registration does not prove live connectivity, accuracy, or calibration.')}</p>
      <div className="fw-form-grid">
        <FieldworkField label="Device ID" name="device_id" value={draft.device_id} onChange={update} required maxLength={120} t={t} />
        <FieldworkField label="Device label" name="label" value={draft.label} onChange={update} maxLength={120} t={t} />
        <FieldworkField label="Device type" name="device_type" value={draft.device_type} onChange={update} maxLength={80} t={t} />
        <FieldworkField label="Notes" name="notes" value={draft.notes} onChange={update} maxLength={4000} multiline t={t} />
      </div>
      <button className="fw-primary" type="submit">{tr(action.busy ? 'Saving…' : 'Register device')}</button>
    </fieldset>
    {error && <p className="fw-error" role="alert">{tr(error)}</p>}
    <FieldworkFeedback error={action.error} t={t} />
  </form>;
}

function DeviceCard({ device, api, farmId, online, canWrite, t, onChanged }) {
  const [status, setStatus] = useState(device.latest_health?.status || 'unknown');
  const [notes, setNotes] = useState('');
  const action = useFieldworkAction();
  const tr = trFor(t);
  async function reportHealth(event) {
    event.preventDefault();
    const saved = await action.run(async (signal) => api(fieldworkPath('devices', device.id, 'health'), {
      method: 'POST', body: { status, notes }, signal,
    }));
    if (saved) { setNotes(''); onChanged(); }
  }
  return <article className="fw-card">
    <h4>{device.label || device.device_id}</h4>
    <FieldworkDetails t={t} values={[
      ['Device ID', device.device_id], ['Device type', device.device_type], ['Registered at', device.created_at],
      ['Latest health', device.latest_health ? `${tr(device.latest_health.status)} (${tr(device.latest_health.source)})` : null],
      ['Last reviewed capture', device.latest_health?.reviewed_at], ['Notes', device.notes],
    ]} />
    <form className="fw-status-form" onSubmit={reportHealth}>
      <fieldset disabled={!canWrite || !online || action.busy}>
        <legend>{tr('Report device health')}</legend>
        <FieldworkField label="Health status" name="status" value={status} onChange={(_, value) => setStatus(value)} t={t}>
          {['unknown', 'operational', 'needs_attention', 'offline'].map((value) => <option value={value} key={value}>{tr(value)}</option>)}
        </FieldworkField>
        <FieldworkField label="Health note" name="notes" value={notes} onChange={(_, value) => setNotes(value)} maxLength={4000} multiline t={t} />
        <button type="submit">{tr(action.busy ? 'Saving…' : 'Save health report')}</button>
      </fieldset>
    </form>
    <FieldworkFeedback error={action.error} t={t} />
  </article>;
}

function AlertCard({ alert, api, farmId, online, canWrite, t, onChanged }) {
  const action = useFieldworkAction();
  const tr = trFor(t);
  async function acknowledge() {
    const saved = await action.run(async (signal) => fieldworkRecord(await api(fieldworkPath('review-alerts', alert.id, 'acknowledge'), {
      method: 'POST', signal,
    }), farmId));
    if (saved) onChanged();
  }
  return <article className="fw-card">
    <h4>{tr(alert.code)}</h4>
    <p className="fw-badge">{tr(alert.status)}</p>
    <FieldworkDetails t={t} values={[
      ['Batch ID', alert.batch_id], ['Message', tr(alert.message)], ['Observed value', alert.observed_value],
      ['Prototype threshold', alert.threshold], ['Created at', alert.created_at],
    ]} />
    <p className="fw-hint">{tr('Prototype review prompt, not a feed-safety limit or confirmed detection.')}</p>
    <button type="button" disabled={!canWrite || !online || action.busy || alert.status === 'acknowledged'} onClick={acknowledge}>{tr(action.busy ? 'Saving…' : 'Acknowledge review')}</button>
    <FieldworkFeedback error={action.error} t={t} />
  </article>;
}

function AuditCard({ event, t }) {
  const tr = trFor(t);
  return <article className="fw-card">
    <h4>{tr(event.action)}</h4>
    <FieldworkDetails t={t} values={[
      ['Resource type', event.resource_type], ['Resource ID', event.resource_id], ['Actor', event.actor_id], ['Created at', event.created_at],
    ]} />
    <pre className="fw-audit-details">{JSON.stringify(event.details || {}, null, 2)}</pre>
  </article>;
}

export default function ReviewPanel({ api, farmId, online, canWrite, t, refreshKey = 0 }) {
  const alerts = useFieldworkPage(api, 'review-alerts', farmId, online, { status: 'open' }, refreshKey);
  const devices = useFieldworkPage(api, 'devices', farmId, online, {}, refreshKey);
  const audit = useFieldworkPage(api, 'audit-events', farmId, online, {}, refreshKey);
  const tr = trFor(t);
  return <div className="fw-review-panel">
    <p className="fw-notice">{tr('Alerts, devices, and audit events are local farm records. No live telemetry, messages, or safety decisions are generated.')}</p>
    <section className="fw-review-section">
      <h3>{tr('Review alerts')}</h3>
      <FieldworkList resource={alerts} online={online} empty="No open review alerts saved." t={t}>
        {(items) => <div className="fw-cards">{items.map((alert) => <AlertCard key={alert.id} alert={alert} api={api} farmId={farmId} online={online} canWrite={canWrite} t={t} onChanged={alerts.refresh} />)}</div>}
      </FieldworkList>
    </section>
    <section className="fw-review-section">
      <h3>{tr('Registered devices')}</h3>
      <DeviceRegistrationForm api={api} farmId={farmId} online={online} canWrite={canWrite} t={t} onSaved={devices.refresh} />
      <FieldworkList resource={devices} online={online} empty="No devices registered." t={t}>
        {(items) => <div className="fw-cards">{items.map((device) => <DeviceCard key={device.id} device={device} api={api} farmId={farmId} online={online} canWrite={canWrite} t={t} onChanged={devices.refresh} />)}</div>}
      </FieldworkList>
    </section>
    <section className="fw-review-section">
      <h3>{tr('Audit history')}</h3>
      <p className="fw-hint">{tr('This is an application mutation log, not a tamper-proof infrastructure audit.')}</p>
      <FieldworkList resource={audit} online={online} empty="No audit events available." t={t}>
        {(items) => <div className="fw-cards">{items.map((event) => <AuditCard key={event.id} event={event} t={t} />)}</div>}
      </FieldworkList>
    </section>
  </div>;
}

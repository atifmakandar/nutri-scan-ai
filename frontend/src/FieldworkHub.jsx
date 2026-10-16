import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FieldworkBatches, FieldworkObservations, FieldworkReminders, FieldworkTesting } from './FieldworkWorkflows.jsx';
import ReviewPanel from './ReviewPanel.jsx';
import { createFieldworkClient } from './fieldwork.js';
import { fieldworkText } from './fieldwork-messages.js';
import './fieldwork.css';

const tabs = [
  ['batches', 'Batches', FieldworkBatches], ['observations', 'Quick observations', FieldworkObservations],
  ['reminders', 'Reminders', FieldworkReminders], ['testing', 'Testing help', FieldworkTesting],
  ['review', 'Review and devices', ReviewPanel],
];

/** Mount keyed by user/farm; the internal key also protects accidental scope changes. */
export default function FieldworkHub({ api, session, online = true, onUseBatch, t, refreshKey = 0 }) {
  const scope = session?.user?.id && session?.farm?.id ? JSON.stringify([session.user.id, session.farm.id, session.user.role]) : '';
  return <section id="fieldwork" className="fieldwork" aria-labelledby="fieldwork-title">
    <h2 id="fieldwork-title">{fieldworkText(t, 'Farm fieldwork')}</h2>
    {scope ? <FieldworkScope key={scope} api={api} session={session} online={online} onUseBatch={onUseBatch} t={t} refreshKey={refreshKey} />
      : <p role="status">{fieldworkText(t, 'Sign in to view saved farm fieldwork.')}</p>}
  </section>;
}

function FieldworkScope({ api, session, online, onUseBatch, t, refreshKey }) {
  const [expired, setExpired] = useState(false);
  const [selected, setSelected] = useState(0);
  const [visits, setVisits] = useState(() => tabs.map(() => 0));
  const refs = useRef([]);
  const id = useId();
  const client = useMemo(() => createFieldworkClient(api, () => setExpired(true)), [api]);
  useLayoutEffect(() => { client.start(); return () => client.stop(); }, [client]);
  const scopedApi = useMemo(() => client.request.bind(client), [client]);
  const canWrite = ['owner', 'member'].includes(session.user.role);
  const tr = (key) => fieldworkText(t, key);
  if (expired) return <p role="alert">{tr('Your session expired. Sign in again to view farm records.')}</p>;
  function selectTab(index) {
    setSelected(index);
    setVisits((current) => current.map((value, position) => position === index ? value + 1 : value));
  }
  function changeTab(event) {
    let next;
    if (event.key === 'ArrowRight') next = (selected + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (selected + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); selectTab(next); refs.current[next]?.focus();
  }
  const props = { api: scopedApi, farmId: session.farm.id, online, canWrite, onUseBatch, t };
  return <>
    <p>{tr('Private farm records, saved online. Choose a workflow below.')}</p>
    {!canWrite && <p className="fw-notice" role="status">{tr('Read-only account. You can view records and download saved attachments.')}</p>}
    {!online && <p className="fw-notice" role="status">{tr('Offline. Loaded records may be out of date. Connect to save or load records; nothing is queued automatically.')}</p>}
    <div className="fw-tabs" role="tablist" aria-label={tr('Farm workflows')} onKeyDown={changeTab}>
      {tabs.map(([key, label], index) => <button key={key} ref={(node) => { refs.current[index] = node; }} type="button" role="tab"
        id={`${id}-${key}-tab`} aria-controls={`${id}-${key}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
        onClick={() => selectTab(index)}>{tr(label)}</button>)}
    </div>
    {tabs.map(([key, label, Component], index) => <section className="fw-panel" key={key} role="tabpanel" id={`${id}-${key}-panel`}
      aria-labelledby={`${id}-${key}-tab`} hidden={selected !== index} tabIndex={0}>
      <h3 className="fw-panel-title">{tr(label)}</h3><Component {...props} refreshKey={`${visits[index]}:${refreshKey}`} />
    </section>)}
  </>;
}

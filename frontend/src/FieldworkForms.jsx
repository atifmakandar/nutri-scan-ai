import React, { useEffect, useRef, useState } from 'react';
import { FieldworkFeedback, FieldworkField, FieldworkIdentity } from './FieldworkControls.jsx';
import { useFieldworkAction } from './fieldwork-hooks.js';
import { fieldworkText } from './fieldwork-messages.js';
import { emptyFieldworkForm, FIELDWORK_ANSWERS, FIELDWORK_CHECKS, FIELDWORK_UNITS, fieldworkPath, fieldworkRecord, parseFieldworkForm } from './fieldwork.js';

function useForm({ api, collection, farmId, initial, onSaved, online, canWrite }) {
  const [draft, setDraft] = useState(() => initial ? { ...initial } : emptyFieldworkForm(collection));
  const [errors, setErrors] = useState({});
  const action = useFieldworkAction();
  const summary = useRef(null);
  useEffect(() => { if (Object.keys(errors).length) summary.current?.focus(); }, [errors]);
  function update(name, value) {
    setDraft((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' })); action.setError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (!canWrite || !online || action.busy) return;
    const parsed = parseFieldworkForm(collection, draft, collection === 'batches' ? initial : null);
    setErrors(parsed.errors);
    if (!parsed.value) return;
    const record = await action.run(async (signal) => fieldworkRecord(await api(fieldworkPath(collection, initial?.id), {
      method: 'POST', body: parsed.value, signal,
    }), farmId));
    if (record) {
      if (!initial) setDraft(emptyFieldworkForm(collection));
      onSaved(record);
    }
  }
  return { draft, errors, update, submit, action, summary };
}

function FieldworkForm({ model, title, saveLabel, online, canWrite, children, onCancel, t }) {
  const tr = (key) => fieldworkText(t, key);
  const invalid = Object.values(model.errors).some(Boolean);
  return <form className="fw-form" onSubmit={model.submit} noValidate aria-label={tr(title)} aria-busy={model.action.busy}>
    <fieldset disabled={!canWrite || !online || model.action.busy}><legend>{tr(title)}</legend>
      <div className="fw-form-grid">{children}</div>
      <button className="fw-primary" type="submit">{tr(model.action.busy ? 'Saving…' : saveLabel)}</button>
    </fieldset>
    {invalid && <p className="fw-error" role="alert" tabIndex={-1} ref={model.summary}>{tr('Check the marked fields. Nothing has been saved.')}</p>}
    <FieldworkFeedback error={model.action.error} t={t} />
    {onCancel && <button type="button" onClick={onCancel} disabled={model.action.busy}>{tr('Cancel edit')}</button>}
  </form>;
}

export function FieldworkBatchForm(props) {
  const { t, initial } = props;
  const model = useForm({ ...props, collection: 'batches' });
  const field = (label, name, rest = {}) => <FieldworkField key={name} label={label} name={name} value={model.draft[name]} error={model.errors[name]} onChange={model.update} t={t} {...rest} />;
  return <FieldworkForm {...props} model={model} title={initial ? 'Edit batch metadata' : 'Create batch'} saveLabel={initial ? 'Save batch changes' : 'Save batch'}>
    <FieldworkIdentity draft={model.draft} update={model.update} errors={model.errors} fixed={Boolean(initial)} t={t} />
    <p className="fw-wide fw-hint">{fieldworkText(t, initial ? 'Batch ID and sample type are fixed. Editing metadata keeps the same history.' : 'Use the exact batch ID used for this feed or silage. Identity is fixed after saving.')}</p>
    {field('Display name', 'name', { maxLength: 120 })}{field('Storage location', 'storage_location', { maxLength: 200 })}
    {field('Prepared on', 'prepared_on', { type: 'date', max: model.draft.opened_on || '9999-12-31' })}
    {field('Opened on', 'opened_on', { type: 'date', min: model.draft.prepared_on || undefined, max: '9999-12-31' })}
    {field('Quantity', 'quantity', { type: 'number', min: 0, step: 'any', inputMode: 'decimal' })}
    <FieldworkField label="Quantity unit" name="quantity_unit" value={model.draft.quantity_unit} onChange={model.update} error={model.errors.quantity_unit} t={t}>
      <option value="">{fieldworkText(t, 'Not recorded')}</option>{FIELDWORK_UNITS.map((unit) => <option value={unit} key={unit}>{fieldworkText(t, unit)}</option>)}
    </FieldworkField>
    <p className="fw-wide fw-hint">{fieldworkText(t, 'Units stay as recorded; changing a unit does not convert the quantity.')}</p>
    {field('Notes', 'notes', { maxLength: 4000, multiline: true })}
  </FieldworkForm>;
}

export function FieldworkObservationForm(props) {
  const { t } = props;
  const model = useForm({ ...props, collection: 'observations' });
  const tr = (key) => fieldworkText(t, key);
  return <FieldworkForm {...props} model={model} title="Quick observation checklist" saveLabel="Save observation">
    <FieldworkIdentity draft={model.draft} update={model.update} errors={model.errors} t={t} />
    <FieldworkField label="Observed on" name="observed_on" type="date" max="9999-12-31" value={model.draft.observed_on} onChange={model.update} error={model.errors.observed_on} t={t} />
    <p className="fw-wide fw-hint">{tr('Leave anything you did not check as Unknown. This saves observations only, without a screening score.')}</p>
    {FIELDWORK_CHECKS.map(([key, label]) => <fieldset className="fw-check" key={key}><legend>{tr(label)}</legend>
      <div className="fw-radio-row">{FIELDWORK_ANSWERS.map((answer) => <label key={answer}><input type="radio" name={key} value={answer} checked={model.draft[key] === answer} onChange={() => model.update(key, answer)} />{tr({ yes: 'Yes', no: 'No', unknown: 'Unknown' }[answer])}</label>)}</div>
      {model.errors[key] && <p className="fw-field-error">{tr(model.errors[key])}</p>}
    </fieldset>)}
    <FieldworkField label="Notes" name="notes" value={model.draft.notes} onChange={model.update} error={model.errors.notes} maxLength={4000} multiline t={t} />
  </FieldworkForm>;
}

export function FieldworkReminderForm(props) {
  const model = useForm({ ...props, collection: 'reminders' });
  const { t } = props;
  return <FieldworkForm {...props} model={model} title="Create reminder" saveLabel="Save reminder">
    <FieldworkField label="Task title" name="title" value={model.draft.title} onChange={model.update} error={model.errors.title} required maxLength={200} t={t} />
    <FieldworkField label="Due on" name="due_on" value={model.draft.due_on} onChange={model.update} error={model.errors.due_on} type="date" max="9999-12-31" t={t} />
    <p className="fw-wide fw-hint">{fieldworkText(t, 'Link both batch and sample, or leave both empty for a farm task.')}</p>
    <FieldworkIdentity draft={model.draft} update={model.update} errors={model.errors} optional t={t} />
    <FieldworkField label="Notes" name="notes" value={model.draft.notes} onChange={model.update} error={model.errors.notes} maxLength={4000} multiline t={t} />
  </FieldworkForm>;
}

export function FieldworkTestingForm(props) {
  const model = useForm({ ...props, collection: 'testing-requests' });
  const { t } = props;
  const field = (label, name, rest = {}) => <FieldworkField key={name} label={label} name={name} value={model.draft[name]} onChange={model.update} error={model.errors[name]} t={t} {...rest} />;
  return <FieldworkForm {...props} model={model} title="Create testing request" saveLabel="Save farm request">
    <FieldworkIdentity draft={model.draft} update={model.update} errors={model.errors} t={t} />
    {field('Requested on', 'requested_on', { type: 'date', max: '9999-12-31' })}
    {field('Contact name', 'contact_name', { maxLength: 120 })}
    {field('Contact details', 'contact_details', { maxLength: 500 })}
    {field('Notes', 'notes', { maxLength: 4000, multiline: true })}
  </FieldworkForm>;
}

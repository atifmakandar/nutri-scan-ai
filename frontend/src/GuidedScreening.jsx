import React, { useEffect, useId, useRef, useState } from 'react';
import {
  english, getScreeningBatches, SCREENING_GROUPS, SCREENING_OPTIONAL_GROUPS, SCREENING_SOURCES,
  loadSyntheticDemo, screeningFieldStep, screeningTransition, SYNTHETIC_DEMO_BATCH,
  updateScreeningReading, validateScreening,
} from './screening.js';
import './farmer-screening.css';

const STEPS = ['Choose sample', 'Choose batch', 'Enter readings', 'Review and submit'];
const sampleLabel = (value) => value === 'feed' ? 'Cattle feed' : value === 'silage' ? 'Silage' : 'Not selected';

/**
 * Controlled form: onChange(nextForm) always receives the whole immutable form.
 * onSubmit(event) is called synchronously ONLY from the confirmed final form
 * submit, online, with valid readings. It receives the original React event.
 * No network/storage operations occur here. Pass disabled for signed-out/viewer
 * access, busy during the parent's request, and the parent's online state.
 * Draft loads are ordinary form prop updates, never copied into local form state.
 * renderHelp(fieldKey) optionally inserts measurement help using bare reading keys.
 */
export default function GuidedScreening({ form, onChange, onSubmit, disabled = false, busy = false, online = false, history = [], t = english, renderHelp, renderAssist }) {
  const id = useId();
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState({});
  const [confirmedSnapshot, setConfirmedSnapshot] = useState(null);
  const [confirmationAttempted, setConfirmationAttempted] = useState(false);
  const [pendingFocus, setPendingFocus] = useState(null);
  const formRef = useRef(null);
  const previousStep = useRef(step);
  const snapshot = JSON.stringify(form);
  const confirmed = confirmedSnapshot?.form === form && confirmedSnapshot?.snapshot === snapshot;
  const locked = disabled || busy;
  const allErrors = validateScreening(form, t);
  const errors = Object.fromEntries(Object.entries(allErrors).filter(([key]) => touched[key] || attempted[screeningFieldStep(key)] || attempted[3]));

  useEffect(() => {
    if (pendingFocus) {
      const control = formRef.current?.querySelector(`[data-screening-field="${pendingFocus}"]`);
      const details = control?.closest('details');
      if (details) details.open = true;
      control?.focus();
      setPendingFocus(null);
    } else if (previousStep.current !== step) {
      formRef.current?.querySelector(`[data-screening-heading="${step}"]`)?.focus();
    }
    previousStep.current = step;
  }, [step, pendingFocus, id]);

  function markTouched(key) { setTouched((current) => ({ ...current, [key]: true })); }

  function showErrors(nextErrors) {
    const first = Object.keys(nextErrors).sort((a, b) => screeningFieldStep(a) - screeningFieldStep(b))[0];
    if (first) {
      setStep(screeningFieldStep(first));
      setPendingFocus(first);
      return true;
    }
    return false;
  }

  function next() {
    if (locked) return;
    setAttempted((current) => ({ ...current, [step]: true }));
    const action = screeningTransition(form, { step, disabled, busy, online, confirmed }, t);
    if (action.kind === 'invalid') showErrors(action.errors);
    if (action.kind === 'next') setStep(action.step);
  }

  function submit(event) {
    event.preventDefault();
    if (locked) return;
    // Enter on an earlier step only advances locally; it cannot send a scan.
    if (step < 3) { next(); return; }
    setAttempted((current) => ({ ...current, 3: true }));
    const action = screeningTransition(form, { step, disabled, busy, online, confirmed }, t);
    if (action.kind === 'invalid') { showErrors(action.errors); return; }
    if (action.reason === 'confirmation') {
      setConfirmationAttempted(true);
      setPendingFocus('confirmation');
      return;
    }
    if (action.kind === 'submit') onSubmit?.(event);
  }

  const shared = { form, onChange, disabled: locked, t, id, errors, onBlur: markTouched };
  return (
    <form ref={formRef} className="guided-screening" noValidate onSubmit={submit} aria-labelledby={`${id}-title`} aria-busy={busy}>
      <header className="farmer-screening-header">
        <h2 id={`${id}-title`}>{t('Check feed or silage')}</h2>
        <p>{t('Four small steps. Your readings stay in the form when you go back.')}</p>
      </header>
      <ol className="farmer-progress" aria-label={t('Screening progress')}>
        {STEPS.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}>
          <span aria-hidden="true">{index + 1}</span><span>{t(label)}</span>
        </li>)}
      </ol>
      <p className="farmer-step-status" role="status">{t('Step {step} of {total}: {title}', { step: step + 1, total: STEPS.length, title: t(STEPS[step]) })}</p>
      {disabled && <p className="farmer-notice" role="note">{t('Screening is read-only. Sign in with owner or member access to enter readings and submit.')}</p>}
      {online !== true && <p className="farmer-notice" role="status">{t('You are offline. Screening cannot be submitted. Complete validated readings can be saved in drafts; partial readings cannot be saved.')}</p>}
      <section hidden={step !== 0} aria-labelledby={`${id}-step-0`}>
        <h3 id={`${id}-step-0`} data-screening-heading="0" tabIndex={-1}>{t(STEPS[0])}</h3>
        <ScreeningSample {...shared} />
      </section>
      <section hidden={step !== 1} aria-labelledby={`${id}-step-1`}>
        <h3 id={`${id}-step-1`} data-screening-heading="1" tabIndex={-1}>{t(STEPS[1])}</h3>
        <ScreeningBatch {...shared} history={history} />
      </section>
      <section hidden={step !== 2} aria-labelledby={`${id}-step-2`}>
        <h3 id={`${id}-step-2`} data-screening-heading="2" tabIndex={-1}>{t(STEPS[2])}</h3>
        {step === 2 && renderAssist?.()}
        <ScreeningReadings {...shared} renderHelp={renderHelp} showOptional />
      </section>
      <section hidden={step !== 3} aria-labelledby={`${id}-step-3`}>
        <h3 id={`${id}-step-3`} data-screening-heading="3" tabIndex={-1}>{t(STEPS[3])}</h3>
        <ScreeningReview form={form} t={t} showOptional />
        <label className="farmer-confirmation" htmlFor={`${id}-confirm`}>
          <input id={`${id}-confirm`} data-screening-field="confirmation" type="checkbox" checked={confirmed} disabled={locked}
            aria-invalid={confirmationAttempted && !confirmed ? true : undefined}
            aria-describedby={confirmationAttempted && !confirmed ? `${id}-confirmation-error` : undefined}
            onChange={(event) => setConfirmedSnapshot(event.target.checked ? { form, snapshot } : null)} />
          <span>{t('I checked the sample, batch and all 10 readings.')}</span>
        </label>
        {confirmationAttempted && !confirmed && <p className="farmer-field-error" id={`${id}-confirmation-error`} role="alert">{t('Confirm the reviewed readings before submitting.')}</p>}
        <p>{t('If any form value changes or a draft is loaded, check the review and confirm again.')}</p>
      </section>
      {Object.keys(errors).some((key) => screeningFieldStep(key) === step) && <p className="farmer-field-error" role="alert">{t('Correct the marked fields before continuing.')}</p>}
      <div className="farmer-screening-actions">
        {step > 0 && <button className="farmer-button farmer-button-secondary" type="button" disabled={busy} onClick={() => setStep((current) => Math.max(0, current - 1))}>{t('Back')}</button>}
        {step < 3
          ? <button className="farmer-button" type="button" disabled={locked} onClick={next}>{t('Next')}</button>
          : <button className="farmer-button" type="submit" disabled={locked || online !== true || !confirmed}>{t(busy ? 'Submitting screening…' : 'Submit screening')}</button>}
        <a className="farmer-inline-link" href="#drafts">{t('Save complete readings in drafts')}</a>
      </div>
      <p className="farmer-screening-footnote">{t('Draft saving requires every reading to be complete and valid. This form does not save automatically.')}</p>
    </form>
  );
}

function FieldError({ id, fieldKey, errors }) {
  return errors[fieldKey] ? <p className="farmer-field-error" id={`${id}-${fieldKey}-error`}>{errors[fieldKey]}</p> : null;
}

export function ScreeningSample({ form, onChange, disabled, t = english, id = 'sample', errors = {}, onBlur = () => {} }) {
  return <fieldset className="farmer-fieldset" disabled={disabled} aria-describedby={errors.sample_type ? `${id}-sample_type-error` : undefined}>
    <legend>{t('What are you checking?')}</legend>
    <div className="farmer-sample-options">
      {['silage', 'feed'].map((value) => <label className="farmer-sample-option" key={value}>
        <input type="radio" name={`${id}-sample_type`} value={value} checked={form.sample_type === value}
          data-screening-field={value === 'silage' ? 'sample_type' : undefined}
          aria-invalid={errors.sample_type ? true : undefined}
          onBlur={() => onBlur('sample_type')} onChange={() => onChange({ ...form, sample_type: value })} />
        <SampleIllustration type={value} />
        <strong>{t(sampleLabel(value))}</strong>
        <span>{t(value === 'silage' ? 'Chopped green fodder preserved by fermentation.' : 'Dry or mixed cattle feed, such as grain or pellets.')}</span>
      </label>)}
    </div>
    <FieldError id={id} fieldKey="sample_type" errors={errors} />
  </fieldset>;
}

function SampleIllustration({ type }) {
  return <svg className="farmer-sample-illustration" viewBox="0 0 140 90" aria-hidden="true" focusable="false">
    <ellipse cx="70" cy="77" rx="57" ry="8" fill="#dce8cf" />
    {type === 'silage'
      ? <><path d="M18 72 41 36 69 22 99 40 122 72Z" fill="#648740" /><path d="m33 62 17-12m8 17 13-26m12 24 13-15M58 37l11 5m29 20 9 6" stroke="#c4dc8c" strokeWidth="5" strokeLinecap="round" /></>
      : <><path d="M42 15h56l-5 15 11 43H36l11-43Z" fill="#e5cb92" stroke="#97733b" strokeWidth="2" /><path d="M46 29h48M45 19h50" stroke="#97733b" strokeWidth="3" /><path d="m54 53 9-7 9 8 9-7 9 8" fill="none" stroke="#97733b" strokeWidth="5" /><path d="m51 66 8-5m15 4 8-5" stroke="#97733b" strokeWidth="4" /></>}
  </svg>;
}

export function ScreeningBatch({ form, onChange, history = [], disabled, t = english, id = 'batch', errors = {}, onBlur = () => {} }) {
  const batches = getScreeningBatches(history, form.farm_id, form.sample_type);
  const selected = batches.some((batch) => batch.batch_id === form.batch_id) ? form.batch_id : '';
  return <fieldset className="farmer-fieldset" disabled={disabled}>
    <legend>{t('Use a saved batch or name a new batch')}</legend>
    <label htmlFor={`${id}-farm_id`}>{t('Farm ID')}</label>
    <input id={`${id}-farm_id`} data-screening-field="farm_id" value={form.farm_id ?? ''} readOnly
      aria-invalid={errors.farm_id ? true : undefined} aria-describedby={errors.farm_id ? `${id}-farm_id-error` : undefined} />
    <FieldError id={id} fieldKey="farm_id" errors={errors} />
    <label htmlFor={`${id}-saved-batch`}>{t('Saved batch for this farm and sample type')}</label>
    <select id={`${id}-saved-batch`} value={selected} disabled={disabled || !batches.length}
      onChange={(event) => { if (event.target.value) onChange({ ...form, batch_id: event.target.value }); }} aria-describedby={`${id}-saved-note`}>
      <option value="">{t('Choose a saved batch (optional)')}</option>
      {batches.map((batch) => <option key={batch.batch_id} value={batch.batch_id}>{batch.batch_id}</option>)}
    </select>
    <p id={`${id}-saved-note`}>{t(batches.length ? 'Only batches in the supplied history are listed. Selecting a batch reuses its ID, not its old readings.' : 'No matching batches in the supplied history. Enter a new batch ID below.')}</p>
    <button className="farmer-button farmer-button-secondary farmer-demo-button" type="button" disabled={disabled}
      onClick={() => onChange(loadSyntheticDemo(form))}>{t('Load synthetic demo scenario')}</button>
    <p className="farmer-demo-note">{t('Fills DEMO-SILAGE-01 with synthetic readings for a presentation. Review every value before submitting.')}</p>
    <label htmlFor={`${id}-batch_id`}>{t('Batch ID')}</label>
    <input id={`${id}-batch_id`} data-screening-field="batch_id" name="batch_id" value={form.batch_id ?? ''} minLength={2} maxLength={80} required
      onChange={(event) => onChange({ ...form, batch_id: event.target.value })} onBlur={() => onBlur('batch_id')}
      aria-invalid={errors.batch_id ? true : undefined} aria-describedby={`${id}-batch-hint${errors.batch_id ? ` ${id}-batch_id-error` : ''}`} />
    <p id={`${id}-batch-hint`}>{t('For a new batch, enter a clear name or ID using 2–80 characters. Changing the sample or batch keeps your readings.')}</p>
    <FieldError id={id} fieldKey="batch_id" errors={errors} />
  </fieldset>;
}

export function ScreeningReadings({ form, onChange, disabled, t = english, id = 'readings', errors = {}, onBlur = () => {}, renderHelp, showOptional = false }) {
  return <>
    <p className="farmer-notice">{t('All 10 readings are required by the screening service. Missing measurements block screening. Use measurement help; do not invent values.')}</p>
    {form.batch_id === SYNTHETIC_DEMO_BATCH && <p className="farmer-demo-banner" role="note"><strong>{t('Synthetic demo data')}</strong> — {t('These values are for a presentation only, not a field measurement. Replace them with reviewed readings for real use.')}</p>}
    <details className="farmer-source-details" open={errors.source_mode ? true : undefined}>
      <summary>{t('Where did these readings come from?')}</summary>
      <p>{t('Manual entry means typing measurements you already have. It does not measure the sample or fill missing readings.')}</p>
      <p>{t('Mobile capture and ESP32 label the source only. Choosing them here does not connect a camera or device.')}</p>
      <label htmlFor={`${id}-source_mode`}>{t('Input source')}</label>
      <select id={`${id}-source_mode`} data-screening-field="source_mode" name="source_mode" value={form.source_mode ?? ''} disabled={disabled}
        onChange={(event) => onChange({ ...form, source_mode: event.target.value })} onBlur={() => onBlur('source_mode')}
        aria-invalid={errors.source_mode ? true : undefined} aria-describedby={errors.source_mode ? `${id}-source_mode-error` : undefined}>
        <option value="">{t('Choose an input source')}</option>
        {SCREENING_SOURCES.map((source) => <option key={source.value} value={source.value}>{t(source.label)}</option>)}
      </select>
      <FieldError id={id} fieldKey="source_mode" errors={errors} />
    </details>
    {SCREENING_GROUPS.map((group) => <fieldset className="farmer-fieldset" disabled={disabled} key={group.key}>
      <legend>{t(group.title)}</legend><p>{t(group.description)}</p>
      <div className="farmer-readings-grid">
        {group.fields.map((field) => <div className="farmer-reading" key={field.key}>
          <label htmlFor={`${id}-${field.key}`}>{t(field.label)}{field.unit ? ` (${field.unit})` : ''}</label>
          <input id={`${id}-${field.key}`} data-screening-field={field.key} name={`inputs.${group.key}.${field.key}`}
            type="number" inputMode="decimal" min={field.min} max={field.max} step="any" required
            value={form.inputs?.[group.key]?.[field.key] ?? ''}
            onChange={(event) => onChange(updateScreeningReading(form, field.key, event.target.value))} onBlur={() => onBlur(field.key)}
            aria-invalid={errors[field.key] ? true : undefined}
            aria-describedby={`${id}-${field.key}-range${errors[field.key] ? ` ${id}-${field.key}-error` : ''}`} />
          <p className="farmer-range" id={`${id}-${field.key}-range`}>{t('Allowed range: {min} to {max}{unit}', { min: field.min, max: field.max, unit: field.unit ? ` ${field.unit}` : '' })}</p>
          <FieldError id={id} fieldKey={field.key} errors={errors} />
          <div className="farmer-measurement-help">{renderHelp?.(field.key) ?? <a className="farmer-inline-link" href="#farmer-help">{t('Help with {field}', { field: t(field.label) })}</a>}</div>
        </div>)}
       </div>
     </fieldset>)}
    {showOptional && SCREENING_OPTIONAL_GROUPS.map((group) => <fieldset className="farmer-fieldset farmer-optional-fieldset" disabled={disabled} key={group.key}>
      <legend>{t(group.title)}</legend><p>{t(group.description)}</p>
      <div className="farmer-readings-grid">
        {group.fields.map((field) => <div className="farmer-reading" key={field.key}>
          <label htmlFor={`${id}-${field.key}`}>{t(field.label)}{field.unit ? ` (${field.unit})` : ''}</label>
          <input id={`${id}-${field.key}`} data-screening-field={field.key} name={`inputs.${group.key}.${field.key}`}
            type="number" inputMode="decimal" min={field.min} max={field.max} step="any"
            value={form.inputs?.[group.key]?.[field.key] ?? ''}
            onChange={(event) => onChange(updateScreeningReading(form, field.key, event.target.value))} onBlur={() => onBlur(field.key)}
            aria-invalid={errors[field.key] ? true : undefined}
            aria-describedby={`${id}-${field.key}-range${errors[field.key] ? ` ${id}-${field.key}-error` : ''}`} />
          <p className="farmer-range" id={`${id}-${field.key}-range`}>{t('Optional reported input; leave blank when unavailable.')}</p>
          <FieldError id={id} fieldKey={field.key} errors={errors} />
        </div>)}
      </div>
    </fieldset>)}
  </>;
}

export function ScreeningReview({ form, t = english, showOptional = false }) {
  const display = (value) => value === '' || value === null || value === undefined ? t('Not entered') : String(value);
  return <div className="farmer-review">
    <p>{t('Check every value against your measurements before submitting.')}</p>
    <dl className="farmer-review-values">
      <div><dt>{t('Farm ID')}</dt><dd>{display(form.farm_id)}</dd></div>
      <div><dt>{t('Batch ID')}</dt><dd>{display(form.batch_id)}</dd></div>
      <div><dt>{t('Sample type')}</dt><dd>{t(sampleLabel(form.sample_type))}</dd></div>
      <div><dt>{t('Input source')}</dt><dd>{t(SCREENING_SOURCES.find((source) => source.value === form.source_mode)?.label || 'Not selected')}</dd></div>
    </dl>
    {SCREENING_GROUPS.map((group) => <div key={group.key}>
      <h4>{t(group.title)}</h4>
      <dl className="farmer-review-values">{group.fields.map((field) => {
        const value = form.inputs?.[group.key]?.[field.key];
        return <div key={field.key}><dt>{t(field.label)}</dt><dd>{display(value)}{value !== '' && value != null && field.unit ? ` ${field.unit}` : ''}</dd></div>;
      })}</dl>
    </div>)}
    {showOptional && SCREENING_OPTIONAL_GROUPS.map((group) => <div key={group.key}>
      <h4>{t(group.title)}</h4><p>{t('Optional values are reported inputs and concerns for review; they are not confirmed detection results.')}</p>
      <dl className="farmer-review-values">{group.fields.map((field) => {
        const value = form.inputs?.[group.key]?.[field.key];
        return <div key={field.key}><dt>{t(field.label)}</dt><dd>{display(value)}{value !== '' && value != null && field.unit ? ` ${field.unit}` : ''}</dd></div>;
      })}</dl>
    </div>)}
  </div>;
}

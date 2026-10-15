import React, { useId } from 'react';
import { fieldworkPagination } from './fieldwork.js';
import { fieldworkText } from './fieldwork-messages.js';

export function FieldworkFeedback({ error, message, t }) {
  return <>{error && <p className="fw-error" role="alert">{fieldworkText(t, error)}</p>}
    {message && <p className="fw-notice" role="status">{fieldworkText(t, message)}</p>}</>;
}

export function FieldworkField({ label, name, value, onChange, error, t, multiline, children, ...rest }) {
  const id = useId();
  const inputProps = {
    id, name, value: value ?? '', onChange: (event) => onChange(name, event.target.value),
    'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined, ...rest,
  };
  return <div className="fw-field"><label htmlFor={id}>{fieldworkText(t, label)}</label>
    {children ? <select {...inputProps}>{children}</select> : multiline ? <textarea {...inputProps} rows={3} /> : <input {...inputProps} />}
    {error && <p className="fw-field-error" id={`${id}-error`}>{fieldworkText(t, error)}</p>}
  </div>;
}

export function FieldworkIdentity({ draft, update, errors = {}, fixed = false, optional = false, t }) {
  const tr = (key) => fieldworkText(t, key);
  return <>
    <FieldworkField label="Batch ID" name="batch_id" value={draft.batch_id} onChange={update} error={errors.batch_id} minLength={2} maxLength={80} required={!optional} readOnly={fixed} t={t} />
    <FieldworkField label="Sample type" name="sample_type" value={draft.sample_type} onChange={update} error={errors.sample_type} disabled={fixed} required={!optional} t={t}>
      {optional && <option value="">{tr('No linked batch')}</option>}
      <option value="feed">{tr('Feed')}</option><option value="silage">{tr('Silage')}</option>
    </FieldworkField>
  </>;
}

export function FieldworkDetails({ values, t }) {
  return <dl className="fw-details">{values.map(([label, value]) => <div key={label}>
    <dt>{fieldworkText(t, label)}</dt><dd>{value === null || value === undefined || value === '' ? fieldworkText(t, 'Not recorded') : value}</dd>
  </div>)}</dl>;
}

export function FieldworkList({ resource, online, empty, children, t }) {
  const tr = (key, values) => fieldworkText(t, key, values);
  const { data, loading, error } = resource;
  const page = data ? fieldworkPagination(data) : null;
  const id = useId();
  return <div className="fw-list" aria-busy={loading}>
    <div className="fw-actions"><button type="button" onClick={resource.refresh} disabled={!online || loading}>{tr('Refresh list')}</button></div>
    {loading && <p role="status">{tr('Loading farm records…')}</p>}
    {error && <div className="fw-error" role="alert"><p>{tr(error)}</p>
      {data && <p>{tr('Previously loaded records remain below. They may be out of date.')}</p>}
      <button type="button" disabled={!online || loading} onClick={resource.refresh}>{tr('Retry this list')}</button>
    </div>}
    {!online && !data && <p role="status">{tr('Connect to load saved farm records.')}</p>}
    {data && <>
      <p role="status">{tr('Showing {start}–{end} of {total} records.', { ...page, total: data.total })}</p>
      {!data.items.length && <p className="fw-empty">{tr(data.total ? 'This page is empty. Use Previous page or First page.' : empty)}</p>}
      {children(data.items)}
      <nav className="fw-pagination" aria-label={tr('Record pages')}>
        <div className="fw-actions">
          <button type="button" disabled={!online || loading || !page.hasPrevious} onClick={() => resource.setOffset(0)}>{tr('First page')}</button>
          <button type="button" disabled={!online || loading || !page.hasPrevious} onClick={() => resource.setOffset(page.previous)}>{tr('Previous page')}</button>
          <button type="button" disabled={!online || loading || !page.hasNext} onClick={() => resource.setOffset(page.next)}>{tr('Next page')}</button>
        </div>
        <label htmlFor={id}>{tr('Records per page')}<select id={id} value={data.limit} disabled={!online || loading} onChange={(event) => resource.setLimit(Number(event.target.value))}>
          {[...new Set([20, 50, 100, data.limit])].sort((a, b) => a - b).map((limit) => <option value={limit} key={limit}>{limit}</option>)}
        </select></label>
      </nav>
    </>}
  </div>;
}

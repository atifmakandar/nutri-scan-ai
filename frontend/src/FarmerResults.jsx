import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import InstrumentProvenance from './InstrumentProvenance.jsx';
import { english, finiteMeasurement, measurement, TREND_LIMIT } from './history-utils.js';
import { translateAdvisory } from './i18n.js';
import { useScanSearch } from './BatchTrends.jsx';
import ShareEvidencePicker from './ShareEvidencePicker.jsx';
import {
  buildShareSummary, compareSavedRecords, comparisonSearchPath, CONFIDENCE_NOTICE,
  copySummaryText, isSavedResult, openWhatsAppSummary, RESULT_METRICS, resultSummary,
  resultsText, savedDate, shareSummaryText, spokenSummary,
} from './farmer-results.js';
import './farmer-results.css';

export default function FarmerResults({ record, api, t = english, renderListen, farmName = '' }) {
  const text = resultsText(t);
  const id = useId();
  if (!record?.result || typeof record.result !== 'object') {
    return <div className="farmer-results"><p role="status">{text('Select a result to see its summary.')}</p></div>;
  }
  const summary = resultSummary(record, text);
  return <section className="farmer-results" aria-labelledby={`${id}-heading`}>
    <header className={`fr-risk fr-risk-${summary.tone}`}>
      <span className="fr-risk-icon" aria-hidden="true">{summary.icon}</span>
      <h3 id={`${id}-heading`}>{summary.heading}</h3>
    </header>
    <p className="fr-score">{text('Prototype score')}: <strong>{measurement(record, 'quality_score') ?? text('Not recorded')}</strong> / 100</p>
    <p className="fr-safety" role="note"><strong>{summary.notice}</strong></p>
    {typeof renderListen === 'function' && <div className="fr-listen">{renderListen(spokenSummary(record, text))}</div>}
    <section className="fr-explanation" aria-labelledby={`${id}-why`}>
      <h4 id={`${id}-why`}>{text('Why this result needs context')}</h4>
      <p className="fr-note">{text('These are the saved anomaly indicators, not an explanation of every score contribution.')}</p>
      {summary.anomalies.length ? <ul>{summary.anomalies.map((item, index) => <li key={index}>{item}</li>)}</ul>
        : <p>{text('No anomaly information was saved.')}</p>}
    </section>
    <section className="fr-next" aria-labelledby={`${id}-next`}>
      <h4 id={`${id}-next`}>{text('Next steps from the saved advice')}</h4>
      {summary.advisory.length ? <ol>{summary.advisory.map((item, index) => <li key={index}>{item}</li>)}</ol>
        : <p>{text('No advice was saved. Ask a qualified adviser before making a feeding decision.')}</p>}
    </section>
    <p className="fr-note">{summary.confidenceNotice}</p>
    <ResultDetails record={record} t={text} />
    <SavedComparison record={record} api={api} t={text} />
    <ShareSummary record={record} api={api} t={text} farmName={farmName} />
  </section>;
}

function displayValue(value, t) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : t('Not recorded');
  return typeof value === 'string' && value.length ? translateAdvisory(t.locale || 'en', value) : t('Not recorded');
}

function ResultDetails({ record, t }) {
  const result = record.result;
  const knownKeys = new Set(RESULT_METRICS.map((metric) => metric.key));
  const extraParameters = Object.entries(result.parameters || {}).filter(([key]) => !knownKeys.has(key));
  const confidence = finiteMeasurement(result.confidence);
  const metadata = [
    ['Scan ID', record.scan?.id], ['Result ID', result.id], ['Assessment kind', result.assessment?.kind],
    ['Model version', result.assessment?.model_version], ['Saved calibration status', result.assessment?.calibration_status],
  ];
  return <details className="fr-details">
    <summary>{t('Measurements and model details')}</summary>
    <dl className="fr-values">
      <div><dt>{t('Saved at (UTC)')}</dt><dd>{savedDate(record) ?? t('Not recorded')}</dd></div>
      <div><dt>{t('Batch ID')}</dt><dd>{displayValue(record.scan?.batch_id, t)}</dd></div>
      <div><dt>{t('Sample type')}</dt><dd>{displayValue(record.scan?.sample_type ?? result.sample_type, t)}</dd></div>
      {RESULT_METRICS.map((metric) => {
        const value = measurement(record, metric.key);
        return <div key={metric.key}><dt>{t(metric.label)}</dt><dd>{value === null ? t('Not recorded') : `${value}${metric.unit ? ` ${metric.unit}` : ''}`}</dd></div>;
      })}
      {extraParameters.map(([key, value]) => <div key={key}><dt>{t(key === 'fermentation_quality' ? 'Fermentation' : key === 'spoilage_risk' ? 'Spoilage risk' : key)}</dt><dd>{displayValue(value, t)}</dd></div>)}
      <div><dt>{t('Confidence indicator')}</dt><dd>{confidence === null ? t('Not recorded') : `${confidence} %`}</dd></div>
      {metadata.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{displayValue(value, t)}</dd></div>)}
    </dl>
    <p className="fr-note">{t(CONFIDENCE_NOTICE)}</p>
    <InstrumentProvenance capture={record.scan?.instrument_capture} t={t} />
  </details>;
}

const comparisonMessages = {
  invalid: 'A saved result with a farm, batch, sample type and valid saved-at timezone is needed for comparison.',
  missing: 'No strictly earlier matching saved result is available in this sample.',
  ambiguous: 'The previous saved result is ambiguous because timestamps or duplicate records conflict. No comparison is shown.',
};

function RiskText({ record, t }) {
  const risk = record?.result?.risk_level;
  return ['LOW', 'MEDIUM', 'HIGH'].includes(risk) ? t(risk) : t('Not recorded');
}

export function BatchComparison({ records, record, t = english }) {
  const text = resultsText(t);
  const comparison = compareSavedRecords(records, record);
  const id = useId();
  return <section className="fr-comparison" aria-labelledby={`${id}-comparison`}>
    <h4 id={`${id}-comparison`}>{text('What changed in this batch?')}</h4>
    <p className="fr-note">{text('Uses at most {limit} supplied records, ordered by saved-at UTC time. Only the same farm, batch and sample type are eligible.', { limit: TREND_LIMIT })}</p>
    <p className="fr-note">{text('This is a bounded sample, not the complete batch history. Older or unloaded records may be absent.')}</p>
    <p className="fr-note">{text('The comparison uses the immediately previous strictly earlier saved result in this sample, never a future result.')}</p>
    {comparison.status !== 'ready' ? <p role="status">{text(comparisonMessages[comparison.status])}</p> : <>
      <p>{text('Screening risk: {previous} → {current}', {
        previous: RiskText({ record: comparison.previous, t: text }), current: RiskText({ record, t: text }),
      })}</p>
      <ul className="fr-change-summary">{comparison.metrics.filter((metric) => ['quality_score', 'moisture_pct', 'temperature_c', 'ph'].includes(metric.key) && metric.difference !== null).map((metric) => <li key={metric.key}>{text(
        metric.difference > 0 ? '{measurement} increased from {before}{unit} to {current}{unit}.'
          : metric.difference < 0 ? '{measurement} decreased from {before}{unit} to {current}{unit}.'
            : '{measurement} stayed at {current}{unit}.',
        { measurement: text(metric.label), before: metric.before, current: metric.current, unit: metric.unit ? ` ${metric.unit}` : '' },
      )}</li>)}</ul>
      <div className="fr-table-scroll" role="region" tabIndex={0} aria-label={text('What changed in this batch?')}>
        <table>
          <caption>{text('Previous saved result')}: {savedDate(comparison.previous)} → {text('Selected saved result')}: {savedDate(record)}</caption>
          <thead><tr><th scope="col">{text('Measurements')}</th><th scope="col">{text('Previous saved result')}</th><th scope="col">{text('Selected saved result')}</th><th scope="col">{text('Numerical difference')}</th></tr></thead>
          <tbody>{comparison.metrics.map((metric) => <tr key={metric.key}>
            <th scope="row">{text(metric.label)}{metric.unit ? ` (${metric.unit})` : ''}</th>
            <td>{metric.before ?? text('Not recorded')}</td><td>{metric.current ?? text('Not recorded')}</td>
            <td>{metric.difference === null ? text('Not comparable') : metric.difference === 0 ? text('No numerical change')
              : `${metric.difference > 0 ? '+' : ''}${metric.difference} ${text(metric.differenceUnit)}`}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    <p className="fr-note">{text('Differences describe saved readings only; an increase or decrease is not automatically good or bad and does not establish a cause.')}</p>
  </section>;
}

export function SavedComparison({ record, api, t = english }) {
  const text = resultsText(t);
  const [revision, setRevision] = useState(0);
  const path = typeof api === 'function' ? comparisonSearchPath(record) : null;
  // A newly saved/selected record refetches even when the exact batch path is unchanged.
  const identity = JSON.stringify([record?.scan?.farm_id, record?.scan?.id, record?.scan?.created_at, revision]);
  const resource = useScanSearch(api, path, identity);
  if (isSavedResult(record) && typeof api !== 'function') return <section className="fr-comparison">
    <h4>{text('What changed in this batch?')}</h4><p role="status">{text('Saved history is unavailable. Supply the API function to load this comparison.')}</p>
  </section>;
  if (!path) return <BatchComparison records={[]} record={record} t={text} />;
  if (resource.status === 'ready') return <>
    <p className="fr-note">{text('Loaded {count} of {total} matching saved records (latest {limit} maximum).', {
      count: resource.data.items.length, total: resource.data.total, limit: TREND_LIMIT,
    })}</p>
    <BatchComparison records={resource.data.items} record={record} t={text} />
  </>;
  const errorMessage = resource.error?.status === 401 ? 'Sign in again to view saved scans.'
    : resource.error?.status === 403 ? 'You do not have permission to view these scans.' : 'Comparison could not be loaded. Try again.';
  return <section className="fr-comparison" aria-busy={resource.status === 'loading'} aria-label={text('What changed in this batch?')}>
    <h4>{text('What changed in this batch?')}</h4>
    {resource.status === 'error' ? <div role="alert"><p>{text(errorMessage)}</p><button className="fr-button" type="button" onClick={() => setRevision((value) => value + 1)}>{text('Try again')}</button></div>
      : <p role="status">{text('Loading the saved batch comparison…')}</p>}
  </section>;
}

const shareFeedback = {
  shared: 'Summary shared using this device.',
  cancelled: 'Sharing cancelled. Nothing was copied automatically.',
  unsupported: 'Device sharing is unavailable. Copy or select the preview text instead.',
  photosUnsupported: 'This device cannot share the selected photos. No text-only share was sent. Remove photo choices to share text only, or use copy or WhatsApp for text.',
  failed: 'Sharing failed. Copy or select the preview text instead.',
  copied: 'Summary copied.',
  manual: 'Clipboard access is unavailable or was denied. Select the preview text and copy it manually.',
  requested: 'WhatsApp opening requested. Check the recipient before sending.',
  whatsappFailed: 'WhatsApp could not be opened. Copy or select the preview text instead.',
};

export function ShareSummary({ record, api, t = english, browser, farmName = '' }) {
  const text = resultsText(t);
  // Reset synchronously when an injected API/browser scope changes, as well as
  // when the saved source changes. App already keys results by account identity.
  const [scope, setScope] = useState({ api, browser, revision: 0 });
  if (scope.api !== api || scope.browser !== browser) setScope({ api, browser, revision: scope.revision + 1 });
  if (!isSavedResult(record)) return <section className="fr-share"><h4>{text('Share a summary with an adviser')}</h4><p>{text('Only saved results can be shared.')}</p></section>;
  // Revoke the preview and reset identity opt-ins whenever its source changes.
  // No record is serialized: this key contains only allowlisted preview fields.
  const identity = JSON.stringify([scope.revision, record.scan.id, record.scan.farm_id, record.result.id, text.locale, farmName, buildShareSummary(record, { t: text })]);
  return <SharePanel key={identity} record={record} api={api} t={text} browser={browser} farmName={farmName} />;
}

function SharePanel({ record, api, t, browser, farmName }) {
  const [includeFarmId, setIncludeFarmId] = useState(false);
  const [includeFarmName, setIncludeFarmName] = useState(false);
  const [preview, setPreview] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState({ files: [], ready: true });
  const pending = useRef(false);
  const active = useRef(false);
  const actionRevision = useRef(0);
  const selectionTarget = useRef(null);
  const id = useId();
  const hasFarmName = typeof farmName === 'string' && Boolean(farmName.trim());
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; actionRevision.current += 1; };
  }, []);
  const changePhotos = useCallback((files, { ready }) => {
    actionRevision.current += 1;
    pending.current = false;
    setBusy(false);
    setAttachments({ files, ready });
    setPreview(null);
    setFeedback(null);
  }, []);

  function changeIdentity(setter, value) {
    setter(value);
    setPreview(null);
    setFeedback(null);
  }

  async function act(action) {
    if (!preview || pending.current) return;
    pending.current = true;
    const revision = ++actionRevision.current;
    setBusy(true);
    let outcome;
    if (action === 'share') outcome = await shareSummaryText(preview.text, browser, preview.files);
    else if (action === 'copy') outcome = await copySummaryText(preview.text, browser, selectionTarget.current);
    else {
      outcome = openWhatsAppSummary(preview.text, browser);
      if (outcome.status === 'failed') outcome = { status: 'whatsappFailed' };
    }
    if (!active.current || actionRevision.current !== revision) return;
    setFeedback(outcome.status);
    pending.current = false;
    setBusy(false);
  }

  return <section className="fr-share" aria-labelledby={`${id}-share`}>
    <h4 id={`${id}-share`}>{t('Share a summary with an adviser')}</h4>
    <p>{t('Review the exact text before choosing where to send it. Farm identity is off by default.')}</p>
    <p className="fr-note">{attachments.files.length > 0
      ? t('Selected evidence photos are included only in supported native device sharing. Copy and WhatsApp send text only, without photo URLs.')
      : t('Photos are excluded: private photo evidence cannot be safely shared automatically.')}</p>
    <div className="fr-share-options">
      <label><input type="checkbox" checked={includeFarmId} disabled={busy} onChange={(event) => changeIdentity(setIncludeFarmId, event.target.checked)} />{t('Include farm ID')}</label>
      <label><input type="checkbox" checked={includeFarmName} disabled={busy || !hasFarmName} onChange={(event) => changeIdentity(setIncludeFarmName, event.target.checked)} />{t('Include farm name')}</label>
      {!hasFarmName && <small>{t('Farm name not supplied.')}</small>}
    </div>
    <ShareEvidencePicker api={api} scanId={record.scan.id} browser={browser} t={t} onChange={changePhotos} disabled={busy} />
    <button className="fr-button" type="button" disabled={busy || !attachments.ready} onClick={() => {
      setPreview({ text: buildShareSummary(record, { t, includeFarmId, includeFarmName, farmName, includePhotos: attachments.files.length > 0 }), files: [...attachments.files] });
      setFeedback(null);
    }}>{t('Preview summary')}</button>
    {preview !== null && <div className="fr-preview">
      <label htmlFor={`${id}-preview`}>{t('Sharing preview — exact text')}</label>
      <textarea id={`${id}-preview`} ref={selectionTarget} value={preview.text} readOnly rows={16} spellCheck={false} />
      {preview.files.length > 0 && <p role="status">{t('Native share attachments: {count} selected photos. Copy and WhatsApp send only the text above.', { count: preview.files.length })}</p>}
      <div className="fr-actions">
        <button className="fr-button" type="button" disabled={busy} onClick={() => act('share')}>{t('Share using this device')}</button>
        <button className="fr-button" type="button" disabled={busy} onClick={() => act('copy')}>{t('Copy summary')}</button>
      </div>
      <p className="fr-external-note">{t('WhatsApp is an external service. Clicking sends this preview text to WhatsApp; check the recipient before sending.')}</p>
      <button className="fr-button" type="button" disabled={busy} onClick={() => act('whatsapp')}>{t('Send text to WhatsApp')}</button>
      <button className="fr-button fr-button-quiet" type="button" disabled={busy} onClick={() => { setPreview(null); setFeedback(null); }}>{t('Close sharing preview')}</button>
      {feedback && <p role={['failed', 'whatsappFailed'].includes(feedback) ? 'alert' : 'status'}>{t(shareFeedback[feedback])}</p>}
    </div>}
  </section>;
}

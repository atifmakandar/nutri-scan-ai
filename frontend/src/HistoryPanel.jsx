import React, { useId, useState } from 'react';
import ReportActions from './ReportActions.jsx';
import BatchTrends, { SearchError, useScanSearch } from './BatchTrends.jsx';
import BatchQr from './BatchQr.jsx';
import { BatchComparison } from './FarmerResults.jsx';
import { boundedComparisonRecords } from './farmer-results.js';
import {
  buildHistorySearchPath, emptyHistoryFilters, english, finiteMeasurement, formatScanDate,
  HISTORY_PAGE_SIZE, historyFromSearch, historyPagination, RISK_LEVELS, SAMPLE_TYPES, validateHistoryFilters,
} from './history-utils.js';
import './feature-history.css';

export default function HistoryPanel({ api, onSelect, t = english, canWrite = false, refreshKey = 0 }) {
  const [initial] = useState(() => historyFromSearch(typeof window === 'undefined' ? '' : window.location.search));
  const [draft, setDraft] = useState(initial.filters);
  const [batchMode, setBatchMode] = useState(initial.filters.batch_id ? 'exact' : 'contains');
  const [query, setQuery] = useState({ filters: initial.filters, offset: 0, limit: HISTORY_PAGE_SIZE });
  const [selectedBatch, setSelectedBatch] = useState(initial.selectedBatch);
  const [qrBatch, setQrBatch] = useState(null);
  const [validation, setValidation] = useState('');
  const [revision, setRevision] = useState(0);
  const id = useId();
  const path = buildHistorySearchPath(query.filters, query);
  const resource = useScanSearch(api, path, `${revision}:${refreshKey}`);

  function updateFilter(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidation('');
  }
  function search(event) {
    event.preventDefault();
    const error = validateHistoryFilters(draft);
    setValidation(error);
    if (error) return;
    setQuery((current) => ({ ...current, filters: { ...draft }, offset: 0 }));
    setSelectedBatch(draft.batch_id && draft.sample_type ? { batchId: draft.batch_id, sampleType: draft.sample_type } : null);
    setQrBatch(null);
    setRevision((value) => value + 1);
  }
  function reset() {
    const filters = emptyHistoryFilters();
    setDraft(filters);
    setBatchMode('contains');
    setQuery({ filters, offset: 0, limit: HISTORY_PAGE_SIZE });
    setSelectedBatch(null);
    setQrBatch(null);
    setValidation('');
    setRevision((value) => value + 1);
  }
  function viewBatch(record) {
    const batch = { batchId: record.scan.batch_id, sampleType: record.scan.sample_type };
    const filters = { ...emptyHistoryFilters(), batch_id: batch.batchId, sample_type: batch.sampleType };
    setDraft(filters);
    setBatchMode('exact');
    setQuery((current) => ({ ...current, filters, offset: 0 }));
    setSelectedBatch(batch);
    setQrBatch(null);
    setValidation('');
  }

  return <section className="feature-history fh-panel" id="history" aria-labelledby={`${id}-title`}>
    <div className="section-heading"><div><p className="eyebrow">{t('TRACEABILITY')}</p><h2 id={`${id}-title`}>{t('Screening history')}</h2></div>
      <button className="text-button" type="button" onClick={() => setRevision((value) => value + 1)}>{t('Refresh history')}</button>
    </div>
    <form className="fh-filter-form" onSubmit={search} aria-label={t('Filter saved scans')}>
      <div className="fh-filter-grid">
        <label htmlFor={`${id}-match`}>{t('Batch matching')}<select id={`${id}-match`} value={batchMode} onChange={(event) => {
          const mode = event.target.value;
          const value = draft.batch_id || draft.batch_query;
          setBatchMode(mode);
          setDraft((current) => ({ ...current, batch_id: mode === 'exact' ? value : '', batch_query: mode === 'contains' ? value : '' }));
        }}><option value="contains">{t('Contains')}</option><option value="exact">{t('Exact batch ID')}</option></select></label>
        <label htmlFor={`${id}-batch`}>{t('Batch ID')}<input id={`${id}-batch`} name={batchMode === 'exact' ? 'batch_id' : 'batch_query'} value={batchMode === 'exact' ? draft.batch_id : draft.batch_query} onChange={(event) => updateFilter(batchMode === 'exact' ? 'batch_id' : 'batch_query', event.target.value)} /></label>
        <label htmlFor={`${id}-sample`}>{t('Sample type')}<select id={`${id}-sample`} name="sample_type" value={draft.sample_type} onChange={(event) => updateFilter('sample_type', event.target.value)}>
          <option value="">{t('All sample types')}</option><option value="feed">{t('Feed')}</option><option value="silage">{t('Silage')}</option>
        </select></label>
        <label htmlFor={`${id}-risk`}>{t('Risk level')}<select id={`${id}-risk`} name="risk_level" value={draft.risk_level} onChange={(event) => updateFilter('risk_level', event.target.value)}>
          <option value="">{t('All risk levels')}</option>{RISK_LEVELS.map((level) => <option key={level} value={level}>{t(level)}</option>)}
        </select></label>
        <label htmlFor={`${id}-from`}>{t('From date (UTC)')}<input id={`${id}-from`} name="date_from" type="date" value={draft.date_from} max={draft.date_to || '9999-12-31'} aria-describedby={`${id}-dates`} onChange={(event) => updateFilter('date_from', event.target.value)} /></label>
        <label htmlFor={`${id}-to`}>{t('To date (UTC)')}<input id={`${id}-to`} name="date_to" type="date" value={draft.date_to} min={draft.date_from || undefined} max="9999-12-31" aria-describedby={`${id}-dates`} onChange={(event) => updateFilter('date_to', event.target.value)} /></label>
      </div>
      <p className="fh-note" id={`${id}-dates`}>{t('Dates include the full start and end days in UTC and filter when samples were collected.')}</p>
      <div className="fh-actions"><button className="primary-button" type="submit">{t('Search history')}</button><button className="secondary-button" type="button" onClick={reset}>{t('Reset filters')}</button></div>
      {validation && <p className="fh-error" role="alert">{t(validation)}</p>}
    </form>
    <div className="fh-results" aria-busy={resource.status === 'loading'}>
      {resource.status === 'loading' && <p className="fh-empty" role="status">{t('Loading saved scans…')}</p>}
      {resource.status === 'error' && <SearchError error={resource.error} onRetry={() => setRevision((value) => value + 1)} t={t} />}
      {resource.status === 'ready' && <HistoryResults data={resource.data} onSelect={onSelect} onViewBatch={viewBatch}
        onQr={(record) => setQrBatch({ batchId: record.scan.batch_id, sampleType: record.scan.sample_type })}
        onPage={(offset) => setQuery((current) => ({ ...current, offset }))}
        onPageSize={(limit) => setQuery((current) => ({ ...current, limit, offset: 0 }))}
        onReset={reset} canWrite={canWrite} t={t} batchDetailsId={`${id}-batch-details`} qrId={`${id}-qr`} />}
    </div>
    <div id={`${id}-batch-details`}>{selectedBatch && <BatchTrends key={`${JSON.stringify(selectedBatch)}:${refreshKey}`} api={api} {...selectedBatch} t={t}
      renderSummary={(records) => <BatchComparison records={records} record={boundedComparisonRecords(records)[0]} t={t} />} />}</div>
    <div id={`${id}-qr`}>{qrBatch && <><div className="fh-actions fh-detail-actions"><button type="button" className="text-button" onClick={() => setQrBatch(null)}>{t('Close QR label')}</button></div><BatchQr key={JSON.stringify(qrBatch)} {...qrBatch} t={t} /></>}</div>
  </section>;
}

export function HistoryResults({ data, onSelect, onViewBatch, onQr, onPage, onPageSize, onReset, canWrite, t = english, batchDetailsId, qrId }) {
  const page = historyPagination(data);
  const id = useId();
  return <>
    <p className="fh-count" role="status">{t('Showing {start}–{end} of {total} saved scans.', { start: page.start, end: page.end, total: data.total })}</p>
    {!data.items.length ? <div className="fh-empty" role="status">
      <p>{t(data.total > 0 ? 'This page has no scans. Return to an earlier page or reset the filters.' : 'No saved scans match these filters.')}</p>
      <div className="fh-actions"><button className="secondary-button" type="button" onClick={onReset}>{t('Reset filters')}</button>{canWrite && <a className="secondary-button" href="#scan">{t('Start a screening')}</a>}</div>
    </div> : <div className="fh-table-scroll" role="region" tabIndex={0} aria-label={t('Saved scan search results')}>
      <table className="fh-history-table"><caption>{t('Saved scans matching the applied filters')}</caption>
        <thead><tr>{['Batch / farm', 'Sample', 'Saved at (UTC)', 'Quality / 100', 'Risk level', 'Actions', 'Report'].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{data.items.map((record, index) => {
          const scan = record.scan;
          const risk = record.result?.risk_level;
          const batchValid = typeof scan.batch_id === 'string' && scan.batch_id.length > 0 && SAMPLE_TYPES.includes(scan.sample_type);
          return <tr key={`${scan.id}-${index}`}>
            <th scope="row"><strong>{scan.batch_id}</strong><span className="fh-farm-name">{t('Farm: {farm}', { farm: scan.farm_id || t('Not recorded') })}</span></th>
            <td>{SAMPLE_TYPES.includes(scan.sample_type) ? t(scan.sample_type === 'feed' ? 'Feed' : 'Silage') : t('Not recorded')}</td>
            <td>{formatScanDate(record) || t('Not recorded')}</td><td>{finiteMeasurement(record.result?.quality_score) ?? t('Not recorded')}</td>
            <td><span className={`fh-risk ${RISK_LEVELS.includes(risk) ? `fh-risk-${risk.toLowerCase()}` : ''}`}>{RISK_LEVELS.includes(risk) ? t(risk) : t('Not recorded')}</span></td>
            <td><div className="fh-row-actions">
              <button className="text-button" type="button" onClick={() => onSelect(record)} aria-label={t('View result for batch {batch}, scan {scan}', { batch: scan.batch_id, scan: scan.id })}>{t('View result')}</button>
              <button className="text-button" type="button" disabled={!batchValid} onClick={() => onViewBatch(record)} aria-controls={batchDetailsId} aria-label={t('View batch {batch} trends', { batch: scan.batch_id })}>{t('View batch')}</button>
              <button className="text-button" type="button" disabled={!batchValid} onClick={() => onQr(record)} aria-controls={qrId} aria-label={t('QR label for batch {batch}', { batch: scan.batch_id })}>{t('QR label')}</button>
            </div></td>
      <td><ReportActions record={record} compact t={t} /></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <nav className="fh-pagination" aria-label={t('History pages')}>
      <div className="fh-actions">
        <button className="secondary-button" type="button" disabled={!page.hasPrevious} onClick={() => onPage(0)}>{t('First page')}</button>
        <button className="secondary-button" type="button" disabled={!page.hasPrevious} onClick={() => onPage(page.previous)}>{t('Previous page')}</button>
        <button className="secondary-button" type="button" disabled={!page.hasNext} onClick={() => onPage(page.next)}>{t('Next page')}</button>
        <button className="secondary-button" type="button" disabled={!page.hasNext} onClick={() => onPage(page.lastOffset)}>{t('Last page')}</button>
      </div>
      <label htmlFor={`${id}-limit`}>{t('Scans per page')}<select id={`${id}-limit`} value={data.limit} onChange={(event) => onPageSize(Number(event.target.value))}>
        {[...new Set([25, 50, 100, data.limit])].sort((a, b) => a - b).map((limit) => <option key={limit} value={limit}>{limit}</option>)}
      </select></label>
    </nav>
  </>;
}

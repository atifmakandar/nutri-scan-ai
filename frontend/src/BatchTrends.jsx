import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  buildHistorySearchPath, english, formatScanDate, groupTrendRecords, measurement,
  SAMPLE_TYPES, scanTimestamp, TREND_LIMIT, TREND_METRICS, trendSeries,
} from './history-utils.js';
import './feature-history.css';

export function startScanSearch(api, path, onReady, onError) {
  let active = true;
  const controller = new AbortController();
  async function load() {
    try {
      const data = await api(path, { signal: controller.signal });
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.total) || data.total < 0
        || !Number.isSafeInteger(data.offset) || data.offset < 0
        || !Number.isSafeInteger(data.limit) || data.limit < 1 || data.limit > 100
        || data.items.length > data.limit || data.items.length > data.total
        || data.items.some((record) => !record?.scan || !record?.result)) {
        throw new Error('The server returned an invalid history response.');
      }
      if (active) onReady(data);
    } catch (error) {
      if (active) onError(error);
    }
  }
  load();
  return () => { active = false; controller.abort(); };
}

// Both views hide stale data immediately and ignore settled requests after cleanup,
// even when the caller's API wrapper does not forward the AbortSignal.
export function useScanSearch(api, path, revision = 0) {
  const [resource, setResource] = useState(null);
  useEffect(() => {
    if (!path) return undefined;
    setResource({ api, path, revision, status: 'loading' });
    return startScanSearch(api, path,
      (data) => setResource({ api, path, revision, status: 'ready', data }),
      (error) => setResource({ api, path, revision, status: 'error', error }));
  }, [api, path, revision]);
  if (!path) return { status: 'idle' };
  return resource?.api === api && resource.path === path && resource.revision === revision
    ? resource : { status: 'loading' };
}

export function SearchError({ error, onRetry, t = english }) {
  const message = error?.status === 401 ? 'Sign in again to view saved scans.'
    : error?.status === 403 ? 'You do not have permission to view these scans.'
      : error?.message || 'Saved scans could not be loaded.';
  return <div className="fh-error" role="alert"><p>{t(message)}</p><button className="secondary-button" type="button" onClick={onRetry}>{t('Try again')}</button></div>;
}

export default function BatchTrends({ api, batchId, sampleType, t = english, renderSummary }) {
  const [revision, setRevision] = useState(0);
  const valid = typeof batchId === 'string' && batchId.length > 0 && SAMPLE_TYPES.includes(sampleType);
  const path = valid ? buildHistorySearchPath({ batch_id: batchId, sample_type: sampleType }, { limit: TREND_LIMIT }) : null;
  const resource = useScanSearch(api, path, revision);
  const id = useId();
  return <section className="feature-history fh-trends" aria-labelledby={`${id}-heading`} aria-busy={resource.status === 'loading'}>
    <h3 id={`${id}-heading`}>{t('Batch trends')}{valid && <> — {batchId} · {t(sampleType === 'feed' ? 'Feed' : 'Silage')}</>}</h3>
    {!valid && <p className="fh-empty" role="status">{t('Choose a batch and sample type to view trends.')}</p>}
    {resource.status === 'loading' && <p className="fh-empty" role="status">{t('Loading batch trends…')}</p>}
    {resource.status === 'error' && <SearchError error={resource.error} onRetry={() => setRevision((value) => value + 1)} t={t} />}
    {resource.status === 'ready' && <BatchTrendData key={path} items={resource.data.items} total={resource.data.total} batchId={batchId} sampleType={sampleType} t={t} renderSummary={renderSummary} />}
  </section>;
}

export function BatchTrendData({ items, total, batchId, sampleType, t = english, renderSummary }) {
  const { groups, excluded } = useMemo(() => groupTrendRecords(items, batchId, sampleType), [items, batchId, sampleType]);
  const [selectedFarm, setSelectedFarm] = useState('');
  const farm = groups.length === 1 ? groups[0] : groups.find((group) => group.farmId === selectedFarm);
  const id = useId();
  return <div className="fh-trend-data">
    <p role="status">{t('Loaded {count} of {total} matching saved scans (latest {limit} maximum).', { count: items.length, total, limit: TREND_LIMIT })}</p>
    {total > items.length && <p className="fh-note">{t('Older scans are not included in these trends. Use history pagination to view them.')}</p>}
    <p className="fh-note">{t('Time axis: scan saved at (UTC), oldest to newest. Missing dates, timezones, or measurements are omitted from charts and shown as Not recorded in the table.')}</p>
    {excluded > 0 && <p className="fh-notice" role="status">{t('{count} scans were excluded because their batch, sample type, or farm identity did not match.', { count: excluded })}</p>}
    {!groups.length && <p className="fh-empty" role="status">{t('No matching scans are available for this batch and sample type.')}</p>}
    {groups.length > 1 && <label className="fh-farm-select" htmlFor={`${id}-farm`}>{t('Farm for these trends')}
      <select id={`${id}-farm`} value={farm?.farmId || ''} onChange={(event) => setSelectedFarm(event.target.value)}>
        <option value="">{t('Choose a farm')}</option>
        {groups.map((group) => <option key={group.farmId} value={group.farmId}>{group.farmId} ({group.records.length})</option>)}
      </select>
    </label>}
    {groups.length > 1 && !farm && <p className="fh-empty" role="status">{t('This batch appears on multiple farms. Choose one farm to keep its trends separate.')}</p>}
    {farm && <>
      <h4>{t('Farm: {farm}', { farm: farm.farmId })}</h4>
      <p>{t('{count} scans for this farm in the loaded sample.', { count: farm.records.length })}</p>
      {typeof renderSummary === 'function' && renderSummary(farm.records)}
      <div className="fh-charts">{TREND_METRICS.map((metric) => <TrendChart key={metric.key} records={farm.records} metric={metric} t={t} />)}</div>
      <div className="fh-table-scroll" role="region" tabIndex={0} aria-label={t('Batch trend data')}>
        <table className="fh-data-table">
          <caption>{t('Saved measurements — {batch}, {sample}, farm {farm}', { batch: batchId, sample: t(sampleType === 'feed' ? 'Feed' : 'Silage'), farm: farm.farmId })}</caption>
          <thead><tr><th scope="col">{t('Saved at (UTC)')}</th><th scope="col">{t('Scan ID')}</th>{TREND_METRICS.map((metric) => <th scope="col" key={metric.key}>{t(metric.label)} ({t(metric.unit)})</th>)}</tr></thead>
          <tbody>{farm.records.map((record, index) => <tr key={`${record.scan.id}-${index}`}>
            <th scope="row">{formatScanDate(record) || t('Not recorded')}</th><td>{record.scan.id || t('Not recorded')}</td>
            {TREND_METRICS.map((metric) => <td key={metric.key}>{measurement(record, metric.key) ?? t('Not recorded')}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </div>;
}

export function TrendChart({ records, metric, t = english }) {
  const id = useId();
  const { points, segments, omitted } = trendSeries(records, metric.key);
  const dates = records.map(scanTimestamp).filter((value) => value !== null);
  const xMin = dates.length ? Math.min(...dates) : 0;
  const xMax = dates.length ? Math.max(...dates) : 0;
  const values = points.map((point) => point.value);
  // Bounds may expand to show a saved out-of-range value; values themselves are never clamped.
  let yMin = Math.min(...(metric.domain || []), ...values);
  let yMax = Math.max(...(metric.domain || []), ...values);
  if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const x = (timestamp) => xMax === xMin ? 224 : 54 + (timestamp - xMin) / (xMax - xMin) * 340;
  const y = (value) => 152 - (value - yMin) / (yMax - yMin) * 124;
  const title = `${t(metric.label)} (${t(metric.unit)})`;
  const tick = (value) => String(Number(value.toFixed(2)));
  return <figure className="fh-chart">
    <figcaption id={`${id}-caption`}>{title}</figcaption>
    <svg viewBox="0 0 440 210" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{t('{count} recorded measurements, chronological UTC dates. Exact values are in the data table below.', { count: points.length })}</desc>
      <path d="M54 28V152H394" className="fh-axis" />
      {points.length > 0 && <>
        {[yMin, (yMin + yMax) / 2, yMax].map((value) => <g key={value}>
          <line x1="54" x2="394" y1={y(value)} y2={y(value)} className="fh-gridline" />
          <text x="48" y={y(value) + 4} textAnchor="end">{tick(value)}</text>
        </g>)}
        {segments.filter((segment) => segment.length > 1).map((segment, index) => <polyline key={index} points={segment.map((point) => `${x(point.timestamp)},${y(point.value)}`).join(' ')} className="fh-series" />)}
        {points.map((point, index) => <circle key={index} cx={x(point.timestamp)} cy={y(point.value)} r="4" className="fh-point"><title>{`${formatScanDate(point.record)}: ${point.value} ${t(metric.unit)}`}</title></circle>)}
        <text x="54" y="174">{new Date(xMin).toISOString().slice(0, 10)}</text>
        <text x="394" y="174" textAnchor="end">{new Date(xMax).toISOString().slice(0, 10)}</text>
        <text x="224" y="195" textAnchor="middle">{t('Saved at (UTC)')}</text>
      </>}
      {!points.length && <text x="224" y="95" textAnchor="middle">{t('No recorded measurements')}</text>}
    </svg>
    {points.length < 2 && <p className="fh-note" role="status">{t('At least two recorded measurements are needed to show a trend.')}</p>}
    {omitted > 0 && <p className="fh-note">{t('{count} scans omitted from this chart because a date or measurement is missing.', { count: omitted })}</p>}
  </figure>;
}

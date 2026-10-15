import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthPanel from './AuthPanel.jsx';
import FarmerHome from './FarmerHome.jsx';
import FarmerHelp, { MeasurementHelp } from './FarmerHelp.jsx';
import GuidedScreening from './GuidedScreening.jsx';
import InstallApp from './InstallApp.jsx';
import ListenButton from './ListenButton.jsx';
import OfflineStatus from './OfflineStatus.jsx';
import ReportActions from './ReportActions.jsx';
import { LANGUAGES } from './i18n.js';
import { createFarmerTranslator } from './farmer-i18n.js';
import { createEmptyScreening, parseScreening } from './screening.js';
import { reconcileReadingCapture, readingCapturePayload } from './reading-assist.js';
import { createApi } from './api.js';
import './auth-photo.css';
import './drafts.css';
import './styles.css';
import './farmer-app.css';

const FarmerResults = lazy(() => import('./FarmerResults.jsx'));
const HistoryPanel = lazy(() => import('./HistoryPanel.jsx'));
const DraftsPanel = lazy(() => import('./DraftsPanel.jsx'));
const PhotoEvidence = lazy(() => import('./PhotoEvidence.jsx'));
const FieldworkHub = lazy(() => import('./FieldworkHub.jsx'));
const ReadingAssist = lazy(() => import('./ReadingAssist.jsx'));

const api = createApi({
  base: import.meta.env.DEV ? '' : import.meta.env.VITE_PUBLIC_API_URL || import.meta.env.VITE_API_URL || '',
  onUnauthorized: () => window.dispatchEvent(new Event('nutriscan:session-expired')),
});

const stages = [
  'Validating sample inputs',
  'Fusing sensor and visual signals',
  'Estimating nutritional profile',
  'Checking storage and spoilage risk',
  'Generating farmer advisory',
];

export default function App() {
  const [form, setForm] = useState(() => createEmptyScreening());
  const [result, setResult] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [locale, setLocale] = useState(() => {
    try {
      const saved = localStorage.getItem('nutriscan:locale');
      return LANGUAGES.some((language) => language.code === saved) ? saved : 'en';
    } catch { return 'en'; }
  });
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState('');
  const [farmerMode, setFarmerMode] = useState(true);
  const [draftStatus, setDraftStatus] = useState(null);

  const t = useMemo(() => createFarmerTranslator(locale), [locale]);
  const canWrite = session?.user?.role === 'owner' || session?.user?.role === 'member';
  const accountKey = session ? JSON.stringify([session.user.id, session.farm.id, session.user.role]) : 'signed-out';
  const visibleDraftStatus = draftStatus?.accountKey === accountKey ? draftStatus.value : null;
  const latestRecord = session ? selectedRecord || result : null;
  const latest = latestRecord?.result;
  const averageScore = useMemo(() => {
    if (!history.length) return '—';
    return Math.round(history.reduce((sum, item) => sum + item.result.quality_score, 0) / history.length);
  }, [history]);

  useEffect(() => {
    let active = true;
    api('/api/v1/auth/me')
      .then((value) => { if (active) handleSession(value); })
      .catch((requestError) => {
        if (active && requestError.status !== 401) setError(requestError.message);
      })
      .finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('nutriscan:locale', locale); } catch { /* Language is still usable for this session. */ }
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const expired = () => handleSession(null);
    window.addEventListener('nutriscan:session-expired', expired);
    return () => window.removeEventListener('nutriscan:session-expired', expired);
  }, []);

  useEffect(() => {
    const onlineNow = () => setOnline(true);
    const offlineNow = () => setOnline(false);
    window.addEventListener('online', onlineNow);
    window.addEventListener('offline', offlineNow);
    return () => { window.removeEventListener('online', onlineNow); window.removeEventListener('offline', offlineNow); };
  }, []);

  useEffect(() => {
    if (!session?.farm?.id) {
      setHistory([]);
      return;
    }
    setForm((current) => ({ ...current, farm_id: session.farm.id }));
    const controller = new AbortController();
    const identity = session;
    api('/api/v1/scans?limit=8', { signal: controller.signal })
      .then((items) => { if (sessionRef.current === identity) setHistory(items); })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError.status !== 401 && sessionRef.current === identity) setError(requestError.message);
      });
    return () => controller.abort();
  }, [session, historyRevision]);

  async function runScan(event) {
    event.preventDefault();
    if (busy) return;
    if (!session || !canWrite) {
      setError(t('Viewer accounts cannot submit scans or upload photos.'));
      return;
    }
    if (!online) {
      setError(t('You are offline. Save complete readings in drafts and sync when online.'));
      return;
    }
    const cleanForm = reconcileReadingCapture({ ...form, farm_id: session.farm.id });
    const { value: payloadForm, errors } = parseScreening(cleanForm, t);
    if (!payloadForm) {
      setError(Object.values(errors)[0]);
      return;
    }
    setBusy(true);
    setError('');
    setStage(0);
    const identity = session;

    try {
      // Attach the rejection handler immediately; delayed animation must not
      // leave a rejected network promise unhandled.
      const responsePromise = api('/api/v1/scans', { method: 'POST', body: { ...payloadForm, ...readingCapturePayload(cleanForm) } })
        .then((payload) => ({ payload }), (failure) => ({ failure }));

      for (let index = 1; index < stages.length; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        if (sessionRef.current === identity) setStage(index);
      }

      const response = await responsePromise;
      if (sessionRef.current !== identity) return;
      if (response.failure) throw response.failure;
      const { payload } = response;
      setResult(payload);
      setSelectedRecord(payload);
      setHistory((current) => [payload, ...current.filter((item) => item.scan.id !== payload.scan.id)]);
      setStage(stages.length);
      setHistoryRevision((value) => value + 1);
      document.querySelector('#result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (requestError) {
      if (sessionRef.current === identity) {
        setError(requestError.message);
        setStage(-1);
      }
    } finally {
      if (sessionRef.current === identity) setBusy(false);
    }
  }

  function selectSavedRecord(record) {
    if (record?.scan?.farm_id !== sessionRef.current?.farm?.id) return;
    setResult(record);
    setSelectedRecord(record);
    setError('');
    document.querySelector('#result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSynced(record) {
    if (record.scan.farm_id !== sessionRef.current?.farm?.id) return;
    setResult(record);
    setSelectedRecord(record);
    setHistory((current) => [record, ...current.filter((item) => item.scan.id !== record.scan.id)]);
    setHistoryRevision((value) => value + 1);
  }

  const handleSession = useCallback((nextSession) => {
    const previousUser = sessionRef.current?.user?.id;
    const previousFarm = sessionRef.current?.farm?.id;
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (!nextSession || previousUser !== nextSession.user?.id || previousFarm !== nextSession.farm?.id) {
      setResult(null);
      setSelectedRecord(null);
      setHistory([]);
      setBusy(false);
      setStage(-1);
      setError('');
      setForm(createEmptyScreening(nextSession?.farm?.id || ''));
      setDraftStatus(null);
    }
  }, []);

  const changeForm = useCallback((next) => {
    setForm((current) => reconcileReadingCapture(typeof next === 'function' ? next(current) : next));
  }, []);

  function useManagedBatch(batch) {
    if (!canWrite || batch.farm_id !== sessionRef.current?.farm?.id) return;
    const hasReadings = Object.values(form.inputs).some((group) => Object.values(group).some((value) => value !== '' && value != null));
    if (hasReadings && !window.confirm(t('Start fresh readings for this batch? Unsaved form readings will be cleared.'))) return;
    changeForm({ ...createEmptyScreening(session.farm.id), batch_id: batch.batch_id, sample_type: batch.sample_type });
    setError('');
    document.querySelector('#scan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={`app-shell${farmerMode ? ' farmer-mode' : ''}`}>
      <a className="skip-link" href="#scan">{t('Go to screening')}</a>
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Nutri-Scan AI home">
          <span className="brand-mark">N</span>
          <span>nutri<span>scan</span><small>AI</small></span>
        </a>
          <div className="farm-switcher">
            <span className="farm-icon">⌂</span>
            <div><small>{t('ACTIVE FARM')}</small><strong>{session?.farm?.name || t('Sign in')}</strong></div>
          <span className="chevron">⌄</span>
        </div>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#top"><span>◉</span> {t('Overview')}</a>
          <a className="nav-item" href="#scan"><span>＋</span> {t('New screening')}</a>
          <a className="nav-item" href="#result"><span>◌</span> {t('Latest result')}</a>
          <a className="nav-item" href="#history"><span>▤</span> {t('Test history')}</a>
          <a className="nav-item" href="#drafts"><span>▧</span> {t('Offline drafts')}</a>
          <a className="nav-item" href="#fieldwork"><span>✓</span> {t('Farm fieldwork')}</a>
          <a className="nav-item" href="#account"><span>⌂</span> {t('Account')}</a>
        </nav>
        <div className="device-card">
          <div className="device-head"><span className="online-dot" /> <strong>Field unit NS-04</strong></div>
            <p>{t('Prototype input contract ready')}</p>
            <span className="device-link">{t('Manual mode active')}</span>
        </div>
        <div className="sidebar-footer">Designed for field use<br /><span>Screening prototype • v0.2</span></div>
      </aside>

      <main className="workspace" id="top">
        <header className="topbar">
          <div><p className="eyebrow">{t('Nutri-Scan farmer dashboard')}</p><h1>{session?.farm?.name || t('Welcome to Nutri-Scan')}</h1></div>
          <div className="top-actions">
            <label className="language-picker">{t('Language')}<select value={locale} onChange={(event) => setLocale(event.target.value)} aria-label={t('Language')}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
            <button className="secondary-button dashboard-toggle" type="button" aria-pressed={!farmerMode} onClick={() => setFarmerMode((current) => !current)}>{t(farmerMode ? 'Detailed dashboard' : 'Farmer mode')}</button>
            <a className="secondary-button" href="#account">{t('Account')}</a>
            <InstallApp t={t} />
          </div>
        </header>

        <section className="account-area" id="account" aria-label={t('Account')}>
          {!authChecked ? <p className="auth-loading" role="status">{t('Loading…')}</p> : session
            ? <details className="farmer-account-details"><summary>{t('Account and farm members')}</summary><AuthPanel api={api} session={session} onSession={handleSession} t={t} /></details>
            : <AuthPanel api={api} session={session} onSession={handleSession} t={t} />}
        </section>

        {session && <FarmerHome canWrite={canWrite} t={t} />}
        {session && <a className="secondary-button fieldwork-link" href="#fieldwork">{t('Batches, observations, reminders and testing help')} →</a>}
        {session && <div className="farmer-connection"><OfflineStatus online={online} status={visibleDraftStatus} t={t} compact /><a className="secondary-button" href="#drafts">{t('Open saved readings and sync')}</a></div>}

        {!farmerMode && <>
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow light">NUTRI-SCAN AI</p>
            <h2>{t('Know your feed before it reaches the herd.')}</h2>
            <p>{t('Rapid, explainable screening for feed and silage quality — built for confident action at the farm.')}</p>
            <div className="hero-actions"><a className="primary-button" href="#scan">{t('Start a screening')} <span>→</span></a><a className="ghost-button" href="#how-it-works">{t('How it works')}</a></div>
          </div>
          <div className="hero-visual" aria-hidden="true"><div className="sun" /><div className="hill hill-one" /><div className="hill hill-two" /><div className="silo"><i /><i /><i /></div><div className="feed-bag">FEED<br /><small>QUALITY</small></div><span className="sparkle">✦</span></div>
        </section>

        <section className="section-block" aria-labelledby="overview-title">
          <div className="section-heading"><div><p className="eyebrow">{t('TODAY AT A GLANCE')}</p><h2 id="overview-title">{t('Farm status')}</h2></div><span className="last-updated">{t('Updated from saved scans')}</span></div>
          <div className="metrics">
            <article className="metric-card"><span className="metric-icon green">✓</span><div><p>{t('Average quality')}</p><strong>{averageScore}<small>{averageScore === '—' ? '' : ' / 100'}</small></strong><span className="positive">{t('Across {count} saved scans', { count: history.length || 0 })}</span></div></article>
            <article className="metric-card"><span className="metric-icon amber">!</span><div><p>{t('Screening status')}</p><strong>{latest ? t(latest.risk_level) : t('READY')}</strong><span className="warning">{t('Prototype estimate')}</span></div></article>
            <article className="metric-card"><span className="metric-icon blue">⌁</span><div><p>{t('Input channels')}</p><strong>3</strong><span className="muted">{t('Vision · NIR · sensors')}</span></div></article>
          </div>
        </section>

        </>}
        {error && <div className="error-banner" role="alert"><strong>{t('Connection note')}</strong><span>{error}</span></div>}

        <section className="workflow-grid" id="scan">
          <GuidedScreening key={accountKey} form={form} onChange={changeForm} onSubmit={runScan}
            disabled={!session || !canWrite} busy={busy} online={online} history={history} t={t}
            renderAssist={() => <Suspense fallback={<p role="status">{t('Loading…')}</p>}><ReadingAssist key={accountKey} form={form} onChange={changeForm} disabled={busy || !canWrite} t={t} locale={locale} /></Suspense>}
            renderHelp={(fieldKey) => <MeasurementHelp key={`${accountKey}:${fieldKey}`} fieldKey={fieldKey} t={t} locale={locale} />} />

          <section className="result-card" id="result" aria-live="polite">
            <div className="panel-heading"><div><p className="eyebrow">{t('LATEST RESULT')}</p><h2>{latestRecord ? latestRecord.scan.batch_id : t('Awaiting a sample')}</h2></div>{latest && <RiskBadge level={latest.risk_level} t={t} />}</div>
            {!latest ? <EmptyResult t={t} /> : <Suspense fallback={<p role="status">{t('Loading…')}</p>}><FarmerResults key={`${accountKey}:${latestRecord.scan.id}`} record={latestRecord} farmName={session.farm.name} api={api} t={t}
              renderListen={(text) => <ListenButton text={text} locale={locale} t={t} />} /></Suspense>}
            {latestRecord && <ReportActions key={latestRecord.scan.id} record={latestRecord} t={t} />}
          </section>
        </section>

        {busy && <div className="analysis-strip"><div className="analysis-spinner" /><div><strong>{t('AI screening in progress')}</strong><p>{t(stages[Math.min(stage, stages.length - 1)])}…</p></div><span>{Math.min(stage + 1, stages.length)} / {stages.length}</span></div>}

        {!farmerMode && <section className="monitor-card" id="how-it-works">
          <div><p className="eyebrow">{t('FROM SIGNAL TO DECISION')}</p><h2>{t('One screening loop, explained clearly.')}</h2><p>{t('Nutri-Scan combines available field inputs into a transparent risk estimate. Add calibrated hardware and laboratory-labelled models as the product scales.')}</p></div>
          <div className="pipeline"><PipelineStep icon="01" title={t('Capture')} text={t('Image, NIR and sensor signals')} /><span className="pipeline-arrow">→</span><PipelineStep icon="02" title={t('Analyze')} text={t('Validated feature fusion')} /><span className="pipeline-arrow">→</span><PipelineStep icon="03" title={t('Act')} text={t('Advisory and traceability')} /></div>
        </section>}

        {session && <Suspense fallback={<p role="status">{t('Loading saved scans…')}</p>}><HistoryPanel key={accountKey} refreshKey={historyRevision} api={api} onSelect={selectSavedRecord} canWrite={canWrite} t={t} /></Suspense>}
        {session && latestRecord && <Suspense fallback={<p role="status">{t('Loading…')}</p>}><PhotoEvidence key={`${accountKey}:${latestRecord.scan.id}`} api={api} scanId={latestRecord.scan.id} canWrite={canWrite} t={t} /></Suspense>}
        {session && <div id="drafts"><Suspense fallback={<p role="status">{t('Loading…')}</p>}><DraftsPanel key={accountKey} identity={session} form={form} onLoad={(value) => {
          changeForm(value);
          document.querySelector('#scan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }} api={api} onSynced={handleSynced} t={t} online={online} onStatus={(value) => {
          if (sessionRef.current?.user?.id === session.user.id && sessionRef.current?.farm?.id === session.farm.id) setDraftStatus({ accountKey, value });
        }} /></Suspense></div>}

        {session && <Suspense fallback={<p role="status">{t('Loading…')}</p>}><FieldworkHub key={accountKey} api={api} session={session} online={online} onUseBatch={useManagedBatch} t={t} refreshKey={historyRevision} /></Suspense>}
        <FarmerHelp key={accountKey} t={t} locale={locale} />

        {locale !== 'en' && <p className="translation-notice" role="note">{t('Translations are draft guidance; verify safety advice with a qualified expert.')}</p>}
        <footer className="disclaimer"><strong>{t('Prototype screening notice:')}</strong> {t('Nutri-Scan AI provides rapid decision support only. It does not replace certified laboratory testing. Isolate suspicious batches and seek confirmatory testing for safety-critical decisions.')}</footer>
      </main>
    </div>
  );
}

function RiskBadge({ level, t = (value) => value }) {
  return <span className={`risk-badge ${['LOW', 'MEDIUM', 'HIGH'].includes(level) ? level.toLowerCase() : ''}`}><span /> {t(level)} {t('RISK')}</span>;
}

function EmptyResult({ t = (value) => value }) {
  return <div className="empty-result"><div className="empty-icon">⌁</div><h3>{t('Your result will appear here')}</h3><p>{t('Run a sample screening to see quality score, risk signals and a simple next action.')}</p><div className="mini-pipeline"><span>{t('Inputs')}</span><i>→</i><span>{t('AI fusion')}</span><i>→</i><span>{t('Advisory')}</span></div></div>;
}

function PipelineStep({ icon, title, text }) {
  return <div className="pipeline-step"><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div></div>;
}

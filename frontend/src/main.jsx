import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const stages = [
  'Validating sample inputs',
  'Fusing sensor and visual signals',
  'Estimating nutritional profile',
  'Checking storage and spoilage risk',
  'Generating farmer advisory',
];

const initialForm = {
  farm_id: 'demo-farm',
  batch_id: 'SIL-2026-0142',
  sample_type: 'silage',
  source_mode: 'manual',
  inputs: {
    sensor: { moisture_pct: 62, ph: 4.2, temperature_c: 24, humidity_pct: 68 },
    nir: { protein_pct: 8.8, dry_matter_pct: 38, fiber_pct: 28 },
    vision: { mold_score: 0.08, color_anomaly: 0.05, surface_damage: 0.02 },
  },
};

const parameterMeta = [
  ['moisture_pct', 'Moisture', '%'],
  ['dry_matter_pct', 'Dry matter', '%'],
  ['protein_pct', 'Protein', '%'],
  ['fiber_pct', 'Crude fiber', '%'],
  ['ph', 'pH', ''],
  ['temperature_c', 'Temperature', '°C'],
  ['fermentation_quality', 'Fermentation', ''],
  ['spoilage_risk', 'Spoilage risk', ''],
];

const fieldGroups = [
  {
    key: 'sensor',
    title: 'Storage & sensor readings',
    description: 'Manual values now; ESP32 inputs can use the same contract later.',
    fields: [
      ['moisture_pct', 'Moisture', '%', 0, 100, 1],
      ['ph', 'pH', '', 0, 14, 0.1],
      ['temperature_c', 'Temperature', '°C', -20, 80, 0.1],
      ['humidity_pct', 'Humidity', '%', 0, 100, 1],
    ],
  },
  {
    key: 'nir',
    title: 'NIR estimate',
    description: 'Prototype feature inputs for the future calibrated spectroscopy model.',
    fields: [
      ['protein_pct', 'Protein', '%', 0, 100, 0.1],
      ['dry_matter_pct', 'Dry matter', '%', 0, 100, 0.1],
      ['fiber_pct', 'Crude fiber', '%', 0, 100, 0.1],
    ],
  },
  {
    key: 'vision',
    title: 'Visual indicators',
    description: 'Scores range from 0 (not observed) to 1 (strong indicator).',
    fields: [
      ['mold_score', 'Mould indicator', '', 0, 1, 0.01],
      ['color_anomaly', 'Colour anomaly', '', 0, 1, 0.01],
      ['surface_damage', 'Surface damage', '', 0, 1, 0.01],
    ],
  },
];

function App() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState('');

  const latest = result?.result;
  const averageScore = useMemo(() => {
    if (!history.length) return '—';
    return Math.round(history.reduce((sum, item) => sum + item.result.quality_score, 0) / history.length);
  }, [history]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const response = await fetch(`${API}/api/v1/scans?farm_id=${encodeURIComponent(form.farm_id)}&limit=8`);
      if (!response.ok) throw new Error('History could not be loaded.');
      setHistory(await response.json());
    } catch (requestError) {
      setError(`${requestError.message} Start the FastAPI service to connect live data.`);
    }
  }

  function updateField(group, key, value) {
    const numericGroups = ['sensor', 'nir', 'vision'];
    setForm((current) => ({
      ...current,
      inputs: {
        ...current.inputs,
        [group]: {
          ...current.inputs[group],
          [key]: numericGroups.includes(group) ? Number(value) : value,
        },
      },
    }));
  }

  function loadShowcaseSample() {
    setForm({
      ...initialForm,
      batch_id: `SIL-2026-${String(history.length + 143).padStart(4, '0')}`,
    });
    setError('');
  }

  async function runScan(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setStage(0);

    try {
      const responsePromise = fetch(`${API}/api/v1/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      for (let index = 1; index < stages.length; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        setStage(index);
      }

      const response = await responsePromise;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(payload.detail)
          ? payload.detail.map((item) => item.msg).join(', ')
          : payload.detail || 'The scan could not be completed.';
        throw new Error(detail);
      }

      setResult(payload);
      setHistory((current) => [payload, ...current.filter((item) => item.scan.id !== payload.scan.id)]);
      setStage(stages.length);
      document.querySelector('#result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (requestError) {
      setError(requestError.message);
      setStage(-1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Nutri-Scan AI home">
          <span className="brand-mark">N</span>
          <span>nutri<span>scan</span><small>AI</small></span>
        </a>
        <div className="farm-switcher">
          <span className="farm-icon">⌂</span>
          <div><small>ACTIVE FARM</small><strong>Demo Dairy Farm</strong></div>
          <span className="chevron">⌄</span>
        </div>
        <nav aria-label="Main navigation">
          <a className="nav-item active" href="#top"><span>◉</span> Overview</a>
          <a className="nav-item" href="#scan"><span>＋</span> New screening</a>
          <a className="nav-item" href="#result"><span>◌</span> Latest result</a>
          <a className="nav-item" href="#history"><span>▤</span> Test history</a>
        </nav>
        <div className="device-card">
          <div className="device-head"><span className="online-dot" /> <strong>Field unit NS-04</strong></div>
          <p>Prototype input contract ready</p>
          <span className="device-link">Manual mode active</span>
        </div>
        <div className="sidebar-footer">Designed for field use<br /><span>Screening prototype • v0.2</span></div>
      </aside>

      <main className="workspace" id="top">
        <header className="topbar">
          <div><p className="eyebrow">FIELD INTELLIGENCE / 14 OCTOBER 2026</p><h1>Good morning, Atif.</h1></div>
          <div className="top-actions"><span className="sync-state"><span className="online-dot" /> Live API</span><button className="avatar" aria-label="Profile">A</button></div>
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow light">NUTRI-SCAN AI</p>
            <h2>Know your feed before it reaches the herd.</h2>
            <p>Rapid, explainable screening for feed and silage quality — built for confident action at the farm.</p>
            <div className="hero-actions"><a className="primary-button" href="#scan">Start a screening <span>→</span></a><a className="ghost-button" href="#how-it-works">How it works</a></div>
          </div>
          <div className="hero-visual" aria-hidden="true"><div className="sun" /><div className="hill hill-one" /><div className="hill hill-two" /><div className="silo"><i /><i /><i /></div><div className="feed-bag">FEED<br /><small>QUALITY</small></div><span className="sparkle">✦</span></div>
        </section>

        <section className="section-block" aria-labelledby="overview-title">
          <div className="section-heading"><div><p className="eyebrow">TODAY AT A GLANCE</p><h2 id="overview-title">Farm status</h2></div><span className="last-updated">Updated from saved scans</span></div>
          <div className="metrics">
            <article className="metric-card"><span className="metric-icon green">✓</span><div><p>Average quality</p><strong>{averageScore}<small>{averageScore === '—' ? '' : ' / 100'}</small></strong><span className="positive">Across {history.length || 0} saved scans</span></div></article>
            <article className="metric-card"><span className="metric-icon amber">!</span><div><p>Screening status</p><strong>{latest ? latest.risk_level : 'READY'}</strong><span className="warning">Prototype estimate</span></div></article>
            <article className="metric-card"><span className="metric-icon blue">⌁</span><div><p>Input channels</p><strong>3</strong><span className="muted">Vision · NIR · sensors</span></div></article>
          </div>
        </section>

        {error && <div className="error-banner" role="alert"><strong>Connection note</strong><span>{error}</span></div>}

        <section className="workflow-grid" id="scan">
          <form className="scan-card" onSubmit={runScan}>
            <div className="panel-heading"><div><p className="eyebrow">RAPID SCREENING</p><h2>Start a sample test</h2></div><span className="step-pill">01 / 02</span></div>
            <p className="panel-copy">Enter the readings available at the farm. The API saves the batch and returns an explainable screening estimate.</p>
            <div className="form-row">
              <label>Farm ID<input value={form.farm_id} onChange={(event) => setForm({ ...form, farm_id: event.target.value })} required /></label>
              <label>Batch ID<input value={form.batch_id} onChange={(event) => setForm({ ...form, batch_id: event.target.value })} required /></label>
            </div>
            <div className="form-row">
              <label>Sample type<select value={form.sample_type} onChange={(event) => setForm({ ...form, sample_type: event.target.value })}><option value="silage">Silage</option><option value="feed">Cattle feed</option></select></label>
              <label>Input source<select value={form.source_mode} onChange={(event) => setForm({ ...form, source_mode: event.target.value })}><option value="manual">Manual entry</option><option value="mobile">Mobile capture</option><option value="esp32">ESP32 field unit</option></select></label>
            </div>
            {fieldGroups.map((group) => <FieldGroup key={group.key} group={group} values={form.inputs[group.key]} onChange={updateField} />)}
            <div className="form-actions"><button className="primary-button submit-button" type="submit" disabled={busy}>{busy ? 'Analyzing signals…' : 'Run AI screening'} <span>→</span></button><button className="secondary-button" type="button" onClick={loadShowcaseSample}>Load showcase sample</button></div>
            <p className="form-footnote">Values are validated before analysis. No laboratory or sensor certification is implied.</p>
          </form>

          <section className="result-card" id="result" aria-live="polite">
            <div className="panel-heading"><div><p className="eyebrow">LATEST RESULT</p><h2>{result ? result.scan.batch_id : 'Awaiting a sample'}</h2></div>{latest && <RiskBadge level={latest.risk_level} />}</div>
            {!latest ? <EmptyResult /> : <ResultView result={latest} sampleType={result.scan.sample_type} />}
          </section>
        </section>

        {busy && <div className="analysis-strip"><div className="analysis-spinner" /><div><strong>AI screening in progress</strong><p>{stages[Math.min(stage, stages.length - 1)]}…</p></div><span>{Math.min(stage + 1, stages.length)} / {stages.length}</span></div>}

        <section className="monitor-card" id="how-it-works">
          <div><p className="eyebrow">FROM SIGNAL TO DECISION</p><h2>One screening loop, explained clearly.</h2><p>Nutri-Scan combines available field inputs into a transparent risk estimate. Add calibrated hardware and laboratory-labelled models as the product scales.</p></div>
          <div className="pipeline"><PipelineStep icon="01" title="Capture" text="Image, NIR and sensor signals" /><span className="pipeline-arrow">→</span><PipelineStep icon="02" title="Analyze" text="Validated feature fusion" /><span className="pipeline-arrow">→</span><PipelineStep icon="03" title="Act" text="Advisory and traceability" /></div>
        </section>

        <section className="history-section" id="history">
          <div className="section-heading"><div><p className="eyebrow">TRACEABILITY</p><h2>Recent screening history</h2></div><button className="text-button" onClick={loadHistory}>Refresh history ↻</button></div>
          <div className="table-wrap">{history.length === 0 ? <div className="history-empty">Your completed screenings will appear here after the first scan.</div> : <table><thead><tr><th>Batch</th><th>Sample</th><th>Screened</th><th>Score</th><th>Status</th></tr></thead><tbody>{history.map((item) => <HistoryRow key={item.scan.id} item={item} />)}</tbody></table>}</div>
        </section>

        <footer className="disclaimer"><strong>Prototype screening notice:</strong> Nutri-Scan AI provides rapid decision support only. It does not replace certified laboratory testing. Isolate suspicious batches and seek confirmatory testing for safety-critical decisions.</footer>
      </main>
    </div>
  );
}

function FieldGroup({ group, values, onChange }) {
  return <fieldset className="field-group"><legend>{group.title}</legend><p>{group.description}</p><div className="field-grid">{group.fields.map(([key, label, unit, min, max, step]) => <label key={key}>{label}{unit && <span className="field-unit">{unit}</span>}<input type="number" min={min} max={max} step={step} value={values[key]} onChange={(event) => onChange(group.key, key, event.target.value)} required /></label>)}</div></fieldset>;
}

function RiskBadge({ level }) {
  return <span className={`risk-badge ${level.toLowerCase()}`}><span /> {level} RISK</span>;
}

function EmptyResult() {
  return <div className="empty-result"><div className="empty-icon">⌁</div><h3>Your result will appear here</h3><p>Run a sample screening to see quality score, risk signals and a simple next action.</p><div className="mini-pipeline"><span>Inputs</span><i>→</i><span>AI fusion</span><i>→</i><span>Advisory</span></div></div>;
}

function ResultView({ result, sampleType }) {
  const scoreColor = result.risk_level === 'LOW' ? '#4f9b6d' : result.risk_level === 'MEDIUM' ? '#c88434' : '#c35548';
  return <div className="result-view"><div className="score-row"><div className="score-ring" style={{ background: `conic-gradient(${scoreColor} ${result.quality_score}%, #e5ece5 0)` }}><strong>{Math.round(result.quality_score)}</strong><span>/100</span></div><div><p className="score-kicker">{sampleType} screening</p><h3>{result.risk_level === 'LOW' ? 'Good quality' : result.risk_level === 'MEDIUM' ? 'Review before use' : 'High risk detected'}</h3><p className="score-copy">Confidence indicator: <strong>{Math.round(result.confidence)}%</strong></p></div></div><div className="confidence-bar"><span style={{ width: `${result.confidence}%` }} /></div><div className="parameter-grid">{parameterMeta.map(([key, label, unit]) => <div className="parameter" key={key}><span>{label}</span><strong>{result.parameters[key] ?? '—'}{unit && result.parameters[key] !== undefined ? ` ${unit}` : ''}</strong></div>)}</div><div className="advisory-box"><span className="advisory-icon">✦</span><div><p className="eyebrow">RECOMMENDED NEXT STEP</p><strong>{result.advisory[0]}</strong>{result.advisory.slice(1).map((item) => <p key={item}>{item}</p>)}</div></div><div className="assessment-note"><span>ⓘ</span><span><strong>Prototype AI estimate</strong> · {result.assessment.model_version} · {result.assessment.calibration_status}</span></div></div>;
}

function HistoryRow({ item }) {
  const created = new Date(item.scan.created_at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return <tr><td><strong>{item.scan.batch_id}</strong></td><td>{item.scan.sample_type}</td><td>{created}</td><td><span className="score-cell">{Math.round(item.result.quality_score)}</span></td><td><span className={`status ${item.result.risk_level.toLowerCase()}`}>{item.result.risk_level === 'LOW' ? 'Screening clear' : 'Review advised'}</span></td></tr>;
}

function PipelineStep({ icon, title, text }) {
  return <div className="pipeline-step"><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);

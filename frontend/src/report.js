const MISSING = 'Not recorded';
const URL_LIFETIME_MS = 60_000;

const PARAMETER_META = new Map([
  ['moisture_pct', ['Moisture', '%']],
  ['dry_matter_pct', ['Dry matter', '%']],
  ['protein_pct', ['Protein', '%']],
  ['fiber_pct', ['Crude fiber', '%']],
  ['ph', ['pH', 'unitless']],
  ['temperature_c', ['Temperature', '°C']],
  ['fermentation_quality', ['Fermentation quality', '—']],
  ['spoilage_risk', ['Spoilage risk', '—']],
  ['nutritional_score', ['Nutritional score', '/ 100']],
  ['humidity_pct', ['Humidity', '%']],
  ['mold_score', ['Mould indicator', '0–1 scale']],
  ['color_anomaly', ['Colour anomaly', '0–1 scale']],
  ['surface_damage', ['Surface damage', '0–1 scale']],
  ['energy_mj_per_kg', ['Reported energy value', 'MJ/kg']],
  ['calcium_pct', ['Reported calcium', '%']],
  ['phosphorus_pct', ['Reported phosphorus', '%']],
  ['mineral_concern_score', ['Mineral concern input', '0–1 scale']],
  ['urea_concern_score', ['Urea concern input', '0–1 scale']],
  ['sand_silica_concern_score', ['Sand/silica concern input', '0–1 scale']],
  ['aflatoxin_concern_score', ['Aflatoxin concern input', '0–1 scale']],
  ['fungal_concern_score', ['Fungal concern input', '0–1 scale']],
]);

function isDictionary(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateRecord(record) {
  if (!isDictionary(record) || !isDictionary(record.scan) || !isDictionary(record.result)) {
    throw new Error('A saved scan with scan and result objects is required to create a report.');
  }
}

function text(value, fallback = MISSING) {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function score(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? `${value} / 100`
    : MISSING;
}

function savedDate(value) {
  if (typeof value !== 'string' || !value.trim()) return MISSING;
  // Never let the machine's local timezone supply missing snapshot information.
  const withTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  if (withTimezone.test(value) && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString().replace('T', ' ').replace('Z', ' UTC');
  }
  const withoutTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  return withoutTimezone.test(value)
    ? `${value.replace('T', ' ')} (timezone not recorded)`
    : `${value} (unrecognized saved date; timezone unavailable)`;
}

function detail(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function savedList(values, emptyMessage) {
  if (!Array.isArray(values) || values.length === 0) return `<p>${escapeHtml(emptyMessage)}</p>`;
  return `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function capabilitySignals(values) {
  if (!Array.isArray(values) || values.length === 0) return '<p>No optional capability inputs recorded.</p>';
  const labels = {
    energy_reported: 'Reported energy value', minerals_reported: 'Reported mineral values',
    mineral_concern: 'Mineral concern input', urea_concern: 'Urea concern input',
    sand_silica_concern: 'Sand/silica concern input', aflatoxin_concern: 'Aflatoxin concern input',
    fungal_concern: 'Fungal concern input',
  };
  return `<ul>${values.map((signal) => `<li>${escapeHtml(labels[signal?.code] || signal?.code)} — ${escapeHtml(signal?.status === 'reported' ? 'Reported input' : 'Qualified confirmation required')}</li>`).join('')}</ul>`;
}

const SCORE_FACTOR_LABELS = {
  ph_fit: 'pH fit', moisture_fit: 'Moisture fit', nutrition_indicator: 'Nutrition indicator', visual_indicator: 'Visual indicator',
};

function scoreBreakdown(values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const rows = values.map((factor) => `<tr><th scope="row">${escapeHtml(SCORE_FACTOR_LABELS[factor?.code] || factor?.code)}</th><td>${escapeHtml(text(factor?.score))} / 100</td><td>${escapeHtml(typeof factor?.weight === 'number' && Number.isFinite(factor.weight) ? `${Math.round(factor.weight * 100)}%` : MISSING)}</td><td>${escapeHtml(typeof factor?.contribution === 'number' && Number.isFinite(factor.contribution) ? `${factor.contribution} points` : MISSING)}</td></tr>`).join('');
  return `<section aria-labelledby="breakdown-heading">
    <h2 id="breakdown-heading">Transparent score breakdown</h2>
    <p class="subtle">Each factor is a weighted prototype contribution; it is not a validated model explanation.</p>
    <table><caption>Prototype factor contributions</caption><thead><tr><th scope="col">Factor</th><th scope="col">Factor score</th><th scope="col">Weight</th><th scope="col">Contribution</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function reviewRequired(values) {
  if (!Array.isArray(values)) return '';
  const labels = {
    mineral_concern: 'Mineral concern input', urea_concern: 'Urea concern input',
    sand_silica_concern: 'Sand/silica concern input', aflatoxin_concern: 'Aflatoxin concern input', fungal_concern: 'Fungal concern input',
  };
  const signals = values.filter((signal) => signal?.status === 'review_required');
  if (!signals.length) return '';
  return `<section class="review-required" aria-labelledby="review-required-heading">
    <h2 id="review-required-heading">Review required before feeding decisions</h2>
    <p>One or more operator- or laboratory-supplied concern inputs need qualified confirmation. This is not a detection result and does not change the prototype score.</p>
    <ul>${signals.map((signal) => `<li>${escapeHtml(labels[signal?.code] || signal?.code)}</li>`).join('')}</ul>
  </section>`;
}

function measurements(parameters) {
  const entries = isDictionary(parameters) ? Object.entries(parameters) : [];
  if (entries.length === 0) return '<p>No measurements recorded.</p>';
  const rows = entries.map(([key, value]) => {
    const [label, unit] = PARAMETER_META.get(key) || [key, 'Not specified'];
    return `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join('');
  return `<table><caption>Saved measurement and screening outputs</caption>
    <thead><tr><th scope="col">Measurement</th><th scope="col">Value</th><th scope="col">Unit / scale</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

const REPORT_STYLES = `
  :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #223b30; background: #f1f5f0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 15px; line-height: 1.6; }
  main { max-width: 960px; margin: 24px auto; padding: 36px; background: #fff; border: 1px solid #d6e1d6; border-radius: 12px; }
  h1, h2, p { margin: 0 0 12px; }
  h1 { font-size: 30px; line-height: 1.2; }
  h2 { font-size: 19px; color: #215b3c; }
  header { border-bottom: 3px solid #36704c; padding-bottom: 20px; }
  section { margin-top: 26px; }
  .brand { color: #215b3c; font-weight: 750; letter-spacing: .08em; }
  .subtle { color: #506357; }
  .report-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 20px; }
  .report-actions p { margin: 0; }
  button { background: #245b3c; color: #fff; border: 2px solid #245b3c; border-radius: 6px; padding: 10px 18px; font: inherit; font-weight: 700; cursor: pointer; }
  button:focus-visible { outline: 3px solid #956421; outline-offset: 3px; }
  .disclaimer { border: 2px solid #506c42; border-left-width: 8px; background: #f4f6e9; padding: 18px; }
  .review-required { border: 2px solid #982e26; border-left-width: 8px; background: #fff0ed; padding: 18px; }
  .disclaimer h2 { color: #334b27; }
  .disclaimer p:last-child { margin-bottom: 0; }
  dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; margin: 0; }
  dt { color: #506357; font-size: 13px; font-weight: 650; }
  dd { margin: 3px 0 0; white-space: pre-wrap; }
  .scores { grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #d6e1d6; padding: 18px; border-radius: 6px; margin-bottom: 12px; }
  .scores dd { font-size: 22px; font-weight: 700; }
  .risk-low { color: #245b3c; }
  .risk-medium { color: #795117; }
  .risk-high { color: #982e26; }
  .risk-unknown { color: #43564a; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  caption { text-align: left; color: #506357; padding-bottom: 8px; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid #d6e1d6; }
  thead { background: #edf3ed; }
  tbody th { font-weight: 500; }
  td, li { white-space: pre-wrap; }
  ul { padding-left: 24px; margin: 0; }
  li + li { margin-top: 8px; }
  h1, h2, p, dt, dd, th, td, li { overflow-wrap: anywhere; }
  footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #d6e1d6; font-size: 13px; color: #506357; }
  @media (max-width: 600px) {
    main { margin: 0; padding: 20px; border-radius: 0; }
    dl, .scores { grid-template-columns: 1fr; }
    th, td { padding: 8px 4px; }
  }
  @page { margin: 16mm; }
  @media print {
    :root, body { background: #fff; color: #16251d; }
    body { font-size: 10.5pt; }
    main { max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; }
    .report-actions { display: none !important; }
    h1 { font-size: 23pt; }
    h2 { font-size: 14pt; break-after: avoid; }
    dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .scores { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .scores dd { font-size: 16pt; }
    .disclaimer, dl > div, tr, li { break-inside: avoid; }
    thead { display: table-header-group; }
    p, li { orphans: 3; widows: 3; }
  }
`;

/** Render only the supplied saved ScanResponse; no browser or network is needed. */
export function buildReportHtml(record) {
  validateRecord(record);
  const { scan, result } = record;
  const assessment = isDictionary(result.assessment) ? result.assessment : {};
  // Only these fixed classes can enter markup, even for an unexpected risk string.
  const riskClass = result.risk_level === 'LOW' ? 'risk-low'
    : result.risk_level === 'MEDIUM' ? 'risk-medium'
      : result.risk_level === 'HIGH' ? 'risk-high' : 'risk-unknown';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nutri-Scan AI report — ${escapeHtml(scan.batch_id)} — ${escapeHtml(scan.id)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
<main>
  <header>
    <p class="brand">NUTRI-SCAN AI</p>
    <h1>Feed &amp; silage screening report</h1>
    <p class="subtle">Saved scan snapshot · Batch ${escapeHtml(scan.batch_id)}</p>
    <div class="report-actions">
      <button type="button" onclick="window.print()">Print / Save PDF</button>
      <p>Use Ctrl+P (Windows/Linux) or Cmd+P (Mac) to print. Select “Save as PDF” in the print dialog to save a PDF.</p>
    </div>
  </header>

  <section class="disclaimer" aria-labelledby="disclaimer-heading">
    <h2 id="disclaimer-heading">Uncalibrated prototype — not a certified laboratory report</h2>
    <p>This is a prototype screening snapshot, not a certified laboratory result. Measurements and model outputs require validation against laboratory reference methods.</p>
    <p><strong>A low risk label does not guarantee safety or suitability for feeding.</strong> Use qualified advice and confirmatory laboratory testing for feeding and safety decisions.</p>
  </section>

  <section aria-labelledby="traceability-heading">
    <h2 id="traceability-heading">Sample &amp; traceability</h2>
    <dl>
      ${detail('Farm ID', scan.farm_id)}
      ${detail('Batch ID', scan.batch_id)}
      ${detail('Scan ID', scan.id)}
      ${detail('Result ID', result.id)}
      ${detail('Sample type', scan.sample_type)}
      ${detail('Source mode', scan.source_mode)}
      ${detail('Device ID', scan.device_id)}
      ${detail('Collected at', savedDate(scan.collected_at))}
      ${detail('Scan saved at', savedDate(scan.created_at))}
      ${detail('Result created at', savedDate(result.created_at))}
      ${detail('Result sample type', result.sample_type)}
    </dl>
    <p class="subtle">Dates with a recorded timezone are displayed in UTC. Missing timezone information is explicitly marked.</p>
  </section>

   <section aria-labelledby="screening-heading">
    <h2 id="screening-heading">Screening summary</h2>
    <dl class="scores">
      ${detail('Quality score', score(result.quality_score))}
      <div><dt>Risk level</dt><dd class="${riskClass}">${escapeHtml(result.risk_level)}</dd></div>
      ${detail('Heuristic confidence', score(result.confidence))}
    </dl>
    <p>Heuristic confidence is a prototype indicator, not a validated probability or a measure of diagnostic accuracy.</p>
   </section>
   ${reviewRequired(result.capability_signals)}
   ${scoreBreakdown(result.score_breakdown)}

   <section aria-labelledby="measurements-heading">
     <h2 id="measurements-heading">Measurements</h2>
     <p class="subtle">Reported nutrition values and concern inputs are operator- or laboratory-supplied. They are not confirmed detection results.</p>
     ${measurements(result.parameters)}
  </section>
  <section aria-labelledby="anomalies-heading">
    <h2 id="anomalies-heading">Anomalies &amp; indicators</h2>
    ${savedList(result.anomalies, 'No anomaly entries recorded.')}
  </section>
  <section aria-labelledby="advisory-heading">
    <h2 id="advisory-heading">Advisories</h2>
    ${savedList(result.advisory, 'No advisory entries recorded.')}
  </section>
  <section aria-labelledby="capability-heading">
    <h2 id="capability-heading">Capability inputs &amp; review flags</h2>
    <p>These values are operator- or laboratory-supplied. They are not confirmed detection results and do not establish safety.</p>
    ${capabilitySignals(result.capability_signals)}
  </section>
  <section aria-labelledby="model-heading">
    <h2 id="model-heading">Model &amp; calibration</h2>
    <dl>
      ${detail('Assessment kind', assessment.kind)}
      ${detail('Model version', assessment.model_version)}
      ${detail('Calibration status', assessment.calibration_status)}
    </dl>
  </section>
  <footer>Nutri-Scan AI · Saved screening snapshot. Values are reproduced from the supplied saved record; no new analysis is performed for this report.</footer>
</main>
</body>
</html>`;
}

function filenamePart(value, fallback) {
  // ASCII-only, bounded components avoid path separators, control characters,
  // Windows device names (the full name has a fixed prefix), and trailing dots.
  return text(value, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '').slice(0, 48).replace(/[-_]+$/g, '') || fallback;
}

/** A portable ASCII filename, at most 120 characters including the extension. */
export function reportFilename(record) {
  validateRecord(record);
  return `nutri-scan-report-${filenamePart(record.scan.batch_id, 'batch')}-${filenamePart(record.scan.id, 'scan')}.html`;
}

/** Start an HTML download synchronously; returns the filename, not completion. */
export function downloadReport(record, browser = globalThis.window) {
  const html = buildReportHtml(record);
  const filename = reportFilename(record);
  if (!browser?.document?.body || typeof browser.document.createElement !== 'function'
    || typeof browser.Blob !== 'function' || typeof browser.URL?.createObjectURL !== 'function'
    || typeof browser.URL?.revokeObjectURL !== 'function' || typeof browser.setTimeout !== 'function') {
    throw new Error('Downloading a report requires a browser with HTML download support.');
  }

  let anchor;
  let url;
  try {
    const blob = new browser.Blob([html], { type: 'text/html;charset=utf-8' });
    url = browser.URL.createObjectURL(blob);
    anchor = browser.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    browser.document.body.appendChild(anchor);
    anchor.click();
  } catch (cause) {
    throw new Error('The report download could not be started. Please try again.', { cause });
  } finally {
    try {
      anchor?.remove();
    } finally {
      // Browsers may consume a download URL after click() returns. Keep it alive
      // for a full minute, including when a click or DOM operation fails.
      if (url) browser.setTimeout(() => browser.URL.revokeObjectURL(url), URL_LIFETIME_MS);
    }
  }
  return filename;
}

/** Call directly in a click handler. Returns the opened report window. */
export function printReport(record, browser = globalThis.window) {
  const html = buildReportHtml(record);
  const popupHelp = 'Allow popups for this site or open the downloaded HTML report to print.';
  if (typeof browser?.open !== 'function') {
    throw new Error(`Printing a report requires a browser. ${popupHelp}`);
  }

  let popup;
  try {
    popup = browser.open('about:blank', '_blank');
  } catch (cause) {
    throw new Error(`The report window could not be opened. ${popupHelp}`, { cause });
  }
  if (!popup || popup.closed) {
    throw new Error(`The report popup was blocked. ${popupHelp}`);
  }

  try {
    popup.opener = null;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  } catch (cause) {
    try { popup.close(); } catch { /* Keep the original preparation error. */ }
    throw new Error(`The report window could not be prepared. ${popupHelp}`, { cause });
  }
  return popup;
}

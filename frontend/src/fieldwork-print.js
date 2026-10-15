import { fieldworkText } from './fieldwork-messages.js';

export function escapeFieldworkHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/** Only a persisted testing request can be printed. No live-form values are read. */
export function buildFieldworkRequestHtml(record, t) {
  if (!record?.id || !record.farm_id || !record.created_at || !['requested', 'collected', 'report_received'].includes(record.status)) {
    throw new Error('Choose a saved testing request to print.');
  }
  const tr = (key) => fieldworkText(t, key);
  const escape = escapeFieldworkHtml;
  const rows = [
    ['Request ID', record.id], ['Farm ID', record.farm_id], ['Batch ID', record.batch_id],
    ['Sample type', tr(record.sample_type === 'silage' ? 'Silage' : 'Feed')],
    ['Requested on', record.requested_on], ['Status', tr({ requested: 'Requested', collected: 'Collected', report_received: 'Report received' }[record.status])],
    ['Collected on', record.collected_on], ['Report received on', record.report_received_on],
    ['Contact name', record.contact_name], ['Contact details', record.contact_details], ['Notes', record.notes],
  ];
  const locale = ['hi', 'mr'].includes(t?.locale) ? t.locale : 'en';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(tr('Saved testing request'))} — ${escape(record.batch_id)}</title>
<style>body{font:18px/1.6 system-ui,sans-serif;color:#183c2c;margin:24px auto;padding:20px;max-width:850px}h1{font-size:28px}dt{font-weight:700}dd{margin:0 0 16px;white-space:pre-wrap}p,dd{overflow-wrap:anywhere}button{font:inherit;padding:12px;min-height:48px}aside{border:2px solid;padding:16px}@media print{button,.print-help{display:none}body{margin:0;padding:0}dl>div{break-inside:avoid}}</style></head><body>
<h1>${escape(tr('Saved testing request'))}</h1><aside>${escape(tr('Farm tracking only. This request is not sent or booked automatically.'))}</aside>
<p class="print-help">${escape(tr('Use Print / Save PDF or your browser print command.'))}</p><button type="button" onclick="window.print()">${escape(tr('Print / Save PDF'))}</button>
<dl>${rows.map(([label, value]) => `<div><dt>${escape(tr(label))}</dt><dd>${escape(value || tr('Not recorded'))}</dd></div>`).join('')}</dl>
<h2>${escape(tr('Collection checklist'))}</h2><ul>${[
    'Ask your chosen qualified testing provider which sample, container, quantity, storage, and delivery method they require.',
    'Label the sample with its batch ID, sample type, and collection date; keep different batches separate.',
    'Arrange collection and contact the provider yourself. Follow their instructions before collecting.',
  ].map((key) => `<li>${escape(tr(key))}</li>`).join('')}</ul>
<p>${escape(tr('Saved farm record only; this summary is not a laboratory report.'))}</p></body></html>`;
}

export function printFieldworkRequest(record, t, browser = globalThis.window) {
  const html = buildFieldworkRequestHtml(record, t);
  let popup;
  try { popup = browser?.open('about:blank', '_blank'); } catch { /* Show the same actionable fallback. */ }
  if (!popup || popup.closed) throw new Error('Allow popups, then choose Print saved request again.');
  try {
    popup.opener = null;
    popup.document.open(); popup.document.write(html); popup.document.close();
  } catch {
    try { popup.close(); } catch { /* Preserve the preparation error. */ }
    throw new Error('The print summary could not be prepared. Try again.');
  }
  return popup;
}

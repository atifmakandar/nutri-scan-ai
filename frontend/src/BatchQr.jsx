import React, { useEffect, useId, useState } from 'react';
import { buildBatchUrl, english, isLoopbackUrl, qrFilename, SAMPLE_TYPES } from './history-utils.js';
import './feature-history.css';

const AUTH_NOTE = 'Sign-in is required to view saved scans. This QR contains only the app URL, batch ID, and sample type; it does not grant access.';
const NETWORK_NOTE = 'A localhost or loopback QR link cannot be opened on another device. Open this app using a deployed or private LAN URL before generating a label.';

export async function generateBatchQr(url) {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { type: 'image/png', errorCorrectionLevel: 'M', margin: 4, width: 320 });
}

// Build the print document with DOM text nodes, never user-derived HTML.
// The preview's explicit Print button waits for its offline PNG to load.
export function printQrLabel({ url, dataUrl, batchId, sampleType, t = english }, browser = globalThis.window) {
  if (!browser?.open) throw new Error('Printing requires a browser window. Download the PNG label instead.');
  const popup = browser.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups to print the QR label, then try again.');
  try {
    popup.opener = null;
    const doc = popup.document;
    doc.title = t('Batch QR label');
    const style = doc.createElement('style');
    style.textContent = 'body{font:16px system-ui,sans-serif;color:#19382d;margin:32px;max-width:640px;overflow-wrap:anywhere}img{display:block;width:320px;max-width:100%;height:auto}button{padding:12px;margin:16px 0}small{display:block;margin-top:12px}@media print{button{display:none}body{margin:0}}';
    doc.head.appendChild(style);
    const append = (tag, text) => {
      const node = doc.createElement(tag);
      node.textContent = text;
      doc.body.appendChild(node);
      return node;
    };
    append('h1', t('Batch QR label'));
    append('h2', batchId);
    append('p', t(sampleType === 'feed' ? 'Feed' : 'Silage'));
    const image = doc.createElement('img');
    image.alt = t('QR code for batch {batch}', { batch: batchId });
    const status = append('p', t('Loading QR image…'));
    status.setAttribute('role', 'status');
    const button = append('button', t('Print label / Save PDF'));
    button.type = 'button';
    button.disabled = true;
    button.addEventListener('click', () => {
      try { popup.print(); } catch { status.textContent = t('Printing could not start. Use your browser print command.'); }
    });
    image.onload = () => { button.disabled = false; status.textContent = t('QR label ready to print.'); };
    image.onerror = () => { status.textContent = t('The QR image could not be loaded. Close this preview and try again.'); };
    image.src = dataUrl;
    doc.body.insertBefore(image, status);
    const link = append('a', url);
    link.href = url;
    append('small', t(AUTH_NOTE));
    if (isLoopbackUrl(url)) append('small', t(NETWORK_NOTE));
    return popup;
  } catch (error) {
    try { popup.close(); } catch { /* Preserve the print preparation error. */ }
    throw error;
  }
}

export default function BatchQr({ batchId, sampleType, t = english }) {
  const id = useId();
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState(null);
  const [printFeedback, setPrintFeedback] = useState(null);
  const valid = typeof batchId === 'string' && batchId.length > 0 && SAMPLE_TYPES.includes(sampleType);
  const url = valid && typeof window !== 'undefined' ? buildBatchUrl(window.location.origin, batchId, sampleType) : '';

  useEffect(() => {
    if (!url) return undefined;
    let active = true;
    setResource({ url, revision, status: 'loading' });
    setPrintFeedback(null);
    generateBatchQr(url).then(
      (dataUrl) => { if (active) setResource({ url, revision, status: 'ready', dataUrl }); },
      (error) => { if (active) setResource({ url, revision, status: 'error', error }); },
    );
    return () => { active = false; };
  }, [url, revision]);

  const current = resource?.url === url && resource.revision === revision ? resource : null;
  const feedback = printFeedback?.url === url ? printFeedback : null;
  function printLabel() {
    try {
      printQrLabel({ url, dataUrl: current.dataUrl, batchId, sampleType, t });
      setPrintFeedback({ url, text: 'Label opened in a new tab. Use Print label / Save PDF there.' });
    } catch (error) {
      setPrintFeedback({ url, error: true, text: error.message || 'The QR label could not be printed.' });
    }
  }

  return <section className="feature-history fh-qr" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{t('Batch QR label')}</h3>
    {!valid ? <p className="fh-empty" role="status">{t('Choose a batch and sample type to create a QR label.')}</p> : <>
      <p className="fh-qr-identity"><strong>{batchId}</strong> · {t(sampleType === 'feed' ? 'Feed' : 'Silage')}</p>
      {url && <a className="fh-qr-link" href={url}>{url}</a>}
      {(!current || current.status === 'loading') && <p role="status">{t('Generating QR code on this device…')}</p>}
      {current?.status === 'error' && <div className="fh-error" role="alert">
        <p>{t('The QR code could not be generated. Try again or use the batch link.')}</p>
        {current.error?.message && <p>{t(current.error.message)}</p>}
        <button type="button" className="secondary-button" onClick={() => setRevision((value) => value + 1)}>{t('Try again')}</button>
      </div>}
      {current?.status === 'ready' && <>
        <img className="fh-qr-image" src={current.dataUrl} width="320" height="320" alt={t('QR code for batch {batch}, {sample}', { batch: batchId, sample: t(sampleType === 'feed' ? 'Feed' : 'Silage') })} />
        <div className="fh-actions">
          <a className="secondary-button" href={current.dataUrl} download={qrFilename(batchId, sampleType)}>{t('Download QR (.png)')}</a>
          <button className="secondary-button" type="button" onClick={printLabel}>{t('Print label / Save PDF ↗')}</button>
        </div>
      </>}
      {feedback && <p className={feedback.error ? 'fh-error' : 'fh-note'} role={feedback.error ? 'alert' : 'status'}>{t(feedback.text)}</p>}
      <p className="fh-note">{t('The QR image is generated locally without an external QR service.')}</p>
      <p className="fh-note">{t(AUTH_NOTE)}</p>
      {url && isLoopbackUrl(url) && <p className="fh-notice">{t(NETWORK_NOTE)}</p>}
    </>}
  </section>;
}

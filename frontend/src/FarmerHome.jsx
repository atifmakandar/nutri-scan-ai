import React, { useId } from 'react';
import { english } from './screening.js';
import './farmer-screening.css';

/** Parent owns authentication; viewers can follow the scan link to inspect the read-only form. */
export default function FarmerHome({ canWrite = false, t = english }) {
  const id = useId();
  return (
    <section className="farmer-home" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t('What would you like to do?')}</h2>
      <p>{t('Choose one simple action to get started.')}</p>
      {!canWrite && <p id={`${id}-access`} className="farmer-notice" role="note">{t('Viewer access is read-only. Ask a farm owner or member to submit a screening.')}</p>}
      <nav className="farmer-home-actions" aria-label={t('Farm quick actions')}>
        <a className="farmer-home-action" href="#scan" aria-describedby={!canWrite ? `${id}-access` : undefined}>
          <span className="farmer-action-icon" aria-hidden="true">+</span>
          <span><strong>{t('Check feed or silage')}</strong><small>{t(canWrite ? 'Start a guided screening with your measurements.' : 'View screening steps. Submitting needs write access.')}</small></span>
          <span aria-hidden="true">→</span>
        </a>
        <a className="farmer-home-action" href="#history">
          <span className="farmer-action-icon" aria-hidden="true">▤</span>
          <span><strong>{t('View past results')}</strong><small>{t('Find saved screenings for your farm.')}</small></span>
          <span aria-hidden="true">→</span>
        </a>
        <a className="farmer-home-action" href="#farmer-help">
          <span className="farmer-action-icon" aria-hidden="true">?</span>
          <span><strong>{t('Get measurement help')}</strong><small>{t('Learn which readings you need and how to get help.')}</small></span>
          <span aria-hidden="true">→</span>
        </a>
      </nav>
    </section>
  );
}

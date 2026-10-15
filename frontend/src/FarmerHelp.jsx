import React, { useId } from 'react';
import ListenButton from './ListenButton.jsx';
import {
  createGuidanceTranslator, getMeasurementGuidance, measurementHelpText,
  MEASUREMENT_GUIDANCE, normalizeGuidanceLocale, PHOTO_NOTICE, QUICK_STEPS,
  VISUAL_SCORE_NOTICE,
} from './guidance.js';
import './farmer-guidance.css';

function FeedTray() {
  return <g><path d="M18 91h100l-8 24H26Z" fill="#d5bd87" /><path d="m28 92 10-11 12 9 14-13 15 14 12-10 15 11M37 102l10 5m10-11 11 9m12-5 14 7" /></g>;
}

function ReportShape({ children }) {
  return (
    <g>
      <path d="M36 16h57l18 18v83H36Z" fill="#fffefa" />
      <path d="M93 16v18h18M47 81h49M47 93h33M47 104h42" />
      <rect x="43" y="42" width="58" height="27" rx="4" fill="#d3e8c7" />
      {children}
      <path d="m106 100 6 6 13-17" strokeWidth="4" />
    </g>
  );
}

function IllustrationDrawing({ kind }) {
  switch (kind) {
    case 'moisture':
      return <><FeedTray /><rect x="44" y="14" width="48" height="47" rx="8" fill="#fffefa" /><rect x="54" y="24" width="28" height="17" rx="3" fill="#c8e4df" /><path d="M57 61v31m22-31v31M62 32h12" /><circle cx="68" cy="51" r="2" fill="currentColor" /></>;
    case 'ph':
      return <><path d="M28 54h61l-6 61H34Z" fill="#fffefa" /><path d="M32 76h53l-4 36H36Z" fill="#c8e4df" /><rect x="65" y="12" width="20" height="49" rx="5" fill="#d3e8c7" /><path d="M75 61v36M39 64h9m-8 18h8m-7 17h7M85 28c27 0 33 13 33 30" /><rect x="104" y="58" width="26" height="28" rx="4" fill="#fffefa" /><path d="M111 68h12m-12 8h7" /></>;
    case 'temperature':
      return <><FeedTray /><path d="M64 20a9 9 0 0 1 18 0v38a16 16 0 1 1-18 0Z" fill="#fffefa" /><path d="M73 30v44m0 14v15M88 29h8m-8 13h6" /><circle cx="73" cy="73" r="7" fill="#ce935c" /></>;
    case 'humidity':
      return <><rect x="37" y="25" width="73" height="78" rx="12" fill="#fffefa" /><path d="M48 67a26 26 0 0 1 51 0m-25 0 13-17M51 89h45" /><circle cx="74" cy="67" r="4" fill="currentColor" /><path d="M13 42h15m-19 13h19m89 20h16m-16 12h22M73 10v8" /></>;
    case 'protein':
      return <ReportShape><path d="m55 55 13-6 14 12 12-9" /><circle cx="55" cy="55" r="3" fill="#fffefa" /><circle cx="68" cy="49" r="3" fill="#fffefa" /><circle cx="82" cy="61" r="3" fill="#fffefa" /><circle cx="94" cy="52" r="3" fill="#fffefa" /></ReportShape>;
    case 'dry-matter':
      return <ReportShape><path d="M53 59h39l-5 6H58Zm7-7 5-5 7 5 7-6 8 6" /></ReportShape>;
    case 'fiber':
      return <ReportShape><path d="m55 63 8-17m2 18 8-17m2 18 8-17m2 18 8-17m-37 8 35 2" /></ReportShape>;
    case 'mould':
      return <><FeedTray /><circle cx="76" cy="53" r="32" fill="#fffefa" /><path d="m100 78 23 23" strokeWidth="8" /><path d="m58 43 7-7 7 4 4-7 9 6 8 13-6 10-14-2-11 7-9-12Z" fill="#d3e8c7" strokeDasharray="3 3" /><circle cx="69" cy="49" r="2" fill="currentColor" /><circle cx="82" cy="52" r="3" fill="currentColor" /></>;
    case 'colour':
      return <><FeedTray /><rect x="18" y="17" width="111" height="47" rx="5" fill="#fffefa" /><rect x="26" y="26" width="26" height="28" fill="#e7d7a5" /><rect x="61" y="26" width="26" height="28" fill="#afbc83" /><rect x="96" y="26" width="25" height="28" fill="#b9865c" /><path d="m30 46 16-13M66 46h15m21-13 13 14M76 70v12m-5-5 5 5 5-5" /></>;
    case 'damage':
      return <><FeedTray /><circle cx="76" cy="53" r="32" fill="#fffefa" /><path d="m100 78 23 23" strokeWidth="8" /><path d="M58 34h32l7 30-26 12-18-20Z" fill="#e7d7a5" /><path d="m78 35-7 15 10 4-9 18m-12-30 6 4m21 14 6 3" /></>;
    default:
      return null;
  }
}

function MeasurementIllustration({ item, g }) {
  const titleId = useId();
  return (
    <svg className="measurement-illustration" viewBox="0 0 148 132" width="240" height="214" role="img" aria-labelledby={titleId} focusable="false">
      <title id={titleId}>{g(item.instrument)}</title>
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <IllustrationDrawing kind={item.illustration} />
      </g>
    </svg>
  );
}

// Place beside a field's label/input, rather than inside its <label> element:
// details contains its own interactive controls. Unknown keys render nothing.
export function MeasurementHelp({ fieldKey, t, locale = t?.locale || 'en' }) {
  const item = getMeasurementGuidance(fieldKey);
  if (!item) return null;
  const g = createGuidanceTranslator(t, locale);
  return (
    <details className="measurement-help" data-field={fieldKey} lang={normalizeGuidanceLocale(locale)}>
      <summary>{g('How to measure {measurement}', { measurement: g(item.label) })}</summary>
      <div className="measurement-help-body">
        <figure>
          <MeasurementIllustration item={item} g={g} />
          <figcaption>{g(item.instrument)}</figcaption>
        </figure>
        <dl>
          <dt>{g('Units')}</dt><dd>{g(item.unit)}</dd>
          <dt>{g('Where and what to enter')}</dt><dd>{g(item.where)}</dd>
          <dt>{g('Common mistake')}</dt><dd>{g(item.mistake)}</dd>
        </dl>
        {item.visual && <div className="guidance-method-note"><p>{g(VISUAL_SCORE_NOTICE)}</p><p>{g(PHOTO_NOTICE)}</p></div>}
        <ListenButton text={measurementHelpText(fieldKey, t, locale)} t={t} locale={locale} />
      </div>
    </details>
  );
}

export default function FarmerHelp({ t, locale = t?.locale || 'en' }) {
  const g = createGuidanceTranslator(t, locale);
  const titleId = useId();
  const picturesId = useId();
  const howToText = [
    'Measure, enter, then review', ...QUICK_STEPS,
    'Pictures explain the method; they do not measure your sample.',
    VISUAL_SCORE_NOTICE, PHOTO_NOTICE,
    'No reading or validated score? Ask a trained operator before submitting; do not fill gaps with guesses.',
  ].map((key) => g(key)).join('\n');

  return (
    <section id="farmer-help" className="farmer-help" lang={normalizeGuidanceLocale(locale)} aria-labelledby={titleId}>
      <header className="farmer-help-heading">
        <p>{g('Farmer help')}</p>
        <h2 id={titleId}>{g('Measure, enter, then review')}</h2>
      </header>
      <h3>{g('Quick steps')}</h3>
      <ol className="farmer-help-steps">{QUICK_STEPS.map((step) => <li key={step}>{g(step)}</li>)}</ol>
      <p>{g('Pictures explain the method; they do not measure your sample.')}</p>
      <div className="guidance-method-note"><p>{g(VISUAL_SCORE_NOTICE)}</p><p>{g(PHOTO_NOTICE)}</p></div>
      <p>{g('No reading or validated score? Ask a trained operator before submitting; do not fill gaps with guesses.')}</p>
      <ListenButton text={howToText} t={t} locale={locale} />
      <div className="farmer-help-pictures" aria-labelledby={picturesId}>
        <h3 id={picturesId}>{g('Measurement pictures')}</h3>
        <div className="farmer-help-grid">
          {MEASUREMENT_GUIDANCE.map((item) => <MeasurementHelp key={item.fieldKey} fieldKey={item.fieldKey} t={t} locale={locale} />)}
        </div>
      </div>
    </section>
  );
}

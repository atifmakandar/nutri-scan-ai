import React, { useEffect, useId, useRef, useState } from 'react';
import { createInstallController } from './pwa-install.js';
import { pwaLocale, pwaText } from './pwa-messages.js';
import { activatePwaUpdate, getPwaState, subscribePwa } from './pwa.js';
import './pwa.css';

/** Mount in top actions. t is the parent's translator with t.locale; locale is optional. */
export function InstallApp({ t, locale = t?.locale || 'en' }) {
  const language = pwaLocale(locale);
  const text = (key) => pwaText(t, key, language);
  const id = useId();
  const controller = useRef(null);
  const [install, setInstall] = useState({ status: 'fallback', ios: false });
  const [pwa, setPwa] = useState(getPwaState);
  useEffect(() => {
    const lifecycle = createInstallController({ browser: typeof window === 'undefined' ? undefined : window, onChange: setInstall });
    controller.current = lifecycle;
    setInstall(lifecycle.getSnapshot());
    const update = () => setPwa(getPwaState());
    const unsubscribe = subscribePwa(update);
    update();
    return () => { controller.current = null; lifecycle.dispose(); unsubscribe(); };
  }, []);

  const canPrompt = install.status === 'available';
  const statusKey = {
    installed: 'The app is running standalone or installation was confirmed in this session.',
    prompting: 'Opening install prompt…',
    accepted: 'Finish installation in your browser. Acceptance is not confirmation of installation.',
    dismissed: 'Installation was dismissed. You can check your browser menu later.',
    error: 'The install prompt could not open. Check your browser menu instead.',
  }[install.status] || 'Install when your browser offers it. Offline access is public help only; reconnect and sign in for private data.';
  return (
    <div className="pwa-install" lang={language}>
      {canPrompt && <button type="button" className="pwa-button" onClick={() => controller.current?.install()} aria-describedby={`${id}-status`}>{text('Install app')}</button>}
      {install.status === 'installed' ? <span className="pwa-installed">✓ {text('Installed')}</span> : (
        <details className="pwa-options">
          <summary>{text('Install options')}</summary>
          <p>{text(install.ios
            ? 'On iPhone or iPad, open Share and look for Add to Home Screen. Availability depends on your browser.'
            : 'Look in your browser menu for Install app or Add to Home Screen. Some browsers or devices do not offer installation.')}</p>
          <a href={`/offline.html#help-${language}`}>{text('Public offline help')}</a>
        </details>
      )}
      <p id={`${id}-status`} className="pwa-status" role="status" aria-live="polite" aria-atomic="true">{text(statusKey)}</p>
      {pwa.updateAvailable && <div className="pwa-update">
        <p>{text('An update is ready. Save unsaved work before updating; the page will reload.')}</p>
        <button type="button" className="pwa-button" disabled={pwa.updating} onClick={activatePwaUpdate}>{text(pwa.updating ? 'Updating…' : 'Update and reload')}</button>
      </div>}
      {pwa.status === 'error' && <p role="status">{text('Offline setup or update was unavailable. Reconnect and reopen the app to retry.')}</p>}
    </div>
  );
}

export default InstallApp;

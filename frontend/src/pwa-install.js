/** beforeinstallprompt is browser-specific. No install support is inferred from a UA. */
export function createInstallController({ browser, onChange = () => {} } = {}) {
  const media = browser?.matchMedia?.('(display-mode: standalone)');
  const minimal = browser?.matchMedia?.('(display-mode: minimal-ui)');
  const navigator = browser?.navigator;
  const ios = /iPad|iPhone|iPod/.test(navigator?.userAgent || '')
    || (/Mac/.test(navigator?.platform || '') && navigator?.maxTouchPoints > 1);
  const standalone = () => Boolean(media?.matches || minimal?.matches || navigator?.standalone);
  let state = { status: standalone() ? 'installed' : 'fallback', ios };
  let deferred;
  let disposed = false;
  const publish = (status) => {
    if (disposed) return;
    state = { ...state, status };
    onChange(state);
  };
  const installed = () => { deferred = null; publish('installed'); };
  const beforePrompt = (event) => {
    if (disposed || state.status === 'installed') return;
    event.preventDefault();
    deferred = event;
    publish('available');
  };
  const displayChanged = () => { if (standalone()) installed(); };
  browser?.addEventListener('beforeinstallprompt', beforePrompt);
  browser?.addEventListener('appinstalled', installed);
  for (const query of [media, minimal]) {
    if (query?.addEventListener) query.addEventListener('change', displayChanged);
    else query?.addListener?.(displayChanged);
  }
  return {
    getSnapshot: () => state,
    async install() {
      if (!deferred || disposed || state.status !== 'available') return false;
      const event = deferred;
      deferred = null; // Browser prompt events are single-use.
      publish('prompting');
      try {
        // Synchronous call within the user's click handler preserves activation.
        await event.prompt();
        const choice = await event.userChoice;
        if (state.status !== 'installed') publish(choice?.outcome === 'accepted' ? 'accepted' : 'dismissed');
        return choice?.outcome === 'accepted';
      } catch {
        if (state.status !== 'installed') publish('error');
        return false;
      }
    },
    dispose() {
      disposed = true;
      deferred = null;
      browser?.removeEventListener('beforeinstallprompt', beforePrompt);
      browser?.removeEventListener('appinstalled', installed);
      for (const query of [media, minimal]) {
        if (query?.removeEventListener) query.removeEventListener('change', displayChanged);
        else query?.removeListener?.(displayChanged);
      }
    },
  };
}

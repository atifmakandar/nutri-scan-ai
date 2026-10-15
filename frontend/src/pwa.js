const INITIAL_STATE = Object.freeze({ status: 'idle', updateAvailable: false, updating: false });

/** Factory keeps browser lifecycle testable without persisting any user state. */
export function createPwaRegistration(browser) {
  let state = INITIAL_STATE;
  let registration;
  let pending;
  let applying = false;
  const listeners = new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const inspect = () => publish({ updateAvailable: Boolean(registration?.waiting) });
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    register() {
      if (!browser?.navigator?.serviceWorker) return Promise.resolve(null);
      if (pending) return pending;
      const workers = browser.navigator.serviceWorker;
      pending = (async () => {
        try {
          registration = await workers.register('/sw.js', { scope: '/', updateViaCache: 'none' });
          publish({ status: 'ready' });
          inspect();
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', inspect);
          });
          workers.addEventListener('controllerchange', () => {
            inspect();
            // Never reload on installation or a background update. This flag is
            // set only by the component's explicit Update and reload click.
            if (applying) {
              applying = false;
              browser.location.reload();
            }
          });
          return registration;
        } catch {
          publish({ status: 'error', updateAvailable: false, updating: false });
          return null;
        }
      })();
      return pending;
    },
    activateUpdate() {
      if (!registration?.waiting || applying) return false;
      applying = true;
      publish({ updating: true });
      try {
        registration.waiting.postMessage({ type: 'NUTRISCAN_PWA_ACTIVATE' });
        return true;
      } catch {
        applying = false;
        publish({ status: 'error', updating: false });
        return false;
      }
    },
  };
}

let controller;
function currentController() {
  if (!controller) controller = createPwaRegistration(typeof window === 'undefined' ? undefined : window);
  return controller;
}

/** Called once by the parent bootstrap. Development and unsupported browsers are safe no-ops. */
export function registerPwa() {
  if (!import.meta.env?.PROD || typeof window === 'undefined' || !window.navigator?.serviceWorker) return Promise.resolve(null);
  return currentController().register();
}

export function getPwaState() { return controller?.getSnapshot() || INITIAL_STATE; }
export function subscribePwa(listener) { return currentController().subscribe(listener); }
export function activatePwaUpdate() { return controller?.activateUpdate() || false; }

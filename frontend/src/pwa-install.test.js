import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstallController } from './pwa-install.js';
import { createPwaRegistration, registerPwa } from './pwa.js';

class Events {
  listeners = new Map();
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) { this.listeners.get(name)?.forEach((callback) => callback(event)); }
}

function browser(options = {}) {
  const result = new Events();
  result.navigator = { ...options };
  const media = new Events();
  media.matches = Boolean(options.standalone);
  result.matchMedia = () => media;
  result.media = media;
  // Any accidental account/storage access is a test failure.
  Object.defineProperty(result, 'localStorage', { get() { throw new Error('Do not access account storage'); } });
  return result;
}

test('install is gated on a genuine deferred event and explicit user action; acceptance is not installed state', async () => {
  const host = browser();
  const changes = [];
  const install = createInstallController({ browser: host, onChange: (value) => changes.push(value.status) });
  assert.equal(install.getSnapshot().status, 'fallback');
  assert.equal(await install.install(), false);
  let prevented = 0;
  let prompted = 0;
  host.emit('beforeinstallprompt', { preventDefault() { prevented += 1; }, prompt() { prompted += 1; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(prevented, 1);
  assert.equal(prompted, 0);
  assert.equal(install.getSnapshot().status, 'available');
  const accepting = install.install();
  assert.equal(prompted, 1, 'prompt is invoked synchronously during the click');
  assert.equal(install.getSnapshot().status, 'prompting');
  assert.equal(await install.install(), false);
  assert.equal(await accepting, true);
  assert.equal(install.getSnapshot().status, 'accepted');
  host.emit('appinstalled');
  assert.equal(install.getSnapshot().status, 'installed');
  assert.deepEqual(changes, ['available', 'prompting', 'accepted', 'installed']);
  install.dispose();
});

test('dismissal and failures consume the single-use prompt; a later browser event allows retry', async () => {
  const host = browser();
  const install = createInstallController({ browser: host });
  host.emit('beforeinstallprompt', { preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  assert.equal(await install.install(), false);
  assert.equal(install.getSnapshot().status, 'dismissed');
  assert.equal(await install.install(), false);
  host.emit('beforeinstallprompt', { preventDefault() {}, prompt() { throw new Error('not allowed'); } });
  assert.equal(await install.install(), false);
  assert.equal(install.getSnapshot().status, 'error');
  install.dispose();
});

test('standalone/iOS detection is only for state and instructions, never an installation promise', () => {
  for (const options of [{ standalone: true }, { userAgent: 'iPhone Safari' }, { platform: 'MacIntel', maxTouchPoints: 5 }, {}]) {
    const host = browser(options);
    const install = createInstallController({ browser: host });
    assert.equal(install.getSnapshot().status, options.standalone ? 'installed' : 'fallback');
    assert.equal(install.getSnapshot().ios, Boolean(options.userAgent || options.maxTouchPoints));
    host.media.matches = true;
    host.media.emit('change');
    assert.equal(install.getSnapshot().status, 'installed');
    install.dispose();
  }
  assert.equal(createInstallController().getSnapshot().status, 'fallback');
});

test('appinstalled wins an outstanding prompt race; dispose removes listeners and ignores late choice', async () => {
  const host = browser();
  let resolve;
  const choices = new Promise((done) => { resolve = done; });
  const states = [];
  const install = createInstallController({ browser: host, onChange: (state) => states.push(state.status) });
  host.emit('beforeinstallprompt', { preventDefault() {}, prompt() {}, userChoice: choices });
  const prompting = install.install();
  host.emit('appinstalled');
  resolve({ outcome: 'dismissed' });
  await prompting;
  assert.equal(install.getSnapshot().status, 'installed');
  install.dispose();
  for (const listeners of host.listeners.values()) assert.equal(listeners.size, 0);
  for (const listeners of host.media.listeners.values()) assert.equal(listeners.size, 0);
  const count = states.length;
  host.emit('appinstalled');
  assert.equal(states.length, count);
});

test('development/Node and missing service-worker support are safe registration no-ops', async () => {
  assert.equal(await registerPwa(), null);
  assert.equal(await createPwaRegistration(browser()).register(), null);
  assert.equal(await createPwaRegistration().register(), null);
});

test('registration is idempotent, reports waiting updates and reloads only after explicit activation', async () => {
  const host = browser();
  const workers = new Events();
  const registration = new Events();
  const installing = new Events();
  const messages = [];
  let registered = 0;
  let reloads = 0;
  workers.register = async (url, options) => {
    assert.equal(url, '/sw.js');
    assert.deepEqual(options, { scope: '/', updateViaCache: 'none' });
    registered += 1;
    return registration;
  };
  host.navigator.serviceWorker = workers;
  host.location = { reload() { reloads += 1; } };
  const pwa = createPwaRegistration(host);
  let notifications = 0;
  const unsubscribe = pwa.subscribe(() => { notifications += 1; });
  await Promise.all([pwa.register(), pwa.register()]);
  assert.equal(registered, 1);
  workers.emit('controllerchange');
  assert.equal(reloads, 0);
  assert.equal(pwa.activateUpdate(), false);
  registration.installing = installing;
  registration.emit('updatefound');
  registration.waiting = { postMessage(message) { messages.push(message); } };
  installing.emit('statechange');
  assert.equal(pwa.getSnapshot().updateAvailable, true);
  assert.deepEqual(messages, []);
  assert.equal(pwa.activateUpdate(), true);
  assert.equal(pwa.activateUpdate(), false);
  assert.deepEqual(messages, [{ type: 'NUTRISCAN_PWA_ACTIVATE' }]);
  registration.waiting = null;
  workers.emit('controllerchange');
  assert.equal(reloads, 1);
  workers.emit('controllerchange');
  assert.equal(reloads, 1);
  unsubscribe();
  const last = notifications;
  workers.emit('controllerchange');
  assert.equal(notifications, last);
});

test('registration failures are contained without claiming offline readiness', async () => {
  const host = browser();
  host.navigator.serviceWorker = { async register() { throw new Error('unavailable'); } };
  const pwa = createPwaRegistration(host);
  assert.equal(await pwa.register(), null);
  assert.deepEqual(pwa.getSnapshot(), { status: 'error', updateAvailable: false, updating: false });
});

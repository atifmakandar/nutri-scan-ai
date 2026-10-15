import { CAPTURE_TIMEOUT_MS, MAX_CAPTURE_BYTES, ReadingAssistError, assistFail, parseInstrumentFrame } from './reading-assist.js';

export function serialAvailability(browser) {
  if (browser?.isSecureContext !== true) return 'insecure';
  return typeof browser?.navigator?.serial?.requestPort === 'function' ? 'ready' : 'serial-unsupported';
}

/** Reads actual Web Serial bytes only. Dependency injection is solely for transport tests.
 * requestPort is called synchronously inside capture(), preserving user activation.
 * Cancellation invalidates callbacks immediately, even while a native chooser is open.
 */
export function createInstrumentController({ browser, onState = () => {}, maxTimeMs = CAPTURE_TIMEOUT_MS } = {}) {
  let disposed = false;
  let active = null;
  const serial = browser?.navigator?.serial;
  const emit = (state) => { if (!disposed) onState(state); };
  const close = async (port) => { try { await port?.close(); } catch { /* Unopened/disconnected port. */ } };
  return {
    availability: serialAvailability(browser),
    async capture() {
      if (disposed || active) return;
      const availability = serialAvailability(browser);
      if (availability !== 'ready') { emit({ status: availability }); return; }
      const op = { cancelled: false, port: null, reader: null };
      active = op;
      const live = () => !disposed && active === op && !op.cancelled;
      let rejectStop;
      const stopped = new Promise((_, reject) => { rejectStop = reject; });
      const interrupt = (code) => { if (!op.cancelled) { op.cancelled = true; op.reason = code; rejectStop(new ReadingAssistError(code)); } };
      op.cancel = () => interrupt('cancelled');
      const timer = setTimeout(() => interrupt('timeout'), maxTimeMs);
      const disconnected = (event) => { if (event.target === op.port || event.port === op.port) interrupt('disconnected'); };
      serial.addEventListener?.('disconnect', disconnected);
      let outcome;
      try {
        emit({ status: 'selecting' });
        const selection = serial.requestPort();
        // A chooser cannot be programmatically closed. A late choice is never opened.
        op.port = await Promise.race([selection, stopped]);
        if (!live()) assistFail('cancelled');
        const opening = op.port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
        opening.then(() => { if (op.cancelled || disposed) void close(op.port); }, () => {});
        await Promise.race([opening, stopped]);
        if (!live()) assistFail('cancelled');
        if (!op.port.readable) assistFail('serial-error');
        op.reader = op.port.readable.getReader();
        emit({ status: 'receiving' });
        const bytes = new Uint8Array(MAX_CAPTURE_BYTES);
        let size = 0;
        while (live()) {
          const { value, done } = await Promise.race([op.reader.read(), stopped]);
          if (done) assistFail('disconnected');
          if (!(value instanceof Uint8Array)) assistFail('frame');
          if (size + value.byteLength > MAX_CAPTURE_BYTES) assistFail('oversize');
          bytes.set(value, size);
          size += value.byteLength;
          const newline = bytes.subarray(0, size).indexOf(10);
          if (newline !== -1) {
            let text;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, newline)); } catch { assistFail('frame'); }
            outcome = { status: 'review', capture: parseInstrumentFrame(text) };
            break;
          }
        }
      } catch (error) {
        outcome = { status: error instanceof ReadingAssistError ? error.code
          : error?.name === 'NotFoundError' || error?.name === 'AbortError' ? 'cancelled'
            : error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'serial-permission' : 'serial-error' };
      } finally {
        clearTimeout(timer);
        serial.removeEventListener?.('disconnect', disconnected);
        // Cancel releases a pending read before releasing the lock and closing.
        if (op.reader) {
          try { await op.reader.cancel(); } catch { /* Device may have disappeared. */ }
          try { op.reader.releaseLock(); } catch { /* Lock already released. */ }
        }
        await close(op.port);
        if (active === op) active = null;
      }
      if (!disposed) emit(op.cancelled ? { status: op.reason } : outcome || { status: 'cancelled' });
    },
    cancel() { active?.cancel(); },
    dispose() { disposed = true; active?.cancel(); },
  };
}

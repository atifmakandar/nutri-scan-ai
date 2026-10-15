export const FIELDWORK_COLLECTIONS = Object.freeze(['batches', 'observations', 'reminders', 'testing-requests']);
export const FIELDWORK_ANSWERS = Object.freeze(['yes', 'no', 'unknown']);
export const FIELDWORK_CHECKS = Object.freeze([
  ['mould', 'Visible mould'], ['unusual_heat', 'Unusual heat'],
  ['unusual_smell', 'Unusual smell'], ['cover_damage', 'Cover damage'],
]);
export const FIELDWORK_UNITS = Object.freeze(['kg', 'tonne', 'bales', 'bags']);
export const FIELDWORK_PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const samples = ['feed', 'silage'];

export function fieldworkPath(collection, id, attachment, attachmentId) {
  if (!FIELDWORK_COLLECTIONS.includes(collection)) throw new Error('Invalid fieldwork route.');
  let path = `/api/v1/${collection}`;
  if (id != null) path += `/${encodeURIComponent(String(id))}`;
  if (attachment != null) {
    if (id == null || !['photos', 'reports', 'status'].includes(attachment)
      || attachment === 'reports' && collection !== 'testing-requests'
      || attachment === 'status' && !['reminders', 'testing-requests'].includes(collection)
      || attachment === 'photos' && !['batches', 'observations'].includes(collection)) throw new Error('Invalid fieldwork route.');
    path += `/${attachment}`;
  }
  if (attachmentId != null) {
    if (!['photos', 'reports'].includes(attachment)) throw new Error('Invalid fieldwork route.');
    path += `/${encodeURIComponent(String(attachmentId))}`;
  }
  return path;
}

export function fieldworkListPath(collection, { limit = 20, offset = 0, batch_id = '', sample_type = '' } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw new Error('Invalid pagination.');
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (collection === 'observations') {
    if (batch_id) query.set('batch_id', batch_id);
    if (sample_type) query.set('sample_type', sample_type);
  }
  return `${fieldworkPath(collection)}?${query}`;
}

export function fieldworkRecord(value, farmId) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id
    || value.farm_id !== farmId) throw new Error('The server returned an invalid farm record.');
  return value;
}

export function fieldworkPage(value, farmId) {
  if (!value || !Array.isArray(value.items) || !Number.isInteger(value.total) || value.total < 0
    || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100
    || !Number.isInteger(value.offset) || value.offset < 0 || value.items.length > value.limit
    || value.items.length > Math.max(0, value.total - value.offset)) throw new Error('The server returned an invalid page.');
  value.items.forEach((item) => fieldworkRecord(item, farmId));
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length) throw new Error('The server returned an invalid page.');
  return value;
}

export function fieldworkPagination(page) {
  return {
    start: page.items.length ? page.offset + 1 : 0,
    end: page.items.length ? page.offset + page.items.length : 0,
    previous: Math.max(0, page.offset - page.limit), next: page.offset + page.limit,
    last: Math.max(0, Math.floor((page.total - 1) / page.limit) * page.limit),
    hasPrevious: page.offset > 0, hasNext: page.offset + page.limit < page.total,
  };
}

export function validFieldworkDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function fieldworkLocalDay(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid calendar date.');
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fieldworkNextDayDelay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - date.getTime();
}

export function groupFieldworkReminders(items, today = fieldworkLocalDay()) {
  const groups = { Overdue: [], 'Due today': [], Upcoming: [], 'No due date': [], Completed: [] };
  for (const item of items) {
    const group = item.status === 'completed' ? 'Completed' : !validFieldworkDate(item.due_on) ? 'No due date'
      : item.due_on < today ? 'Overdue' : item.due_on === today ? 'Due today' : 'Upcoming';
    groups[group].push(item);
  }
  for (const list of Object.values(groups)) list.sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
  return groups;
}

export function emptyFieldworkForm(collection, today = fieldworkLocalDay()) {
  const identity = { batch_id: '', sample_type: 'feed' };
  if (collection === 'batches') return { ...identity, name: '', storage_location: '', prepared_on: '', opened_on: '', quantity: '', quantity_unit: '', notes: '' };
  if (collection === 'observations') return { ...identity, observed_on: today, ...Object.fromEntries(FIELDWORK_CHECKS.map(([key]) => [key, 'unknown'])), notes: '' };
  if (collection === 'reminders') return { title: '', batch_id: '', sample_type: '', due_on: today, notes: '' };
  return { ...identity, requested_on: today, contact_name: '', contact_details: '', notes: '' };
}

/** Whitelist API fields. Never copy farm, owner, score, or live screening readings. */
export function parseFieldworkForm(collection, draft, original = null) {
  const errors = {};
  const value = {};
  function text(key, max, required = false) {
    const input = draft[key] ?? '';
    if (typeof input !== 'string' || input.length > max || required && !input.trim()) errors[key] = 'Enter text within the allowed length.';
    value[key] = typeof input === 'string' ? input : '';
  }
  function date(key) {
    const input = draft[key];
    if (input && !validFieldworkDate(input)) errors[key] = 'Enter a real date as YYYY-MM-DD.';
    value[key] = input || null;
  }
  if (!FIELDWORK_COLLECTIONS.includes(collection)) throw new Error('Invalid fieldwork route.');
  const optionalIdentity = collection === 'reminders';
  const batch = original ? original.batch_id : draft.batch_id;
  const sample = original ? original.sample_type : draft.sample_type;
  // Exact identity is intentional: trimming/case-folding could detach existing scans.
  if (optionalIdentity && !batch && !sample) {
    value.batch_id = null; value.sample_type = null;
  } else {
    value.batch_id = batch; value.sample_type = sample;
    if (typeof batch !== 'string' || !batch.trim() || batch.length < 2 || batch.length > 80) errors.batch_id = 'Batch ID must contain 2–80 characters.';
    if (!samples.includes(sample)) errors.sample_type = 'Choose feed or silage; batch and sample must be paired.';
  }
  text('notes', 4000);
  if (collection === 'batches') {
    text('name', 120); text('storage_location', 200); date('prepared_on'); date('opened_on');
    if (value.prepared_on && value.opened_on && value.opened_on < value.prepared_on) errors.opened_on = 'Opening date cannot precede preparation.';
    const input = draft.quantity;
    const quantity = input == null || input === '' ? null : typeof input === 'number' ? input
      : typeof input === 'string' && /^\s*(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(input) ? Number(input) : NaN;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) errors.quantity = 'Quantity must be a finite number of zero or more.';
    value.quantity = quantity;
    value.quantity_unit = draft.quantity_unit || null;
    if (value.quantity_unit !== null && !FIELDWORK_UNITS.includes(value.quantity_unit) || quantity !== null && !value.quantity_unit) errors.quantity_unit = 'Choose the recorded quantity unit. Units are not converted.';
  } else if (collection === 'observations') {
    date('observed_on');
    for (const [key] of FIELDWORK_CHECKS) {
      value[key] = draft[key] ?? 'unknown';
      if (!FIELDWORK_ANSWERS.includes(value[key])) errors[key] = 'Choose yes, no, or unknown.';
    }
  } else if (collection === 'reminders') {
    text('title', 200, true); date('due_on');
  } else {
    date('requested_on'); text('contact_name', 120); text('contact_details', 500);
  }
  return { value: Object.keys(errors).length ? null : value, errors };
}

export function fieldworkTestingTransition(record, date, reportCount = record.report_count) {
  if (!validFieldworkDate(date)) throw new Error('Enter a real date as YYYY-MM-DD.');
  if (record.status === 'requested') {
    if (record.requested_on && date < record.requested_on) throw new Error('Collection cannot precede the request date.');
    return { status: 'collected', collected_on: date, report_received_on: null };
  }
  if (record.status === 'collected') {
    if (!validFieldworkDate(record.collected_on) || date < record.collected_on) throw new Error('Report receipt cannot precede collection.');
    if (!Number.isInteger(reportCount) || reportCount < 1) throw new Error('Upload a report before marking it received.');
    return { status: 'report_received', collected_on: record.collected_on, report_received_on: date };
  }
  throw new Error('Testing status can only move forward.');
}

export function matchingFieldworkRecord(batch, candidate, screening = false) {
  const record = screening ? candidate?.scan : candidate;
  return Boolean(record && record.farm_id === batch.farm_id && record.batch_id === batch.batch_id
    && record.sample_type === batch.sample_type);
}

export function validateFieldworkFile(file, reports = false) {
  if (!file) return 'Choose a file first.';
  if (![...FIELDWORK_PHOTO_TYPES, ...(reports ? ['application/pdf'] : [])].includes(file.type)) return reports
    ? 'Choose a JPEG, PNG, WebP, or PDF report.' : 'Choose a JPEG, PNG, or WebP photo.';
  const max = reports && file.type === 'application/pdf' ? 10 : 5;
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > max * 1024 * 1024) return 'Photos must be 1 byte–5 MiB; PDF reports 1 byte–10 MiB.';
  return '';
}

export function fieldworkAttachments(value) {
  if (!Array.isArray(value) || value.length > 5 || value.some((item) => !item || typeof item.id !== 'string'
    || !item.id || typeof item.filename !== 'string' || typeof item.content_type !== 'string')) throw new Error('The server returned an invalid attachment list.');
  return value;
}

export function fieldworkFilename(filename, type) {
  const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  if (!extension) throw new Error('Unsupported attachment type.');
  const stem = String(filename || 'attachment').replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^(?:fieldwork-)+/, '').slice(0, 80) || 'attachment';
  return `fieldwork-${stem}.${extension}`;
}

export function downloadFieldworkBlob(blob, filename, browser = globalThis.window) {
  if (!browser?.document?.body || !browser.URL?.createObjectURL) throw new Error('The download could not be started.');
  let url;
  let anchor;
  try {
    url = browser.URL.createObjectURL(blob);
    anchor = browser.document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    browser.document.body.appendChild(anchor); anchor.click();
  } finally {
    anchor?.remove();
    if (url) browser.setTimeout(() => browser.URL.revokeObjectURL(url), 60_000);
  }
}

export const fieldworkAbort = () => Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });

/** Scope gate also guards APIs that ignore AbortSignal and late unauthorized errors. */
export function createFieldworkClient(api, onUnauthorized = () => {}) {
  let active = true;
  let expired = false;
  let generation = 0;
  const controllers = new Set();
  function stop() {
    active = false; generation += 1;
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }
  return {
    start() { if (!expired) active = true; },
    stop,
    async request(path, options = {}) {
      if (!active || expired || options.signal?.aborted) throw fieldworkAbort();
      const epoch = generation;
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      controllers.add(controller);
      const current = () => active && !expired && generation === epoch && !controller.signal.aborted;
      try {
        const value = await api(path, { ...options, signal: controller.signal });
        if (!current()) throw fieldworkAbort();
        return value;
      } catch (error) {
        if (!current()) throw fieldworkAbort();
        if (error?.status === 401) {
          expired = true; stop(); onUnauthorized();
          throw fieldworkAbort();
        }
        throw error;
      } finally {
        controllers.delete(controller);
        options.signal?.removeEventListener('abort', abort);
      }
    },
  };
}

export function fieldworkError(error) {
  if (error?.status === 403) return 'This account cannot change farm records.';
  if (error?.status === 400) return 'The file or values were not accepted. Check the file and fields, then retry.';
  if (error?.status === 415) return 'Unsupported attachment type.';
  if (error?.status === 409 && /attachment/i.test(error?.message || '')) return 'Five attachments are already saved. The limit has been reached.';
  if (error?.status === 409) return 'This batch ID and sample already exist. Edit the saved batch.';
  if (error?.status === 404) return 'This record is no longer available. Refresh the list.';
  if (error?.status === 422) return 'The server could not accept these values. Check the fields and dates.';
  if (error?.status === 413) return 'Photos must be 1 byte–5 MiB; PDF reports 1 byte–10 MiB.';
  if (error?.status >= 500 || error instanceof TypeError) return 'The farm service is unavailable. Retry when connected.';
  // Only known local validation errors are translated; arbitrary server text is not markup.
  return error?.message || 'The farm service is unavailable. Retry when connected.';
}

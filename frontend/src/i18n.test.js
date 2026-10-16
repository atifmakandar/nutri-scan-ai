import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, dictionaries, translate, translateAdvisory } from './i18n.js';

// Independent integration contract: additions must be real translations, not
// merely readable English fallbacks. Includes the anticipated panel keys.
const requiredKeys = [
  'Overview', 'New screening', 'Latest result', 'Test history', 'Batch monitoring',
  'Farm status', 'Average quality', 'Screening status', 'Input channels',
  'Start a sample test', 'Farm ID', 'Batch ID', 'Sample type', 'Input source',
  'Silage', 'Cattle feed', 'Manual entry', 'Mobile capture', 'ESP32 field unit',
  'Storage & sensor readings', 'NIR estimate', 'Visual indicators', 'Moisture',
  'Dry matter', 'Protein', 'Crude fiber', 'pH', 'Temperature', 'Humidity',
  'Mould indicator', 'Colour anomaly', 'Surface damage', 'Run AI screening',
  'Analyzing…', 'Load showcase sample', 'Quality score', 'Risk level',
  'Confidence indicator', 'Recommended next step', 'Prototype screening notice',
  'History', 'Search', 'Reset', 'Previous', 'Next', 'All types', 'All risks',
  'From date', 'To date', 'Search batch ID', 'View result', 'View batch',
  'Download report (.html)', 'Print / Save PDF', 'No scans found.', 'Loading…',
  'Photos', 'Attach photo', 'Evidence only — photos are not analyzed by AI.',
  'Remove', 'Sign in', 'Create farm account', 'Username', 'Password', 'Farm name',
  'Sign out', 'Owner', 'Member', 'Viewer', 'Account', 'Farm members', 'Add member',
  'Role', 'English', 'Hindi', 'Marathi', 'Offline drafts', 'Save draft', 'Load draft',
  'Delete draft', 'Queue for sync', 'Sync now', 'Saved on this device', 'Queued',
  'Synced', 'Offline', 'Online',
  'Drafts stay on this device. Do not use a shared device for private farm data.',
  'Translations are draft guidance; verify safety advice with a qualified expert.',
  'QR label', 'Download QR', 'Print label', 'Login is required to view this batch.',
  'Use a reachable site address for QR labels shared with another device.',
  'Measurements', 'Advisory', 'Anomalies', 'Batch trends', 'Quality', 'Date',
  'Score', 'Status', 'Report', 'Result', 'No readings available.',
  'Prototype estimate', 'Uncalibrated', 'Saved scan', 'Photo upload failed.',
  'Connection error', 'Try again', 'Cancel', 'Save', 'Read-only account',
  'Viewer accounts cannot submit scans or upload photos.',
  'Use at least 10 characters.', 'Back to sign in', 'Already have an account?',
  'Saved history is private to your farm.',
  'A low risk label does not guarantee feed safety.',
  'Saved drafts are not submitted until you sync.',
  'Do not close this page while syncing.', 'No drafts saved.',
  'Storage is full or unavailable.', 'Draft saved.', 'No photo attachments.',
  'Upload photo', 'Sign in to sync your drafts.', 'Current batch',
  'Showing {count} of {total} scans', 'Page {page}', 'Refresh history',
  'Download QR label', 'Photo evidence', 'Fermentation', 'Spoilage risk',
];

// Enumerated from the current panel call sites. Keep this list explicit: the
// panels also translate server/library messages dynamically, which must not be
// mistaken for a finite source-code key list.
const actualPanelKeys = [
  'TRACEABILITY', 'Screening history', 'Refresh history', 'Filter saved scans',
  'Batch matching', 'Contains', 'Exact batch ID', 'All sample types', 'Feed', 'Silage',
  'All risk levels', 'From date (UTC)', 'To date (UTC)',
  'Dates include the full start and end days in UTC and filter when samples were collected.',
  'Search history', 'Reset filters', 'Loading saved scans…', 'Close QR label',
  'Showing {start}–{end} of {total} saved scans.', 'Saved scan search results',
  'Saved scans matching the applied filters', 'Farm: {farm}', 'Not recorded',
  'View result for batch {batch}, scan {scan}', 'View result', 'View batch {batch} trends',
  'View batch', 'QR label for batch {batch}', 'QR label', 'History pages', 'First page',
  'Previous page', 'Next page', 'Last page', 'Scans per page', 'Try again',
  'Batch trends', 'Choose a batch and sample type to view trends.', 'Loading batch trends…',
  'Loaded {count} of {total} matching saved scans (latest {limit} maximum).',
  'Older scans are not included in these trends. Use history pagination to view them.',
  'Time axis: scan saved at (UTC), oldest to newest. Missing dates, timezones, or measurements are omitted from charts and shown as Not recorded in the table.',
  '{count} scans were excluded because their batch, sample type, or farm identity did not match.',
  'No matching scans are available for this batch and sample type.', 'Farm for these trends',
  'Choose a farm', 'This batch appears on multiple farms. Choose one farm to keep its trends separate.',
  '{count} scans for this farm in the loaded sample.', 'Batch trend data',
  'Saved measurements — {batch}, {sample}, farm {farm}', 'Saved at (UTC)', 'Scan ID',
  '{count} recorded measurements, chronological UTC dates. Exact values are in the data table below.',
  'No recorded measurements', 'At least two recorded measurements are needed to show a trend.',
  '{count} scans omitted from this chart because a date or measurement is missing.',
  'Batch QR label', 'QR code for batch {batch}', 'Loading QR image…', 'Print label / Save PDF',
  'Printing could not start. Use your browser print command.', 'QR label ready to print.',
  'The QR image could not be loaded. Close this preview and try again.',
  'Choose a batch and sample type to create a QR label.', 'Generating QR code on this device…',
  'The QR code could not be generated. Try again or use the batch link.',
  'QR code for batch {batch}, {sample}', 'Download QR (.png)', 'Print label / Save PDF ↗',
  'The QR image is generated locally without an external QR service.',
  'Account', 'Sign in', 'Create farm account', 'Username', 'Password', 'Farm name',
  'Use at least 10 characters.', 'Already have an account?', 'Back to sign in', 'Sign out',
  'Role', 'Viewer accounts cannot submit scans or upload photos.', 'Farm members', 'Member',
  'Viewer', 'Loading members…', 'No members found.', 'Photos', 'Photo evidence',
  'Evidence only — photos are not analyzed by AI.', 'Select a saved scan to view photo evidence.',
  'Attach photo', 'Loading…', 'No photo attachments.', 'Photo for batch {batchId}',
  'LOCAL ONLY', 'Saved readings',
  'Readings are stored on this device for this signed-in user and farm. Credentials, photos, and API results are never stored.',
  'Loading makes a copy. Save changes as a new draft with a new request ID; queued values never change. Do not queue a replacement until you have checked any uncertain earlier submission in scan history.',
  'Save draft', 'Syncing…', 'Sync now', 'Refresh drafts', 'Offline — nothing will be sent',
  'No local reading drafts for this user and farm.', 'Request ID', 'Load', 'Queue', 'Delete',
  'ACTIVE FARM', 'Overview', 'New screening', 'Latest result', 'Test history', 'Offline drafts',
  'Prototype input contract ready', 'Manual mode active', 'FIELD INTELLIGENCE / 14 OCTOBER 2026',
  'Good morning, {name}.', 'Language', 'Online', 'Offline', 'Profile',
  'Know your feed before it reaches the herd.',
  'Rapid, explainable screening for feed and silage quality — built for confident action at the farm.',
  'How it works', 'TODAY AT A GLANCE', 'Farm status', 'Updated from saved scans',
  'Average quality', 'Across {count} saved scans', 'Screening status', 'READY',
  'Prototype estimate', 'Input channels', 'Vision · NIR · sensors', 'Connection note',
  'RAPID SCREENING', 'Start a sample test',
  'Enter the readings available at the farm. The API saves the batch and returns an explainable screening estimate.',
  'Farm ID', 'Cattle feed', 'Input source', 'Manual entry', 'Mobile capture', 'ESP32 field unit',
  'Sign in to submit a scan.', 'Analyzing signals…', 'Run AI screening', 'Load showcase sample',
  'Values are validated before analysis. No laboratory or sensor certification is implied.',
  'LATEST RESULT', 'Awaiting a sample', 'AI screening in progress', 'FROM SIGNAL TO DECISION',
  'One screening loop, explained clearly.',
  'Nutri-Scan combines available field inputs into a transparent risk estimate. Add calibrated hardware and laboratory-labelled models as the product scales.',
  'Capture', 'Image, NIR and sensor signals', 'Analyze', 'Validated feature fusion', 'Act',
  'Advisory and traceability', 'Translations are draft guidance; verify safety advice with a qualified expert.',
  'Prototype screening notice:',
  'Nutri-Scan AI provides rapid decision support only. It does not replace certified laboratory testing. Isolate suspicious batches and seek confirmatory testing for safety-critical decisions.',
  'RISK', 'Your result will appear here',
  'Run a sample screening to see quality score, risk signals and a simple next action.',
  'Inputs', 'AI fusion', 'Advisory', 'screening', 'Confidence indicator:', 'RECOMMENDED NEXT STEP',
  'Prototype AI estimate', 'Download HTML report for batch {batchId}', 'Download report (.html)',
  'Print or save PDF report for batch {batchId} (opens a new tab)', 'Print / Save PDF ↗',
  'Export this saved scan. PDF saving uses your browser’s print dialog.',
  // Fixed messages supplied through constants or dynamic state in the panels.
  'Sign-in is required to view saved scans. This QR contains only the app URL, batch ID, and sample type; it does not grant access.',
  'A localhost or loopback QR link cannot be opened on another device. Open this app using a deployed or private LAN URL before generating a label.',
  'Printing requires a browser window. Download the PNG label instead.',
  'Allow pop-ups to print the QR label, then try again.',
  'Label opened in a new tab. Use Print label / Save PDF there.', 'The QR label could not be printed.',
  'Username is required.', 'Farm name is required.', 'An API request function is required.',
  'The server returned an invalid member list.', 'Farm members could not be loaded.',
  'The server did not return a valid session.', 'Sign out failed.', 'Adding member…',
  'Choose a photo to upload.', 'Photo must be 5 MiB or smaller.',
  'Only JPEG, PNG, and WebP photos are accepted.', 'Your session has expired. Please sign in again.',
  'You do not have permission to change photo evidence.', 'The photo preview could not be loaded.',
  'The server returned an invalid photo list.', 'Photos could not be loaded.',
  'Photo previews require browser URL support.', 'Photo preview unavailable.',
  'The server did not return a valid photo.', 'Removing…',
  'Local draft action failed. No saved or synced state was confirmed.', 'Draft saved on this device only.',
  'A copy was loaded into the form. Save it as a new draft; queued values keep their original request ID.',
  'Readings queued on this device. Use Sync now when online to send them.',
  'Local draft deleted. This does not delete a scan already received by the server.',
  'A queued reading was not accepted. It remains queued with the same request ID.',
  'Confirmed readings synced and removed from the local queue.',
  'You are offline. Queued readings remain local and were not sent.',
  'Sign in and select a farm to use local readings drafts.',
  'Viewer access is read-only. You can load drafts, but cannot save, queue, delete, or sync them.',
  'Sign in and select a farm to use local drafts.',
  'Viewer access is read-only. Drafts cannot be saved, queued, deleted, or synced.',
  'The server returned an invalid history response.',
  'API connected', 'API unavailable', 'Latest 8 saved scans', 'Clear local drafts',
  'Offline shell available. Saved scans and syncing require the API.',
  'Offline local drafts are stored only on this device and are not submitted automatically.',
  'Local drafts are not server-confirmed scans.',
  'The last attempt was interrupted. Retry uses the same request ID.',
  'The scan could not be confirmed. Retry uses the same request ID.',
  'The server response could not confirm this scan. Retry uses the same request ID.',
  'The server reported a conflict (409). This queued payload is unchanged. Check scan history before retrying.',
  'The server rejected these readings (400/422). Load a copy, correct it, and save a new draft.',
  'The server denied this request (401/403). Sign in with permission for this farm before retrying.',
  'The server could not accept the scan. The unchanged payload remains queued.',
  'The readings must belong to the selected farm.',
  'Batch ID must contain 2–80 characters without surrounding whitespace or control characters.',
  'Choose a valid sample type and input source.',
  'Readings must be finite numbers within the form limits. Complete every reading before saving.',
  'Local draft storage is unavailable. Nothing can be saved or synced until storage is available.',
  'Local drafts could not be read. Check browser storage access and retry.',
  'This account and farm already have 20 local drafts. Delete a draft or sync queued readings first.',
  'Local drafts exceed the storage size limit. Delete a draft before saving another.',
  'Local drafts changed in another tab. Refresh the draft list and retry.',
  'Local draft changes could not be saved. Browser storage may be full or blocked. No successful save or sync can be confirmed; retry with the same queued draft.',
  'Local draft changes could not be verified. Refresh the list before retrying; a queued scan may already have reached the server.',
  'Another tab is using drafts for this account and farm. Wait and retry.',
  'Drafts are busy in another tab. Wait for the current action, then retry.',
  'Draft locking could not be saved. No draft was sent or changed. Retry when browser storage is available.',
  'Local draft locking could not be verified. No draft was sent or changed. Retry when browser storage is available.',
  'Draft lock ownership changed in another tab. Refresh drafts before retrying.',
  'Drafts are busy in this or another tab. Wait for the current action, then retry.',
  'The draft action stopped because the active account, farm, or session changed.',
  'The scan API is unavailable. Queued readings have not been sent.',
  'The draft list or scan history could not be updated. Refresh both before retrying; a confirmed scan will not be queued again.',
  'The queued payload changed in another tab. Sync stopped; refresh the draft list.',
  'This draft no longer exists. Refresh the list.',
  'A secure draft ID could not be generated. Use a browser with secure UUID support.',
  'A unique draft ID could not be generated. Retry saving.',
  'The draft timestamp is invalid. Check the device clock and retry.',
  'Local draft data is invalid or too large. It has been left untouched. Recover or clear this account/farm draft key in browser storage before retrying.',
];

const existingCopy = [
  'Manual values now; ESP32 inputs can use the same contract later.',
  'Prototype feature inputs for the future calibrated spectroscopy model.',
  'Scores range from 0 (not observed) to 1 (strong indicator).',
  'Enter the readings available at the farm. The API saves the batch and returns an explainable screening estimate.',
  'Values are validated before analysis. No laboratory or sensor certification is implied.',
  'Validating sample inputs', 'Fusing sensor and visual signals',
  'Estimating nutritional profile', 'Checking storage and spoilage risk',
  'Generating farmer advisory', 'AI screening in progress', 'Analyzing signals…',
  'Know your feed before it reaches the herd.',
  'Rapid, explainable screening for feed and silage quality — built for confident action at the farm.',
  'One screening loop, explained clearly.',
  'Nutri-Scan combines available field inputs into a transparent risk estimate. Add calibrated hardware and laboratory-labelled models as the product scales.',
  'Awaiting a sample', 'Your result will appear here',
  'Run a sample screening to see quality score, risk signals and a simple next action.',
  'Good quality', 'Review before use', 'High risk detected',
  'Screening clear', 'Review advised', 'Prototype AI estimate',
  'Your completed screenings will appear here after the first scan.',
  'History could not be loaded.', 'The scan could not be completed.',
  'Start the FastAPI service to connect live data.',
  'Nutri-Scan AI provides rapid decision support only. It does not replace certified laboratory testing. Isolate suspicious batches and seek confirmatory testing for safety-critical decisions.',
  'Print / Save PDF ↗',
  'Export this saved scan. PDF saving uses your browser’s print dialog.',
  'Report opened in a new tab. Click Print / Save PDF there, then select Save as PDF.',
  'HTML download started. Open the file from your browser downloads to view or print it.',
  'The report could not be exported. Please try again.',
  'The report download could not be started. Please try again.',
  'The report popup was blocked. Allow popups for this site or open the downloaded HTML report to print.',
  'Uncalibrated prototype — not a certified laboratory report',
  'This is a prototype screening snapshot, not a certified laboratory result. Measurements and model outputs require validation against laboratory reference methods.',
  'A low risk label does not guarantee safety or suitability for feeding.',
  'Use qualified advice and confirmatory laboratory testing for feeding and safety decisions.',
  'Heuristic confidence is a prototype indicator, not a validated probability or a measure of diagnostic accuracy.',
  'No measurements recorded.', 'No anomaly entries recorded.', 'No advisory entries recorded.',
];

// Keep the spelling and punctuation identical to the backend. The source check
// below catches added or changed engine messages without needing Python or an API.
const engineMessages = [
  'Operator-reported visible mould indicator requires review',
  'Unusual sample colour pattern',
  'Elevated temperature in supplied storage reading',
  'Silage pH outside prototype target range',
  'No major anomaly indicator in supplied prototype inputs',
  'Isolate the affected batch and verify the operator-reported mould concern with a qualified test before feeding.',
  'Inspect storage ventilation and temperature conditions; this is a spot-check, not continuous monitoring.',
  'Review fermentation and storage conditions; confirm pH with a validated method.',
  'Prototype assessment is within the acceptable screening band; continue routine monitoring.',
  'Use the result as a screening signal and consider confirmatory laboratory testing.',
];

function placeholders(text) {
  return [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

test('language options expose exactly en, hi and mr with readable native labels', () => {
  assert.deepEqual(LANGUAGES, [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'mr', label: 'मराठी' },
  ]);
  assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'hi', 'mr']);
});

test('all anticipated panels and existing major instructions have explicit translations', () => {
  for (const key of [...requiredKeys, ...actualPanelKeys, ...existingCopy]) {
    for (const { code } of LANGUAGES) {
      assert.ok(Object.hasOwn(dictionaries[code], key), `${code} missing ${key}`);
      assert.equal(translate(code, key), dictionaries[code][key]);
      if (code !== 'en' && key !== 'pH') assert.notEqual(translate(code, key), key, `${code} fell back for ${key}`);
    }
  }
});

test('every Hindi and Marathi key has parity, nonblank localized copy and identical placeholders', () => {
  const englishKeys = Object.keys(dictionaries.en).sort();
  for (const locale of ['hi', 'mr']) {
    assert.deepEqual(Object.keys(dictionaries[locale]).sort(), englishKeys, `${locale} key parity`);
    for (const key of englishKeys) {
      const translated = dictionaries[locale][key];
      assert.equal(dictionaries.en[key], key, `English must preserve ${key}`);
      assert.equal(typeof translated, 'string', `${locale}: ${key}`);
      assert.ok(translated.trim(), `${locale} has blank text for ${key}`);
      assert.equal(translated, translated.trim(), `${locale} has stray whitespace for ${key}`);
      // pH is a scientific notation and intentionally unchanged in every locale.
      if (key !== 'pH') {
        assert.notEqual(translated, key, `${locale} silently copied English for ${key}`);
        assert.match(translated, /\p{Script=Devanagari}/u, `${locale}: ${key}`);
      }
      assert.deepEqual(placeholders(translated), placeholders(key), `${locale} placeholders: ${key}`);
    }
  }
});

test('interpolation works for all locales, multiple values and actual panel sentences', () => {
  const values = Object.freeze({ count: 0, total: 12 });
  const key = 'Showing {count} of {total} scans';
  assert.equal(translate('en', key, values), 'Showing 0 of 12 scans');
  assert.equal(translate('hi', key, values), '12 में से 0 जांचें दिखाई जा रही हैं');
  assert.equal(translate('mr', key, values), '12 पैकी 0 तपासण्या दाखवल्या आहेत');
  assert.equal(translate('hi', 'Good morning, {name}.', { name: 'सीमा' }), 'सुप्रभात, सीमा।');
  assert.equal(translate('mr', 'Page {page}', { page: 2 }), 'पृष्ठ 2');
  assert.equal(translate('mr', 'Download HTML report for batch {batchId}', { batchId: 'SIL-0142' }),
    'बॅच SIL-0142 चा HTML अहवाल डाउनलोड करा');
  assert.deepEqual(values, { count: 0, total: 12 });
});

test('every catalog template substitutes each of its declared placeholders', () => {
  for (const { code } of LANGUAGES) {
    for (const key of Object.keys(dictionaries.en)) {
      const names = placeholders(key);
      if (names.length === 0) continue;
      const values = Object.fromEntries(names.map((name) => [name, `⟦${name}⟧`]));
      const rendered = translate(code, key, values);
      assert.deepEqual(placeholders(rendered), [], `${code}: ${key}`);
      for (const name of names) assert.ok(rendered.includes(`⟦${name}⟧`), `${code}: ${name}`);
    }
  }
});

test('replacement is repeated, literal and single-pass, preserving zero and false', () => {
  for (const locale of ['en', 'hi', 'mr']) {
    assert.equal(translate(locale, '{name} / {name}: {count} {enabled}', {
      name: '$& $1 {count} 🌾', count: 0, enabled: false,
    }), '$& $1 {count} 🌾 / $& $1 {count} 🌾: 0 false');
    assert.equal(translate(locale, 'Batch {batchId}', { batchId: '<farm>&"' }), 'Batch <farm>&"');
    assert.equal(translate(locale, '{name}!', { name: '' }), '!');
  }
});

test('missing, null and inherited interpolation values keep visible placeholders', () => {
  for (const values of [undefined, null, {}, { name: null }, { name: undefined }, Object.create({ name: 'inherited' })]) {
    assert.equal(translate('hi', 'Good morning, {name}.', values), 'सुप्रभात, {name}।');
  }
  assert.equal(translate('en', '{name} {constructor} {toString} {__proto__}', { name: 'A' }),
    'A {constructor} {toString} {__proto__}');
  const ownValues = Object.assign(Object.create(null), { name: 'लता', count: 0 });
  assert.equal(translate('en', '{name} {count}', ownValues), 'लता 0');
});

test('unknown locales use exact English, including interpolation and advisory text', () => {
  for (const locale of ['fr', 'HI', 'hi-IN', '', undefined, null, '__proto__', 'constructor', 'toString']) {
    assert.equal(translate(locale, 'Overview'), 'Overview');
    assert.equal(translate(locale, 'Showing {count} of {total} scans', { count: 1, total: 3 }), 'Showing 1 of 3 scans');
    for (const english of engineMessages) assert.equal(translateAdvisory(locale, english), english);
    assert.equal(translateAdvisory(locale, 'Good'), 'Good');
  }
});

test('unknown keys and prototype property names remain visible English text', () => {
  for (const locale of ['en', 'hi', 'mr', 'unknown']) {
    for (const key of ['A newly added panel', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(translate(locale, key), key);
      assert.equal(translateAdvisory(locale, key), key);
    }
    assert.equal(translate(locale, 'New panel for {name}', { name: 'Farm A' }), 'New panel for Farm A');
    const unknownAdvice = ' New advice for {name}.\nKeep this exact English message. ';
    assert.equal(translateAdvisory(locale, unknownAdvice), unknownAdvice);
  }
});

test('all current engine advisory and anomaly strings are matched exactly from source', async () => {
  const source = await readFile(new URL('../../backend/app/engine.py', import.meta.url), 'utf8');
  // Current engine messages are ordinary double-quoted Python string literals,
  // also valid JSON. Guard the append count so a new unsupported syntax fails.
  const literals = [...source.matchAll(/(?:advisory|anomalies)\.append\(\s*("(?:\\.|[^"\\])*")\s*\)/g)];
  assert.equal(literals.length, [...source.matchAll(/(?:advisory|anomalies)\.append\(/g)].length,
    'Update the source extractor if the engine stops using simple string literals');
  const actual = literals.map((match) => JSON.parse(match[1]));
  assert.equal(actual.length, 10);
  assert.deepEqual(actual.sort(), [...engineMessages].sort(), 'Engine wording changed: update exact keys and translations');
  for (const english of actual) {
    assert.equal(translateAdvisory('en', english), english);
    for (const locale of ['hi', 'mr']) {
      assert.ok(Object.hasOwn(dictionaries[locale], english), `${locale} missing engine message: ${english}`);
      assert.notEqual(translateAdvisory(locale, english), english);
      assert.equal(translateAdvisory(locale, english), dictionaries[locale][english]);
      assert.match(translateAdvisory(locale, english), /\p{Script=Devanagari}/u);
      // Advice must not be matched approximately after a backend wording change.
      assert.equal(translateAdvisory(locale, `${english} `), `${english} `);
      assert.equal(translateAdvisory(locale, english.toLowerCase()), english.toLowerCase());
    }
  }
});

test('engine Good/Review, spoilage levels and uppercase risk levels have explicit mappings', () => {
  for (const [english, hi, mr] of [
    ['Good', 'अच्छा', 'चांगले'], ['Review', 'समीक्षा करें', 'पुनर्तपासणी करा'],
    ['Low', 'कम', 'कमी'], ['Medium', 'मध्यम', 'मध्यम'], ['High', 'उच्च', 'जास्त'],
    ['LOW', 'कम', 'कमी'], ['MEDIUM', 'मध्यम', 'मध्यम'], ['HIGH', 'उच्च', 'जास्त'],
  ]) {
    assert.equal(translateAdvisory('en', english), english);
    assert.equal(translateAdvisory('hi', english), hi);
    assert.equal(translateAdvisory('mr', english), mr);
  }
});

test('API enum aliases translate display values without changing English keys', () => {
  for (const [raw, label] of Object.entries({
    silage: 'Silage', feed: 'Cattle feed', manual: 'Manual entry',
    mobile: 'Mobile capture', esp32: 'ESP32 field unit',
    uncalibrated: 'Uncalibrated', prototype_screening: 'Prototype estimate',
    owner: 'Owner', member: 'Member', viewer: 'Viewer',
  })) {
    assert.equal(translate('en', raw), raw);
    for (const locale of ['hi', 'mr']) {
      assert.equal(translateAdvisory(locale, raw), translate(locale, label));
    }
  }
});

test('safety copy retains prototype limits, expert confirmation and no safety guarantee', () => {
  const disclaimer = 'Nutri-Scan AI provides rapid decision support only. It does not replace certified laboratory testing. Isolate suspicious batches and seek confirmatory testing for safety-critical decisions.';
  assert.match(translate('hi', disclaimer), /प्रमाणित प्रयोगशाला जांच का विकल्प नहीं/);
  assert.match(translate('mr', disclaimer), /प्रमाणित प्रयोगशाळेतील तपासणीचा पर्याय नाही/);
  assert.match(translate('hi', disclaimer), /संदिग्ध बैच अलग रखें/);
  assert.match(translate('mr', disclaimer), /संशयास्पद बॅच वेगळ्या ठेवा/);
  const lowRisk = 'A low risk label does not guarantee feed safety.';
  assert.match(translate('hi', lowRisk), /सुरक्षा की गारंटी नहीं/);
  assert.match(translate('mr', lowRisk), /सुरक्षिततेची हमी देत नाही/);
  const draftNotice = 'Translations are draft guidance; verify safety advice with a qualified expert.';
  assert.match(translate('hi', draftNotice), /प्रारूप.*योग्य विशेषज्ञ/);
  assert.match(translate('mr', draftNotice), /मसुदा.*पात्र तज्ज्ञ/);
  const isolate = 'Isolate the affected batch and verify with a qualified test before feeding.';
  assert.match(translateAdvisory('hi', isolate), /खिलाने से पहले.*योग्य विशेषज्ञ.*जांच/);
  assert.match(translateAdvisory('mr', isolate), /खाऊ घालण्यापूर्वी.*पात्र तज्ज्ञ.*तपासणी/);
  const acceptable = 'Prototype assessment is within the acceptable screening band; continue routine monitoring.';
  assert.match(translateAdvisory('hi', acceptable), /प्रोटोटाइप.*प्रारंभिक जांच.*निगरानी जारी/);
  assert.match(translateAdvisory('mr', acceptable), /प्रायोगिक.*प्राथमिक तपासणी.*निरीक्षण सुरू/);
  const noAnomaly = 'No major anomaly indicator in supplied prototype inputs';
  assert.match(translateAdvisory('hi', noAnomaly), /दी गई प्रोटोटाइप जानकारी/);
  assert.match(translateAdvisory('mr', noAnomaly), /दिलेल्या प्रायोगिक माहितीत/);
  const confidence = 'Heuristic confidence is a prototype indicator, not a validated probability or a measure of diagnostic accuracy.';
  assert.match(translate('hi', confidence), /प्रोटोटाइप.*सटीकता का माप नहीं/);
  assert.match(translate('mr', confidence), /प्रायोगिक.*अचूकतेचे मोजमाप नाही/);
});

test('photo and offline copy preserve evidence-only and not-yet-submitted distinctions', () => {
  const photos = 'Evidence only — photos are not analyzed by AI.';
  assert.match(translate('hi', photos), /केवल साक्ष्य.*विश्लेषण नहीं करता/);
  assert.match(translate('mr', photos), /केवळ पुराव्यासाठी.*विश्लेषण करत नाही/);
  const drafts = 'Saved drafts are not submitted until you sync.';
  assert.match(translate('hi', drafts), /सिंक करने तक जमा नहीं/);
  assert.match(translate('mr', drafts), /सिंक करेपर्यंत.*सादर होत नाहीत/);
});

test('module import and calls need no network, browser or parent locale persistence', async (t) => {
  const browserGlobals = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator'];
  for (const name of browserGlobals) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { assert.fail(`i18n must not access ${name}`); },
    });
  }
  t.mock.method(globalThis, 'fetch', () => assert.fail('i18n must not call a translation API'));
  const isolated = await import('./i18n.js?without-browser-or-network');
  const before = structuredClone(isolated.dictionaries);
  for (const { code } of isolated.LANGUAGES) {
    for (const key of Object.keys(isolated.dictionaries.en)) {
      assert.equal(typeof isolated.translate(code, key), 'string');
      assert.equal(typeof isolated.translateAdvisory(code, key), 'string');
    }
  }
  assert.equal(isolated.translate('hi', 'Overview'), 'अवलोकन');
  assert.equal(isolated.translate('mr', 'Overview'), 'आढावा');
  assert.equal(isolated.translate(undefined, 'Overview'), 'Overview');
  assert.deepEqual(isolated.dictionaries, before);
});

# Fieldwork additions — verification

## Checks run

| Check | Result |
| --- | --- |
| Backend regression + fieldwork suite: `.venv/bin/python -m unittest discover -s tests -p "test_*.py"` | **48 passed** |
| Frontend tests: `npm test` | **309 passed**, no failures/skips |
| Production build: `npm run build` | Passed; PWA assets/service worker generated and React vendor chunk split |
| Whitespace: `git diff --check` | Passed |
| Existing farmer-flow browser smoke | Passed against an isolated temporary database |
| Fieldwork live browser smoke: `node tests/fieldwork-live.browser.mjs` | Passed at 390px against isolated FastAPI/SQLite; batch/photo/observation/reminder/testing/report/viewer/readback paths verified |
| PWA mock browser smoke: `node tests/pwa.browser.mjs` | Passed; install lifecycle, cache boundaries, offline help and update activation verified |
| PWA live preview: `node tests/pwa-live.browser.mjs` | Passed; actual App bootstrap, service worker, installability, public cache allowlist and offline English/Hindi/Marathi help verified |
| Reading assist mock browser smoke: `node tests/reading-assist.browser.mjs` | Passed; voice/serial lifecycle and review-only behavior verified |
| API schema/auth smoke on normal port 8000 | Fieldwork routes and `InstrumentCapture` schema present; unauthenticated fieldwork returns 401 |

Backend emits the existing FastAPI/Python deprecation warning about
`asyncio.iscoroutinefunction`. No separate lint or typecheck script exists.

## Isolation and privacy

The live browser check used a separate SQLite database in a private temporary
directory outside the repository and API/frontend ports 8123/5174. It created only
generated test users and test data.
The normal app at 5173 and backend at 8000 were not used for test accounts. A
owner-only backup of the pre-update backend SQLite file was created outside the
workspace before the additive table migration. No credentials were written to the
repository or localStorage; no external share or WhatsApp action was invoked.

## Real-device gaps

- Browser checks use mocked SpeechRecognition and Web Serial transports. Test a real
  microphone, browser permission prompt, language recognition, actual meter output,
  disconnect, and calibration report on the target farm devices.
- The serial protocol is implemented but the app does not claim a particular meter
  model or validated calibration. Connect only devices configured for the documented
  newline JSON protocol; unsupported devices retain manual entry.
- Device speech may require network access depending on the browser/vendor. The app
  always keeps typed/manual entry available.
- The PWA shell is verified on localhost Chromium. HTTPS and browser policy still
  apply for deployment; only public help is available offline, not private farm data.
- Lab requests are farm-local tracking records. They do not discover, contact, book,
  accredit or interpret a laboratory automatically. A qualified adviser must review
  sampling instructions, reports and translated safety guidance.
- Instrument provenance is intentionally stripped by the existing offline draft
  allowlist. The draft still warns farmers that device/time/calibration metadata will
  not survive offline draft save/load; direct online submissions preserve it.

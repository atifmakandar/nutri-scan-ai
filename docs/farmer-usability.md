# Farmer-friendly Nutri-Scan

## What changed

The existing account, screening, history, photo, draft, QR and report features
remain connected to the same API. The dashboard now starts in **Farmer Mode**.
Use **Detailed dashboard** to show the original overview and navigation.

| Feature | Farmer-visible behaviour |
| --- | --- |
| Simple home | Three large text-and-icon actions: check feed/silage, view past results, and get measurement help. Account/member controls are collapsed after sign-in. |
| Guided screening | Four steps: choose sample, choose batch, enter readings, review and submit. Back preserves entered values. Existing batch selection reuses only its ID, not previous readings. |
| Readable results | Risk is described with text and an icon, followed by saved indicators and next steps. Measurements and model details are expandable. The prototype score remains visible. |
| Listening | Tap **Listen** for instructions, field help, or a saved result in English, Hindi or Marathi. **Stop reading** cancels playback. Missing voices have a readable fallback. |
| Illustrated help | Every reading has **How to measure…**, with a local illustration, units, entry guidance, and a common mistake. No external image service is used. |
| Offline clarity | Connection state, separate draft/queue counts, explicit **Sync now**, and the last confirmed queued upload time. Unsaved form edits are never described as saved. |
| What changed | Short, neutral measurement comparisons plus an exact-value table, both with a selected result and alongside batch trend charts. |
| Adviser sharing | Preview the exact summary, then choose device sharing, copy, or WhatsApp. Farm ID/name and selected evidence photos are optional and off by default. Photos use supported native device sharing only; text actions never expose private photo URLs. Authentication data is excluded. |

## Try the workflow

1. Open `http://localhost:5173` and hard-refresh with **Ctrl + Shift + R**.
2. Sign in, or create a farm account with an email-style username, farm name,
   and password of at least 10 characters.
3. Choose **Check feed or silage**. Select the sample and name/select its batch.
4. Enter actual measurements. Use the illustrated help where needed.
5. Review all values and check the confirmation box before submitting.
6. Read the result and next steps, or select your language and press **Listen**.
7. After a second screening of the same batch/sample type, inspect **What changed
   in this batch?**. History's **View batch** also shows the comparison with charts.
8. Choose **Preview summary** before sharing. Review the text and identity options.

For optional evidence attachments, choose **Choose saved photos**, select the
filenames, then **Prepare selected photos**. Review their thumbnails before
previewing and sharing. The later **Share using this device** action sends the
selected Files only when the device supports them. Unsupported file sharing
shows an explanation; it never silently drops selected attachments. **Copy
summary** and **Send text to WhatsApp** remain text-only. Remove photo choices
to discard prepared bytes/previews and return to a text-only summary.

Changing a reading or loading a draft invalidates the earlier review confirmation.
New forms start with blank readings, not example measurements. Real zero values
remain distinct from missing values.

### Offline readings

With an already-open, signed-in dashboard:

1. Complete the readings and choose **Save draft** under **Saved readings**.
2. Choose **Queue** for the saved draft. The header reports it as waiting to upload.
3. Reconnect and choose **Sync now** explicitly. Reconnection alone sends nothing.
4. A confirmed queued scan is removed only after the API response and local removal
   are verified. Its confirmation time is stored for this user/farm on this device.

The timestamp describes confirmed **draft queue uploads**, not a connectivity check
or a record of every direct form submission. A failed timestamp write does not
requeue an already-confirmed scan. Storage failures remain visible.

## Important boundaries

- **All ten readings are currently required by the scoring engine.** Incomplete
  forms cannot be submitted or saved through the existing complete-reading draft
  contract. There are no guessed values or missing-to-zero conversions.
- Nutrient percentages must come from a suitable measured report/instrument.
  Visual scores are prototype inputs requiring a trained operator and a validated
  method; the app does not objectively measure them from a photo.
- Photo uploads are private evidence only, **not AI image diagnosis**.
- Scores and confidence are uncalibrated prototype indicators, not laboratory
  results, validated probabilities, or guarantees that feed is safe.
- Hindi/Marathi translations remain draft guidance requiring expert review.
- Speech uses the browser/device's available voices. A same-language regional
  voice may be used, but a different-language default is never silently selected.
  Audible playback and offline availability depend on the installed voice.
- This is not a new installable PWA or a guarantee that the site can reload without
  network access. Device-local drafts work in an already-loaded signed-in app.
- Comparisons use at most 100 loaded records, with matching farm, batch and sample
  type and explicit saved-at UTC timestamps. They compare the selected result to
  its nearest strictly earlier eligible record, not a later screening. Missing
  values remain missing; an increase/decrease is not automatically good or bad.
- Sharing is saved-result-only and opt-in. WhatsApp receives the preview text only
  after its explicit action. Review recipient and content. Native sharing/clipboard
  availability varies; the selectable preview remains available as a fallback.
  Photo preparation explicitly fetches selected private JPEG/PNG/WebP bytes through
  the authenticated API (at most five, 5 MiB each). Files/local previews are kept
  only in memory and discarded on selection/source/account change or unmount;
  local URLs are revoked. No private photo URL is sent through sharing text.
- Viewers stay read-only. Draft lists, queue metadata, and displayed results are
  scoped to the authenticated account/farm and cleared from view on logout/change.

## Code map

- `frontend/src/main.jsx`: React bootstrap; `App.jsx`: actual API/session integration.
- `FarmerHome.jsx`, `GuidedScreening.jsx`, `screening.js`: navigation and validated
  controlled screening flow, with no fabricated initial readings.
- `FarmerResults.jsx`, `farmer-results.js`: saved summaries, chronological comparison,
  allowlisted sharing text, and explicit browser sharing actions.
- `ShareEvidencePicker.jsx`, `share-evidence.js`: explicit photo selection and
  authenticated preparation, native File sharing, cancellation and URL cleanup.
- `HistoryPanel.jsx`, `BatchTrends.jsx`: existing search/charts plus comparison slot.
- `FarmerHelp.jsx`, `ListenButton.jsx`, `guidance.js`: illustrated help and cancellable
  browser speech with safe unavailable/error states.
- `DraftsPanel.jsx`, `OfflineStatus.jsx`, `offline-status.js`: draft counts and strict,
  minimal user/farm confirmation metadata; existing `drafts.js` queue schema unchanged.
- `farmer-i18n.js` and `*-messages.js`: English/Hindi/Marathi app and feature copy.
- `farmer-*.css`: responsive, larger text/controls, focus and reduced-motion styles.

No backend API, account credentials, scoring formula, or application dependency
versions were changed for these usability additions. Existing uncommitted work
was preserved; no reset, workspace cleanup, or commit was performed.

## Verification — 15 October 2026

| Check | Command and location | Result |
| --- | --- | --- |
| Frontend unit, SSR, contract and localization tests | `npm test` in `frontend/` | 241 passed; no failures/skips |
| Frontend production build | `npm run build` in `frontend/` | Passed, with lazy-loaded feature panels; no large-chunk warning |
| Backend regression suite | `.venv/bin/python -m unittest discover -s tests -p "test_*.py"` in `backend/` | 17 passed |
| Tracked whitespace | `git diff --check` in the repository | Passed |
| Isolated browser flow | `node tests/farmer-flow.browser.mjs` in `frontend/`, with the explicit environment below | Passed in Chromium at 390px mobile width |

Backend tests still emit the existing non-blocking FastAPI/Python deprecation
warning. There is no separate lint/typecheck script configured.

The browser check used a **different SQLite database and API on port 8123** and
frontend on **5174**, never the normal API database on 8000. It tested registration,
home navigation/mode switching, missing-reading validation, help, confirmed scan
submission, offline queue and explicit sync, comparison narratives/tables/charts,
sharing privacy defaults, authenticated evidence upload/selection/preparation and
File payloads, unsupported-file fallback, Hindi/Marathi speech selection,
persistence after reload, logout and viewer/account isolation. No browser
exceptions occurred. Speech,
clipboard, device share and `window.open` were mocked: no external summary was
sent and no audible output/native sharing dialog is claimed verified.

### Repeat the optional browser check

This check is deliberately separate from `npm test`: it needs Playwright and
Chromium but does not add them to the application's package manifest. Never point
it at a real farmer database.

1. Choose a fresh temporary directory as `SMOKE_DIR`, and install Playwright there
   (or use an existing installation). Use the same path in the terminals below.
   Install its Chromium browser and ensure its Linux runtime libraries are
   available. No administrator/system package installation is performed by the test.
2. From `backend/`, start a separate API:

   ```bash
   NUTRI_SCAN_DB="$SMOKE_DIR/smoke.sqlite3" .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8123
   ```

3. From `frontend/`, start a separate frontend:

   ```bash
   VITE_PROXY_TARGET=http://127.0.0.1:8123 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
   ```

4. From another `frontend/` terminal, run:

   ```bash
   NUTRISCAN_PLAYWRIGHT_MODULE="$SMOKE_DIR/browser/node_modules/playwright" \
   NUTRISCAN_SMOKE_URL=http://127.0.0.1:5174 \
   NUTRISCAN_ALLOW_TEST_ACCOUNTS=1 \
   node tests/farmer-flow.browser.mjs
   ```

   Set `NUTRISCAN_PLAYWRIGHT_MODULE` to the actual module directory. When libraries
   are extracted locally instead of installed system-wide, also set
   `LD_LIBRARY_PATH` to that temporary library directory. An optional
   `NUTRISCAN_SMOKE_SCREENSHOT` supplies a screenshot output path; use test data only.
5. Stop the separate test servers afterwards. Leave the normal 5173/8000 servers
   and real SQLite database alone. Generated plaintext credentials stay in process memory;
   the temporary database contains test-only users and scans, not real farm data.

### Manual checks still needed on the farmer's device

- Confirm audible Hindi/Marathi playback and the unavailable-voice fallback with
  that device's installed voices.
- Try actual native sharing, clipboard permission denial, and WhatsApp, reviewing
  recipients and the preview. Tests intentionally do not send farm data externally.
- Have an agricultural expert review translated safety/measurement advice before
  using this prototype for real feeding decisions.

# Fieldwork extension contract

These additions do not alter the prototype scoring formula. All private endpoints
remain session/farm scoped, use existing Origin checks, and return `no-store`.
Owners/members may write; viewers may read. No public lab directory or notification
provider is implied. All dates below use `YYYY-MM-DD`; timestamps include timezone.

## Shared REST conventions

All routes start `/api/v1/`. List routes accept `limit` (default 20, max 100) and
`offset` and return `{items, total, limit, offset}`. Individual resources use UUID
`id`; the human `batch_id` remains a 2–80 character feed/silage identifier.
Writes use POST to preserve the app's existing CORS/CSRF policy. Creates return 201;
updates return 200. Missing/foreign resources return 404. Duplicate batches 409.
Input bodies never accept a user-supplied farm/owner. Optional text defaults to
empty, dates/quantities to null. Text is bounded and rendered as text, not HTML.

## Managed batches

- `GET/POST batches`; `GET/POST batches/{id}` (POST is full metadata update).
- Body: `{batch_id, name, sample_type, storage_location, prepared_on, opened_on,
  quantity, quantity_unit, notes}`.
- `sample_type`: `feed|silage`; `quantity_unit`: `kg|tonne|bales|bags`.
- Response: body plus `{id,farm_id,created_at,updated_at,photo_count,
  latest_scan,latest_observation}`. Latest records match farm + batch_id + sample.
- Unique farm/batch_id/sample_type. Identity (batch_id/sample_type) is immutable
  after creation, so edits cannot silently detach history. `name` is a display name.
- Quantity is nonnegative finite or null. Units never auto-convert. Opening cannot
  precede preparation when both dates are supplied. No invented expiry dates.

## Observation-only checks

- `GET/POST observations`; `GET observations/{id}`. Optional exact batch_id and
  sample_type list filters. No scoring engine call and no score/confidence/safety label.
- Body: `{batch_id,sample_type,observed_on,mould,unusual_heat,unusual_smell,
  cover_damage,notes}`. Each answer is `yes|no|unknown`; missing defaults to unknown.
- Response: body plus `{id,farm_id,created_at,photo_count,kind:'observation_only'}`.
- UI requires explicit responses or preserves unknown; never defaults unknown to no.
  Guidance refers concerning/unknown observations for qualified review, not diagnosis.

## Reminders / follow-up tasks

- `GET/POST reminders`; `POST reminders/{id}/status` with `{status}`.
- Body: `{title,batch_id,sample_type,due_on,notes}`. Batch/sample may both be null.
- Response: body plus `{id,farm_id,status,completed_at,created_at,updated_at}`.
- Status `pending|completed`; completion may be reopened. Due today/overdue are
  computed against the farmer's local calendar date, not an invented testing interval.
- In-app reminders only; no background/SMS delivery promise.

## Assisted testing requests

- `GET/POST testing-requests`; `GET testing-requests/{id}`;
  `POST testing-requests/{id}/status` with `{status,collected_on,report_received_on}`.
- Create body: `{batch_id,sample_type,requested_on,contact_name,contact_details,notes}`.
- Response: body plus `{id,farm_id,status,collected_on,report_received_on,
  created_at,updated_at,report_count}`.
- Status `requested|collected|report_received`; enforce forward transitions with
  appropriate dates. A report attachment must exist before report_received status.
- This is a local farm tracking request, not automatically sent/booked externally.
  Provide sample-collection guidance, printable request summary, and report storage.
  No invented contacts, accreditation claims, lab interpretation or OCR.

## Private attachments

- Batches and observations: `GET/POST {collection}/{id}/photos`,
  `GET {collection}/{id}/photos/{photo_id}`.
- Requests: `GET/POST testing-requests/{id}/reports`,
  `GET testing-requests/{id}/reports/{report_id}`.
- Metadata arrays use `{id,filename,content_type,url,created_at}`; bytes are raw
  request bodies with Content-Type and optional X-Filename, like existing scan photos.
- Five attachments maximum per parent. Photos: JPEG/PNG/WebP, <=5 MiB, normalized
  with the existing Pillow routine, stripping metadata. Reports may additionally be
  PDF <=10 MiB with basic signature/EOF validation, delivered as attachment, never
  inline/executed. Basic PDF validation is not malware scanning; only open trusted files.
- Authenticate every metadata/byte route, use normalized filenames/no-store/nosniff,
  stream size bounds, and never expose files as static public assets.

## Frontend integration

`FieldworkHub({api,session,online,onUseBatch,t})` is keyed by authenticated scope.
It includes batch cards, observation checks, reminders and assisted requests, with
pagination, errors, read-only states and private attachment controls. New records
are server-persisted; offline writes must not falsely claim success. No local caching
of these private responses. Use local supplemental Hindi/Marathi translations.

Voice and instrument assistance are opt-in controls on the measured-reading step.
They propose values for review and never submit a scan or invent missing readings.
The installable PWA caches only a public shell/help and allowlisted static assets,
never authentication, API responses, photos or reports.

## User workflow

Open the normal app at `http://localhost:5173`, hard-refresh, and sign in. The
**Batches, observations, reminders and testing help** link opens the persisted
fieldwork hub. Create a batch before saving observations or a testing request.
Use **Use this batch** to copy only its exact identity into a fresh screening;
old readings are never copied. Viewer accounts can read/download but cannot change
fieldwork, upload attachments, or submit screenings.

### Quick observation

Choose **Quick observations**, answer visible mould, unusual heat, unusual smell,
and cover damage as Yes/No/Unknown, then save. Unknown stays unknown. The record is
explicitly observation-only and never calls the scoring engine or creates a score.

### Reminders and testing help

Reminders are local in-app tasks: due today/overdue/completed groups and explicit
complete/reopen actions. They do not send SMS or background notifications.

Testing help is a local request tracker. Use the collection checklist, save the
provider/contact details selected by the farmer, mark collected, upload a report,
then mark report received. The request is not booked or sent to a lab automatically.
Saved reports are downloads; they are not rendered inline or OCR-interpreted.

### Voice and instrument assistance

On step 3 of screening, open **Optional reading assistance**. **Voice entry** requires
explicit microphone consent and only proposes one reviewed value; it never submits.
Browser speech services may require internet and no audio is saved by Nutri-Scan.

**Read from instrument (USB serial)** requires a real Web Serial device on HTTPS or
localhost and a user click. The device must emit the UTF-8 newline JSON protocol
shown in the UI at 115200 baud. Review and select individual readings, confirm them,
and then complete the normal four-step review. The app sends no commands, invents no
readings, and treats device calibration as a report rather than verification. Saved
scan provenance includes device, capture time, selected fields and calibration state;
current offline draft storage intentionally retains readings but not this provenance.

### Install/offline shell

Production preview is available at `http://localhost:5174` after `npm run build` and
`npm run preview -- --host 0.0.0.0 --port 5174`. The browser may show **Install app**.
The service worker caches only the public shell/help/manifest/assets. It never caches
personalized HTML, API responses, sign-in data, photos or reports. Offline reload
shows public English/Hindi/Marathi help; private records still require reconnecting
and signing in. Use the browser menu or iOS Share → Add to Home Screen when no native
install prompt is offered.

## Added files

- Backend: `backend/app/fieldwork.py`, `fieldwork_models.py`, `fieldwork_storage.py`,
  plus `backend/tests/test_fieldwork.py`; additive tables are initialized lazily.
- Hub: `frontend/src/FieldworkHub.jsx`, `FieldworkWorkflows.jsx`, `FieldworkForms.jsx`,
  `FieldworkAttachments.jsx`, controls/hooks/print/validation/messages/CSS.
- Capture: `ReadingAssist.jsx`, `VoiceReading.jsx`, `InstrumentCapture.jsx`,
  `reading-assist*.js`, messages/CSS, and `InstrumentProvenance.jsx`.
- PWA: `pwa-plugin.js`, `public/manifest.webmanifest`, `public/offline.*`, local icon,
  `InstallApp.jsx`, `pwa*.js`, messages/CSS and service-worker tests.

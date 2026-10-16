# Nutri-Scan AI

Feed and silage workflow prototype based on SIH 2026 PS 26111.

The presentation proposes camera inspection, NIR spectroscopy, IoT sensors and AI/ML.
The current app records supplied numerical inputs and private evidence, with reviewed
optional serial capture and an uncalibrated scoring engine. It does not implement
validated photo diagnosis, nutrient prediction or contaminant detection.

**Sample → Scan → Analyze → Quality Score → Advisory → History**

This repository contains a working workflow MVP and adapters toward that architecture,
not a validated measurement system or feed-safety certification product.

## Features

- Feed/silage record and prototype screening API
- Numerical input adapters and optional reviewed USB serial capture; photos are evidence only
- Uncalibrated quality score and heuristic confidence, not a validated probability
- Supplied moisture, dry matter, protein, fiber, pH and temperature values with prototype fermentation/spoilage labels
- Input-anomaly/spoilage indicators, not adulteration or toxin tests
- Prototype guidance requiring qualified review, not feeding clearance
- Test history and traceability-ready data model
- Downloadable HTML screening reports and browser Print / Save PDF
- Searchable, filterable farm history with pagination and batch trends
- Batch QR labels with authenticated deep links
- Private farm accounts with owner/member/viewer roles
- Evidence-only photo attachments for saved scans
- Hindi, Marathi, and English dashboard copy
- Per-farm offline reading drafts with explicit idempotent sync
- Public-help offline PWA shell; explicit reading drafts in an already-loaded signed-in app
- USB serial ESP32 firmware template with synthetic demo mode enabled by default
- Dockerfile and Docker Compose single-container build
- GitHub Actions CI

> **Important:** The current AI endpoint is a transparent prototype scoring engine. It is not a laboratory replacement and must be calibrated against laboratory reference data before real-world deployment. The presentation itself specifies validation/calibration with laboratory reference data.

## Launch planning pack

Start with [`docs/launch/README.md`](docs/launch/README.md) for the business plan,
pricing and cash-flow scenarios, sales/demo copy, customer/pilot/privacy templates,
90-day action tracker, technical readiness and operating checklists. These are
review drafts for a bounded workflow pilot, not commercial, legal, scientific or
production approval. Use its current claims matrix rather than older aspirational
architecture text for customer-facing statements.

## Buildathon capability scope

The current demo adds optional reported nutrition values and review flags for
adulteration, toxin, mineral, sand/silica, and fungal concerns. It also displays
humidity in saved results and reports. These are operator- or laboratory-supplied
inputs, not automatic detections. Photos remain evidence only, storage history is
spot-check based, and the ESP32 path is a reviewed transport demonstration.

See [`docs/capability-matrix.md`](docs/capability-matrix.md) for the complete
feature-to-claim map and the validation evidence still required before production
nutrition, contamination, toxin, or safety claims.

## Phase 1 vertical slice

The web flow is connected to the API and SQLite repository:

```text
Batch + field inputs → POST /api/v1/scans → explainable result → GET /api/v1/scans
```

The dashboard shows quality score, risk level, confidence indicator, measurements,
advisories, prototype model status, and saved history. Restarting the API does
not remove local scan history. See [`docs/architecture.md`](docs/architecture.md)
for the schema, pipeline, API contract, and delivery roadmap.

## Architecture

Target architecture from the presentation; camera/NIR are currently numerical input
adapters, and real sensor conversions require integration and validation. The diagram
does not establish deployed camera analysis, spectroscopy or calibrated ML.

```text
 Camera ───────┐
 NIR ──────────┼──> FastAPI ingestion ──> preprocessing ──> fusion/scoring ──> advisory
 ESP32 sensors ─┘                                      │
                                                       ├──> test history
                                                       └──> React dashboard
```

## Repository structure

```text
nutri-scan-ai/
├── backend/                 # FastAPI API + prototype AI engine
├── frontend/                # React + Vite farmer dashboard
├── firmware/esp32/          # ESP32 sensor acquisition template
├── docs/                    # Architecture and API notes
├── .github/workflows/       # CI
├── docker-compose.yml
└── README.md
```

## Rebuild from scratch on Linux

### Requirements

- Git
- Docker Engine or Docker Desktop with Compose v2
- For the local developer path: Python **3.12.9** and Node **22.14.0**. These
  versions are pinned in [`.python-version`](.python-version) and
  [`.node-version`](.node-version).

The frontend uses `frontend/package-lock.json`; the backend uses the exact-pinned
[`backend/requirements.lock`](backend/requirements.lock). Do not use `npm install`
for a clean rebuild; use `npm ci`.

### Clone and configure

```bash
git clone https://github.com/atifmakandar/nutri-scan-ai.git
cd nutri-scan-ai
cp .env.example .env
```

`.env.example` contains settings only and no secrets. Keep `.env` local and never
commit it. The Docker configuration stores SQLite data in a named volume; the
default HTTP setting is for local development only.

### Recommended Docker build

```bash
docker build --target runtime -t nutri-scan:local .
```

This builds the locked Node frontend, builds the Python API with the locked backend
dependencies, and packages both into one image. It does not require a host Python or
Node installation.

### One test command

```bash
docker build --target test -t nutri-scan:test .
```

The test target runs backend unit tests, calibration tests, frontend tests, frontend
production build and Python compilation. A successful image build is the test result.

### Run the built application

```bash
docker run --rm --name nutri-scan \
  --env-file .env \
  -e NUTRI_SCAN_STATIC_DIR=/app/frontend-dist \
  -p 8000:8000 \
  -v nutri_scan_data:/data \
  nutri-scan:local
```

Open `http://localhost:8000`. The API documentation is at
`http://localhost:8000/docs`. The container serves the built React application and
the API from one origin. Stop it with `Ctrl+C`.

### Docker Compose alternative

```bash
docker compose up --build
```

Compose uses the same Dockerfile, named SQLite volume and port `8000`. Remove the
named volume only when you intentionally want to discard local data:

```bash
docker compose down
docker volume rm nutri-scan-ai_nutri_scan_data
```

### Local developer setup without Docker

Use the pinned Python and Node versions, then install from the lockfiles:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.lock
cd ../frontend
npm ci
```

Run the API in one terminal:

```bash
cd backend
NUTRI_SCAN_DB=data/nutri_scan.sqlite3 \
NUTRI_SCAN_COOKIE_SECURE=false \
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run the Vite development server in another terminal:

```bash
cd frontend
VITE_PUBLIC_API_URL= VITE_API_URL= VITE_PROXY_TARGET=http://127.0.0.1:8000 \
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://localhost:5173`. The Vite proxy forwards `/api` and `/health` to the
API, so the browser uses one origin and the HttpOnly session cookie works normally.
For a separately hosted HTTPS frontend, set `VITE_PUBLIC_API_URL` and the matching
explicit backend `NUTRI_SCAN_ORIGINS` value; never put secrets in `VITE_*` variables.

The local equivalent of the Docker test target is:

```bash
(cd backend && .venv/bin/python -m unittest discover -s tests -p "test_*.py") \
  && backend/.venv/bin/python -m unittest discover -s tools/calibration -p "test_*.py" \
  && npm --prefix frontend test \
  && npm --prefix frontend run build
```

## Download or print a screening report

1. Open the dashboard (normally `http://localhost:5173`) with the API running.
2. Run a screening. Under the latest result, click **Download report (.html)**
   to save a standalone HTML report. Open it from your browser's downloads;
   it needs no server or internet connection to display.
3. For a PDF, click **Print / Save PDF** on the dashboard. This opens the report
   in a new tab. Click **Print / Save PDF** in that tab (or press `Ctrl+P` / `Cmd+P`),
   select **Save as PDF** or **Microsoft Print to PDF**, and save the file.
4. The same actions are available in the **Report** column of **Recent screening
   history**, including after refreshing the dashboard. On a narrow screen,
   scroll the history table horizontally to find the column.

Reports reproduce the **saved scan**, not changes subsequently typed into the form.
They include farm/batch/scan identifiers, timestamps, sample and source details,
quality and risk, heuristic confidence, saved measurements and units, anomalies,
all advisories, and model/calibration information. They retain the prominent
uncalibrated-prototype disclaimer and never certify feed safety. Reports include
farm details; review them before sharing. No third-party report service is used.

**If a popup is blocked:** allow popups for the dashboard, or download the HTML
report and open it directly before printing. The default download is HTML, not
a directly generated PDF; PDF creation uses your browser's print dialog.

## Accounts, privacy, and the seven farm features

The expanded dashboard is authenticated. Create an account from **Create farm
account** with a username, a farm name, and a password of at least 10 characters.
The browser receives only an HttpOnly session cookie; passwords and tokens are
not stored in local storage. A new account gets a new farm. Existing pre-account
demo scans remain private legacy data until an owner explicitly reviews and
runs the migration command in [`backend/README.md`](backend/README.md).

- **Search and history:** filter by literal batch text or exact ID, sample type,
  risk, and inclusive UTC dates; paginate through the complete farm history.
- **Batch trends:** select one batch and sample type to see chronological quality,
  moisture, temperature, and pH charts. Missing values are shown as missing, not
  invented; records from different farms are never combined.
- **Photo evidence:** attach up to five JPEG, PNG, or WebP images to a saved scan.
  Images are normalized and metadata-stripped by the API. They are private
  evidence only; this MVP does **not** perform AI image analysis.
- **Languages:** choose English, Hindi, or Marathi from the header. The bundled
  Hindi/Marathi text is draft guidance and safety advice must be checked by a
  qualified expert.
- **Offline drafts:** save readings locally for the signed-in user and farm,
  queue them while offline, and press **Sync now** explicitly when online. Drafts
  never contain passwords, photos, tokens, or API responses. Viewer accounts are
  read-only.
- **QR labels:** generate a local QR PNG for a batch route. The QR contains no
  token and does not grant access; sign-in remains required. `localhost` links
  work only on the same computer, so use a reachable HTTPS/LAN address for a
  label shared with another device.
- **Farm accounts:** owners can add member or viewer users. Owners and members
  can submit scans and upload evidence; viewers can read farm data only.

For deployment, set `NUTRI_SCAN_COOKIE_SECURE=true`, use HTTPS, set explicit
`NUTRI_SCAN_ORIGINS`, back up SQLite, and review the account/privacy model before
putting real farm data on a shared host. The local SQLite/session setup is an
MVP, not a production multi-tenant deployment.

## Farmer-friendly workflow

The dashboard now opens in **Farmer Mode** with three large actions, a four-step
screening form, plain-language saved results, illustrated measurement help, and
tap-to-listen English/Hindi/Marathi guidance. It also adds clearer offline queue
status, same-batch comparisons, and preview-first adviser sharing. The detailed
dashboard, private photo evidence, QR labels and report exports remain available.

Read the [farmer usability guide](docs/farmer-usability.md) for the complete flow,
offline steps, verification, and limits. All ten measurements remain required;
the app never invents missing readings or treats photo evidence as an AI diagnosis.

The fieldwork extension adds persistent batch cards, observation-only checks,
in-app reminders, local testing-request tracking, optional reviewed voice/USB-serial
reading capture, and an installable public-help PWA shell. See
[`docs/fieldwork-contract.md`](docs/fieldwork-contract.md) for routes and limits and
[`docs/fieldwork-verification.md`](docs/fieldwork-verification.md) for actual checks,
isolated browser verification, and real-device gaps. Instrument capture and PWA
installation are opt-in; no lab, meter, microphone, SMS, or external directory is
claimed to be connected automatically.

For a same-day software + ESP32 demonstration, follow
[`docs/today-demo.md`](docs/today-demo.md). It includes the no-hardware serial
emulator, physical-board steps, reviewed capture flow, and transparent calibration
demo command.

### Manual report check

- Before a saved result exists, the empty result card must not offer report actions.
- Run a sample, download its HTML, and compare its batch, score, and advisory to
  the dashboard. Change the form without submitting; the saved report must not change.
- Refresh, export the same record from History, and confirm the same scan ID and values.
- Open the print preview: report actions should be hidden, while measurements,
  advisories, and the prototype disclaimer remain visible. Save and reopen the PDF.
- Block popups and try printing: a report-specific message should explain the
  downloaded-HTML fallback without replacing the scan result.

## Example API request

`POST /api/v1/scans`

```json
{
  "farm_id": "demo-farm",
  "batch_id": "SIL-2409-B",
  "sample_type": "silage",
  "source_mode": "manual",
  "inputs": {
    "sensor": {
      "moisture_pct": 62,
      "ph": 4.2,
      "temperature_c": 24,
      "humidity_pct": 68
    },
    "nir": {
      "protein_pct": 8.8,
      "dry_matter_pct": 38,
      "fiber_pct": 28
    },
    "vision": {
      "mold_score": 0.08,
      "color_anomaly": 0.05,
      "surface_damage": 0.02
     }
  }
}
```

`GET /api/v1/scans` returns authenticated, farm-scoped persisted scan/result pairs.
The legacy `POST /api/v1/analyze` endpoint is also authenticated. The current ESP32
template emits USB serial JSON; it does not POST to that endpoint.

## Prototype vs production

| Area | MVP | Production target |
|---|---|---|
| AI | Explainable scoring baseline | Calibrated ML models using lab-labelled datasets |
| NIR | Numerical input adapter | Hardware spectrometer integration + calibration |
| Camera | Feature input adapter | On-device CV model |
| Sensors | ESP32 JSON payload | Validated sensor modules + calibration |
| Storage | SQLite | PostgreSQL + object storage |
| Auth | Farm-scoped owner/member/viewer roles and local sessions | Reviewed production identity, recovery, withdrawal and cross-farm administration |
| Advisory | Rule engine | Validated nutrition/advisory knowledge base |
| Offline | Public-help PWA and explicit reading drafts/queue; no private offline reload | Separately reviewed private-data offline scope if implemented |

## Source basis

The repository is based on the uploaded SIH presentation for PS 26111, including its stated architecture, data acquisition flow, outputs, feasibility, scalability and impact. See `docs/source-basis.md`.

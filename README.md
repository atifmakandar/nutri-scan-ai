# Nutri-Scan AI

Smart AI-Enabled Rapid Feed & Silage Quality Testing System for Dairy Farmers — SIH 2026 PS 26111.

Nutri-Scan AI combines camera-based visual inspection, NIR spectroscopy, IoT sensors and AI/ML analysis into a portable, farmer-friendly workflow:

**Sample → Scan → Analyze → Quality Score → Advisory → History**

This repository contains a working MVP architecture for the SIH prototype described in the project presentation.

## Features

- Fast feed/silage quality assessment API
- Multi-source input: image features, NIR measurements and ESP32 sensor readings
- Quality score and confidence estimation
- Moisture, dry matter, protein, fiber, pH, temperature, fermentation quality and spoilage-risk outputs
- Anomaly/adulteration/spoilage indicators
- Actionable farmer advisory
- Test history and traceability-ready data model
- Offline-friendly frontend shell
- ESP32 firmware template for sensor acquisition
- Docker Compose development environment
- GitHub Actions CI

> **Important:** The current AI endpoint is a transparent prototype scoring engine. It is not a laboratory replacement and must be calibrated against laboratory reference data before real-world deployment. The presentation itself specifies validation/calibration with laboratory reference data.

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

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite (normally `http://localhost:5173`).

Copy `.env.example` to `.env` only when you need to change the local API URL or database path. Do not commit `.env` files or credentials.

### 4. Phase 1 checks

From the repository root:

```bash
python -m unittest discover -s backend/tests -p "test_*.py"
cd frontend && npm run build
```

On systems where the executable is named `python3`, replace `python` with `python3`.

### 3. Docker

```bash
docker compose up --build
```

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

`GET /api/v1/scans` returns persisted scan/result pairs. The legacy
`POST /api/v1/analyze` endpoint remains available for the ESP32 template.

## Prototype vs production

| Area | MVP | Production target |
|---|---|---|
| AI | Explainable scoring baseline | Calibrated ML models using lab-labelled datasets |
| NIR | Numerical input adapter | Hardware spectrometer integration + calibration |
| Camera | Feature input adapter | On-device CV model |
| Sensors | ESP32 JSON payload | Validated sensor modules + calibration |
| Storage | SQLite | PostgreSQL + object storage |
| Auth | Local prototype | Farmer/cooperative/admin RBAC |
| Advisory | Rule engine | Validated nutrition/advisory knowledge base |
| Offline | Frontend shell | PWA + local queue + sync |

## Source basis

The repository is based on the uploaded SIH presentation for PS 26111, including its stated architecture, data acquisition flow, outputs, feasibility, scalability and impact. See `docs/source-basis.md`.

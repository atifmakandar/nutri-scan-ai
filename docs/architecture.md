# Nutri-Scan AI — Phase 1 architecture

**Problem statement:** SIH 2026 PS 26111 — Smart AI-Enabled Rapid Feed and Silage Quality Testing System for Dairy Farmers.

## Product outcome

Phase 1 turns the core field workflow into a traceable, working vertical slice:

```text
Create batch → enter available measurements → run screening → explain result → save → retrieve history
```

The current output is an **AI-estimated prototype screening result**. It is not a certified laboratory measurement and must not be presented as one.

## Proposed production architecture

```text
┌──────────────────────────────┐
│ React/Vite farmer dashboard   │
│ scan form · result · history  │
└──────────────┬───────────────┘
               │ REST/JSON
┌──────────────▼───────────────┐
│ FastAPI application           │
│ validation · scan service     │
│ auth/RBAC · reports · alerts  │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ Screening engine interface    │
│ prototype baseline in Phase 1 │
│ calibrated ML adapters later  │
└───────┬───────────────┬──────┘
        │               │
┌───────▼──────┐  ┌─────▼────────┐
│ SQLite now    │  │ Input adapters│
│ PostgreSQL    │  │ camera / NIR │
│ in production │  │ ESP32 / MQTT │
└──────────────┘  └──────────────┘
```

### Technology decisions

| Layer | Phase 1 | Production direction |
|---|---|---|
| Web | React + Vite + TypeScript-ready JavaScript | Next.js or React Native/PWA shell |
| API | FastAPI + Pydantic | FastAPI services behind an API gateway |
| Persistence | SQLite repository with JSON modality payloads | PostgreSQL + object storage |
| Screening | Explainable weighted baseline | Calibrated NIR/CV models trained on lab-labelled data |
| Charts | CSS/SVG dashboard visuals | Recharts/accessible data visualizations |
| Device path | Manual input contract + ESP32 template | MQTT ingestion with device identity and retry-safe events |
| Security | Local prototype, strict validation | JWT/session auth, RBAC, rate limiting, signed uploads |

## Phase 1 data model

The first schema is deliberately small but preserves the fields needed for traceability and future hardware integration.

### `farms`

| Field | Type | Notes |
|---|---|---|
| `id` | text | Stable farm/tenant identifier |
| `name` | text | Farmer-facing farm name |
| `created_at` | timestamp | UTC |

### `scans`

| Field | Type | Notes |
|---|---|---|
| `id` | text | UUID |
| `farm_id` | text | Indexed for future tenancy |
| `batch_id` | text | Farmer-readable traceability key |
| `sample_type` | text | `feed` or `silage` |
| `source_mode` | text | `manual`, `mobile`, or `esp32` |
| `device_id` | text | Nullable future device identifier |
| `collected_at` | timestamp | Sample capture time |
| `created_at` | timestamp | API creation time |
| `inputs_json` | JSON text | Validated sensor/NIR/vision features |
| `result_json` | JSON text | Versioned screening output |

The JSON columns are an intentional Phase 1 boundary: they retain modality data without pretending raw images or spectra are already being stored. When hardware contracts stabilize, the payloads can be normalized into `sensor_readings`, `spectroscopy_readings`, and `vision_observations` tables.

### Result structure

Every result includes:

- `quality_score` from 0–100
- `confidence` as a heuristic prototype confidence, not a validated probability
- `risk_level`: `LOW`, `MEDIUM`, or `HIGH`
- typed measurement keys with units
- anomaly messages and evidence
- farmer advisories
- `assessment.kind = prototype_screening`
- `assessment.model_version = prototype-baseline-0.1`
- `assessment.calibration_status = uncalibrated`

## AI/data pipeline

```text
Image features ─────┐
NIR features ────────┼─> range validation ─> feature normalization
ESP32 measurements ──┘                           │
                                                ▼
                                  transparent multimodal baseline
                                  ├─ moisture/pH/storage scores
                                  ├─ nutrition estimate
                                  ├─ visual-risk penalty
                                  └─ confidence + explanation
                                                │
                                                ▼
                                  quality score + risk + advisory
```

The baseline is intentionally explainable and deterministic. It is suitable for a demo and contract testing only. A production model must be calibrated and evaluated against laboratory reference data, with documented accuracy, uncertainty, false-negative analysis, and domain-expert review.

## API contract

### `POST /api/v1/scans`

Creates and persists a scan plus its screening result.

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

### `GET /api/v1/scans`

Returns recent persisted scans. Supports `farm_id`, `batch_id`, `sample_type`, and `limit` query parameters.

### `GET /api/v1/scans/{scan_id}`

Returns a persisted scan, its original inputs, and the complete result.

### Compatibility endpoints

`POST /api/v1/analyze` and `GET /api/v1/history` remain available for the existing firmware/demo contract and use the same persistent repository internally.

## Delivery roadmap

1. **Phase 1 — Traceable screening loop (this iteration):** persistent scans, explainable result, history, farmer-facing web flow.
2. **Phase 2 — Demo mode and richer UX:** guided 10–20 second simulation, silage monitoring, QR sample identity, report export, multilingual copy.
3. **Phase 3 — Input adapters:** image upload, OpenCV feature extraction, spectroscopy curve ingestion, ESP32/MQTT event contract.
4. **Phase 4 — Accounts and scale:** PostgreSQL, object storage, JWT/RBAC for farmer/expert/admin, audit logs and alerts.
5. **Phase 5 — Scientific validation:** laboratory-labelled dataset, calibration, model evaluation, safety review, and field pilot.

## Phase 1 acceptance criteria

- A farmer can enter a batch and measurement values from the web application.
- Submitting the form creates a persisted scan through the FastAPI API.
- The UI shows score, risk, measurements, advisory, and the prototype disclaimer.
- Refreshing the page retrieves history from the API rather than hardcoded rows.
- Invalid ranges return a readable validation error and do not create a scan.
- Restarting the API does not erase the SQLite history.

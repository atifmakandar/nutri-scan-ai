from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .engine import analyze
from .models import (
    AnalyzeRequest,
    AnalysisResult,
    InputBundle,
    SampleType,
    ScanCreateRequest,
    ScanResponse,
)
from .storage import SQLiteRepository


app = FastAPI(title="Nutri-Scan AI API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

repository = SQLiteRepository()


@app.get("/health")
def health():
    return {"status": "ok", "service": "nutri-scan-ai", "storage": "sqlite"}


@app.post("/api/v1/analyze", response_model=AnalysisResult)
def run_analysis(req: AnalyzeRequest):
    """Compatibility route for the original firmware/demo contract."""
    result = analyze(req)
    repository.save_scan(
        ScanCreateRequest(
            batch_id=f"LEGACY-{uuid4().hex[:8].upper()}",
            sample_type=req.sample_type,
            source_mode="esp32",
            inputs=InputBundle(sensor=req.sensor, nir=req.nir, vision=req.vision),
        ),
        result,
    )
    return result


@app.get("/api/v1/history", response_model=list[AnalysisResult])
def get_history():
    """Compatibility response for the original frontend."""
    return [item.result for item in repository.list_scans(limit=50)]


@app.post("/api/v1/scans", response_model=ScanResponse, status_code=201)
def create_scan(req: ScanCreateRequest):
    result = analyze(
        AnalyzeRequest(
            sample_type=req.sample_type,
            sensor=req.inputs.sensor,
            nir=req.inputs.nir,
            vision=req.inputs.vision,
        )
    )
    return repository.save_scan(req, result)


@app.get("/api/v1/scans", response_model=list[ScanResponse])
def list_scans(
    farm_id: str | None = None,
    batch_id: str | None = None,
    sample_type: SampleType | None = None,
    limit: int = Query(default=20, ge=1, le=100),
):
    return repository.list_scans(
        farm_id=farm_id,
        batch_id=batch_id,
        sample_type=sample_type,
        limit=limit,
    )


@app.get("/api/v1/scans/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: str):
    scan = repository.get_scan(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan

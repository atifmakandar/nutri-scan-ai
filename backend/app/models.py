from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


SampleType = Literal["feed", "silage"]
SourceMode = Literal["manual", "mobile", "esp32"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]

class SensorData(BaseModel):
    moisture_pct: float = Field(ge=0, le=100)
    ph: float = Field(ge=0, le=14)
    temperature_c: float
    humidity_pct: float = Field(ge=0, le=100)

class NIRData(BaseModel):
    protein_pct: float = Field(ge=0, le=100)
    dry_matter_pct: float = Field(ge=0, le=100)
    fiber_pct: float = Field(ge=0, le=100)

class VisionData(BaseModel):
    mold_score: float = Field(ge=0, le=1)
    color_anomaly: float = Field(ge=0, le=1)
    surface_damage: float = Field(ge=0, le=1)


class InputBundle(BaseModel):
    sensor: SensorData
    nir: NIRData
    vision: VisionData


class AnalyzeRequest(BaseModel):
    """Legacy request kept for the original firmware/demo endpoint."""

    sample_type: SampleType
    sensor: SensorData
    nir: NIRData
    vision: VisionData


class ScanCreateRequest(BaseModel):
    farm_id: str = Field(default="demo-farm", min_length=2, max_length=80)
    batch_id: str = Field(min_length=2, max_length=80)
    sample_type: SampleType
    source_mode: SourceMode = "manual"
    device_id: str | None = Field(default=None, max_length=120)
    collected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    inputs: InputBundle


class ScanSummary(BaseModel):
    id: str
    farm_id: str
    batch_id: str
    sample_type: SampleType
    source_mode: SourceMode
    device_id: str | None = None
    collected_at: datetime
    created_at: datetime


class AssessmentMetadata(BaseModel):
    kind: str = "prototype_screening"
    model_version: str = "prototype-baseline-0.1"
    calibration_status: str = "uncalibrated"


class AnalysisResult(BaseModel):
    id: str
    created_at: datetime
    sample_type: SampleType
    quality_score: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    parameters: dict[str, float | str]
    anomalies: list[str]
    advisory: list[str]
    assessment: AssessmentMetadata = Field(default_factory=AssessmentMetadata)


class ScanResponse(BaseModel):
    scan: ScanSummary
    result: AnalysisResult


class ScanListItem(BaseModel):
    scan: ScanSummary
    result: AnalysisResult

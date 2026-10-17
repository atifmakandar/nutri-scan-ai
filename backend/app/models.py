from datetime import datetime, timezone
import re
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


SampleType = Literal["feed", "silage"]
SourceMode = Literal["manual", "mobile", "esp32"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]

class SensorData(RequestModel):
    moisture_pct: float = Field(ge=0, le=100)
    ph: float = Field(ge=0, le=14)
    temperature_c: float = Field(ge=-20, le=80)
    humidity_pct: float = Field(ge=0, le=100)

class NIRData(RequestModel):
    protein_pct: float = Field(ge=0, le=100)
    dry_matter_pct: float = Field(ge=0, le=100)
    fiber_pct: float = Field(ge=0, le=100)

class VisionData(RequestModel):
    mold_score: float = Field(ge=0, le=1)
    color_anomaly: float = Field(ge=0, le=1)
    surface_damage: float = Field(ge=0, le=1)


class SupplementalData(RequestModel):
    """Optional reported values and concern indicators.

    These fields extend the demo contract without pretending that a browser,
    photograph, or default ESP32 sketch measured the analyte. Concern scores are
    operator- or report-supplied signals that require qualified confirmation.
    """

    energy_mj_per_kg: float | None = Field(default=None, ge=0, le=30)
    calcium_pct: float | None = Field(default=None, ge=0, le=20)
    phosphorus_pct: float | None = Field(default=None, ge=0, le=10)
    mineral_concern_score: float | None = Field(default=None, ge=0, le=1)
    urea_concern_score: float | None = Field(default=None, ge=0, le=1)
    sand_silica_concern_score: float | None = Field(default=None, ge=0, le=1)
    aflatoxin_concern_score: float | None = Field(default=None, ge=0, le=1)
    fungal_concern_score: float | None = Field(default=None, ge=0, le=1)


class InputBundle(RequestModel):
    sensor: SensorData
    nir: NIRData
    vision: VisionData
    supplemental: SupplementalData | None = None


class AnalyzeRequest(RequestModel):
    """Legacy request kept for the original firmware/demo endpoint."""

    sample_type: SampleType
    sensor: SensorData
    nir: NIRData
    vision: VisionData
    supplemental: SupplementalData | None = None
    farm_id: str | None = Field(default=None, min_length=2, max_length=80)


InstrumentField = Literal[
    "moisture_pct", "ph", "temperature_c", "humidity_pct",
    "protein_pct", "dry_matter_pct", "fiber_pct",
]
INSTRUMENT_LIMITS = {
    "moisture_pct": ("sensor", "%", 0, 100),
    "ph": ("sensor", "pH", 0, 14),
    "temperature_c": ("sensor", "°C", -20, 80),
    "humidity_pct": ("sensor", "%", 0, 100),
    "protein_pct": ("nir", "%", 0, 100),
    "dry_matter_pct": ("nir", "%", 0, 100),
    "fiber_pct": ("nir", "%", 0, 100),
}


class InstrumentReading(RequestModel):
    field: InstrumentField
    value: float = Field(strict=True)
    unit: Literal["%", "pH", "°C"]

    @model_validator(mode="after")
    def canonical_reading(self):
        _, unit, minimum, maximum = INSTRUMENT_LIMITS[self.field]
        if self.unit != unit or not minimum <= self.value <= maximum:
            raise ValueError("Instrument reading must match its canonical unit and screening range")
        return self


class InstrumentCapture(RequestModel):
    """Reviewed instrument records. Calibration is a device report, not verification."""

    device_id: str = Field(min_length=1, max_length=120)
    captured_at: AwareDatetime
    calibration_status: Literal["unknown", "reported_current", "reported_expired"]
    calibration_reference: str | None = Field(default=None, min_length=1, max_length=200)
    readings: list[InstrumentReading] = Field(min_length=1, max_length=7)

    @field_validator("device_id", "calibration_reference")
    @classmethod
    def clean_instrument_text(cls, value):
        if value is not None and (value != value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value)):
            raise ValueError("Instrument metadata must not contain surrounding whitespace or control characters")
        return value

    @field_validator("captured_at", mode="before")
    @classmethod
    def iso_capture_time(cls, value):
        if not isinstance(value, (str, datetime)) or (isinstance(value, str) and not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value
        )):
            raise ValueError("Instrument captured_at must be a timezone-aware ISO timestamp")
        return value

    @model_validator(mode="after")
    def unique_readings(self):
        if len({reading.field for reading in self.readings}) != len(self.readings):
            raise ValueError("Instrument capture must not contain duplicate fields")
        return self


class ScanCreateRequest(RequestModel):
    farm_id: str | None = Field(default=None, min_length=2, max_length=80)
    batch_id: str = Field(min_length=2, max_length=80)
    sample_type: SampleType
    source_mode: SourceMode = "manual"
    device_id: str | None = Field(default=None, max_length=120)
    collected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    inputs: InputBundle
    client_request_id: str | None = Field(default=None, min_length=1, max_length=80)
    instrument_capture: InstrumentCapture | None = None

    @model_validator(mode="before")
    @classmethod
    def aware_instrument_collection(cls, values):
        # Preserve legacy naive-time handling for original requests, but never
        # manufacture a timezone (or default time) for instrument provenance.
        if isinstance(values, dict) and values.get("instrument_capture") is not None:
            collected = values.get("collected_at")
            try:
                if isinstance(collected, str):
                    collected = datetime.fromisoformat(collected.replace("Z", "+00:00"))
                if not isinstance(collected, datetime) or collected.tzinfo is None or collected.utcoffset() is None:
                    raise ValueError("Instrument collected_at must be explicitly timezone-aware")
            except (TypeError, ValueError) as exc:
                raise ValueError("Instrument collected_at must be explicitly timezone-aware") from exc
        return values

    @model_validator(mode="after")
    def matching_instrument_provenance(self):
        capture = self.instrument_capture
        if capture is not None:
            if self.source_mode != "esp32" or self.device_id != capture.device_id or self.collected_at != capture.captured_at:
                raise ValueError("Instrument metadata must match source_mode, device_id and collected_at")
            for reading in capture.readings:
                group = INSTRUMENT_LIMITS[reading.field][0]
                if getattr(getattr(self.inputs, group), reading.field) != reading.value:
                    raise ValueError("Instrument provenance must match the submitted reading values")
        return self

    @field_validator("collected_at")
    @classmethod
    def utc_collected_at(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class ScanSummary(BaseModel):
    id: str
    farm_id: str
    batch_id: str
    sample_type: SampleType
    source_mode: SourceMode
    device_id: str | None = None
    collected_at: datetime
    created_at: datetime
    instrument_capture: InstrumentCapture | None = None


class AssessmentMetadata(BaseModel):
    kind: str = "prototype_screening"
    model_version: str = "prototype-baseline-0.1"
    calibration_status: str = "uncalibrated"


class CapabilitySignal(BaseModel):
    code: Literal[
        "energy_reported", "minerals_reported", "mineral_concern",
        "urea_concern", "sand_silica_concern", "aflatoxin_concern", "fungal_concern",
    ]
    status: Literal["reported", "review_required"]
    source: Literal["operator_or_lab_input"] = "operator_or_lab_input"


class ScoreFactor(BaseModel):
    code: Literal["ph_fit", "moisture_fit", "nutrition_indicator", "visual_indicator"]
    score: float = Field(ge=0, le=100)
    weight: float = Field(gt=0, le=1)
    contribution: float = Field(ge=0, le=100)


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
    capability_signals: list[CapabilitySignal] = Field(default_factory=list)
    score_breakdown: list[ScoreFactor] = Field(default_factory=list)
    assessment: AssessmentMetadata = Field(default_factory=AssessmentMetadata)


class ScanResponse(BaseModel):
    scan: ScanSummary
    result: AnalysisResult


class ScanListItem(BaseModel):
    scan: ScanSummary
    result: AnalysisResult


class ScanSearchResponse(BaseModel):
    items: list[ScanResponse]
    total: int
    limit: int
    offset: int


class LoginRequest(RequestModel):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9_.@+-]*$")
    password: str = Field(min_length=10, max_length=1024)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class RegisterRequest(LoginRequest):
    farm_name: str = Field(min_length=1, max_length=120)

    @field_validator("farm_name")
    @classmethod
    def trim_farm_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Farm name must not be blank")
        return value.strip()


class MemberCreateRequest(LoginRequest):
    role: Literal["member", "viewer"]


class UserResponse(BaseModel):
    id: str
    username: str
    role: Literal["owner", "member", "viewer"]


class FarmResponse(BaseModel):
    id: str
    name: str


class SessionResponse(BaseModel):
    user: UserResponse
    farm: FarmResponse


class PhotoResponse(BaseModel):
    id: str
    filename: str
    content_type: str
    url: str
    created_at: datetime

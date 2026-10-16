"""Validated, farm-free inputs and private response contracts for fieldwork."""

from datetime import date
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import AfterValidator, AwareDatetime, BaseModel, Field, model_validator

from .models import RequestModel, SampleType, ScanResponse


def valid_calendar_date(value: str) -> str:
    date.fromisoformat(value)
    return value


def nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("Must not be blank")
    # In particular, never trim/case-fold batch identities: saved scans use exact keys.
    return value


def valid_batch_key(value: str) -> str:
    nonblank(value)
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("Batch identifiers must not contain control characters")
    return value


CalendarDate = Annotated[
    str, Field(strict=True, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
    AfterValidator(valid_calendar_date),
]
BatchKey = Annotated[str, Field(min_length=2, max_length=80), AfterValidator(valid_batch_key)]
Notes = Annotated[str, Field(max_length=4000)]
Answer = Literal["yes", "no", "unknown"]
RequestStatus = Literal["requested", "collected", "report_received"]
AlertStatus = Literal["open", "acknowledged"]
DeviceHealthStatus = Literal["unknown", "operational", "needs_attention", "offline"]


def valid_record_text(value: str) -> str:
    if not value.strip():
        raise ValueError("Must not be blank")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("Must not contain control characters")
    return value


class BatchRequest(RequestModel):
    batch_id: BatchKey
    name: str = Field(default="", max_length=120)
    sample_type: SampleType
    storage_location: str = Field(default="", max_length=200)
    prepared_on: CalendarDate | None = None
    opened_on: CalendarDate | None = None
    quantity: float | None = Field(default=None, strict=True, ge=0)
    quantity_unit: Literal["kg", "tonne", "bales", "bags"] | None = None
    notes: Notes = ""

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.prepared_on and self.opened_on and self.opened_on < self.prepared_on:
            raise ValueError("opened_on must not precede prepared_on")
        return self


class ObservationRequest(RequestModel):
    batch_id: BatchKey
    sample_type: SampleType
    observed_on: CalendarDate | None = None
    mould: Answer = "unknown"
    unusual_heat: Answer = "unknown"
    unusual_smell: Answer = "unknown"
    cover_damage: Answer = "unknown"
    notes: Notes = ""


class ReminderRequest(RequestModel):
    title: Annotated[str, Field(min_length=1, max_length=200), AfterValidator(nonblank)]
    batch_id: BatchKey | None = None
    sample_type: SampleType | None = None
    due_on: CalendarDate | None = None
    notes: Notes = ""

    @model_validator(mode="after")
    def paired_batch(self):
        if (self.batch_id is None) != (self.sample_type is None):
            raise ValueError("batch_id and sample_type must both be supplied or both be null")
        return self


class ReminderStatusRequest(RequestModel):
    status: Literal["pending", "completed"]


class TestingRequest(RequestModel):
    batch_id: BatchKey
    sample_type: SampleType
    requested_on: CalendarDate | None = None
    contact_name: str = Field(default="", max_length=120)
    contact_details: str = Field(default="", max_length=500)
    notes: Notes = ""


class TestingStatusRequest(RequestModel):
    status: RequestStatus
    collected_on: CalendarDate | None = None
    report_received_on: CalendarDate | None = None


class LabConfirmationRequest(RequestModel):
    """A manually entered value from a stored testing-request report.

    The value deliberately remains text: laboratory reports commonly contain
    qualifiers such as ``<0.1``, ``not detected`` and ``trace``.
    """

    testing_request_id: str = Field(min_length=2, max_length=80)
    report_attachment_id: str = Field(min_length=2, max_length=80)
    scan_id: str | None = Field(default=None, min_length=2, max_length=80)
    analyte: Annotated[str, Field(strict=True, max_length=120), AfterValidator(valid_record_text)]
    reported_value: Annotated[str, Field(strict=True, max_length=200), AfterValidator(valid_record_text)]
    unit: str = Field(default="", strict=True, max_length=40)
    notes: Notes = ""


class DeviceRequest(RequestModel):
    device_id: Annotated[str, Field(strict=True, max_length=120), AfterValidator(valid_record_text)]
    label: str = Field(default="", strict=True, max_length=120)
    device_type: str = Field(default="", strict=True, max_length=80)
    notes: Notes = ""


class DeviceHealthRequest(RequestModel):
    status: DeviceHealthStatus = "unknown"
    scan_id: str | None = Field(default=None, min_length=2, max_length=80)
    notes: Notes = ""


class ReviewAlertStatusRequest(RequestModel):
    status: AlertStatus


class ObservationResponse(ObservationRequest):
    id: str
    farm_id: str
    created_at: AwareDatetime
    photo_count: int
    kind: Literal["observation_only"] = "observation_only"


class BatchResponse(BatchRequest):
    id: str
    farm_id: str
    created_at: AwareDatetime
    updated_at: AwareDatetime
    photo_count: int
    latest_scan: ScanResponse | None
    latest_observation: ObservationResponse | None


class ReminderResponse(ReminderRequest):
    id: str
    farm_id: str
    status: Literal["pending", "completed"]
    completed_at: AwareDatetime | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class TestingResponse(TestingRequest):
    id: str
    farm_id: str
    status: RequestStatus
    collected_on: CalendarDate | None
    report_received_on: CalendarDate | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
    report_count: int


class LabConfirmationResponse(LabConfirmationRequest):
    id: str
    farm_id: str
    batch_id: BatchKey
    sample_type: SampleType
    created_at: AwareDatetime


class DeviceHealthResponse(DeviceHealthRequest):
    id: str
    farm_id: str
    device_registry_id: str
    source: Literal["operator_reported", "reviewed_capture"]
    reviewed_at: AwareDatetime
    created_at: AwareDatetime


class DeviceResponse(DeviceRequest):
    id: str
    farm_id: str
    created_at: AwareDatetime
    updated_at: AwareDatetime
    latest_health: DeviceHealthResponse | None


class ReviewAlertResponse(BaseModel):
    id: str
    farm_id: str
    scan_id: str
    batch_id: BatchKey
    sample_type: SampleType
    code: str
    message: str
    observed_value: float
    threshold: str
    status: AlertStatus
    acknowledged_at: AwareDatetime | None
    acknowledged_by: str | None
    created_at: AwareDatetime


class AuditEventResponse(BaseModel):
    id: str
    farm_id: str
    actor_id: str | None
    action: str
    resource_type: str
    resource_id: str | None
    details: dict
    created_at: AwareDatetime


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int

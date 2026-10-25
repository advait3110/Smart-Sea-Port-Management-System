import re
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


_VEHICLE_RE = re.compile(r"^[A-Z0-9]{3,30}$")
_PHONE_RE = re.compile(r"^[0-9+()\-\s]{6,20}$")


def _clean_text(value: str | None) -> str | None:
    """Strip whitespace; turn empty strings into None."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def _normalize_vehicle(value: str) -> str:
    # "sgx 1234-a" -> "SGX1234A"
    normalized = re.sub(r"[\s\-]+", "", value).upper()

    if not _VEHICLE_RE.match(normalized):
        raise ValueError(
            "Vehicle number must be 3-30 letters or digits."
        )

    return normalized


def _strip_required(value: str) -> str:
    value = value.strip()

    if not value:
        raise ValueError("This field cannot be blank.")

    return value


def _require_offset(value: datetime | None) -> datetime | None:
    # A time without a UTC offset is ambiguous (Singapore or UTC?).
    if value is not None and value.tzinfo is None:
        raise ValueError(
            "Time must include a UTC offset, for example +08:00."
        )

    return value


# =========================================================
# MANUAL TRUCK ENTRY
# =========================================================

class TruckEntryCreate(BaseModel):
    """
    Body for POST /trucks/entry.

    The gate officer types the vehicle, driver and entry time.
    The client NEVER sends status or the officer: the server sets
    them (the officer comes from the JWT).
    """

    vehicle_number: str = Field(max_length=40)

    driver_name: str = Field(
        min_length=2,
        max_length=120,
    )

    driver_phone: str | None = Field(
        default=None,
        max_length=20,
    )

    transport_company: str | None = Field(
        default=None,
        max_length=120,
    )

    cargo_id: int | None = Field(
        default=None,
        gt=0,
    )

    gate_number: str = Field(
        min_length=1,
        max_length=30,
    )

    cargo_weight_tonnes: float | None = Field(
        default=None,
        gt=0,
    )

    # Officer-typed entry time (with offset). Blank = now.
    entry_time: datetime | None = None

    entry_remarks: str | None = Field(
        default=None,
        max_length=500,
    )

    @field_validator("vehicle_number")
    @classmethod
    def normalize_vehicle_number(cls, value: str) -> str:
        return _normalize_vehicle(value)

    @field_validator("driver_name", "gate_number")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator(
        "transport_company",
        "entry_remarks",
        mode="before",
    )
    @classmethod
    def strip_optional_text(cls, value):
        if isinstance(value, str):
            return _clean_text(value)
        return value

    @field_validator("driver_phone", mode="before")
    @classmethod
    def validate_phone(cls, value):
        if isinstance(value, str):
            value = _clean_text(value)

            if value is not None and not _PHONE_RE.match(value):
                raise ValueError(
                    "Phone may contain digits, +, -, ( ) and spaces."
                )

        return value

    @field_validator("entry_time")
    @classmethod
    def entry_time_has_offset(cls, value):
        return _require_offset(value)


# =========================================================
# MANUAL TRUCK EXIT
# =========================================================

class TruckExitCreate(BaseModel):
    """
    Optional body for POST /trucks/{id}/exit.

    The officer types the exit time (blank = now). The officer
    name is set by the server.
    """

    exit_time: datetime | None = None

    exit_remarks: str | None = Field(
        default=None,
        max_length=500,
    )

    @field_validator("exit_time")
    @classmethod
    def exit_time_has_offset(cls, value):
        return _require_offset(value)

    @field_validator("exit_remarks", mode="before")
    @classmethod
    def strip_remarks(cls, value):
        if isinstance(value, str):
            return _clean_text(value)
        return value


# =========================================================
# TRUCK RESPONSE
# =========================================================

class TruckResponse(BaseModel):
    id: int

    vehicle_number: str

    driver_name: str

    driver_phone: str | None

    transport_company: str | None

    cargo_id: int | None

    gate_number: str

    status: str

    cargo_weight_tonnes: float | None

    entry_time: datetime

    exit_time: datetime | None

    entry_remarks: str | None

    exit_remarks: str | None

    recorded_by_id: int | None

    recorded_by_name: str | None

    exit_recorded_by_id: int | None

    exit_recorded_by_name: str | None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )
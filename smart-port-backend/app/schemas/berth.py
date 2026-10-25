from datetime import datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

# Statuses an operator can configure. "occupied" is also detected live
# from AIS, so a berth normally stays "available" in the database.
BERTH_STATUSES = ("available", "occupied", "maintenance")

BerthCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=30),
]
BerthName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=100),
]
BerthType = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=50),
]
Terminal = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=100),
]


def _normalise_status(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = value.strip().lower().replace(" ", "_")

    if cleaned == "under_maintenance":
        cleaned = "maintenance"

    if cleaned not in BERTH_STATUSES:
        raise ValueError(
            "Status must be one of: " + ", ".join(BERTH_STATUSES) + "."
        )

    return cleaned


def _normalise_code(value: str | None) -> str | None:
    return value.upper() if value else value


def _blank_to_none(value: str | None) -> str | None:
    return value or None


class BerthCreate(BaseModel):
    berth_code: BerthCode
    berth_name: BerthName
    berth_type: BerthType
    terminal: Terminal | None = None

    length_m: float | None = Field(default=None, gt=0)
    depth_m: float | None = Field(default=None, gt=0)
    max_draft_m: float | None = Field(default=None, gt=0)

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    status: str = Field(default="available", max_length=30)
    is_active: bool = True

    @field_validator("berth_code")
    @classmethod
    def _code(cls, value: str) -> str:
        return _normalise_code(value)

    @field_validator("terminal")
    @classmethod
    def _terminal(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return _normalise_status(value)

    @model_validator(mode="after")
    def _coordinates_together(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "Latitude and longitude must be given together."
            )

        return self


class BerthUpdate(BaseModel):
    berth_code: BerthCode | None = None
    berth_name: BerthName | None = None
    berth_type: BerthType | None = None
    terminal: Terminal | None = None

    length_m: float | None = Field(default=None, gt=0)
    depth_m: float | None = Field(default=None, gt=0)
    max_draft_m: float | None = Field(default=None, gt=0)

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    status: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None

    @field_validator("berth_code")
    @classmethod
    def _code(cls, value: str | None) -> str | None:
        return _normalise_code(value)

    @field_validator("terminal")
    @classmethod
    def _terminal(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        return _normalise_status(value)


class BerthResponse(BaseModel):
    id: int
    berth_code: str
    berth_name: str
    berth_type: str
    terminal: str | None = None

    length_m: float | None
    depth_m: float | None
    max_draft_m: float | None

    latitude: float | None = None
    longitude: float | None = None

    # Status shown to users. It is "occupied" when AIS shows a moored
    # vessel at the berth, otherwise the configured status.
    status: str
    is_active: bool

    # The status stored in the database (used by the edit form).
    configured_status: str | None = None

    # Filled only when AIS detects a vessel at the berth.
    vessel_name: str | None = None
    vessel_mmsi: str | None = None
    vessel_distance_m: int | None = None

    # "ais" (detected live), "manual" (configured as occupied) or None.
    occupancy_source: str | None = None

    # False when the live AIS check could not run, so the statuses
    # shown are the configured ones only.
    ais_matching: bool = True

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
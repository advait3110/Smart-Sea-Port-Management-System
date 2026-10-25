from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# =========================================================
# CREATE VESSEL
# =========================================================

class VesselCreate(BaseModel):
    # -----------------------------------------------------
    # Vessel identity
    # -----------------------------------------------------

    imo_number: str | None = Field(
        default=None,
        max_length=20,
    )

    mmsi: str | None = Field(
        default=None,
        max_length=20,
    )

    vessel_name: str = Field(
        min_length=2,
        max_length=120,
    )

    vessel_type: str = Field(
        min_length=2,
        max_length=50,
    )

    flag: str | None = Field(
        default=None,
        max_length=80,
    )

    # -----------------------------------------------------
    # Vessel dimensions
    # -----------------------------------------------------

    length_m: float | None = Field(
        default=None,
        gt=0,
    )

    beam_m: float | None = Field(
        default=None,
        gt=0,
    )

    gross_tonnage: float | None = Field(
        default=None,
        gt=0,
    )

    deadweight_tonnage: float | None = Field(
        default=None,
        gt=0,
    )

    draught_m: float | None = Field(
        default=None,
        gt=0,
    )

    # -----------------------------------------------------
    # Port operational status
    # -----------------------------------------------------

    status: str = Field(
        default="anchored",
        max_length=30,
    )

    # -----------------------------------------------------
    # AIS position
    # -----------------------------------------------------

    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
    )

    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
    )

    # -----------------------------------------------------
    # AIS movement
    # -----------------------------------------------------

    speed_knots: float | None = Field(
        default=None,
        ge=0,
    )

    course_deg: float | None = Field(
        default=None,
        ge=0,
        le=360,
    )

    heading_deg: float | None = Field(
        default=None,
        ge=0,
        le=359,
    )

    # -----------------------------------------------------
    # AIS navigation
    # -----------------------------------------------------

    ais_navigation_status: str | None = Field(
        default=None,
        max_length=50,
    )

    destination: str | None = Field(
        default=None,
        max_length=120,
    )

    eta: datetime | None = None

    # -----------------------------------------------------
    # AIS source
    # -----------------------------------------------------

    ais_source: str | None = Field(
        default=None,
        max_length=100,
    )

    ais_last_updated_at: datetime | None = None


# =========================================================
# UPDATE VESSEL
# =========================================================

class VesselUpdate(BaseModel):
    # -----------------------------------------------------
    # Vessel identity
    # -----------------------------------------------------

    imo_number: str | None = Field(
        default=None,
        max_length=20,
    )

    mmsi: str | None = Field(
        default=None,
        max_length=20,
    )

    vessel_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=120,
    )

    vessel_type: str | None = Field(
        default=None,
        min_length=2,
        max_length=50,
    )

    flag: str | None = Field(
        default=None,
        max_length=80,
    )

    # -----------------------------------------------------
    # Vessel dimensions
    # -----------------------------------------------------

    length_m: float | None = Field(
        default=None,
        gt=0,
    )

    beam_m: float | None = Field(
        default=None,
        gt=0,
    )

    gross_tonnage: float | None = Field(
        default=None,
        gt=0,
    )

    deadweight_tonnage: float | None = Field(
        default=None,
        gt=0,
    )

    draught_m: float | None = Field(
        default=None,
        gt=0,
    )

    # -----------------------------------------------------
    # Port operational status
    # -----------------------------------------------------

    status: str | None = Field(
        default=None,
        max_length=30,
    )

    # -----------------------------------------------------
    # AIS position
    # -----------------------------------------------------

    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
    )

    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
    )

    # -----------------------------------------------------
    # AIS movement
    # -----------------------------------------------------

    speed_knots: float | None = Field(
        default=None,
        ge=0,
    )

    course_deg: float | None = Field(
        default=None,
        ge=0,
        le=360,
    )

    heading_deg: float | None = Field(
        default=None,
        ge=0,
        le=359,
    )

    # -----------------------------------------------------
    # AIS navigation
    # -----------------------------------------------------

    ais_navigation_status: str | None = Field(
        default=None,
        max_length=50,
    )

    destination: str | None = Field(
        default=None,
        max_length=120,
    )

    eta: datetime | None = None

    # -----------------------------------------------------
    # AIS source
    # -----------------------------------------------------

    ais_source: str | None = Field(
        default=None,
        max_length=100,
    )

    ais_last_updated_at: datetime | None = None


# =========================================================
# VESSEL RESPONSE
# =========================================================

class VesselResponse(BaseModel):
    # -----------------------------------------------------
    # Database identity
    # -----------------------------------------------------

    id: int

    # -----------------------------------------------------
    # Vessel identity
    # -----------------------------------------------------

    imo_number: str | None

    mmsi: str | None

    vessel_name: str

    vessel_type: str

    flag: str | None

    # -----------------------------------------------------
    # Vessel dimensions
    # -----------------------------------------------------

    length_m: float | None

    beam_m: float | None

    gross_tonnage: float | None

    deadweight_tonnage: float | None

    draught_m: float | None

    # -----------------------------------------------------
    # Port operational status
    # -----------------------------------------------------

    status: str

    # -----------------------------------------------------
    # AIS position
    # -----------------------------------------------------

    latitude: float | None

    longitude: float | None

    # -----------------------------------------------------
    # AIS movement
    # -----------------------------------------------------

    speed_knots: float | None

    course_deg: float | None

    heading_deg: float | None

    # -----------------------------------------------------
    # AIS navigation
    # -----------------------------------------------------

    ais_navigation_status: str | None

    destination: str | None

    eta: datetime | None

    # -----------------------------------------------------
    # AIS source / freshness
    # -----------------------------------------------------

    ais_source: str | None

    ais_last_updated_at: datetime | None

    # -----------------------------------------------------
    # Database timestamps
    # -----------------------------------------------------

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )
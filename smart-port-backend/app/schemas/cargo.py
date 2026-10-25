from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CargoBase(BaseModel):
    cargo_reference: str = Field(
        min_length=2,
        max_length=50,
    )

    cargo_type: str = Field(
        min_length=2,
        max_length=100,
    )

    description: str | None = Field(
        default=None,
        max_length=255,
    )

    quantity: float = Field(
        gt=0,
    )

    unit: str = Field(
        default="tonnes",
        min_length=1,
        max_length=30,
    )

    vessel_id: int | None = Field(
        default=None,
        gt=0,
    )

    origin: str | None = Field(
        default=None,
        max_length=120,
    )

    destination: str | None = Field(
        default=None,
        max_length=120,
    )

    status: str = Field(
        default="planned",
        min_length=2,
        max_length=30,
    )


class CargoCreate(CargoBase):
    pass


class CargoUpdate(BaseModel):
    cargo_reference: str | None = Field(
        default=None,
        min_length=2,
        max_length=50,
    )

    cargo_type: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )

    description: str | None = Field(
        default=None,
        max_length=255,
    )

    quantity: float | None = Field(
        default=None,
        gt=0,
    )

    unit: str | None = Field(
        default=None,
        min_length=1,
        max_length=30,
    )

    vessel_id: int | None = Field(
        default=None,
        gt=0,
    )

    origin: str | None = Field(
        default=None,
        max_length=120,
    )

    destination: str | None = Field(
        default=None,
        max_length=120,
    )

    status: str | None = Field(
        default=None,
        min_length=2,
        max_length=30,
    )


class CargoResponse(CargoBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )
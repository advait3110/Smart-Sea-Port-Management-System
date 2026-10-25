from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Berth(Base):
    __tablename__ = "berths"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    berth_code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
        index=True,
    )

    berth_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # Terminal the berth belongs to, for example "Pasir Panjang".
    terminal: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    berth_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    length_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    depth_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    max_draft_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Position of the berth. Live occupancy can only be detected from AIS
    # for berths that have both latitude and longitude.
    latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Configured status: available, occupied or maintenance. The status
    # shown to users can differ: see berth_service (live AIS occupancy).
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="available",
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
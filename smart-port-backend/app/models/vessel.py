from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Vessel(Base):
    __tablename__ = "vessels"

    # =====================================================
    # PRIMARY KEY
    # =====================================================

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # =====================================================
    # VESSEL IDENTITY
    # =====================================================

    imo_number: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        nullable=True,
        index=True,
    )

    mmsi: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        nullable=True,
        index=True,
    )

    vessel_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        index=True,
    )

    vessel_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    flag: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    # =====================================================
    # VESSEL DIMENSIONS
    # =====================================================

    length_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    beam_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    gross_tonnage: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    deadweight_tonnage: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    draught_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # =====================================================
    # PORT OPERATIONAL STATUS
    # =====================================================

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="anchored",
        index=True,
    )

    # =====================================================
    # AIS POSITION
    # =====================================================

    latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        index=True,
    )

    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        index=True,
    )

    # =====================================================
    # AIS MOVEMENT
    # =====================================================

    speed_knots: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    course_deg: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    heading_deg: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # =====================================================
    # AIS NAVIGATION INFORMATION
    # =====================================================

    ais_navigation_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    destination: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    eta: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # =====================================================
    # AIS SOURCE / FRESHNESS
    # =====================================================

    ais_source: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    ais_last_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    # =====================================================
    # DATABASE AUDIT TIMESTAMPS
    # =====================================================

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
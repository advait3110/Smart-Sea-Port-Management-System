from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AISPositionHistory(Base):
    __tablename__ = "ais_position_history"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    mmsi: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    vessel_name: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

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

    # AIS navigation status at the time of this position, for example
    # "Moored" or "At anchor". Empty when the ship did not report one.
    # Added 22 Oct 2026 (column created by the SQL script).
    navigation_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    ais_source: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="VesselAPI",
    )

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    __table_args__ = (
        Index(
            "ix_ais_history_mmsi_recorded_at",
            "mmsi",
            "recorded_at",
        ),
    )
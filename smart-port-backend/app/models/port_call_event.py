from datetime import datetime

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PortCallEvent(Base):
    """
    A ship's arrival at, or departure from, the Port of Singapore as
    recorded by VesselAPI. The arrival time is the "what actually
    happened" half of the Vessel Delay training data; departures will
    help the Berth Congestion prediction later.
    """

    __tablename__ = "port_call_events"

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

    imo_number: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    vessel_name: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    # "Arrival" or "Departure"
    event_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    port_unlocode: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    port_name: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    source: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="VesselAPI",
    )

    __table_args__ = (
        UniqueConstraint(
            "mmsi",
            "event_type",
            "occurred_at",
            name="uq_port_call_event",
        ),
        Index(
            "ix_port_call_event_mmsi_occurred_at",
            "mmsi",
            "occurred_at",
        ),
    )
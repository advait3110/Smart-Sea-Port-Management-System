from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class VesselETASnapshot(Base):
    """
    One ETA that a ship heading to the Port of Singapore reported, kept
    for good. The vessels table only holds each ship's latest ETA and
    overwrites it; this table keeps every one, so that after the ship
    arrives we can compare what it said with what happened (the training
    data for the Vessel Delay model).
    """

    __tablename__ = "vessel_eta_snapshots"

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

    # What the crew typed as destination, and the port code VesselAPI
    # resolved it to (SGSIN = Port of Singapore).
    destination: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    destination_port: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    # The reported ETA. eta_raw keeps the provider's text exactly as sent,
    # also when it could not be read as a date (then eta is empty).
    eta: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    eta_raw: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    draught_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Where the ship was and what it was doing when it reported the ETA
    # (its last position report, at most 30 minutes old). Added 22 Oct
    # 2026; empty for older rows and for ships without a recent position.
    speed_knots: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    navigation_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    # Seagoing ships standing still in Singapore waters at that moment
    # (a measure of how busy the port was).
    ships_stopped_nearby: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # When the ship reported this ETA (time of the AIS message).
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # When this backend saved it.
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
            "reported_at",
            name="uq_eta_snapshot_mmsi_reported_at",
        ),
        Index(
            "ix_eta_snapshot_mmsi_reported_at",
            "mmsi",
            "reported_at",
        ),
    )
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PortCongestionSnapshot(Base):
    """
    How crowded the Port of Singapore was at one moment (one row per hour
    while the backend runs), counted from the live AISStream feed.
    Training data for Predict Berth Congestion.

    ships_in_port = at_anchor + at_berth + stopped_other
    (seagoing ships standing still in port waters, seen in the last 2 h).
    """

    __tablename__ = "port_congestion_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Always on the hour (UTC), e.g. 05:00:00.
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    ships_in_port: Mapped[int] = mapped_column(Integer, nullable=False)
    at_anchor: Mapped[int] = mapped_column(Integer, nullable=False)
    at_berth: Mapped[int] = mapped_column(Integer, nullable=False)
    # Standing still, but the ship did not say "At anchor" or "Moored".
    stopped_other: Mapped[int] = mapped_column(Integer, nullable=False)
    underway: Mapped[int] = mapped_column(Integer, nullable=False)

    # Arrivals / departures recorded in the 6 hours before.
    arrivals_6h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    departures_6h: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Ships still on their way whose reported ETA falls in the next 6/12/24 h.
    due_6h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_12h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_24h: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # How long the feed had been connected without a break.
    feed_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    source: Mapped[str] = mapped_column(String(100), nullable=False, default="AISStream")

    __table_args__ = (
        UniqueConstraint("taken_at", name="uq_port_congestion_taken_at"),
    )
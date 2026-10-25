from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PortThroughput(Base):
    """
    One published throughput figure of the port.

    metric = "cargo"     period "YYYY"     value in thousand tonnes
             (MPA "Cargo Throughput Breakdown", yearly)
    metric = "container" period "YYYY-MM"  value in thousand TEUs
             (MPA "Container Throughput", monthly)

    The categories are empty strings (not NULL) when a metric has none, so
    the unique constraint below also protects those rows from duplicates.
    """

    __tablename__ = "port_throughput"

    __table_args__ = (
        UniqueConstraint(
            "metric",
            "period",
            "category_primary",
            "category_secondary",
            name="uq_port_throughput_key",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    metric: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    period: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        index=True,
    )

    category_primary: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="",
    )

    category_secondary: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="",
    )

    value: Mapped[float] = mapped_column(
        Float,
        nullable=False,
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

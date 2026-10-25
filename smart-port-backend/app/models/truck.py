from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Truck(Base):
    """
    One row = one gate visit, typed in by a gate officer:
    a manual entry, later a manual exit.

    Rows are an audit trail: the API never edits or deletes them
    after creation, except to record the exit once.
    """

    __tablename__ = "trucks"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    vehicle_number: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
    )

    driver_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    driver_phone: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    transport_company: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    cargo_id: Mapped[int | None] = mapped_column(
        ForeignKey("cargo.id"),
        nullable=True,
        index=True,
    )

    gate_number: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="inside_port",
        index=True,
    )

    # Typed by the gate officer (Singapore time, stored as UTC).
    entry_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    exit_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    cargo_weight_tonnes: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # -----------------------------------------------------
    # AUDIT FIELDS (set by the server from the JWT user)
    # -----------------------------------------------------

    recorded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    exit_recorded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    entry_remarks: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    exit_remarks: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # created_at is set by the SERVER when the row is saved, so the
    # real moment of record-keeping stays visible even when the
    # officer types an earlier entry time.
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

    recorded_by = relationship(
        "User",
        foreign_keys=[recorded_by_id],
        lazy="joined",
    )

    exit_recorded_by = relationship(
        "User",
        foreign_keys=[exit_recorded_by_id],
        lazy="joined",
    )

    __table_args__ = (
        # Only ONE open ("inside_port") visit per vehicle.
        Index(
            "uq_trucks_active_vehicle",
            "vehicle_number",
            unique=True,
            postgresql_where=text("status = 'inside_port'"),
        ),
        CheckConstraint(
            "status IN ('inside_port', 'exited')",
            name="ck_trucks_status",
        ),
        CheckConstraint(
            "exit_time IS NULL OR exit_time >= entry_time",
            name="ck_trucks_exit_after_entry",
        ),
    )

    # -----------------------------------------------------
    # Read-only display helpers used by TruckResponse
    # -----------------------------------------------------

    @property
    def recorded_by_name(self) -> str | None:
        user = self.recorded_by
        if user is None:
            return None
        return user.full_name or user.username

    @property
    def exit_recorded_by_name(self) -> str | None:
        user = self.exit_recorded_by
        if user is None:
            return None
        return user.full_name or user.username
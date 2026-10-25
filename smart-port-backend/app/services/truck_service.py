import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.truck import Truck
from app.models.user import User
from app.schemas.truck import (
    TruckEntryCreate,
    TruckExitCreate,
)


logger = logging.getLogger(__name__)


# A typed time may be at most this far in the future (clock drift
# between the officer's computer and the server).
FUTURE_TOLERANCE = timedelta(minutes=5)

# An entry may be back-dated by at most this much, so a gate log
# cannot be quietly rewritten far into the past.
MAX_BACKDATE = timedelta(days=7)


# =========================================================
# DOMAIN ERRORS (mapped to HTTP codes in app/api/trucks.py)
# =========================================================

class TruckNotFoundError(Exception):
    pass


class TruckConflictError(Exception):
    pass


class TruckValidationError(Exception):
    pass


# =========================================================
# SMALL HELPERS
# =========================================================

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _raise_entry_integrity_error(
    error: IntegrityError,
    vehicle_number: str,
) -> None:
    """Translate a database constraint failure on entry."""
    detail = str(error.orig)

    # Two officers submitted the same vehicle at once.
    if "uq_trucks_active_vehicle" in detail:
        raise TruckConflictError(
            f"Vehicle {vehicle_number} is already inside "
            "the port."
        ) from error

    # Foreign key (cargo_id) or another constraint failed.
    raise TruckValidationError(
        "The entry could not be saved. Check that the "
        "cargo reference exists."
    ) from error


# =========================================================
# QUERIES
# =========================================================

def get_all_trucks(
    db: Session,
    limit: int = 500,
) -> list[Truck]:
    statement = (
        select(Truck)
        .order_by(Truck.entry_time.desc(), Truck.id.desc())
        .limit(limit)
    )

    return list(db.execute(statement).scalars().all())


def get_truck_by_id(
    db: Session,
    truck_id: int,
) -> Truck | None:
    return db.get(Truck, truck_id)


# =========================================================
# MANUAL ENTRY
# =========================================================

def record_truck_entry(
    db: Session,
    data: TruckEntryCreate,
    officer: User,
) -> Truck:
    """
    Record a vehicle entering the port.

    The officer types the entry time (blank = now). The server
    sets: status, recorded_by and created_at.
    """

    now = _now()

    entry_time = data.entry_time or now

    if entry_time > now + FUTURE_TOLERANCE:
        raise TruckValidationError(
            "Entry time cannot be in the future."
        )

    if entry_time < now - MAX_BACKDATE:
        raise TruckValidationError(
            "Entry time cannot be more than 7 days in the past."
        )

    already_inside = db.execute(
        select(Truck.id).where(
            Truck.vehicle_number == data.vehicle_number,
            Truck.status == "inside_port",
        )
    ).first()

    if already_inside is not None:
        raise TruckConflictError(
            f"Vehicle {data.vehicle_number} is already inside "
            "the port. Record its exit first."
        )

    truck = Truck(
        vehicle_number=data.vehicle_number,
        driver_name=data.driver_name,
        driver_phone=data.driver_phone,
        transport_company=data.transport_company,
        cargo_id=data.cargo_id,
        gate_number=data.gate_number,
        cargo_weight_tonnes=data.cargo_weight_tonnes,
        entry_remarks=data.entry_remarks,
        status="inside_port",
        entry_time=entry_time,
        exit_time=None,
        recorded_by_id=officer.id,
    )

    db.add(truck)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        _raise_entry_integrity_error(error, data.vehicle_number)

    db.refresh(truck)

    return truck


# =========================================================
# MANUAL EXIT
# =========================================================

def record_truck_exit(
    db: Session,
    truck_id: int,
    data: TruckExitCreate,
    officer: User,
) -> Truck:
    """
    Record a vehicle leaving the port.

    The officer types the exit time (blank = now). It must not be
    before the entry time or in the future. The row is locked so
    two officers cannot both record the same exit.
    """

    truck = db.execute(
        select(Truck)
        .where(Truck.id == truck_id)
        .with_for_update(of=Truck)
    ).scalar_one_or_none()

    if truck is None:
        raise TruckNotFoundError("Truck record not found.")

    if truck.status != "inside_port":
        raise TruckConflictError(
            "This vehicle's exit has already been recorded."
        )

    now = _now()

    exit_time = data.exit_time or now

    if exit_time > now + FUTURE_TOLERANCE:
        raise TruckValidationError(
            "Exit time cannot be in the future."
        )

    if exit_time < truck.entry_time:
        raise TruckValidationError(
            "Exit time cannot be before the entry time."
        )

    truck.status = "exited"
    truck.exit_time = exit_time
    truck.exit_remarks = data.exit_remarks
    truck.exit_recorded_by_id = officer.id

    db.commit()
    db.refresh(truck)

    return truck


# =========================================================
# DELETE ONE RECORD
# =========================================================

def delete_truck(
    db: Session,
    truck_id: int,
    officer: User,
) -> None:
    """Permanently delete one gate record (e.g. a mistaken entry)."""

    truck = db.get(Truck, truck_id)

    if truck is None:
        raise TruckNotFoundError("Truck record not found.")

    vehicle_number = truck.vehicle_number

    try:
        db.delete(truck)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise TruckConflictError(
            "This record is used by other data and cannot be deleted."
        ) from error

    # Deleted rows leave no trace in the table, so log who did it.
    logger.warning(
        "Gate record %s (%s) deleted by user id %s",
        truck_id,
        vehicle_number,
        officer.id,
    )


# =========================================================
# CLEAR ALL RECORDS
# =========================================================

def clear_all_trucks(
    db: Session,
    officer: User,
) -> int:
    """Permanently delete every gate record. Returns how many."""

    try:
        result = db.execute(delete(Truck))
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise TruckConflictError(
            "Some records are used by other data and cannot be deleted."
        ) from error

    deleted = result.rowcount or 0

    logger.warning(
        "All gate records cleared (%s rows) by user id %s",
        deleted,
        officer.id,
    )

    return deleted
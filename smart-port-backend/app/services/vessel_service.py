from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.vessel import Vessel
from app.schemas.vessel import VesselCreate, VesselUpdate


# =========================================================
# CREATE VESSEL
# =========================================================

def create_vessel(
    db: Session,
    vessel_data: VesselCreate,
) -> Vessel:
    # -----------------------------------------------------
    # Check duplicate IMO number
    # -----------------------------------------------------

    if vessel_data.imo_number:
        existing_vessel = db.scalar(
            select(Vessel).where(
                Vessel.imo_number == vessel_data.imo_number
            )
        )

        if existing_vessel:
            raise ValueError(
                "A vessel with this IMO number already exists."
            )

    # -----------------------------------------------------
    # Check duplicate MMSI
    # -----------------------------------------------------

    if vessel_data.mmsi:
        existing_vessel = db.scalar(
            select(Vessel).where(
                Vessel.mmsi == vessel_data.mmsi
            )
        )

        if existing_vessel:
            raise ValueError(
                "A vessel with this MMSI already exists."
            )

    # -----------------------------------------------------
    # Create vessel
    # -----------------------------------------------------

    vessel = Vessel(
        **vessel_data.model_dump()
    )

    try:
        db.add(vessel)
        db.commit()
        db.refresh(vessel)

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "The vessel could not be created because one "
            "of its unique identifiers already exists."
        ) from exc

    return vessel


# =========================================================
# GET SINGLE VESSEL
# =========================================================

def get_vessel(
    db: Session,
    vessel_id: int,
) -> Vessel | None:
    return db.get(
        Vessel,
        vessel_id,
    )


# =========================================================
# GET ALL VESSELS
# =========================================================

def get_vessels(
    db: Session,
) -> list[Vessel]:
    statement = (
        select(Vessel)
        .order_by(Vessel.id.desc())
    )

    return list(
        db.scalars(statement).all()
    )


# =========================================================
# UPDATE VESSEL
# =========================================================

def update_vessel(
    db: Session,
    vessel: Vessel,
    vessel_data: VesselUpdate,
) -> Vessel:
    update_data = vessel_data.model_dump(
        exclude_unset=True
    )

    # -----------------------------------------------------
    # Check duplicate IMO number
    # -----------------------------------------------------

    if "imo_number" in update_data:
        imo_number = update_data["imo_number"]

        if imo_number:
            existing_vessel = db.scalar(
                select(Vessel).where(
                    Vessel.imo_number == imo_number,
                    Vessel.id != vessel.id,
                )
            )

            if existing_vessel:
                raise ValueError(
                    "A vessel with this IMO number already exists."
                )

    # -----------------------------------------------------
    # Check duplicate MMSI
    # -----------------------------------------------------

    if "mmsi" in update_data:
        mmsi = update_data["mmsi"]

        if mmsi:
            existing_vessel = db.scalar(
                select(Vessel).where(
                    Vessel.mmsi == mmsi,
                    Vessel.id != vessel.id,
                )
            )

            if existing_vessel:
                raise ValueError(
                    "A vessel with this MMSI already exists."
                )

    # -----------------------------------------------------
    # Apply updates
    # -----------------------------------------------------

    for field, value in update_data.items():
        setattr(
            vessel,
            field,
            value,
        )

    try:
        db.commit()
        db.refresh(vessel)

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "The vessel could not be updated because one "
            "of its unique identifiers already exists."
        ) from exc

    return vessel


# =========================================================
# DELETE VESSEL
# =========================================================

def delete_vessel(
    db: Session,
    vessel: Vessel,
) -> None:
    try:
        db.delete(vessel)
        db.commit()

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "The vessel could not be deleted because it is "
            "referenced by another record."
        ) from exc
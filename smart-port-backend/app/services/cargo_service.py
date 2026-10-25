from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cargo import Cargo
from app.schemas.cargo import CargoCreate, CargoUpdate


def create_cargo(
    db: Session,
    cargo_data: CargoCreate,
) -> Cargo:
    existing_cargo = db.scalar(
        select(Cargo).where(
            Cargo.cargo_reference
            == cargo_data.cargo_reference
        )
    )

    if existing_cargo is not None:
        raise ValueError(
            "Cargo reference already exists."
        )

    cargo = Cargo(
        cargo_reference=cargo_data.cargo_reference,
        cargo_type=cargo_data.cargo_type,
        description=cargo_data.description,
        quantity=cargo_data.quantity,
        unit=cargo_data.unit,
        vessel_id=cargo_data.vessel_id,
        origin=cargo_data.origin,
        destination=cargo_data.destination,
        status=cargo_data.status,
    )

    db.add(cargo)
    db.commit()
    db.refresh(cargo)

    return cargo


def get_all_cargo(
    db: Session,
) -> list[Cargo]:
    statement = (
        select(Cargo)
        .order_by(Cargo.created_at.desc())
    )

    return list(
        db.scalars(statement).all()
    )


def get_cargo_by_id(
    db: Session,
    cargo_id: int,
) -> Cargo | None:
    return db.get(Cargo, cargo_id)


def update_cargo(
    db: Session,
    cargo: Cargo,
    cargo_data: CargoUpdate,
) -> Cargo:
    update_data = cargo_data.model_dump(
        exclude_unset=True
    )

    if "cargo_reference" in update_data:
        existing_cargo = db.scalar(
            select(Cargo).where(
                Cargo.cargo_reference
                == update_data["cargo_reference"],
                Cargo.id != cargo.id,
            )
        )

        if existing_cargo is not None:
            raise ValueError(
                "Cargo reference already exists."
            )

    for field, value in update_data.items():
        setattr(cargo, field, value)

    db.commit()
    db.refresh(cargo)

    return cargo


def delete_cargo(
    db: Session,
    cargo: Cargo,
) -> None:
    db.delete(cargo)
    db.commit()
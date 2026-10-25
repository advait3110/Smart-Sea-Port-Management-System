from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.cargo import (
    CargoCreate,
    CargoResponse,
    CargoUpdate,
)
from app.services.cargo_service import (
    create_cargo,
    delete_cargo,
    get_all_cargo,
    get_cargo_by_id,
    update_cargo,
)


router = APIRouter(
    prefix="/cargo",
    tags=["Cargo Operations"],
)


# =========================================================
# GET ALL CARGO
# =========================================================

@router.get(
    "",
    response_model=list[CargoResponse],
)
def get_cargo_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_all_cargo(db)


# =========================================================
# GET CARGO BY ID
# =========================================================

@router.get(
    "/{cargo_id}",
    response_model=CargoResponse,
)
def get_cargo(
    cargo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cargo = get_cargo_by_id(
        db,
        cargo_id,
    )

    if cargo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cargo record not found.",
        )

    return cargo


# =========================================================
# CREATE CARGO
# =========================================================

@router.post(
    "",
    response_model=CargoResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_cargo(
    cargo_data: CargoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return create_cargo(
            db,
            cargo_data,
        )

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


# =========================================================
# UPDATE CARGO
# =========================================================

@router.put(
    "/{cargo_id}",
    response_model=CargoResponse,
)
def edit_cargo(
    cargo_id: int,
    cargo_data: CargoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cargo = get_cargo_by_id(
        db,
        cargo_id,
    )

    if cargo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cargo record not found.",
        )

    try:
        return update_cargo(
            db,
            cargo,
            cargo_data,
        )

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


# =========================================================
# DELETE CARGO
# =========================================================

@router.delete(
    "/{cargo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_cargo(
    cargo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cargo = get_cargo_by_id(
        db,
        cargo_id,
    )

    if cargo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cargo record not found.",
        )

    delete_cargo(
        db,
        cargo,
    )

    return None
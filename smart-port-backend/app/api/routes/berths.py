from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.berth import (
    BerthCreate,
    BerthResponse,
    BerthUpdate,
)
from app.services.berth_service import (
    create_berth,
    delete_berth,
    get_berth,
    get_berths,
    serialize_berth,
    serialize_berths,
    update_berth,
)


router = APIRouter(
    prefix="/berths",
    tags=["Berths"],
)


@router.post(
    "",
    response_model=BerthResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_new_berth(
    berth_data: BerthCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        berth = create_berth(db, berth_data)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return serialize_berth(db, berth)


@router.get(
    "",
    response_model=list[BerthResponse],
)
def list_berths(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return serialize_berths(db, get_berths(db))


@router.get(
    "/{berth_id}",
    response_model=BerthResponse,
)
def get_single_berth(
    berth_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    berth = get_berth(db, berth_id)

    if berth is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Berth not found.",
        )

    return serialize_berth(db, berth)


@router.put(
    "/{berth_id}",
    response_model=BerthResponse,
)
def update_existing_berth(
    berth_id: int,
    berth_data: BerthUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    berth = get_berth(db, berth_id)

    if berth is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Berth not found.",
        )

    try:
        berth = update_berth(
            db,
            berth,
            berth_data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return serialize_berth(db, berth)


@router.delete(
    "/{berth_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_existing_berth(
    berth_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    berth = get_berth(db, berth_id)

    if berth is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Berth not found.",
        )

    delete_berth(db, berth)
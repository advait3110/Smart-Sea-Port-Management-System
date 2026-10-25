
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.vessel import VesselCreate, VesselResponse, VesselUpdate
from app.services.vessel_service import (
    create_vessel,
    delete_vessel,
    get_vessel,
    get_vessels,
    update_vessel,
)

router = APIRouter(prefix="/vessels", tags=["Vessels"])


@router.post(
    "",
    response_model=VesselResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_new_vessel(
    vessel_data: VesselCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return create_vessel(db=db, vessel_data=vessel_data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("", response_model=list[VesselResponse])
def list_vessels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_vessels(db)


@router.get("/{vessel_id}", response_model=VesselResponse)
def get_single_vessel(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vessel = get_vessel(db=db, vessel_id=vessel_id)

    if vessel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vessel not found.",
        )

    return vessel


@router.put("/{vessel_id}", response_model=VesselResponse)
def update_existing_vessel(
    vessel_id: int,
    vessel_data: VesselUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vessel = get_vessel(db=db, vessel_id=vessel_id)

    if vessel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vessel not found.",
        )

    try:
        return update_vessel(
            db=db,
            vessel=vessel,
            vessel_data=vessel_data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{vessel_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_existing_vessel(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vessel = get_vessel(db=db, vessel_id=vessel_id)

    if vessel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vessel not found.",
        )

    delete_vessel(db=db, vessel=vessel)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_db,
    require_module_permission,
)
from app.models.user import User
from app.schemas.truck import (
    TruckEntryCreate,
    TruckExitCreate,
    TruckResponse,
)
from app.services.truck_service import (
    TruckConflictError,
    TruckNotFoundError,
    TruckValidationError,
    clear_all_trucks,
    delete_truck,
    get_all_trucks,
    get_truck_by_id,
    record_truck_entry,
    record_truck_exit,
)


# PostgreSQL role_permissions key that controls this module.
GATE_MODULE_KEY = "gate_trucks"


router = APIRouter(
    prefix="/trucks",
    tags=["Gate & Truck Management"],
)


def _http_error(error: Exception) -> HTTPException:
    """Map a service error to the matching HTTP error."""

    if isinstance(error, TruckNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(error, TruckConflictError):
        code = status.HTTP_409_CONFLICT
    else:
        code = status.HTTP_400_BAD_REQUEST

    return HTTPException(status_code=code, detail=str(error))


_SERVICE_ERRORS = (
    TruckNotFoundError,
    TruckConflictError,
    TruckValidationError,
)


# =========================================================
# MANUAL TRUCK ENTRY
# =========================================================

@router.post(
    "/entry",
    response_model=TruckResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_entry(
    truck_data: TruckEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_module_permission(GATE_MODULE_KEY)
    ),
):
    try:
        return record_truck_entry(
            db,
            truck_data,
            current_user,
        )
    except _SERVICE_ERRORS as error:
        raise _http_error(error) from error


# =========================================================
# MANUAL TRUCK EXIT
# =========================================================

@router.post(
    "/{truck_id}/exit",
    response_model=TruckResponse,
)
def record_exit(
    truck_id: int,
    exit_data: TruckExitCreate | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_module_permission(GATE_MODULE_KEY)
    ),
):
    try:
        return record_truck_exit(
            db,
            truck_id,
            exit_data or TruckExitCreate(),
            current_user,
        )
    except _SERVICE_ERRORS as error:
        raise _http_error(error) from error


# =========================================================
# LIST GATE RECORDS
# =========================================================

@router.get(
    "",
    response_model=list[TruckResponse],
)
def get_truck_list(
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_module_permission(GATE_MODULE_KEY)
    ),
):
    return get_all_trucks(db, limit)


# =========================================================
# GET ONE GATE RECORD
# =========================================================

@router.get(
    "/{truck_id}",
    response_model=TruckResponse,
)
def get_truck(
    truck_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_module_permission(GATE_MODULE_KEY)
    ),
):
    truck = get_truck_by_id(db, truck_id)

    if truck is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Truck record not found.",
        )

    return truck


# =========================================================
# CLEAR ALL GATE RECORDS
# =========================================================

@router.delete("")
def clear_truck_records(
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_module_permission(GATE_MODULE_KEY)
    ),
):
    # Safety: the caller must say it means it (?confirm=true).
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add ?confirm=true to clear all gate records.",
        )

    try:
        deleted = clear_all_trucks(db, current_user)
    except _SERVICE_ERRORS as error:
        raise _http_error(error) from error

    return {"deleted": deleted}


# =========================================================
# DELETE ONE GATE RECORD
# =========================================================

@router.delete("/{truck_id}")
def delete_truck_record(
    truck_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_module_permission(GATE_MODULE_KEY)
    ),
):
    try:
        delete_truck(db, truck_id, current_user)
    except _SERVICE_ERRORS as error:
        raise _http_error(error) from error

    return {"deleted": 1}


# NOTE: There is intentionally NO generic POST /trucks or PUT.
# Records are created by a manual entry and closed by a manual
# exit. Deleting is allowed only through the two DELETE routes
# above, and every deletion is logged with the user id.
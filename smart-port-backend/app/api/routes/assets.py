"""
Asset & Maintenance endpoints.

    GET    /assets                                  every asset, with the
                                                    numbers and alerts
    GET    /assets/assignees                        accounts a job can be
                                                    assigned to
    POST   /assets                                  add an asset
    GET    /assets/{id}                             one asset with its jobs
                                                    and history
    POST   /assets/{id}/edit                        {name, location,
                                                    serial_number}
    POST   /assets/{id}/status                      {status, note?}
    POST   /assets/{id}/notes                       {note}
    POST   /assets/{id}/jobs                        schedule a job
    POST   /assets/{id}/jobs/{job_id}/start         {note?}
    POST   /assets/{id}/jobs/{job_id}/complete      {completed_on?, note?,
                                                    next_due_date?,
                                                    return_to_service?}
    POST   /assets/{id}/jobs/{job_id}/cancel        {note}
    DELETE /assets/{id}                             Port Administrator only

Every endpoint needs a valid login. app/main.py also requires the
"asset_maintenance" feature for the whole router (reading is also
allowed with the Dashboard, Port Alerts or Analytics feature).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services import asset_service


def ensure_asset_tables(db: Session = Depends(get_db)) -> None:
    """Create the asset tables on first use."""

    asset_service.ensure_tables(db)


router = APIRouter(
    prefix="/assets",
    tags=["Asset & Maintenance"],
    dependencies=[Depends(ensure_asset_tables)],
)


# =========================================================
# REQUEST BODIES
# =========================================================
#
# The length limits here only stop absurdly large requests. The
# friendly messages ("Enter the asset name ...") come from
# app/services/asset_service.py.
#


class AssetIn(BaseModel):
    name: str | None = Field(default=None, max_length=1000)
    category: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=1000)
    serial_number: str | None = Field(default=None, max_length=1000)
    last_maintenance_on: str | None = Field(default=None, max_length=40)
    next_maintenance_on: str | None = Field(default=None, max_length=40)


class AssetEditIn(BaseModel):
    name: str | None = Field(default=None, max_length=1000)
    location: str | None = Field(default=None, max_length=1000)
    serial_number: str | None = Field(default=None, max_length=1000)


class StatusIn(BaseModel):
    status: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=20000)


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=20000)


class JobIn(BaseModel):
    job_type: str | None = Field(default=None, max_length=100)
    due_date: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=20000)
    assigned_to_id: int | None = None


class StartIn(BaseModel):
    note: str | None = Field(default=None, max_length=20000)


class CompleteIn(BaseModel):
    completed_on: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=20000)
    next_due_date: str | None = Field(default=None, max_length=40)
    return_to_service: bool = False


class CancelIn(BaseModel):
    note: str | None = Field(default=None, max_length=20000)


# =========================================================
# ENDPOINTS
# =========================================================


@router.get("")
def list_assets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every asset with the card numbers and the alerts."""

    return asset_service.list_assets(db, current_user)


# This must stay above "/{asset_id}".
@router.get("/assignees")
def list_assignees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active accounts that have the Asset Maintenance feature."""

    return asset_service.list_assignees(db)


@router.post("")
def add_asset(
    data: AssetIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a new asset (the logged-in account is the one who added it)."""

    return asset_service.create_asset(
        db,
        current_user,
        data.name,
        data.category,
        data.location,
        data.serial_number,
        data.last_maintenance_on,
        data.next_maintenance_on,
    )


@router.get("/{asset_id}")
def get_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One asset with its jobs and history."""

    return asset_service.get_asset(db, current_user, asset_id)


@router.post("/{asset_id}/edit")
def edit_asset(
    asset_id: int,
    data: AssetEditIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the name, location or serial number."""

    return asset_service.update_asset(
        db,
        current_user,
        asset_id,
        data.name,
        data.location,
        data.serial_number,
    )


@router.post("/{asset_id}/status")
def change_status(
    asset_id: int,
    data: StatusIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark the asset Out of Service or return it to service."""

    return asset_service.change_status(
        db,
        current_user,
        asset_id,
        data.status,
        data.note,
    )


@router.post("/{asset_id}/notes")
def add_note(
    asset_id: int,
    data: NoteIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a note to the history."""

    return asset_service.add_note(
        db,
        current_user,
        asset_id,
        data.note,
    )


@router.post("/{asset_id}/jobs")
def schedule_job(
    asset_id: int,
    data: JobIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Schedule a maintenance job for the asset."""

    return asset_service.schedule_job(
        db,
        current_user,
        asset_id,
        data.job_type,
        data.due_date,
        data.description,
        data.assigned_to_id,
    )


@router.post("/{asset_id}/jobs/{job_id}/start")
def start_job(
    asset_id: int,
    job_id: int,
    data: StartIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The work on a Scheduled job begins."""

    return asset_service.start_job(
        db,
        current_user,
        asset_id,
        job_id,
        data.note,
    )


@router.post("/{asset_id}/jobs/{job_id}/complete")
def complete_job(
    asset_id: int,
    job_id: int,
    data: CompleteIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The job is finished."""

    return asset_service.complete_job(
        db,
        current_user,
        asset_id,
        job_id,
        data.completed_on,
        data.note,
        data.next_due_date,
        data.return_to_service,
    )


@router.post("/{asset_id}/jobs/{job_id}/cancel")
def cancel_job(
    asset_id: int,
    job_id: int,
    data: CancelIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The job will not be done."""

    return asset_service.cancel_job(
        db,
        current_user,
        asset_id,
        job_id,
        data.note,
    )


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an asset record (Port Administrator only)."""

    return asset_service.delete_asset(
        db,
        current_user,
        asset_id,
    )
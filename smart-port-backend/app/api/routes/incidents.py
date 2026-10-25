"""
Incident Management endpoints.

    GET    /incidents                          every incident
    GET    /incidents/assignees                accounts an incident can be
                                               assigned to
    GET    /incidents/designations             designations an incident can
                                               be assigned to (not your own)
    POST   /incidents                          report a new incident
    GET    /incidents/{id}                     one incident + its timeline
    POST   /incidents/{id}/status              {status, note?}
    POST   /incidents/{id}/assign              {designation | user_id | none, note?}
    POST   /incidents/{id}/notes               {note}
    DELETE /incidents/{id}                     Port Administrator only

Every endpoint needs a valid login. app/main.py also requires the
"incidents" feature for the whole router (reading is also allowed
with the Dashboard, Port Alerts, Port Map or Analytics feature).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services import incident_service


def ensure_incident_tables(db: Session = Depends(get_db)) -> None:
    """Create the incident tables on first use."""

    incident_service.ensure_tables(db)


router = APIRouter(
    prefix="/incidents",
    tags=["Incident Management"],
    dependencies=[Depends(ensure_incident_tables)],
)


# =========================================================
# REQUEST BODIES
# =========================================================
#
# The length limits here only stop absurdly large requests. The
# friendly messages ("Describe what happened.") come from
# app/services/incident_service.py.
#


class IncidentIn(BaseModel):
    type: str = Field(default="", max_length=100)
    location: str = Field(default="", max_length=1000)
    severity: str = Field(default="", max_length=50)
    description: str = Field(default="", max_length=20000)
    vessel: str | None = Field(default=None, max_length=1000)
    occurred_at: str | None = Field(default=None, max_length=60)


class StatusIn(BaseModel):
    status: str = Field(default="", max_length=60)
    note: str | None = Field(default=None, max_length=20000)


class AssignIn(BaseModel):
    user_id: int | None = None
    designation: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=20000)


class NoteIn(BaseModel):
    note: str = Field(default="", max_length=20000)


# =========================================================
# ENDPOINTS
# =========================================================


@router.get("")
def list_incidents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every incident, the newest first."""

    return incident_service.list_incidents(db, current_user)


# This must stay above "/{incident_id}".
@router.get("/assignees")
def list_assignees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active accounts that have the Incidents feature."""

    return incident_service.list_assignees(db)


# This must stay above "/{incident_id}".
@router.get("/designations")
def list_designations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The designations an incident can be assigned to (not your own)."""

    return incident_service.list_designations(db, current_user)


@router.post("")
def report_incident(
    data: IncidentIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Report a new incident (the logged-in account is the reporter)."""

    return incident_service.create_incident(
        db,
        current_user,
        data.type,
        data.location,
        data.severity,
        data.description,
        data.vessel,
        data.occurred_at,
    )


@router.get("/{incident_id}")
def get_incident(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One incident with its timeline."""

    return incident_service.get_incident(
        db,
        current_user,
        incident_id,
    )


@router.post("/{incident_id}/status")
def change_status(
    incident_id: int,
    data: StatusIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move the incident to another status."""

    return incident_service.change_status(
        db,
        current_user,
        incident_id,
        data.status,
        data.note,
    )


@router.post("/{incident_id}/assign")
def assign_incident(
    incident_id: int,
    data: AssignIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Assign the incident to a designation (team) or to one account.
    Both empty removes the assignment.
    """

    return incident_service.assign_incident(
        db,
        current_user,
        incident_id,
        data.user_id,
        data.note,
        data.designation,
    )


@router.post("/{incident_id}/notes")
def add_note(
    incident_id: int,
    data: NoteIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a note to the timeline."""

    return incident_service.add_note(
        db,
        current_user,
        incident_id,
        data.note,
    )


@router.delete("/{incident_id}")
def delete_incident(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an incident record (Port Administrator only)."""

    return incident_service.delete_incident(
        db,
        current_user,
        incident_id,
    )
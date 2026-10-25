"""
Notification endpoints (the bell and the Notifications page).

    GET    /notifications/summary     bell: unread chat + notifications
    GET    /notifications             the account's notifications
    POST   /notifications/read-all    mark all as read
    POST   /notifications/{id}/read   mark one as read
    DELETE /notifications/{id}        dismiss one
    DELETE /notifications             dismiss all
    POST   /notifications/announce    Port Administrator: message to all

Every endpoint is limited to the logged-in account's own data.
The bell works for every role, so no feature is required.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.api.routes.chat import ensure_chat_tables
from app.models.user import User
from app.services import notification_service


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
    dependencies=[Depends(ensure_chat_tables)],
)


PORT_ADMIN_ROLES = {
    "port administrator",
    "port_administrator",
    "admin",
}


def require_port_administrator(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allow access only to Port Administrators."""

    if (
        current_user.role is None
        or current_user.role.name.strip().lower()
        not in PORT_ADMIN_ROLES
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Port Administrators can "
                "perform this action."
            ),
        )

    return current_user


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(default="", max_length=2000)
    type: Literal["info", "success", "warning", "error"] = "info"
    category: str = Field(default="Announcement", max_length=40)


# The fixed paths (/summary, /read-all, /announce) are declared
# before the paths with an id so they are never mistaken for one.


@router.get("/summary")
def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notification_service.build_summary(db, current_user.id)


@router.get("")
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notification_service.list_notifications(
        db,
        current_user.id,
    )


@router.post("/read-all")
def read_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notification_service.mark_all_read(db, current_user.id)


@router.post("/announce")
def announce(
    data: AnnouncementIn,
    current_user: User = Depends(require_port_administrator),
    db: Session = Depends(get_db),
):
    """Send a notification to every active account."""

    return notification_service.announce(
        db,
        data.title.strip(),
        data.message.strip(),
        data.type,
        data.category.strip() or "Announcement",
    )


@router.post("/{notification_id}/read")
def read_one(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notification_service.mark_one_read(
        db,
        current_user.id,
        notification_id,
    )


@router.delete("/{notification_id}")
def dismiss_one(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notification_service.dismiss_one(
        db,
        current_user.id,
        notification_id,
    )


@router.delete("")
def dismiss_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notification_service.dismiss_all(db, current_user.id)
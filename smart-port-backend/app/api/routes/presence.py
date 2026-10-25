from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services.presence_service import (
    mark_user_online,
    mark_user_offline,
    get_all_presence,
    get_user_presence,
)


router = APIRouter(
    prefix="/presence",
    tags=["Presence"],
)


@router.post("/heartbeat")
def heartbeat(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark the currently authenticated employee as online.

    The frontend calls this endpoint periodically while
    the employee is logged into the port system.
    """

    presence = mark_user_online(
        db=db,
        user_id=current_user.id,
    )

    return {
        "success": True,
        "user_id": current_user.id,
        "is_online": presence.is_online,
        "last_seen": presence.last_seen,
    }


@router.post("/logout")
def presence_logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Explicitly mark the currently authenticated employee offline.
    """

    presence = mark_user_offline(
        db=db,
        user_id=current_user.id,
    )

    return {
        "success": True,
        "user_id": current_user.id,
        "is_online": presence.is_online,
        "last_seen": presence.last_seen,
    }


@router.get("/me")
def my_presence(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the current employee's presence state.
    """

    presence = get_user_presence(
        db=db,
        user_id=current_user.id,
    )

    if presence is None:
        return {
            "user_id": current_user.id,
            "is_online": False,
            "last_seen": None,
        }

    return {
        "user_id": current_user.id,
        "is_online": presence.is_online,
        "last_seen": presence.last_seen,
    }


@router.get("/users")
def all_user_presence(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return presence information for all employees.

    This is used by the User & Role Management page to
    display real-time Active / Inactive status.
    """

    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive users cannot access presence information.",
        )

    return get_all_presence(db=db)
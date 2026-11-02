"""
PROFILE PICTURES OF ALL EMPLOYEES

GET /profile-pictures

Used by the pages that show other employees (Port Communication
and User & Role Management), so they can show each person's
profile picture (DP) instead of only their initials.

The answer is:

    {"pictures": {"3": "data:image/jpeg;base64,...", ...}}

Only employees who have uploaded a picture are listed; everyone
else keeps showing their initials. Any logged-in employee may
read it (it shows the same faces the top bar already shows).

The pictures themselves are saved by profile_service.py
(PUT /users/me/avatar).
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services import profile_service


logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/profile-pictures",
    tags=["Users"],
)


@router.get("")
def list_profile_pictures(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """The profile picture of every employee who has one."""

    try:
        profile_service.ensure_table(db)

        rows = db.execute(
            text(
                "SELECT user_id, avatar FROM account_profile "
                "WHERE avatar IS NOT NULL AND avatar <> ''"
            )
        ).all()

    except Exception:
        db.rollback()

        logger.warning(
            "The profile pictures could not be read.",
            exc_info=True,
        )

        # The pages then simply keep showing initials.
        return {"pictures": {}}

    return {
        "pictures": {
            str(user_id): str(avatar)
            for user_id, avatar in rows
        }
    }
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.core.security import verify_password
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserCredentialsUpdate,
    UserResponse,
    UserUpdate,
)
from app.services import activity_service, profile_service
from app.services.user_service import (
    create_user,
    delete_user,
    get_all_users,
    get_user_by_id,
    update_own_credentials,
    update_user,
)


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


# ============================================================
# ROLE HELPERS
# ============================================================

PORT_ADMIN_ROLES = {
    "port administrator",
    "port_administrator",
}


def require_port_administrator(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Allow access only to Port Administrators.
    """

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


# ============================================================
# RESPONSE BUILDER
# ============================================================

def build_user_response(
    user: User,
) -> UserResponse:
    """
    Convert the SQLAlchemy User model into the
    public API response.

    Password hashes are NEVER returned.
    """

    if user.role is None:
        role_name = ""
    else:
        role_name = user.role.name

    return UserResponse(
        id=user.id,
        name=user.full_name,
        admin_id=user.username,
        role=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


# ============================================================
# SELF-SERVICE CREDENTIALS
# ============================================================

@router.put(
    "/me/credentials",
    response_model=UserResponse,
)
def change_my_credentials(
    credentials: UserCredentialsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allow any authenticated employee to change their
    own Admin ID and/or password.

    The current password must be supplied.

    Passwords are verified against the stored hash and
    new passwords are hashed before being stored.

    A user can only modify their own credentials here.
    """

    if not verify_password(
        credentials.current_password,
        current_user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    try:
        updated_user = update_own_credentials(
            db=db,
            user=current_user,
            admin_id=credentials.new_admin_id,
            password=credentials.new_password,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return build_user_response(updated_user)


# ============================================================
# MY PROFILE (name, phone number, profile picture)
# ============================================================
#
# Open to every logged-in employee, and only ever about the
# logged-in employee's own account. These paths must stay above
# "/{user_id}".

class MyProfileUpdate(BaseModel):
    """What "Account Settings" sends. Empty phone = remove it."""

    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=100)


class MyAvatarUpload(BaseModel):
    """The picture as "data:image/jpeg;base64,..." text."""

    image: str = Field(min_length=1, max_length=400_000)


def build_profile_response(
    db: Session,
    user: User,
) -> dict:
    """The account's own profile, with phone and picture."""

    saved = profile_service.get_profile(db, user.id)

    return {
        "id": user.id,
        "name": user.full_name or "",
        "admin_id": user.username,
        "role": user.role.name if user.role is not None else "",
        "is_active": bool(user.is_active),
        "phone": saved["phone"],
        "avatar": saved["avatar"],
    }


@router.get("/me/profile")
def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The logged-in employee's profile."""

    return build_profile_response(db, current_user)


@router.put("/me/profile")
def change_my_profile(
    data: MyProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change my own name and/or phone number."""

    if data.name is None and data.phone is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is nothing to change.",
        )

    try:
        # Check the phone number first, so a wrong phone number
        # does not leave a half-saved profile behind.
        if data.phone is not None:
            profile_service.clean_phone(data.phone)

        if data.name is not None:
            update_user(
                db=db,
                user=current_user,
                name=data.name,
            )

        if data.phone is not None:
            profile_service.save_phone(
                db,
                current_user.id,
                data.phone,
            )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return build_profile_response(db, current_user)


@router.put("/me/avatar")
def change_my_avatar(
    data: MyAvatarUpload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save my profile picture."""

    try:
        profile_service.save_avatar(
            db,
            current_user.id,
            data.image,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return build_profile_response(db, current_user)


@router.delete("/me/avatar")
def remove_my_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove my profile picture."""

    try:
        profile_service.remove_avatar(db, current_user.id)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return build_profile_response(db, current_user)


# ============================================================
# GET ALL USERS
# ============================================================

@router.get(
    "",
    response_model=list[UserResponse],
)
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Return all employee accounts.

    Only Port Administrators can view the complete
    user-management list.
    """

    users = get_all_users(db)

    return [
        build_user_response(user)
        for user in users
    ]


# ============================================================
# WHO IS ONLINE
# ============================================================

# This must stay above "/{user_id}".
@router.get("/online")
def list_online_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    The ids of the accounts that are logged in and in use right now.

    An account is Online when its browser has asked the server for
    something in the last few seconds (see activity_service.py).
    """

    return {
        "online_user_ids": activity_service.online_user_ids(db),
        "window_seconds": activity_service.ONLINE_SECONDS,
    }


# ============================================================
# GET USER BY ID
# ============================================================

@router.get(
    "/{user_id}",
    response_model=UserResponse,
)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Return one employee account.

    Only Port Administrators can access another
    employee's account information.
    """

    user = get_user_by_id(
        db=db,
        user_id=user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return build_user_response(user)


# ============================================================
# CREATE USER
# ============================================================

@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_new_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Create a new employee account.

    Only Port Administrators can create users.

    The role can be a fixed role or any custom role created in
    Roles & Permissions. Password hashing is handled by the
    service layer. A refusal comes back as a readable message.
    """

    try:
        user = create_user(
            db=db,
            name=user_data.name,
            admin_id=user_data.admin_id,
            password=user_data.password,
            role_name=user_data.role,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return build_user_response(user)


# ============================================================
# UPDATE USER
# ============================================================

@router.put(
    "/{user_id}",
    response_model=UserResponse,
)
def update_existing_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_port_administrator
    ),
):
    """
    Update another employee account.

    Only Port Administrators can use this endpoint.

    This endpoint may update:

    - name
    - Admin ID
    - password
    - role
    - active/inactive status

    Passwords are handled by the service layer and
    remain hashed in PostgreSQL.
    """

    user = get_user_by_id(
        db=db,
        user_id=user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    # --------------------------------------------------------
    # Prevent the Port Administrator from accidentally
    # disabling their own account.
    # --------------------------------------------------------

    if (
        user.id == current_user.id
        and user_data.is_active is False
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "You cannot deactivate your own "
                "Port Administrator account."
            ),
        )

    # --------------------------------------------------------
    # Prevent the Port Administrator from changing their own
    # role (they would lock themselves out of role management).
    # --------------------------------------------------------

    if (
        user.id == current_user.id
        and user_data.role is not None
        and user_data.role.strip().lower()
        not in PORT_ADMIN_ROLES
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role.",
        )

    try:
        updated_user = update_user(
            db=db,
            user=user,
            name=user_data.name,
            admin_id=user_data.admin_id,
            password=user_data.password,
            role_name=user_data.role,
            is_active=user_data.is_active,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return build_user_response(updated_user)


# ============================================================
# DELETE USER
# ============================================================

@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_existing_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_port_administrator
    ),
):
    """
    Delete an employee account.

    A Port Administrator cannot delete their own account. Another
    Port Administrator account (an extra one) can be deleted,
    because the logged-in Port Administrator always remains.
    """

    user = get_user_by_id(
        db=db,
        user_id=user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    # --------------------------------------------------------
    # Prevent self deletion
    # --------------------------------------------------------

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "You cannot delete your own "
                "Port Administrator account."
            ),
        )

    removed_id = user.id

    try:
        delete_user(db=db, user=user)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    activity_service.forget(db, removed_id)

    profile_service.forget(db, removed_id)

    return None
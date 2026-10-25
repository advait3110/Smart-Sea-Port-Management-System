from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    get_db,
)

from app.core.security import create_access_token

from app.models.user import User

from app.schemas.auth import (
    TokenResponse,
    UserLogin,
)

from app.services import audit_service
from app.services.auth_services import (
    authenticate_user,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


# ============================================================
# THE LOGGED-IN EMPLOYEE
# ============================================================


class MyAccountResponse(BaseModel):
    """
    What /auth/me returns.

    There is NO e-mail address: the port signs in with the
    Admin ID (username) only.
    """

    id: int
    username: str
    full_name: str = ""
    role: str = ""
    is_active: bool = True
    permissions: list[str] = []


def build_user_response(
    user: User,
) -> MyAccountResponse:
    """
    Build the authenticated user's response.

    IMPORTANT:

    Permissions are read directly from:

        User
          v
        Role
          v
        role_permissions
          v
        Permission

    PostgreSQL is therefore the source of truth.

    There is NO hardcoded permission fallback here.
    """

    role_name = (
        user.role.name
        if user.role
        else ""
    )

    permissions = []

    if user.role:
        permissions = sorted(
            {
                permission.key
                for permission in user.role.permissions
            }
        )

    return MyAccountResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name or "",
        role=role_name,
        is_active=user.is_active,
        permissions=permissions,
    )


# ============================================================
# LOGIN
# ============================================================


@router.post(
    "/login",
    response_model=TokenResponse,
)
def login_user(
    login_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Authenticate an employee and issue a JWT.

    The JWT identifies the employee.

    IMPORTANT:

    Feature permissions are NOT stored permanently in
    the JWT. They are read from PostgreSQL when /auth/me
    or protected endpoints need them.

    Therefore changing a role's permissions does not
    require changing the role itself or rebuilding users.
    """

    user = authenticate_user(
        db,
        login_data.username,
        login_data.password,
    )

    if user is None:

        # Written to the Audit Log (the typed Admin ID only, never
        # the password).
        audit_service.record(
            module="Sign-in",
            action="Failed sign-in",
            category="failed_sign_in",
            target=f"Admin ID: {login_data.username}",
            description="Wrong Admin ID or password.",
            result="Failed",
            admin_id=str(login_data.username or ""),
            request=request,
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    if not user.is_active:

        audit_service.record(
            module="Sign-in",
            action="Failed sign-in",
            category="failed_sign_in",
            target=f"Admin ID: {user.username}",
            description="The account is inactive.",
            result="Refused",
            user=user,
            request=request,
        )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This employee account is inactive."
            ),
        )

    if user.role is None:

        audit_service.record(
            module="Sign-in",
            action="Failed sign-in",
            category="failed_sign_in",
            target=f"Admin ID: {user.username}",
            description="The account has no valid role.",
            result="Refused",
            user=user,
            request=request,
        )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This employee does not have a valid "
                "role assigned."
            ),
        )

    access_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role.name,
    )

    audit_service.record(
        module="Sign-in",
        action="Signed in",
        category="sign_in",
        description="Signed in to the port system.",
        user=user,
        request=request,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
    )


# ============================================================
# CURRENT USER
# ============================================================


@router.get(
    "/me",
    response_model=MyAccountResponse,
)
def get_my_profile(
    current_user: User = Depends(
        get_current_user
    ),
):
    """
    Return the currently authenticated employee.

    Permissions are loaded LIVE from PostgreSQL through
    the employee's current role.

    Example:

        Cargo Officer
            v
        role_permissions
            v
        cargo
        dashboard
        notifications

    If the Port Administrator removes "cargo", the next
    /auth/me response will no longer contain "cargo".

    If all permissions are removed, the response contains:

        "permissions": []

    No static frontend permission list is used.
    """

    return build_user_response(
        current_user
    )
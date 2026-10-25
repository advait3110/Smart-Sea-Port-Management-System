from collections.abc import Callable, Generator

import jwt

from fastapi import (
    Depends,
    HTTPException,
    Request,
    status,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import User
from app.services.activity_service import record_request


security = HTTPBearer()


# ============================================================
# DATABASE
# ============================================================


def get_db() -> Generator[Session, None, None]:
    """
    Provide a SQLAlchemy database session.
    """

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# ============================================================
# CURRENT AUTHENTICATED USER
# ============================================================


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve the authenticated employee from the JWT.

    IMPORTANT:

    The JWT identifies the employee.

    The user's current role and permissions are loaded
    from PostgreSQL on every request.

    Therefore role-permission changes made by the
    Port Administrator are dynamic.
    """

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[
                settings.JWT_ALGORITHM
            ],
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )

        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            ) from None

        user = db.get(
            User,
            user_id,
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    "User account does not exist."
                ),
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=(
                    "User account is inactive."
                ),
            )

        if user.role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "User does not have a valid role."
                ),
            )

        # Remember that this account is being used right now.
        # This is what shows "Online" in User & Role Management.
        # It never raises, so it can never break a request.
        record_request(
            user.id,
            request.url.path,
        )

        return user

    except HTTPException:
        raise

    except (
        jwt.InvalidTokenError,
        ValueError,
        TypeError,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Invalid or expired authentication token."
            ),
        ) from None


# ============================================================
# PERMISSION-BASED AUTHORIZATION (PostgreSQL role_permissions)
# ============================================================


def require_module_permission(
    module_key: str,
) -> Callable:
    """
    Restrict an endpoint to users whose role has the given
    module permission key (for example "gate_trucks") in the
    PostgreSQL role_permissions table.

    Authorization is decided ONLY by the permissions stored
    for the user's role. An empty permission list grants
    nothing, and no access is granted because of a role name.

    The frontend route guard is a UI convenience only; this
    dependency is the real enforcement.
    """

    def permission_checker(
        current_user: User = Depends(
            get_current_user
        ),
    ) -> User:

        granted_keys = {
            permission.key
            for permission in (
                current_user.role.permissions or []
            )
        }

        if module_key not in granted_keys:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You do not have permission "
                    "to access this resource."
                ),
            )

        return current_user

    return permission_checker


# ============================================================
# WHOLE-ROUTER FEATURE ACCESS (reading vs changing data)
# ============================================================

READ_ONLY_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_module_access(
    module_key: str,
    *,
    also_read: tuple[str, ...] = (),
) -> Callable:
    """
    Protect a whole group of endpoints with one feature.

    CHANGING data (POST, PUT, PATCH, DELETE) needs the
    feature itself, for example "berths".

    READING data (GET) needs the feature itself OR one of the
    related features listed in `also_read`. For example the
    Dashboard shows figures from several modules.

    Example (in app/main.py):

        app.include_router(
            berths.router,
            dependencies=[
                Depends(
                    require_module_access(
                        "berths",
                        also_read=("dashboard", "port_map"),
                    )
                )
            ],
        )

    A role with ZERO features is refused everywhere.
    No role name ever grants access.
    """

    read_keys = {module_key, *also_read}
    change_keys = {module_key}

    def access_checker(
        request: Request,
        current_user: User = Depends(
            get_current_user
        ),
    ) -> User:

        granted_keys = {
            permission.key
            for permission in (
                current_user.role.permissions or []
            )
        }

        needed_keys = (
            read_keys
            if request.method in READ_ONLY_METHODS
            else change_keys
        )

        if granted_keys.isdisjoint(needed_keys):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You do not have permission "
                    "to access this resource."
                ),
            )

        return current_user

    return access_checker


# ============================================================
# LEGACY ROLE CHECK
# ============================================================


def require_roles(
    *allowed_roles: str,
) -> Callable:
    """
    Restrict an endpoint to specific role names.

    This is useful for endpoints that genuinely require
    a particular system role.

    Example:

        Depends(
            require_roles(
                "Port Administrator"
            )
        )

    For feature access, prefer permission-based
    authorization instead of hardcoding roles.
    """

    def role_checker(
        current_user: User = Depends(
            get_current_user
        ),
    ) -> User:

        if (
            current_user.role is None
            or current_user.role.name
            not in allowed_roles
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You do not have permission "
                    "to access this resource."
                ),
            )

        return current_user

    return role_checker
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    get_db,
)
from app.models.user import User
from app.schemas.role import (
    RoleCreate,
    RolePermissionKeysResponse,
    RolePermissionUpdate,
    RoleResponse,
    RoleUpdate,
)
from app.services.role_service import (
    create_role,
    delete_role,
    get_all_roles,
    get_role_by_id,
    get_role_permission_keys,
    update_role,
    update_role_permissions,
)


router = APIRouter(
    prefix="/roles",
    tags=["Roles & Permissions"],
)


# ============================================================
# FIXED SYSTEM ROLES
# ============================================================

FIXED_SYSTEM_ROLES = {
    "Port Administrator",
    "Port Operations Manager",
    "Vessel Management Officer",
    "Cargo Officer",
    "Gate & Truck Officer",
    "Security Officer",
    "Maintenance Officer",
    "Port Executive",
}


# ============================================================
# PORT ADMINISTRATOR AUTHORIZATION
# ============================================================

def require_port_administrator(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Only the Port Administrator can manage:

    - Roles
    - Role permissions
    - Custom roles
    - Employee access configuration
    """

    role_name = (
        current_user.role.name
        if current_user.role
        else None
    )

    if role_name != "Port Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only the Port Administrator can "
                "manage roles and permissions."
            ),
        )

    return current_user


# ============================================================
# GET ALL ROLES
# ============================================================

@router.get(
    "",
    response_model=list[RoleResponse],
    status_code=status.HTTP_200_OK,
)
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Return every fixed and custom role.

    The permissions returned here are the CURRENT
    PostgreSQL permissions.
    """

    return get_all_roles(db)


# ============================================================
# GET ONE ROLE
# ============================================================

@router.get(
    "/{role_id}",
    response_model=RoleResponse,
    status_code=status.HTTP_200_OK,
)
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Return one role with its CURRENT permissions.
    """

    return get_role_by_id(
        db,
        role_id,
    )


# ============================================================
# CREATE CUSTOM ROLE
# ============================================================

@router.post(
    "",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Create a custom role.

    Custom roles start with ZERO permissions.

    The Port Administrator then grants features through:

        PUT /roles/{role_id}/permissions
    """

    return create_role(
        db=db,
        name=payload.name,
        description=payload.description,
    )


# ============================================================
# UPDATE ROLE
# ============================================================

@router.put(
    "/{role_id}",
    response_model=RoleResponse,
    status_code=status.HTTP_200_OK,
)
def edit_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Update a role.

    Fixed system roles cannot be renamed.

    Their permissions ARE editable.
    """

    role = get_role_by_id(
        db,
        role_id,
    )

    if (
        role.name in FIXED_SYSTEM_ROLES
        and payload.name is not None
        and payload.name.strip() != role.name
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"System role '{role.name}' "
                "cannot be renamed."
            ),
        )

    return update_role(
        db=db,
        role_id=role_id,
        name=payload.name,
        description=payload.description,
    )


# ============================================================
# DELETE ROLE
# ============================================================

@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Delete a custom role.

    Fixed system roles cannot be deleted.
    """

    delete_role(
        db,
        role_id,
    )

    return None


# ============================================================
# GET CURRENT ROLE PERMISSIONS
# ============================================================

@router.get(
    "/{role_id}/permissions",
    response_model=RolePermissionKeysResponse,
    status_code=status.HTTP_200_OK,
)
def get_permissions(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Return the CURRENT feature permissions of a role.

    This is what the User & Role Management screen should
    load when the Port Administrator selects a role.
    """

    role = get_role_by_id(
        db,
        role_id,
    )

    permissions = get_role_permission_keys(
        db,
        role_id,
    )

    return {
        "role_id": role.id,
        "role_name": role.name,
        "permissions": permissions,
    }


# ============================================================
# DYNAMICALLY GRANT / REMOVE ROLE FEATURES
# ============================================================

@router.put(
    "/{role_id}/permissions",
    response_model=RolePermissionKeysResponse,
    status_code=status.HTTP_200_OK,
)
def set_permissions(
    role_id: int,
    payload: RolePermissionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_port_administrator),
):
    """
    Replace the COMPLETE feature-access configuration
    for a role.

    This is the main RBAC endpoint.

    Example:

        Existing:
            dashboard
            cargo
            weather

        Admin unchecks weather and saves:

            {
                "permissions": [
                    "dashboard",
                    "cargo"
                ]
            }

        PostgreSQL becomes:

            dashboard
            cargo

        weather is removed.

    If the Port Administrator sends:

        {
            "permissions": []
        }

    the role receives NO feature permissions.

    Port Administrator itself is protected and always retains
    all permissions.
    """

    role = update_role_permissions(
        db=db,
        role_id=role_id,
        permission_keys=payload.permissions,
    )

    current_permissions = sorted(
        permission.key
        for permission in role.permissions
    )

    return {
        "role_id": role.id,
        "role_name": role.name,
        "permissions": current_permissions,
    }
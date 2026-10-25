"""
ROLE SERVICE (roles and their features)

A ROLE is a designation such as "Cargo Officer". What a role can
open is decided ONLY by its FEATURES (the 16 module keys below),
stored in PostgreSQL in role_permissions.

There are two kinds of roles:

  FIXED roles    the 8 official designations. They always exist.
                 They cannot be renamed or deleted. Their features
                 can be changed by the Port Administrator.

  CUSTOM roles   any other role (for example "Harbour Pilot")
                 created by the Port Administrator. A custom role
                 starts with ZERO features. It can be renamed and
                 deleted (when no employee has it) and it appears
                 in the "Employee Role" list when an account is
                 created.

Every function that cannot do what was asked raises an
HTTPException with a short, readable message, because the
routes in app/api/routes/roles.py do not catch anything.
"""

import logging
import re

from fastapi import HTTPException, status
from sqlalchemy import Boolean, Integer, String, func, select
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.role import Role
from app.models.user import User


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

ADMIN_ROLE_NAME = "Port Administrator"

FIXED_ROLE_NAMES = [
    "Port Administrator",
    "Port Operations Manager",
    "Vessel Management Officer",
    "Cargo Officer",
    "Gate & Truck Officer",
    "Security Officer",
    "Maintenance Officer",
    "Port Executive",
]

# The 16 features a role can be given.
# (key, title, description). The keys are the same ones used by
# the frontend and by require_module_access in the backend.
FEATURES = [
    ("dashboard", "Port Dashboard",
     "View the main port operational dashboard."),
    ("port_map", "Live Port Map",
     "View the interactive port map and operational locations."),
    ("weather", "Weather & Marine Conditions",
     "View weather, marine and environmental conditions."),
    ("vessels", "Vessel Management",
     "Manage vessel records and vessel operations."),
    ("berths", "Berth Management",
     "Manage berth information and berth operations."),
    ("cargo", "Cargo Operations",
     "Manage cargo records and cargo operations."),
    ("gate_trucks", "Gate & Truck Management",
     "Manage truck entry, exit and gate operations."),
    ("port_communication", "Port Communication",
     "Access internal port communication functions."),
    ("notifications", "Notifications",
     "View and manage port notifications."),
    ("port_alerts", "Port Alerts",
     "View and manage operational port alerts."),
    ("incidents", "Incident Management",
     "Report and manage port incidents."),
    ("asset_maintenance", "Asset & Maintenance",
     "Manage assets, maintenance and maintenance activities."),
    ("analytics", "Port Analytics",
     "View operational analytics and statistics."),
    ("documents", "Document Management",
     "Manage port documents and records."),
    ("audit_logs", "Audit Logs",
     "View system activity and audit records."),
    ("user_role_management", "User & Role Management",
     "Manage users, roles and permissions."),
]

FEATURE_KEYS = [key for key, _, _ in FEATURES]

FEATURE_INFO = {key: (title, text) for key, title, text in FEATURES}

# Role names are limited to these lengths (the database column
# may be shorter, the real limit is read from the model).
MIN_ROLE_NAME = 2
MAX_ROLE_NAME = 50
MAX_DESCRIPTION = 255

NAME_TAKEN = "A role with this name already exists."

ROLE_NAME_PATTERN = re.compile(r"^\w[\w &/.,'()\-]*$")

# A custom role must never be mistaken for the Port Administrator.
RESERVED_KEYS = {
    "admin",
    "administrator",
    "portadmin",
    "portadministrator",
    "sysadmin",
    "superadmin",
    "root",
}


# =========================================================
# SMALL HELPERS
# =========================================================

def _fail(code: int, message: str):
    raise HTTPException(status_code=code, detail=message)


def _key(value) -> str:
    """'Port Operations-Manager' -> 'portoperationsmanager'."""

    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


FIXED_KEYS = {_key(name): name for name in FIXED_ROLE_NAMES}


def _tidy(value) -> str:
    """Trim and collapse repeated spaces."""

    return " ".join(str(value or "").split())


def is_admin_role(role) -> bool:
    return _key(getattr(role, "name", "")) == _key(ADMIN_ROLE_NAME)


def is_fixed_role(role) -> bool:
    return _key(getattr(role, "name", "")) in FIXED_KEYS


def _max_length(model, attribute: str, fallback: int) -> int:
    """The length of a text column of the model (or the fallback)."""

    try:
        length = getattr(model, attribute).property.columns[0].type.length
    except Exception:
        return fallback

    return int(length) if length else fallback


def _db_reason(error: Exception) -> str:
    """A short, readable reason taken from a database error."""

    text = str(getattr(error, "orig", None) or error).strip()

    return (text.splitlines() or ["unknown error"])[0][:200]


def _save(db: Session, what: str, clash: str | None = None) -> None:
    """
    Commit. A database problem becomes a readable message.
    `clash` is the message for a "this already exists / is still
    in use" refusal of the database.
    """

    try:
        db.commit()

    except IntegrityError as error:
        db.rollback()

        reason = _db_reason(error)

        logger.warning("%s refused: %s", what, reason)

        _fail(
            status.HTTP_400_BAD_REQUEST,
            clash or f"The {what} could not be saved: {reason}",
        )

    except SQLAlchemyError as error:
        db.rollback()

        logger.exception("The %s could not be saved.", what)

        _fail(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"The {what} could not be saved: {_db_reason(error)}",
        )


def _permission_model():
    """
    The class behind Role.permissions. It is read from the
    relationship, so this file needs no import of that model.
    """

    return Role.permissions.property.mapper.class_


# =========================================================
# CHECKING INPUT
# =========================================================

def _clean_role_name(
    db: Session,
    name,
    exclude_role_id: int | None = None,
) -> str:
    """A valid, unused role name, or a readable error."""

    clean = _tidy(name)

    if not clean:
        _fail(status.HTTP_400_BAD_REQUEST, "Please enter a role name.")

    longest = min(
        _max_length(Role, "name", MAX_ROLE_NAME),
        MAX_ROLE_NAME,
    )

    if len(clean) < MIN_ROLE_NAME:
        _fail(
            status.HTTP_400_BAD_REQUEST,
            f"The role name must have at least {MIN_ROLE_NAME} characters.",
        )

    if len(clean) > longest:
        _fail(
            status.HTTP_400_BAD_REQUEST,
            f"The role name can have at most {longest} characters.",
        )

    if not ROLE_NAME_PATTERN.match(clean):
        _fail(
            status.HTTP_400_BAD_REQUEST,
            "The role name can use letters, numbers, spaces and "
            "these signs only: & / . , ' ( ) -",
        )

    # The 8 official names keep their official spelling.
    official = FIXED_KEYS.get(_key(clean))

    if official is not None:
        clean = official

    for existing in db.scalars(select(Role)).all():
        if exclude_role_id is not None and existing.id == exclude_role_id:
            continue

        if _key(existing.name) == _key(clean):
            _fail(
                status.HTTP_400_BAD_REQUEST,
                f'A role named "{existing.name}" already exists.',
            )

    if official is None and _key(clean) in RESERVED_KEYS:
        _fail(
            status.HTTP_400_BAD_REQUEST,
            "This name is reserved for the Port Administrator. "
            "Please choose another role name.",
        )

    return clean


def _clean_description(description) -> str:
    clean = _tidy(description)

    longest = min(
        _max_length(Role, "description", MAX_DESCRIPTION),
        MAX_DESCRIPTION,
    )

    if len(clean) > longest:
        _fail(
            status.HTTP_400_BAD_REQUEST,
            f"The description can have at most {longest} characters.",
        )

    return clean


def _clean_feature_keys(permission_keys) -> list[str]:
    """The feature keys without repeats, or a readable error."""

    if permission_keys is None:
        return []

    keys: list[str] = []

    for raw in permission_keys:
        key = str(raw or "").strip()

        if not key or key in keys:
            continue

        if key not in FEATURE_KEYS:
            _fail(
                status.HTTP_400_BAD_REQUEST,
                f'"{key}" is not a feature of this system.',
            )

        keys.append(key)

    return keys


# =========================================================
# READ
# =========================================================

def get_all_roles(db: Session) -> list[Role]:
    """Every role: the 8 fixed ones and every custom one."""

    return list(db.scalars(select(Role).order_by(Role.id)).all())


def get_role_by_id(db: Session, role_id: int) -> Role:
    role = db.get(Role, role_id)

    if role is None:
        _fail(status.HTTP_404_NOT_FOUND, "Role not found.")

    return role


def get_role_permission_keys(db: Session, role_id: int) -> list[str]:
    """The feature keys of a role, as saved in PostgreSQL."""

    role = get_role_by_id(db, role_id)

    return sorted(
        {permission.key for permission in (role.permissions or [])}
    )


# =========================================================
# CREATE / CHANGE / DELETE A ROLE
# =========================================================

def create_role(
    db: Session,
    name: str,
    description: str | None = None,
) -> Role:
    """
    Create a role. A new role has NO features: the Port
    Administrator ticks them afterwards in Roles & Permissions.
    """

    clean_name = _clean_role_name(db, name)
    clean_description = _clean_description(description)

    role = Role(name=clean_name)

    if hasattr(Role, "description"):
        role.description = clean_description

    db.add(role)

    _save(db, "role", clash=NAME_TAKEN)

    db.refresh(role)

    return role


def update_role(
    db: Session,
    role_id: int,
    name: str | None = None,
    description: str | None = None,
) -> Role:
    """Rename a custom role and/or change its description."""

    role = get_role_by_id(db, role_id)

    if name is not None and _tidy(name) != _tidy(role.name):
        if is_fixed_role(role):
            _fail(
                status.HTTP_400_BAD_REQUEST,
                f'System role "{role.name}" cannot be renamed.',
            )

        role.name = _clean_role_name(db, name, exclude_role_id=role.id)

    if description is not None and hasattr(Role, "description"):
        role.description = _clean_description(description)

    _save(db, "role", clash=NAME_TAKEN)

    db.refresh(role)

    return role


def delete_role(db: Session, role_id: int) -> None:
    """
    Delete a custom role. A fixed role cannot be deleted, and a
    role that employees still have cannot be deleted either.
    """

    role = get_role_by_id(db, role_id)

    if is_fixed_role(role):
        _fail(
            status.HTTP_400_BAD_REQUEST,
            f'"{role.name}" is a system role and cannot be deleted.',
        )

    holders = db.scalar(
        select(func.count()).select_from(User).where(
            User.role_id == role.id
        )
    ) or 0

    if holders:
        people = "employee has" if holders == 1 else "employees have"

        _fail(
            status.HTTP_400_BAD_REQUEST,
            f'{holders} {people} the role "{role.name}". '
            "Move them to another role first, then delete the role.",
        )

    role.permissions = []

    db.delete(role)

    _save(
        db,
        "role",
        clash=(
            f'The role "{role.name}" is still in use and cannot '
            "be deleted."
        ),
    )


# =========================================================
# FEATURES OF A ROLE
# =========================================================

def _new_permission(model, key: str):
    """
    A feature row that is missing in the permissions table.
    Every required text column is filled, so this works with
    the table as it is.
    """

    title, text = FEATURE_INFO.get(
        key, (key.replace("_", " ").title(), "")
    )

    values = {"key": key}

    try:
        for prop in sa_inspect(model).column_attrs:
            attribute = prop.key

            if attribute in values:
                continue

            column = prop.columns[0]

            if column.primary_key:
                continue

            if attribute in ("name", "title", "label", "display_name"):
                values[attribute] = title
                continue

            if attribute in ("description", "details"):
                values[attribute] = text
                continue

            if (
                column.nullable
                or column.default is not None
                or column.server_default is not None
            ):
                continue

            if isinstance(column.type, String):
                values[attribute] = title
            elif isinstance(column.type, Boolean):
                values[attribute] = True
            elif isinstance(column.type, Integer):
                values[attribute] = 0

    except Exception:
        logger.warning(
            "Feature row for %s was built with the key only.",
            key,
            exc_info=True,
        )

        values = {"key": key}

    return model(**values)


def _permission_rows(db: Session, keys: list[str]) -> list:
    """The feature rows for these keys (missing ones are created)."""

    if not keys:
        return []

    model = _permission_model()

    found = {
        permission.key: permission
        for permission in db.scalars(
            select(model).where(model.key.in_(keys))
        ).all()
    }

    rows = []

    for key in keys:
        row = found.get(key)

        if row is None:
            row = _new_permission(model, key)

            db.add(row)

        rows.append(row)

    return rows


def update_role_permissions(
    db: Session,
    role_id: int,
    permission_keys,
) -> Role:
    """
    Replace the COMPLETE feature list of a role.

    The Port Administrator role always keeps all 16 features,
    whatever list is sent.
    """

    role = get_role_by_id(db, role_id)

    if is_admin_role(role):
        keys = list(FEATURE_KEYS)
    else:
        keys = _clean_feature_keys(permission_keys)

    role.permissions = _permission_rows(db, keys)

    _save(db, "features of the role")

    db.refresh(role)

    return role
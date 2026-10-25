"""
USER SERVICE (employee accounts)

Everything about creating and changing employee accounts lives
here. The routes in app/api/routes/users.py only call these
functions.

Rules
-----
* An employee has a full name (a real person's name), an Admin ID
  (the login name), a password and ONE role. There is NO e-mail
  address: the port signs in with the Admin ID only.
* The Admin ID is saved in lower case and must be unique.
* Passwords are hashed before they are stored. They are never
  saved or returned as plain text.
* There is only ONE active Port Administrator. A second one cannot
  be created, and nobody else can be moved into that role, until
  the first one is disabled or deleted.
* The last active Port Administrator cannot be disabled or moved
  to another role.
* The role is given by NAME. A custom role created in
  Roles & Permissions works exactly like a fixed one.

Every refusal is a ValueError with a short, readable message
(the route turns it into an HTTP 400 answer).
"""

import logging
import re

from sqlalchemy import func, select
from sqlalchemy import text as sql_text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

ADMIN_ROLE_NAME = "Port Administrator"

MIN_NAME = 2
MAX_NAME = 100

MIN_ADMIN_ID = 3
MAX_ADMIN_ID = 30

ADMIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")

MIN_PASSWORD = 8

# The password hash (bcrypt) can only use the first 72 bytes.
MAX_PASSWORD_BYTES = 72


# =========================================================
# SMALL HELPERS
# =========================================================

def _key(value) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _tidy(value) -> str:
    return " ".join(str(value or "").split())


def _max_length(attribute: str, fallback: int) -> int:
    """The length of a text column of the User model."""

    try:
        length = getattr(User, attribute).property.columns[0].type.length
    except Exception:
        return fallback

    return int(length) if length else fallback


def _db_reason(error: Exception) -> str:
    text = str(getattr(error, "orig", None) or error).strip()

    return (text.splitlines() or ["unknown error"])[0][:200]


def _is_admin_role(role) -> bool:
    return role is not None and _key(role.name) == _key(ADMIN_ROLE_NAME)


def _save(db: Session, what: str) -> None:
    """Commit. A database problem becomes a readable message."""

    try:
        db.commit()

    except IntegrityError as error:
        db.rollback()

        reason = _db_reason(error)

        logger.warning("%s refused: %s", what, reason)

        lowered = reason.lower()

        if "unique" in lowered or "duplicate" in lowered:
            raise ValueError(
                "This Admin ID is already assigned to another employee."
            ) from None

        if "email" in lowered and "null" in lowered:
            raise ValueError(
                "The database still asks for an e-mail address, and "
                "the port does not use one. Open the Supabase SQL "
                "Editor, run this one line, then try again: "
                "ALTER TABLE users ALTER COLUMN email DROP NOT NULL;"
            ) from None

        raise ValueError(
            f"The database refused to save the {what}: {reason}"
        ) from None

    except SQLAlchemyError as error:
        db.rollback()

        logger.exception("The %s could not be saved.", what)

        raise ValueError(
            f"The database could not save the {what}: "
            f"{_db_reason(error)}"
        ) from None


# =========================================================
# CHECKING INPUT
# =========================================================

def clean_name(name) -> str:
    clean = _tidy(name)

    longest = min(_max_length("full_name", MAX_NAME), MAX_NAME)

    if len(clean) < MIN_NAME:
        raise ValueError("Please enter the employee's full name.")

    if len(clean) > longest:
        raise ValueError(
            f"The name can have at most {longest} characters."
        )

    return clean


def clean_admin_id(admin_id) -> str:
    clean = str(admin_id or "").strip().lower()

    longest = min(_max_length("username", MAX_ADMIN_ID), MAX_ADMIN_ID)

    if (
        len(clean) < MIN_ADMIN_ID
        or len(clean) > longest
        or not ADMIN_ID_PATTERN.match(clean)
    ):
        raise ValueError(
            f"The Admin ID must have {MIN_ADMIN_ID} to {longest} "
            "characters: letters, numbers, dots, dashes and "
            "underscores only (no spaces)."
        )

    return clean


def check_password(password) -> str:
    text = str(password or "")

    if len(text) < MIN_PASSWORD:
        raise ValueError(
            f"The password must contain at least {MIN_PASSWORD} "
            "characters."
        )

    if len(text.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"The password is too long (at most {MAX_PASSWORD_BYTES} "
            "characters)."
        )

    return text


# =========================================================
# FIND
# =========================================================

def get_all_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_admin_id(db: Session, admin_id: str) -> User | None:
    return db.scalars(
        select(User).where(
            func.lower(User.username) == str(admin_id).strip().lower()
        )
    ).first()


def _find_role(db: Session, role_name) -> Role:
    """The role with this name (not case sensitive)."""

    wanted = _key(role_name)

    if not wanted:
        raise ValueError("Please choose the employee's role.")

    for role in db.scalars(select(Role)).all():
        if _key(role.name) == wanted:
            return role

    raise ValueError(
        f'The role "{_tidy(role_name)}" does not exist. Create it '
        "first under Roles & Permissions."
    )


def _other_active_administrator(
    db: Session,
    role: Role,
    exclude_user_id: int | None = None,
) -> User | None:
    """Another ACTIVE account that already holds the admin role."""

    statement = select(User).where(
        User.role_id == role.id,
        User.is_active.is_(True),
    )

    if exclude_user_id is not None:
        statement = statement.where(User.id != exclude_user_id)

    return db.scalars(statement).first()


def _refuse_second_administrator(
    db: Session,
    role: Role,
    exclude_user_id: int | None = None,
) -> None:
    other = _other_active_administrator(db, role, exclude_user_id)

    if other is not None:
        raise ValueError(
            "There can be only one Port Administrator, and "
            f'"{other.username}" already is the Port Administrator. '
            "Delete or disable that account first."
        )


# =========================================================
# NO E-MAIL ADDRESS
# =========================================================
#
# The port signs in with the Admin ID only, so an employee has no
# e-mail address. If the users table still insists on one
# (NOT NULL), that rule is switched off once, the first time an
# employee is created after the backend starts. Accounts that
# already have an e-mail keep it, but nothing uses it any more.

_email_checked = False


def _make_email_optional(db: Session) -> None:
    """Let the users table accept an account without an e-mail."""

    global _email_checked

    if _email_checked or not hasattr(User, "email"):
        return

    table = User.__tablename__

    try:
        rows = db.execute(
            sql_text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = :table AND column_name = 'email'"
            ),
            {"table": table},
        ).all()

        required = bool(rows) and str(rows[0][0]).upper() == "NO"

        if required:
            # Never wait long for the table: give up after 3 seconds.
            db.execute(sql_text("SET LOCAL lock_timeout = '3s'"))

            db.execute(
                sql_text(
                    f'ALTER TABLE "{table}" '
                    'ALTER COLUMN "email" DROP NOT NULL'
                )
            )

            db.commit()

            logger.info(
                "The e-mail column of the users table is now optional."
            )

        _email_checked = True

    except Exception as error:
        db.rollback()

        logger.warning(
            "Could not make the e-mail column optional: %s",
            _db_reason(error),
        )


# =========================================================
# CREATE
# =========================================================

def create_user(
    db: Session,
    name: str,
    admin_id: str,
    password: str,
    role_name: str,
) -> User:
    """Create an employee account."""

    full_name = clean_name(name)
    login = clean_admin_id(admin_id)
    secret = check_password(password)
    role = _find_role(db, role_name)

    if get_user_by_admin_id(db, login) is not None:
        raise ValueError(
            "This Admin ID is already assigned to another employee."
        )

    if _is_admin_role(role):
        _refuse_second_administrator(db, role)

    _make_email_optional(db)

    user = User(
        username=login,
        password_hash=hash_password(secret),
        full_name=full_name,
        role_id=role.id,
        is_active=True,
    )

    db.add(user)

    _save(db, "employee")

    db.refresh(user)

    return user


# =========================================================
# CHANGE
# =========================================================

def _change_admin_id(db: Session, user: User, login: str) -> None:
    """Give the account a new Admin ID."""

    other = get_user_by_admin_id(db, login)

    if other is not None and other.id != user.id:
        raise ValueError(
            "This Admin ID is already assigned to another employee."
        )

    user.username = login


def update_user(
    db: Session,
    user: User,
    name: str | None = None,
    admin_id: str | None = None,
    password: str | None = None,
    role_name: str | None = None,
    is_active: bool | None = None,
) -> User:
    """Change an account. Only the values that are given change."""

    new_name = clean_name(name) if name is not None else None

    new_login = (
        clean_admin_id(admin_id) if admin_id is not None else None
    )

    new_secret = check_password(password) if password else None

    new_role = (
        _find_role(db, role_name)
        if role_name is not None and _tidy(role_name)
        else None
    )

    is_admin_now = _is_admin_role(user.role)

    role_changes = new_role is not None and new_role.id != user.role_id

    becomes_active = is_active is True and not user.is_active

    stops_being_admin = is_admin_now and (
        (role_changes and not _is_admin_role(new_role))
        or is_active is False
    )

    if stops_being_admin and user.is_active:
        admin_role = user.role

        if _other_active_administrator(db, admin_role, user.id) is None:
            raise ValueError(
                "There must always be one active Port Administrator. "
                "Make another account the Port Administrator first."
            )

    if role_changes and _is_admin_role(new_role):
        _refuse_second_administrator(db, new_role, user.id)

    if becomes_active and is_admin_now and not role_changes:
        _refuse_second_administrator(db, user.role, user.id)

    if new_name is not None:
        user.full_name = new_name

    if new_login is not None and new_login != str(user.username).lower():
        _change_admin_id(db, user, new_login)

    if new_secret is not None:
        user.password_hash = hash_password(new_secret)

    if role_changes:
        user.role_id = new_role.id

    if is_active is not None:
        user.is_active = bool(is_active)

    _save(db, "employee")

    db.refresh(user)

    return user


def update_own_credentials(
    db: Session,
    user: User,
    admin_id: str | None = None,
    password: str | None = None,
) -> User:
    """The logged-in employee changes their own Admin ID / password."""

    new_login = (
        clean_admin_id(admin_id) if admin_id else None
    )

    new_secret = check_password(password) if password else None

    if new_login is None and new_secret is None:
        raise ValueError(
            "Enter a new Admin ID and/or a new password."
        )

    if new_login is not None and new_login != str(user.username).lower():
        _change_admin_id(db, user, new_login)

    if new_secret is not None:
        user.password_hash = hash_password(new_secret)

    _save(db, "account")

    db.refresh(user)

    return user


# =========================================================
# DELETE
# =========================================================

def delete_user(db: Session, user: User) -> None:
    """Delete an account (the route checks who may do this)."""

    try:
        db.delete(user)
        db.commit()

    except SQLAlchemyError as error:
        db.rollback()

        logger.warning("Employee not deleted: %s", _db_reason(error))

        raise ValueError(
            "This account cannot be deleted because other records "
            "still refer to it. Disable the account instead."
        ) from None
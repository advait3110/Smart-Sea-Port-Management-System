"""
ACCOUNT PROFILE (phone number and profile picture)

Every employee can keep a phone number and a profile picture (DP).
They are saved in their own small table, account_profile, so the
users table is not changed at all.

The name of the employee is NOT here: it stays in the users table
(full_name) and is changed through user_service.

How the picture is stored
-------------------------
The browser shrinks the chosen picture to a small square (256 x 256)
and sends it as text ("data:image/jpeg;base64,..."). This file only
checks that it really is a small JPEG, PNG or WebP picture and saves
the text. Nothing else (no SVG, no GIF, no scripts) is accepted.

The table is created automatically the first time it is needed.

Every refusal is a ValueError with a short, readable message
(the route turns it into an HTTP 400 answer).
"""

import base64
import binascii
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

# The browser sends a picture of about 20 to 60 KB. This is the
# most that is accepted (the picture itself, after decoding).
MAX_AVATAR_BYTES = 250_000

MAX_PHONE_LENGTH = 25
MIN_PHONE_DIGITS = 5
MAX_PHONE_DIGITS = 15

_PHONE_PATTERN = re.compile(r"^(?:\+|\()?[0-9][0-9 ()\-]*$")

_AVATAR_PATTERN = re.compile(
    r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$"
)

_table_ready = False


# =========================================================
# TABLE
# =========================================================

def ensure_table(db: Session) -> None:
    """Create the table the first time it is needed."""

    global _table_ready

    if _table_ready:
        return

    db.execute(
        text(
            "CREATE TABLE IF NOT EXISTS account_profile ("
            "user_id INTEGER PRIMARY KEY, "
            "phone VARCHAR(30), "
            "avatar TEXT, "
            "updated_at TIMESTAMPTZ NOT NULL)"
        )
    )

    db.commit()

    _table_ready = True


def _db_reason(error: Exception) -> str:
    message = str(getattr(error, "orig", None) or error).strip()

    return (message.splitlines() or ["unknown error"])[0][:200]


# =========================================================
# CHECKING INPUT
# =========================================================

def clean_phone(value) -> str | None:
    """
    A phone number, or None when it is empty (= remove it).
    Digits, spaces, + ( ) and - are allowed.
    """

    clean = " ".join(str(value or "").split())

    if not clean:
        return None

    digits = sum(character.isdigit() for character in clean)

    if (
        len(clean) > MAX_PHONE_LENGTH
        or not _PHONE_PATTERN.match(clean)
        or digits < MIN_PHONE_DIGITS
        or digits > MAX_PHONE_DIGITS
    ):
        raise ValueError(
            "The phone number can only have digits, spaces, + ( ) "
            f"and -, with {MIN_PHONE_DIGITS} to {MAX_PHONE_DIGITS} "
            "digits. Example: +65 6123 4567"
        )

    return clean


def _looks_like(kind: str, data: bytes) -> bool:
    """Do the first bytes belong to the picture type it claims?"""

    if kind == "png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")

    if kind == "jpeg":
        return data.startswith(b"\xff\xd8\xff")

    if kind == "webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"

    return False


def check_avatar(image) -> str:
    """
    A picture sent as "data:image/<type>;base64,<text>".
    Returns the text to store, or raises a ValueError.
    """

    value = str(image or "").strip()

    match = _AVATAR_PATTERN.match(value)

    if not match:
        raise ValueError(
            "The picture must be a JPG, PNG or WebP image."
        )

    kind, payload = match.group(1), match.group(2)

    # A rough size check first, so a huge text is never decoded.
    if len(payload) > (MAX_AVATAR_BYTES * 4) // 3 + 8:
        raise ValueError(
            "The picture is too big. Please choose a smaller one."
        )

    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError(
            "The picture could not be read. Please choose another one."
        ) from None

    if len(data) > MAX_AVATAR_BYTES:
        raise ValueError(
            "The picture is too big. Please choose a smaller one."
        )

    if not _looks_like(kind, data):
        raise ValueError(
            "The picture is not a real JPG, PNG or WebP image."
        )

    return value


# =========================================================
# READ
# =========================================================

def get_profile(db: Session, user_id: int) -> dict:
    """
    {"phone": "...", "avatar": "data:..." or None}

    If the table cannot be read, an empty profile is returned so
    the rest of the page keeps working.
    """

    try:
        ensure_table(db)

        rows = db.execute(
            text(
                "SELECT phone, avatar FROM account_profile "
                "WHERE user_id = :user_id"
            ),
            {"user_id": user_id},
        ).all()

    except Exception:
        db.rollback()

        logger.warning("The profile could not be read.", exc_info=True)

        return {"phone": "", "avatar": None}

    if not rows:
        return {"phone": "", "avatar": None}

    phone, avatar = rows[0][0], rows[0][1]

    return {
        "phone": str(phone or ""),
        "avatar": str(avatar) if avatar else None,
    }


# =========================================================
# WRITE
# =========================================================

def _upsert(
    db: Session,
    user_id: int,
    column: str,
    value,
    what: str,
) -> None:
    """Save one value (phone or avatar) and keep the other one."""

    try:
        ensure_table(db)

        db.execute(
            text(
                "INSERT INTO account_profile "
                f"(user_id, {column}, updated_at) "
                f"VALUES (:user_id, :value, :seen) "
                "ON CONFLICT (user_id) DO UPDATE "
                f"SET {column} = EXCLUDED.{column}, "
                "updated_at = EXCLUDED.updated_at"
            ),
            {
                "user_id": user_id,
                "value": value,
                "seen": datetime.now(timezone.utc),
            },
        )

        db.commit()

    except SQLAlchemyError as error:
        db.rollback()

        logger.warning("The %s was not saved.", what, exc_info=True)

        raise ValueError(
            f"The {what} could not be saved: {_db_reason(error)}"
        ) from None


def save_phone(db: Session, user_id: int, phone) -> str:
    """Save (or remove, when empty) the phone number."""

    clean = clean_phone(phone)

    _upsert(db, user_id, "phone", clean, "phone number")

    return clean or ""


def save_avatar(db: Session, user_id: int, image) -> str:
    """Save the profile picture."""

    clean = check_avatar(image)

    _upsert(db, user_id, "avatar", clean, "profile picture")

    return clean


def remove_avatar(db: Session, user_id: int) -> None:
    """Remove the profile picture (the phone number stays)."""

    try:
        ensure_table(db)

        db.execute(
            text(
                "UPDATE account_profile SET avatar = NULL "
                "WHERE user_id = :user_id"
            ),
            {"user_id": user_id},
        )

        db.commit()

    except SQLAlchemyError as error:
        db.rollback()

        logger.warning(
            "The profile picture was not removed.", exc_info=True
        )

        raise ValueError(
            "The profile picture could not be removed: "
            f"{_db_reason(error)}"
        ) from None


def forget(db: Session, user_id: int) -> None:
    """Remove everything saved for an account (it was deleted)."""

    try:
        ensure_table(db)

        db.execute(
            text(
                "DELETE FROM account_profile WHERE user_id = :user_id"
            ),
            {"user_id": user_id},
        )

        db.commit()

    except Exception:
        db.rollback()

        logger.warning("The profile was not cleared.", exc_info=True)
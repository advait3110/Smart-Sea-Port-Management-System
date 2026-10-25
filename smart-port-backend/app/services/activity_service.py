"""
ACCOUNT ACTIVITY (who is Online right now)

An account is ONLINE when the browser of that employee has asked the
server for something in the last ONLINE_SECONDS seconds. The port
screens ask the server all the time (the bell, the lists), so every
open, logged-in tab keeps its account Online. When the employee logs
out or closes the browser, the account turns Offline by itself.

How it works
------------
* app/api/dependencies.py calls record_request() for every request
  that has a valid login.
* The time of the last request is saved in the table
  account_activity (created the first time it is needed).
* The database is written at most once every WRITE_EVERY_SECONDS
  per account, so this costs almost nothing.
* A request to /presence/logout (sent when somebody logs out) makes
  the account Offline at once.
* GET /users/online (Port Administrator only) returns the ids of the
  accounts that are Online. It is used by User & Role Management.

Nothing here can break a request: every problem is only logged.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

# An account is Online when it was seen this recently.
ONLINE_SECONDS = 90

# The database is written at most this often per account.
WRITE_EVERY_SECONDS = 10

LOGOUT_PATHS = ("/presence/logout",)


_lock = threading.Lock()
_written: dict[int, float] = {}
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
            "CREATE TABLE IF NOT EXISTS account_activity ("
            "user_id INTEGER PRIMARY KEY, "
            "last_seen_at TIMESTAMPTZ NOT NULL)"
        )
    )

    db.commit()

    _table_ready = True


# =========================================================
# WRITE
# =========================================================

def touch(user_id: int) -> None:
    """Remember that this account is being used right now."""

    try:
        now = time.monotonic()

        with _lock:
            last = _written.get(user_id)

            if last is not None and now - last < WRITE_EVERY_SECONDS:
                return

            _written[user_id] = now

        session = SessionLocal()

        try:
            ensure_table(session)

            session.execute(
                text(
                    "INSERT INTO account_activity (user_id, last_seen_at) "
                    "VALUES (:user_id, :seen) "
                    "ON CONFLICT (user_id) DO UPDATE "
                    "SET last_seen_at = EXCLUDED.last_seen_at"
                ),
                {
                    "user_id": user_id,
                    "seen": datetime.now(timezone.utc),
                },
            )

            session.commit()

        finally:
            session.close()

    except Exception:
        with _lock:
            _written.pop(user_id, None)

        logger.warning("Account activity was not saved.", exc_info=True)


def forget(db: Session, user_id: int) -> None:
    """Make an account Offline now (logout) or remove its row."""

    with _lock:
        _written.pop(user_id, None)

    try:
        ensure_table(db)

        db.execute(
            text("DELETE FROM account_activity WHERE user_id = :user_id"),
            {"user_id": user_id},
        )

        db.commit()

    except Exception:
        db.rollback()

        logger.warning("Account activity was not cleared.", exc_info=True)


def record_request(user_id: int, path: str) -> None:
    """
    Called for every request with a valid login.
    A logout request makes the account Offline, any other
    request makes it Online.
    """

    try:
        clean = str(path or "").rstrip("/")

        if clean.endswith(LOGOUT_PATHS):
            with _lock:
                _written.pop(user_id, None)

            session = SessionLocal()

            try:
                forget(session, user_id)
            finally:
                session.close()

            return

        touch(user_id)

    except Exception:
        logger.warning("Account activity was not recorded.", exc_info=True)


# =========================================================
# READ
# =========================================================

def online_user_ids(db: Session) -> list[int]:
    """The ids of the accounts that are Online right now."""

    try:
        ensure_table(db)

        since = datetime.now(timezone.utc) - timedelta(
            seconds=ONLINE_SECONDS
        )

        rows = db.execute(
            text(
                "SELECT user_id FROM account_activity "
                "WHERE last_seen_at >= :since ORDER BY user_id"
            ),
            {"since": since},
        ).all()

        return [int(row[0]) for row in rows]

    except Exception:
        db.rollback()

        logger.warning("Online accounts could not be read.", exc_info=True)

        return []
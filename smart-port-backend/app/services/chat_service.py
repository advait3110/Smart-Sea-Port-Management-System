"""
Port Communication (chat) - database tables and business logic.

What this file does
-------------------
- Creates its own tables the first time they are needed
  (no Alembic migration is required).
- One-to-one chats between port accounts, plus one channel
  ("All Port Staff") that every chat user joins automatically.
- Messages with optional documents (stored in PostgreSQL).
- Unread counters per account: a message counts as unread for
  an account until THAT account opens the conversation and the
  browser reports it as read.
- Online / last seen, based on the requests the browser sends
  while the person has the port system open.
- Delete chat (for ME only, the other person keeps everything) and
  restore it later. Chats whose newest message is older than 6
  months are moved out of the list automatically when the person
  logs in ("archived"). Nothing is ever removed from the database:
  a deleted or archived chat is only hidden for that account, and
  one click on "Restore" brings the whole history back.
- Delete one message: "for me" (hidden for that account only) or
  "for everyone" (only the sender can do it; the message turns into
  "This message was deleted" for both sides and its text and
  document are never sent to anybody again). "Delete all chats"
  hides every chat for the account at once (restorable too).

Who may chat
------------
Only active accounts whose role has the "port_communication"
feature. The feature check for the endpoints themselves is done
in app/main.py (module_guard).

Everything here uses plain SQL on tables that start with
"chat_" or "port_notifications". The only existing tables it
reads are the users / roles / permissions of the RBAC system,
through the normal User model.
"""

from __future__ import annotations

import base64
import binascii
import logging
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.user import User


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

FEATURE_KEY = "port_communication"

MAX_FILE_BYTES = 5 * 1024 * 1024

MAX_TEXT_LENGTH = 4000

# A person counts as "online" when the browser has contacted
# the server within this many seconds.
ONLINE_SECONDS = 30

# Presence is written at most this often per person.
PRESENCE_WRITE_SECONDS = 10

# Name list (users + roles + features) is kept in memory only
# for a moment, so a new account or a role change made in User /
# Role management shows up in Port Communication within seconds.
DIRECTORY_SECONDS = 3

# A chat whose newest message is older than this (about 6 months)
# is moved to "Deleted & archived chats" when the person logs in.
ARCHIVE_AFTER_DAYS = 183

# The check for old chats runs when the chat list is loaded and
# then at most this often per person (so it runs right after a login).
ARCHIVE_CHECK_SECONDS = 600

# Shown instead of a message that was deleted for everyone.
DELETED_TEXT = "This message was deleted"

# When the browser asks "which messages were deleted since ...?" the
# answer reaches this many seconds further back, so two deletions at
# almost the same moment can never be missed.
DELETED_SYNC_SLACK_SECONDS = 15

CHANNEL_KEY = "channel:all-port-staff"

CHANNEL_NAME = "All Port Staff"

CHANNEL_SUBTITLE = "Everyone on the port team"

# The paper-clip button only allows these file types.
MIME_BY_EXTENSION = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
    "xls": "application/vnd.ms-excel",
    "xlsx": (
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet"
    ),
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": (
        "application/vnd.openxmlformats-officedocument."
        "presentationml.presentation"
    ),
    "txt": "text/plain",
    "csv": "text/csv",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "zip": "application/zip",
}

# Paper-clip emoji written as an escape so this file stays plain ASCII.
CLIP = "\U0001F4CE"


# =========================================================
# TABLES
# =========================================================

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS chat_conversations (
        id SERIAL PRIMARY KEY,
        kind VARCHAR(10) NOT NULL,
        name VARCHAR(120),
        conv_key VARCHAR(60) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_participants (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL
            REFERENCES chat_conversations (id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL
            REFERENCES users (id) ON DELETE CASCADE,
        last_read_message_id INTEGER NOT NULL DEFAULT 0,
        joined_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_chat_participant UNIQUE (conversation_id, user_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_chat_participants_user
        ON chat_participants (user_id)
    """,
    # Delete / archive (per account). Messages with an id up to
    # "cleared_upto" are hidden for this account only. "Restore"
    # sets it back to 0. Added with ALTER so that tables created
    # by an older version of this file are upgraded too.
    """
    ALTER TABLE chat_participants
        ADD COLUMN IF NOT EXISTS cleared_upto INTEGER NOT NULL DEFAULT 0
    """,
    """
    ALTER TABLE chat_participants
        ADD COLUMN IF NOT EXISTS cleared_reason VARCHAR(10)
    """,
    """
    ALTER TABLE chat_participants
        ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ
    """,
    """
    ALTER TABLE chat_participants
        ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_attachments (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(120) NOT NULL,
        size_bytes INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL
            REFERENCES chat_conversations (id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        attachment_id INTEGER
            REFERENCES chat_attachments (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation
        ON chat_messages (conversation_id, id)
    """,
    # Delete one message. "deleted_for_all" turns the message into
    # "This message was deleted" for everybody. "Delete for me" is a
    # row in chat_message_hidden (only that account stops seeing it).
    """
    ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE
    """,
    """
    ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_message_hidden (
        message_id INTEGER NOT NULL
            REFERENCES chat_messages (id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL
            REFERENCES users (id) ON DELETE CASCADE,
        hidden_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (message_id, user_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_chat_message_hidden_user
        ON chat_message_hidden (user_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_user_status (
        user_id INTEGER PRIMARY KEY
            REFERENCES users (id) ON DELETE CASCADE,
        last_seen_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS port_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL
            REFERENCES users (id) ON DELETE CASCADE,
        notif_type VARCHAR(10) NOT NULL DEFAULT 'info',
        category VARCHAR(40) NOT NULL DEFAULT 'General',
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        dedupe_key VARCHAR(120),
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_port_notification_key UNIQUE (user_id, dedupe_key)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_notifications_user
        ON port_notifications (user_id, id)
    """,
]

_tables_ready = False
_tables_lock = threading.Lock()


def ensure_tables(db: Session) -> None:
    """
    Create the chat and notification tables if they do not
    exist yet. Safe to call on every request: after the first
    successful call it does nothing.
    """

    global _tables_ready

    if _tables_ready:
        return

    with _tables_lock:

        if _tables_ready:
            return

        try:

            for statement in SCHEMA_STATEMENTS:
                db.execute(text(statement))

            db.commit()

        except Exception as exc:

            db.rollback()

            logger.exception("Chat tables could not be created.")

            raise HTTPException(
                status_code=500,
                detail=(
                    "The chat tables could not be created "
                    f"({type(exc).__name__}). "
                    "Check the backend terminal for details."
                ),
            ) from exc

        _tables_ready = True


# =========================================================
# SMALL HELPERS
# =========================================================


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_datetime(value: Any) -> datetime | None:
    """Read a database time (datetime or text) as an aware datetime."""

    if value is None:
        return None

    if isinstance(value, str):

        text_value = value.strip().replace("Z", "+00:00")

        try:
            value = datetime.fromisoformat(text_value)
        except ValueError:
            return None

    if not isinstance(value, datetime):
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value


def iso(value: Any) -> str | None:
    """A database time as ISO text with its time zone."""

    moment = to_datetime(value)

    return moment.isoformat() if moment is not None else None


def run_rows(
    db: Session,
    sql: str,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Run a SELECT and return the rows as plain dictionaries."""

    result = db.execute(text(sql), params or {})

    return [dict(row) for row in result.mappings().all()]


def run_scalar(
    db: Session,
    sql: str,
    params: dict[str, Any] | None = None,
) -> Any:
    """Run a SELECT and return the first value of the first row."""

    return db.execute(text(sql), params or {}).scalar()


def not_hidden(alias: str, user_param: str = ":me") -> str:
    """
    SQL condition: the message `alias` was not deleted "for me" by the
    account in `user_param`. Only fixed names are ever put in here.
    """

    return (
        "NOT EXISTS (SELECT 1 FROM chat_message_hidden h "
        f"WHERE h.message_id = {alias}.id AND h.user_id = {user_param})"
    )


# =========================================================
# DIRECTORY (names, roles, features of every account)
# =========================================================

_directory_cache: dict[str, Any] = {"at": None, "rows": []}
_directory_lock = threading.Lock()


def _load_directory_rows(db: Session) -> list[dict[str, Any]]:
    """Read every account with its role and feature keys."""

    rows: list[dict[str, Any]] = []

    for user in db.scalars(select(User)).all():

        role = user.role

        permissions = (
            (role.permissions or []) if role is not None else []
        )

        rows.append(
            {
                "id": user.id,
                "name": (
                    user.full_name
                    or user.username
                    or f"User {user.id}"
                ),
                "role": role.name if role is not None else "",
                "active": bool(user.is_active),
                "features": frozenset(
                    permission.key for permission in permissions
                ),
                "created_at": getattr(user, "created_at", None),
            }
        )

    return rows


def get_directory(db: Session) -> list[dict[str, Any]]:
    """
    Every account (active or not). Kept in memory for a few
    seconds so that frequent screen refreshes stay cheap.
    """

    now = time.monotonic()

    with _directory_lock:

        cached_at = _directory_cache["at"]

        if (
            cached_at is not None
            and now - cached_at < DIRECTORY_SECONDS
            and _directory_cache["rows"]
        ):
            return _directory_cache["rows"]

    rows = _load_directory_rows(db)

    with _directory_lock:

        _directory_cache["rows"] = rows
        _directory_cache["at"] = time.monotonic()

    return rows


def display_name(by_id: dict[int, dict[str, Any]], user_id: Any) -> str:
    person = by_id.get(user_id)

    return person["name"] if person else "Former employee"


def can_chat(person: dict[str, Any] | None) -> bool:
    return bool(
        person
        and person["active"]
        and FEATURE_KEY in person["features"]
    )


# =========================================================
# PRESENCE (online / last seen)
# =========================================================

_presence_written: dict[int, float] = {}
_presence_lock = threading.Lock()


def touch_presence(db: Session, user_id: int) -> None:
    """
    Remember that this account is using the port system now.
    Never raises: a presence problem must not break a request.
    """

    now_monotonic = time.monotonic()

    with _presence_lock:

        previous = _presence_written.get(user_id)

        if (
            previous is not None
            and now_monotonic - previous < PRESENCE_WRITE_SECONDS
        ):
            return

        _presence_written[user_id] = now_monotonic

    try:

        params = {"u": user_id, "t": utc_now()}

        updated = db.execute(
            text(
                "UPDATE chat_user_status SET last_seen_at = :t "
                "WHERE user_id = :u"
            ),
            params,
        )

        if updated.rowcount == 0:
            db.execute(
                text(
                    "INSERT INTO chat_user_status "
                    "(user_id, last_seen_at) VALUES (:u, :t)"
                ),
                params,
            )

        db.commit()

    except Exception:

        db.rollback()

        with _presence_lock:
            _presence_written.pop(user_id, None)

        logger.warning("Presence could not be saved.", exc_info=True)


def presence_map(db: Session) -> dict[int, datetime]:
    rows = run_rows(
        db,
        "SELECT user_id, last_seen_at FROM chat_user_status",
    )

    result: dict[int, datetime] = {}

    for row in rows:

        moment = to_datetime(row["last_seen_at"])

        if moment is not None:
            result[row["user_id"]] = moment

    return result


# =========================================================
# CHANNEL
# =========================================================

_channel_id: int | None = None
_members_checked: set[int] = set()
_channel_lock = threading.Lock()


def _find_conversation(db: Session, key: str) -> int | None:
    return run_scalar(
        db,
        "SELECT id FROM chat_conversations WHERE conv_key = :k",
        {"k": key},
    )


def _get_or_create_channel(db: Session) -> int:

    global _channel_id

    if _channel_id is not None:
        return _channel_id

    with _channel_lock:

        channel = _find_conversation(db, CHANNEL_KEY)

        if channel is None:

            try:

                channel = db.execute(
                    text(
                        "INSERT INTO chat_conversations "
                        "(kind, name, conv_key, created_at) "
                        "VALUES ('channel', :n, :k, :t) "
                        "RETURNING id"
                    ),
                    {
                        "n": CHANNEL_NAME,
                        "k": CHANNEL_KEY,
                        "t": utc_now(),
                    },
                ).scalar()

                db.commit()

            except Exception:

                # Another request created it at the same moment.
                db.rollback()

                channel = _find_conversation(db, CHANNEL_KEY)

                if channel is None:
                    raise

        _channel_id = int(channel)

    return _channel_id


def ensure_channel_membership(db: Session, user_id: int) -> None:
    """
    Put the account into the "All Port Staff" channel. Old
    messages from before the account joined do not count as
    unread.
    """

    if user_id in _members_checked:
        return

    channel_id = _get_or_create_channel(db)

    already = run_scalar(
        db,
        "SELECT COUNT(*) FROM chat_participants "
        "WHERE conversation_id = :c AND user_id = :u",
        {"c": channel_id, "u": user_id},
    )

    if not already:

        newest = run_scalar(
            db,
            "SELECT COALESCE(MAX(id), 0) FROM chat_messages "
            "WHERE conversation_id = :c",
            {"c": channel_id},
        )

        try:

            db.execute(
                text(
                    "INSERT INTO chat_participants "
                    "(conversation_id, user_id, "
                    "last_read_message_id, joined_at) "
                    "VALUES (:c, :u, :r, :t)"
                ),
                {
                    "c": channel_id,
                    "u": user_id,
                    "r": int(newest or 0),
                    "t": utc_now(),
                },
            )

            db.commit()

        except Exception:

            # Joined by another request at the same moment.
            db.rollback()

    _members_checked.add(user_id)


_synced_members: set[int] = set()


def sync_channel_members(db: Session) -> None:
    """
    Keep the "All Port Staff" channel in step with the accounts
    and roles (RBAC): every active account whose role has the
    Port Communication feature is a member.

    An account added later joins automatically. Old messages from
    before it joined do not count as unread for it. Never raises:
    this must not break a request.
    """

    try:

        eligible = {
            person["id"]
            for person in get_directory(db)
            if can_chat(person)
        }

        if eligible <= _synced_members:
            return

        channel_id = _get_or_create_channel(db)

        existing = {
            int(row["user_id"])
            for row in run_rows(
                db,
                "SELECT user_id FROM chat_participants "
                "WHERE conversation_id = :c",
                {"c": channel_id},
            )
        }

        done = set(existing & eligible)

        missing = sorted(eligible - existing)

        if missing:

            newest = int(
                run_scalar(
                    db,
                    "SELECT COALESCE(MAX(id), 0) FROM chat_messages "
                    "WHERE conversation_id = :c",
                    {"c": channel_id},
                )
                or 0
            )

            for user_id in missing:

                try:

                    db.execute(
                        text(
                            "INSERT INTO chat_participants "
                            "(conversation_id, user_id, "
                            "last_read_message_id, joined_at) "
                            "VALUES (:c, :u, :r, :t)"
                        ),
                        {
                            "c": channel_id,
                            "u": user_id,
                            "r": newest,
                            "t": utc_now(),
                        },
                    )

                    db.commit()

                    done.add(user_id)

                except Exception:

                    # Joined by another request at the same moment.
                    db.rollback()

        _synced_members.update(done)

    except Exception:

        try:
            db.rollback()
        except Exception:
            pass

        logger.warning(
            "The channel members could not be updated.",
            exc_info=True,
        )


# =========================================================
# CONVERSATION STATE
# =========================================================


def conversation_state(db: Session, me: int) -> dict[str, Any]:
    """
    Everything needed to show the conversation list and the
    unread counters of one account.
    """

    params = {"me": me}

    mine = run_rows(
        db,
        """
        SELECT c.id AS id, c.kind AS kind, c.name AS name,
               p.last_read_message_id AS my_read,
               p.cleared_upto AS cleared_upto,
               p.cleared_reason AS cleared_reason,
               p.cleared_at AS cleared_at,
               p.restored_at AS restored_at
        FROM chat_participants p
        JOIN chat_conversations c ON c.id = p.conversation_id
        WHERE p.user_id = :me
        """,
        params,
    )

    peer_rows = run_rows(
        db,
        """
        SELECT p2.conversation_id AS conversation_id,
               p2.user_id AS peer_id,
               p2.last_read_message_id AS peer_read
        FROM chat_participants p1
        JOIN chat_conversations c
          ON c.id = p1.conversation_id AND c.kind = 'direct'
        JOIN chat_participants p2
          ON p2.conversation_id = p1.conversation_id
         AND p2.user_id <> p1.user_id
        WHERE p1.user_id = :me
        """,
        params,
    )

    # The newest message the account can still see: not hidden by
    # "delete chat", not deleted "for me". A message deleted for
    # everyone still counts (it is shown as "This message was deleted").
    last_rows = run_rows(
        db,
        f"""
        SELECT m.id AS id, m.conversation_id AS conversation_id,
               m.sender_id AS sender_id, m.body AS body,
               m.created_at AS created_at,
               m.deleted_for_all AS deleted_for_all,
               a.file_name AS attachment_name
        FROM chat_messages m
        LEFT JOIN chat_attachments a ON a.id = m.attachment_id
        WHERE m.id IN (
            SELECT MAX(m2.id)
            FROM chat_messages m2
            JOIN chat_participants p
              ON p.conversation_id = m2.conversation_id
             AND p.user_id = :me
            WHERE m2.id > p.cleared_upto
              AND {not_hidden('m2')}
            GROUP BY m2.conversation_id
        )
        """,
        params,
    )

    # The text and the document of a message deleted for everyone are
    # never passed on (the bell uses this text too).
    for row in last_rows:

        if row.get("deleted_for_all"):

            row["body"] = DELETED_TEXT
            row["attachment_name"] = None

    unread_rows = run_rows(
        db,
        f"""
        SELECT m.conversation_id AS conversation_id, COUNT(*) AS n
        FROM chat_messages m
        JOIN chat_participants p
          ON p.conversation_id = m.conversation_id
         AND p.user_id = :me
        WHERE m.sender_id <> :me
          AND m.id > p.last_read_message_id
          AND m.id > p.cleared_upto
          AND m.deleted_for_all = FALSE
          AND {not_hidden('m')}
        GROUP BY m.conversation_id
        """,
        params,
    )

    return {
        "mine": mine,
        "peers": {
            row["conversation_id"]: row for row in peer_rows
        },
        "last": {
            row["conversation_id"]: row for row in last_rows
        },
        "unread": {
            row["conversation_id"]: int(row["n"])
            for row in unread_rows
        },
    }


def last_message_payload(
    row: dict[str, Any] | None,
    me: int,
    by_id: dict[int, dict[str, Any]],
) -> dict[str, Any] | None:

    if row is None:
        return None

    deleted = bool(row.get("deleted_for_all"))

    return {
        "id": row["id"],
        "mine": row["sender_id"] == me,
        "sender_name": display_name(by_id, row["sender_id"]),
        "text": "" if deleted else (row["body"] or ""),
        "attachment_name": (
            "" if deleted else (row["attachment_name"] or "")
        ),
        "created_at": iso(row["created_at"]),
        "deleted": deleted,
    }


# =========================================================
# CONVERSATION LIST
# =========================================================


def list_conversations(db: Session, me: int) -> list[dict[str, Any]]:
    """
    The "Messages" list of one account:

    - the channel(s) the account belongs to
    - every one-to-one chat already started
    - every other chat-enabled colleague who has not been
      written to yet (id is null until the first message)
    """

    touch_presence(db, me)

    ensure_channel_membership(db, me)

    sync_channel_members(db)

    # Right after a login: chats older than 6 months are archived.
    archive_old_chats_if_due(db, me)

    directory = get_directory(db)

    by_id = {person["id"]: person for person in directory}

    state = conversation_state(db, me)

    seen = presence_map(db)

    now = utc_now()

    # The channel belongs to every active account whose role has
    # the Port Communication feature (RBAC), so the number follows
    # the real accounts and permissions.
    channel_members = sum(
        1 for person in directory if can_chat(person)
    )

    def online_info(user_id: int) -> tuple[bool, str | None]:

        moment = seen.get(user_id)

        if moment is None:
            return False, None

        online = (now - moment).total_seconds() <= ONLINE_SECONDS

        return online, moment.isoformat()

    entries: list[dict[str, Any]] = []

    started_with: set[int] = set()

    for conversation in state["mine"]:

        conversation_id = conversation["id"]

        last = last_message_payload(
            state["last"].get(conversation_id), me, by_id
        )

        unread = state["unread"].get(conversation_id, 0)

        if conversation["kind"] == "channel":

            entries.append(
                {
                    "id": conversation_id,
                    "type": "channel",
                    "name": conversation["name"] or CHANNEL_NAME,
                    "subtitle": CHANNEL_SUBTITLE,
                    "role": "",
                    "participant_id": None,
                    "online": False,
                    "last_seen": None,
                    "member_count": channel_members,
                    "last_message": last,
                    "unread_count": unread,
                    "my_last_read_id": conversation["my_read"],
                    "peer_last_read_id": None,
                }
            )

            continue

        peer = state["peers"].get(conversation_id)

        if peer is None:
            continue

        person = by_id.get(peer["peer_id"])

        # A colleague who was deactivated (or lost the feature)
        # disappears from the list.
        if not can_chat(person):
            continue

        started_with.add(peer["peer_id"])

        online, last_seen = online_info(peer["peer_id"])

        entries.append(
            {
                "id": conversation_id,
                "type": "direct",
                "name": person["name"],
                "subtitle": person["role"],
                "role": person["role"],
                "participant_id": peer["peer_id"],
                "online": online,
                "last_seen": last_seen,
                "member_count": 0,
                "last_message": last,
                "unread_count": unread,
                "my_last_read_id": conversation["my_read"],
                "peer_last_read_id": peer["peer_read"],
            }
        )

    for person in directory:

        if (
            person["id"] == me
            or not can_chat(person)
            or person["id"] in started_with
        ):
            continue

        online, last_seen = online_info(person["id"])

        entries.append(
            {
                "id": None,
                "type": "direct",
                "name": person["name"],
                "subtitle": person["role"],
                "role": person["role"],
                "participant_id": person["id"],
                "online": online,
                "last_seen": last_seen,
                "member_count": 0,
                "last_message": None,
                "unread_count": 0,
                "my_last_read_id": 0,
                "peer_last_read_id": 0,
            }
        )

    return entries


# =========================================================
# START A ONE-TO-ONE CHAT
# =========================================================


def get_or_create_direct(
    db: Session,
    me: int,
    other_id: int,
) -> dict[str, Any]:

    if other_id == me:
        raise HTTPException(
            status_code=400,
            detail="You cannot start a chat with yourself.",
        )

    by_id = {
        person["id"]: person for person in get_directory(db)
    }

    if not can_chat(by_id.get(other_id)):
        raise HTTPException(
            status_code=404,
            detail="That colleague is not available for chat.",
        )

    key = f"direct:{min(me, other_id)}:{max(me, other_id)}"

    conversation_id = _find_conversation(db, key)

    if conversation_id is None:

        try:

            conversation_id = db.execute(
                text(
                    "INSERT INTO chat_conversations "
                    "(kind, name, conv_key, created_at) "
                    "VALUES ('direct', NULL, :k, :t) "
                    "RETURNING id"
                ),
                {"k": key, "t": utc_now()},
            ).scalar()

            for user_id in (me, other_id):

                db.execute(
                    text(
                        "INSERT INTO chat_participants "
                        "(conversation_id, user_id, "
                        "last_read_message_id, joined_at) "
                        "VALUES (:c, :u, 0, :t)"
                    ),
                    {
                        "c": conversation_id,
                        "u": user_id,
                        "t": utc_now(),
                    },
                )

            db.commit()

        except Exception:

            # The other person started the chat at the same moment.
            db.rollback()

            conversation_id = _find_conversation(db, key)

            if conversation_id is None:
                raise

    for entry in list_conversations(db, me):

        if entry["id"] == conversation_id:
            return entry

    raise HTTPException(
        status_code=404,
        detail="The conversation could not be opened.",
    )


# =========================================================
# MESSAGES
# =========================================================


def _require_participant(
    db: Session,
    conversation_id: int,
    me: int,
) -> dict[str, Any]:

    rows = run_rows(
        db,
        "SELECT last_read_message_id AS my_read, "
        "cleared_upto AS cleared_upto "
        "FROM chat_participants "
        "WHERE conversation_id = :c AND user_id = :u",
        {"c": conversation_id, "u": me},
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return rows[0]


_MESSAGE_COLUMNS = """
        SELECT m.id AS id, m.conversation_id AS conversation_id,
               m.sender_id AS sender_id, m.body AS body,
               m.created_at AS created_at,
               m.attachment_id AS attachment_id,
               m.deleted_for_all AS deleted_for_all,
               m.deleted_at AS deleted_at,
               a.file_name AS file_name, a.mime_type AS mime_type,
               a.size_bytes AS size_bytes
        FROM chat_messages m
        LEFT JOIN chat_attachments a ON a.id = m.attachment_id
"""


def list_messages(
    db: Session,
    me: int,
    conversation_id: int,
    after_id: int = 0,
    deleted_since: str = "",
) -> list[dict[str, Any]]:
    """
    The newest 200 messages (or everything after `after_id`,
    which the browser uses to fetch only what is new). Messages
    this account has deleted (or archived) are not included until
    the chat is restored, and messages deleted "for me" never come
    back.

    A message deleted for everyone is sent as an empty message with
    "deleted": true (its text and document are never sent).

    When the browser asks only for what is new it also passes
    `deleted_since` (the newest deletion time it already knows), so
    messages that were deleted for everyone in the meantime arrive
    too and the screen can change them to "This message was deleted".
    """

    participant = _require_participant(db, conversation_id, me)

    touch_presence(db, me)

    after_id = max(int(after_id or 0), 0)

    limit = 500 if after_id else 200

    cleared = int(participant["cleared_upto"] or 0)

    # Never return anything at or below the "deleted" line.
    floor = max(after_id, cleared)

    rows = run_rows(
        db,
        _MESSAGE_COLUMNS
        + f"""
        WHERE m.conversation_id = :c AND m.id > :after
          AND {not_hidden('m')}
        ORDER BY m.id DESC
        LIMIT :limit
        """,
        {"c": conversation_id, "after": floor, "limit": limit, "me": me},
    )

    rows.reverse()

    if after_id > 0:

        since = to_datetime(deleted_since) or datetime(
            1970, 1, 1, tzinfo=timezone.utc
        )

        since = since - timedelta(seconds=DELETED_SYNC_SLACK_SECONDS)

        # Older messages (the browser already has them) that were
        # deleted for everyone after the browser last looked.
        changed = run_rows(
            db,
            _MESSAGE_COLUMNS
            + f"""
            WHERE m.conversation_id = :c
              AND m.id > :cleared AND m.id <= :after
              AND m.deleted_for_all = TRUE
              AND m.deleted_at > :since
              AND {not_hidden('m')}
            ORDER BY m.id
            LIMIT 200
            """,
            {
                "c": conversation_id,
                "cleared": cleared,
                "after": after_id,
                "since": since,
                "me": me,
            },
        )

        rows = changed + rows

    by_id = {
        person["id"]: person for person in get_directory(db)
    }

    messages = []

    for row in rows:

        deleted = bool(row["deleted_for_all"])

        attachment = None

        if row["attachment_id"] is not None and not deleted:

            attachment = {
                "id": row["attachment_id"],
                "name": row["file_name"] or "document",
                "mime": row["mime_type"] or "",
                "size": int(row["size_bytes"] or 0),
            }

        messages.append(
            {
                "id": row["id"],
                "conversation_id": row["conversation_id"],
                "sender_id": row["sender_id"],
                "sender_name": display_name(by_id, row["sender_id"]),
                "mine": row["sender_id"] == me,
                "text": "" if deleted else (row["body"] or ""),
                "created_at": iso(row["created_at"]),
                "attachment": attachment,
                "deleted": deleted,
                "deleted_at": iso(row["deleted_at"]) if deleted else None,
            }
        )

    return messages


def _clean_file_name(raw_name: Any) -> str:

    name = re.split(r"[\\/]", str(raw_name or ""))[-1]

    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()

    if len(name) > 200:

        extension = name.rsplit(".", 1)[-1] if "." in name else ""

        name = name[:190] + ("." + extension if extension else "")

    return name or "document"


def prepare_attachment(attachment: Any) -> tuple[str, str, bytes]:
    """
    Check an uploaded document and return (name, type, bytes).
    The file type is taken from the extension, never from what
    the browser claims.
    """

    name = _clean_file_name(attachment.name)

    extension = (
        name.rsplit(".", 1)[-1].lower() if "." in name else ""
    )

    if extension not in MIME_BY_EXTENSION:
        raise HTTPException(
            status_code=400,
            detail=(
                "This file type cannot be shared. Allowed: PDF, "
                "Word, Excel, PowerPoint, text, CSV, images and ZIP."
            ),
        )

    encoded = re.sub(r"\s+", "", attachment.data_base64 or "")

    if len(encoded) > (MAX_FILE_BYTES * 4) // 3 + 16:
        raise HTTPException(
            status_code=413,
            detail="The document is larger than 5 MB.",
        )

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=400,
            detail="The document data is not valid.",
        ) from None

    if len(raw) == 0:
        raise HTTPException(
            status_code=400,
            detail="The document is empty.",
        )

    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="The document is larger than 5 MB.",
        )

    return name, MIME_BY_EXTENSION[extension], raw


def send_message(
    db: Session,
    me: int,
    conversation_id: int,
    body: str,
    attachment: Any = None,
) -> dict[str, Any]:

    _require_participant(db, conversation_id, me)

    body = (body or "").strip()

    if len(body) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A message can have at most {MAX_TEXT_LENGTH} "
                "characters."
            ),
        )

    if not body and attachment is None:
        raise HTTPException(
            status_code=400,
            detail="Write a message or attach a document.",
        )

    prepared = (
        prepare_attachment(attachment)
        if attachment is not None
        else None
    )

    # Before a channel message is saved, every account that has
    # joined through RBAC since the last message becomes a member,
    # so the new message counts as unread for it.
    if conversation_id == _get_or_create_channel(db):
        sync_channel_members(db)

    now = utc_now()

    attachment_id = None

    try:

        if prepared is not None:

            name, mime, raw = prepared

            attachment_id = db.execute(
                text(
                    "INSERT INTO chat_attachments "
                    "(file_name, mime_type, size_bytes, data, "
                    "created_at) "
                    "VALUES (:n, :m, :s, :d, :t) RETURNING id"
                ),
                {
                    "n": name,
                    "m": mime,
                    "s": len(raw),
                    "d": raw,
                    "t": now,
                },
            ).scalar()

        message_id = db.execute(
            text(
                "INSERT INTO chat_messages "
                "(conversation_id, sender_id, body, "
                "attachment_id, created_at) "
                "VALUES (:c, :s, :b, :a, :t) RETURNING id"
            ),
            {
                "c": conversation_id,
                "s": me,
                "b": body,
                "a": attachment_id,
                "t": now,
            },
        ).scalar()

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("A chat message could not be saved.")

        raise HTTPException(
            status_code=500,
            detail=(
                "The message could not be saved "
                f"({type(exc).__name__})."
            ),
        ) from exc

    touch_presence(db, me)

    by_id = {
        person["id"]: person for person in get_directory(db)
    }

    return {
        "id": message_id,
        "conversation_id": conversation_id,
        "sender_id": me,
        "sender_name": display_name(by_id, me),
        "mine": True,
        "text": body,
        "created_at": iso(now),
        "deleted": False,
        "deleted_at": None,
        "attachment": (
            {
                "id": attachment_id,
                "name": prepared[0],
                "mime": prepared[1],
                "size": len(prepared[2]),
            }
            if prepared is not None
            else None
        ),
    }


def mark_read(
    db: Session,
    me: int,
    conversation_id: int,
    last_message_id: int,
) -> dict[str, Any]:
    """
    The browser reports that the messages up to `last_message_id`
    are on this account's screen. The pointer only moves forward
    and never past the newest message of the conversation.
    """

    participant = _require_participant(db, conversation_id, me)

    newest = run_scalar(
        db,
        "SELECT COALESCE(MAX(id), 0) FROM chat_messages "
        "WHERE conversation_id = :c",
        {"c": conversation_id},
    )

    value = min(max(int(last_message_id), 0), int(newest or 0))

    current = int(participant["my_read"] or 0)

    if value > current:

        db.execute(
            text(
                "UPDATE chat_participants "
                "SET last_read_message_id = :v "
                "WHERE conversation_id = :c AND user_id = :u "
                "AND last_read_message_id < :v"
            ),
            {"v": value, "c": conversation_id, "u": me},
        )

        db.commit()

        current = value

    touch_presence(db, me)

    return {"ok": True, "last_message_id": current}


# =========================================================
# DELETE, ARCHIVE AND RESTORE (for one account)
# =========================================================
#
# "Delete chat" and the 6-month archive remove NOTHING from the
# database. They only hide the messages up to now for ONE account
# (chat_participants.cleared_upto). The other person keeps the chat.
# Messages that arrive later show up normally, and "Restore"
# brings the hidden messages back.
#

_archive_checked: dict[int, float] = {}
_archive_lock = threading.Lock()


def _newest_message_id(db: Session, conversation_id: int) -> int:

    return int(
        run_scalar(
            db,
            "SELECT COALESCE(MAX(id), 0) FROM chat_messages "
            "WHERE conversation_id = :c",
            {"c": conversation_id},
        )
        or 0
    )


def delete_chat(
    db: Session,
    me: int,
    conversation_id: int,
) -> dict[str, Any]:
    """
    Delete a chat for this account only. The messages are hidden
    (not erased); the other person is not affected and the chat can
    be restored from "Deleted & archived chats".
    """

    _require_participant(db, conversation_id, me)

    newest = _newest_message_id(db, conversation_id)

    if newest == 0:
        return {"ok": True, "deleted": False}

    db.execute(
        text(
            "UPDATE chat_participants "
            "SET cleared_upto = :v, cleared_reason = 'deleted', "
            "cleared_at = :t "
            "WHERE conversation_id = :c AND user_id = :u"
        ),
        {"v": newest, "t": utc_now(), "c": conversation_id, "u": me},
    )

    db.commit()

    touch_presence(db, me)

    return {"ok": True, "deleted": True}


def restore_chat(
    db: Session,
    me: int,
    conversation_id: int,
) -> dict[str, Any]:
    """Bring back the hidden messages of a deleted / archived chat."""

    participant = _require_participant(db, conversation_id, me)

    if int(participant["cleared_upto"] or 0) == 0:
        return {"ok": True, "restored": False, "id": conversation_id}

    db.execute(
        text(
            "UPDATE chat_participants "
            "SET cleared_upto = 0, cleared_reason = NULL, "
            "cleared_at = NULL, restored_at = :t "
            "WHERE conversation_id = :c AND user_id = :u"
        ),
        {"t": utc_now(), "c": conversation_id, "u": me},
    )

    db.commit()

    touch_presence(db, me)

    return {"ok": True, "restored": True, "id": conversation_id}


def archive_old_chats(db: Session, me: int) -> int:
    """
    Move the chats whose newest message is older than 6 months out
    of the list of this account (hidden, not erased). A chat with
    messages this account has not read yet stays. A chat that was
    restored counts as new from the moment of the restore, so it is
    not archived again right away. Returns how many chats moved.
    """

    state = conversation_state(db, me)

    cutoff = utc_now() - timedelta(days=ARCHIVE_AFTER_DAYS)

    moved = 0

    for conversation in state["mine"]:

        conversation_id = conversation["id"]

        last = state["last"].get(conversation_id)

        if last is None:
            continue

        if state["unread"].get(conversation_id, 0) > 0:
            continue

        moment = to_datetime(last["created_at"])

        restored = to_datetime(conversation["restored_at"])

        if restored is not None and (
            moment is None or restored > moment
        ):
            moment = restored

        if moment is None or moment >= cutoff:
            continue

        result = db.execute(
            text(
                "UPDATE chat_participants "
                "SET cleared_upto = :v, cleared_reason = 'archived', "
                "cleared_at = :t "
                "WHERE conversation_id = :c AND user_id = :u "
                "AND cleared_upto < :v"
            ),
            {
                "v": int(last["id"]),
                "t": utc_now(),
                "c": conversation_id,
                "u": me,
            },
        )

        if result.rowcount:
            moved += 1

    if moved:
        db.commit()

    return moved


def archive_old_chats_if_due(db: Session, me: int) -> None:
    """
    Runs the 6-month check when the chat list is loaded and then at
    most every few minutes, so it happens right after a login.
    Never raises: this must not break the chat list.
    """

    now = time.monotonic()

    with _archive_lock:

        previous = _archive_checked.get(me)

        if (
            previous is not None
            and now - previous < ARCHIVE_CHECK_SECONDS
        ):
            return

        _archive_checked[me] = now

    try:

        archive_old_chats(db, me)

    except Exception:

        try:
            db.rollback()
        except Exception:
            pass

        with _archive_lock:
            _archive_checked.pop(me, None)

        logger.warning(
            "The old chats could not be archived.",
            exc_info=True,
        )


def delete_all_chats(db: Session, me: int) -> dict[str, Any]:
    """
    "Delete all chats": every chat of this account that shows
    something is hidden at once (for this account only, nothing is
    erased). Each one can be restored from "Deleted & archived chats".
    Returns how many chats were deleted.
    """

    state = conversation_state(db, me)

    now = utc_now()

    moved = 0

    for conversation in state["mine"]:

        conversation_id = conversation["id"]

        # Nothing visible in this chat: nothing to delete.
        if conversation_id not in state["last"]:
            continue

        newest = _newest_message_id(db, conversation_id)

        if newest <= int(conversation["cleared_upto"] or 0):
            continue

        db.execute(
            text(
                "UPDATE chat_participants "
                "SET cleared_upto = :v, cleared_reason = 'deleted', "
                "cleared_at = :t "
                "WHERE conversation_id = :c AND user_id = :u "
                "AND cleared_upto < :v"
            ),
            {"v": newest, "t": now, "c": conversation_id, "u": me},
        )

        moved += 1

    if moved:
        db.commit()

    touch_presence(db, me)

    return {"ok": True, "deleted": moved}


def delete_message(
    db: Session,
    me: int,
    conversation_id: int,
    message_id: int,
    scope: str = "me",
) -> dict[str, Any]:
    """
    Delete one message.

    scope "me"        - hidden for this account only (the other
                        people still see it). Allowed for any
                        message in a chat the account takes part in.
    scope "everyone"  - only for the sender's own messages. The
                        message turns into "This message was deleted"
                        for everybody; its text and document are not
                        sent to anybody again.
    """

    scope = (scope or "me").strip().lower()

    if scope not in ("me", "everyone"):
        raise HTTPException(
            status_code=400,
            detail='Choose "me" or "everyone".',
        )

    participant = _require_participant(db, conversation_id, me)

    rows = run_rows(
        db,
        "SELECT id, sender_id, deleted_for_all, deleted_at "
        "FROM chat_messages "
        "WHERE id = :m AND conversation_id = :c",
        {"m": message_id, "c": conversation_id},
    )

    # A message above the "delete chat" line is not visible, so it
    # is treated as not found.
    if not rows or int(rows[0]["id"]) <= int(
        participant["cleared_upto"] or 0
    ):
        raise HTTPException(
            status_code=404,
            detail="Message not found.",
        )

    message = rows[0]

    if scope == "everyone":

        if message["sender_id"] != me:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You can delete only your own messages "
                    "for everyone."
                ),
            )

        deleted_at = to_datetime(message["deleted_at"])

        if not message["deleted_for_all"]:

            deleted_at = utc_now()

            db.execute(
                text(
                    "UPDATE chat_messages "
                    "SET deleted_for_all = TRUE, deleted_at = :t "
                    "WHERE id = :m AND deleted_for_all = FALSE"
                ),
                {"t": deleted_at, "m": message_id},
            )

            db.commit()

        touch_presence(db, me)

        return {
            "ok": True,
            "scope": "everyone",
            "id": message_id,
            "deleted_at": iso(deleted_at),
        }

    already = run_scalar(
        db,
        "SELECT COUNT(*) FROM chat_message_hidden "
        "WHERE message_id = :m AND user_id = :u",
        {"m": message_id, "u": me},
    )

    if not already:

        try:

            db.execute(
                text(
                    "INSERT INTO chat_message_hidden "
                    "(message_id, user_id, hidden_at) "
                    "VALUES (:m, :u, :t)"
                ),
                {"m": message_id, "u": me, "t": utc_now()},
            )

            db.commit()

        except Exception:

            # Hidden by another request at the same moment.
            db.rollback()

    touch_presence(db, me)

    return {"ok": True, "scope": "me", "id": message_id}


def list_removed_chats(db: Session, me: int) -> list[dict[str, Any]]:
    """
    "Deleted & archived chats" of this account: every chat with
    hidden messages, newest first, ready to be restored.
    """

    touch_presence(db, me)

    by_id = {
        person["id"]: person for person in get_directory(db)
    }

    state = conversation_state(db, me)

    # Messages deleted "for me" and messages deleted for everyone
    # are not counted and never shown as the last message here.
    counts = {
        row["conversation_id"]: int(row["n"])
        for row in run_rows(
            db,
            f"""
            SELECT m.conversation_id AS conversation_id,
                   COUNT(*) AS n
            FROM chat_messages m
            JOIN chat_participants p
              ON p.conversation_id = m.conversation_id
             AND p.user_id = :me
            WHERE p.cleared_upto > 0
              AND m.id <= p.cleared_upto
              AND m.deleted_for_all = FALSE
              AND {not_hidden('m')}
            GROUP BY m.conversation_id
            """,
            {"me": me},
        )
    }

    last_rows = {
        row["conversation_id"]: row
        for row in run_rows(
            db,
            f"""
            SELECT m.id AS id, m.conversation_id AS conversation_id,
                   m.sender_id AS sender_id, m.body AS body,
                   m.created_at AS created_at,
                   a.file_name AS attachment_name
            FROM chat_messages m
            LEFT JOIN chat_attachments a ON a.id = m.attachment_id
            WHERE m.id IN (
                SELECT MAX(m2.id)
                FROM chat_messages m2
                JOIN chat_participants p
                  ON p.conversation_id = m2.conversation_id
                 AND p.user_id = :me
                WHERE p.cleared_upto > 0
                  AND m2.id <= p.cleared_upto
                  AND m2.deleted_for_all = FALSE
                  AND {not_hidden('m2')}
                GROUP BY m2.conversation_id
            )
            """,
            {"me": me},
        )
    }

    entries: list[dict[str, Any]] = []

    for conversation in state["mine"]:

        conversation_id = conversation["id"]

        if int(conversation["cleared_upto"] or 0) <= 0:
            continue

        if conversation_id not in counts:
            continue

        if conversation["kind"] == "channel":

            name = conversation["name"] or CHANNEL_NAME
            subtitle = CHANNEL_SUBTITLE
            participant_id = None
            kind = "channel"

        else:

            peer = state["peers"].get(conversation_id)

            person = by_id.get(peer["peer_id"]) if peer else None

            # A colleague who is no longer available is not listed.
            if not can_chat(person):
                continue

            name = person["name"]
            subtitle = person["role"]
            participant_id = peer["peer_id"]
            kind = "direct"

        entries.append(
            {
                "id": conversation_id,
                "type": kind,
                "name": name,
                "subtitle": subtitle,
                "participant_id": participant_id,
                "reason": conversation["cleared_reason"] or "deleted",
                "cleared_at": iso(conversation["cleared_at"]),
                "message_count": counts[conversation_id],
                "last_message": last_message_payload(
                    last_rows.get(conversation_id), me, by_id
                ),
            }
        )

    entries.sort(
        key=lambda entry: (
            (entry["last_message"] or {}).get("created_at") or ""
        ),
        reverse=True,
    )

    return entries


def get_attachment(
    db: Session,
    me: int,
    attachment_id: int,
) -> dict[str, Any]:
    """
    A document, but only for people who are in the conversation
    it was shared in.
    """

    rows = run_rows(
        db,
        """
        SELECT a.id AS id, a.file_name AS file_name,
               a.mime_type AS mime_type, a.size_bytes AS size_bytes,
               a.data AS data
        FROM chat_attachments a
        JOIN chat_messages m ON m.attachment_id = a.id
        JOIN chat_participants p
          ON p.conversation_id = m.conversation_id
         AND p.user_id = :me
        WHERE a.id = :a
          AND m.deleted_for_all = FALSE
        LIMIT 1
        """,
        {"me": me, "a": attachment_id},
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    row = rows[0]

    return {
        "id": row["id"],
        "name": row["file_name"],
        "mime": row["mime_type"],
        "size": int(row["size_bytes"] or 0),
        "data_base64": base64.b64encode(bytes(row["data"])).decode(
            "ascii"
        ),
    }
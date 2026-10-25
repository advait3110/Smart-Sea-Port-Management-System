"""
Notifications - what the bell and the Notifications page show.

Every notification belongs to ONE account (table
"port_notifications"), so "read" and "dismissed" are personal,
like WhatsApp: when one person reads or clears a notification,
nobody else is affected.

Where notifications come from (all real events, nothing is
made up):

1. New employee accounts       -> Port Administrators
2. New accounts that can chat  -> the colleagues who were already
   (role has Port Communication)  there (RBAC)
3. Trucks entering / leaving   -> accounts with the Gate & Trucks
   the gate (gate register)       feature (not the officer who
                                  typed the entry)
4. Announcements typed by a    -> everybody
   Port Administrator

New chat messages are NOT notifications. They are counted on the
bell separately, so nothing is counted twice.

Events are picked up when someone's browser asks for the
notifications (the bell asks every few seconds), at most once
every 10 seconds for the whole server. Each event is stored once
per account, so a dismissed notification never comes back.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.chat_service import (
    CLIP,
    can_chat,
    conversation_state,
    display_name,
    get_directory,
    iso,
    run_rows,
    run_scalar,
    sync_channel_members,
    to_datetime,
    touch_presence,
    utc_now,
)


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

LIST_LIMIT = 200

GENERATE_EVERY_SECONDS = 10

# Only events of the last 24 hours become notifications.
EVENT_WINDOW = timedelta(hours=24)

# Old notifications are removed after 30 days.
KEEP_DAYS = 30

GATE_FEATURE_KEY = "gate_trucks"

ADMIN_ROLE_NAMES = {
    "port administrator",
    "port_administrator",
    "admin",
}

ALLOWED_TYPES = ("info", "success", "warning", "error")


# =========================================================
# CREATE NOTIFICATIONS
# =========================================================

_INSERT_SQL = text(
    "INSERT INTO port_notifications "
    "(user_id, notif_type, category, title, message, dedupe_key, "
    "is_read, is_deleted, created_at) "
    "VALUES (:u, :t, :c, :ti, :m, :k, FALSE, FALSE, :ts) "
    "ON CONFLICT (user_id, dedupe_key) DO NOTHING"
)


def add_notification(
    db: Session,
    user_ids: list[int],
    title: str,
    message: str = "",
    kind: str = "info",
    category: str = "General",
    dedupe_key: str | None = None,
    created_at: Any = None,
    skip_existing: set[tuple[int, str]] | None = None,
) -> int:
    """
    Give the same notification to several accounts.

    With a `dedupe_key` an account receives the event only once,
    even if this function is called again for the same event.
    Returns how many accounts received it. The caller commits.
    """

    if kind not in ALLOWED_TYPES:
        kind = "info"

    moment = to_datetime(created_at) or utc_now()

    created = 0

    for user_id in user_ids:

        if (
            dedupe_key is not None
            and skip_existing is not None
            and (user_id, dedupe_key) in skip_existing
        ):
            continue

        result = db.execute(
            _INSERT_SQL,
            {
                "u": user_id,
                "t": kind,
                "c": (category or "General")[:40],
                "ti": (title or "Notification")[:200],
                "m": message or "",
                "k": dedupe_key,
                "ts": moment,
            },
        )

        if result.rowcount:
            created += 1

    return created


def _existing_pairs(
    db: Session,
    keys: list[str],
) -> set[tuple[int, str]]:
    """Which (account, event) pairs already have a notification."""

    if not keys:
        return set()

    names = {f"k{index}": key for index, key in enumerate(keys)}

    placeholders = ", ".join(f":{name}" for name in names)

    rows = run_rows(
        db,
        "SELECT user_id, dedupe_key FROM port_notifications "
        f"WHERE dedupe_key IN ({placeholders})",
        names,
    )

    return {(row["user_id"], row["dedupe_key"]) for row in rows}


# =========================================================
# EVENT SOURCES
# =========================================================


def _generate_account_events(db: Session) -> None:
    """New employee accounts -> every Port Administrator."""

    directory = get_directory(db)

    since = utc_now() - EVENT_WINDOW

    administrators = [
        person["id"]
        for person in directory
        if person["active"]
        and person["role"].strip().lower() in ADMIN_ROLE_NAMES
    ]

    if not administrators:
        return

    fresh = []

    for person in directory:

        created = to_datetime(person["created_at"])

        if created is not None and created > since:
            fresh.append((person, created))

    if not fresh:
        return

    existing = _existing_pairs(
        db, [f"account:{person['id']}" for person, _ in fresh]
    )

    for person, created in fresh:

        role = person["role"] or "no role"

        add_notification(
            db,
            administrators,
            title="New account created",
            message=f"{person['name']} was added as {role}.",
            kind="info",
            category="Access",
            dedupe_key=f"account:{person['id']}",
            created_at=created,
            skip_existing=existing,
        )


def _generate_colleague_events(db: Session) -> None:
    """
    New accounts that can use Port Communication (their role has
    the feature) -> the colleagues who were already there.
    """

    directory = get_directory(db)

    since = utc_now() - EVENT_WINDOW

    fresh = []

    for person in directory:

        created = to_datetime(person["created_at"])

        if (
            created is not None
            and created > since
            and can_chat(person)
        ):
            fresh.append((person, created))

    if not fresh:
        return

    existing = _existing_pairs(
        db, [f"member:{person['id']}" for person, _ in fresh]
    )

    for person, created in fresh:

        recipients = []

        for other in directory:

            if other["id"] == person["id"] or not can_chat(other):
                continue

            # Only colleagues who were there before this account.
            joined = to_datetime(other["created_at"])

            if joined is not None and joined > created:
                continue

            recipients.append(other["id"])

        if not recipients:
            continue

        role = person["role"] or "no role"

        add_notification(
            db,
            recipients,
            title="New colleague in Port Communication",
            message=(
                f"{person['name']} ({role}) joined and can "
                "now chat with you."
            ),
            kind="info",
            category="Communication",
            dedupe_key=f"member:{person['id']}",
            created_at=created,
            skip_existing=existing,
        )


def _generate_gate_events(db: Session) -> None:
    """Gate register entries and exits -> gate staff."""

    directory = get_directory(db)

    recipients = [
        person["id"]
        for person in directory
        if person["active"]
        and GATE_FEATURE_KEY in person["features"]
    ]

    if not recipients:
        return

    since = utc_now() - EVENT_WINDOW

    trucks = run_rows(
        db,
        """
        SELECT id, vehicle_number, driver_name, gate_number,
               created_at, updated_at, exit_time,
               recorded_by_id, exit_recorded_by_id
        FROM trucks
        WHERE created_at > :since
           OR (exit_time IS NOT NULL AND updated_at > :since)
        ORDER BY id DESC
        LIMIT 50
        """,
        {"since": since},
    )

    if not trucks:
        return

    wanted = []

    for truck in trucks:

        entered = to_datetime(truck["created_at"])

        if entered is not None and entered > since:
            wanted.append(("truck-in", truck, entered))

        left = to_datetime(truck["updated_at"])

        if (
            truck["exit_time"] is not None
            and left is not None
            and left > since
        ):
            wanted.append(("truck-out", truck, left))

    existing = _existing_pairs(
        db, [f"{kind}:{truck['id']}" for kind, truck, _ in wanted]
    )

    for kind, truck, moment in wanted:

        if kind == "truck-in":

            title = "Truck entered the port"

            message = (
                f"{truck['vehicle_number']} "
                f"({truck['driver_name']}) entered through "
                f"gate {truck['gate_number']}."
            )

            level = "info"

            actor = truck["recorded_by_id"]

        else:

            title = "Truck left the port"

            message = (
                f"{truck['vehicle_number']} "
                f"({truck['driver_name']}) left through "
                f"gate {truck['gate_number']}."
            )

            level = "success"

            actor = truck["exit_recorded_by_id"]

        add_notification(
            db,
            [user_id for user_id in recipients if user_id != actor],
            title=title,
            message=message,
            kind=level,
            category="Gate",
            dedupe_key=f"{kind}:{truck['id']}",
            created_at=moment,
            skip_existing=existing,
        )


_generate_lock = threading.Lock()
_last_generated: float | None = None


def generate_if_due(db: Session) -> None:
    """
    Pick up new real events. Runs at most once every 10 seconds
    for the whole server and never breaks the request.
    """

    global _last_generated

    now = time.monotonic()

    if (
        _last_generated is not None
        and now - _last_generated < GENERATE_EVERY_SECONDS
    ):
        return

    if not _generate_lock.acquire(blocking=False):
        return

    try:

        if (
            _last_generated is not None
            and time.monotonic() - _last_generated
            < GENERATE_EVERY_SECONDS
        ):
            return

        _last_generated = time.monotonic()

        for source in (
            _generate_account_events,
            _generate_colleague_events,
            _generate_gate_events,
        ):

            try:

                source(db)

                db.commit()

            except Exception:

                db.rollback()

                logger.warning(
                    "Notification source %s failed.",
                    source.__name__,
                    exc_info=True,
                )

        try:

            db.execute(
                text(
                    "DELETE FROM port_notifications "
                    "WHERE created_at < :cutoff"
                ),
                {"cutoff": utc_now() - timedelta(days=KEEP_DAYS)},
            )

            db.commit()

        except Exception:

            db.rollback()

    finally:

        _generate_lock.release()


# =========================================================
# LIST / READ / DISMISS
# =========================================================


def _payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "type": row["notif_type"],
        "category": row["category"],
        "title": row["title"],
        "message": row["message"] or "",
        "created_at": iso(row["created_at"]),
        "is_read": bool(row["is_read"]),
    }


def list_notifications(db: Session, me: int) -> list[dict[str, Any]]:

    touch_presence(db, me)

    generate_if_due(db)

    rows = run_rows(
        db,
        """
        SELECT id, notif_type, category, title, message,
               created_at, is_read
        FROM port_notifications
        WHERE user_id = :me AND is_deleted = FALSE
        ORDER BY created_at DESC, id DESC
        LIMIT :limit
        """,
        {"me": me, "limit": LIST_LIMIT},
    )

    return [_payload(row) for row in rows]


def mark_one_read(db: Session, me: int, notification_id: int) -> dict:

    result = db.execute(
        text(
            "UPDATE port_notifications SET is_read = TRUE "
            "WHERE id = :i AND user_id = :u AND is_deleted = FALSE"
        ),
        {"i": notification_id, "u": me},
    )

    db.commit()

    if not result.rowcount:
        raise HTTPException(
            status_code=404,
            detail="Notification not found.",
        )

    return {"ok": True}


def mark_all_read(db: Session, me: int) -> dict:

    result = db.execute(
        text(
            "UPDATE port_notifications SET is_read = TRUE "
            "WHERE user_id = :u AND is_deleted = FALSE "
            "AND is_read = FALSE"
        ),
        {"u": me},
    )

    db.commit()

    return {"ok": True, "updated": int(result.rowcount or 0)}


def dismiss_one(db: Session, me: int, notification_id: int) -> dict:
    """
    Removed from this account's list. The row is kept (hidden)
    so the same event is not delivered again.
    """

    result = db.execute(
        text(
            "UPDATE port_notifications "
            "SET is_deleted = TRUE, is_read = TRUE "
            "WHERE id = :i AND user_id = :u AND is_deleted = FALSE"
        ),
        {"i": notification_id, "u": me},
    )

    db.commit()

    if not result.rowcount:
        raise HTTPException(
            status_code=404,
            detail="Notification not found.",
        )

    return {"ok": True}


def dismiss_all(db: Session, me: int) -> dict:

    result = db.execute(
        text(
            "UPDATE port_notifications "
            "SET is_deleted = TRUE, is_read = TRUE "
            "WHERE user_id = :u AND is_deleted = FALSE"
        ),
        {"u": me},
    )

    db.commit()

    return {"ok": True, "deleted": int(result.rowcount or 0)}


# =========================================================
# ANNOUNCEMENT (Port Administrator)
# =========================================================


def announce(
    db: Session,
    title: str,
    message: str,
    kind: str,
    category: str,
) -> dict[str, Any]:
    """One notification for every active account."""

    recipients = [
        person["id"]
        for person in get_directory(db)
        if person["active"]
    ]

    created = add_notification(
        db,
        recipients,
        title=title,
        message=message,
        kind=kind,
        category=category,
    )

    db.commit()

    return {"ok": True, "recipients": created}


# =========================================================
# BELL SUMMARY (chat messages + notifications)
# =========================================================


def build_summary(db: Session, me: int) -> dict[str, Any]:
    """
    What the bell in the top bar shows.

    unread_messages       chat messages this account has not opened
    unread_notifications  notifications not yet read
    recent                up to 6 newest items to list in the menu
    messages              every chat with unread messages (newest first),
                          so the Notification page can list them too
    """

    touch_presence(db, me)

    generate_if_due(db)

    sync_channel_members(db)

    by_id = {
        person["id"]: person for person in get_directory(db)
    }

    state = conversation_state(db, me)

    unread_messages = sum(state["unread"].values())

    items: list[tuple[Any, dict[str, Any]]] = []

    for conversation in state["mine"]:

        unread = state["unread"].get(conversation["id"], 0)

        if unread <= 0:
            continue

        last = state["last"].get(conversation["id"])

        if last is None:
            continue

        if conversation["kind"] == "channel":
            title = conversation["name"] or "All Port Staff"
        else:

            peer = state["peers"].get(conversation["id"])

            person = by_id.get(peer["peer_id"]) if peer else None

            if not can_chat(person):
                continue

            title = person["name"]

        if last["attachment_name"]:
            preview = f"{CLIP} {last['attachment_name']}"
        else:
            preview = last["body"] or ""

        if conversation["kind"] == "channel":

            first_name = display_name(by_id, last["sender_id"]).split(
                " "
            )[0]

            preview = f"{first_name}: {preview}"

        moment = to_datetime(last["created_at"])

        items.append(
            (
                moment,
                {
                    "kind": "message",
                    "id": conversation["id"],
                    "title": title,
                    "text": preview,
                    "count": unread,
                    "created_at": iso(last["created_at"]),
                    "unread": True,
                },
            )
        )

    # Every chat with unread messages, newest first (the "recent" list
    # below is cut to 6 items, this one is not).
    message_items = [
        item
        for _, item in sorted(
            items,
            key=lambda pair: (
                pair[0].timestamp() if pair[0] is not None else 0
            ),
            reverse=True,
        )
    ]

    unread_notifications = int(
        run_scalar(
            db,
            "SELECT COUNT(*) FROM port_notifications "
            "WHERE user_id = :me AND is_deleted = FALSE "
            "AND is_read = FALSE",
            {"me": me},
        )
        or 0
    )

    newest = run_rows(
        db,
        """
        SELECT id, notif_type, category, title, message,
               created_at, is_read
        FROM port_notifications
        WHERE user_id = :me AND is_deleted = FALSE
        ORDER BY created_at DESC, id DESC
        LIMIT 4
        """,
        {"me": me},
    )

    for row in newest:

        items.append(
            (
                to_datetime(row["created_at"]),
                {
                    "kind": "notification",
                    "id": row["id"],
                    "title": row["title"],
                    "text": row["message"] or "",
                    "type": row["notif_type"],
                    "created_at": iso(row["created_at"]),
                    "unread": not bool(row["is_read"]),
                },
            )
        )

    items.sort(
        key=lambda pair: (
            pair[0].timestamp() if pair[0] is not None else 0
        ),
        reverse=True,
    )

    return {
        "unread_messages": int(unread_messages),
        "unread_notifications": unread_notifications,
        "recent": [item for _, item in items[:6]],
        "messages": message_items,
    }
"""
Incident Management - database tables and business logic.

What this file does
-------------------
- Creates its own tables the first time they are needed
  (no Alembic migration is required):
    port_incidents         one row per incident
    port_incident_events   the timeline of every incident
                           (reported, status changes, assignments,
                           notes: who did what and when)
- Port employees report incidents by hand. Nothing is made up and
  there is no sample data: an empty register stays empty until
  somebody reports the first incident.
- Incident numbers are INC-<year>-<number>, counted per year
  (INC-2026-001, INC-2026-002, ...).
- Status flow: Reported -> Under Investigation -> Action Required
  -> Resolved -> Closed (a Resolved or Closed incident can be
  re-opened, the timeline keeps the whole history).
- An incident can be assigned to a real account (an active account
  whose role has the "incidents" feature) OR to a whole designation
  ("team"): any of the 8 port designations. The WHOLE team, every
  active account that holds that designation, is then told through
  the bell. (Members whose role cannot open Incidents yet still get
  the message; the Port Administrator switches the Incident
  Management permission on for that role so they can act on it.)
  An incident has one assignment at a time: a person, a team or
  nobody.
- Bell notifications (the same bell as the chat and the gate):
    new incident     -> accounts with the Incidents feature
                        (a CRITICAL incident -> every active account)
    assigned to me   -> the assigned account (or every account of the
                        assigned designation)
    no longer mine   -> the account(s) that were assigned before
                        (reassigned to someone else or unassigned)
    status changed   -> the person who reported it and the people
                        it is assigned to
    new note         -> the person who reported it and the people
                        it is assigned to
  The person who did the action never gets a notification for it
  (so if you assign an incident to yourself, no bell message is
  made: you already know).

Who may do what
---------------
The feature check for every endpoint is done in app/main.py
(module_guard "incidents"). Everybody who has the feature can
report, change the status, assign and add notes (everything is
written to the timeline with the name and role). Only a Port
Administrator can delete an incident record.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.services import chat_service
from app.services.chat_service import (
    get_directory,
    iso,
    run_rows,
    run_scalar,
    to_datetime,
    utc_now,
)
from app.services.notification_service import (
    ADMIN_ROLE_NAMES,
    add_notification,
)


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

FEATURE_KEY = "incidents"

INCIDENT_TYPES = [
    "Vessel Incident",
    "Equipment Failure",
    "Gate/Security Incident",
    "Environmental Incident",
    "Fire/Safety",
    "Injury / Medical",
    "Cargo Damage",
    "Other",
]

SEVERITIES = ["Critical", "High", "Medium", "Low"]

# The 8 fixed port designations (roles). Every one of them can be
# chosen as a team when an incident is assigned.
DESIGNATIONS = [
    "Port Administrator",
    "Port Operations Manager",
    "Vessel Management Officer",
    "Security Officer",
    "Gate & Truck Officer",
    "Maintenance Officer",
    "Cargo Officer",
    "Port Executive",
]

STATUSES = [
    "Reported",
    "Under Investigation",
    "Action Required",
    "Resolved",
    "Closed",
]

FINISHED_STATUSES = ("Resolved", "Closed")

MAX_LOCATION = 120

MAX_VESSEL = 120

MAX_TEXT = 4000

MAX_NOTE = 2000

LIST_LIMIT = 1000

# The "when did it happen" time may be a few minutes ahead of the
# server clock (the clock of the computer can differ a little).
FUTURE_SLACK = timedelta(minutes=5)

NUMBER_ATTEMPTS = 5

CATEGORY = "Incident"


# =========================================================
# TABLES
# =========================================================

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS port_incidents (
        id SERIAL PRIMARY KEY,
        incident_year INTEGER NOT NULL,
        year_seq INTEGER NOT NULL,
        incident_type VARCHAR(40) NOT NULL,
        location VARCHAR(120) NOT NULL,
        severity VARCHAR(10) NOT NULL,
        status VARCHAR(30) NOT NULL,
        vessel VARCHAR(120),
        description TEXT NOT NULL,
        reported_by_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        reported_by_name VARCHAR(120) NOT NULL DEFAULT '',
        reported_by_role VARCHAR(80) NOT NULL DEFAULT '',
        assigned_to_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        assigned_to_name VARCHAR(120),
        assigned_role VARCHAR(80),
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        CONSTRAINT uq_port_incident_number
            UNIQUE (incident_year, year_seq)
    )
    """,
    """
    ALTER TABLE port_incidents
        ADD COLUMN IF NOT EXISTS assigned_role VARCHAR(80)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_incidents_occurred
        ON port_incidents (occurred_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_incidents_status
        ON port_incidents (status)
    """,
    """
    CREATE TABLE IF NOT EXISTS port_incident_events (
        id SERIAL PRIMARY KEY,
        incident_id INTEGER NOT NULL
            REFERENCES port_incidents (id) ON DELETE CASCADE,
        event_type VARCHAR(20) NOT NULL,
        actor_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        actor_name VARCHAR(120) NOT NULL DEFAULT '',
        actor_role VARCHAR(80) NOT NULL DEFAULT '',
        old_value VARCHAR(120),
        new_value VARCHAR(120),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_incident_events_incident
        ON port_incident_events (incident_id, id)
    """,
]

_tables_ready = False
_tables_lock = threading.Lock()


def ensure_tables(db: Session) -> None:
    """
    Create the incident tables if they do not exist yet. Safe to
    call on every request: after the first successful call it
    does nothing. The notification table (used for the bell) is
    created by the chat service, so it is made sure first.
    """

    global _tables_ready

    if _tables_ready:
        return

    with _tables_lock:

        if _tables_ready:
            return

        chat_service.ensure_tables(db)

        try:

            for statement in SCHEMA_STATEMENTS:
                db.execute(text(statement))

            db.commit()

        except Exception as exc:

            db.rollback()

            logger.exception("Incident tables could not be created.")

            raise HTTPException(
                status_code=500,
                detail=(
                    "The incident tables could not be created "
                    f"({type(exc).__name__}). "
                    "Check the backend terminal for details."
                ),
            ) from exc

        _tables_ready = True


# =========================================================
# SMALL HELPERS
# =========================================================


def _actor(user: User) -> dict[str, Any]:
    """The logged-in account, as the plain facts this file needs."""

    role = user.role

    role_name = (role.name or "") if role is not None else ""

    return {
        "id": user.id,
        "name": (
            user.full_name or user.username or f"User {user.id}"
        ),
        "role": role_name,
        "admin": role_name.strip().lower() in ADMIN_ROLE_NAMES,
    }


def _by_id(db: Session) -> dict[int, dict[str, Any]]:
    return {person["id"]: person for person in get_directory(db)}


def _person(
    by_id: dict[int, dict[str, Any]],
    user_id: Any,
    fallback_name: Any,
    fallback_role: Any = "",
) -> dict[str, Any] | None:
    """
    A person for the screen. The current name and role of the
    account are used; if the account no longer exists the name
    saved with the record is shown.
    """

    person = by_id.get(user_id) if user_id is not None else None

    if person is not None:
        return {
            "id": person["id"],
            "name": person["name"],
            "role": person["role"],
        }

    if not fallback_name:
        return None

    return {
        "id": None,
        "name": str(fallback_name),
        "role": str(fallback_role or ""),
    }


def _number(row: dict[str, Any]) -> str:
    return f"INC-{int(row['incident_year'])}-{int(row['year_seq']):03d}"


def _single_line(value: Any) -> str:
    return " ".join(str(value or "").split())


def _fail(message: str, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=message)


# =========================================================
# READ
# =========================================================

_COLUMNS = """
    id, incident_year, year_seq, incident_type, location, severity,
    status, vessel, description, reported_by_id, reported_by_name,
    reported_by_role, assigned_to_id, assigned_to_name, assigned_role,
    occurred_at, created_at, updated_at, resolved_at
"""


def _incident_payload(
    row: dict[str, Any],
    by_id: dict[int, dict[str, Any]],
    actor: dict[str, Any],
) -> dict[str, Any]:

    return {
        "id": row["id"],
        "number": _number(row),
        "type": row["incident_type"],
        "location": row["location"],
        "severity": row["severity"],
        "status": row["status"],
        "vessel": row["vessel"] or "",
        "description": row["description"],
        "reported_by": _person(
            by_id,
            row["reported_by_id"],
            row["reported_by_name"],
            row["reported_by_role"],
        ),
        "assigned_to": _person(
            by_id,
            row["assigned_to_id"],
            row["assigned_to_name"],
        ),
        "assigned_role": row["assigned_role"] or None,
        "occurred_at": iso(row["occurred_at"]),
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
        "resolved_at": iso(row["resolved_at"]),
        "can_delete": bool(actor["admin"]),
    }


def _event_payload(
    row: dict[str, Any],
    by_id: dict[int, dict[str, Any]],
) -> dict[str, Any]:

    return {
        "id": row["id"],
        "type": row["event_type"],
        "actor": _person(
            by_id,
            row["actor_id"],
            row["actor_name"] or "Former employee",
            row["actor_role"],
        ),
        "old_value": row["old_value"],
        "new_value": row["new_value"],
        "note": row["note"] or "",
        "created_at": iso(row["created_at"]),
    }


def _get_row(db: Session, incident_id: int) -> dict[str, Any]:

    rows = run_rows(
        db,
        f"SELECT {_COLUMNS} FROM port_incidents WHERE id = :id",
        {"id": incident_id},
    )

    if not rows:
        raise _fail(
            "This incident does not exist "
            "(it may have been deleted).",
            404,
        )

    return rows[0]


def _detail(
    db: Session,
    actor: dict[str, Any],
    incident_id: int,
) -> dict[str, Any]:
    """One incident with its whole timeline."""

    row = _get_row(db, incident_id)

    by_id = _by_id(db)

    events = run_rows(
        db,
        "SELECT id, incident_id, event_type, actor_id, actor_name, "
        "actor_role, old_value, new_value, note, created_at "
        "FROM port_incident_events WHERE incident_id = :id "
        "ORDER BY id ASC",
        {"id": incident_id},
    )

    return {
        "incident": _incident_payload(row, by_id, actor),
        "events": [_event_payload(event, by_id) for event in events],
    }


def list_incidents(db: Session, user: User) -> dict[str, Any]:
    """Every incident, the newest first."""

    actor = _actor(user)

    rows = run_rows(
        db,
        f"SELECT {_COLUMNS} FROM port_incidents "
        "ORDER BY occurred_at DESC, id DESC LIMIT :limit",
        {"limit": LIST_LIMIT},
    )

    by_id = _by_id(db)

    return {
        "incidents": [
            _incident_payload(row, by_id, actor) for row in rows
        ],
    }


def get_incident(
    db: Session,
    user: User,
    incident_id: int,
) -> dict[str, Any]:

    return _detail(db, _actor(user), incident_id)


def list_assignees(db: Session) -> list[dict[str, Any]]:
    """Accounts an incident can be assigned to."""

    people = [
        {
            "id": person["id"],
            "name": person["name"],
            "role": person["role"],
        }
        for person in get_directory(db)
        if person["active"] and FEATURE_KEY in person["features"]
    ]

    people.sort(key=lambda person: person["name"].lower())

    return people


def list_designations(db: Session, user: User) -> list[dict[str, Any]]:
    """
    The designations an incident can be assigned to: all 8 of them,
    except the designation of the person who is assigning (nobody
    assigns an incident to their own designation).

    "members" is the whole team: every active account that holds the
    designation (all of them are told). "with_access" is how many of
    them can also open Incidents.
    """

    actor = _actor(user)

    own = _single_line(actor["role"]).lower()

    return [
        {
            "name": designation,
            "members": len(_team(db, designation)),
            "with_access": len(_team(db, designation, True)),
        }
        for designation in DESIGNATIONS
        if designation.lower() != own
    ]


# =========================================================
# BELL NOTIFICATIONS
# =========================================================


def _notify(
    db: Session,
    user_ids: list[Any],
    title: str,
    message: str,
    kind: str,
    dedupe_key: str,
) -> None:
    """
    Give a notification to some accounts. Only active accounts
    receive it. A problem here never breaks the incident itself,
    which is already saved.
    """

    active = {
        person["id"]
        for person in get_directory(db)
        if person["active"]
    }

    recipients = [
        user_id
        for user_id in dict.fromkeys(user_ids)
        if user_id is not None and user_id in active
    ]

    if not recipients:
        return

    try:

        add_notification(
            db,
            recipients,
            title=title,
            message=message,
            kind=kind,
            category=CATEGORY,
            dedupe_key=dedupe_key,
        )

        db.commit()

    except Exception:

        db.rollback()

        logger.exception("Incident notification could not be saved.")


def _short(value: str, limit: int = 140) -> str:

    value = _single_line(value)

    if len(value) <= limit:
        return value

    return value[: limit - 1].rstrip() + "..."


def _team(
    db: Session,
    role_name: Any,
    need_access: bool = False,
) -> list[int]:
    """
    The whole team of one designation: every active account that
    holds it. With need_access only those whose role can also open
    Incidents.
    """

    wanted = _single_line(role_name).lower()

    if not wanted:
        return []

    return [
        person["id"]
        for person in get_directory(db)
        if person["active"]
        and (not need_access or FEATURE_KEY in person["features"])
        and _single_line(person["role"]).lower() == wanted
    ]


def _team_label(role_name: str) -> str:
    return f"{role_name} team"


def _assigned_ids(db: Session, row: dict[str, Any]) -> list[int]:
    """Everybody the incident is assigned to right now."""

    if row["assigned_to_id"] is not None:
        return [row["assigned_to_id"]]

    if row["assigned_role"]:
        return _team(db, row["assigned_role"])

    return []


def _resolve_designation(value: Any) -> str:
    """The designation as it is written in the fixed list."""

    clean = _single_line(value).lower()

    for item in DESIGNATIONS:
        if item.lower() == clean:
            return item

    raise _fail("Choose a designation from the list.")


# =========================================================
# REPORT AN INCIDENT
# =========================================================


def _choice(value: Any, allowed: list[str], message: str) -> str:

    clean = _single_line(value)

    for item in allowed:
        if item.lower() == clean.lower():
            return item

    raise _fail(message)


def _occurred_at(value: Any, now: datetime) -> datetime:

    if value is None or not str(value).strip():
        return now

    moment = to_datetime(str(value).strip())

    if moment is None:
        raise _fail("The date and time are not valid.")

    moment = moment.astimezone(timezone.utc)

    if moment > now + FUTURE_SLACK:
        raise _fail("The time when it happened cannot be in the future.")

    return moment


def _add_event(
    db: Session,
    incident_id: int,
    actor: dict[str, Any],
    event_type: str,
    old_value: str | None,
    new_value: str | None,
    note: str,
    moment: datetime,
) -> int:

    return db.execute(
        text(
            "INSERT INTO port_incident_events "
            "(incident_id, event_type, actor_id, actor_name, "
            "actor_role, old_value, new_value, note, created_at) "
            "VALUES (:i, :e, :a, :an, :ar, :o, :n, :t, :c) "
            "RETURNING id"
        ),
        {
            "i": incident_id,
            "e": event_type,
            "a": actor["id"],
            "an": actor["name"][:120],
            "ar": actor["role"][:80],
            "o": old_value,
            "n": new_value,
            "t": note or None,
            "c": moment,
        },
    ).scalar()


def create_incident(
    db: Session,
    user: User,
    incident_type: Any,
    location: Any,
    severity: Any,
    description: Any,
    vessel: Any,
    occurred_at: Any,
) -> dict[str, Any]:
    """An employee reports a new incident."""

    actor = _actor(user)

    now = utc_now()

    clean_type = _choice(
        incident_type,
        INCIDENT_TYPES,
        "Choose an incident type.",
    )

    clean_severity = _choice(
        severity,
        SEVERITIES,
        "Choose a severity.",
    )

    clean_location = _single_line(location)

    if not clean_location:
        raise _fail("Enter where it happened (for example Berth 2).")

    if len(clean_location) > MAX_LOCATION:
        raise _fail(
            f"The location is too long (at most {MAX_LOCATION} "
            "characters)."
        )

    clean_vessel = _single_line(vessel)

    if len(clean_vessel) > MAX_VESSEL:
        raise _fail(
            f"The vessel name is too long (at most {MAX_VESSEL} "
            "characters)."
        )

    clean_description = str(description or "").strip()

    if not clean_description:
        raise _fail("Describe what happened.")

    if len(clean_description) > MAX_TEXT:
        raise _fail(
            f"The description is too long (at most {MAX_TEXT} "
            "characters)."
        )

    happened = _occurred_at(occurred_at, now)

    incident_id = None

    for attempt in range(NUMBER_ATTEMPTS):

        try:

            sequence = (
                run_scalar(
                    db,
                    "SELECT COALESCE(MAX(year_seq), 0) "
                    "FROM port_incidents "
                    "WHERE incident_year = :year",
                    {"year": now.year},
                )
                or 0
            ) + 1

            incident_id = db.execute(
                text(
                    "INSERT INTO port_incidents "
                    "(incident_year, year_seq, incident_type, "
                    "location, severity, status, vessel, "
                    "description, reported_by_id, "
                    "reported_by_name, reported_by_role, "
                    "occurred_at, created_at, updated_at) "
                    "VALUES (:y, :q, :ty, :lo, :se, :st, :ve, "
                    ":de, :rb, :rn, :rr, :oc, :cr, :up) "
                    "RETURNING id"
                ),
                {
                    "y": now.year,
                    "q": sequence,
                    "ty": clean_type,
                    "lo": clean_location,
                    "se": clean_severity,
                    "st": "Reported",
                    "ve": clean_vessel or None,
                    "de": clean_description,
                    "rb": actor["id"],
                    "rn": actor["name"][:120],
                    "rr": actor["role"][:80],
                    "oc": happened,
                    "cr": now,
                    "up": now,
                },
            ).scalar()

            _add_event(
                db,
                incident_id,
                actor,
                "reported",
                None,
                "Reported",
                "",
                now,
            )

            db.commit()

            break

        except Exception as exc:

            db.rollback()

            incident_id = None

            # Two people reported at the same moment and got the
            # same number: count again.
            if attempt == NUMBER_ATTEMPTS - 1:

                logger.exception("The incident could not be saved.")

                raise _fail(
                    "The incident could not be saved "
                    f"({type(exc).__name__}). Please try again.",
                    500,
                ) from exc

    row = _get_row(db, incident_id)

    people = get_directory(db)

    if clean_severity == "Critical":
        recipients = [
            person["id"] for person in people if person["active"]
        ]
        kind = "error"
    else:
        recipients = [
            person["id"]
            for person in people
            if person["active"] and FEATURE_KEY in person["features"]
        ]
        kind = "warning" if clean_severity == "High" else "info"

    _notify(
        db,
        [user_id for user_id in recipients if user_id != actor["id"]],
        title=f"{clean_severity} incident reported",
        message=(
            f"{_number(row)}: {clean_type} at {clean_location}. "
            f"{_short(clean_description)}"
        ),
        kind=kind,
        dedupe_key=f"incident-new:{incident_id}",
    )

    return _detail(db, actor, incident_id)


# =========================================================
# CHANGE STATUS / ASSIGN / NOTES
# =========================================================


def _clean_note(note: Any, required: bool = False) -> str:

    clean = str(note or "").strip()

    if required and not clean:
        raise _fail("Write the note first.")

    if len(clean) > MAX_NOTE:
        raise _fail(
            f"The note is too long (at most {MAX_NOTE} characters)."
        )

    return clean


def change_status(
    db: Session,
    user: User,
    incident_id: int,
    new_status: Any,
    note: Any,
) -> dict[str, Any]:

    actor = _actor(user)

    status = _choice(new_status, STATUSES, "Choose a status.")

    clean_note = _clean_note(note)

    row = _get_row(db, incident_id)

    old_status = row["status"]

    if old_status == status:
        raise _fail(f"The incident already has the status {status}.")

    now = utc_now()

    # The time of the first "Resolved / Closed" is kept; opening
    # the incident again clears it.
    if status in FINISHED_STATUSES:
        resolved_at = to_datetime(row["resolved_at"]) or now
    else:
        resolved_at = None

    try:

        db.execute(
            text(
                "UPDATE port_incidents SET status = :s, "
                "resolved_at = :r, updated_at = :u WHERE id = :id"
            ),
            {"s": status, "r": resolved_at, "u": now, "id": incident_id},
        )

        event_id = _add_event(
            db,
            incident_id,
            actor,
            "status",
            old_status,
            status,
            clean_note,
            now,
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The incident status could not be changed.")

        raise _fail(
            "The status could not be changed "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    _notify(
        db,
        [
            user_id
            for user_id in (
                row["reported_by_id"],
                *_assigned_ids(db, row),
            )
            if user_id != actor["id"]
        ],
        title="Incident status changed",
        message=f"{_number(row)} is now {status}.",
        kind="success" if status in FINISHED_STATUSES else "info",
        dedupe_key=f"incident-status:{event_id}",
    )

    return _detail(db, actor, incident_id)


def assign_incident(
    db: Session,
    user: User,
    incident_id: int,
    assignee_id: Any,
    note: Any,
    designation: Any = None,
) -> dict[str, Any]:
    """
    Assign the incident to a designation ("team") or to one account.
    Nothing chosen removes the assignment.

    The person who is assigning is never told about it, and an
    incident cannot be assigned to the designation of the person who
    is assigning.
    """

    actor = _actor(user)

    clean_note = _clean_note(note)

    row = _get_row(db, incident_id)

    by_id = _by_id(db)

    old_ids = _assigned_ids(db, row)

    old_person = _person(by_id, row["assigned_to_id"], row["assigned_to_name"])

    old_role = row["assigned_role"] or None

    if old_person is not None:
        old_label = old_person["name"]
    elif old_role:
        old_label = _team_label(old_role)
    else:
        old_label = None

    new_person = None
    new_role = None

    if assignee_id is not None and _single_line(designation):

        raise _fail("Choose a designation or a person, not both.")

    if _single_line(designation):

        new_role = _resolve_designation(designation)

        if new_role.lower() == _single_line(actor["role"]).lower():
            raise _fail(
                f"You cannot assign an incident to your own designation "
                f"({new_role}). Choose another designation."
            )

        if old_person is None and old_role == new_role:
            raise _fail(
                f"This incident is already assigned to the "
                f"{_team_label(new_role)}."
            )

    elif assignee_id is None:

        if old_label is None:
            raise _fail("Nobody is assigned to this incident.")

    else:

        candidate = by_id.get(assignee_id)

        if (
            candidate is None
            or not candidate["active"]
            or FEATURE_KEY not in candidate["features"]
        ):
            raise _fail(
                "That account cannot work on incidents. Choose "
                "another person."
            )

        if row["assigned_to_id"] == assignee_id:
            raise _fail(
                f"{candidate['name']} is already assigned to this "
                "incident."
            )

        new_person = {
            "id": candidate["id"],
            "name": candidate["name"],
            "role": candidate["role"],
        }

    if new_person is not None:
        new_label = new_person["name"]
        new_ids = [new_person["id"]]
    elif new_role is not None:
        new_label = _team_label(new_role)
        new_ids = _team(db, new_role)
    else:
        new_label = None
        new_ids = []

    now = utc_now()

    try:

        db.execute(
            text(
                "UPDATE port_incidents SET assigned_to_id = :a, "
                "assigned_to_name = :n, assigned_role = :r, "
                "updated_at = :u WHERE id = :id"
            ),
            {
                "a": new_person["id"] if new_person else None,
                "n": new_person["name"][:120] if new_person else None,
                "r": new_role,
                "u": now,
                "id": incident_id,
            },
        )

        event_id = _add_event(
            db,
            incident_id,
            actor,
            "assigned",
            old_label[:120] if old_label else None,
            new_label[:120] if new_label else None,
            clean_note,
            now,
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The incident could not be assigned.")

        raise _fail(
            "The incident could not be assigned "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    # Whoever the incident is now assigned to is told (never the
    # person who made the assignment).
    if new_ids:

        if new_person is not None:
            message = (
                f"{actor['name']} assigned {_number(row)} to you: "
            )
            title = "Incident assigned to you"
        else:
            message = (
                f"{actor['name']} assigned {_number(row)} to the "
                f"{_team_label(new_role)}: "
            )
            title = "Incident assigned to your team"

        message += (
            f"{row['incident_type']} at {row['location']} "
            f"({row['severity']})."
        )

        if clean_note:
            message = f"{message} {_short(clean_note, 100)}"

        _notify(
            db,
            [user_id for user_id in new_ids if user_id != actor["id"]],
            title=title,
            message=message,
            kind=(
                "warning"
                if row["severity"] in ("Critical", "High")
                else "info"
            ),
            dedupe_key=f"incident-assign:{event_id}",
        )

    # Whoever had the incident before is told it is no longer theirs
    # (unless it is assigned to them again, or they made the change).
    _notify(
        db,
        [
            user_id
            for user_id in old_ids
            if user_id != actor["id"] and user_id not in new_ids
        ],
        title="Incident no longer assigned to you",
        message=(
            f"{_number(row)} was "
            + (
                f"reassigned to {new_label}"
                if new_label is not None
                else "left without an assignee"
            )
            + f" by {actor['name']}."
        ),
        kind="info",
        dedupe_key=f"incident-unassign:{event_id}",
    )

    return _detail(db, actor, incident_id)


def add_note(
    db: Session,
    user: User,
    incident_id: int,
    note: Any,
) -> dict[str, Any]:

    actor = _actor(user)

    clean_note = _clean_note(note, required=True)

    row = _get_row(db, incident_id)

    now = utc_now()

    try:

        event_id = _add_event(
            db,
            incident_id,
            actor,
            "note",
            None,
            None,
            clean_note,
            now,
        )

        db.execute(
            text(
                "UPDATE port_incidents SET updated_at = :u "
                "WHERE id = :id"
            ),
            {"u": now, "id": incident_id},
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The note could not be saved.")

        raise _fail(
            f"The note could not be saved ({type(exc).__name__}). "
            "Please try again.",
            500,
        ) from exc

    # The person who reported the incident and the person it is
    # assigned to read every new note.
    _notify(
        db,
        [
            user_id
            for user_id in (
                row["reported_by_id"],
                *_assigned_ids(db, row),
            )
            if user_id != actor["id"]
        ],
        title="New note on an incident",
        message=(
            f"{actor['name']} added a note to {_number(row)}: "
            f"{_short(clean_note, 100)}"
        ),
        kind="info",
        dedupe_key=f"incident-note:{event_id}",
    )

    return _detail(db, actor, incident_id)


# =========================================================
# DELETE (Port Administrator only)
# =========================================================


def delete_incident(
    db: Session,
    user: User,
    incident_id: int,
) -> dict[str, Any]:
    """
    An incident register is a safety record, so only a Port
    Administrator can remove an incident (with its timeline).
    """

    actor = _actor(user)

    if not actor["admin"]:
        raise _fail(
            "Only a Port Administrator can delete an incident "
            "record.",
            403,
        )

    _get_row(db, incident_id)

    try:

        db.execute(
            text(
                "DELETE FROM port_incident_events "
                "WHERE incident_id = :id"
            ),
            {"id": incident_id},
        )

        db.execute(
            text("DELETE FROM port_incidents WHERE id = :id"),
            {"id": incident_id},
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The incident could not be deleted.")

        raise _fail(
            "The incident could not be deleted "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    return {"ok": True, "id": incident_id}
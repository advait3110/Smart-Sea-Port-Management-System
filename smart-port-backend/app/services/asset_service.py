"""
Asset & Maintenance - database tables and business logic.

What this file does
-------------------
- Creates its own tables the first time they are needed
  (no Alembic migration is required):
    port_assets             one row per piece of port equipment
    port_maintenance_jobs   the maintenance jobs of every asset
    port_asset_events       the history of every asset (who did
                            what and when)
- Port employees enter everything by hand. Nothing is made up and
  there is no sample data: an empty register stays empty until
  somebody adds the first asset.
- Asset IDs are made from the category and counted per category
  (CRN-001, CRN-002, GEN-001, FLT-001 ...).
  Job numbers are MNT-<year>-<number> (MNT-2026-001 ...).
- A maintenance job goes: Scheduled -> In Progress -> Completed
  (a job can also be Cancelled). A job that is not finished after
  its due date is "Overdue" (worked out from the due date, nobody
  has to set it).
- The status shown for an asset is worked out like this:
    Out of Service    an employee marked it out of service
    Maintenance       a job on it is In Progress
    Overdue           a job on it is past its due date
    Maintenance Due   a job on it is due within 7 days
    Operational       none of the above
- "Last maintenance" is the date of the latest completed job (or
  the date typed when the asset was added). "Next maintenance" is
  the due date of the earliest Scheduled job.
- Bell notifications (the same bell as the chat and the gate):
    asset out of service / back in service
                         -> accounts with the Asset Maintenance feature
    job assigned to me   -> the assigned account
    job started / completed / cancelled
                         -> the person who scheduled it and the
                            person it is assigned to
    job overdue          -> accounts with the Asset Maintenance feature
                            and the assigned account (once per job)
  The person who did the action never gets a notification for it.

Dates
-----
Maintenance dates are plain dates (no time of day). "Today" is the
date in Singapore (UTC+8, Singapore has no daylight saving time).

Who may do what
---------------
The feature check for every endpoint is done in app/main.py
(module_guard "asset_maintenance"). Everybody who has the feature
can add and edit assets, schedule / start / complete / cancel jobs,
change the status and add notes (everything is written to the
history with the name and role). Only a Port Administrator can
delete an asset record.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timedelta, timezone
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

FEATURE_KEY = "asset_maintenance"

# (category, first letters of the Asset ID)
CATEGORY_PREFIXES = [
    ("Crane", "CRN"),
    ("Forklift", "FLT"),
    ("Truck", "TRK"),
    ("Generator", "GEN"),
    ("Pump", "PMP"),
    ("Weighbridge", "WB"),
    ("Other Equipment", "EQP"),
]

CATEGORIES = [name for name, _ in CATEGORY_PREFIXES]

PREFIX_OF = dict(CATEGORY_PREFIXES)

JOB_TYPES = [
    "Inspection",
    "Preventive Maintenance",
    "Repair",
    "Calibration",
    "Other",
]

# The two statuses an employee can set by hand. All the other
# statuses shown on the screen are worked out from the jobs.
ASSET_STATUSES = ["Operational", "Out of Service"]

JOB_STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"]

OPEN_JOB_STATUSES = ("Scheduled", "In Progress")

# A job due within this many days makes the asset "Maintenance Due".
DUE_SOON_DAYS = 7

MAX_NAME = 120

MAX_LOCATION = 120

MAX_SERIAL = 80

MAX_DESCRIPTION = 2000

MAX_NOTE = 2000

LIST_LIMIT = 1000

JOB_LIMIT = 300

ALERT_LIMIT = 30

OVERDUE_BATCH = 20

NUMBER_ATTEMPTS = 5

# Singapore time (no daylight saving time).
PORT_TZ = timezone(timedelta(hours=8))

# A completion date may be one day ahead of Singapore (a computer
# in a time zone further east).
DATE_SLACK = timedelta(days=1)

MIN_DATE = date(2000, 1, 1)

MAX_DATE = date(2100, 12, 31)

CATEGORY = "Maintenance"

MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def port_today() -> date:
    """Today's date in Singapore."""

    return datetime.now(PORT_TZ).date()


# =========================================================
# TABLES
# =========================================================

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS port_assets (
        id SERIAL PRIMARY KEY,
        asset_prefix VARCHAR(5) NOT NULL,
        prefix_seq INTEGER NOT NULL,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(30) NOT NULL,
        location VARCHAR(120) NOT NULL,
        serial_number VARCHAR(80),
        status VARCHAR(20) NOT NULL DEFAULT 'Operational',
        status_changed_at TIMESTAMPTZ,
        last_maintenance_on DATE,
        created_by_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        created_by_name VARCHAR(120) NOT NULL DEFAULT '',
        created_by_role VARCHAR(80) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_port_asset_code
            UNIQUE (asset_prefix, prefix_seq)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_assets_category
        ON port_assets (category)
    """,
    """
    CREATE TABLE IF NOT EXISTS port_maintenance_jobs (
        id SERIAL PRIMARY KEY,
        job_year INTEGER NOT NULL,
        year_seq INTEGER NOT NULL,
        asset_id INTEGER NOT NULL
            REFERENCES port_assets (id) ON DELETE CASCADE,
        job_type VARCHAR(40) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL,
        due_date DATE NOT NULL,
        started_at TIMESTAMPTZ,
        completed_on DATE,
        assigned_to_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        assigned_to_name VARCHAR(120),
        created_by_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        created_by_name VARCHAR(120) NOT NULL DEFAULT '',
        created_by_role VARCHAR(80) NOT NULL DEFAULT '',
        overdue_notified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_port_maintenance_job_number
            UNIQUE (job_year, year_seq)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_maintenance_jobs_asset
        ON port_maintenance_jobs (asset_id, status)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_maintenance_jobs_due
        ON port_maintenance_jobs (status, due_date)
    """,
    """
    CREATE TABLE IF NOT EXISTS port_asset_events (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER NOT NULL
            REFERENCES port_assets (id) ON DELETE CASCADE,
        job_id INTEGER,
        event_type VARCHAR(20) NOT NULL,
        actor_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        actor_name VARCHAR(120) NOT NULL DEFAULT '',
        actor_role VARCHAR(80) NOT NULL DEFAULT '',
        old_value VARCHAR(160),
        new_value VARCHAR(160),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_asset_events_asset
        ON port_asset_events (asset_id, id)
    """,
]

_tables_ready = False
_tables_lock = threading.Lock()


def ensure_tables(db: Session) -> None:
    """
    Create the asset tables if they do not exist yet. Safe to call
    on every request: after the first successful call it does
    nothing. The notification table (used for the bell) is created
    by the chat service, so it is made sure first.
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

            logger.exception("Asset tables could not be created.")

            raise HTTPException(
                status_code=500,
                detail=(
                    "The asset tables could not be created "
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


def _code(row: dict[str, Any]) -> str:
    return f"{row['asset_prefix']}-{int(row['prefix_seq']):03d}"


def _job_number(row: dict[str, Any]) -> str:
    return f"MNT-{int(row['job_year'])}-{int(row['year_seq']):03d}"


def _single_line(value: Any) -> str:
    return " ".join(str(value or "").split())


def _fail(message: str, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=message)


def _changed_by_someone() -> HTTPException:
    return _fail(
        "Somebody else has just changed this job. Close this window "
        "and open the asset again.",
        409,
    )


def _short(value: str, limit: int = 140) -> str:

    value = _single_line(value)

    if len(value) <= limit:
        return value

    return value[: limit - 1].rstrip() + "..."


def _choice(value: Any, allowed: list[str], message: str) -> str:

    clean = _single_line(value)

    for item in allowed:
        if item.lower() == clean.lower():
            return item

    raise _fail(message)


def _clean_note(note: Any, required: bool = False) -> str:

    clean = str(note or "").strip()

    if required and not clean:
        raise _fail("Write the note first.")

    if len(clean) > MAX_NOTE:
        raise _fail(
            f"The note is too long (at most {MAX_NOTE} characters)."
        )

    return clean


def _to_date(value: Any) -> date | None:
    """A database date (date or text) as a date."""

    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _iso_date(value: Any) -> str | None:

    day = _to_date(value)

    return day.isoformat() if day is not None else None


def _parse_date(value: Any, label: str) -> date | None:
    """
    A date typed on the screen (YYYY-MM-DD). Empty gives None.
    """

    clean = str(value or "").strip()

    if not clean:
        return None

    try:
        parsed = datetime.strptime(clean, "%Y-%m-%d").date()
    except ValueError:
        raise _fail(f"The {label} is not a valid date.") from None

    if parsed < MIN_DATE or parsed > MAX_DATE:
        raise _fail(f"The {label} is not a valid date.")

    return parsed


def _fmt_date(day: date | None) -> str:

    if day is None:
        return ""

    return f"{day.day:02d} {MONTHS[day.month - 1]} {day.year}"


def _days_word(count: int) -> str:
    return "1 day" if count == 1 else f"{count} days"


def _clean_text(
    value: Any,
    label: str,
    limit: int,
    required: bool,
    required_message: str,
) -> str:

    clean = _single_line(value)

    if required and not clean:
        raise _fail(required_message)

    if len(clean) > limit:
        raise _fail(
            f"The {label} is too long (at most {limit} characters)."
        )

    return clean


# =========================================================
# STATUS WORKED OUT FROM THE JOBS
# =========================================================

# What the jobs of one asset say (zero jobs = all empty).
_EMPTY_AGGREGATE = {
    "in_progress": 0,
    "scheduled": 0,
    "next_due": None,
    "open_due": None,
}


def _aggregates(
    db: Session,
    asset_id: int | None = None,
) -> dict[int, dict[str, Any]]:
    """
    For every asset that has open jobs (Scheduled or In Progress):
    how many, the earliest Scheduled due date and the earliest due
    date of any open job.
    """

    where = ""
    params: dict[str, Any] = {}

    if asset_id is not None:
        where = " AND asset_id = :asset_id"
        params["asset_id"] = asset_id

    rows = run_rows(
        db,
        "SELECT asset_id, "
        "COALESCE(SUM(CASE WHEN status = 'In Progress' "
        "THEN 1 ELSE 0 END), 0) AS in_progress, "
        "COALESCE(SUM(CASE WHEN status = 'Scheduled' "
        "THEN 1 ELSE 0 END), 0) AS scheduled, "
        "MIN(CASE WHEN status = 'Scheduled' "
        "THEN due_date END) AS next_due, "
        "MIN(due_date) AS open_due "
        "FROM port_maintenance_jobs "
        "WHERE status IN ('Scheduled', 'In Progress')"
        f"{where} "
        "GROUP BY asset_id",
        params,
    )

    return {
        row["asset_id"]: {
            "in_progress": int(row["in_progress"] or 0),
            "scheduled": int(row["scheduled"] or 0),
            "next_due": _to_date(row["next_due"]),
            "open_due": _to_date(row["open_due"]),
        }
        for row in rows
    }


def _display_status(
    manual_status: str,
    aggregate: dict[str, Any],
    today: date,
) -> str:
    """The status shown for an asset."""

    if manual_status == "Out of Service":
        return "Out of Service"

    if aggregate["in_progress"] > 0:
        return "Maintenance"

    open_due = aggregate["open_due"]

    if open_due is not None and open_due < today:
        return "Overdue"

    next_due = aggregate["next_due"]

    if (
        next_due is not None
        and next_due <= today + timedelta(days=DUE_SOON_DAYS)
    ):
        return "Maintenance Due"

    return "Operational"


# =========================================================
# READ
# =========================================================

_ASSET_COLUMNS = """
    id, asset_prefix, prefix_seq, name, category, location,
    serial_number, status, status_changed_at, last_maintenance_on,
    created_by_id, created_by_name, created_by_role, created_at,
    updated_at
"""

_JOB_COLUMNS = """
    id, job_year, year_seq, asset_id, job_type, description,
    status, due_date, started_at, completed_on, assigned_to_id,
    assigned_to_name, created_by_id, created_by_name,
    created_by_role, created_at, updated_at
"""


def _asset_payload(
    row: dict[str, Any],
    aggregate: dict[str, Any],
    by_id: dict[int, dict[str, Any]],
    actor: dict[str, Any],
    today: date,
) -> dict[str, Any]:

    next_due = aggregate["next_due"]

    return {
        "id": row["id"],
        "code": _code(row),
        "name": row["name"],
        "category": row["category"],
        "location": row["location"],
        "serial_number": row["serial_number"] or "",
        "manual_status": row["status"],
        "status": _display_status(row["status"], aggregate, today),
        "last_maintenance": _iso_date(row["last_maintenance_on"]),
        "next_maintenance": _iso_date(next_due),
        "next_maintenance_overdue": (
            next_due is not None and next_due < today
        ),
        "open_jobs": aggregate["in_progress"] + aggregate["scheduled"],
        "status_changed_at": iso(row["status_changed_at"]),
        "created_by": _person(
            by_id,
            row["created_by_id"],
            row["created_by_name"],
            row["created_by_role"],
        ),
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
        "can_delete": bool(actor["admin"]),
    }


def _job_payload(
    row: dict[str, Any],
    by_id: dict[int, dict[str, Any]],
    today: date,
) -> dict[str, Any]:

    due = _to_date(row["due_date"])

    is_open = row["status"] in OPEN_JOB_STATUSES

    overdue = bool(is_open and due is not None and due < today)

    return {
        "id": row["id"],
        "number": _job_number(row),
        "asset_id": row["asset_id"],
        "type": row["job_type"],
        "description": row["description"] or "",
        "status": row["status"],
        "overdue": overdue,
        "days_overdue": (today - due).days if overdue else 0,
        "due_date": _iso_date(due),
        "started_at": iso(row["started_at"]),
        "completed_on": _iso_date(row["completed_on"]),
        "assigned_to": _person(
            by_id,
            row["assigned_to_id"],
            row["assigned_to_name"],
        ),
        "created_by": _person(
            by_id,
            row["created_by_id"],
            row["created_by_name"],
            row["created_by_role"],
        ),
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
    }


def _event_payload(
    row: dict[str, Any],
    by_id: dict[int, dict[str, Any]],
) -> dict[str, Any]:

    return {
        "id": row["id"],
        "job_id": row["job_id"],
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


def _get_row(db: Session, asset_id: int) -> dict[str, Any]:

    rows = run_rows(
        db,
        f"SELECT {_ASSET_COLUMNS} FROM port_assets WHERE id = :id",
        {"id": asset_id},
    )

    if not rows:
        raise _fail(
            "This asset does not exist (it may have been deleted).",
            404,
        )

    return rows[0]


def _get_job_row(
    db: Session,
    asset_id: int,
    job_id: int,
) -> dict[str, Any]:

    rows = run_rows(
        db,
        f"SELECT {_JOB_COLUMNS} FROM port_maintenance_jobs "
        "WHERE id = :id AND asset_id = :asset_id",
        {"id": job_id, "asset_id": asset_id},
    )

    if not rows:
        raise _fail(
            "This maintenance job does not exist "
            "(it may have been deleted).",
            404,
        )

    return rows[0]


def _detail(
    db: Session,
    actor: dict[str, Any],
    asset_id: int,
) -> dict[str, Any]:
    """One asset with its jobs and its whole history."""

    row = _get_row(db, asset_id)

    by_id = _by_id(db)

    today = port_today()

    aggregate = _aggregates(db, asset_id).get(
        asset_id,
        _EMPTY_AGGREGATE,
    )

    jobs = run_rows(
        db,
        f"SELECT {_JOB_COLUMNS} FROM port_maintenance_jobs "
        "WHERE asset_id = :id "
        "ORDER BY due_date DESC, id DESC LIMIT :limit",
        {"id": asset_id, "limit": JOB_LIMIT},
    )

    events = run_rows(
        db,
        "SELECT id, asset_id, job_id, event_type, actor_id, "
        "actor_name, actor_role, old_value, new_value, note, "
        "created_at FROM port_asset_events WHERE asset_id = :id "
        "ORDER BY id ASC",
        {"id": asset_id},
    )

    return {
        "asset": _asset_payload(row, aggregate, by_id, actor, today),
        "jobs": [_job_payload(job, by_id, today) for job in jobs],
        "events": [_event_payload(event, by_id) for event in events],
    }


def get_asset(
    db: Session,
    user: User,
    asset_id: int,
) -> dict[str, Any]:

    return _detail(db, _actor(user), asset_id)


def _summary(
    db: Session,
    assets: list[dict[str, Any]],
    today: date,
) -> dict[str, Any]:
    """The numbers on the cards, counted from the real records."""

    operational = sum(
        1 for asset in assets if asset["status"] == "Operational"
    )

    maintenance = sum(
        1 for asset in assets if asset["status"] == "Maintenance"
    )

    counts: dict[str, int] = {}

    for asset in assets:
        counts[asset["category"]] = counts.get(asset["category"], 0) + 1

    categories = [
        {"category": name, "count": counts[name]}
        for name in CATEGORIES
        if counts.get(name)
    ]

    rows = run_rows(
        db,
        "SELECT "
        "COALESCE(SUM(CASE WHEN status = 'Scheduled' "
        "AND due_date >= :today THEN 1 ELSE 0 END), 0) AS scheduled, "
        "COALESCE(SUM(CASE WHEN status = 'In Progress' "
        "THEN 1 ELSE 0 END), 0) AS in_progress, "
        "COALESCE(SUM(CASE WHEN status = 'Completed' "
        "THEN 1 ELSE 0 END), 0) AS completed, "
        "COALESCE(SUM(CASE WHEN status IN "
        "('Scheduled', 'In Progress') AND due_date < :today "
        "THEN 1 ELSE 0 END), 0) AS overdue "
        "FROM port_maintenance_jobs",
        {"today": today},
    )

    jobs = rows[0] if rows else {}

    return {
        "total": len(assets),
        "operational": operational,
        "maintenance": maintenance,
        "attention": len(assets) - operational - maintenance,
        "categories": categories,
        "jobs": {
            "scheduled": int(jobs.get("scheduled") or 0),
            "in_progress": int(jobs.get("in_progress") or 0),
            "completed": int(jobs.get("completed") or 0),
            "overdue": int(jobs.get("overdue") or 0),
        },
    }


def _alerts(db: Session, today: date) -> list[dict[str, Any]]:
    """
    Equipment that needs attention, worked out from the real
    records: out of service, overdue, being worked on, due soon.
    """

    soon = today + timedelta(days=DUE_SOON_DAYS)

    alerts: list[dict[str, Any]] = []

    for row in run_rows(
        db,
        "SELECT id, asset_prefix, prefix_seq, name, "
        "status_changed_at FROM port_assets "
        "WHERE status = 'Out of Service' "
        "ORDER BY status_changed_at ASC, id ASC LIMIT :limit",
        {"limit": ALERT_LIMIT},
    ):

        since = to_datetime(row["status_changed_at"])

        message = "This equipment cannot be used until it is repaired."

        if since is not None:
            message = (
                "Marked out of service on "
                f"{_fmt_date(since.astimezone(PORT_TZ).date())}. "
                "Repair it and return it to service."
            )

        alerts.append(
            {
                "key": f"oos-{row['id']}",
                "type": "critical",
                "asset_id": row["id"],
                "job_id": None,
                "title": f"{row['name']} ({_code(row)}) is out of service",
                "message": message,
            }
        )

    for row in run_rows(
        db,
        "SELECT j.id, j.job_year, j.year_seq, j.job_type, j.status, "
        "j.due_date, a.id AS asset_id, a.asset_prefix, "
        "a.prefix_seq, a.name "
        "FROM port_maintenance_jobs j "
        "JOIN port_assets a ON a.id = j.asset_id "
        "WHERE j.status IN ('Scheduled', 'In Progress') "
        "AND (j.status = 'In Progress' OR j.due_date <= :soon) "
        "ORDER BY j.due_date ASC, j.id ASC LIMIT :limit",
        {"soon": soon, "limit": 200},
    ):

        due = _to_date(row["due_date"])

        number = _job_number(row)

        label = f"{row['name']} ({_code(row)})"

        if due is not None and due < today:

            late = (today - due).days

            if row["status"] == "In Progress":
                message = (
                    f"{number} ({row['job_type']}) is still in "
                    f"progress. It was due on {_fmt_date(due)} "
                    f"({_days_word(late)} overdue)."
                )
            else:
                message = (
                    f"{number} ({row['job_type']}) was due on "
                    f"{_fmt_date(due)} ({_days_word(late)} "
                    "overdue). Immediate action is recommended."
                )

            alerts.append(
                {
                    "key": f"job-{row['id']}",
                    "type": "critical",
                    "asset_id": row["asset_id"],
                    "job_id": row["id"],
                    "title": f"{label} maintenance overdue",
                    "message": message,
                }
            )

        elif row["status"] == "In Progress":

            alerts.append(
                {
                    "key": f"job-{row['id']}",
                    "type": "warning",
                    "asset_id": row["asset_id"],
                    "job_id": row["id"],
                    "title": f"{label} under maintenance",
                    "message": (
                        f"{number} ({row['job_type']}) is in "
                        f"progress. It is due on {_fmt_date(due)}."
                    ),
                }
            )

        else:

            days = (due - today).days if due is not None else 0

            if days == 0:
                when = "today"
            elif days == 1:
                when = "tomorrow"
            else:
                when = f"in {days} days"

            alerts.append(
                {
                    "key": f"job-{row['id']}",
                    "type": "info",
                    "asset_id": row["asset_id"],
                    "job_id": row["id"],
                    "title": f"{label} maintenance due",
                    "message": (
                        f"{number} ({row['job_type']}) is due on "
                        f"{_fmt_date(due)} ({when})."
                    ),
                }
            )

    order = {"critical": 0, "warning": 1, "info": 2}

    # sorted() keeps the order inside each group (oldest first).
    alerts = sorted(alerts, key=lambda alert: order[alert["type"]])

    return alerts[:ALERT_LIMIT]


def list_assets(db: Session, user: User) -> dict[str, Any]:
    """Every asset, with the numbers and alerts worked out from it."""

    actor = _actor(user)

    today = port_today()

    rows = run_rows(
        db,
        f"SELECT {_ASSET_COLUMNS} FROM port_assets "
        "ORDER BY asset_prefix ASC, prefix_seq ASC LIMIT :limit",
        {"limit": LIST_LIMIT},
    )

    by_id = _by_id(db)

    aggregates = _aggregates(db)

    assets = [
        _asset_payload(
            row,
            aggregates.get(row["id"], _EMPTY_AGGREGATE),
            by_id,
            actor,
            today,
        )
        for row in rows
    ]

    # Jobs that have just become overdue tell the team once.
    _notify_overdue(db, today)

    return {
        "assets": assets,
        "summary": _summary(db, assets, today),
        "alerts": _alerts(db, today),
        "today": today.isoformat(),
    }


def list_assignees(db: Session) -> list[dict[str, Any]]:
    """Accounts a maintenance job can be assigned to."""

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


# =========================================================
# BELL NOTIFICATIONS
# =========================================================


def _holders(db: Session) -> list[int]:
    """Active accounts that have the Asset Maintenance feature."""

    return [
        person["id"]
        for person in get_directory(db)
        if person["active"] and FEATURE_KEY in person["features"]
    ]


def _notify(
    db: Session,
    user_ids: list[Any],
    title: str,
    message: str,
    kind: str,
    dedupe_key: str,
) -> bool:
    """
    Give a notification to some accounts. Only active accounts
    receive it. A problem here never breaks the action itself,
    which is already saved. Returns False only when the
    notification could not be saved.
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
        return True

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

        return True

    except Exception:

        db.rollback()

        logger.exception("Asset notification could not be saved.")

        return False


def _notify_overdue(db: Session, today: date) -> None:
    """
    Tell the team about jobs that are now past their due date.
    Every job is announced once (overdue_notified). Called when
    the register is read; it never raises.
    """

    try:

        rows = run_rows(
            db,
            "SELECT j.id, j.job_year, j.year_seq, j.job_type, "
            "j.due_date, j.assigned_to_id, a.asset_prefix, "
            "a.prefix_seq, a.name "
            "FROM port_maintenance_jobs j "
            "JOIN port_assets a ON a.id = j.asset_id "
            "WHERE j.status IN ('Scheduled', 'In Progress') "
            "AND j.due_date < :today "
            "AND j.overdue_notified = FALSE "
            "ORDER BY j.due_date ASC, j.id ASC LIMIT :limit",
            {"today": today, "limit": OVERDUE_BATCH},
        )

        if not rows:
            return

        holders = _holders(db)

        for row in rows:

            due = _to_date(row["due_date"])

            saved = _notify(
                db,
                [*holders, row["assigned_to_id"]],
                title="Maintenance overdue",
                message=(
                    f"{row['name']} ({_code(row)}): "
                    f"{_job_number(row)} ({row['job_type']}) was "
                    f"due on {_fmt_date(due)}."
                ),
                kind="error",
                dedupe_key=f"asset-overdue:{row['id']}",
            )

            if not saved:
                continue

            db.execute(
                text(
                    "UPDATE port_maintenance_jobs "
                    "SET overdue_notified = TRUE WHERE id = :id"
                ),
                {"id": row["id"]},
            )

            db.commit()

    except Exception:

        db.rollback()

        logger.exception("Overdue notifications could not be sent.")


# =========================================================
# HISTORY
# =========================================================


def _add_event(
    db: Session,
    asset_id: int,
    job_id: int | None,
    actor: dict[str, Any],
    event_type: str,
    old_value: str | None,
    new_value: str | None,
    note: str,
    moment: datetime,
) -> int:

    return db.execute(
        text(
            "INSERT INTO port_asset_events "
            "(asset_id, job_id, event_type, actor_id, actor_name, "
            "actor_role, old_value, new_value, note, created_at) "
            "VALUES (:i, :j, :e, :a, :an, :ar, :o, :n, :t, :c) "
            "RETURNING id"
        ),
        {
            "i": asset_id,
            "j": job_id,
            "e": event_type,
            "a": actor["id"],
            "an": actor["name"][:120],
            "ar": actor["role"][:80],
            "o": old_value[:160] if old_value else None,
            "n": new_value[:160] if new_value else None,
            "t": note or None,
            "c": moment,
        },
    ).scalar()


# =========================================================
# ADD AN ASSET
# =========================================================


def _find_same_name(
    db: Session,
    name: str,
    skip_id: int | None = None,
) -> dict[str, Any] | None:

    rows = run_rows(
        db,
        "SELECT id, asset_prefix, prefix_seq FROM port_assets "
        "WHERE LOWER(name) = :name",
        {"name": name.lower()},
    )

    for row in rows:
        if skip_id is None or row["id"] != skip_id:
            return row

    return None


def _check_assignee(
    db: Session,
    assignee_id: Any,
) -> dict[str, Any] | None:
    """The account a job is assigned to (None = nobody)."""

    if assignee_id is None:
        return None

    candidate = _by_id(db).get(assignee_id)

    if (
        candidate is None
        or not candidate["active"]
        or FEATURE_KEY not in candidate["features"]
    ):
        raise _fail(
            "That account cannot work on maintenance. Choose "
            "another person."
        )

    return {
        "id": candidate["id"],
        "name": candidate["name"],
        "role": candidate["role"],
    }


def _insert_job(
    db: Session,
    asset_id: int,
    actor: dict[str, Any],
    job_type: str,
    description: str,
    due: date,
    assignee: dict[str, Any] | None,
    today: date,
    now: datetime,
) -> dict[str, Any]:
    """
    Save a Scheduled job and its history line. The caller commits
    (and starts again if two people got the same number).
    """

    sequence = (
        run_scalar(
            db,
            "SELECT COALESCE(MAX(year_seq), 0) "
            "FROM port_maintenance_jobs WHERE job_year = :year",
            {"year": now.year},
        )
        or 0
    ) + 1

    job_id = db.execute(
        text(
            "INSERT INTO port_maintenance_jobs "
            "(job_year, year_seq, asset_id, job_type, description, "
            "status, due_date, assigned_to_id, assigned_to_name, "
            "created_by_id, created_by_name, created_by_role, "
            "overdue_notified, created_at, updated_at) "
            "VALUES (:y, :q, :a, :t, :d, 'Scheduled', :due, :ai, "
            ":an, :ci, :cn, :cr, :ov, :c, :u) RETURNING id"
        ),
        {
            "y": now.year,
            "q": sequence,
            "a": asset_id,
            "t": job_type,
            "d": description or None,
            "due": due,
            "ai": assignee["id"] if assignee else None,
            "an": assignee["name"][:120] if assignee else None,
            "ci": actor["id"],
            "cn": actor["name"][:120],
            "cr": actor["role"][:80],
            # A job entered when it is already late is known to
            # the person who entered it: no bell message for it.
            "ov": due < today,
            "c": now,
            "u": now,
        },
    ).scalar()

    number = f"MNT-{now.year}-{sequence:03d}"

    _add_event(
        db,
        asset_id,
        job_id,
        actor,
        "job_scheduled",
        None,
        f"{number} ({job_type}), due {_fmt_date(due)}",
        description,
        now,
    )

    return {"id": job_id, "number": number}


def create_asset(
    db: Session,
    user: User,
    name: Any,
    category: Any,
    location: Any,
    serial_number: Any,
    last_maintenance_on: Any,
    next_maintenance_on: Any,
) -> dict[str, Any]:
    """An employee adds a piece of equipment to the register."""

    actor = _actor(user)

    now = utc_now()

    today = port_today()

    clean_category = _choice(
        category,
        CATEGORIES,
        "Choose a category.",
    )

    clean_name = _clean_text(
        name,
        "asset name",
        MAX_NAME,
        True,
        "Enter the asset name (for example Container Crane 01).",
    )

    clean_location = _clean_text(
        location,
        "location",
        MAX_LOCATION,
        True,
        "Enter where the asset is (for example Berth 1).",
    )

    clean_serial = _clean_text(
        serial_number,
        "serial number",
        MAX_SERIAL,
        False,
        "",
    )

    last_day = _parse_date(
        last_maintenance_on,
        "last maintenance date",
    )

    if last_day is not None and last_day > today + DATE_SLACK:
        raise _fail("The last maintenance date cannot be in the future.")

    next_day = _parse_date(
        next_maintenance_on,
        "next maintenance date",
    )

    same = _find_same_name(db, clean_name)

    if same is not None:
        raise _fail(
            f"An asset named {clean_name} already exists "
            f"({_code(same)}). Use a different name."
        )

    prefix = PREFIX_OF[clean_category]

    asset_id = None

    for attempt in range(NUMBER_ATTEMPTS):

        try:

            sequence = (
                run_scalar(
                    db,
                    "SELECT COALESCE(MAX(prefix_seq), 0) "
                    "FROM port_assets WHERE asset_prefix = :prefix",
                    {"prefix": prefix},
                )
                or 0
            ) + 1

            asset_id = db.execute(
                text(
                    "INSERT INTO port_assets "
                    "(asset_prefix, prefix_seq, name, category, "
                    "location, serial_number, status, "
                    "last_maintenance_on, created_by_id, "
                    "created_by_name, created_by_role, created_at, "
                    "updated_at) "
                    "VALUES (:p, :q, :n, :c, :l, :s, 'Operational', "
                    ":lm, :ci, :cn, :cr, :cr_at, :up) "
                    "RETURNING id"
                ),
                {
                    "p": prefix,
                    "q": sequence,
                    "n": clean_name,
                    "c": clean_category,
                    "l": clean_location,
                    "s": clean_serial or None,
                    "lm": last_day,
                    "ci": actor["id"],
                    "cn": actor["name"][:120],
                    "cr": actor["role"][:80],
                    "cr_at": now,
                    "up": now,
                },
            ).scalar()

            _add_event(
                db,
                asset_id,
                None,
                actor,
                "registered",
                None,
                f"{prefix}-{sequence:03d}",
                "",
                now,
            )

            if next_day is not None:
                _insert_job(
                    db,
                    asset_id,
                    actor,
                    "Preventive Maintenance",
                    "First maintenance date entered when the "
                    "asset was added.",
                    next_day,
                    None,
                    today,
                    now,
                )

            db.commit()

            break

        except Exception as exc:

            db.rollback()

            asset_id = None

            # Two people added at the same moment and got the same
            # number: count again.
            if attempt == NUMBER_ATTEMPTS - 1:

                logger.exception("The asset could not be saved.")

                raise _fail(
                    "The asset could not be saved "
                    f"({type(exc).__name__}). Please try again.",
                    500,
                ) from exc

    return _detail(db, actor, asset_id)


# =========================================================
# EDIT / STATUS / NOTES
# =========================================================


def update_asset(
    db: Session,
    user: User,
    asset_id: int,
    name: Any,
    location: Any,
    serial_number: Any,
) -> dict[str, Any]:
    """Change the name, location or serial number of an asset."""

    actor = _actor(user)

    row = _get_row(db, asset_id)

    clean_name = _clean_text(
        name,
        "asset name",
        MAX_NAME,
        True,
        "Enter the asset name (for example Container Crane 01).",
    )

    clean_location = _clean_text(
        location,
        "location",
        MAX_LOCATION,
        True,
        "Enter where the asset is (for example Berth 1).",
    )

    clean_serial = _clean_text(
        serial_number,
        "serial number",
        MAX_SERIAL,
        False,
        "",
    )

    changes = []

    if clean_name != row["name"]:
        changes.append(f"Name: {row['name']} -> {clean_name}")

    if clean_location != row["location"]:
        changes.append(
            f"Location: {row['location']} -> {clean_location}"
        )

    if clean_serial != (row["serial_number"] or ""):
        changes.append(
            f"Serial number: {row['serial_number'] or '(none)'} -> "
            f"{clean_serial or '(none)'}"
        )

    if not changes:
        raise _fail("Nothing was changed.")

    same = _find_same_name(db, clean_name, skip_id=asset_id)

    if same is not None:
        raise _fail(
            f"An asset named {clean_name} already exists "
            f"({_code(same)}). Use a different name."
        )

    now = utc_now()

    try:

        db.execute(
            text(
                "UPDATE port_assets SET name = :n, location = :l, "
                "serial_number = :s, updated_at = :u WHERE id = :id"
            ),
            {
                "n": clean_name,
                "l": clean_location,
                "s": clean_serial or None,
                "u": now,
                "id": asset_id,
            },
        )

        _add_event(
            db,
            asset_id,
            None,
            actor,
            "edited",
            None,
            None,
            "\n".join(changes),
            now,
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The asset could not be changed.")

        raise _fail(
            "The asset could not be changed "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    return _detail(db, actor, asset_id)


def _set_status(
    db: Session,
    asset_id: int,
    actor: dict[str, Any],
    old_status: str,
    new_status: str,
    note: str,
    now: datetime,
) -> int:
    """Save a new manual status and its history line (no commit)."""

    db.execute(
        text(
            "UPDATE port_assets SET status = :s, "
            "status_changed_at = :c, updated_at = :c WHERE id = :id"
        ),
        {"s": new_status, "c": now, "id": asset_id},
    )

    return _add_event(
        db,
        asset_id,
        None,
        actor,
        "status",
        old_status,
        new_status,
        note,
        now,
    )


def _notify_status(
    db: Session,
    row: dict[str, Any],
    actor: dict[str, Any],
    new_status: str,
    note: str,
    event_id: int,
) -> None:

    out = new_status == "Out of Service"

    message = (
        f"{row['name']} ({_code(row)}) is out of service."
        if out
        else f"{row['name']} ({_code(row)}) is back in service."
    )

    if note:
        message = f"{message} {_short(note, 100)}"

    _notify(
        db,
        [user_id for user_id in _holders(db) if user_id != actor["id"]],
        title=(
            "Equipment out of service" if out else "Equipment back in service"
        ),
        message=message,
        kind="error" if out else "success",
        dedupe_key=f"asset-status:{event_id}",
    )


def change_status(
    db: Session,
    user: User,
    asset_id: int,
    new_status: Any,
    note: Any,
) -> dict[str, Any]:
    """Mark an asset out of service, or return it to service."""

    actor = _actor(user)

    status = _choice(
        new_status,
        ASSET_STATUSES,
        "Choose Operational or Out of Service.",
    )

    clean_note = _clean_note(note)

    row = _get_row(db, asset_id)

    if row["status"] == status:
        raise _fail(f"The asset is already {status}.")

    now = utc_now()

    try:

        event_id = _set_status(
            db,
            asset_id,
            actor,
            row["status"],
            status,
            clean_note,
            now,
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The asset status could not be changed.")

        raise _fail(
            "The status could not be changed "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    _notify_status(db, row, actor, status, clean_note, event_id)

    return _detail(db, actor, asset_id)


def add_note(
    db: Session,
    user: User,
    asset_id: int,
    note: Any,
) -> dict[str, Any]:

    actor = _actor(user)

    clean_note = _clean_note(note, required=True)

    _get_row(db, asset_id)

    now = utc_now()

    try:

        _add_event(
            db,
            asset_id,
            None,
            actor,
            "note",
            None,
            None,
            clean_note,
            now,
        )

        db.execute(
            text(
                "UPDATE port_assets SET updated_at = :u "
                "WHERE id = :id"
            ),
            {"u": now, "id": asset_id},
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

    return _detail(db, actor, asset_id)


# =========================================================
# MAINTENANCE JOBS
# =========================================================


def schedule_job(
    db: Session,
    user: User,
    asset_id: int,
    job_type: Any,
    due_date: Any,
    description: Any,
    assignee_id: Any,
) -> dict[str, Any]:
    """Schedule a maintenance job for an asset."""

    actor = _actor(user)

    now = utc_now()

    today = port_today()

    row = _get_row(db, asset_id)

    clean_type = _choice(job_type, JOB_TYPES, "Choose a job type.")

    due = _parse_date(due_date, "due date")

    if due is None:
        raise _fail("Choose the date the job is due.")

    clean_description = str(description or "").strip()

    if len(clean_description) > MAX_DESCRIPTION:
        raise _fail(
            "The description is too long (at most "
            f"{MAX_DESCRIPTION} characters)."
        )

    assignee = _check_assignee(db, assignee_id)

    job = None

    for attempt in range(NUMBER_ATTEMPTS):

        try:

            job = _insert_job(
                db,
                asset_id,
                actor,
                clean_type,
                clean_description,
                due,
                assignee,
                today,
                now,
            )

            db.execute(
                text(
                    "UPDATE port_assets SET updated_at = :u "
                    "WHERE id = :id"
                ),
                {"u": now, "id": asset_id},
            )

            db.commit()

            break

        except Exception as exc:

            db.rollback()

            job = None

            if attempt == NUMBER_ATTEMPTS - 1:

                logger.exception("The job could not be saved.")

                raise _fail(
                    "The job could not be saved "
                    f"({type(exc).__name__}). Please try again.",
                    500,
                ) from exc

    if assignee is not None and assignee["id"] != actor["id"]:

        _notify(
            db,
            [assignee["id"]],
            title="Maintenance job assigned to you",
            message=(
                f"{job['number']}: {clean_type} on {row['name']} "
                f"({_code(row)}), due {_fmt_date(due)}."
            ),
            kind="info",
            dedupe_key=f"asset-assign:{job['id']}",
        )

    return _detail(db, actor, asset_id)


def _job_label(row: dict[str, Any]) -> str:
    return f"{_job_number(row)} ({row['job_type']})"


def _tell_job_people(
    db: Session,
    asset: dict[str, Any],
    job: dict[str, Any],
    actor: dict[str, Any],
    title: str,
    verb: str,
    kind: str,
    dedupe_key: str,
) -> None:
    """Tell the person who scheduled the job and who it is assigned to."""

    _notify(
        db,
        [
            user_id
            for user_id in (
                job["created_by_id"],
                job["assigned_to_id"],
            )
            if user_id != actor["id"]
        ],
        title=title,
        message=(
            f"{_job_label(job)} on {asset['name']} "
            f"({_code(asset)}) {verb}."
        ),
        kind=kind,
        dedupe_key=dedupe_key,
    )


def start_job(
    db: Session,
    user: User,
    asset_id: int,
    job_id: int,
    note: Any,
) -> dict[str, Any]:
    """The work on a Scheduled job begins."""

    actor = _actor(user)

    clean_note = _clean_note(note)

    asset = _get_row(db, asset_id)

    job = _get_job_row(db, asset_id, job_id)

    if job["status"] != "Scheduled":
        raise _fail(
            f"Only a Scheduled job can be started. This job is "
            f"{job['status']}."
        )

    now = utc_now()

    try:

        result = db.execute(
            text(
                "UPDATE port_maintenance_jobs SET status = "
                "'In Progress', started_at = :s, updated_at = :s "
                "WHERE id = :id AND status = 'Scheduled'"
            ),
            {"s": now, "id": job_id},
        )

        if not result.rowcount:
            raise _changed_by_someone()

        db.execute(
            text(
                "UPDATE port_assets SET updated_at = :u "
                "WHERE id = :id"
            ),
            {"u": now, "id": asset_id},
        )

        event_id = _add_event(
            db,
            asset_id,
            job_id,
            actor,
            "job_started",
            "Scheduled",
            _job_label(job),
            clean_note,
            now,
        )

        db.commit()

    except HTTPException:

        db.rollback()

        raise

    except Exception as exc:

        db.rollback()

        logger.exception("The job could not be started.")

        raise _fail(
            f"The job could not be started ({type(exc).__name__}). "
            "Please try again.",
            500,
        ) from exc

    _tell_job_people(
        db,
        asset,
        job,
        actor,
        "Maintenance started",
        "was started",
        "info",
        f"asset-start:{event_id}",
    )

    return _detail(db, actor, asset_id)


def complete_job(
    db: Session,
    user: User,
    asset_id: int,
    job_id: int,
    completed_on: Any,
    note: Any,
    next_due_date: Any,
    return_to_service: Any,
) -> dict[str, Any]:
    """
    The job is finished. The asset's "last maintenance" date
    becomes the completion date. An optional next date schedules
    the next job. An asset that was out of service can be returned
    to service in the same step.
    """

    actor = _actor(user)

    now = utc_now()

    today = port_today()

    clean_note = _clean_note(note)

    asset = _get_row(db, asset_id)

    job = _get_job_row(db, asset_id, job_id)

    if job["status"] not in OPEN_JOB_STATUSES:
        raise _fail(
            f"This job is already {job['status']} and cannot be "
            "completed."
        )

    finished = _parse_date(completed_on, "completion date") or today

    if finished > today + DATE_SLACK:
        raise _fail("The completion date cannot be in the future.")

    next_day = _parse_date(next_due_date, "next maintenance date")

    if next_day is not None and next_day < finished:
        raise _fail(
            "The next maintenance date cannot be before the "
            "completion date."
        )

    bring_back = (
        bool(return_to_service) and asset["status"] == "Out of Service"
    )

    previous = _to_date(asset["last_maintenance_on"])

    last_day = finished if previous is None else max(previous, finished)

    event_id = None

    status_event_id = None

    for attempt in range(NUMBER_ATTEMPTS):

        try:

            result = db.execute(
                text(
                    "UPDATE port_maintenance_jobs SET status = "
                    "'Completed', completed_on = :d, "
                    "updated_at = :u WHERE id = :id "
                    "AND status IN ('Scheduled', 'In Progress')"
                ),
                {"d": finished, "u": now, "id": job_id},
            )

            if not result.rowcount:
                raise _changed_by_someone()

            db.execute(
                text(
                    "UPDATE port_assets SET last_maintenance_on = "
                    ":d, updated_at = :u WHERE id = :id"
                ),
                {"d": last_day, "u": now, "id": asset_id},
            )

            event_id = _add_event(
                db,
                asset_id,
                job_id,
                actor,
                "job_completed",
                job["status"],
                f"{_job_label(job)}, on {_fmt_date(finished)}",
                clean_note,
                now,
            )

            if bring_back:
                status_event_id = _set_status(
                    db,
                    asset_id,
                    actor,
                    "Out of Service",
                    "Operational",
                    "Returned to service after "
                    f"{_job_number(job)}.",
                    now,
                )

            if next_day is not None:
                _insert_job(
                    db,
                    asset_id,
                    actor,
                    job["job_type"],
                    "Follow-up scheduled when "
                    f"{_job_number(job)} was completed.",
                    next_day,
                    None,
                    today,
                    now,
                )

            db.commit()

            break

        except HTTPException:

            db.rollback()

            raise

        except Exception as exc:

            db.rollback()

            event_id = None

            status_event_id = None

            if attempt == NUMBER_ATTEMPTS - 1:

                logger.exception("The job could not be completed.")

                raise _fail(
                    "The job could not be completed "
                    f"({type(exc).__name__}). Please try again.",
                    500,
                ) from exc

    _tell_job_people(
        db,
        asset,
        job,
        actor,
        "Maintenance completed",
        "was completed",
        "success",
        f"asset-done:{event_id}",
    )

    if status_event_id is not None:
        _notify_status(
            db,
            asset,
            actor,
            "Operational",
            "",
            status_event_id,
        )

    return _detail(db, actor, asset_id)


def cancel_job(
    db: Session,
    user: User,
    asset_id: int,
    job_id: int,
    note: Any,
) -> dict[str, Any]:
    """A job that will not be done is cancelled (with the reason)."""

    actor = _actor(user)

    clean_note = _clean_note(note)

    if not clean_note:
        raise _fail("Write why the job is cancelled.")

    asset = _get_row(db, asset_id)

    job = _get_job_row(db, asset_id, job_id)

    if job["status"] not in OPEN_JOB_STATUSES:
        raise _fail(
            f"This job is already {job['status']} and cannot be "
            "cancelled."
        )

    now = utc_now()

    try:

        result = db.execute(
            text(
                "UPDATE port_maintenance_jobs SET status = "
                "'Cancelled', updated_at = :u WHERE id = :id "
                "AND status IN ('Scheduled', 'In Progress')"
            ),
            {"u": now, "id": job_id},
        )

        if not result.rowcount:
            raise _changed_by_someone()

        db.execute(
            text(
                "UPDATE port_assets SET updated_at = :u "
                "WHERE id = :id"
            ),
            {"u": now, "id": asset_id},
        )

        event_id = _add_event(
            db,
            asset_id,
            job_id,
            actor,
            "job_cancelled",
            job["status"],
            _job_label(job),
            clean_note,
            now,
        )

        db.commit()

    except HTTPException:

        db.rollback()

        raise

    except Exception as exc:

        db.rollback()

        logger.exception("The job could not be cancelled.")

        raise _fail(
            f"The job could not be cancelled ({type(exc).__name__}). "
            "Please try again.",
            500,
        ) from exc

    _tell_job_people(
        db,
        asset,
        job,
        actor,
        "Maintenance cancelled",
        "was cancelled",
        "warning",
        f"asset-cancel:{event_id}",
    )

    return _detail(db, actor, asset_id)


# =========================================================
# DELETE (Port Administrator only)
# =========================================================


def delete_asset(
    db: Session,
    user: User,
    asset_id: int,
) -> dict[str, Any]:
    """
    An asset record holds the maintenance history of the
    equipment, so only a Port Administrator can remove it (with
    its jobs and its history).
    """

    actor = _actor(user)

    if not actor["admin"]:
        raise _fail(
            "Only a Port Administrator can delete an asset record.",
            403,
        )

    _get_row(db, asset_id)

    try:

        db.execute(
            text(
                "DELETE FROM port_asset_events "
                "WHERE asset_id = :id"
            ),
            {"id": asset_id},
        )

        db.execute(
            text(
                "DELETE FROM port_maintenance_jobs "
                "WHERE asset_id = :id"
            ),
            {"id": asset_id},
        )

        db.execute(
            text("DELETE FROM port_assets WHERE id = :id"),
            {"id": asset_id},
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The asset could not be deleted.")

        raise _fail(
            "The asset could not be deleted "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    return {"ok": True, "id": asset_id}
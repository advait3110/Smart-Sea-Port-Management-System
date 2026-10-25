"""
Audit Log - the permanent record of who did what, and when.

What this file does
-------------------
- Creates its own table the first time it is needed (no Alembic
  migration is required):
    audit_log      one row for every recorded action
- Nobody can change or delete a row. There is no route for it, and
  on PostgreSQL a trigger refuses UPDATE and DELETE even for the
  backend itself.
- The record is made in two ways:

  1. ONE central place (the audit middleware in app/main.py) watches
     every request that CHANGES data (POST, PUT, PATCH, DELETE) and
     writes a row with the person, the module, the action, the
     record it touched and whether it worked. This way no module
     has to be edited, and a module added later is recorded too.
     For accounts and roles the row also shows the value BEFORE and
     AFTER the change.

  2. A few places call record() themselves because they know more
     than the request shows: signing in and failed sign-ins
     (auth.py) and the document library (document_service.py).

- What is NOT recorded:
    * reading (GET) - except downloading a document;
    * chat, notifications, presence heartbeats, weather, AIS;
    * requests that were refused as invalid (wrong input, not
      found, duplicate) because nothing was changed;
    * passwords, ever. Chat message text, ever.
- A problem while writing the log never stops the real work: every
  recording is wrapped so it only logs a warning.

Who may read it, and what it shows
----------------------------------
ONLY the Port Administrator and the Port Executive (checked by the
server in app/api/routes/audit.py, whatever features a role has).

The page shows the PORT'S ACTIVITY only: vessels, berths, cargo,
gate and trucks, incidents, equipment and documents (PORT_MODULES).
Sign-ins, account and role changes are still written to the
database (they are the security trail) but are not shown there.

The log is only ever read through GET /audit, /audit/summary and
/audit/export.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import re
import threading
from datetime import date, datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.role import Role
from app.models.user import User
from app.services.chat_service import iso, to_datetime, utc_now


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

FEATURE_KEY = "audit_logs"

# Singapore time is UTC+8 all year (no daylight saving).
SG = timezone(timedelta(hours=8))

DEFAULT_LIMIT = 50

MAX_LIMIT = 200

EXPORT_LIMIT = 5000

MAX_RANGE_DAYS = 3700

CHANGE_METHODS = ("POST", "PUT", "PATCH", "DELETE")

# The kinds of entries (the "Type" filter on the page).
CATEGORIES = [
    ("sign_in", "Signed in"),
    ("sign_out", "Signed out"),
    ("failed_sign_in", "Failed sign-in"),
    ("create", "Created"),
    ("change", "Changed"),
    ("delete", "Deleted"),
    ("download", "Opened / downloaded"),
    ("report", "Report generated"),
    ("export", "Exported"),
]

CATEGORY_KEYS = [key for key, _ in CATEGORIES]

RESULTS = ["Success", "Failed", "Refused"]

# ---------------------------------------------------------
# WHO MAY READ THE LOG, AND WHAT IT SHOWS
# ---------------------------------------------------------

# The Audit Logs page is only for these two roles. The check is made
# by the server on every request, so hiding a menu item is not what
# protects it.
OVERSIGHT_ROLE_NAMES = ["Port Administrator", "Port Executive"]

_OVERSIGHT_KEYS = {name.lower() for name in OVERSIGHT_ROLE_NAMES}

NOT_ALLOWED = (
    "Audit Logs are only for the Port Administrator and the Port Executive."
)

# The page shows what happened in the port's work. Sign-ins, account
# changes and the log's own exports are not part of it (they are still
# written to the database, they are only not shown here).
PORT_MODULES = [
    "Vessels",
    "Berths",
    "Cargo Operations",
    "Gate & Trucks",
    "Incidents",
    "Asset Maintenance",
    "Documents",
]

# The kinds of entries that exist inside those modules.
PORT_CATEGORY_KEYS = ["create", "change", "delete", "download", "report"]


def is_oversight_name(name: Any) -> bool:
    """True when a role name is "Port Administrator" or "Port Executive"
    (capital letters and extra spaces do not matter)."""

    return " ".join(str(name or "").split()).lower() in _OVERSIGHT_KEYS


def has_oversight_role(user: Any) -> bool:
    """True for the Port Administrator and the Port Executive."""

    role = getattr(user, "role", None)

    return is_oversight_name(getattr(role, "name", ""))


def require_oversight(user: Any) -> None:
    """Refuse (403) everybody except the two roles above."""

    if not has_oversight_role(user):
        raise HTTPException(status_code=403, detail=NOT_ALLOWED)

# Requests under these paths are never recorded by the central
# recorder (they are noise, private, or recorded by their own code).
SKIP_PREFIXES = (
    "/chat",
    "/notifications",
    "/presence",
    "/weather",
    "/ais",
    "/audit",
    "/documents",
    "/auth",
    "/docs",
    "/openapi.json",
    "/health",
)

LOGOUT_PATH = "/presence/logout"

# Words that are never written into the details.
SECRET_WORDS = ("password", "token", "secret")

MAX_DETAIL_TEXT = 200

MAX_DETAILS_JSON = 8000


# =========================================================
# TABLE
# =========================================================

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        user_id INTEGER,
        user_name VARCHAR(120) NOT NULL DEFAULT '',
        admin_id VARCHAR(80) NOT NULL DEFAULT '',
        role_name VARCHAR(80) NOT NULL DEFAULT '',
        module VARCHAR(40) NOT NULL,
        category VARCHAR(20) NOT NULL,
        action VARCHAR(80) NOT NULL,
        target VARCHAR(200) NOT NULL DEFAULT '',
        description VARCHAR(500) NOT NULL DEFAULT '',
        result VARCHAR(10) NOT NULL DEFAULT 'Success',
        details TEXT,
        ip_address VARCHAR(64) NOT NULL DEFAULT '',
        device VARCHAR(80) NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_audit_log_created
        ON audit_log (created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_audit_log_user
        ON audit_log (user_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_audit_log_module
        ON audit_log (module)
    """,
]

# PostgreSQL only: the database itself refuses to change or delete
# a row. (Created separately: if it fails, recording still works.)
TRIGGER_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION audit_log_block_change()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'The audit log cannot be changed or deleted.';
END;
$$ LANGUAGE plpgsql
"""

TRIGGER_EXISTS_SQL = (
    "SELECT 1 FROM pg_trigger WHERE tgname = 'audit_log_no_change'"
)

TRIGGER_SQL = """
CREATE TRIGGER audit_log_no_change
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_block_change()
"""

_table_ready = False
_table_lock = threading.Lock()


def ensure_table(db: Session) -> None:
    """
    Create the audit table if it does not exist yet. Safe to call
    on every request: after the first successful call it does
    nothing.
    """

    global _table_ready

    if _table_ready:
        return

    with _table_lock:

        if _table_ready:
            return

        try:

            for statement in SCHEMA_STATEMENTS:
                db.execute(text(statement))

            db.commit()

        except Exception as exc:

            db.rollback()

            logger.exception("The audit table could not be created.")

            raise HTTPException(
                status_code=500,
                detail=(
                    "The audit table could not be created "
                    f"({type(exc).__name__}). "
                    "Check the backend terminal for details."
                ),
            ) from exc

        _table_ready = True

        # The protection trigger. A failure here is only logged.
        try:

            if db.execute(text(TRIGGER_EXISTS_SQL)).scalar() is None:

                db.execute(text(TRIGGER_FUNCTION_SQL))
                db.execute(text(TRIGGER_SQL))

                db.commit()

        except Exception:

            db.rollback()

            logger.warning(
                "The audit log protection trigger could not be "
                "created. Recording still works.",
                exc_info=True,
            )


# =========================================================
# SMALL HELPERS
# =========================================================


def _clip(value: Any, longest: int) -> str:

    cleaned = " ".join(str(value if value is not None else "").split())

    if len(cleaned) <= longest:
        return cleaned

    return cleaned[: longest - 1].rstrip() + "…"


def device_of(user_agent: str | None) -> str:
    """'Firefox on Windows' from the browser's own description."""

    agent = user_agent or ""

    if "Edg/" in agent or "Edge/" in agent:
        browser = "Edge"
    elif "OPR/" in agent or "Opera" in agent:
        browser = "Opera"
    elif "Firefox/" in agent:
        browser = "Firefox"
    elif "Chrome/" in agent or "CriOS/" in agent:
        browser = "Chrome"
    elif "Safari/" in agent:
        browser = "Safari"
    else:
        browser = ""

    if "iPhone" in agent or "iPad" in agent:
        system = "iOS"
    elif "Android" in agent:
        system = "Android"
    elif "Windows" in agent:
        system = "Windows"
    elif "Mac OS X" in agent or "Macintosh" in agent:
        system = "macOS"
    elif "Linux" in agent or "X11" in agent:
        system = "Linux"
    else:
        system = ""

    if browser and system:
        return f"{browser} on {system}"

    return browser or system or "Unknown device"


def client_of(request: Any) -> tuple[str, str]:
    """
    The IP address and the device of a request.

    Only the address the server itself sees is used (a header sent
    by the browser could be made up). Behind a proxy this is the
    proxy's address.
    """

    try:

        client = getattr(request, "client", None)

        ip = getattr(client, "host", "") or ""

        agent = request.headers.get("user-agent", "")

        return _clip(ip, 64), device_of(agent)

    except Exception:

        return "", "Unknown device"


def _identity(db: Session, user_id: Any) -> dict[str, Any] | None:
    """Name, Admin ID and role of an account."""

    try:
        wanted = int(user_id)
    except (TypeError, ValueError):
        return None

    user = db.get(User, wanted)

    if user is None:
        return None

    role = user.role

    return {
        "id": user.id,
        "name": user.full_name or user.username or f"User {user.id}",
        "admin_id": user.username or "",
        "role": (role.name if role is not None else "") or "",
    }


def _safe_json(value: Any) -> str | None:

    if value is None:
        return None

    try:
        raw = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return None

    if len(raw) > MAX_DETAILS_JSON:
        raw = json.dumps(
            {"note": "The details were too long to keep."},
            ensure_ascii=False,
        )

    return raw


_INSERT_SQL = text(
    "INSERT INTO audit_log "
    "(created_at, user_id, user_name, admin_id, role_name, module, "
    "category, action, target, description, result, details, "
    "ip_address, device) "
    "VALUES (:at, :uid, :uname, :aid, :role, :module, :category, "
    ":action, :target, :description, :result, :details, :ip, :device)"
)


def record(
    *,
    module: str,
    action: str,
    category: str,
    target: str = "",
    description: str = "",
    result: str = "Success",
    details: Any = None,
    user: Any = None,
    user_id: Any = None,
    admin_id: str = "",
    request: Any = None,
    ip: str = "",
    device: str = "",
) -> None:
    """
    Write one row. NEVER raises: a problem is only logged, so the
    real work of the request is never stopped by the audit log.

    `user` may be the logged-in User. With only `user_id` the name
    and role are read from the account. Failed sign-ins have no
    account: pass the typed Admin ID as `admin_id`.

    The row is written in its own database session, so it is kept
    even if the request itself fails and rolls back.
    """

    db = None

    try:

        if request is not None and not ip and not device:
            ip, device = client_of(request)

        if category not in CATEGORY_KEYS:
            category = "change"

        if result not in RESULTS:
            result = "Success"

        db = SessionLocal()

        ensure_table(db)

        who = None

        if user is not None:
            who = _identity(db, getattr(user, "id", None))
        elif user_id is not None:
            who = _identity(db, user_id)

        db.execute(
            _INSERT_SQL,
            {
                "at": utc_now(),
                "uid": who["id"] if who else None,
                "uname": _clip(who["name"], 120) if who else "",
                "aid": _clip(
                    who["admin_id"] if who else admin_id, 80
                ),
                "role": _clip(who["role"], 80) if who else "",
                "module": _clip(module, 40) or "System",
                "category": category,
                "action": _clip(action, 80) or "Action",
                "target": _clip(target, 200),
                "description": _clip(description, 500),
                "result": result,
                "details": _safe_json(details),
                "ip": _clip(ip, 64),
                "device": _clip(device, 80),
            },
        )

        db.commit()

    except Exception:

        logger.warning(
            "An audit log entry could not be written.",
            exc_info=True,
        )

        if db is not None:
            try:
                db.rollback()
            except Exception:
                pass

    finally:

        if db is not None:
            try:
                db.close()
            except Exception:
                pass


# =========================================================
# THE CENTRAL RECORDER (used by the middleware in main.py)
# =========================================================
#
# Rule table: (method, path pattern, module, kind of record,
# action, type). The first rule that matches wins. "kind" is used
# to find a readable name for the record (for example the incident
# number) and to show before / after values for accounts and roles.

_ACCOUNT = "My Account"
_USERS = "User & Role Management"

_RULES: list[tuple[str, str, str, str | None, str, str]] = [
    # my own account
    ("PUT", r"/users/me/profile", _ACCOUNT, None, "Profile details changed", "change"),
    ("PUT", r"/users/me/avatar", _ACCOUNT, None, "Profile picture changed", "change"),
    ("DELETE", r"/users/me/avatar", _ACCOUNT, None, "Profile picture removed", "change"),
    ("PUT", r"/users/me/credentials", _ACCOUNT, None, "Password changed", "change"),
    # user and role management
    ("POST", r"/users", _USERS, "user", "Account created", "create"),
    ("PUT|PATCH", r"/users/(\d+)", _USERS, "user", "Account changed", "change"),
    ("DELETE", r"/users/(\d+)", _USERS, "user", "Account deleted", "delete"),
    ("POST", r"/roles", _USERS, "role", "Role created", "create"),
    ("PUT|PATCH", r"/roles/(\d+)", _USERS, "role", "Role changed", "change"),
    ("PUT|PATCH|POST", r"/roles/(\d+)/[a-z_-]+", _USERS, "role", "Role features changed", "change"),
    ("DELETE", r"/roles/(\d+)", _USERS, "role", "Role deleted", "delete"),
    # incidents
    ("POST", r"/incidents", "Incidents", "incident", "Incident reported", "create"),
    ("POST", r"/incidents/(\d+)/status", "Incidents", "incident", "Status changed", "change"),
    ("POST", r"/incidents/(\d+)/assign", "Incidents", "incident", "Assignment changed", "change"),
    ("POST", r"/incidents/(\d+)/notes", "Incidents", "incident", "Note added", "change"),
    ("DELETE", r"/incidents/(\d+)", "Incidents", "incident", "Incident deleted", "delete"),
    # assets and maintenance
    ("POST", r"/assets", "Asset Maintenance", "asset", "Equipment added", "create"),
    ("POST", r"/assets/(\d+)/edit", "Asset Maintenance", "asset", "Equipment details changed", "change"),
    ("POST", r"/assets/(\d+)/status", "Asset Maintenance", "asset", "Equipment status changed", "change"),
    ("POST", r"/assets/(\d+)/notes", "Asset Maintenance", "asset", "Note added", "change"),
    ("POST", r"/assets/(\d+)/jobs", "Asset Maintenance", "asset", "Maintenance job added", "create"),
    ("POST", r"/assets/(\d+)/jobs/(\d+)/start", "Asset Maintenance", "asset", "Maintenance job started", "change"),
    ("POST", r"/assets/(\d+)/jobs/(\d+)/complete", "Asset Maintenance", "asset", "Maintenance job completed", "change"),
    ("POST", r"/assets/(\d+)/jobs/(\d+)/cancel", "Asset Maintenance", "asset", "Maintenance job cancelled", "change"),
    ("DELETE", r"/assets/(\d+)", "Asset Maintenance", "asset", "Equipment deleted", "delete"),
    # gate and trucks
    ("POST", r"/trucks/entry", "Gate & Trucks", None, "Truck entry recorded", "create"),
    ("POST", r"/trucks/(\d+)/exit", "Gate & Trucks", "truck", "Truck exit recorded", "change"),
    ("DELETE", r"/trucks", "Gate & Trucks", None, "All gate records cleared", "delete"),
    ("DELETE", r"/trucks/(\d+)", "Gate & Trucks", "truck", "Gate record deleted", "delete"),
    # cargo throughput
    ("POST", r"/throughput/import", "Cargo Operations", None, "Throughput figures imported", "create"),
    ("DELETE", r"/throughput", "Cargo Operations", None, "Throughput figures cleared", "delete"),
]

_COMPILED = [
    (set(methods.split("|")), re.compile(pattern), module, kind, action, category)
    for methods, pattern, module, kind, action, category in _RULES
]

# Anything else: the module is read from the first part of the
# path and the action from the method.
_MODULE_OF_PREFIX = {
    "vessels": ("Vessels", "Vessel"),
    "port-calls": ("Vessels", "Port call"),
    "berths": ("Berths", "Berth"),
    "cargo": ("Cargo Operations", "Cargo record"),
    "throughput": ("Cargo Operations", "Throughput figure"),
    "trucks": ("Gate & Trucks", "Gate record"),
    "incidents": ("Incidents", "Incident"),
    "assets": ("Asset Maintenance", "Equipment"),
    "users": (_USERS, "Account"),
    "roles": (_USERS, "Role"),
}

_GENERIC_ACTION = {
    "POST": ("Created or submitted", "create"),
    "PUT": ("Changed", "change"),
    "PATCH": ("Changed", "change"),
    "DELETE": ("Deleted", "delete"),
}


def describe(method: str, path: str) -> dict[str, Any] | None:
    """
    What a changing request means, in port words. Returns None for
    requests that must not be recorded.
    """

    method = (method or "").upper()

    clean = "/" + (path or "").strip("/")

    if method not in CHANGE_METHODS:
        return None

    if clean == LOGOUT_PATH and method == "POST":
        return {
            "module": "Sign-in",
            "kind": None,
            "record_id": None,
            "action": "Signed out",
            "category": "sign_out",
            "noun": "",
        }

    if clean.startswith(SKIP_PREFIXES):
        return None

    for methods, pattern, module, kind, action, category in _COMPILED:

        if method not in methods:
            continue

        found = pattern.fullmatch(clean)

        if found is None:
            continue

        numbers = found.groups()

        return {
            "module": module,
            "kind": kind,
            "record_id": int(numbers[0]) if numbers else None,
            "action": action,
            "category": category,
            "noun": "",
        }

    parts = [part for part in clean.split("/") if part]

    if not parts or parts[0] not in _MODULE_OF_PREFIX:
        return None

    module, noun = _MODULE_OF_PREFIX[parts[0]]

    action, category = _GENERIC_ACTION[method]

    record_id = None

    for part in parts[1:]:
        if part.isdigit():
            record_id = int(part)
            break

    words = [
        part.replace("-", " ").replace("_", " ")
        for part in parts[1:]
        if not part.isdigit()
    ]

    if words:
        action = f"{action} ({' '.join(words)})"

    return {
        "module": module,
        "kind": None,
        "record_id": record_id,
        "action": action,
        "category": category,
        "noun": noun,
    }


def _secret_key(name: Any) -> bool:

    lowered = str(name).lower()

    return any(word in lowered for word in SECRET_WORDS)


def _sent_fields(body: Any) -> dict[str, Any]:
    """The simple, non-secret fields of a request body."""

    if not isinstance(body, dict):
        return {}

    fields: dict[str, Any] = {}

    for key, value in body.items():

        if _secret_key(key):
            continue

        if isinstance(value, (str, int, float, bool)):
            fields[str(key)] = (
                _clip(value, MAX_DETAIL_TEXT)
                if isinstance(value, str)
                else value
            )

    return fields


def _snapshot(db: Session, kind: str | None, record_id: Any) -> dict[str, Any] | None:
    """The values of an account or a role (for before / after)."""

    if record_id is None or kind not in ("user", "role"):
        return None

    if kind == "user":

        user = db.get(User, record_id)

        if user is None:
            return None

        role = user.role

        return {
            "Name": user.full_name or "",
            "Admin ID": user.username or "",
            "Role": (role.name if role is not None else "") or "",
            "Active": "Yes" if user.is_active else "No",
        }

    role = db.get(Role, record_id)

    if role is None:
        return None

    keys = sorted(
        str(permission.key)
        for permission in (role.permissions or [])
    )

    return {
        "Name": role.name or "",
        "Features": ", ".join(keys) if keys else "none",
    }


def _label(db: Session, kind: str | None, record_id: Any, noun: str) -> str:
    """A readable name for the record the request touched."""

    if record_id is None:
        return ""

    try:

        if kind == "incident":

            row = db.execute(
                text(
                    "SELECT incident_year, year_seq FROM port_incidents "
                    "WHERE id = :id"
                ),
                {"id": record_id},
            ).mappings().first()

            if row:
                return (
                    f"Incident INC-{int(row['incident_year'])}-"
                    f"{int(row['year_seq']):03d}"
                )

        elif kind == "asset":

            row = db.execute(
                text(
                    "SELECT asset_prefix, prefix_seq, name FROM port_assets "
                    "WHERE id = :id"
                ),
                {"id": record_id},
            ).mappings().first()

            if row:
                return (
                    f"Equipment {row['asset_prefix']}-"
                    f"{int(row['prefix_seq']):03d} ({row['name']})"
                )

        elif kind == "user":

            user = db.get(User, record_id)

            if user is not None:
                return f"Account {user.full_name or user.username} ({user.username})"

        elif kind == "role":

            role = db.get(Role, record_id)

            if role is not None:
                return f"Role {role.name}"

    except Exception:

        try:
            db.rollback()
        except Exception:
            pass

    word = {
        "incident": "Incident",
        "asset": "Equipment",
        "user": "Account",
        "role": "Role",
        "truck": "Gate record",
    }.get(kind or "", noun or "Record")

    return f"{word} #{record_id}"


def _token_user_id(authorization: str | None) -> int | None:

    if not authorization:
        return None

    parts = authorization.split(None, 1)

    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    try:

        payload = jwt.decode(
            parts[1].strip(),
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )

        return int(payload.get("sub"))

    except Exception:

        return None


def start_request(info: dict[str, Any]) -> dict[str, Any] | None:
    """
    Called BEFORE a changing request runs. `info` has the plain
    facts of the request: method, path, authorization, ip, device and
    (only for accounts and roles) the body fields.

    Returns what finish_request() needs, or None when the request
    must not be recorded. Never raises.
    """

    try:

        meaning = describe(info.get("method", ""), info.get("path", ""))

        if meaning is None:
            return None

        user_id = _token_user_id(info.get("authorization"))

        if user_id is None:
            return None

        state = {
            **meaning,
            "user_id": user_id,
            "ip": info.get("ip", ""),
            "device": info.get("device", ""),
            "method": info.get("method", ""),
            "path": info.get("path", ""),
            "body": info.get("body"),
            "before": None,
            "label": "",
        }

        needs_lookup = meaning["record_id"] is not None

        if needs_lookup:

            db = SessionLocal()

            try:

                state["before"] = _snapshot(
                    db, meaning["kind"], meaning["record_id"]
                )

                # Read the name now: after a delete it is gone.
                state["label"] = _label(
                    db,
                    meaning["kind"],
                    meaning["record_id"],
                    meaning["noun"],
                )

            finally:
                db.close()

        return state

    except Exception:

        logger.warning(
            "The audit recorder could not prepare a request.",
            exc_info=True,
        )

        return None


def _result_of(status_code: int) -> str | None:

    if status_code < 400:
        return "Success"

    if status_code == 403:
        return "Refused"

    if status_code >= 500:
        return "Failed"

    # 400, 404, 409, 422 ...: nothing was changed.
    return None


def finish_request(state: dict[str, Any] | None, status_code: int) -> None:
    """
    Called AFTER a changing request ran. Writes the row. Never
    raises.
    """

    if not state:
        return

    try:

        result = _result_of(int(status_code))

        if result is None:
            return

        details: dict[str, Any] = {
            "request": f"{state['method']} {state['path']}",
            "status_code": int(status_code),
        }

        target = state.get("label") or ""

        changes: list[dict[str, Any]] = []

        # Only account and role forms are ever looked at (and never
        # the person's own profile / password pages).
        body = (
            state.get("body")
            if state["kind"] in ("user", "role")
            and not str(state["path"]).startswith("/users/me")
            else None
        )

        sent = _sent_fields(body)

        if result == "Success" and state["kind"] in ("user", "role"):

            db = SessionLocal()

            try:

                after = _snapshot(db, state["kind"], state["record_id"])

                before = state.get("before")

                if before is not None and after is not None:

                    for field in after:

                        if before.get(field) != after.get(field):
                            changes.append(
                                {
                                    "field": field,
                                    "before": before.get(field),
                                    "after": after.get(field),
                                }
                            )

                    target = _label(
                        db,
                        state["kind"],
                        state["record_id"],
                        state["noun"],
                    ) or target

            finally:
                db.close()

            if isinstance(body, dict) and body.get("password"):
                changes.append(
                    {"field": "Password", "before": "", "after": "changed"}
                )

        if state["category"] == "create" and not target:

            name = (
                sent.get("name")
                or sent.get("full_name")
                or sent.get("title")
                or ""
            )

            login = sent.get("admin_id") or sent.get("username") or ""

            word = "Account" if state["kind"] == "user" else "Role"

            if name and login:
                target = f"{word} {name} ({login})"
            elif name:
                target = f"{word} {name}"

        if changes:
            details["changes"] = changes

        if sent:
            details["sent"] = sent

        description = ""

        if changes:

            description = "; ".join(
                f"{item['field']}: {item['before'] or '(empty)'} → "
                f"{item['after'] or '(empty)'}"
                for item in changes
                if item["field"] != "Password"
            )

            if any(item["field"] == "Password" for item in changes):
                description = (
                    description + "; " if description else ""
                ) + "Password changed"

        elif result == "Refused":

            description = "The account is not allowed to do this."

        elif result == "Failed":

            description = "The server could not complete the request."

        record(
            module=state["module"],
            action=state["action"],
            category=state["category"],
            target=target,
            description=description,
            result=result,
            details=details,
            user_id=state["user_id"],
            ip=state.get("ip", ""),
            device=state.get("device", ""),
        )

    except Exception:

        logger.warning(
            "The audit recorder could not finish a request.",
            exc_info=True,
        )


# =========================================================
# READING THE LOG
# =========================================================


def _fail(message: str, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=message)


def _parse_day(value: Any, name: str) -> date | None:

    if value is None or str(value).strip() == "":
        return None

    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        raise _fail(
            f"{name} must be a date written like 2026-10-21."
        ) from None


def _filters(
    start_date: Any = None,
    end_date: Any = None,
    user_id: Any = None,
    module: Any = None,
    category: Any = None,
    result: Any = None,
    q: Any = None,
    only_dates: bool = False,
) -> tuple[str, dict[str, Any]]:

    start = _parse_day(start_date, "Start date")

    end = _parse_day(end_date, "End date")

    clauses: list[str] = []

    params: dict[str, Any] = {}

    if start and end and end < start:
        raise _fail("The end date is before the start date.")

    if start and end and (end - start).days > MAX_RANGE_DAYS:
        raise _fail("That period is too long.")

    if start:

        begin = datetime(start.year, start.month, start.day, tzinfo=SG)

        clauses.append("created_at >= :start_at")

        params["start_at"] = begin.astimezone(timezone.utc)

    if end:

        after = datetime(end.year, end.month, end.day, tzinfo=SG) + timedelta(days=1)

        clauses.append("created_at < :end_at")

        params["end_at"] = after.astimezone(timezone.utc)

    # Only the port's own activity (see PORT_MODULES).
    marks = []

    for position, name in enumerate(PORT_MODULES):

        marks.append(f":port_module_{position}")

        params[f"port_module_{position}"] = name

    clauses.append(f"module IN ({', '.join(marks)})")

    if only_dates:
        return (" AND ".join(clauses), params)

    if user_id not in (None, ""):

        try:
            params["user_id"] = int(user_id)
        except (TypeError, ValueError):
            raise _fail("The person filter is not valid.") from None

        clauses.append("user_id = :user_id")

    if module not in (None, ""):

        clauses.append("module = :module")

        params["module"] = str(module)[:40]

    if category not in (None, ""):

        if category not in CATEGORY_KEYS:
            raise _fail("The type filter is not valid.")

        clauses.append("category = :category")

        params["category"] = category

    if result not in (None, ""):

        if result not in RESULTS:
            raise _fail("The result filter is not valid.")

        clauses.append("result = :result")

        params["result"] = result

    needle = " ".join(str(q or "").split()).lower()

    if needle:

        escaped = (
            needle.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )

        params["q"] = f"%{escaped[:80]}%"

        clauses.append(
            "(lower(user_name) LIKE :q ESCAPE '\\' "
            "OR lower(admin_id) LIKE :q ESCAPE '\\' "
            "OR lower(module) LIKE :q ESCAPE '\\' "
            "OR lower(action) LIKE :q ESCAPE '\\' "
            "OR lower(target) LIKE :q ESCAPE '\\' "
            "OR lower(description) LIKE :q ESCAPE '\\')"
        )

    return (" AND ".join(clauses), params)


def _payload(row: dict[str, Any]) -> dict[str, Any]:

    details = None

    if row.get("details"):

        try:
            details = json.loads(row["details"])
        except (TypeError, ValueError):
            details = None

    return {
        "id": row["id"],
        "at": iso(row["created_at"]),
        "user": {
            "id": row["user_id"],
            "name": row["user_name"] or "",
            "admin_id": row["admin_id"] or "",
            "role": row["role_name"] or "",
        },
        "module": row["module"],
        "category": row["category"],
        "action": row["action"],
        "target": row["target"] or "",
        "description": row["description"] or "",
        "result": row["result"],
        "details": details,
        "ip_address": row["ip_address"] or "",
        "device": row["device"] or "",
    }


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:

    return [
        dict(row)
        for row in db.execute(text(sql), params).mappings().all()
    ]


def list_entries(
    db: Session,
    *,
    start_date: Any = None,
    end_date: Any = None,
    user_id: Any = None,
    module: Any = None,
    category: Any = None,
    result: Any = None,
    q: Any = None,
    limit: int = DEFAULT_LIMIT,
    before_id: Any = None,
) -> dict[str, Any]:
    """Entries, newest first. `before_id` continues an earlier page."""

    ensure_table(db)

    where, params = _filters(
        start_date, end_date, user_id, module, category, result, q
    )

    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))

    clauses = [where] if where else []

    if before_id not in (None, ""):

        try:
            params["before_id"] = int(before_id)
        except (TypeError, ValueError):
            raise _fail("The page marker is not valid.") from None

        clauses.append("id < :before_id")

    sql = "SELECT * FROM audit_log"

    if clauses:
        sql += " WHERE " + " AND ".join(clauses)

    sql += " ORDER BY id DESC LIMIT :limit_plus"

    params["limit_plus"] = limit + 1

    rows = _rows(db, sql, params)

    has_more = len(rows) > limit

    rows = rows[:limit]

    return {
        "entries": [_payload(row) for row in rows],
        "has_more": has_more,
        "next_before_id": rows[-1]["id"] if rows and has_more else None,
    }


def summary(
    db: Session,
    *,
    start_date: Any = None,
    end_date: Any = None,
) -> dict[str, Any]:
    """The number cards of the period and the lists for the filters."""

    ensure_table(db)

    where, params = _filters(start_date, end_date, only_dates=True)

    suffix = f" WHERE {where}" if where else ""

    row = _rows(
        db,
        "SELECT count(*) AS events, "
        "sum(CASE WHEN category = 'create' AND result = 'Success' "
        "THEN 1 ELSE 0 END) AS added, "
        "sum(CASE WHEN category = 'change' AND result = 'Success' "
        "THEN 1 ELSE 0 END) AS changed, "
        "sum(CASE WHEN category = 'delete' AND result = 'Success' "
        "THEN 1 ELSE 0 END) AS deleted, "
        "count(DISTINCT user_id) AS people "
        f"FROM audit_log{suffix}",
        params,
    )[0]

    link = " AND " if where else " WHERE "

    people = _rows(
        db,
        "SELECT user_id, max(user_name) AS name, max(admin_id) AS admin_id, "
        "max(role_name) AS role FROM audit_log"
        f"{suffix}{link}user_id IS NOT NULL "
        "GROUP BY user_id ORDER BY max(user_name)",
        params,
    )

    modules = _rows(
        db,
        f"SELECT module, count(*) AS n FROM audit_log{suffix} "
        "GROUP BY module ORDER BY module",
        params,
    )

    return {
        "cards": {
            "events": int(row["events"] or 0),
            "added": int(row["added"] or 0),
            "changed": int(row["changed"] or 0),
            "deleted": int(row["deleted"] or 0),
            "people": int(row["people"] or 0),
        },
        "people": [
            {
                "id": person["user_id"],
                "name": person["name"] or person["admin_id"] or "",
                "admin_id": person["admin_id"] or "",
                "role": person["role"] or "",
            }
            for person in people
        ],
        "modules": [item["module"] for item in modules],
        "categories": [
            {"key": key, "label": label}
            for key, label in CATEGORIES
            if key in PORT_CATEGORY_KEYS
        ],
        "results": RESULTS,
    }


# =========================================================
# EXPORT (CSV)
# =========================================================


def _cell(value: Any) -> str:
    """One CSV cell. Text that a spreadsheet would run as a formula is
    made harmless."""

    cleaned = str(value if value is not None else "")

    if cleaned[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + cleaned

    return cleaned


def _sgt(value: Any) -> str:

    moment = to_datetime(value)

    if moment is None:
        return ""

    return moment.astimezone(SG).strftime("%Y-%m-%d %H:%M:%S")


def export_csv(
    db: Session,
    *,
    start_date: Any = None,
    end_date: Any = None,
    user_id: Any = None,
    module: Any = None,
    category: Any = None,
    result: Any = None,
    q: Any = None,
    user: Any = None,
    request: Any = None,
) -> dict[str, Any]:
    """The filtered entries as CSV text (newest first, up to 5000)."""

    ensure_table(db)

    where, params = _filters(
        start_date, end_date, user_id, module, category, result, q
    )

    sql = "SELECT * FROM audit_log"

    if where:
        sql += f" WHERE {where}"

    sql += " ORDER BY id DESC LIMIT :limit_plus"

    params["limit_plus"] = EXPORT_LIMIT + 1

    rows = _rows(db, sql, params)

    truncated = len(rows) > EXPORT_LIMIT

    rows = rows[:EXPORT_LIMIT]

    labels = dict(CATEGORIES)

    buffer = io.StringIO()

    writer = csv.writer(buffer)

    writer.writerow(
        [
            "Time (Singapore)",
            "Person",
            "Admin ID",
            "Role",
            "Module",
            "Type",
            "Action",
            "Record",
            "Result",
            "Description",
            "IP address",
            "Device",
        ]
    )

    for row in rows:

        writer.writerow(
            [
                _cell(_sgt(row["created_at"])),
                _cell(row["user_name"]),
                _cell(row["admin_id"]),
                _cell(row["role_name"]),
                _cell(row["module"]),
                _cell(labels.get(row["category"], row["category"])),
                _cell(row["action"]),
                _cell(row["target"]),
                _cell(row["result"]),
                _cell(row["description"]),
                _cell(row["ip_address"]),
                _cell(row["device"]),
            ]
        )

    first = _parse_day(start_date, "Start date")

    last = _parse_day(end_date, "End date")

    if first and last:
        name = f"audit-log-{first.isoformat()}-to-{last.isoformat()}.csv"
    else:
        name = f"audit-log-{datetime.now(SG).date().isoformat()}.csv"

    record(
        module="Audit Logs",
        action="Audit log exported",
        category="export",
        target=name,
        description=f"{len(rows)} entries exported.",
        details={"entries": len(rows), "truncated": truncated},
        user=user,
        request=request,
    )

    return {
        "filename": name,
        "rows": len(rows),
        "truncated": truncated,
        # (chr(0xFEFF) is the byte-order mark: Excel then shows letters
        # outside English correctly)
        "csv": chr(0xFEFF) + buffer.getvalue(),
    }
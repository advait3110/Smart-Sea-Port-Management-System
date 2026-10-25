"""
Document Management - the port's document library.

What this file does
-------------------
- Creates its own tables the first time they are needed (no Alembic
  migration is required):
    port_documents          one row per document (title, category,
                            expiry date, who may see it ...)
    port_document_versions  one row per uploaded file. A document
                            keeps every version; the newest one is
                            the current one. The file itself is
                            stored inside the database.
- Every document is uploaded by a port employee, or it is a report
  that the system generated from the port's own records (see
  report_service.py). Nothing is made up and there is no sample
  data: an empty library stays empty until somebody uploads the
  first file.
- Document numbers are DOC-<year>-<number>, counted per year
  (DOC-2026-001, DOC-2026-002, ...).

Who may do what
---------------
The feature check ("documents") for every endpoint is done in
app/main.py (module_guard).

- See a document: everybody with the Documents feature, when it is
  open to "everyone". A document can be restricted to chosen roles;
  then only those roles, the person who uploaded it and the Port
  Administrator can see it. Somebody who may not see a document is
  told it does not exist.
- Change a document (details, new version, delete): the person who
  uploaded it and the Port Administrator.
- Reports (the PDF made by report_service.py): only the Port
  Administrator and the Port Executive can make them, and only those
  two roles can see them in the library.

Files
-----
Allowed: PDF, Word (docx, doc), Excel (xlsx, xls), CSV, TXT, PNG and
JPG, up to 10 MB. The CONTENT of the file is checked, not only its
name. Files travel as base64 text inside JSON (the same way profile
pictures do), so no extra package is needed.

Reminders
---------
A document with an expiry date reminds its uploader and the Port
Administrator through the bell: once when it is within 30 days of
expiring and once when it has expired.

Everything that happens here is also written to the Audit Log.
"""

from __future__ import annotations

import base64
import binascii
import io
import json
import logging
import re
import threading
import time
import zipfile
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.role import Role
from app.models.user import User
from app.services import audit_service, chat_service
from app.services.chat_service import (
    get_directory,
    iso,
    run_rows,
    run_scalar,
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

FEATURE_KEY = "documents"

MODULE_NAME = "Documents"

SG = timezone(timedelta(hours=8))

MAX_FILE_BYTES = 10 * 1024 * 1024

MAX_TITLE = 160

MAX_TEXT = 2000

MAX_NOTE = 500

MAX_LINK = 160

LIST_LIMIT = 2000

NUMBER_ATTEMPTS = 5

# Reminders: a document is "expiring" this many days before.
EXPIRY_WARNING_DAYS = 30

# The reminder check runs at most this often (whole server).
REMINDER_EVERY_SECONDS = 600

# Categories people can choose. "Port Reports" is only used for the
# reports the system generates.
CATEGORIES = [
    "Vessel & Arrival Papers",
    "Cargo Documents",
    "Customs & Permits",
    "Safety & Security",
    "Maintenance & Inspection",
    "Incident Reports",
    "Policies & Procedures",
    "Other",
]

REPORT_CATEGORY = "Port Reports"

LINK_TYPES = ["Vessel", "Cargo record", "Incident", "Equipment"]

VISIBILITIES = ["all", "roles"]

# extension -> (content type, what the first bytes must look like)
FILE_TYPES: dict[str, tuple[str, str]] = {
    "pdf": ("application/pdf", "pdf"),
    "docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document",
        "docx",
    ),
    "xlsx": (
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet",
        "xlsx",
    ),
    "doc": ("application/msword", "ole"),
    "xls": ("application/vnd.ms-excel", "ole"),
    "csv": ("text/csv", "text"),
    "txt": ("text/plain", "text"),
    "png": ("image/png", "png"),
    "jpg": ("image/jpeg", "jpeg"),
    "jpeg": ("image/jpeg", "jpeg"),
}

OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")


# =========================================================
# TABLES
# =========================================================

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS port_documents (
        id SERIAL PRIMARY KEY,
        doc_year INTEGER NOT NULL,
        year_seq INTEGER NOT NULL,
        title VARCHAR(160) NOT NULL,
        category VARCHAR(40) NOT NULL,
        description TEXT,
        expires_on DATE,
        link_type VARCHAR(20),
        link_label VARCHAR(160),
        visibility VARCHAR(10) NOT NULL DEFAULT 'all',
        allowed_roles TEXT,
        is_report BOOLEAN NOT NULL DEFAULT FALSE,
        report_start DATE,
        report_end DATE,
        report_scope VARCHAR(160),
        current_version INTEGER NOT NULL DEFAULT 1,
        uploaded_by_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        uploaded_by_name VARCHAR(120) NOT NULL DEFAULT '',
        uploaded_by_role VARCHAR(80) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_port_document_number
            UNIQUE (doc_year, year_seq)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_documents_category
        ON port_documents (category)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_port_documents_expiry
        ON port_documents (expires_on)
    """,
    """
    CREATE TABLE IF NOT EXISTS port_document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL
            REFERENCES port_documents (id) ON DELETE CASCADE,
        version_no INTEGER NOT NULL,
        file_name VARCHAR(160) NOT NULL,
        file_type VARCHAR(120) NOT NULL,
        file_size INTEGER NOT NULL,
        content BYTEA NOT NULL,
        note VARCHAR(500),
        uploaded_by_id INTEGER
            REFERENCES users (id) ON DELETE SET NULL,
        uploaded_by_name VARCHAR(120) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_port_document_version
            UNIQUE (document_id, version_no)
    )
    """,
]

_tables_ready = False
_tables_lock = threading.Lock()


def ensure_tables(db: Session) -> None:
    """
    Create the document tables if they do not exist yet. Safe to call
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

            logger.exception("The document tables could not be created.")

            raise HTTPException(
                status_code=500,
                detail=(
                    "The document tables could not be created "
                    f"({type(exc).__name__}). "
                    "Check the backend terminal for details."
                ),
            ) from exc

        _tables_ready = True


# =========================================================
# SMALL HELPERS
# =========================================================


def _fail(message: str, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=message)


def _today() -> date:
    """Today's date in Singapore."""

    return datetime.now(SG).date()


def _single_line(value: Any) -> str:
    return " ".join(str(value or "").split())


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
        # Port Administrator and Port Executive: may make PDF reports.
        "reporter": audit_service.has_oversight_role(user),
    }


def _number(row: dict[str, Any]) -> str:
    return f"DOC-{int(row['doc_year'])}-{int(row['year_seq']):03d}"


def _day(value: Any) -> date | None:
    """A database date (or text) as a date."""

    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_expiry(value: Any) -> date | None:
    """The expiry date typed in the form (blank = none)."""

    if value is None or str(value).strip() == "":
        return None

    try:
        found = date.fromisoformat(str(value).strip())
    except ValueError:
        raise _fail(
            "The expiry date must be written like 2026-12-31."
        ) from None

    if found.year < 2000 or found.year > _today().year + 50:
        raise _fail("That expiry date is not realistic.")

    return found


def _roles_of(row: dict[str, Any]) -> list[str]:

    raw = row.get("allowed_roles")

    if not raw:
        return []

    try:
        names = json.loads(raw)
    except (TypeError, ValueError):
        return []

    return [str(name) for name in names] if isinstance(names, list) else []


def _status_of(expires_on: date | None, today: date) -> tuple[str, int | None]:
    """'none' | 'valid' | 'expiring' | 'expired', and the days left."""

    if expires_on is None:
        return "none", None

    left = (expires_on - today).days

    if left < 0:
        return "expired", left

    if left <= EXPIRY_WARNING_DAYS:
        return "expiring", left

    return "valid", left


def all_role_names(db: Session) -> list[str]:
    """Every role (the 8 fixed ones and the custom ones)."""

    return sorted(
        {
            str(role.name)
            for role in db.scalars(select(Role)).all()
            if role.name
        },
        key=str.lower,
    )


def _can_see(actor: dict[str, Any], row: dict[str, Any]) -> bool:

    if actor["admin"] or row["uploaded_by_id"] == actor["id"]:
        return True

    if row["visibility"] != "roles":
        return True

    wanted = {name.strip().lower() for name in _roles_of(row)}

    return actor["role"].strip().lower() in wanted


def _can_change(actor: dict[str, Any], row: dict[str, Any]) -> bool:
    return actor["admin"] or row["uploaded_by_id"] == actor["id"]


# =========================================================
# CHECKING A FILE
# =========================================================


def clean_file_name(value: Any) -> str:
    """The file name only (no folders), short, without odd characters."""

    name = str(value or "").replace("\\", "/").split("/")[-1]

    name = "".join(ch for ch in name if ch.isprintable())

    name = " ".join(name.split()).strip(" .")

    if len(name) > 150:

        stem, dot, extension = name.rpartition(".")

        if dot and len(extension) <= 6:
            name = stem[: 150 - len(extension) - 1] + "." + extension
        else:
            name = name[:150]

    return name


def _looks_right(kind: str, data: bytes) -> bool:

    if kind == "pdf":
        return data[:5] == b"%PDF-"

    if kind == "png":
        return data[:8] == b"\x89PNG\r\n\x1a\n"

    if kind == "jpeg":
        return data[:3] == b"\xff\xd8\xff"

    if kind == "ole":
        return data[:8] == OLE_MAGIC

    if kind == "text":
        return b"\x00" not in data[:8192]

    if kind in ("docx", "xlsx"):

        try:

            with zipfile.ZipFile(io.BytesIO(data)) as archive:

                names = archive.namelist()

        except (zipfile.BadZipFile, OSError, ValueError):
            return False

        folder = "word/" if kind == "docx" else "xl/"

        return "[Content_Types].xml" in names and any(
            name.startswith(folder) for name in names
        )

    return False


def check_file(file_name: Any, file_data: Any) -> tuple[str, str, bytes]:
    """
    Check an uploaded file. Returns (clean name, content type, bytes)
    or refuses it with a readable message.
    """

    name = clean_file_name(file_name)

    if not name:
        raise _fail("The file has no name.")

    extension = name.rpartition(".")[2].lower() if "." in name else ""

    if extension not in FILE_TYPES:
        allowed = ", ".join(sorted({key.upper() for key in FILE_TYPES}))
        raise _fail(
            "This kind of file is not allowed. Allowed: "
            f"{allowed}."
        )

    raw = str(file_data or "")

    if "," in raw[:100] and raw.lstrip().startswith("data:"):
        raw = raw.split(",", 1)[1]

    raw = "".join(raw.split())

    if not raw:
        raise _fail("Choose a file to upload.")

    # Refuse before decoding something huge (base64 is 4/3 larger).
    if len(raw) > (MAX_FILE_BYTES * 4) // 3 + 8:
        raise _fail(
            f"The file is too large (at most "
            f"{MAX_FILE_BYTES // (1024 * 1024)} MB)."
        )

    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise _fail("The file could not be read. Please upload it again.") from None

    if not data:
        raise _fail("The file is empty.")

    if len(data) > MAX_FILE_BYTES:
        raise _fail(
            f"The file is too large (at most "
            f"{MAX_FILE_BYTES // (1024 * 1024)} MB)."
        )

    content_type, kind = FILE_TYPES[extension]

    if not _looks_right(kind, data):
        raise _fail(
            f"The content of this file is not a real .{extension} file."
        )

    return name, content_type, data


# =========================================================
# READING DOCUMENTS
# =========================================================

_LIST_SQL = (
    "SELECT d.*, v.file_name, v.file_type, v.file_size, "
    "v.created_at AS file_at, "
    "(SELECT COUNT(*) FROM port_document_versions x "
    "WHERE x.document_id = d.id) AS version_count "
    "FROM port_documents d "
    "JOIN port_document_versions v "
    "ON v.document_id = d.id AND v.version_no = d.current_version "
)


def _payload(
    row: dict[str, Any],
    actor: dict[str, Any],
    today: date,
) -> dict[str, Any]:

    expires = _day(row.get("expires_on"))

    status, left = _status_of(expires, today)

    return {
        "id": row["id"],
        "number": _number(row),
        "title": row["title"],
        "category": row["category"],
        "description": row.get("description") or "",
        "expires_on": expires.isoformat() if expires else None,
        "status": status,
        "days_left": left,
        "link": (
            {"type": row["link_type"], "label": row["link_label"] or ""}
            if row.get("link_type")
            else None
        ),
        "visibility": row["visibility"],
        "allowed_roles": _roles_of(row),
        "is_report": bool(row["is_report"]),
        "report_start": (
            _day(row.get("report_start")).isoformat()
            if _day(row.get("report_start"))
            else None
        ),
        "report_end": (
            _day(row.get("report_end")).isoformat()
            if _day(row.get("report_end"))
            else None
        ),
        "version": row["current_version"],
        "version_count": int(row.get("version_count") or 1),
        "file": {
            "name": row["file_name"],
            "type": row["file_type"],
            "size": int(row["file_size"]),
            "at": iso(row.get("file_at")),
        },
        "uploaded_by": {
            "id": row["uploaded_by_id"],
            "name": row["uploaded_by_name"] or "Former employee",
            "role": row["uploaded_by_role"] or "",
        },
        "created_at": iso(row["created_at"]),
        "updated_at": iso(row["updated_at"]),
        "can_change": _can_change(actor, row),
    }


def _get_row(db: Session, document_id: int) -> dict[str, Any] | None:

    rows = run_rows(
        db,
        _LIST_SQL + "WHERE d.id = :id",
        {"id": document_id},
    )

    return rows[0] if rows else None


def _visible_row(
    db: Session, actor: dict[str, Any], document_id: Any
) -> dict[str, Any]:
    """The document, or a 404 (also when it may not be seen)."""

    try:
        wanted = int(document_id)
    except (TypeError, ValueError):
        raise _fail("Document not found.", 404) from None

    row = _get_row(db, wanted)

    if row is None or not _can_see(actor, row):
        raise _fail("Document not found.", 404)

    return row


def list_documents(db: Session, user: User) -> dict[str, Any]:
    """Every document the account may see (newest first) + the options."""

    ensure_tables(db)

    actor = _actor(user)

    send_expiry_reminders(db)

    rows = run_rows(
        db,
        _LIST_SQL
        + "ORDER BY d.created_at DESC, d.id DESC LIMIT :limit",
        {"limit": LIST_LIMIT},
    )

    today = _today()

    documents = [
        _payload(row, actor, today)
        for row in rows
        if _can_see(actor, row)
    ]

    return {
        "documents": documents,
        "options": {
            "categories": CATEGORIES,
            "report_category": REPORT_CATEGORY,
            "link_types": LINK_TYPES,
            "roles": all_role_names(db),
            "max_file_mb": MAX_FILE_BYTES // (1024 * 1024),
            "file_types": sorted({key for key in FILE_TYPES}),
            "expiry_warning_days": EXPIRY_WARNING_DAYS,
        },
        "me": {
            "id": actor["id"],
            "is_admin": actor["admin"],
            "can_report": actor["reporter"],
        },
        "today": today.isoformat(),
    }


def _versions(db: Session, document_id: int) -> list[dict[str, Any]]:

    rows = run_rows(
        db,
        "SELECT id, version_no, file_name, file_type, file_size, note, "
        "uploaded_by_id, uploaded_by_name, created_at "
        "FROM port_document_versions WHERE document_id = :id "
        "ORDER BY version_no DESC",
        {"id": document_id},
    )

    return [
        {
            "version": row["version_no"],
            "file_name": row["file_name"],
            "file_type": row["file_type"],
            "file_size": int(row["file_size"]),
            "note": row.get("note") or "",
            "uploaded_by": {
                "id": row["uploaded_by_id"],
                "name": row["uploaded_by_name"] or "Former employee",
            },
            "created_at": iso(row["created_at"]),
        }
        for row in rows
    ]


def get_document(db: Session, user: User, document_id: Any) -> dict[str, Any]:
    """One document with all its versions."""

    ensure_tables(db)

    actor = _actor(user)

    row = _visible_row(db, actor, document_id)

    return {
        "document": _payload(row, actor, _today()),
        "versions": _versions(db, row["id"]),
    }


def read_file(
    db: Session,
    user: User,
    document_id: Any,
    version: Any = None,
    request: Any = None,
) -> dict[str, Any]:
    """
    The file of a document (the current version unless one is
    asked for) as base64 text. Opening or downloading is recorded in
    the Audit Log.
    """

    ensure_tables(db)

    actor = _actor(user)

    row = _visible_row(db, actor, document_id)

    wanted = row["current_version"]

    if version not in (None, ""):

        try:
            wanted = int(version)
        except (TypeError, ValueError):
            raise _fail("That version does not exist.", 404) from None

    found = db.execute(
        text(
            "SELECT version_no, file_name, file_type, file_size, content "
            "FROM port_document_versions "
            "WHERE document_id = :id AND version_no = :v"
        ),
        {"id": row["id"], "v": wanted},
    ).mappings().first()

    if found is None:
        raise _fail("That version does not exist.", 404)

    content = bytes(found["content"])

    audit_service.record(
        module=MODULE_NAME,
        action="Document opened or downloaded",
        category="download",
        target=f"{_number(row)} {row['title']}",
        description=f"Version {found['version_no']}: {found['file_name']}",
        details={
            "version": found["version_no"],
            "file": found["file_name"],
            "size": int(found["file_size"]),
        },
        user=user,
        request=request,
    )

    return {
        "file_name": found["file_name"],
        "file_type": found["file_type"],
        "file_size": int(found["file_size"]),
        "version": found["version_no"],
        "data": base64.b64encode(content).decode("ascii"),
    }


# =========================================================
# CHECKING THE FORM
# =========================================================


def _choice(value: Any, allowed: list[str], message: str) -> str:

    text_value = _single_line(value)

    for item in allowed:
        if item.lower() == text_value.lower():
            return item

    raise _fail(message)


def _clean_details(
    db: Session,
    data: dict[str, Any],
    category_choices: list[str],
) -> dict[str, Any]:
    """The fields a person types (title, category, ...), checked."""

    title = _single_line(data.get("title"))

    if not title:
        raise _fail("Enter a title for the document.")

    if len(title) > MAX_TITLE:
        raise _fail(f"The title is too long (at most {MAX_TITLE} characters).")

    category = _choice(
        data.get("category"),
        category_choices,
        "Choose a category.",
    )

    description = str(data.get("description") or "").strip()

    if len(description) > MAX_TEXT:
        raise _fail(
            f"The description is too long (at most {MAX_TEXT} characters)."
        )

    expires = _parse_expiry(data.get("expires_on"))

    link_type = _single_line(data.get("link_type"))

    link_label = _single_line(data.get("link_label"))

    if link_type:

        link_type = _choice(
            link_type,
            LINK_TYPES,
            "Choose what the document belongs to.",
        )

        if not link_label:
            raise _fail(f"Say which {link_type.lower()} it belongs to.")

        if len(link_label) > MAX_LINK:
            raise _fail("The name of the linked record is too long.")

    else:
        link_type = ""
        link_label = ""

    visibility = _single_line(data.get("visibility") or "all").lower()

    if visibility not in VISIBILITIES:
        raise _fail("Choose who may see the document.")

    roles: list[str] = []

    if visibility == "roles":

        known = all_role_names(db)

        requested = data.get("allowed_roles")

        if not isinstance(requested, list) or not requested:
            raise _fail("Choose at least one role that may see the document.")

        for name in requested:

            roles.append(
                _choice(name, known, f"The role \"{name}\" does not exist.")
            )

        roles = sorted(set(roles), key=str.lower)

    return {
        "title": title,
        "category": category,
        "description": description,
        "expires_on": expires,
        "link_type": link_type or None,
        "link_label": link_label or None,
        "visibility": visibility,
        "allowed_roles": json.dumps(roles) if roles else None,
    }


# =========================================================
# CREATING AND CHANGING
# =========================================================


def _insert_version(
    db: Session,
    document_id: int,
    version_no: int,
    name: str,
    content_type: str,
    data: bytes,
    note: str,
    actor: dict[str, Any],
    now: datetime,
) -> None:

    db.execute(
        text(
            "INSERT INTO port_document_versions "
            "(document_id, version_no, file_name, file_type, file_size, "
            "content, note, uploaded_by_id, uploaded_by_name, created_at) "
            "VALUES (:d, :v, :n, :t, :s, :c, :no, :ui, :un, :ts)"
        ),
        {
            "d": document_id,
            "v": version_no,
            "n": name,
            "t": content_type,
            "s": len(data),
            "c": data,
            "no": note or None,
            "ui": actor["id"],
            "un": actor["name"][:120],
            "ts": now,
        },
    )


def _insert_document(
    db: Session,
    actor: dict[str, Any],
    fields: dict[str, Any],
    name: str,
    content_type: str,
    data: bytes,
    note: str,
    is_report: bool = False,
    report_start: date | None = None,
    report_end: date | None = None,
    report_scope: str | None = None,
) -> int:
    """Save a new document with its first file. Returns its id."""

    now = utc_now()

    document_id = None

    for attempt in range(NUMBER_ATTEMPTS):

        try:

            sequence = (
                run_scalar(
                    db,
                    "SELECT COALESCE(MAX(year_seq), 0) "
                    "FROM port_documents WHERE doc_year = :year",
                    {"year": now.year},
                )
                or 0
            ) + 1

            document_id = db.execute(
                text(
                    "INSERT INTO port_documents "
                    "(doc_year, year_seq, title, category, description, "
                    "expires_on, link_type, link_label, visibility, "
                    "allowed_roles, is_report, report_start, report_end, "
                    "report_scope, current_version, uploaded_by_id, "
                    "uploaded_by_name, uploaded_by_role, created_at, "
                    "updated_at) "
                    "VALUES (:y, :q, :ti, :ca, :de, :ex, :lt, :ll, :vi, "
                    ":ar, :ir, :rs, :re, :sc, 1, :ui, :un, :ur, :cr, :up) "
                    "RETURNING id"
                ),
                {
                    "y": now.year,
                    "q": sequence,
                    "ti": fields["title"],
                    "ca": fields["category"],
                    "de": fields["description"] or None,
                    "ex": fields["expires_on"],
                    "lt": fields["link_type"],
                    "ll": fields["link_label"],
                    "vi": fields["visibility"],
                    "ar": fields["allowed_roles"],
                    "ir": is_report,
                    "rs": report_start,
                    "re": report_end,
                    "sc": report_scope,
                    "ui": actor["id"],
                    "un": actor["name"][:120],
                    "ur": actor["role"][:80],
                    "cr": now,
                    "up": now,
                },
            ).scalar()

            _insert_version(
                db,
                document_id,
                1,
                name,
                content_type,
                data,
                note,
                actor,
                now,
            )

            db.commit()

            return int(document_id)

        except Exception as exc:

            db.rollback()

            document_id = None

            # Two people uploaded at the same moment and got the
            # same number: count again.
            if attempt == NUMBER_ATTEMPTS - 1:

                logger.exception("The document could not be saved.")

                raise _fail(
                    "The document could not be saved "
                    f"({type(exc).__name__}). Please try again.",
                    500,
                ) from exc

    raise _fail("The document could not be saved.", 500)


def create_document(
    db: Session,
    user: User,
    data: dict[str, Any],
    request: Any = None,
) -> dict[str, Any]:
    """An employee uploads a new document."""

    ensure_tables(db)

    actor = _actor(user)

    fields = _clean_details(db, data, CATEGORIES)

    name, content_type, content = check_file(
        data.get("file_name"), data.get("file_data")
    )

    document_id = _insert_document(
        db, actor, fields, name, content_type, content, ""
    )

    row = _get_row(db, document_id)

    audit_service.record(
        module=MODULE_NAME,
        action="Document uploaded",
        category="create",
        target=f"{_number(row)} {row['title']}",
        description=f"{fields['category']}: {name}",
        details={
            "file": name,
            "size": len(content),
            "category": fields["category"],
            "expires_on": (
                fields["expires_on"].isoformat()
                if fields["expires_on"]
                else None
            ),
            "visibility": fields["visibility"],
            "allowed_roles": _roles_of(
                {"allowed_roles": fields["allowed_roles"]}
            ),
        },
        user=user,
        request=request,
    )

    return {
        "document": _payload(row, actor, _today()),
        "versions": _versions(db, document_id),
    }


def _refuse_change(
    user: User,
    row: dict[str, Any],
    action: str,
    request: Any,
) -> HTTPException:
    """Record a refused change and give back the 403."""

    audit_service.record(
        module=MODULE_NAME,
        action=action,
        category="change",
        target=f"{_number(row)} {row['title']}",
        description="Only the person who uploaded it and the Port Administrator can do this.",
        result="Refused",
        user=user,
        request=request,
    )

    return _fail(
        "Only the person who uploaded this document and the Port "
        "Administrator can do this.",
        403,
    )


def add_version(
    db: Session,
    user: User,
    document_id: Any,
    data: dict[str, Any],
    request: Any = None,
) -> dict[str, Any]:
    """Upload a newer file for an existing document."""

    ensure_tables(db)

    actor = _actor(user)

    row = _visible_row(db, actor, document_id)

    if not _can_change(actor, row):
        raise _refuse_change(user, row, "New version refused", request)

    if row["is_report"]:
        raise _fail("A report is replaced by generating it again.")

    name, content_type, content = check_file(
        data.get("file_name"), data.get("file_data")
    )

    note = str(data.get("note") or "").strip()

    if len(note) > MAX_NOTE:
        raise _fail(f"The note is too long (at most {MAX_NOTE} characters).")

    version_no = _next_version(db, row["id"])

    now = utc_now()

    try:

        _insert_version(
            db, row["id"], version_no, name, content_type, content,
            note, actor, now,
        )

        db.execute(
            text(
                "UPDATE port_documents SET current_version = :v, "
                "updated_at = :ts WHERE id = :id"
            ),
            {"v": version_no, "ts": now, "id": row["id"]},
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The new version could not be saved.")

        raise _fail(
            "The new version could not be saved "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    audit_service.record(
        module=MODULE_NAME,
        action="New version uploaded",
        category="change",
        target=f"{_number(row)} {row['title']}",
        description=f"Version {version_no}: {name}",
        details={"version": version_no, "file": name, "size": len(content), "note": note},
        user=user,
        request=request,
    )

    fresh = _get_row(db, row["id"])

    return {
        "document": _payload(fresh, actor, _today()),
        "versions": _versions(db, row["id"]),
    }


def _next_version(db: Session, document_id: int) -> int:

    return (
        run_scalar(
            db,
            "SELECT COALESCE(MAX(version_no), 0) "
            "FROM port_document_versions WHERE document_id = :id",
            {"id": document_id},
        )
        or 0
    ) + 1


def edit_document(
    db: Session,
    user: User,
    document_id: Any,
    data: dict[str, Any],
    request: Any = None,
) -> dict[str, Any]:
    """Change the details (not the file) of a document."""

    ensure_tables(db)

    actor = _actor(user)

    row = _visible_row(db, actor, document_id)

    if not _can_change(actor, row):
        raise _refuse_change(user, row, "Change refused", request)

    if row["is_report"]:

        merged = {
            **data,
            "category": REPORT_CATEGORY,
        }

        fields = _clean_details(db, merged, [REPORT_CATEGORY])

    else:

        fields = _clean_details(db, data, CATEGORIES)

    old_expiry = _day(row.get("expires_on"))

    old_roles = _roles_of(row)

    new_roles = _roles_of({"allowed_roles": fields["allowed_roles"]})

    def show(value: Any) -> str:
        return "" if value in (None, "") else str(value)

    pairs = [
        ("Title", row["title"], fields["title"]),
        ("Category", row["category"], fields["category"]),
        (
            "Description",
            _clip_text(row.get("description")),
            _clip_text(fields["description"]),
        ),
        (
            "Expiry date",
            old_expiry.isoformat() if old_expiry else "",
            fields["expires_on"].isoformat() if fields["expires_on"] else "",
        ),
        (
            "Belongs to",
            (
                f"{row['link_type']}: {row['link_label']}"
                if row.get("link_type")
                else ""
            ),
            (
                f"{fields['link_type']}: {fields['link_label']}"
                if fields["link_type"]
                else ""
            ),
        ),
        (
            "Visible to",
            "everyone" if row["visibility"] != "roles" else ", ".join(old_roles),
            "everyone" if fields["visibility"] != "roles" else ", ".join(new_roles),
        ),
    ]

    changes = [
        {"field": label, "before": show(before), "after": show(after)}
        for label, before, after in pairs
        if show(before) != show(after)
    ]

    if not changes:
        return {
            "document": _payload(row, actor, _today()),
            "versions": _versions(db, row["id"]),
        }

    try:

        db.execute(
            text(
                "UPDATE port_documents SET title = :ti, category = :ca, "
                "description = :de, expires_on = :ex, link_type = :lt, "
                "link_label = :ll, visibility = :vi, allowed_roles = :ar, "
                "updated_at = :ts WHERE id = :id"
            ),
            {
                "ti": fields["title"],
                "ca": fields["category"],
                "de": fields["description"] or None,
                "ex": fields["expires_on"],
                "lt": fields["link_type"],
                "ll": fields["link_label"],
                "vi": fields["visibility"],
                "ar": fields["allowed_roles"],
                "ts": utc_now(),
                "id": row["id"],
            },
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The document could not be changed.")

        raise _fail(
            "The document could not be changed "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    audit_service.record(
        module=MODULE_NAME,
        action="Document details changed",
        category="change",
        target=f"{_number(row)} {row['title']}",
        description="; ".join(
            f"{item['field']}: {item['before'] or '(empty)'} → "
            f"{item['after'] or '(empty)'}"
            for item in changes
        ),
        details={"changes": changes},
        user=user,
        request=request,
    )

    fresh = _get_row(db, row["id"])

    return {
        "document": _payload(fresh, actor, _today()),
        "versions": _versions(db, row["id"]),
    }


def _clip_text(value: Any, longest: int = 80) -> str:

    cleaned = _single_line(value)

    return (
        cleaned
        if len(cleaned) <= longest
        else cleaned[: longest - 1].rstrip() + "…"
    )


def delete_document(
    db: Session,
    user: User,
    document_id: Any,
    request: Any = None,
) -> dict[str, Any]:
    """Delete a document and all its versions."""

    ensure_tables(db)

    actor = _actor(user)

    row = _visible_row(db, actor, document_id)

    if not _can_change(actor, row):
        raise _refuse_change(user, row, "Delete refused", request)

    versions = int(row.get("version_count") or 1)

    try:

        db.execute(
            text("DELETE FROM port_document_versions WHERE document_id = :id"),
            {"id": row["id"]},
        )

        db.execute(
            text("DELETE FROM port_documents WHERE id = :id"),
            {"id": row["id"]},
        )

        db.commit()

    except Exception as exc:

        db.rollback()

        logger.exception("The document could not be deleted.")

        raise _fail(
            "The document could not be deleted "
            f"({type(exc).__name__}). Please try again.",
            500,
        ) from exc

    audit_service.record(
        module=MODULE_NAME,
        action="Document deleted",
        category="delete",
        target=f"{_number(row)} {row['title']}",
        description=f"{row['category']}; {versions} version{'s' if versions != 1 else ''} deleted.",
        details={
            "number": _number(row),
            "title": row["title"],
            "category": row["category"],
            "versions": versions,
            "was_report": bool(row["is_report"]),
        },
        user=user,
        request=request,
    )

    return {"deleted": True, "id": row["id"]}


# =========================================================
# REPORTS (the PDF itself is made by report_service.py)
# =========================================================


def save_report(
    db: Session,
    user: User,
    *,
    title: str,
    file_name: str,
    pdf: bytes,
    start: date,
    end: date,
    note: str,
    scope: str = "",
    request: Any = None,
) -> dict[str, Any]:
    """
    Keep a generated report in the library. Generating the same
    period again adds a NEW VERSION to the same document, so every
    time the report was made stays on record.

    `scope` is kept for the future: every report made today covers
    the whole port, so it is always empty. A report with a different
    scope would be a separate document.
    """

    ensure_tables(db)

    actor = _actor(user)

    existing = db.execute(
        text(
            "SELECT id, visibility, allowed_roles FROM port_documents "
            "WHERE is_report = TRUE AND report_start = :s "
            "AND report_end = :e AND COALESCE(report_scope, '') = :sc "
            "ORDER BY id LIMIT 1"
        ),
        {"s": start, "e": end, "sc": scope},
    ).mappings().first()

    now = utc_now()

    if existing is not None:

        document_id = int(existing["id"])

        version_no = _next_version(db, document_id)

        try:

            _insert_version(
                db, document_id, version_no, file_name,
                "application/pdf", pdf, note, actor, now,
            )

            db.execute(
                text(
                    "UPDATE port_documents SET current_version = :v, "
                    "title = :ti, updated_at = :ts WHERE id = :id"
                ),
                {"v": version_no, "ti": title, "ts": now, "id": document_id},
            )

            # The person who made this version must be able to see it.
            if existing["visibility"] == "roles" and not actor["admin"]:

                allowed = _roles_of(existing)

                if actor["role"].strip().lower() not in {
                    name.strip().lower() for name in allowed
                }:

                    allowed.append(actor["role"])

                    db.execute(
                        text(
                            "UPDATE port_documents SET allowed_roles = :ar "
                            "WHERE id = :id"
                        ),
                        {
                            "ar": json.dumps(sorted(set(allowed), key=str.lower)),
                            "id": document_id,
                        },
                    )

            db.commit()

        except Exception as exc:

            db.rollback()

            logger.exception("The report could not be saved.")

            raise _fail(
                "The report could not be saved "
                f"({type(exc).__name__}). Please try again.",
                500,
            ) from exc

        was_new_version = True

    else:

        # A report is for the two roles that may make it.
        roles = sorted(audit_service.OVERSIGHT_ROLE_NAMES, key=str.lower)

        fields = {
            "title": title,
            "category": REPORT_CATEGORY,
            "description": (
                "Generated by the system from the port's own records."
            ),
            "expires_on": None,
            "link_type": None,
            "link_label": None,
            "visibility": "roles" if roles else "all",
            "allowed_roles": json.dumps(roles) if roles else None,
        }

        document_id = _insert_document(
            db, actor, fields, file_name, "application/pdf", pdf, note,
            is_report=True, report_start=start, report_end=end,
            report_scope=scope,
        )

        version_no = 1

        was_new_version = False

    row = _get_row(db, document_id)

    audit_service.record(
        module=MODULE_NAME,
        action="Report generated",
        category="report",
        target=f"{_number(row)} {row['title']}",
        description=(
            f"Version {version_no}: {file_name} ({len(pdf) // 1024} KB)"
        ),
        details={
            "period": f"{start.isoformat()} to {end.isoformat()}",
            "version": version_no,
            "size": len(pdf),
            "new_version_of_existing": was_new_version,
        },
        user=user,
        request=request,
    )

    return {
        "document": _payload(row, actor, _today()),
        "versions": _versions(db, document_id),
        "was_new_version": was_new_version,
    }


# =========================================================
# EXPIRY REMINDERS (through the bell)
# =========================================================

_reminder_lock = threading.Lock()

_last_reminder: dict[str, float | None] = {"at": None}


def send_expiry_reminders(db: Session, force: bool = False) -> int:
    """
    Remind the uploader and the Port Administrators about documents
    that expire within 30 days or have expired. Each reminder is
    sent once (the notification table refuses a repeat). Runs at
    most every 10 minutes and never raises. Returns how many
    reminders were made.
    """

    now = time.monotonic()

    with _reminder_lock:

        last = _last_reminder["at"]

        if not force and last is not None and now - last < REMINDER_EVERY_SECONDS:
            return 0

        _last_reminder["at"] = now

    try:

        today = _today()

        rows = run_rows(
            db,
            "SELECT id, doc_year, year_seq, title, category, expires_on, "
            "uploaded_by_id FROM port_documents "
            "WHERE expires_on IS NOT NULL AND expires_on <= :limit_day",
            {"limit_day": today + timedelta(days=EXPIRY_WARNING_DAYS)},
        )

        if not rows:
            return 0

        people = get_directory(db)

        admins = [
            person["id"]
            for person in people
            if person["active"]
            and person["role"].strip().lower() in ADMIN_ROLE_NAMES
        ]

        active = {person["id"] for person in people if person["active"]}

        made = 0

        for row in rows:

            expires = _day(row["expires_on"])

            if expires is None:
                continue

            status, left = _status_of(expires, today)

            recipients = set(admins)

            if row["uploaded_by_id"] in active:
                recipients.add(row["uploaded_by_id"])

            number = _number(row)

            if status == "expired":

                title = f"Document expired: {row['title']}"

                message = (
                    f"{number} ({row['category']}) expired on "
                    f"{expires.strftime('%d %b %Y')}."
                )

                kind = "error"

            else:

                days = left if left is not None else 0

                title = f"Document expiring soon: {row['title']}"

                message = (
                    f"{number} ({row['category']}) expires on "
                    f"{expires.strftime('%d %b %Y')} "
                    f"({'today' if days == 0 else f'in {days} day' + ('s' if days != 1 else '')})."
                )

                kind = "warning"

            made += add_notification(
                db,
                sorted(recipients),
                title=title,
                message=message,
                kind=kind,
                category="Documents",
                dedupe_key=(
                    f"doc-expiry:{row['id']}:{status}:{expires.isoformat()}"
                ),
            )

        db.commit()

        return made

    except Exception:

        logger.warning(
            "Document expiry reminders could not be made.",
            exc_info=True,
        )

        try:
            db.rollback()
        except Exception:
            pass

        return 0
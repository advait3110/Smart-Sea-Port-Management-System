"""
Port Report - a PDF with the statistics and graphs of a day (or a
short period), made from the port's own records.

What this file does
-------------------
1. Collects the figures from the real tables (gate records,
   incidents, cargo records, AIS ship positions, the port activity
   log, vessels, berths and equipment). Nothing is made up and there is no sample data. When
   nothing happened, the report says so instead of drawing empty or
   invented graphs.
2. Draws the PDF (reportlab) with graphs that are drawn inside the
   PDF itself, so they stay sharp when zoomed or printed.
3. Keeps the PDF in the document library (document_service.save_report).
   Making the report for the same period again adds a new VERSION of
   the same document, so every time it was made stays on record.

What a past day can and cannot show
-----------------------------------
The port keeps history for gate records, incidents, cargo records
and AIS ship positions, so those sections work for any day.
Ships by state, berth use, equipment status and open alerts are
"right now" figures: the database does not keep their history. They
are shown only when the report ends today, as "The situation at
HH:MM", and are left out of a report for a past day (the report says
so).

Permissions
-----------
Only the Port Administrator and the Port Executive can make a report
(the server checks this on every request). Both are allowed to see the
whole port, so the report is always complete: gate, incidents, cargo,
ships, the port activity (what people added, changed and deleted) and,
for a report that ends today, the situation right now. A section is
only left out when its records could not be read, and then the report
lists it at the end.

All dates and times are Singapore time (UTC+8, no daylight saving).
"""

from __future__ import annotations

import io
import logging
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from math import ceil, floor, log10
from typing import Any
from xml.sax.saxutils import escape

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.services import audit_service, document_service
from app.services.chat_service import run_rows, to_datetime


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

SG = timezone(timedelta(hours=8))

SG_OFFSET_SECONDS = 8 * 3600

# A report covers at most this many days (one bar per day).
MAX_DAYS = 31

STOPPED_BELOW_KNOTS = 0.5

# How many of the latest entries the "Port activity" section lists.
ACTIVITY_ROWS = 20

# Which features may read which data (the same rules as the routers
# in app/main.py).
ACCESS = {
    "gate": {"gate_trucks"},
    "incidents": {
        "incidents", "dashboard", "port_alerts", "port_map", "analytics",
    },
    "cargo": {
        "cargo", "dashboard", "vessels", "berths", "gate_trucks",
        "analytics",
    },
    "ships": {
        "vessels", "dashboard", "port_map", "berths", "cargo",
        "gate_trucks", "analytics",
    },
    "berths": {
        "berths", "dashboard", "port_map", "vessels", "cargo",
        "analytics",
    },
    "equipment": {
        "asset_maintenance", "dashboard", "port_alerts", "analytics",
    },
    # What people did in the port's work (the Audit Logs page, port
    # activity only). Only the two report roles ever get here.
    "activity": {"audit_logs"},
}

SECTION_NAMES = {
    "gate": "Gate activity",
    "incidents": "Incidents",
    "cargo": "Cargo records",
    "ships": "Ships",
    "berths": "Berths",
    "equipment": "Equipment",
    "activity": "Port activity",
}

SEVERITIES = ["Critical", "High", "Medium", "Low"]

FINISHED = ("Resolved", "Closed")

CARGO_ORDER = ["planned", "in_transit", "arrived", "delivered"]

CARGO_NAMES = {
    "planned": "Planned",
    "in_transit": "In transit",
    "arrived": "Arrived",
    "delivered": "Delivered",
}

EQUIPMENT_ORDER = [
    "Operational",
    "Maintenance",
    "Maintenance Due",
    "Overdue",
    "Out of Service",
]


# The same colours as the Port Statistics page.
BLUE = "#2a78d6"
ORANGE = "#eb6834"
GREEN = "#1baf7a"
AMBER = "#eda100"
PINK = "#e87ba4"
DARK_GREEN = "#008300"
PURPLE = "#6250d6"
RED = "#e34948"
CRITICAL = "#d03b3b"
HIGH = "#ec835a"
MEDIUM = "#fab219"
LOW = "#94a3b8"
GOOD = "#0ca30c"
OTHER = "#9ca3af"
GRID = "#e5e7eb"
NAVY = "#1b254b"
GRAY = "#4b5563"
LIGHT_GRAY = "#6b7280"
PANEL = "#f4f7fe"

SEVERITY_COLORS = {
    "Critical": CRITICAL,
    "High": HIGH,
    "Medium": MEDIUM,
    "Low": LOW,
    "Other": OTHER,
}

EQUIPMENT_COLORS = {
    "Operational": GOOD,
    "Maintenance": BLUE,
    "Maintenance Due": MEDIUM,
    "Overdue": HIGH,
    "Out of Service": CRITICAL,
}


# =========================================================
# SMALL HELPERS
# =========================================================


NOT_ALLOWED = (
    "Reports can only be generated by the Port Administrator and the "
    "Port Executive."
)


def _fail(message: str, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=message)


def _today() -> date:
    return datetime.now(SG).date()


def _now_sg() -> datetime:
    return datetime.now(SG)


def _fmt(value: Any, digits: int = 0) -> str:

    number = float(value)

    if digits == 0:
        return f"{int(round(number)):,}"

    return f"{number:,.{digits}f}"


def _day_text(day: date) -> str:
    return f"{day.day} {day.strftime('%b %Y')}"


def _short_day(day: date) -> str:
    return f"{day.day} {day.strftime('%b')}"


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """The period as two UTC moments (end is exclusive)."""

    first = datetime(start.year, start.month, start.day, tzinfo=SG)

    after = datetime(end.year, end.month, end.day, tzinfo=SG) + timedelta(days=1)

    return first.astimezone(timezone.utc), after.astimezone(timezone.utc)


def _sg(value: Any) -> datetime | None:

    moment = to_datetime(value)

    return moment.astimezone(SG) if moment is not None else None


def _tidy(value: Any, fallback: str = "Not given") -> str:

    cleaned = " ".join(str(value or "").split())

    return cleaned or fallback


def _percent(part: float, whole: float) -> int:

    if not whole:
        return 0

    return int(round(100 * part / whole))


def _ship_state(status: Any, nav: Any) -> str:
    """Same wording rule as the Berths page and the Dashboard."""

    wording = str(status or nav or "").lower()

    if "berth" in wording or "moored" in wording:
        return "berth"

    if "anchor" in wording:
        return "anchor"

    if "underway" in wording or "under way" in wording:
        return "underway"

    return "other"


def _report_features(user: User) -> set[str]:
    """
    What the person may read in the report.

    Only the Port Administrator and the Port Executive can make a
    report, and both oversee the whole port, so the report is always
    complete for them. Anybody else gets nothing (the server refuses
    them before this point; this is the second lock).
    """

    if not audit_service.has_oversight_role(user):
        return set()

    return set().union(*ACCESS.values())


def _can(features: set[str], section: str) -> bool:
    return bool(features & ACCESS[section])


# =========================================================
# COLLECTING THE FIGURES
# =========================================================


class Period:
    """The days of a report and how they are cut into bars."""

    def __init__(self, start: date, end: date):

        self.start = start

        self.end = end

        self.days = (end - start).days + 1

        self.single = self.days == 1

        self.count = 24 if self.single else self.days

        if self.single:
            self.labels = [str(hour) for hour in range(24)]
            self.axis_title = "Hour of the day (Singapore time)"
        else:
            self.labels = [
                _short_day(start + timedelta(days=index))
                for index in range(self.days)
            ]
            self.axis_title = "Day"

        self.unit = "hour" if self.single else "day"

    def index_of(self, moment: datetime | None) -> int | None:
        """The bar a Singapore moment falls into."""

        if moment is None:
            return None

        local = moment.astimezone(SG)

        if self.single:

            if local.date() != self.start:
                return None

            return local.hour

        offset = (local.date() - self.start).days

        return offset if 0 <= offset < self.days else None


def _gate_figures(db: Session, period: Period) -> dict[str, Any]:

    first, after = _bounds(period.start, period.end)

    rows = run_rows(
        db,
        "SELECT entry_time, exit_time, gate_number, transport_company "
        "FROM trucks "
        "WHERE (entry_time >= :s AND entry_time < :e) "
        "OR (exit_time >= :s AND exit_time < :e)",
        {"s": first, "e": after},
    )

    entries = [0] * period.count

    exits = [0] * period.count

    gates: Counter = Counter()

    companies: Counter = Counter()

    for row in rows:

        entry = _sg(row.get("entry_time"))

        index = period.index_of(entry)

        if index is not None and entry is not None:

            entries[index] += 1

            gates[_tidy(row.get("gate_number"))] += 1

            companies[_tidy(row.get("transport_company"))] += 1

        left = _sg(row.get("exit_time"))

        index = period.index_of(left)

        if index is not None:
            exits[index] += 1

    busiest = None

    if sum(entries):

        peak = max(range(period.count), key=lambda i: entries[i])

        busiest = {"index": peak, "count": entries[peak]}

    return {
        "entries": entries,
        "exits": exits,
        "total_entries": sum(entries),
        "total_exits": sum(exits),
        "gates": gates.most_common(5),
        "companies": companies.most_common(5),
        "busiest": busiest,
    }


def _incident_figures(db: Session, period: Period) -> dict[str, Any]:

    from app.services import incident_service

    incident_service.ensure_tables(db)

    first, after = _bounds(period.start, period.end)

    happened = run_rows(
        db,
        "SELECT incident_year, year_seq, incident_type, location, "
        "severity, status, occurred_at FROM port_incidents "
        "WHERE occurred_at >= :s AND occurred_at < :e "
        "ORDER BY occurred_at ASC",
        {"s": first, "e": after},
    )

    resolved = run_rows(
        db,
        "SELECT COUNT(*) AS n FROM port_incidents "
        "WHERE resolved_at >= :s AND resolved_at < :e",
        {"s": first, "e": after},
    )

    by_severity: Counter = Counter()

    by_type: Counter = Counter()

    by_status: Counter = Counter()

    still_open = 0

    for row in happened:

        severity = row["severity"] if row["severity"] in SEVERITIES else "Other"

        by_severity[severity] += 1

        by_type[_tidy(row["incident_type"])] += 1

        by_status[_tidy(row["status"])] += 1

        if row["status"] not in FINISHED:
            still_open += 1

    rank = {name: index for index, name in enumerate(SEVERITIES)}

    table = sorted(
        happened,
        key=lambda row: (
            rank.get(row["severity"], 9),
            str(row["occurred_at"]),
        ),
    )

    return {
        "reported": len(happened),
        "resolved": int((resolved[0]["n"] if resolved else 0) or 0),
        "still_open": still_open,
        "by_severity": by_severity,
        "by_type": by_type.most_common(6),
        "by_status": by_status,
        "table": [
            {
                "number": (
                    f"INC-{int(row['incident_year'])}-"
                    f"{int(row['year_seq']):03d}"
                ),
                "time": _sg(row["occurred_at"]),
                "type": _tidy(row["incident_type"]),
                "location": _tidy(row["location"]),
                "severity": _tidy(row["severity"]),
                "status": _tidy(row["status"]),
            }
            for row in table
        ],
    }


def _cargo_figures(db: Session, period: Period) -> dict[str, Any]:

    first, after = _bounds(period.start, period.end)

    rows = run_rows(
        db,
        "SELECT status, created_at FROM cargo "
        "WHERE created_at >= :s AND created_at < :e",
        {"s": first, "e": after},
    )

    counts: Counter = Counter()

    added = [0] * period.count

    for row in rows:

        key = (
            str(row.get("status") or "unknown")
            .strip()
            .lower()
            .replace(" ", "_")
            .replace("-", "_")
        ) or "unknown"

        counts[key] += 1

        index = period.index_of(_sg(row.get("created_at")))

        if index is not None:
            added[index] += 1

    ordered = [key for key in CARGO_ORDER if counts.get(key)] + sorted(
        key for key in counts if key not in CARGO_ORDER
    )

    return {
        "total": len(rows),
        "added": added,
        "statuses": [
            (
                CARGO_NAMES.get(key, key.replace("_", " ").capitalize()),
                counts[key],
            )
            for key in ordered
        ],
    }


def _traffic_rows(
    db: Session, first: datetime, after: datetime, bucket_seconds: int
) -> tuple[list[tuple[int, int]], int]:
    """
    Ships seen per bucket, from the stored AIS positions:
    [(bucket number, different ships)] and the different ships in
    the whole period. The bucket number counts whole hours (or days)
    since 1 Jan 1970 in Singapore time.

    PostgreSQL only (it reads epoch seconds, which gives the same
    answer whether the column keeps a time zone or not).
    """

    from app.models.ais_position_history import AISPositionHistory

    table = AISPositionHistory.__table__.name

    columns = AISPositionHistory.__table__.c

    when = columns.recorded_at.name

    mmsi = columns.mmsi.name

    buckets = db.execute(
        text(
            f"""
            SELECT
                CAST(
                    floor(
                        (extract(epoch FROM "{when}")
                            + {int(SG_OFFSET_SECONDS)})
                        / {int(bucket_seconds)}
                    ) AS BIGINT
                ) AS bucket_no,
                count(DISTINCT "{mmsi}") AS ships
            FROM "{table}"
            WHERE "{when}" >= :s AND "{when}" < :e
            GROUP BY 1
            ORDER BY 1
            """
        ),
        {"s": first, "e": after},
    ).all()

    whole = db.execute(
        text(
            f"""
            SELECT count(DISTINCT "{mmsi}") AS ships
            FROM "{table}"
            WHERE "{when}" >= :s AND "{when}" < :e
            """
        ),
        {"s": first, "e": after},
    ).scalar()

    return [(int(row[0]), int(row[1])) for row in buckets], int(whole or 0)


def _traffic_figures(db: Session, period: Period) -> dict[str, Any]:

    first, after = _bounds(period.start, period.end)

    seconds = 3600 if period.single else 86400

    buckets, whole = _traffic_rows(db, first, after, seconds)

    start_number = (
        (datetime(period.start.year, period.start.month, period.start.day, tzinfo=timezone.utc)
         - datetime(1970, 1, 1, tzinfo=timezone.utc)).days
    ) * (24 if period.single else 1)

    ships: list[int | None] = [None] * period.count

    for number, count in buckets:

        index = number - start_number

        if 0 <= index < period.count:
            ships[index] = count

    seen = [value for value in ships if value is not None]

    return {
        "ships": ships,
        "total": whole,
        "recorded": len(seen),
        "peak": max(seen) if seen else 0,
    }


def _activity_figures(db: Session, period: Period) -> dict[str, Any]:
    """
    What people did in the port's work in this period: records added,
    changed and deleted, files opened and reports made (the entries of
    the Audit Logs page; sign-ins and account changes are not part of
    it). Only things that really happened are counted; entries that
    were refused or failed are counted separately.
    """

    audit_service.ensure_table(db)

    first, after = _bounds(period.start, period.end)

    params: dict[str, Any] = {"s": first, "e": after}

    marks = []

    for position, name in enumerate(audit_service.PORT_MODULES):

        marks.append(f":m{position}")

        params[f"m{position}"] = name

    rows = run_rows(
        db,
        "SELECT created_at, user_id, user_name, role_name, module, "
        "category, action, target, result FROM audit_log "
        "WHERE created_at >= :s AND created_at < :e "
        f"AND module IN ({', '.join(marks)}) "
        "ORDER BY created_at, id",
        params,
    )

    groups = {
        "create": 0,
        "change": 1,
        "delete": 2,
        "download": 3,
        "report": 3,
    }

    bars = [[0] * period.count for _ in range(4)]

    kinds: Counter = Counter()

    modules: Counter = Counter()

    people: Counter = Counter()

    done: list[dict[str, Any]] = []

    not_done = 0

    for row in rows:

        if str(row.get("result") or "") != "Success":
            not_done += 1
            continue

        moment = _sg(row.get("created_at"))

        group = groups.get(str(row.get("category") or ""))

        if moment is None or group is None:
            continue

        index = period.index_of(moment)

        if index is not None:
            bars[group][index] += 1

        kinds[str(row.get("category"))] += 1

        modules[_tidy(row.get("module"))] += 1

        who = _tidy(row.get("user_name"), "Unknown")

        people[(row.get("user_id"), who)] += 1

        done.append(
            {
                "at": moment,
                "who": who,
                "module": _tidy(row.get("module")),
                "what": _tidy(row.get("action"), "Action"),
                "target": _tidy(row.get("target"), ""),
            }
        )

    return {
        "total": len(done),
        "not_done": not_done,
        "bars": bars,
        "added": kinds.get("create", 0),
        "changed": kinds.get("change", 0),
        "deleted": kinds.get("delete", 0),
        "opened": kinds.get("download", 0),
        "reports": kinds.get("report", 0),
        "modules": modules.most_common(),
        "people_count": len(people),
        "people": [
            (name, count)
            for (_, name), count in people.most_common(5)
        ],
        "latest": list(reversed(done[-ACTIVITY_ROWS:])),
    }


def _snapshot_figures(
    db: Session,
    user: User,
    features: set[str],
    left_out: list[tuple[str, str]],
) -> dict[str, Any]:
    """The situation right now (only for a report that ends today)."""

    out: dict[str, Any] = {}

    if _can(features, "ships"):

        try:

            rows = run_rows(
                db,
                "SELECT status, ais_navigation_status FROM vessels",
            )

            states = Counter(
                _ship_state(row.get("status"), row.get("ais_navigation_status"))
                for row in rows
            )

            out["ships"] = {
                "total": len(rows),
                "states": [
                    ("At berth", states.get("berth", 0), BLUE),
                    ("At anchorage", states.get("anchor", 0), ORANGE),
                    ("Underway", states.get("underway", 0), GREEN),
                    ("Other", states.get("other", 0), OTHER),
                ],
            }

        except Exception:

            db.rollback()

            logger.warning("The report could not read ships.", exc_info=True)

            left_out.append(("Ships right now", "The ships could not be read."))

    else:

        left_out.append(
            ("Ships right now", "Your account may not read vessel records.")
        )

    if _can(features, "berths"):

        try:

            from app.services.berth_service import get_berths, serialize_berths

            berths = [
                berth
                for berth in serialize_berths(db, get_berths(db))
                if getattr(berth, "is_active", True) is not False
            ]

            terminals: dict[str, list[int]] = {}

            occupied = 0

            for berth in berths:

                name = _tidy(getattr(berth, "terminal", None), "No terminal")

                entry = terminals.setdefault(name, [0, 0])

                entry[1] += 1

                if str(getattr(berth, "status", "")).lower() == "occupied":
                    entry[0] += 1
                    occupied += 1

            out["berths"] = {
                "total": len(berths),
                "occupied": occupied,
                "terminals": sorted(
                    (
                        (name, used, total)
                        for name, (used, total) in terminals.items()
                    ),
                    key=lambda item: (-item[2], item[0]),
                ),
            }

        except Exception:

            db.rollback()

            logger.warning("The report could not read berths.", exc_info=True)

            left_out.append(("Berths right now", "The berths could not be read."))

    else:

        left_out.append(
            ("Berths right now", "Your account may not read berth records.")
        )

    if _can(features, "equipment"):

        try:

            from app.services import asset_service

            # (the equipment tables are made the first time they are used)
            asset_service.ensure_tables(db)

            assets = asset_service.list_assets(db, user)["assets"]

            counts = Counter(asset["status"] for asset in assets)

            names = EQUIPMENT_ORDER + sorted(
                name for name in counts if name not in EQUIPMENT_ORDER
            )

            out["equipment"] = {
                "total": len(assets),
                "statuses": [
                    (name, counts.get(name, 0), EQUIPMENT_COLORS.get(name, OTHER))
                    for name in names
                    if counts.get(name, 0) or name in EQUIPMENT_ORDER
                ],
            }

        except Exception:

            db.rollback()

            logger.warning("The report could not read equipment.", exc_info=True)

            left_out.append(
                ("Equipment right now", "The equipment could not be read.")
            )

    else:

        left_out.append(
            (
                "Equipment right now",
                "Your account may not read equipment records.",
            )
        )

    if _can(features, "incidents"):

        try:

            rows = run_rows(
                db,
                "SELECT severity FROM port_incidents "
                "WHERE status NOT IN ('Resolved', 'Closed')",
            )

            counts = Counter(
                row["severity"] if row["severity"] in SEVERITIES else "Other"
                for row in rows
            )

            out["alerts"] = {
                "total": len(rows),
                "items": [
                    (name, counts[name], SEVERITY_COLORS[name])
                    for name in SEVERITIES + ["Other"]
                    if counts.get(name) or name in SEVERITIES
                ],
            }

        except Exception:

            db.rollback()

            logger.warning("The report could not read alerts.", exc_info=True)

            left_out.append(("Open alerts right now", "The incidents could not be read."))

    return out


def collect(
    db: Session,
    user: User,
    start: date,
    end: date,
    today: date,
) -> dict[str, Any]:
    """Everything the PDF shows."""

    features = _report_features(user)

    period = Period(start, end)

    data: dict[str, Any] = {
        "period": period,
        "left_out": [],
        "notes": [],
    }

    left_out: list[tuple[str, str]] = data["left_out"]

    def attempt(key: str, section: str, work) -> None:

        if not _can(features, section):

            left_out.append(
                (
                    SECTION_NAMES[section],
                    "Your account may not read this data.",
                )
            )

            return

        try:
            data[key] = work()
        except Exception:

            db.rollback()

            logger.warning(
                "The report could not read %s.", section, exc_info=True
            )

            left_out.append(
                (SECTION_NAMES[section], "The records could not be read.")
            )

    attempt("gate", "gate", lambda: _gate_figures(db, period))

    attempt("incidents", "incidents", lambda: _incident_figures(db, period))

    attempt("cargo", "cargo", lambda: _cargo_figures(db, period))

    attempt("traffic", "ships", lambda: _traffic_figures(db, period))

    attempt("activity", "activity", lambda: _activity_figures(db, period))

    if end == today:

        data["snapshot"] = _snapshot_figures(db, user, features, left_out)

        data["snapshot_at"] = _now_sg()

    else:

        data["snapshot"] = None

        data["notes"].append(
            "The situation right now (ships by state, berth use, "
            "equipment status and open alerts) is not part of this report. "
            "The port keeps no history of those figures, so they can only "
            "be shown when the report ends today."
        )

    return data


# =========================================================
# DRAWING THE PDF
# =========================================================


def _safe(value: Any) -> str:
    """Text the PDF's built-in font can show (others become '?')."""

    return str(value if value is not None else "").encode(
        "cp1252", "replace"
    ).decode("cp1252")


def _para(value: Any) -> str:
    return escape(_safe(value))


def _nice_scale(top_value: float) -> tuple[float, float, list[float]]:
    """A round top for the axis and its tick values."""

    if top_value <= 0:
        return 4.0, 1.0, [0.0, 1.0, 2.0, 3.0, 4.0]

    magnitude = 10 ** floor(log10(top_value))

    step = magnitude

    for multiple in (1, 2, 2.5, 5, 10):

        step = multiple * magnitude

        if ceil(top_value / step - 1e-9) <= 5:
            break

    top = ceil(top_value / step - 1e-9) * step

    ticks = []

    value = 0.0

    while value <= top + step / 1000:
        ticks.append(round(value, 6))
        value += step

    return top, step, ticks


def _axis_text(value: float) -> str:

    if value >= 1000:
        return f"{value / 1000:g}K"

    return f"{value:g}"


def _build_pdf(
    data: dict[str, Any],
    *,
    title: str,
    generated_by: str,
    generated_role: str,
    generated_at: datetime,
) -> bytes:
    """Draw the report and return the PDF bytes."""

    from reportlab.graphics.shapes import (
        Circle,
        Drawing,
        Line,
        PolyLine,
        Rect,
        String,
        Wedge,
    )
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.platypus import (
        BaseDocTemplate,
        CondPageBreak,
        Frame,
        KeepTogether,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )

    period: Period = data["period"]

    page_width, page_height = A4

    margin_x = 42

    content_width = page_width - 2 * margin_x

    def hexcolor(value: str):
        return colors.HexColor(value)

    # ------------------------------ styles
    body = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=9, leading=12.5,
        textColor=hexcolor(GRAY),
    )

    small = ParagraphStyle(
        "small", parent=body, fontSize=7.8, leading=10.5,
        textColor=hexcolor(LIGHT_GRAY),
    )

    title_style = ParagraphStyle(
        "title", fontName="Helvetica-Bold", fontSize=22, leading=26,
        textColor=hexcolor(NAVY),
    )

    sub_style = ParagraphStyle(
        "sub", fontName="Helvetica", fontSize=11.5, leading=15,
        textColor=hexcolor(GRAY),
    )

    heading = ParagraphStyle(
        "heading", fontName="Helvetica-Bold", fontSize=13, leading=16,
        textColor=hexcolor(NAVY), spaceBefore=14, spaceAfter=2,
    )

    note_style = ParagraphStyle(
        "note", parent=body, fontSize=8.5, leading=11.5,
        textColor=hexcolor(LIGHT_GRAY), spaceAfter=4,
    )

    cell = ParagraphStyle(
        "cell", fontName="Helvetica", fontSize=8, leading=10,
        textColor=hexcolor(GRAY),
    )

    cell_bold = ParagraphStyle(
        "cellb", parent=cell, fontName="Helvetica-Bold",
        textColor=hexcolor(NAVY),
    )

    tile_value = ParagraphStyle(
        "tv", fontName="Helvetica-Bold", fontSize=20, leading=23,
        textColor=hexcolor(NAVY),
    )

    tile_label = ParagraphStyle(
        "tl", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
        textColor=hexcolor(GRAY),
    )

    tile_note = ParagraphStyle(
        "tn", fontName="Helvetica", fontSize=7.6, leading=10,
        textColor=hexcolor(LIGHT_GRAY),
    )

    # ------------------------------ drawing helpers

    def text_width(value: str, font: str, size: float) -> float:
        from reportlab.pdfbase.pdfmetrics import stringWidth

        return stringWidth(_safe(value), font, size)

    def put(drawing, x, y, value, size=7.5, bold=False, color=GRAY, anchor="start"):

        drawing.add(
            String(
                x, y, _safe(value),
                fontName="Helvetica-Bold" if bold else "Helvetica",
                fontSize=size, fillColor=hexcolor(color), textAnchor=anchor,
            )
        )

    def legend_row(drawing, items, x, y):
        """A row of colour squares with names. Returns the end x."""

        cursor = x

        for name, color in items:

            drawing.add(
                Rect(cursor, y - 1, 8, 8, fillColor=hexcolor(color), strokeColor=None)
            )

            put(drawing, cursor + 12, y, name, 7.8, color=GRAY)

            cursor += 12 + text_width(name, "Helvetica", 7.8) + 16

        return cursor

    def column_chart(labels, series, height=170, stacked=False, x_title=""):
        """
        Columns. `series` is a list of (name, values, color).
        Several series are drawn side by side (or stacked).
        """

        width = content_width

        drawing = Drawing(width, height)

        count = len(labels)

        left, right, top, bottom = 34, 6, 20 if len(series) > 1 else 8, 30

        plot_w = width - left - right

        plot_h = height - top - bottom

        if stacked:
            peak = max(
                (sum((s[1][i] or 0) for s in series) for i in range(count)),
                default=0,
            )
        else:
            peak = max(
                (value or 0 for s in series for value in s[1]), default=0
            )

        top_value, step, ticks = _nice_scale(peak)

        def y_of(value):
            return bottom + plot_h * (value / top_value)

        for tick in ticks:

            y = y_of(tick)

            drawing.add(
                Line(left, y, left + plot_w, y,
                     strokeColor=hexcolor(GRID), strokeWidth=0.5)
            )

            put(drawing, left - 4, y - 2.5, _axis_text(tick), 7, color=LIGHT_GRAY, anchor="end")

        group_w = plot_w / max(count, 1)

        kinds = len(series)

        if stacked or kinds == 1:
            bar_w = min(group_w * 0.62, 26)
        else:
            bar_w = min((group_w * 0.74) / kinds, 16)

        label_step = max(1, ceil(count / 16))

        for index in range(count):

            center = left + group_w * (index + 0.5)

            if stacked:

                running = 0.0

                for name, values, color in series:

                    value = values[index] or 0

                    if value <= 0:
                        continue

                    drawing.add(
                        Rect(
                            center - bar_w / 2, y_of(running),
                            bar_w, y_of(running + value) - y_of(running) - 0.8,
                            fillColor=hexcolor(color), strokeColor=None,
                        )
                    )

                    running += value

                total = running

                if total and count <= 12:
                    put(drawing, center, y_of(total) + 2.5, _fmt(total), 7, True, NAVY, "middle")

            else:

                first_x = center - (bar_w * kinds + 1.5 * (kinds - 1)) / 2

                for position, (name, values, color) in enumerate(series):

                    value = values[index] or 0

                    x = first_x + position * (bar_w + 1.5)

                    if value > 0:

                        drawing.add(
                            Rect(
                                x, y_of(0), bar_w, y_of(value) - y_of(0),
                                fillColor=hexcolor(color), strokeColor=None,
                            )
                        )

                        if count <= 12:
                            put(drawing, x + bar_w / 2, y_of(value) + 2.5,
                                _fmt(value), 6.6, False, NAVY, "middle")

            if index % label_step == 0:
                put(drawing, center, bottom - 11, labels[index], 7, color=GRAY, anchor="middle")

        drawing.add(
            Line(left, bottom, left + plot_w, bottom,
                 strokeColor=hexcolor("#cbd5e1"), strokeWidth=0.8)
        )

        if x_title:
            put(drawing, left + plot_w / 2, 4, x_title, 7.4, color=LIGHT_GRAY, anchor="middle")

        if kinds > 1:
            legend_row(drawing, [(s[0], s[2]) for s in series], left, height - 11)

        return drawing

    def line_chart(labels, values, color=BLUE, height=165, x_title="", unit_word="ships"):
        """A line. A missing value (None) leaves a gap, never a zero."""

        width = content_width

        drawing = Drawing(width, height)

        count = len(labels)

        left, right, top, bottom = 34, 10, 10, 30

        plot_w = width - left - right

        plot_h = height - top - bottom

        peak = max((v for v in values if v is not None), default=0)

        top_value, step, ticks = _nice_scale(peak)

        def y_of(value):
            return bottom + plot_h * (value / top_value)

        for tick in ticks:

            y = y_of(tick)

            drawing.add(
                Line(left, y, left + plot_w, y,
                     strokeColor=hexcolor(GRID), strokeWidth=0.5)
            )

            put(drawing, left - 4, y - 2.5, _axis_text(tick), 7, color=LIGHT_GRAY, anchor="end")

        def x_of(index):
            return left + plot_w * ((index + 0.5) / count)

        label_step = max(1, ceil(count / 16))

        for index in range(count):

            if index % label_step == 0:
                put(drawing, x_of(index), bottom - 11, labels[index], 7, color=GRAY, anchor="middle")

        drawing.add(
            Line(left, bottom, left + plot_w, bottom,
                 strokeColor=hexcolor("#cbd5e1"), strokeWidth=0.8)
        )

        run: list[tuple[float, float]] = []

        runs: list[list[tuple[float, float]]] = []

        for index, value in enumerate(values):

            if value is None:

                if run:
                    runs.append(run)

                run = []

                continue

            run.append((x_of(index), y_of(value)))

        if run:
            runs.append(run)

        for points in runs:

            if len(points) > 1:

                flat = [number for point in points for number in point]

                drawing.add(
                    PolyLine(flat, strokeColor=hexcolor(color), strokeWidth=1.6)
                )

        small_dots = count <= 31

        for points in runs:

            for x, y in points:

                drawing.add(
                    Circle(
                        x, y, 2.4 if small_dots else 1.6,
                        fillColor=hexcolor(color),
                        strokeColor=colors.white, strokeWidth=0.8,
                    )
                )

        if x_title:
            put(drawing, left + plot_w / 2, 4, x_title, 7.4, color=LIGHT_GRAY, anchor="middle")

        return drawing

    def donut(items, centre_text="", centre_note="", width=None, height=120):
        """A ring with a legend (name, number and share) beside it."""

        width = width or content_width

        drawing = Drawing(width, height)

        total = sum(value for _, value, _ in items)

        # A ring that always leaves room for the legend beside it.
        radius = min(height / 2 - 4, 46)

        cx = radius + 6

        cy = height / 2

        inner = radius * 0.6

        if total <= 0:
            return None

        cursor = 0.0

        for name, value, color in items:

            if value <= 0:
                continue

            share = value / total

            if share >= 0.9999:

                drawing.add(Circle(cx, cy, radius, fillColor=hexcolor(color), strokeColor=colors.white, strokeWidth=1))
                drawing.add(Circle(cx, cy, inner, fillColor=colors.white, strokeColor=None))

            else:

                start = 90 - 360 * (cursor + share)

                stop = 90 - 360 * cursor

                drawing.add(
                    Wedge(
                        cx, cy, radius, start, stop, radius1=inner,
                        fillColor=hexcolor(color), strokeColor=colors.white,
                        strokeWidth=1.2,
                    )
                )

            cursor += share

        put(drawing, cx, cy + 1, centre_text, 15, True, NAVY, "middle")

        if centre_note:
            put(drawing, cx, cy - 9, centre_note, 6.8, False, LIGHT_GRAY, "middle")

        row_h = 15

        shown = [item for item in items]

        top_y = height / 2 + (len(shown) * row_h) / 2 - 11

        legend_x = cx + radius + 14

        value_x = width - 38

        percent_x = width - 2

        name_room = value_x - 22 - (legend_x + 14)

        for position, (name, value, color) in enumerate(shown):

            y = top_y - position * row_h

            drawing.add(Rect(legend_x, y - 1, 8, 8, fillColor=hexcolor(color), strokeColor=None))

            label = _safe(name)

            while text_width(label, "Helvetica", 8.5) > name_room and len(label) > 4:
                label = label[:-2]

            if label != _safe(name):
                label = label.rstrip() + "..."

            put(drawing, legend_x + 14, y, label, 8.5, color=GRAY)

            put(drawing, value_x, y, _fmt(value), 8.5, True, NAVY, "end")

            put(drawing, percent_x, y, f"{_percent(value, total)}%", 8.5, False, LIGHT_GRAY, "end")

        return drawing

    def hbars(items, width=None, label_w=120, color=BLUE, max_value=None, row_h=17):
        """Rows: a name, a bar and a number. items: (name, value, text)."""

        width = width or content_width

        height = max(len(items), 1) * row_h + 4

        drawing = Drawing(width, height)

        peak = max_value or max((value for _, value, _ in items), default=1) or 1

        bar_left = label_w + 6

        bar_room = width - bar_left - 62

        for position, (name, value, shown) in enumerate(items):

            y = height - (position + 1) * row_h + 3

            label = _safe(name)

            while text_width(label, "Helvetica", 8) > label_w and len(label) > 4:
                label = label[:-2]

            if label != _safe(name):
                label = label.rstrip() + "..."

            put(drawing, 0, y + 2, label, 8, color=GRAY)

            drawing.add(Rect(bar_left, y, bar_room, 9, fillColor=hexcolor("#eef2f7"), strokeColor=None))

            if value > 0:

                drawing.add(
                    Rect(bar_left, y, max(bar_room * value / peak, 1.5), 9,
                         fillColor=hexcolor(color), strokeColor=None)
                )

            put(drawing, width, y + 1.5, shown, 8, True, NAVY, "end")

        return drawing

    def table(rows, widths, header=True):

        shaped = []

        for r, row in enumerate(rows):

            shaped.append(
                [
                    Paragraph(
                        _para(value),
                        cell_bold if (header and r == 0) else cell,
                    )
                    for value in row
                ]
            )

        grid = Table(shaped, colWidths=widths, repeatRows=1 if header else 0)

        style = [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, hexcolor(GRID)),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]

        if header:
            style.append(("BACKGROUND", (0, 0), (-1, 0), hexcolor(PANEL)))

        grid.setStyle(TableStyle(style))

        return grid

    # ------------------------------ the story

    story: list = []

    def note(value: str):
        story.append(Paragraph(_para(value), note_style))

    def head(value: str, subtitle: str = ""):

        story.append(Paragraph(_para(value), heading))

        story.append(
            Table(
                [[""]], colWidths=[content_width], rowHeights=[1.2],
                style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.8, hexcolor("#cbd5e1"))]),
            )
        )

        story.append(Spacer(1, 4))

        if subtitle:
            note(subtitle)

    kind_word = "Daily Port Report" if period.single else "Port Report"

    if period.single:
        period_text = period.start.strftime("%A, ") + _day_text(period.start)
    else:
        period_text = (
            f"{_day_text(period.start)} to {_day_text(period.end)} "
            f"({period.days} days)"
        )

    story.append(Paragraph(_para(kind_word), title_style))

    story.append(Spacer(1, 3))

    story.append(Paragraph(_para(period_text), sub_style))

    story.append(Spacer(1, 3))

    story.append(
        Paragraph(
            _para(
                f"Generated by {generated_by}"
                + (f" ({generated_role})" if generated_role else "")
                + f" on {_day_text(generated_at.date())} at "
                f"{generated_at.strftime('%H:%M')} Singapore time."
            ),
            small,
        )
    )

    if period.end == generated_at.date():

        story.append(
            Paragraph(
                _para(
                    "The day is not over yet. Figures are up to "
                    f"{generated_at.strftime('%H:%M')}."
                ),
                small,
            )
        )

    story.append(Spacer(1, 10))

    # ---- key figures
    gate = data.get("gate")

    incidents = data.get("incidents")

    cargo = data.get("cargo")

    traffic = data.get("traffic")

    activity = data.get("activity")

    def tile(label, value, sub):

        return [
            Paragraph(_para(value), tile_value),
            Paragraph(_para(label), tile_label),
            Paragraph(_para(sub), tile_note),
        ]

    busiest_text = ""

    if gate and gate["busiest"]:

        index = gate["busiest"]["index"]

        spot = f"{index:02d}:00" if period.single else period.labels[index]

        busiest_text = f"Busiest {period.unit}: {spot} ({_fmt(gate['busiest']['count'])})"

    tiles = [
        tile(
            "Ships seen",
            _fmt(traffic["total"]) if traffic else "-",
            (
                "Different ships with a stored position"
                if traffic
                else "Not included in this report"
            ),
        ),
        tile(
            "Truck entries",
            _fmt(gate["total_entries"]) if gate else "-",
            (busiest_text or "No entries in this period") if gate else "Not included in this report",
        ),
        tile(
            "Truck exits",
            _fmt(gate["total_exits"]) if gate else "-",
            "Trucks that left the port" if gate else "Not included in this report",
        ),
        tile(
            "Incidents reported",
            _fmt(incidents["reported"]) if incidents else "-",
            (
                f"{_fmt(incidents['still_open'])} still open"
                if incidents and incidents["reported"]
                else ("None in this period" if incidents else "Not included in this report")
            ),
        ),
        tile(
            "Incidents resolved",
            _fmt(incidents["resolved"]) if incidents else "-",
            "Resolved in this period" if incidents else "Not included in this report",
        ),
        tile(
            "Cargo records added",
            _fmt(cargo["total"]) if cargo else "-",
            "Registered in this period" if cargo else "Not included in this report",
        ),
        tile(
            "Port activity",
            _fmt(activity["total"]) if activity else "-",
            (
                (
                    f"{_fmt(activity['added'])} added, "
                    f"{_fmt(activity['changed'])} changed, "
                    f"{_fmt(activity['deleted'])} deleted"
                )
                if activity and activity["total"]
                else ("Nothing recorded in this period" if activity else "Not included in this report")
            ),
        ),
        tile(
            "People active",
            _fmt(activity["people_count"]) if activity else "-",
            (
                "Worked on port records"
                if activity and activity["people_count"]
                else ("Nobody in this period" if activity else "Not included in this report")
            ),
        ),
        tile(
            "Refused or failed",
            _fmt(activity["not_done"]) if activity else "-",
            (
                "Actions that did not go through"
                if activity and activity["not_done"]
                else ("None in this period" if activity else "Not included in this report")
            ),
        ),
    ]

    gap = 6

    tile_w = (content_width - 2 * gap) / 3

    tile_table = Table(
        [tiles[0:3], tiles[3:6], tiles[6:9]],
        colWidths=[tile_w, tile_w, tile_w],
        hAlign="LEFT",
    )

    tile_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), hexcolor(PANEL)),
                ("BOX", (0, 0), (0, 0), 0, colors.white),
                ("LINEAFTER", (0, 0), (1, -1), gap, colors.white),
                ("LINEBELOW", (0, 0), (-1, 1), gap, colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    story.append(tile_table)

    # ---- gate
    if gate:

        block = [
            Paragraph(_para("Gate activity"), heading),
            Spacer(1, 2),
        ]

        if gate["total_entries"] or gate["total_exits"]:

            block.append(
                column_chart(
                    period.labels,
                    [
                        ("Entries", gate["entries"], BLUE),
                        ("Exits", gate["exits"], ORANGE),
                    ],
                    x_title=period.axis_title,
                )
            )

        else:

            block.append(
                Paragraph(
                    _para("No truck entries or exits were recorded in this period."),
                    body,
                )
            )

        story.append(KeepTogether(block))

        if gate["gates"]:

            half = (content_width - 18) / 2

            left_items = [
                (name, count, f"{_fmt(count)}") for name, count in gate["gates"]
            ]

            right_items = [
                (name, count, f"{_fmt(count)}") for name, count in gate["companies"]
            ]

            both = Table(
                [
                    [
                        Paragraph(_para("Entries by gate"), cell_bold),
                        Paragraph(_para("Transport companies"), cell_bold),
                    ],
                    [
                        hbars(left_items, half, 90, BLUE),
                        hbars(right_items, half, 90, ORANGE),
                    ],
                ],
                colWidths=[half + 9, half + 9],
            )

            both.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                )
            )

            story.append(Spacer(1, 6))

            story.append(both)

    # ---- incidents
    if incidents:

        block = [Paragraph(_para("Incidents"), heading), Spacer(1, 2)]

        if incidents["reported"]:

            items = [
                (name, incidents["by_severity"].get(name, 0), SEVERITY_COLORS[name])
                for name in SEVERITIES + ["Other"]
                if incidents["by_severity"].get(name, 0)
            ]

            ring = donut(
                items,
                centre_text=_fmt(incidents["reported"]),
                centre_note="incidents",
                width=content_width / 2 - 6,
            )

            kinds = hbars(
                [
                    (name, count, _fmt(count))
                    for name, count in incidents["by_type"]
                ],
                content_width / 2 - 6,
                104,
                PURPLE,
            )

            side = Table(
                [
                    [
                        Paragraph(_para("By seriousness"), cell_bold),
                        Paragraph(_para("By type"), cell_bold),
                    ],
                    [ring, kinds],
                ],
                colWidths=[content_width / 2, content_width / 2],
            )

            side.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )

            block.append(side)

        else:

            block.append(
                Paragraph(_para("No incidents happened in this period."), body)
            )

        story.append(KeepTogether(block))

        if incidents["table"]:

            shown = incidents["table"][:12]

            rows = [["Number", "Time", "Type", "Location", "Seriousness", "Status"]]

            for item in shown:

                moment = item["time"]

                clock = (
                    moment.strftime("%H:%M")
                    if period.single
                    else moment.strftime("%d %b %H:%M")
                ) if moment else ""

                rows.append(
                    [
                        item["number"],
                        clock,
                        item["type"],
                        item["location"],
                        item["severity"],
                        item["status"],
                    ]
                )

            story.append(Spacer(1, 6))

            # do not leave the table's header alone at the page bottom
            story.append(CondPageBreak(80))

            story.append(
                table(
                    rows,
                    [62, 64, 94, 98, 58, content_width - 376],
                )
            )

            if len(incidents["table"]) > len(shown):

                story.append(Spacer(1, 3))

                note(
                    f"and {len(incidents['table']) - len(shown)} more "
                    "(the most serious are listed first)."
                )

    # ---- ship traffic
    if traffic:

        block = [Paragraph(_para("Ships seen"), heading), Spacer(1, 2)]

        if traffic["recorded"]:

            block.append(
                line_chart(
                    period.labels,
                    traffic["ships"],
                    x_title=(
                        "Hour of the day (Singapore time)"
                        if period.single
                        else "Day (different ships seen that day)"
                    ),
                )
            )

            block.append(
                Paragraph(
                    _para(
                        f"Ship positions were stored in {_fmt(traffic['recorded'])} of "
                        f"{_fmt(period.count)} {period.unit}s. "
                        "Hours or days without stored positions are left blank, not "
                        "counted as zero. This counts ships seen by the tracking "
                        "system, not formal port calls."
                    ),
                    note_style,
                )
            )

        else:

            block.append(
                Paragraph(
                    _para("No ship positions were stored in this period."), body
                )
            )

        story.append(KeepTogether(block))

    # ---- cargo
    if cargo:

        block = [Paragraph(_para("Cargo records"), heading), Spacer(1, 2)]

        if cargo["total"]:

            block.append(
                hbars(
                    [(name, count, _fmt(count)) for name, count in cargo["statuses"]],
                    content_width,
                    120,
                    GREEN,
                )
            )

            block.append(
                Paragraph(
                    _para(
                        f"{_fmt(cargo['total'])} cargo record"
                        f"{'' if cargo['total'] == 1 else 's'} registered in "
                        "this period, by where they stand now."
                    ),
                    note_style,
                )
            )

        else:

            block.append(
                Paragraph(
                    _para("No cargo records were added in this period."), body
                )
            )

        story.append(KeepTogether(block))

    # ---- port activity
    if activity:

        block = [
            Paragraph(_para("Port activity"), heading),
            Spacer(1, 2),
            Paragraph(
                _para(
                    "What people added, changed and deleted in the port's "
                    "records (vessels, berths, cargo, gate and trucks, "
                    "incidents, equipment and documents), as kept in the "
                    "Audit Logs. Only actions that went through are counted."
                ),
                note_style,
            ),
        ]

        if activity["total"]:

            names = [
                ("Added", activity["bars"][0], GREEN),
                ("Changed", activity["bars"][1], BLUE),
                ("Deleted", activity["bars"][2], ORANGE),
                ("Opened files / reports", activity["bars"][3], OTHER),
            ]

            block.append(
                column_chart(
                    period.labels,
                    [item for item in names if sum(item[1])],
                    stacked=True,
                    x_title=period.axis_title,
                )
            )

        else:

            block.append(
                Paragraph(
                    _para("No work on the port's records was recorded in this period."),
                    body,
                )
            )

        story.append(KeepTogether(block))

        if activity["total"]:

            half = (content_width - 18) / 2

            by_part = [
                (name, count, _fmt(count))
                for name, count in activity["modules"]
            ]

            by_person = [
                (name, count, _fmt(count))
                for name, count in activity["people"]
            ]

            both = Table(
                [
                    [
                        Paragraph(_para("By part of the port"), cell_bold),
                        Paragraph(_para("Most active people"), cell_bold),
                    ],
                    [
                        hbars(by_part, half, 90, BLUE),
                        hbars(by_person, half, 90, ORANGE),
                    ],
                ],
                colWidths=[half + 9, half + 9],
            )

            both.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                )
            )

            story.append(Spacer(1, 6))

            story.append(KeepTogether([both]))

            rows = [["Time", "Person", "Part of the port", "What happened"]]

            for item in activity["latest"]:

                when = (
                    item["at"].strftime("%H:%M")
                    if period.single
                    else f"{_short_day(item['at'].date())} {item['at'].strftime('%H:%M')}"
                )

                what = item["what"] + (
                    f": {item['target']}" if item["target"] else ""
                )

                rows.append([when, item["who"], item["module"], what])

            story.append(Spacer(1, 8))

            story.append(
                Paragraph(
                    _para(
                        "Latest entries"
                        if activity["total"] > len(activity["latest"])
                        else "All entries"
                    ),
                    cell_bold,
                )
            )

            story.append(Spacer(1, 2))

            story.append(
                table(
                    rows,
                    [
                        62 if not period.single else 40,
                        104,
                        92,
                        content_width - (62 if not period.single else 40) - 196,
                    ],
                )
            )

            if activity["total"] > len(activity["latest"]):

                story.append(Spacer(1, 3))

                note(
                    f"Showing the latest {len(activity['latest'])} of "
                    f"{_fmt(activity['total'])}. The full list is on the "
                    "Audit Logs page."
                )

        if activity["not_done"]:

            story.append(Spacer(1, 3))

            many = activity["not_done"] != 1

            note(
                f"{_fmt(activity['not_done'])} more "
                f"action{'s' if many else ''} in this period "
                f"{'were' if many else 'was'} refused or failed and "
                f"{'are' if many else 'is'} not counted above."
            )

    # ---- the situation right now
    snapshot = data.get("snapshot")

    if snapshot:

        at = data["snapshot_at"]

        # keep the heading together with the first rings
        story.append(CondPageBreak(240))

        story.append(
            Paragraph(
                _para(f"The situation at {at.strftime('%H:%M')} Singapore time"),
                heading,
            )
        )

        story.append(
            Table(
                [[""]], colWidths=[content_width], rowHeights=[1.2],
                style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.8, hexcolor("#cbd5e1"))]),
            )
        )

        story.append(Spacer(1, 3))

        note(
            "These figures describe the moment the report was made. "
            "The port keeps no history of them."
        )

        half = content_width / 2 - 6

        cells_top = []

        ships = snapshot.get("ships")

        if ships:

            ring = donut(
                [(n, v, c) for n, v, c in ships["states"]],
                centre_text=_fmt(ships["total"]),
                centre_note="ships",
                width=half,
            )

            cells_top.append(
                [Paragraph(_para("Ships by state"), cell_bold),
                 ring or Paragraph(_para("No ships are on record."), body)]
            )

        alerts = snapshot.get("alerts")

        if alerts:

            ring = donut(
                [(n, v, c) for n, v, c in alerts["items"]],
                centre_text=_fmt(alerts["total"]),
                centre_note="open alerts",
                width=half,
            )

            cells_top.append(
                [Paragraph(_para("Open alerts by seriousness"), cell_bold),
                 ring or Paragraph(_para("There are no open alerts."), body)]
            )

        if cells_top:

            if len(cells_top) == 1:
                cells_top.append(["", ""])

            side = Table(
                [
                    [cells_top[0][0], cells_top[1][0]],
                    [cells_top[0][1], cells_top[1][1]],
                ],
                colWidths=[content_width / 2, content_width / 2],
            )

            side.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )

            story.append(KeepTogether([side]))

        berths = snapshot.get("berths")

        if berths:

            block = [Spacer(1, 6)]

            if berths["total"]:

                block.append(
                    Paragraph(
                        _para(
                            f"Berths: {_percent(berths['occupied'], berths['total'])}% "
                            f"in use ({_fmt(berths['occupied'])} of "
                            f"{_fmt(berths['total'])} active berths)"
                        ),
                        cell_bold,
                    )
                )

                block.append(Spacer(1, 3))

                block.append(
                    hbars(
                        [
                            (
                                name,
                                _percent(used, total),
                                f"{_fmt(used)} of {_fmt(total)}",
                            )
                            for name, used, total in berths["terminals"]
                        ],
                        content_width,
                        130,
                        BLUE,
                        max_value=100,
                    )
                )

            else:

                block.append(Paragraph(_para("No berths are on record."), body))

            story.append(KeepTogether(block))

        equipment = snapshot.get("equipment")

        if equipment:

            block = [Spacer(1, 6)]

            if equipment["total"]:

                block.append(
                    Paragraph(
                        _para(f"Equipment: {_fmt(equipment['total'])} pieces on record"),
                        cell_bold,
                    )
                )

                block.append(Spacer(1, 3))

                peak = max((value for _, value, _ in equipment["statuses"]), default=1) or 1

                block.append(
                    hbars(
                        [(n, v, _fmt(v)) for n, v, _ in equipment["statuses"]],
                        content_width,
                        120,
                        GOOD,
                        max_value=peak,
                    )
                )

            else:

                block.append(Paragraph(_para("No equipment has been added yet."), body))

            story.append(KeepTogether(block))

    # ---- about this report
    notes = list(data["notes"])

    story.append(Paragraph(_para("About this report"), heading))

    story.append(
        Table(
            [[""]], colWidths=[content_width], rowHeights=[1.2],
            style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.8, hexcolor("#cbd5e1"))]),
        )
    )

    story.append(Spacer(1, 4))

    story.append(
        Paragraph(
            _para(
                "Every number in this report was worked out from the port's own "
                "records at the moment it was made. There is no sample data. "
                "All dates and times are Singapore time (UTC+8)."
            ),
            body,
        )
    )

    if data["left_out"]:

        story.append(Spacer(1, 5))

        story.append(Paragraph(_para("Left out of this report:"), cell_bold))

        for name, why in data["left_out"]:
            story.append(Paragraph(_para(f"• {name}: {why}"), body))

    for line in notes:

        story.append(Spacer(1, 4))

        story.append(Paragraph(_para(line), body))

    # ------------------------------ page furniture

    class NumberedCanvas(pdf_canvas.Canvas):
        """Draws 'Page x of y' once the number of pages is known."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_pages = []

        def showPage(self):
            self._saved_pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):

            total = len(self._saved_pages)

            for state in self._saved_pages:

                self.__dict__.update(state)

                self._furniture(total)

                super().showPage()

            super().save()

        def _furniture(self, total):

            self.saveState()

            self.setFillColor(hexcolor(NAVY))
            self.setFont("Helvetica-Bold", 9.5)
            self.drawString(margin_x, page_height - 30, "Port of Singapore")

            self.setFont("Helvetica", 8)
            self.setFillColor(hexcolor(LIGHT_GRAY))
            self.drawString(margin_x, page_height - 41, "Smart Sea Port Management System")

            self.setFont("Helvetica", 8)
            self.drawRightString(page_width - margin_x, page_height - 30, _safe(kind_word))
            self.drawRightString(page_width - margin_x, page_height - 41, _safe(period_text))

            self.setStrokeColor(hexcolor("#cbd5e1"))
            self.setLineWidth(0.6)
            self.line(margin_x, page_height - 48, page_width - margin_x, page_height - 48)
            self.line(margin_x, 34, page_width - margin_x, 34)

            self.setFont("Helvetica", 7.6)
            self.drawString(
                margin_x, 22,
                "Made from the port's own records. Times are Singapore time.",
            )
            self.drawRightString(
                page_width - margin_x, 22, f"Page {self._pageNumber} of {total}"
            )

            self.restoreState()

    buffer = io.BytesIO()

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=margin_x,
        rightMargin=margin_x,
        topMargin=62,
        bottomMargin=44,
        title=_safe(title),
        author=_safe(generated_by),
        subject="Port of Singapore statistics report",
        creator="Smart Sea Port Management System",
    )

    doc.addPageTemplates(
        [
            PageTemplate(
                id="main",
                frames=[
                    Frame(
                        margin_x, 44, content_width, page_height - 62 - 44,
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
                    )
                ],
            )
        ]
    )

    doc.build(story, canvasmaker=NumberedCanvas)

    return buffer.getvalue()


# =========================================================
# MAKING A REPORT
# =========================================================


def _read_day(value: Any, label: str) -> date:

    try:
        return date.fromisoformat(str(value or "").strip())
    except ValueError:
        raise _fail(f"{label} must be a date written like 2026-10-21.") from None


def generate_report(
    db: Session,
    user: User,
    start_date: Any,
    end_date: Any,
    request: Any = None,
) -> dict[str, Any]:
    """Make the PDF for a day (or period) and keep it in the library."""

    # Only the Port Administrator and the Port Executive (every time).
    # A refused try is written to the Audit Logs, like any refused change.
    if not audit_service.has_oversight_role(user):

        audit_service.record(
            module="Documents",
            action="Report refused",
            category="report",
            target="PDF report",
            description="The account is not allowed to generate reports.",
            result="Refused",
            user=user,
            request=request,
        )

        raise _fail(NOT_ALLOWED, 403)

    today = _today()

    end = _read_day(end_date or start_date, "The end date")

    start = _read_day(start_date or end_date, "The start date")

    if end < start:
        raise _fail("The end date is before the start date.")

    if end > today:
        raise _fail("A report cannot be made for a day that has not come yet.")

    if (end - start).days + 1 > MAX_DAYS:
        raise _fail(f"A report covers at most {MAX_DAYS} days.")

    document_service.ensure_tables(db)

    data = collect(db, user, start, end, today)

    now = _now_sg()

    role = user.role.name if user.role is not None else ""

    name = user.full_name or user.username or f"User {user.id}"

    if start == end:
        title = f"Daily Port Report - {_day_text(start)}"
        file_name = f"daily-port-report-{start.isoformat()}"
    else:
        title = f"Port Report - {_day_text(start)} to {_day_text(end)}"
        file_name = f"port-report-{start.isoformat()}-to-{end.isoformat()}"

    file_name += ".pdf"

    pdf = _build_pdf(
        data,
        title=title,
        generated_by=name,
        generated_role=role,
        generated_at=now,
    )

    saved = document_service.save_report(
        db,
        user,
        title=title,
        file_name=file_name,
        pdf=pdf,
        start=start,
        end=end,
        note=f"Generated at {now.strftime('%H:%M')} SGT by {name}",
        scope="",
        request=request,
    )

    saved["left_out"] = [
        {"section": section, "reason": reason}
        for section, reason in data["left_out"]
    ]

    return saved
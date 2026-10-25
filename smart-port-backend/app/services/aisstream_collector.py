"""
AISStream collector (free training data for Predict Vessel Delay).

AISStream.io sends live AIS messages over one WebSocket connection, with
no monthly request limit. This collector listens to the Port of Singapore
area (AIS_LAT_MIN / AIS_LAT_MAX / AIS_LON_MIN / AIS_LON_MAX in .env) and
saves two things:

1. ETA reports of ships whose AIS destination is Singapore
   -> vessel_eta_snapshots (a new row when the ETA or destination
   changes, and at most every few hours otherwise). Each row also keeps
   the ship's speed, position and status at that moment, and how many
   seagoing ships were standing still in the area (how busy the port
   was). The ship's row in the vessels table, when it exists, also gets
   the latest ETA, destination and draught.

2. Arrivals and departures in Singapore waters, worked out from the
   ships' own position reports -> port_call_events
   Arrival   = a ship that was moving (2 knots or more) stops
               (status "At anchor" / "Moored", or below 0.5 knots).
   Departure = a ship that was seen stopped starts moving again.
   Only seagoing passenger, cargo and tanker ships are counted
   (AIS ship types 60-89), so tugs and harbour boats are left out.

3. Once an hour, how crowded the port is -> port_congestion_snapshots
   (for Predict Berth Congestion): seagoing ships standing still in port
   waters (at anchor / moored / other) and ships underway, counted from
   the ships seen in the last 2 hours. Only saved after the feed has been
   connected for 30 minutes without a break, so the counts are complete.

Data is only collected while the backend is running.

The ships the collector knows (type, name, last position, moving or
stopped) are saved to ais_state/ships.json in the backend folder every
2 minutes and when the backend stops, and loaded again when it starts.
After a short restart (10 minutes or less) the port counts are complete
at once instead of after 30 minutes. The file can be deleted at any time.

Ship positions are not written to the database by this collector: the
Singapore area sends thousands of positions a minute, which would fill
the Supabase free database within weeks.

Needs the Python package "websockets" (pip install websockets).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import select, text

from app.api.dependencies import get_db
from app.models.port_call_event import PortCallEvent
from app.models.port_congestion_snapshot import PortCongestionSnapshot
from app.models.vessel import Vessel
from app.models.vessel_eta_snapshot import VesselETASnapshot

load_dotenv()
logger = logging.getLogger(__name__)

# =========================================================
# SETTINGS (backend .env file)
# =========================================================

STREAM_URL = os.getenv(
    "AISSTREAM_URL", "wss://stream.aisstream.io/v0/stream"
).strip()

AISSTREAM_API_KEY = os.getenv("AISSTREAM_API_KEY", "").strip()

AISSTREAM_COLLECTOR_ENABLED = os.getenv(
    "AISSTREAM_COLLECTOR_ENABLED", "true"
).strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)).strip())
    except ValueError:
        return default


LAT_MIN = _env_float("AIS_LAT_MIN", 1.10)
LAT_MAX = _env_float("AIS_LAT_MAX", 1.45)
LON_MIN = _env_float("AIS_LON_MIN", 103.55)
LON_MAX = _env_float("AIS_LON_MAX", 104.15)

PORT_UNLOCODE = "SGSIN"
PORT_NAME = "Singapore"
SOURCE = "AISStream"

# A new ETA row for the same unchanged ETA at most this often (hours).
ETA_REFRESH_HOURS = 6

# Arrival / departure rules
MOVING_KNOTS = 2.0          # moving at or above this speed
STOPPED_KNOTS = 0.5         # stopped below this speed
STOPPED_STATUSES = {1, 5}   # AIS: 1 = at anchor, 5 = moored
MOVING_MEMORY_HOURS = 12    # "was moving" must be this recent
EVENT_GAP_HOURS = 3         # no second event of the same kind sooner
SEAGOING_TYPES = range(60, 90)  # passenger 60-69, cargo 70-79, tanker 80-89

POSITION_MAX_AGE_MINUTES = 30  # position saved with an ETA: at most this old
STOPPED_RECENT_HOURS = 2    # a stopped ship counts as "nearby" this long
# Ships at anchor or moored send a position every 3 minutes, so after
# 30 minutes of feed almost every one has been seen. Before that the
# port counts are shown as "still counting" and nothing is predicted.
WARM_UP_MINUTES = 30
# Ship memory saved to disk, so a restart does not start from zero.
STATE_FILE = Path(__file__).resolve().parents[2] / "ais_state" / "ships.json"
STATE_SAVE_SECONDS = 120
RESUME_GAP_MINUTES = 10     # a restart/disconnect this short keeps the memory "complete"
STATE_KEEP_DAYS = 7         # ships not heard from for a week are forgotten

NAV_STATUS_NAMES = {
    0: "Under way using engine",
    1: "At anchor",
    2: "Not under command",
    3: "Restricted manoeuvrability",
    4: "Constrained by draught",
    5: "Moored",
    6: "Aground",
    7: "Engaged in fishing",
    8: "Under way sailing",
}

SNAPSHOT_CHECK_SECONDS = 60  # check once a minute whether an hourly snapshot is due
SNAPSHOT_LATE_MINUTES = 15   # an hourly snapshot may be taken up to 15 min after the hour
FLUSH_SECONDS = 30          # write to the database every 30 seconds
SUMMARY_SECONDS = 900       # print a short summary every 15 minutes
MAX_PENDING = 5000          # rows kept in memory if the database is down
BAD_KEY_WAIT_SECONDS = 600  # wait after AISStream rejects the key

# =========================================================
# HELPERS
# =========================================================


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if result != result or abs(result) == float("inf"):
        return None
    return result


def _integer(value: Any) -> int | None:
    result = _number(value)
    if result is None or not result.is_integer():
        return None
    return int(result)


def _text(value: Any, length: int) -> str | None:
    if value is None:
        return None
    result = " ".join(str(value).replace("@", " ").split())
    return result[:length] if result else None


def _mmsi(value: Any) -> str | None:
    number = _integer(value)
    if number is None or not 100_000_000 <= number <= 999_999_999:
        return None
    return str(number)


_TIME_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?"
)


def parse_message_time(value: Any) -> datetime | None:
    """AISStream time_utc, e.g. '2026-10-22 13:35:26.471148631 +0000 UTC'."""

    if not value:
        return None
    match = _TIME_RE.search(str(value))
    if not match:
        return None
    fraction = (match.group(3) or "0")[:6].ljust(6, "0")
    try:
        return datetime.strptime(
            f"{match.group(1)} {match.group(2)}.{fraction}",
            "%Y-%m-%d %H:%M:%S.%f",
        ).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def ais_eta(eta: Any, now: datetime) -> tuple[datetime | None, str | None]:
    """
    AIS sends the ETA as month, day, hour and minute in UTC, without a
    year. 0 month/day, hour 24 and minute 60 mean "not available".
    The year is the one that puts the ETA closest to now.
    Returns (eta or None, raw text or None).
    """

    if not isinstance(eta, dict):
        return None, None

    month = _integer(eta.get("Month"))
    day = _integer(eta.get("Day"))
    hour = _integer(eta.get("Hour"))
    minute = _integer(eta.get("Minute"))

    if None in (month, day, hour, minute):
        return None, None

    raw = f"{month:02d}-{day:02d} {hour:02d}:{minute:02d}"

    if not (1 <= month <= 12 and 1 <= day <= 31
            and 0 <= hour <= 23 and 0 <= minute <= 59):
        return None, raw

    best = None
    for year in (now.year - 1, now.year, now.year + 1):
        try:
            candidate = datetime(year, month, day, hour, minute,
                                 tzinfo=timezone.utc)
        except ValueError:
            continue
        if best is None or abs(candidate - now) < abs(best - now):
            best = candidate

    return best, raw


_SINGAPORE_WORDS = ("SINGAPORE", "SINGAPUR", "SGSIN", "SPORE")


def is_singapore_destination(destination: str | None) -> bool:
    """True when the AIS destination text means the Port of Singapore."""

    if not destination:
        return False

    text = destination.upper()
    # "CNSHA>SGSIN" = from Shanghai to Singapore: keep the part after ">"
    if ">" in text:
        text = text.rsplit(">", 1)[1]

    compact = re.sub(r"[^A-Z]", "", text)

    if not compact:
        return False
    if any(word in compact for word in _SINGAPORE_WORDS):
        return True
    return compact in ("SIN", "SG", "SGP") or compact.startswith("SGSIN")


# =========================================================
# STATE
# =========================================================

_task: asyncio.Task | None = None
_running = False
_connected = False

_ships: dict[str, dict[str, Any]] = {}
_pending_etas: list[dict[str, Any]] = []
_pending_events: list[dict[str, Any]] = []

_stats = {
    "messages": 0,
    "eta_saved": 0,
    "arrivals_saved": 0,
    "departures_saved": 0,
    "last_message_at": None,
    "last_error": None,
    "connected_since": None,
}
_window = {"messages": 0, "eta": 0, "arrivals": 0, "departures": 0}
_snapshot = {"last_slot": None, "saved": 0, "last_error": None}
# since     = when the ship memory started being filled without a long break
# last_seen = when a message last arrived (or when the memory was saved)
_warm: dict[str, Any] = {"since": None, "last_seen": None, "restored": 0}


def get_aisstream_status() -> dict[str, Any]:
    return {
        "enabled": AISSTREAM_COLLECTOR_ENABLED,
        "configured": bool(AISSTREAM_API_KEY),
        "running": _running,
        "connected": _connected,
        "ships_tracked": len(_ships),
        "pending_rows": len(_pending_etas) + len(_pending_events),
        "congestion_snapshots_saved": _snapshot["saved"],
        "congestion_snapshot_error": _snapshot["last_error"],
        **_stats,
    }


def _ship(mmsi: str) -> dict[str, Any]:
    ship = _ships.get(mmsi)
    if ship is None:
        ship = {
            "type": None,
            "name": None,
            "imo": None,
            "singapore_bound": False,
            "last_moving_at": None,
            "stopped": None,
            "last_event": {},       # event_type -> datetime
            "last_eta_key": None,
            "last_eta_saved_at": None,
            "position": None,       # (time, lat, lon, speed, status code)
            "seen_at": None,
        }
        _ships[mmsi] = ship
    return ship


# =========================================================
# MESSAGE HANDLING
# =========================================================


def ships_stopped_nearby(at: datetime) -> int:
    """Seagoing ships standing still in the area, seen in the last 2 hours."""

    limit = timedelta(hours=STOPPED_RECENT_HOURS)
    count = 0
    for ship in _ships.values():
        position = ship["position"]
        if (
            ship["stopped"]
            and position is not None
            and abs(at - position[0]) <= limit
            and (ship["type"] in SEAGOING_TYPES or ship["singapore_bound"])
        ):
            count += 1
    return count


def handle_static(mmsi: str, data: dict[str, Any], at: datetime,
                  meta_name: str | None) -> None:
    """ShipStaticData: name, type, ETA, destination, draught."""

    ship = _ship(mmsi)

    ship_type = _integer(data.get("Type"))
    if ship_type is not None:
        ship["type"] = ship_type

    name = _text(data.get("Name"), 120) or meta_name
    if name:
        ship["name"] = name

    imo = _integer(data.get("ImoNumber"))
    if imo is not None and 1 <= imo <= 999_999_999:
        ship["imo"] = str(imo)

    destination = _text(data.get("Destination"), 120)
    singapore = is_singapore_destination(destination)
    ship["singapore_bound"] = singapore

    if not singapore:
        return

    eta, eta_raw = ais_eta(data.get("Eta"), at)

    draught = _number(data.get("MaximumStaticDraught"))
    if draught is not None and not 0 < draught <= 30:
        draught = None

    key = (eta_raw, destination)
    last_saved = ship["last_eta_saved_at"]

    if (
        key == ship["last_eta_key"]
        and last_saved is not None
        and at - last_saved < timedelta(hours=ETA_REFRESH_HOURS)
    ):
        return

    ship["last_eta_key"] = key
    ship["last_eta_saved_at"] = at

    # Use the ship's last position only when it is from before this
    # message (2 minutes of clock difference allowed) and recent.
    position = ship["position"]
    if position is not None:
        age = at - position[0]
        if not (
            timedelta(minutes=-2)
            <= age
            <= timedelta(minutes=POSITION_MAX_AGE_MINUTES)
        ):
            position = None

    if len(_pending_etas) < MAX_PENDING:
        _pending_etas.append({
            "mmsi": mmsi,
            "imo_number": ship["imo"],
            "vessel_name": ship["name"],
            "destination": destination,
            "destination_port": PORT_UNLOCODE,
            "eta": eta,
            "eta_raw": eta_raw,
            "draught_m": draught,
            "speed_knots": position[3] if position else None,
            "latitude": position[1] if position else None,
            "longitude": position[2] if position else None,
            "navigation_status": (
                NAV_STATUS_NAMES.get(position[4]) if position else None
            ),
            "ships_stopped_nearby": ships_stopped_nearby(at),
            "reported_at": at,
        })


def _add_event(mmsi: str, ship: dict[str, Any], event_type: str,
               at: datetime) -> None:
    last = ship["last_event"].get(event_type)
    if last is not None and at - last < timedelta(hours=EVENT_GAP_HOURS):
        return
    ship["last_event"][event_type] = at

    if len(_pending_events) < MAX_PENDING:
        _pending_events.append({
            "mmsi": mmsi,
            "imo_number": ship["imo"],
            "vessel_name": ship["name"],
            "event_type": event_type,
            "port_unlocode": PORT_UNLOCODE,
            "port_name": PORT_NAME,
            "occurred_at": at,
        })


def handle_position(mmsi: str, data: dict[str, Any], at: datetime,
                    meta_name: str | None) -> None:
    """PositionReport: work out arrivals and departures."""

    latitude = _number(data.get("Latitude"))
    longitude = _number(data.get("Longitude"))

    if latitude is None or longitude is None:
        return
    if not (LAT_MIN <= latitude <= LAT_MAX and LON_MIN <= longitude <= LON_MAX):
        return

    ship = _ship(mmsi)
    if meta_name and not ship["name"]:
        ship["name"] = meta_name

    # A report older than the one already known (late message, or a ship
    # remembered from before a restart) must not undo newer information.
    if ship["position"] is not None and at < ship["position"][0]:
        return

    speed = _number(data.get("Sog"))
    if speed is not None and not 0 <= speed < 102.3:
        speed = None
    status = _integer(data.get("NavigationalStatus"))

    ship["position"] = (at, latitude, longitude, speed, status)

    moving = speed is not None and speed >= MOVING_KNOTS
    stopped = (speed is not None and speed < STOPPED_KNOTS) or (
        status in STOPPED_STATUSES and (speed is None or speed < 1.0)
    )

    seagoing = ship["type"] in SEAGOING_TYPES or ship["singapore_bound"]

    if moving:
        if ship["stopped"] and seagoing:
            _add_event(mmsi, ship, "Departure", at)
        ship["stopped"] = False
        ship["last_moving_at"] = at

    elif stopped:
        was_moving = ship["stopped"] is False and ship["last_moving_at"] and (
            at - ship["last_moving_at"] <= timedelta(hours=MOVING_MEMORY_HOURS)
        )
        if was_moving and seagoing:
            _add_event(mmsi, ship, "Arrival", at)
        ship["stopped"] = True


def handle_message(message: Any, now: datetime | None = None) -> None:
    """One message from AISStream."""

    if not isinstance(message, dict):
        return

    message_type = message.get("MessageType")
    body = (message.get("Message") or {}).get(message_type)
    meta = message.get("MetaData") or {}

    if not isinstance(body, dict) or not isinstance(meta, dict):
        return
    if body.get("Valid") is False:
        return

    mmsi = _mmsi(meta.get("MMSI")) or _mmsi(body.get("UserID"))
    if mmsi is None:
        return

    at = (
        parse_message_time(meta.get("time_utc"))
        or now
        or datetime.now(timezone.utc)
    )
    meta_name = _text(meta.get("ShipName"), 120)

    _stats["messages"] += 1
    _window["messages"] += 1
    _stats["last_message_at"] = at

    if message_type == "ShipStaticData":
        handle_static(mmsi, body, at, meta_name)
    elif message_type == "PositionReport":
        handle_position(mmsi, body, at, meta_name)

    ship = _ships.get(mmsi)
    if ship is not None:
        ship["seen_at"] = at


# =========================================================
# SHIP MEMORY ON DISK (survives restarts)
# =========================================================


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _from_iso(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def state_to_json(now: datetime) -> dict[str, Any]:
    ships = {}
    for mmsi, ship in _ships.items():
        position = ship["position"]
        ships[mmsi] = {
            "type": ship["type"],
            "name": ship["name"],
            "imo": ship["imo"],
            "singapore_bound": ship["singapore_bound"],
            "last_moving_at": _iso(ship["last_moving_at"]),
            "stopped": ship["stopped"],
            "last_event": {k: _iso(v) for k, v in ship["last_event"].items()},
            "last_eta_key": list(ship["last_eta_key"]) if ship["last_eta_key"] else None,
            "last_eta_saved_at": _iso(ship["last_eta_saved_at"]),
            "position": (
                [_iso(position[0]), *position[1:]] if position is not None else None
            ),
            "seen_at": _iso(ship.get("seen_at")),
        }
    return {
        "saved_at": _iso(now),
        "warm_since": _iso(_warm["since"]),
        "last_seen": _iso(_warm["last_seen"]),
        "ships": ships,
    }


def save_state(now: datetime | None = None) -> bool:
    """Write the ship memory to disk (safely: write a copy, then swap)."""

    now = now or datetime.now(timezone.utc)
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(state_to_json(now)), encoding="utf-8")
        os.replace(temporary, STATE_FILE)
        return True
    except Exception as exc:
        logger.warning("AISStream: ship memory not saved: %s", exc)
        return False


def load_state(now: datetime | None = None) -> int:
    """
    Load the ship memory saved before the last stop. Ships not heard from
    for STATE_KEEP_DAYS are left out. When the backend was off for more
    than RESUME_GAP_MINUTES, the moving/stopped state is cleared (it may
    have changed meanwhile) and the counts start again. Returns the number
    of ships loaded.
    """

    now = now or datetime.now(timezone.utc)
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return 0
    except Exception as exc:
        logger.warning("AISStream: saved ship memory not used: %s", exc)
        return 0

    last_seen = _from_iso(data.get("last_seen")) or _from_iso(data.get("saved_at"))
    resume = (
        last_seen is not None
        and timedelta(0) <= now - last_seen <= timedelta(minutes=RESUME_GAP_MINUTES)
    )
    keep_after = now - timedelta(days=STATE_KEEP_DAYS)

    loaded = 0
    for mmsi, item in (data.get("ships") or {}).items():
        seen_at = _from_iso(item.get("seen_at"))
        if seen_at is None or seen_at < keep_after:
            continue
        ship = _ship(str(mmsi))
        ship["type"] = item.get("type")
        ship["name"] = item.get("name")
        ship["imo"] = item.get("imo")
        ship["singapore_bound"] = bool(item.get("singapore_bound"))
        ship["last_event"] = {
            k: v for k, v in
            ((k, _from_iso(v)) for k, v in (item.get("last_event") or {}).items())
            if v is not None
        }
        key = item.get("last_eta_key")
        ship["last_eta_key"] = tuple(key) if key else None
        ship["last_eta_saved_at"] = _from_iso(item.get("last_eta_saved_at"))
        ship["seen_at"] = seen_at

        position = item.get("position")
        if position and _from_iso(position[0]) is not None:
            ship["position"] = (_from_iso(position[0]), *position[1:5])

        if resume:
            ship["stopped"] = item.get("stopped")
            ship["last_moving_at"] = _from_iso(item.get("last_moving_at"))
        loaded += 1

    if resume:
        _warm["since"] = _from_iso(data.get("warm_since"))
        _warm["last_seen"] = last_seen
    _warm["restored"] = loaded
    return loaded


def _feed_message_arrived(now: datetime) -> None:
    """Keep track of how long the ship memory has been filled without a long break."""

    last = _warm["last_seen"]
    if (
        _warm["since"] is None
        or last is None
        or now - last > timedelta(minutes=RESUME_GAP_MINUTES)
    ):
        _warm["since"] = now
    _warm["last_seen"] = now


# =========================================================
# DATABASE
# =========================================================


def _write(etas: list[dict[str, Any]], events: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Save rows. Returns (etas_saved, arrivals_saved, departures_saved)."""

    generator = get_db()
    db = next(generator)
    eta_saved = arrivals = departures = 0

    try:
        for item in etas:
            exists = db.scalar(
                select(VesselETASnapshot.id)
                .where(VesselETASnapshot.mmsi == item["mmsi"])
                .where(VesselETASnapshot.reported_at == item["reported_at"])
                .limit(1)
            )
            if exists is None:
                db.add(VesselETASnapshot(source=SOURCE, **item))
                eta_saved += 1

            vessel = db.scalar(select(Vessel).where(Vessel.mmsi == item["mmsi"]))
            if vessel is not None:
                if item["eta"] is not None:
                    vessel.eta = item["eta"]
                if item["destination"]:
                    vessel.destination = item["destination"]
                if item["draught_m"] is not None:
                    vessel.draught_m = item["draught_m"]

        for item in events:
            exists = db.scalar(
                select(PortCallEvent.id)
                .where(PortCallEvent.mmsi == item["mmsi"])
                .where(PortCallEvent.event_type == item["event_type"])
                .where(PortCallEvent.occurred_at == item["occurred_at"])
                .limit(1)
            )
            if exists is None:
                db.add(PortCallEvent(source=SOURCE, **item))
                if item["event_type"] == "Arrival":
                    arrivals += 1
                else:
                    departures += 1

        db.commit()
        return eta_saved, arrivals, departures

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        close = getattr(generator, "close", None)
        if callable(close):
            close()


async def flush() -> None:
    """Write what is waiting. On failure the rows stay and are tried again."""

    if not _pending_etas and not _pending_events:
        return

    etas = list(_pending_etas)
    events = list(_pending_events)

    try:
        eta_saved, arrivals, departures = await asyncio.to_thread(
            _write, etas, events
        )
    except Exception as exc:
        text = str(exc).splitlines()[0] if str(exc) else ""
        if "does not exist" in text:
            text = ("A table is missing. Run the ETA collector SQL script "
                    "in the Supabase SQL Editor.")
        _stats["last_error"] = f"Database: {type(exc).__name__}: {text}"[:300]
        logger.warning("AISStream collector could not save: %s",
                       _stats["last_error"])
        return

    del _pending_etas[:len(etas)]
    del _pending_events[:len(events)]

    _stats["eta_saved"] += eta_saved
    _stats["arrivals_saved"] += arrivals
    _stats["departures_saved"] += departures
    _window["eta"] += eta_saved
    _window["arrivals"] += arrivals
    _window["departures"] += departures


def _print_summary() -> None:
    print(
        "AISStream: "
        + ("connected" if _connected else "not connected")
        + f" | last 15 min: {_window['messages']:,} messages, "
        f"{_window['eta']} Singapore ETA(s) saved, "
        f"{_window['arrivals']} arrival(s), "
        f"{_window['departures']} departure(s) | "
        f"{len(_ships):,} ships tracked"
    )
    for key in _window:
        _window[key] = 0


# =========================================================
# PORT CROWDING (Predict Berth Congestion)
# =========================================================


def port_counts(at: datetime) -> dict[str, Any]:
    """
    Seagoing ships in the area seen in the last 2 hours:
      at_anchor     standing still and reporting "At anchor"
      at_berth      standing still and reporting "Moored"
      stopped_other standing still with another or no status
      underway      moving (2 knots or more)
    ships_in_port = at_anchor + at_berth + stopped_other.
    Also returns the MMSIs of the ships standing still.
    """

    limit = timedelta(hours=STOPPED_RECENT_HOURS)
    counts = {"at_anchor": 0, "at_berth": 0, "stopped_other": 0, "underway": 0}
    stopped_mmsis: list[str] = []

    for mmsi, ship in _ships.items():
        position = ship["position"]
        if position is None or abs(at - position[0]) > limit:
            continue
        if not (ship["type"] in SEAGOING_TYPES or ship["singapore_bound"]):
            continue

        if ship["stopped"]:
            stopped_mmsis.append(mmsi)
            status = position[4]
            if status == 1:
                counts["at_anchor"] += 1
            elif status == 5:
                counts["at_berth"] += 1
            else:
                counts["stopped_other"] += 1
        elif ship["stopped"] is False:
            counts["underway"] += 1

    counts["ships_in_port"] = (
        counts["at_anchor"] + counts["at_berth"] + counts["stopped_other"]
    )
    counts["stopped_mmsis"] = stopped_mmsis
    return counts


def feed_hours(now: datetime) -> float | None:
    """
    Hours the ship memory has been filled without a long break, counting
    the time before a short restart (None = feed not connected).
    """

    since = _warm.get("since") or _stats.get("connected_since")
    if not _connected or since is None:
        return None
    return max(0.0, (now - since).total_seconds() / 3600)


def _minutes(n: int) -> str:
    return "1 minute" if n == 1 else f"{n} minutes"


def live_port_counts(now: datetime | None = None) -> dict[str, Any]:
    """
    The port right now, for the page. available is False (with a reason)
    while the feed is not connected or has been connected for less than
    WARM_UP_MINUTES (until then ships standing still are not all seen
    yet). While warming up the counts so far are still returned, with
    partial = True.
    """

    now = now or datetime.now(timezone.utc)
    hours = feed_hours(now)

    if hours is None:
        return {
            "available": False,
            "reason": (
                "The live AIS feed is not connected, so the ships in port "
                "cannot be counted right now."
            ),
        }

    counts = port_counts(now)
    counts.pop("stopped_mmsis")
    result = {**counts, "feed_hours": round(hours, 2), "counted_at": now}

    if hours * 60 < WARM_UP_MINUTES:
        left = max(1, int(round(WARM_UP_MINUTES - hours * 60)))
        result.update(
            available=False,
            partial=True,
            minutes_left=left,
            reason=(
                "Still counting: the live AIS feed has been collecting for "
                f"{_minutes(int(hours * 60))} and ships standing still report "
                "every few minutes, so the numbers are still going up. "
                f"Complete in about {_minutes(left)}."
            ),
        )
    else:
        result.update(available=True, partial=False, reason=None)
    return result


_DUE_SQL = """
SELECT
    count(*) FILTER (WHERE s.eta <= :now + interval '6 hours')  AS due_6h,
    count(*) FILTER (WHERE s.eta <= :now + interval '12 hours') AS due_12h,
    count(*) AS due_24h
  FROM (
        SELECT DISTINCT ON (mmsi) mmsi, eta, reported_at
          FROM vessel_eta_snapshots
         WHERE reported_at <= :now
           AND reported_at >= :now - interval '24 hours'
           AND eta IS NOT NULL
         ORDER BY mmsi, reported_at DESC
       ) s
 WHERE s.eta > :now
   AND s.eta <= :now + interval '24 hours'
   AND NOT (s.mmsi = ANY(CAST(:stopped AS text[])))
   AND NOT EXISTS (
        SELECT 1 FROM port_call_events a
         WHERE a.mmsi = s.mmsi
           AND a.event_type = 'Arrival'
           AND a.occurred_at > s.reported_at
           AND a.occurred_at <= :now
   )
"""

_MOVES_SQL = """
SELECT
    count(*) FILTER (WHERE event_type = 'Arrival')   AS arrivals_6h,
    count(*) FILTER (WHERE event_type = 'Departure') AS departures_6h
  FROM port_call_events
 WHERE occurred_at >  :now - interval '6 hours'
   AND occurred_at <= :now
"""


def due_and_moves(db, now: datetime, stopped: list[str]) -> dict[str, int]:
    """
    Ships due by their reported ETA in the next 6/12/24 h (still on their
    way, not standing still in port) and arrivals/departures in the last 6 h.
    """

    due = db.execute(text(_DUE_SQL), {"now": now, "stopped": list(stopped)}).mappings().one()
    moves = db.execute(text(_MOVES_SQL), {"now": now}).mappings().one()
    return {
        "due_6h": int(due["due_6h"] or 0),
        "due_12h": int(due["due_12h"] or 0),
        "due_24h": int(due["due_24h"] or 0),
        "arrivals_6h": int(moves["arrivals_6h"] or 0),
        "departures_6h": int(moves["departures_6h"] or 0),
    }


def _write_snapshot(slot: datetime, counts: dict[str, Any], hours: float) -> bool:
    """Save one hourly snapshot. Returns False when it already existed."""

    generator = get_db()
    db = next(generator)
    try:
        exists = db.scalar(
            select(PortCongestionSnapshot.id)
            .where(PortCongestionSnapshot.taken_at == slot)
            .limit(1)
        )
        if exists is not None:
            return False

        extra = due_and_moves(db, slot, counts["stopped_mmsis"])
        db.add(PortCongestionSnapshot(
            taken_at=slot,
            ships_in_port=counts["ships_in_port"],
            at_anchor=counts["at_anchor"],
            at_berth=counts["at_berth"],
            stopped_other=counts["stopped_other"],
            underway=counts["underway"],
            feed_hours=round(hours, 2),
            source=SOURCE,
            **extra,
        ))
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        close = getattr(generator, "close", None)
        if callable(close):
            close()


async def take_snapshot(now: datetime | None = None) -> bool:
    """
    Save the snapshot for the current hour when it is due: the feed has
    been connected for 30 minutes or more, it is at most 15 minutes after
    the hour, and this hour has not been saved yet. Returns True if saved.
    """

    now = now or datetime.now(timezone.utc)
    slot = now.replace(minute=0, second=0, microsecond=0)

    if _snapshot["last_slot"] == slot:
        return False
    if now - slot > timedelta(minutes=SNAPSHOT_LATE_MINUTES):
        return False
    hours = feed_hours(now)
    if hours is None or hours * 60 < WARM_UP_MINUTES:
        return False

    # Write what is waiting first, so the last arrivals are counted.
    await flush()

    counts = port_counts(now)
    try:
        saved = await asyncio.to_thread(_write_snapshot, slot, counts, hours)
    except Exception as exc:
        message = str(exc).splitlines()[0] if str(exc) else ""
        if "does not exist" in message:
            message = ("The port_congestion_snapshots table is missing. Run "
                       "the port congestion SQL script in the Supabase SQL Editor.")
        _snapshot["last_error"] = f"{type(exc).__name__}: {message}"[:300]
        logger.warning("AISStream: port snapshot not saved: %s", _snapshot["last_error"])
        return False

    _snapshot["last_slot"] = slot
    _snapshot["last_error"] = None
    if saved:
        _snapshot["saved"] += 1
        print(
            f"AISStream: port snapshot saved for {slot:%H:%M} UTC - "
            f"{counts['ships_in_port']} ships in port "
            f"({counts['at_anchor']} at anchor, {counts['at_berth']} moored), "
            f"{counts['underway']} underway."
        )
    return saved


async def _snapshot_loop() -> None:
    while True:
        await asyncio.sleep(SNAPSHOT_CHECK_SECONDS)
        try:
            await take_snapshot()
        except asyncio.CancelledError:
            raise
        except Exception:  # never stop the collector because of a snapshot
            logger.exception("AISStream: port snapshot failed")


# =========================================================
# CONNECTION
# =========================================================


async def _listen_once() -> None:
    """Connect, subscribe, and read messages until the connection ends."""

    global _connected

    import websockets  # pip install websockets

    subscription = {
        "APIKey": AISSTREAM_API_KEY,
        "BoundingBoxes": [[[LAT_MIN, LON_MIN], [LAT_MAX, LON_MAX]]],
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    }

    async with websockets.connect(
        STREAM_URL,
        compression="deflate",  # AISStream needs compression for full data
        open_timeout=20,
        ping_interval=20,
        ping_timeout=30,
        max_size=2 ** 22,
    ) as socket:
        # AISStream closes the connection if this is not sent within 3 s.
        await socket.send(json.dumps(subscription))

        async for raw in socket:
            try:
                message = json.loads(raw)
            except (TypeError, ValueError):
                continue

            if isinstance(message, dict) and message.get("error"):
                raise _StreamRefused(str(message.get("error"))[:200])

            arrived = datetime.now(timezone.utc)
            if not _connected:
                # First real message: the key was accepted.
                _connected = True
                _stats["connected_since"] = arrived
                _stats["last_error"] = None
                _feed_message_arrived(arrived)
                resumed = arrived - _warm["since"] > timedelta(seconds=5)
                print("AISStream: connected, receiving ships in the "
                      "Port of Singapore area."
                      + (" Continuing with the ships remembered from before "
                         "the restart." if resumed else ""))
            else:
                _feed_message_arrived(arrived)

            handle_message(message)


class _StreamRefused(Exception):
    """AISStream sent an error message (for example a wrong API key)."""


async def _flush_loop() -> None:
    last_summary = time.monotonic()
    last_state = time.monotonic()
    while True:
        await asyncio.sleep(FLUSH_SECONDS)
        await flush()
        if time.monotonic() - last_state >= STATE_SAVE_SECONDS:
            last_state = time.monotonic()
            await asyncio.to_thread(save_state)
        if time.monotonic() - last_summary >= SUMMARY_SECONDS:
            last_summary = time.monotonic()
            _print_summary()


async def _collector_loop() -> None:
    global _running, _connected

    _running = True
    flusher = asyncio.create_task(_flush_loop())
    snapshots = asyncio.create_task(_snapshot_loop())
    retry = 5

    try:
        while True:
            try:
                await _listen_once()
                retry = 5  # the server ended a good connection
                wait = retry
                _stats["last_error"] = "AISStream closed the connection."

            except asyncio.CancelledError:
                raise

            except _StreamRefused as exc:
                _stats["last_error"] = f"AISStream refused: {exc}"
                wait = BAD_KEY_WAIT_SECONDS if "key" in str(exc).lower() else 60

            except ImportError:
                _stats["last_error"] = (
                    "The 'websockets' package is not installed. "
                    "Run: pip install websockets"
                )
                print(f"AISStream collector not started: {_stats['last_error']}")
                return

            except Exception as exc:
                text = str(exc).splitlines()[0] if str(exc) else ""
                _stats["last_error"] = f"{type(exc).__name__}: {text}"[:300]
                wait = retry
                retry = min(retry * 2, 300)

            finally:
                if _connected:
                    _connected = False

            print(
                f"AISStream: disconnected ({_stats['last_error']}). "
                f"Reconnecting in {int(wait)} s."
            )
            await asyncio.sleep(wait + random.random())

    finally:
        for helper in (flusher, snapshots):
            helper.cancel()
            try:
                await helper
            except asyncio.CancelledError:
                pass
        await flush()  # keep what was collected
        if _connected:
            _warm["last_seen"] = datetime.now(timezone.utc)
        save_state()
        _running = False
        _connected = False


def start_aisstream_collector() -> bool:
    """Start in the background. Returns True when it runs."""

    global _task

    if not AISSTREAM_COLLECTOR_ENABLED:
        print("AISStream collector is switched off (AISSTREAM_COLLECTOR_ENABLED).")
        return False

    if not AISSTREAM_API_KEY:
        print("AISStream collector not started: AISSTREAM_API_KEY is "
              "missing from the backend .env file.")
        return False

    if not (-90 <= LAT_MIN < LAT_MAX <= 90 and -180 <= LON_MIN < LON_MAX <= 180):
        print("AISStream collector not started: AIS_LAT/AIS_LON values in "
              ".env are invalid.")
        return False

    if _task is not None and not _task.done():
        return True

    loaded = load_state()
    if loaded:
        print(f"AISStream: {loaded:,} ships loaded from the saved ship memory.")

    _task = asyncio.create_task(_collector_loop())
    return True


async def stop_aisstream_collector() -> None:
    global _task

    task = _task
    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    _task = None
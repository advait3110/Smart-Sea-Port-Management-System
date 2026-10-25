"""
ETA and port-call collector (training data for Predict Vessel Delay).

Two VesselAPI requests, each on its own slow timer:

1. Ships heading to the Port of Singapore and the ETA each one reported
   (GET /v1/port/SGSIN/inbound). Every ETA is stored in
   vessel_eta_snapshots and never overwritten. The ship's row in the
   vessels table also gets its latest ETA, destination and draught.

2. Arrivals at and departures from the Port of Singapore
   (GET /v1/portevents/port/SGSIN), stored in port_call_events.

Later, the training step compares the ETA a ship reported before it
arrived with its real arrival time. That difference is the delay.

Quota: the VesselAPI Free plan allows 150 calls a month. With the
default timers this collector uses about 60 a month (one inbound call
and one port-events call per day); the existing position polling every
12 hours uses about 60 more. The timers and the number of pages can be
changed in the backend .env file (see the settings below).

It uses the same API key, the same "pause after the provider refuses"
rule and the same state file as app/services/ais_service.py, so a 429
or 403 stops every VesselAPI request in the backend, and a server
restart does not send requests again before they are due.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.models.port_call_event import PortCallEvent
from app.models.vessel import Vessel
from app.models.vessel_eta_snapshot import VesselETASnapshot
from app.services import ais_service as ais

logger = logging.getLogger(__name__)

# =========================================================
# SETTINGS (can be changed in the backend .env file)
# =========================================================


def _env_int(name: str, default: int, low: int, high: int) -> int:
    try:
        value = int(os.getenv(name, str(default)).strip())
    except ValueError:
        value = default
    return max(low, min(high, value))


ETA_COLLECTOR_ENABLED = os.getenv(
    "ETA_COLLECTOR_ENABLED", "true"
).strip().lower() in ("1", "true", "yes", "on")

# UN/LOCODE of the Port of Singapore.
PORT_UNLOCODE = (
    os.getenv("ETA_PORT_UNLOCODE", "SGSIN").strip().upper() or "SGSIN"
)

# How often each request is sent after a successful one (seconds).
INBOUND_INTERVAL_SECONDS = _env_int(
    "ETA_INBOUND_INTERVAL_SECONDS", 86400, 3600, 7 * 86400
)
PORT_EVENTS_INTERVAL_SECONDS = _env_int(
    "PORT_EVENTS_INTERVAL_SECONDS", 86400, 3600, 7 * 86400
)

# Pages per run. Each page is one API call and holds up to 50 ships
# or events. 1 keeps within the Free plan.
INBOUND_MAX_PAGES = _env_int("ETA_INBOUND_MAX_PAGES", 1, 1, 20)
PORT_EVENTS_MAX_PAGES = _env_int("PORT_EVENTS_MAX_PAGES", 1, 1, 20)

# The oldest port event asked for, in hours before now.
PORT_EVENTS_MAX_LOOKBACK_HOURS = _env_int(
    "PORT_EVENTS_MAX_LOOKBACK_HOURS", 24, 1, 72
)

# Wait after a failed run before trying that request again (seconds).
RETRY_AFTER_FAILURE_SECONDS = 3600

PAGE_SIZE = 50  # provider maximum

# State-file keys (shared file with ais_service, so they survive restarts)
_INBOUND_SUCCESS = "eta_inbound_last_success_at"
_INBOUND_ATTEMPT = "eta_inbound_last_attempt_at"
_EVENTS_SUCCESS = "port_events_last_success_at"
_EVENTS_ATTEMPT = "port_events_last_attempt_at"
_EVENTS_COVERED = "port_events_covered_until"

MISSING_TABLE_HINT = (
    "A table or column is missing in the database. Run the SQL script "
    "for the ETA collector in the Supabase SQL Editor, then restart."
)

# =========================================================
# STATUS (shown by the AIS status endpoint)
# =========================================================

_task: asyncio.Task | None = None
_running = False

_status: dict[str, dict[str, Any]] = {
    "inbound": {
        "last_received": None,
        "last_saved": None,
        "last_vessels_updated": None,
        "last_error": None,
        "pages_left_unread": False,
    },
    "port_events": {
        "last_received": None,
        "last_saved": None,
        "last_error": None,
        "pages_left_unread": False,
    },
}


def _epoch(state: dict[str, Any], key: str) -> float | None:
    value = state.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _as_datetime(epoch: float | None) -> datetime | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc)


def _next_due(state: dict[str, Any], success_key: str, attempt_key: str,
              interval: int) -> float:
    """Epoch time when this request may be sent next."""

    due = 0.0
    success = _epoch(state, success_key)
    attempt = _epoch(state, attempt_key)

    if success is not None:
        due = max(due, success + interval)
    if attempt is not None and (success is None or attempt > success):
        due = max(due, attempt + RETRY_AFTER_FAILURE_SECONDS)

    return due


def get_eta_collector_status() -> dict[str, Any]:
    state = ais._load_state()

    def part(name, success_key, attempt_key, interval, pages):
        return {
            **_status[name],
            "last_success_at": _as_datetime(_epoch(state, success_key)),
            "last_attempt_at": _as_datetime(_epoch(state, attempt_key)),
            "next_due_at": _as_datetime(
                _next_due(state, success_key, attempt_key, interval) or None
            ),
            "interval_seconds": interval,
            "max_pages": pages,
        }

    return {
        "enabled": ETA_COLLECTOR_ENABLED,
        "running": _running,
        "port": PORT_UNLOCODE,
        "inbound": part("inbound", _INBOUND_SUCCESS, _INBOUND_ATTEMPT,
                        INBOUND_INTERVAL_SECONDS, INBOUND_MAX_PAGES),
        "port_events": part("port_events", _EVENTS_SUCCESS, _EVENTS_ATTEMPT,
                            PORT_EVENTS_INTERVAL_SECONDS,
                            PORT_EVENTS_MAX_PAGES),
        "port_events_covered_until": _as_datetime(
            _epoch(state, _EVENTS_COVERED)
        ),
    }


# =========================================================
# VESSELAPI REQUEST
# =========================================================


def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    """One GET request to VesselAPI. Returns the JSON object."""

    ais._configuration_check()

    paused = ais.provider_pause_message()
    if paused:
        raise ais.AISProviderError(paused)

    url = f"{ais.VESSELAPI_BASE_URL}{path}?{urlencode(params)}"

    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {ais.VESSELAPI_API_KEY}",
            "Accept": "application/json",
            "User-Agent": "Smart-Port-Management/1.0",
        },
        method="GET",
    )

    try:
        with urlopen(
            request, timeout=ais.VESSELAPI_TIMEOUT_SECONDS
        ) as response:
            ais.note_quota_header(response.headers)
            payload = json.loads(response.read().decode("utf-8"))

    except HTTPError as exc:
        ais.note_quota_header(exc.headers)
        ais.note_provider_refusal(
            exc.code,
            exc.headers.get("Retry-After") if exc.headers else None,
        )

        # Never log the API key or the full URL.
        try:
            details = json.loads(
                exc.read().decode("utf-8", errors="replace")
            )
            error = details.get("error", details)
            if isinstance(error, dict):
                message = (
                    error.get("message")
                    or error.get("detail")
                    or "Provider rejected the request."
                )
            else:
                message = str(error)
        except Exception:
            message = ais.UNREADABLE_ERROR_MESSAGE

        raise ais.AISProviderError(
            ais.provider_error_text(exc.code, message)
        ) from None

    except (URLError, TimeoutError, OSError) as exc:
        raise ais.AISProviderError(
            f"Could not connect to VesselAPI ({type(exc).__name__})."
        ) from None

    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ais.AISProviderError(
            "VesselAPI returned invalid JSON."
        ) from None

    if not isinstance(payload, dict):
        raise ais.AISProviderError(
            "VesselAPI returned an unexpected response format."
        )

    if payload.get("error"):
        error = payload["error"]
        message = (
            (error.get("message") or error.get("detail"))
            if isinstance(error, dict)
            else str(error)
        ) or "Unspecified provider error."
        raise ais.AISProviderError(f"VesselAPI error: {message}")

    return payload


def _get_pages(
    path: str,
    params: dict[str, Any],
    list_key: str,
    max_pages: int,
) -> tuple[list[Any], bool]:
    """Read up to max_pages pages. Returns (items, pages_left_unread)."""

    items: list[Any] = []
    token: str | None = None

    for _page in range(max_pages):
        page_params = dict(params)
        if token:
            page_params["pagination.nextToken"] = token

        payload = _get(path, page_params)
        page = payload.get(list_key)

        if page is None:
            page = []
        if not isinstance(page, list):
            raise ais.AISProviderError(
                f"VesselAPI response did not contain a '{list_key}' list."
            )

        items.extend(page)
        token = ais._text(payload.get("nextToken"))

        if not token or not page:
            return items, False

    return items, True


# =========================================================
# NORMALIZATION
# =========================================================


def _mmsi(value: Any) -> str | None:
    number = ais._integer(value)
    if number is None or not 100_000_000 <= number <= 999_999_999:
        return None
    return str(number)


def _imo(value: Any) -> str | None:
    number = ais._integer(value)
    if number is None or not 1 <= number <= 999_999_999:
        return None
    return str(number)


def _short(value: Any, length: int) -> str | None:
    text = ais._text(value)
    return text[:length] if text else None


def normalize_eta_record(
    record: Any,
    captured_at: datetime,
) -> dict[str, Any] | None:
    """One VesselETA record from /port/{unlocode}/inbound."""

    if not isinstance(record, dict):
        return None

    mmsi = _mmsi(record.get("mmsi"))
    if mmsi is None:
        return None

    eta_raw = _short(record.get("eta"), 40)
    eta = ais._parse_timestamp(eta_raw) if eta_raw else None

    draught = ais._number(record.get("draught"))
    if draught is not None and not 0 < draught <= 30:
        draught = None

    port = _short(record.get("destination_port"), 10)

    return {
        "mmsi": mmsi,
        "imo_number": _imo(record.get("imo")),
        "vessel_name": _short(record.get("vessel_name"), 120),
        "destination": _short(record.get("destination"), 120),
        "destination_port": port.upper() if port else None,
        "eta": eta,
        "eta_raw": eta_raw,
        "draught_m": draught,
        "reported_at": (
            ais._parse_timestamp(record.get("timestamp")) or captured_at
        ),
    }


def normalize_port_event(record: Any) -> dict[str, Any] | None:
    """One PortEvent record from /portevents/port/{unlocode}."""

    if not isinstance(record, dict):
        return None

    vessel = record.get("vessel") if isinstance(record.get("vessel"), dict) else {}
    port = record.get("port") if isinstance(record.get("port"), dict) else {}

    mmsi = _mmsi(vessel.get("mmsi"))
    occurred_at = ais._parse_timestamp(record.get("timestamp"))
    event = (ais._text(record.get("event")) or "").lower()

    if mmsi is None or occurred_at is None:
        return None
    if event not in ("arrival", "departure"):
        return None

    unlocode = _short(port.get("unlo_code"), 10)

    return {
        "mmsi": mmsi,
        "imo_number": _imo(vessel.get("imo")),
        "vessel_name": _short(vessel.get("name"), 120),
        "event_type": event.capitalize(),
        "port_unlocode": unlocode.upper() if unlocode else None,
        "port_name": _short(port.get("name"), 120),
        "occurred_at": occurred_at,
    }


# =========================================================
# DATABASE
# =========================================================


def save_eta_snapshots(
    db: Session,
    records: list[dict[str, Any]],
) -> tuple[int, int]:
    """Store new ETA reports. Returns (snapshots_saved, vessels_updated)."""

    saved = 0
    vessels_updated = 0
    seen: set[tuple[str, datetime]] = set()

    for item in records:
        key = (item["mmsi"], item["reported_at"])
        if key in seen:
            continue
        seen.add(key)

        exists = db.scalar(
            select(VesselETASnapshot.id)
            .where(VesselETASnapshot.mmsi == item["mmsi"])
            .where(VesselETASnapshot.reported_at == item["reported_at"])
            .limit(1)
        )

        if exists is None:
            db.add(VesselETASnapshot(source="VesselAPI", **item))
            saved += 1

        # Keep the ship's latest ETA on the Vessels page as well.
        # Only ships already in the vessels table are touched.
        vessel = db.scalar(select(Vessel).where(Vessel.mmsi == item["mmsi"]))

        if vessel is not None:
            if item["eta"] is not None:
                vessel.eta = item["eta"]
            if item["destination"]:
                vessel.destination = item["destination"]
            if item["draught_m"] is not None:
                vessel.draught_m = item["draught_m"]
            vessels_updated += 1

    return saved, vessels_updated


def save_port_events(
    db: Session,
    records: list[dict[str, Any]],
) -> int:
    """Store new arrivals and departures. Returns the number saved."""

    saved = 0
    seen: set[tuple[str, str, datetime]] = set()

    for item in records:
        key = (item["mmsi"], item["event_type"], item["occurred_at"])
        if key in seen:
            continue
        seen.add(key)

        exists = db.scalar(
            select(PortCallEvent.id)
            .where(PortCallEvent.mmsi == item["mmsi"])
            .where(PortCallEvent.event_type == item["event_type"])
            .where(PortCallEvent.occurred_at == item["occurred_at"])
            .limit(1)
        )

        if exists is None:
            db.add(PortCallEvent(source="VesselAPI", **item))
            saved += 1

    return saved


def _with_session(work):
    generator = get_db()
    db = next(generator)

    try:
        result = work(db)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        close = getattr(generator, "close", None)
        if callable(close):
            close()


# =========================================================
# ONE RUN OF EACH REQUEST
# =========================================================


def _describe(exc: Exception) -> str:
    if isinstance(exc, ProgrammingError) and "does not exist" in str(exc):
        return MISSING_TABLE_HINT
    text = str(exc).splitlines()[0] if str(exc) else ""
    return f"{type(exc).__name__}: {text}"[:300]


def collect_inbound_etas() -> dict[str, Any]:
    """Fetch ships heading to the port with their ETA, and save them."""

    status = _status["inbound"]
    ais._save_state(**{_INBOUND_ATTEMPT: time.time()})

    try:
        captured_at = datetime.now(timezone.utc)

        raw, more = _get_pages(
            f"/v1/port/{quote(PORT_UNLOCODE)}/inbound",
            {"pagination.limit": PAGE_SIZE},
            "vesselETAs",
            INBOUND_MAX_PAGES,
        )

        records = [
            item for item in (
                normalize_eta_record(r, captured_at) for r in raw
            ) if item is not None
        ]

        saved, updated = _with_session(
            lambda db: save_eta_snapshots(db, records)
        )

        status.update(
            last_received=len(raw),
            last_saved=saved,
            last_vessels_updated=updated,
            last_error=None,
            pages_left_unread=more,
        )
        ais._save_state(**{_INBOUND_SUCCESS: time.time()})

        logger.info(
            "ETA collector: %d inbound ship(s) received, %d new ETA "
            "report(s) saved, %d vessel row(s) updated%s",
            len(raw), saved, updated,
            " (more pages left unread)" if more else "",
        )
        return dict(status)

    except Exception as exc:
        status["last_error"] = _describe(exc)
        raise


def collect_port_events() -> dict[str, Any]:
    """Fetch arrivals and departures since the last run, and save them."""

    status = _status["port_events"]
    ais._save_state(**{_EVENTS_ATTEMPT: time.time()})

    try:
        now = datetime.now(timezone.utc)
        oldest = now - timedelta(hours=PORT_EVENTS_MAX_LOOKBACK_HOURS)

        covered = _as_datetime(_epoch(ais._load_state(), _EVENTS_COVERED))
        start = max(oldest, covered) if covered else oldest

        if start >= now:
            start = now - timedelta(minutes=1)

        raw, more = _get_pages(
            f"/v1/portevents/port/{quote(PORT_UNLOCODE)}",
            {
                "time.from": ais._utc_timestamp(start),
                "time.to": ais._utc_timestamp(now),
                "pagination.limit": PAGE_SIZE,
            },
            "portEvents",
            PORT_EVENTS_MAX_PAGES,
        )

        records = [
            item for item in (normalize_port_event(r) for r in raw)
            if item is not None
        ]

        saved = _with_session(lambda db: save_port_events(db, records))

        status.update(
            last_received=len(raw),
            last_saved=saved,
            last_error=None,
            pages_left_unread=more,
        )
        ais._save_state(**{
            _EVENTS_SUCCESS: time.time(),
            _EVENTS_COVERED: now.timestamp(),
        })

        if more:
            logger.warning(
                "ETA collector: more port events were available than "
                "PORT_EVENTS_MAX_PAGES allows; some arrivals were not read."
            )
        logger.info(
            "ETA collector: %d port event(s) received, %d new saved",
            len(raw), saved,
        )
        return dict(status)

    except Exception as exc:
        status["last_error"] = _describe(exc)
        raise


# =========================================================
# BACKGROUND LOOP
# =========================================================


async def _collector_loop() -> None:
    global _running

    _running = True
    jobs = (
        (_INBOUND_SUCCESS, _INBOUND_ATTEMPT, INBOUND_INTERVAL_SECONDS,
         collect_inbound_etas, "inbound ETAs"),
        (_EVENTS_SUCCESS, _EVENTS_ATTEMPT, PORT_EVENTS_INTERVAL_SECONDS,
         collect_port_events, "port events"),
    )

    try:
        while True:
            pause = ais.provider_pause_remaining_seconds()

            if pause > 0:
                await asyncio.sleep(pause + random.random())
                continue

            for success_key, attempt_key, interval, job, label in jobs:
                state = ais._load_state()

                if time.time() < _next_due(
                    state, success_key, attempt_key, interval
                ):
                    continue
                if ais.provider_pause_remaining_seconds() > 0:
                    break

                try:
                    await asyncio.to_thread(job)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    if isinstance(
                        exc,
                        (ais.AISProviderError, ais.AISConfigurationError),
                    ):
                        logger.warning(
                            "ETA collector (%s) failed: %s", label, exc
                        )
                    else:
                        logger.warning(
                            "ETA collector (%s) failed: %s",
                            label, _describe(exc),
                        )

            state = ais._load_state()
            next_run = min(
                _next_due(state, s, a, i) for s, a, i, _j, _l in jobs
            )
            wait = max(60.0, min(3600.0, next_run - time.time()))
            await asyncio.sleep(wait + random.random() * 5)

    finally:
        _running = False


def start_eta_collector() -> bool:
    """Start the background collector. Returns True when it runs."""

    global _task

    if not ETA_COLLECTOR_ENABLED:
        logger.info("ETA collector is switched off (ETA_COLLECTOR_ENABLED).")
        return False

    if _task is not None and not _task.done():
        return True

    _task = asyncio.create_task(_collector_loop())
    return True


async def stop_eta_collector() -> None:
    global _task, _running

    task = _task

    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    _task = None
    _running = False
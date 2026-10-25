from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.models.ais_position_history import AISPositionHistory
from app.models.vessel import Vessel

load_dotenv()
logger = logging.getLogger(__name__)

# =========================================================
# VESSELAPI CONFIGURATION
# =========================================================

VESSELAPI_BASE_URL = os.getenv(
    "VESSELAPI_BASE_URL",
    "https://api.vesselapi.com",
).strip().rstrip("/")

VESSELAPI_API_KEY = os.getenv("VESSELAPI_API_KEY", "").strip()

# Port of Singapore and the Singapore Strait approaches.
# These are only defaults: values in the backend .env file
# (VESSEL_LAT_MIN, VESSEL_LAT_MAX, VESSEL_LON_MIN, VESSEL_LON_MAX)
# take priority, so any old Karwar values there must be changed or removed.
LAT_MIN = float(os.getenv("VESSEL_LAT_MIN", "1.10"))
LAT_MAX = float(os.getenv("VESSEL_LAT_MAX", "1.45"))
LON_MIN = float(os.getenv("VESSEL_LON_MIN", "103.55"))
LON_MAX = float(os.getenv("VESSEL_LON_MAX", "104.15"))

VESSELAPI_TIMEOUT_SECONDS = max(
    1, int(os.getenv("VESSELAPI_TIMEOUT_SECONDS", "25"))
)
VESSELAPI_POLL_INTERVAL_SECONDS = max(
    60, int(os.getenv("VESSELAPI_POLL_INTERVAL_SECONDS", "43200"))
)
VESSELAPI_RESULT_LIMIT = max(
    1, min(50, int(os.getenv("VESSELAPI_RESULT_LIMIT", "50")))
)
VESSELAPI_LOOKBACK_HOURS = max(
    1, int(os.getenv("VESSELAPI_LOOKBACK_HOURS", "2"))
)

VESSELAPI_ENDPOINT = (
    "/v1/location/vessels/bounding-box"
)

# =========================================================
# LISTENER STATE
# =========================================================

_ais_background_task: asyncio.Task | None = None
_ais_listener_running = False
_ais_connected = False
_ais_last_error: str | None = None
_ais_last_message_at: datetime | None = None
_ais_last_updated_at: datetime | None = None

_ais_last_received = 0
_ais_last_provider_received = 0
_ais_last_normalized = 0

_ais_total_received = 0
_ais_total_created = 0
_ais_total_updated = 0


class AISConfigurationError(Exception):
    """VesselAPI configuration is missing or invalid."""


class AISProviderError(Exception):
    """VesselAPI request or response failed."""


# =========================================================
# PAUSE AFTER THE PROVIDER REFUSES REQUESTS
# =========================================================
# HTTP 429 (quota or rate limit) and 403 (key suspended or IP blocked)
# mean further requests will fail, and sending them anyway can extend a
# block. After either, every VesselAPI request in this backend (sync,
# background polling, port events, destinations) is held back until the
# pause ends. While paused nothing is sent to the provider.

RATE_LIMIT_PAUSE_SECONDS = 3600   # HTTP 429 without a Retry-After header
FORBIDDEN_PAUSE_SECONDS = 3600    # HTTP 403 without a Retry-After header
MAX_PAUSE_SECONDS = 6 * 3600      # provider suspensions last up to 6 hours

UNREADABLE_ERROR_MESSAGE = "Provider returned an unreadable error response."

_pause_lock = threading.Lock()
_paused_until = 0.0
_paused_status: int | None = None


# =========================================================
# STATE THAT SURVIVES A SERVER RESTART
# =========================================================
# The pause above, and the time of the last good request, are also kept in
# a small file in the backend folder. Without it, every restart of the
# server (for example uvicorn --reload after each code change) would forget
# the pause and send a new request straight away, even while the provider
# is still refusing requests or data was fetched a few minutes ago.
# The file belongs to one API key. When the key in .env is changed, the
# old pause and the old request time are ignored, so a new key starts
# clean. Deleting the file also resets everything.
# A problem with this file never stops the application.

_STATE_FILE = (
    Path(__file__).resolve().parents[2] / ".vesselapi_state.json"
)
_state_lock = threading.Lock()

# A short fingerprint of the key (not the key itself).
_KEY_ID = hashlib.sha256(
    VESSELAPI_API_KEY.encode("utf-8")
).hexdigest()[:16]


def _load_state() -> dict[str, Any]:
    try:
        data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

    if not isinstance(data, dict) or data.get("key_id") != _KEY_ID:
        return {}

    return data


def _save_state(**changes: Any) -> None:
    try:
        with _state_lock:
            state = _load_state()
            state.update(changes)
            state["key_id"] = _KEY_ID
            _STATE_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        logger.warning("Could not write %s", _STATE_FILE.name)


def _restore_pause_from_file() -> None:
    """Carry an unfinished pause over a server restart."""

    global _paused_until, _paused_status

    state = _load_state()
    until = state.get("paused_until")

    if isinstance(until, bool) or not isinstance(until, (int, float)):
        return

    remaining = until - time.time()

    if remaining <= 0:
        return

    status_code = state.get("paused_status")

    with _pause_lock:
        _paused_until = time.monotonic() + min(
            remaining, MAX_PAUSE_SECONDS
        )
        _paused_status = (
            status_code if isinstance(status_code, int) else None
        )


def _seconds_until_next_poll_allowed() -> int:
    """
    Seconds the background poller should wait after a restart:
    the rest of an unfinished pause, or the rest of the polling
    interval when data was fetched recently. 0 means poll now.
    """

    wait = provider_pause_remaining_seconds()

    last_success = _load_state().get("last_success_at")

    if (
        not isinstance(last_success, bool)
        and isinstance(last_success, (int, float))
    ):
        elapsed = time.time() - last_success

        if 0 <= elapsed < VESSELAPI_POLL_INTERVAL_SECONDS:
            wait = max(
                wait,
                int(VESSELAPI_POLL_INTERVAL_SECONDS - elapsed) + 1,
            )

    return wait


def note_provider_refusal(
    status_code: int,
    retry_after: str | None = None,
) -> None:
    """Start (or extend) the pause after an HTTP 429 or 403 reply."""

    global _paused_until, _paused_status

    if status_code not in (403, 429):
        return

    seconds = (
        FORBIDDEN_PAUSE_SECONDS
        if status_code == 403
        else RATE_LIMIT_PAUSE_SECONDS
    )

    if retry_after is not None:
        try:
            seconds = int(str(retry_after).strip())
        except ValueError:
            pass  # a date-form Retry-After is not parsed; the default stays

    seconds = max(60, min(MAX_PAUSE_SECONDS, seconds))

    with _pause_lock:
        until = time.monotonic() + seconds

        if until > _paused_until:
            _paused_until = until

        _paused_status = status_code

        remaining = _paused_until - time.monotonic()

    _save_state(
        paused_until=time.time() + remaining,
        paused_status=status_code,
    )


def provider_pause_remaining_seconds() -> int:
    """Seconds left in the pause, or 0 when requests may be sent."""

    with _pause_lock:
        remaining = _paused_until - time.monotonic()

    return int(remaining) + 1 if remaining > 0 else 0


def provider_pause_message() -> str | None:
    """The reason no request is being sent, or None when not paused."""

    remaining = provider_pause_remaining_seconds()

    if remaining <= 0:
        return None

    with _pause_lock:
        status_code = _paused_status

    return (
        "VesselAPI requests are paused for about "
        f"{max(1, round(remaining / 60))} more minute(s) because the "
        f"provider refused the last request (HTTP {status_code}). "
        "No request was sent."
    )


def provider_error_text(status_code: int, message: str) -> str:
    """The error raised for a refused request, with a hint when the
    provider's reply could not be read."""

    text = f"VesselAPI returned HTTP {status_code}: {message}"

    if not text.endswith((".", "!", "?")):
        text += "."

    if message == UNREADABLE_ERROR_MESSAGE:
        if status_code == 403:
            text += (
                " The API key may be suspended or this IP address blocked "
                "by the provider."
            )
        elif status_code == 429:
            text += " The provider's request limit has been reached."

    remaining = provider_pause_remaining_seconds()

    if remaining > 0:
        text += (
            " Further requests are paused for about "
            f"{max(1, round(remaining / 60))} minute(s)."
        )

    return text


# =========================================================
# MONTHLY QUOTA LEFT (ADDED 22 OCT 2026)
# =========================================================
# VesselAPI sends X-RateLimit-Remaining (calls left this month, or
# "Unlimited") with every reply to a request with a valid key. The last
# value seen is kept in the state file and shown by the AIS status, so
# it is visible how many calls are left before the provider refuses.

def note_quota_header(headers: Any) -> None:
    """Remember the calls left this month, from a provider reply."""

    try:
        value = headers.get("X-RateLimit-Remaining") if headers else None
    except Exception:
        return

    if value is None:
        return

    value = str(value).strip()[:30]

    if value:
        _save_state(quota_remaining=value, quota_seen_at=time.time())


def quota_status() -> dict[str, Any]:
    """Calls left this month as last reported by VesselAPI."""

    state = _load_state()
    seen = state.get("quota_seen_at")

    return {
        "quota_remaining": state.get("quota_remaining"),
        "quota_seen_at": (
            datetime.fromtimestamp(seen, timezone.utc)
            if isinstance(seen, (int, float)) and not isinstance(seen, bool)
            else None
        ),
    }


_restore_pause_from_file()


# =========================================================
# VALIDATION HELPERS
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


def _text(value: Any) -> str | None:
    if value is None:
        return None

    result = " ".join(str(value).split())
    return result or None


def _parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )
    except (TypeError, ValueError, OverflowError):
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _utc_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return (
        value.astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _navigation_status(code: int | None) -> str | None:
    statuses = {
        0: "Under way using engine",
        1: "At anchor",
        2: "Not under command",
        3: "Restricted manoeuvrability",
        4: "Constrained by draught",
        5: "Moored",
        6: "Aground",
        7: "Engaged in fishing",
        8: "Under way sailing",
        14: "AIS-SART",
        15: "Not defined",
    }

    return statuses.get(code) if code is not None else None


def _port_status(code: int | None) -> str:
    if code == 1:
        return "anchored"
    if code == 5:
        return "moored"
    if code == 6:
        return "aground"
    if code in (0, 8):
        return "underway"
    if code in (2, 3, 4, 7):
        return "restricted"

    return "active"


def _configuration_check() -> None:
    if not VESSELAPI_API_KEY:
        raise AISConfigurationError(
            "VESSELAPI_API_KEY is missing from the backend .env file."
        )

    if not VESSELAPI_BASE_URL.startswith(("https://", "http://")):
        raise AISConfigurationError(
            "VESSELAPI_BASE_URL must be an HTTP(S) URL."
        )

    if not (
        -90 <= LAT_MIN < LAT_MAX <= 90
        and -180 <= LON_MIN < LON_MAX <= 180
    ):
        raise AISConfigurationError(
            "The configured vessel latitude/longitude bounds are invalid."
        )

    # The configured rectangle must remain within the provider's
    # documented maximum bounding-box span.
    if (
        (LAT_MAX - LAT_MIN) + (LON_MAX - LON_MIN)
    ) > 4:
        raise AISConfigurationError(
            "The configured bounding box exceeds the supported span."
        )


def _bounding_box() -> dict[str, float]:
    return {
        "latitude_min": LAT_MIN,
        "latitude_max": LAT_MAX,
        "longitude_min": LON_MIN,
        "longitude_max": LON_MAX,
    }


# =========================================================
# VESSELAPI RESPONSE NORMALIZATION
# =========================================================

def normalize_vesselapi_record(
    record: dict[str, Any],
) -> dict[str, Any] | None:
    """Normalize one real VesselAPI vessel-position record."""

    if not isinstance(record, dict):
        return None

    mmsi_number = _integer(record.get("mmsi"))
    latitude = _number(record.get("latitude"))
    longitude = _number(record.get("longitude"))

    if (
        mmsi_number is None
        or not 100_000_000 <= mmsi_number <= 999_999_999
    ):
        return None

    if latitude is None or not -90 <= latitude <= 90:
        return None

    if longitude is None or not -180 <= longitude <= 180:
        return None

    # Never store a position outside the configured port area.
    if not (
        LAT_MIN <= latitude <= LAT_MAX
        and LON_MIN <= longitude <= LON_MAX
    ):
        return None

    timestamp = (
        _parse_timestamp(record.get("timestamp"))
        or _parse_timestamp(record.get("processed_timestamp"))
    )

    # If the provider supplies no usable timestamp, mark the time
    # as ingestion time in the database. This is not source freshness.
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    name = _text(record.get("vessel_name")) or f"Vessel {mmsi_number}"

    data: dict[str, Any] = {
        "mmsi": str(mmsi_number),
        "vessel_name": name[:120],
        "latitude": latitude,
        "longitude": longitude,
        "ais_source": "VesselAPI",
        "ais_last_updated_at": timestamp,
    }

    imo = _integer(record.get("imo"))
    if imo is not None and 1 <= imo <= 999_999_999:
        data["imo_number"] = str(imo)

    speed = _number(record.get("sog"))
    if speed is not None and 0 <= speed < 102.3:
        data["speed_knots"] = speed

    course = _number(record.get("cog"))
    if course is not None and 0 <= course < 360:
        data["course_deg"] = course

    heading = _integer(record.get("heading"))
    if heading is not None and 0 <= heading <= 359:
        data["heading_deg"] = heading

    nav_code = _integer(record.get("nav_status"))
    nav_status = _navigation_status(nav_code)

    if nav_status is not None:
        data["ais_navigation_status"] = nav_status
        data["status"] = _port_status(nav_code)

    return data


# =========================================================
# VESSELAPI REST REQUEST
# =========================================================

def _fetch_live_ais_data_with_diagnostics(
) -> tuple[list[dict[str, Any]], int]:
    """Fetch VesselAPI records and return normalized records plus raw count."""

    _configuration_check()

    paused = provider_pause_message()

    if paused:
        raise AISProviderError(paused)

    now = datetime.now(timezone.utc)
    time_from = now - timedelta(hours=VESSELAPI_LOOKBACK_HOURS)

    params = {
        "filter.lonLeft": LON_MIN,
        "filter.lonRight": LON_MAX,
        "filter.latBottom": LAT_MIN,
        "filter.latTop": LAT_MAX,
        "pagination.limit": VESSELAPI_RESULT_LIMIT,
        "time.from": _utc_timestamp(time_from),
        "time.to": _utc_timestamp(now),
    }

    url = (
        f"{VESSELAPI_BASE_URL}{VESSELAPI_ENDPOINT}?"
        f"{urlencode(params)}"
    )

    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {VESSELAPI_API_KEY}",
            "Accept": "application/json",
            "User-Agent": "Smart-Port-Management/1.0",
        },
        method="GET",
    )

    try:
        with urlopen(
            request,
            timeout=VESSELAPI_TIMEOUT_SECONDS,
        ) as response:
            note_quota_header(response.headers)
            payload = json.loads(
                response.read().decode("utf-8")
            )

    except HTTPError as exc:
        note_quota_header(exc.headers)
        note_provider_refusal(
            exc.code,
            exc.headers.get("Retry-After") if exc.headers else None,
        )

        # Do not log the API key or full request URL.
        try:
            body = exc.read().decode("utf-8", errors="replace")
            details = json.loads(body)
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
            message = UNREADABLE_ERROR_MESSAGE

        raise AISProviderError(
            provider_error_text(exc.code, message)
        ) from None

    except (URLError, TimeoutError, OSError) as exc:
        raise AISProviderError(
            f"Could not connect to VesselAPI ({type(exc).__name__})."
        ) from None

    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AISProviderError(
            "VesselAPI returned invalid JSON."
        ) from exc

    if not isinstance(payload, dict):
        raise AISProviderError(
            "VesselAPI returned an unexpected response format."
        )

    if payload.get("error"):
        error = payload["error"]

        if isinstance(error, dict):
            message = (
                error.get("message")
                or error.get("detail")
                or "Unspecified provider error."
            )
        else:
            message = str(error)

        raise AISProviderError(f"VesselAPI error: {message}")

    raw_records = payload.get("vessels")

    if not isinstance(raw_records, list):
        raise AISProviderError(
            "VesselAPI response did not contain a 'vessels' list. "
            "Check the provider's response schema and API endpoint."
        )

    normalized: dict[str, dict[str, Any]] = {}

    for record in raw_records:
        item = normalize_vesselapi_record(record)

        if item is not None:
            # Keep only the latest record for each MMSI in this response.
            existing = normalized.get(item["mmsi"])
            if (
                existing is None
                or item["ais_last_updated_at"]
                >= existing["ais_last_updated_at"]
            ):
                normalized[item["mmsi"]] = item

    return list(normalized.values()), len(raw_records)


def fetch_live_ais_data() -> list[dict[str, Any]]:
    """Compatibility wrapper for existing callers."""

    records, _raw_count = _fetch_live_ais_data_with_diagnostics()
    return records


# =========================================================
# DATABASE PERSISTENCE
# =========================================================

def upsert_ais_vessel(
    db: Session,
    vessel_data: dict[str, Any],
) -> tuple[Vessel, bool]:
    """Insert or update a vessel identified by MMSI."""

    mmsi = str(vessel_data["mmsi"])

    vessel = db.scalar(
        select(Vessel).where(Vessel.mmsi == mmsi)
    )

    created = vessel is None

    if created:
        # The model's own default status is "anchored". A new vessel must
        # not be shown as anchored unless AIS actually says so, so start
        # as "unknown"; a reported navigation status overrides it below.
        vessel = Vessel(
            mmsi=mmsi,
            vessel_name=vessel_data.get("vessel_name") or f"Vessel {mmsi}",
            vessel_type="Unknown",
            status="unknown",
        )
        db.add(vessel)

    for field, value in vessel_data.items():
        if value is not None and hasattr(vessel, field):
            setattr(vessel, field, value)

    return vessel, created


def save_ais_history_snapshot(
    db: Session,
    data: dict[str, Any],
) -> bool:
    """
    Store a validated AIS position observation.

    recorded_at is the time of the AIS position itself (or the time it
    was received, when the provider gave no usable timestamp). A position
    that is already stored for the same MMSI and time is not stored again,
    so repeated syncs do not create duplicate history rows.

    Returns True when a new history row was added.
    """

    mmsi = str(data["mmsi"])

    recorded_at = (
        data.get("ais_last_updated_at") or datetime.now(timezone.utc)
    )

    already_stored = db.scalar(
        select(AISPositionHistory.id)
        .where(AISPositionHistory.mmsi == mmsi)
        .where(AISPositionHistory.recorded_at == recorded_at)
        .limit(1)
    )

    if already_stored is not None:
        return False

    db.add(
        AISPositionHistory(
            mmsi=mmsi,
            vessel_name=data.get("vessel_name"),
            latitude=float(data["latitude"]),
            longitude=float(data["longitude"]),
            speed_knots=data.get("speed_knots"),
            course_deg=data.get("course_deg"),
            heading_deg=data.get("heading_deg"),
            navigation_status=data.get("ais_navigation_status"),
            ais_source="VesselAPI",
            recorded_at=recorded_at,
        )
    )

    return True


def _persist_records(
    db: Session,
    records: list[dict[str, Any]],
) -> tuple[int, int, int]:
    """Save vessels and history. Returns (created, updated, history_saved)."""

    created_count = 0
    updated_count = 0
    history_count = 0

    for record in records:
        _, created = upsert_ais_vessel(db, record)

        if save_ais_history_snapshot(db, record):
            history_count += 1

        if created:
            created_count += 1
        else:
            updated_count += 1

    return created_count, updated_count, history_count


def _save_background_records(
    records: list[dict[str, Any]],
) -> tuple[int, int, int]:
    """Persist records using a separate database session."""

    if not records:
        return 0, 0, 0

    generator = get_db()
    db = next(generator)

    try:
        created, updated, history_saved = _persist_records(db, records)
        db.commit()
        return created, updated, history_saved
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        close = getattr(generator, "close", None)
        if callable(close):
            close()


# =========================================================
# STATUS COUNTERS
# =========================================================

def _record_result(
    provider_received: int,
    normalized: int,
    created: int,
    updated: int,
) -> None:
    global _ais_last_received, _ais_last_provider_received
    global _ais_last_normalized, _ais_total_received
    global _ais_total_created, _ais_total_updated
    global _ais_last_updated_at, _ais_last_error

    _ais_last_provider_received = provider_received
    _ais_last_normalized = normalized
    _ais_last_received = normalized

    _ais_total_received += normalized
    _ais_total_created += created
    _ais_total_updated += updated

    if normalized:
        _ais_last_updated_at = datetime.now(timezone.utc)

    _ais_last_error = None

    # A request the provider accepted. Remembered across restarts so a
    # restart does not poll again straight away.
    _save_state(last_success_at=time.time())


# =========================================================
# MANUAL SYNCHRONIZATION
# =========================================================

async def synchronize_ais_vessels(
    db: Session,
) -> dict[str, Any]:
    """Fetch live VesselAPI positions and save them to PostgreSQL."""

    global _ais_last_error, _ais_connected, _ais_last_message_at

    try:
        _configuration_check()
        _ais_connected = True

        records, provider_received = await asyncio.to_thread(
            _fetch_live_ais_data_with_diagnostics
        )

        _ais_last_message_at = datetime.now(timezone.utc)

        created, updated, history_saved = _persist_records(db, records)
        db.commit()

        _record_result(
            provider_received,
            len(records),
            created,
            updated,
        )

        if not records:
            message = (
                "VesselAPI request succeeded, but no valid vessel positions "
                "were returned for the configured Port of Singapore area. "
                "This does not prove that the port is empty."
            )
        else:
            message = (
                f"Saved {len(records)} real vessel position(s) from "
                f"VesselAPI. New: {created}; updated: {updated}."
            )

        return {
            "success": True,
            "source": "VesselAPI",
            "connected": True,
            "provider_received": provider_received,
            "normalized": len(records),
            "received": len(records),
            "created": created,
            "updated": updated,
            "history_saved": history_saved,
            "message": message,
            "bounding_box": _bounding_box(),
        }

    except Exception as exc:
        db.rollback()
        _ais_last_error = f"{type(exc).__name__}: {exc}"
        raise

    finally:
        _ais_connected = False


# =========================================================
# CONTINUOUS BACKGROUND POLLING
# =========================================================

async def _ais_background_loop() -> None:
    global _ais_listener_running, _ais_connected
    global _ais_last_error, _ais_last_message_at

    _ais_listener_running = True
    retry_delay = 5

    try:
        # After a server restart, do not poll straight away when the
        # provider is still refusing requests or data was fetched
        # recently. The saved data stays available meanwhile.
        startup_wait = _seconds_until_next_poll_allowed()

        if startup_wait > 0:
            logger.warning(
                "VesselAPI polling starts in about %d minute(s): "
                "a pause or a recent request is still in effect.",
                max(1, round(startup_wait / 60)),
            )
            await asyncio.sleep(startup_wait + random.random())

        while True:
            try:
                _configuration_check()
                _ais_connected = True

                records, provider_received = await asyncio.to_thread(
                    _fetch_live_ais_data_with_diagnostics
                )

                _ais_last_message_at = datetime.now(timezone.utc)

                created, updated, _history_saved = await asyncio.to_thread(
                    _save_background_records,
                    records,
                )

                _record_result(
                    provider_received,
                    len(records),
                    created,
                    updated,
                )

                retry_delay = 5

                logger.info(
                    "VesselAPI poll complete: provider=%d normalized=%d "
                    "created=%d updated=%d",
                    provider_received,
                    len(records),
                    created,
                    updated,
                )

                # Wait for the configured polling interval after a
                # successful request. This avoids excessive API usage.
                await asyncio.sleep(VESSELAPI_POLL_INTERVAL_SECONDS)

            except asyncio.CancelledError:
                raise

            except Exception as exc:
                _ais_last_error = f"{type(exc).__name__}: {exc}"

                if isinstance(
                    exc,
                    (AISProviderError, AISConfigurationError),
                ):
                    # Expected problems (quota, key, network) need one
                    # clear line, not a long error trace.
                    logger.warning(
                        "VesselAPI background poll failed: %s", exc
                    )
                else:
                    logger.exception("VesselAPI background poll failed")

                # While the provider is refusing requests, wait out the
                # pause instead of retrying every few minutes.
                wait = max(
                    retry_delay,
                    provider_pause_remaining_seconds(),
                )

                await asyncio.sleep(wait + random.random())
                retry_delay = min(retry_delay * 2, 300)

            finally:
                _ais_connected = False

    finally:
        _ais_listener_running = False
        _ais_connected = False


def start_ais_background_listener() -> dict[str, Any]:
    """Start the background VesselAPI polling task."""

    global _ais_background_task

    _configuration_check()

    # The ETA and port-call collector (Vessel Delay training data) runs
    # beside the position polling. A problem there never stops this one.
    try:
        from app.services.eta_collector import start_eta_collector

        start_eta_collector()
    except Exception:
        logger.exception("Could not start the ETA collector")

    if (
        _ais_background_task is not None
        and not _ais_background_task.done()
    ):
        return {
            "running": True,
            "connected": _ais_connected,
            "source": "VesselAPI",
            "message": "VesselAPI background listener is already running.",
            "bounding_box": _bounding_box(),
        }

    _ais_background_task = asyncio.create_task(_ais_background_loop())

    return {
        "running": True,
        "source": "VesselAPI",
        "message": "VesselAPI background polling started.",
        "poll_interval_seconds": VESSELAPI_POLL_INTERVAL_SECONDS,
        "bounding_box": _bounding_box(),
    }


async def stop_ais_background_listener() -> None:
    """Stop the background polling task."""

    global _ais_background_task, _ais_listener_running, _ais_connected

    try:
        from app.services.eta_collector import stop_eta_collector

        await stop_eta_collector()
    except Exception:
        logger.exception("Could not stop the ETA collector")

    task = _ais_background_task

    if task is not None and not task.done():
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

    _ais_background_task = None
    _ais_listener_running = False
    _ais_connected = False


# =========================================================
# LISTENER STATUS
# =========================================================

def get_ais_listener_status() -> dict[str, Any]:
    try:
        from app.services.eta_collector import get_eta_collector_status

        eta_collector = get_eta_collector_status()
    except Exception as exc:
        eta_collector = {"error": f"{type(exc).__name__}: {exc}"}

    return {
        **quota_status(),
        "eta_collector": eta_collector,
        "running": _ais_listener_running,
        "connected": _ais_connected,
        "source": "VesselAPI",
        "configured": bool(VESSELAPI_API_KEY),
        "last_received": _ais_last_received,
        "last_provider_received": _ais_last_provider_received,
        "last_normalized": _ais_last_normalized,
        "total_received": _ais_total_received,
        "total_created": _ais_total_created,
        "total_updated": _ais_total_updated,
        "last_message_at": _ais_last_message_at,
        "last_updated_at": _ais_last_updated_at,
        "last_error": _ais_last_error,
        "provider_pause_seconds": provider_pause_remaining_seconds(),
        "poll_interval_seconds": VESSELAPI_POLL_INTERVAL_SECONDS,
        "bounding_box": _bounding_box(),
    }
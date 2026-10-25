from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

from app.services.ais_service import (
    AISConfigurationError,
    AISProviderError,
    UNREADABLE_ERROR_MESSAGE,
    VESSELAPI_API_KEY,
    VESSELAPI_BASE_URL,
    VESSELAPI_TIMEOUT_SECONDS,
    note_provider_refusal,
    provider_error_text,
    provider_pause_message,
)

load_dotenv()
logger = logging.getLogger(__name__)

# =========================================================
# CONFIGURATION
# =========================================================


def _env_int(name: str, default: int, low: int, high: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default

    return max(low, min(high, value))


# UN/LOCODE of the port whose arrivals and departures are listed.
PORT_UNLOCODE = (
    os.getenv("VESSELAPI_PORT_UNLOCODE", "SGSIN").strip().upper() or "SGSIN"
)

# Newest port events requested from the provider in one call.
EVENT_LIMIT = _env_int("VESSELAPI_PORT_CALL_LIMIT", 50, 1, 50)

# The provider gives an event but not the previous or next port. These
# are looked up one vessel at a time, so only the newest events in each
# table are looked up, and every answer is cached.
ENRICH_LIMIT = _env_int("VESSELAPI_PORT_EVENT_ENRICH_LIMIT", 25, 0, 50)
CACHE_SECONDS = _env_int("VESSELAPI_PORT_EVENT_CACHE_SECONDS", 1800, 0, 86400)

# Declared destinations for the Vessel Management table. A vessel's
# destination changes rarely, so it is cached for longer than port events.
DESTINATION_CACHE_SECONDS = _env_int(
    "VESSELAPI_DESTINATION_CACHE_SECONDS", 21600, 0, 604800
)

# Most vessels looked up by one request (one page of the vessels table).
MAX_DESTINATION_LOOKUPS = 50

MAX_HOURS = 168
PREVIOUS_PORT_LOOKBACK_HOURS = 168
LOOKUP_WORKERS = 5

_cache: dict[tuple, tuple[float, Any]] = {}
_cache_lock = threading.Lock()


# =========================================================
# SMALL HELPERS
# =========================================================

def _text(value: Any) -> str | None:
    if value is None:
        return None

    result = " ".join(str(value).split())
    return result or None


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError, OverflowError):
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _stamp(value: datetime) -> str:
    return (
        value.astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _port_label(port: Any) -> str | None:
    if not isinstance(port, dict):
        return None

    name = _text(port.get("name"))
    code = _text(port.get("unlo_code"))

    name = name.title() if name else None
    code = code.upper() if code else None

    if name and code:
        return f"{name} ({code})"

    return name or code


def _configuration_check() -> None:
    if not VESSELAPI_API_KEY:
        raise AISConfigurationError(
            "VESSELAPI_API_KEY is missing from the backend .env file."
        )

    if not VESSELAPI_BASE_URL.startswith(("https://", "http://")):
        raise AISConfigurationError(
            "VESSELAPI_BASE_URL must be an HTTP(S) URL."
        )

    if not re.fullmatch(r"[A-Z]{5}", PORT_UNLOCODE):
        raise AISConfigurationError(
            "VESSELAPI_PORT_UNLOCODE must be a 5-letter UN/LOCODE, "
            "for example SGSIN."
        )


# =========================================================
# VESSELAPI REQUEST
# =========================================================

def _provider_error(exc: HTTPError) -> tuple[str, str | None]:
    """Read the provider's error message and code without raising."""

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
            code = error.get("code")
            return str(message), (str(code) if code else None)

        return str(error), None

    except Exception:
        return UNREADABLE_ERROR_MESSAGE, None


def _request(path: str, params: dict[str, Any]) -> dict[str, Any] | None:
    """
    GET one VesselAPI resource.

    Returns None only when the provider says the requested vessel or port
    does not exist ("resource_missing"). Any other failure raises
    AISProviderError, so a wrong path is never mistaken for "no data".
    The API key is never logged or included in an error message.
    """

    paused = provider_pause_message()

    if paused:
        raise AISProviderError(paused)

    url = f"{VESSELAPI_BASE_URL}{path}?{urlencode(params)}"

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
        with urlopen(request, timeout=VESSELAPI_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))

    except HTTPError as exc:
        note_provider_refusal(
            exc.code,
            exc.headers.get("Retry-After") if exc.headers else None,
        )

        message, code = _provider_error(exc)

        if exc.code == 404 and code == "resource_missing":
            return None

        raise AISProviderError(
            provider_error_text(exc.code, message)
        ) from None

    except (URLError, TimeoutError, OSError) as exc:
        raise AISProviderError(
            f"Could not connect to VesselAPI ({type(exc).__name__})."
        ) from None

    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AISProviderError("VesselAPI returned invalid JSON.") from exc

    if not isinstance(payload, dict):
        raise AISProviderError(
            "VesselAPI returned an unexpected response format."
        )

    return payload


# =========================================================
# PER-VESSEL LOOKUPS (CACHED)
# =========================================================

def _cached(key: tuple, loader, ttl: int | None = None):
    """
    Return a cached value, or load and cache it. Errors are not cached.
    `ttl` is the lifetime in seconds; None uses CACHE_SECONDS.
    """

    ttl_seconds = CACHE_SECONDS if ttl is None else ttl

    now = time.monotonic()

    with _cache_lock:
        hit = _cache.get(key)

        if hit is not None and hit[0] > now:
            return hit[1]

    value = loader()

    if ttl_seconds:
        with _cache_lock:
            if len(_cache) > 2000:
                for stale_key in [k for k, v in _cache.items() if v[0] <= now]:
                    _cache.pop(stale_key, None)

            if len(_cache) > 2000:
                _cache.clear()

            _cache[key] = (now + ttl_seconds, value)

    return value


def _declared_destination(mmsi: str) -> str | None:
    """
    The destination the vessel itself declares over AIS. This is what the
    crew entered, so it can be free text or out of date.
    """

    payload = _request(f"/v1/vessel/{quote(mmsi)}/eta", {"filter.idType": "mmsi"})

    if payload is None:
        return None

    eta = payload.get("vesselEta")

    if not isinstance(eta, dict):
        raise AISProviderError(
            "VesselAPI ETA response did not contain 'vesselEta'."
        )

    destination = _text(eta.get("destination"))
    code = _text(eta.get("destination_port"))

    if destination and code and code.upper() not in destination.upper():
        return f"{destination} ({code.upper()})"

    return destination or (code.upper() if code else None)


def _previous_port(mmsi: str, arrival_time: datetime) -> str | None:
    """
    The port the vessel most recently departed from before this arrival,
    taken from the provider's own port events for that vessel.
    """

    payload = _request(
        f"/v1/portevents/vessel/{quote(mmsi)}",
        {
            "filter.idType": "mmsi",
            "time.from": _stamp(
                arrival_time - timedelta(hours=PREVIOUS_PORT_LOOKBACK_HOURS)
            ),
            "time.to": _stamp(arrival_time),
            "pagination.limit": 20,
        },
    )

    if payload is None:
        return None

    events = payload.get("portEvents")

    if not isinstance(events, list):
        raise AISProviderError(
            "VesselAPI vessel port-events response did not contain "
            "'portEvents'."
        )

    best_time: datetime | None = None
    best_label: str | None = None

    for event in events:
        if not isinstance(event, dict):
            continue

        if str(event.get("event", "")).strip().lower() != "departure":
            continue

        port = event.get("port")
        code = (
            _text(port.get("unlo_code")) if isinstance(port, dict) else None
        )

        if code and code.upper() == PORT_UNLOCODE:
            continue

        when = _parse_time(event.get("timestamp"))

        if when is None or when >= arrival_time:
            continue

        label = _port_label(port)

        if label and (best_time is None or when > best_time):
            best_time = when
            best_label = label

    return best_label


def _fill(rows: list[dict[str, Any]], field: str, loader, label: str, warnings: list[str]) -> None:
    """Fill one field on the newest ENRICH_LIMIT rows, a few lookups at a time."""

    targets = rows[:ENRICH_LIMIT]

    if not targets:
        return

    def work(row: dict[str, Any]):
        try:
            return loader(row), None
        except AISProviderError as exc:
            return None, str(exc)
        except Exception as exc:  # keep one bad vessel from failing the table
            logger.exception("Port-event lookup failed")
            return None, type(exc).__name__

    with ThreadPoolExecutor(max_workers=LOOKUP_WORKERS) as pool:
        results = list(pool.map(work, targets))

    for row, (value, error) in zip(targets, results):
        row[field] = value

        if error:
            message = f"{label}: {error}"

            if message not in warnings:
                warnings.append(message)

    if len(rows) > len(targets):
        warnings.append(
            f"{label}: only the newest {len(targets)} of {len(rows)} rows "
            "were looked up; the others show —."
        )


# =========================================================
# PORT EVENTS
# =========================================================

def _normalise_event(item: Any) -> tuple[str, dict[str, Any]] | None:
    if not isinstance(item, dict):
        return None

    kind = str(item.get("event", "")).strip().lower()

    if kind not in ("arrival", "departure"):
        return None

    vessel = item.get("vessel")

    if not isinstance(vessel, dict):
        return None

    mmsi = _text(vessel.get("mmsi"))
    when = _parse_time(item.get("timestamp"))

    if not mmsi or when is None:
        return None

    name = _text(vessel.get("name"))
    imo = _text(vessel.get("imo"))
    event_time = _stamp(when)

    return kind, {
        "id": f"{kind}-{mmsi}-{event_time}",
        "event_type": kind,
        "vessel_name": name.upper() if name else f"Vessel {mmsi}",
        "mmsi": mmsi,
        "imo_number": imo,
        "port": _port_label(item.get("port")),
        "event_time": event_time,
        "from_port": None,
        "to_port": None,
    }


def fetch_port_events(hours: int) -> dict[str, Any]:
    """
    Arrivals and departures at the configured port for the last `hours`.

    The two lists are kept separate:
    - arrivals carry from_port: the port the vessel departed from most
      recently before arriving, from the provider's vessel port events;
    - departures carry to_port: the destination the vessel declares over
      AIS, from the provider's ETA record.
    Either is None when the provider has no answer.
    """

    _configuration_check()

    hours = max(1, min(MAX_HOURS, int(hours)))

    now = datetime.now(timezone.utc)

    payload = _request(
        f"/v1/portevents/port/{quote(PORT_UNLOCODE)}",
        {
            "time.from": _stamp(now - timedelta(hours=hours)),
            "time.to": _stamp(now),
            "pagination.limit": EVENT_LIMIT,
        },
    )

    if payload is None:
        raise AISProviderError(
            f"VesselAPI does not know the port {PORT_UNLOCODE}."
        )

    raw_events = payload.get("portEvents")

    if not isinstance(raw_events, list):
        raise AISProviderError(
            "VesselAPI response did not contain a 'portEvents' list."
        )

    arrivals: list[dict[str, Any]] = []
    departures: list[dict[str, Any]] = []
    seen: set[str] = set()
    ignored = 0

    for item in raw_events:
        parsed = _normalise_event(item)

        if parsed is None:
            ignored += 1
            continue

        kind, row = parsed

        if row["id"] in seen:
            continue

        seen.add(row["id"])

        (arrivals if kind == "arrival" else departures).append(row)

    # Newest first.
    arrivals.sort(key=lambda row: row["event_time"], reverse=True)
    departures.sort(key=lambda row: row["event_time"], reverse=True)

    warnings: list[str] = []

    truncated = bool(payload.get("nextToken")) and len(raw_events) >= EVENT_LIMIT

    if truncated:
        warnings.append(
            f"Only the newest {EVENT_LIMIT} port events were loaded, so "
            "older events inside the selected period are not shown. The "
            "port records many events per hour, so this list can cover "
            "much less time than the period selected."
        )

    if ignored:
        warnings.append(
            f"{ignored} event(s) were skipped because they were incomplete "
            "or were not arrivals or departures."
        )

    _fill(
        departures,
        "to_port",
        lambda row: _cached(
            ("to", row["mmsi"]),
            lambda: _declared_destination(row["mmsi"]),
        ),
        "Declared destination lookup",
        warnings,
    )

    _fill(
        arrivals,
        "from_port",
        lambda row: _cached(
            ("from", row["mmsi"], row["event_time"]),
            lambda: _previous_port(row["mmsi"], _parse_time(row["event_time"])),
        ),
        "Previous-port lookup",
        warnings,
    )

    # The time span the loaded events actually cover (UTC, ISO format).
    event_times = [row["event_time"] for row in arrivals + departures]

    return {
        "success": True,
        "source": "VesselAPI",
        "port_unlocode": PORT_UNLOCODE,
        "hours": hours,
        "limit": EVENT_LIMIT,
        "truncated": truncated,
        "oldest_event_time": min(event_times) if event_times else None,
        "newest_event_time": max(event_times) if event_times else None,
        "arrivals": arrivals,
        "departures": departures,
        "counts": {
            "arrivals": len(arrivals),
            "departures": len(departures),
        },
        "warnings": warnings,
        "generated_at": _stamp(now),
    }


# =========================================================
# DECLARED DESTINATIONS FOR THE VESSELS TABLE
# =========================================================

def fetch_declared_destinations(mmsis: list[str]) -> dict[str, Any]:
    """
    The destination each vessel declares over AIS, for the given MMSIs.

    `destinations` has one entry per vessel that was looked up
    successfully; the value is None when the vessel declares nothing (or
    the provider does not know it). A vessel whose lookup failed is left
    out of `destinations` and reported in `warnings`, so a failure is
    never shown as "no destination".
    """

    _configuration_check()

    wanted: list[str] = []

    for value in mmsis:
        mmsi = str(value).strip()

        if not re.fullmatch(r"\d{9}", mmsi):
            raise ValueError(f"'{mmsi}' is not a 9-digit MMSI.")

        if mmsi not in wanted:
            wanted.append(mmsi)

    if len(wanted) > MAX_DESTINATION_LOOKUPS:
        raise ValueError(
            f"At most {MAX_DESTINATION_LOOKUPS} vessels can be looked up "
            "at once."
        )

    def work(mmsi: str):
        try:
            return (
                _cached(
                    ("dest", mmsi),
                    lambda: _declared_destination(mmsi),
                    DESTINATION_CACHE_SECONDS,
                ),
                None,
            )
        except AISProviderError as exc:
            return None, str(exc)
        except Exception as exc:  # keep one bad vessel from failing the rest
            logger.exception("Declared destination lookup failed")
            return None, type(exc).__name__

    destinations: dict[str, str | None] = {}
    warnings: list[str] = []

    if wanted:
        with ThreadPoolExecutor(max_workers=LOOKUP_WORKERS) as pool:
            results = list(pool.map(work, wanted))

        for mmsi, (value, error) in zip(wanted, results):
            if error:
                message = f"Declared destination lookup: {error}"

                if message not in warnings:
                    warnings.append(message)
            else:
                destinations[mmsi] = value

    return {
        "success": True,
        "source": "VesselAPI",
        "destinations": destinations,
        "requested": len(wanted),
        "failed": len(wanted) - len(destinations),
        "warnings": warnings,
    }
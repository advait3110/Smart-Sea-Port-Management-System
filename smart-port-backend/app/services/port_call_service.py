from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.port_call_event import PortCallEvent

load_dotenv()
logger = logging.getLogger(__name__)

BASE_URL = os.getenv(
    "VESSELAPI_BASE_URL", "https://api.vesselapi.com"
).strip().rstrip("/")
API_KEY = os.getenv("VESSELAPI_API_KEY", "").strip()
PORT_CODE = os.getenv("VESSELAPI_PORT_UNLOCODE", "INKRW").strip().upper()
TIMEOUT = max(1, int(os.getenv("VESSELAPI_TIMEOUT_SECONDS", "25")))
LOOKBACK_HOURS = max(
    1, min(24 * 30, int(os.getenv("VESSELAPI_PORT_CALL_LOOKBACK_HOURS", "168")))
)
RESULT_LIMIT = max(
    1, min(50, int(os.getenv("VESSELAPI_PORT_CALL_LIMIT", "50")))
)

PORT_EVENTS_PATH = "/v1/portevents/port/"


class PortCallConfigurationError(Exception):
    pass


class PortCallProviderError(Exception):
    pass


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return _utc(parsed)
    except (TypeError, ValueError, OverflowError):
        return None


def _text(value: Any, maximum: int = 120) -> str | None:
    if value is None:
        return None
    result = " ".join(str(value).split())
    return result[:maximum] or None


def _configuration_check() -> None:
    if not API_KEY:
        raise PortCallConfigurationError(
            "VESSELAPI_API_KEY is missing from the backend .env file."
        )
    if not PORT_CODE:
        raise PortCallConfigurationError(
            "VESSELAPI_PORT_UNLOCODE is missing."
        )
    if not BASE_URL.startswith(("https://", "http://")):
        raise PortCallConfigurationError(
            "VESSELAPI_BASE_URL must be an HTTP(S) URL."
        )


def _request_page(
    start: datetime,
    end: datetime,
    next_token: str | None = None,
) -> dict[str, Any]:
    _configuration_check()

    params: dict[str, Any] = {
        "time.from": _utc(start).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "time.to": _utc(end).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "pagination.limit": RESULT_LIMIT,
    }
    if next_token:
        params["pagination.nextToken"] = next_token

    url = (
        f"{BASE_URL}{PORT_EVENTS_PATH}{PORT_CODE}?"
        f"{urlencode(params)}"
    )
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Accept": "application/json",
            "User-Agent": "Karwar-Smart-Port-Management/1.0",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8", errors="replace"))
            error = body.get("error", body)
            message = (
                error.get("message") or error.get("detail") or "Provider request failed."
                if isinstance(error, dict)
                else str(error)
            )
        except Exception:
            message = "Provider returned an unreadable error response."
        raise PortCallProviderError(
            f"VesselAPI returned HTTP {exc.code}: {message}"
        ) from None
    except (URLError, TimeoutError, OSError) as exc:
        raise PortCallProviderError(
            f"Could not connect to VesselAPI ({type(exc).__name__})."
        ) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise PortCallProviderError("VesselAPI returned invalid JSON.") from None

    if not isinstance(payload, dict):
        raise PortCallProviderError("Unexpected VesselAPI response format.")
    if payload.get("error"):
        raise PortCallProviderError("VesselAPI reported an API error.")

    events = payload.get("portEvents")
    if not isinstance(events, list):
        raise PortCallProviderError(
            "VesselAPI response did not contain a 'portEvents' list."
        )
    return payload


def fetch_karwar_port_events() -> tuple[list[dict[str, Any]], int]:
    """Fetch port events from VesselAPI for the configured port and time range."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=LOOKBACK_HOURS)
    collected: list[dict[str, Any]] = []
    next_token: str | None = None
    seen_tokens: set[str] = set()

    # Bound pagination to avoid unbounded API usage.
    for _ in range(10):
        payload = _request_page(start, now, next_token)
        collected.extend(payload["portEvents"])

        token = payload.get("nextToken")
        if not token or not isinstance(token, str) or token in seen_tokens:
            break

        seen_tokens.add(token)
        next_token = token

    normalized: dict[str, dict[str, Any]] = {}

    for raw in collected:
        if not isinstance(raw, dict):
            continue

        event_type = _text(raw.get("event"), 20)
        if not event_type:
            continue

        event_type = event_type.lower()
        if event_type not in {"arrival", "departure"}:
            continue

        timestamp = _parse_timestamp(raw.get("timestamp"))
        vessel = raw.get("vessel") or {}
        port = raw.get("port") or {}

        if not isinstance(vessel, dict) or not isinstance(port, dict):
            continue
        if timestamp is None:
            continue

        unlocode = (_text(port.get("unlo_code") or port.get("unlocode"), 10) or PORT_CODE).upper()
        # This service is intentionally restricted to Karwar port calls.
        if unlocode != PORT_CODE:
            continue

        mmsi = _text(vessel.get("mmsi"), 20)
        imo = _text(vessel.get("imo"), 20)
        vessel_name = _text(vessel.get("name") or vessel.get("vessel_name"), 120)
        port_name = _text(port.get("name"), 120) or "Karwar"
        country = _text(port.get("country"), 80)

        identity = "|".join(
            [
                event_type,
                timestamp.isoformat(),
                mmsi or "",
                imo or "",
                vessel_name or "",
                unlocode,
            ]
        )
        event_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()

        normalized[event_key] = {
            "event_key": event_key,
            "event_type": event_type,
            "event_timestamp": timestamp,
            "mmsi": mmsi,
            "imo_number": imo,
            "vessel_name": vessel_name,
            "port_name": port_name,
            "port_country": country,
            "unlocode": unlocode,
            "source": "VesselAPI",
        }

    return list(normalized.values()), len(collected)


def synchronize_karwar_port_calls(db: Session) -> dict[str, Any]:
    records, provider_received = fetch_karwar_port_events()
    created = 0
    existing = 0

    try:
        for data in records:
            row = db.scalar(
                select(PortCallEvent).where(
                    PortCallEvent.event_key == data["event_key"]
                )
            )
            if row is not None:
                existing += 1
                continue

            db.add(PortCallEvent(**data))
            created += 1

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist Karwar port-call events")
        raise

    return {
        "success": True,
        "source": "VesselAPI",
        "port": PORT_CODE,
        "provider_received": provider_received,
        "normalized": len(records),
        "created": created,
        "already_stored": existing,
        "lookback_hours": LOOKBACK_HOURS,
        "message": (
            f"Received {provider_received} provider event(s); "
            f"normalized {len(records)}; inserted {created}; "
            f"already stored {existing}."
            if records
            else
            "VesselAPI returned no matching port-call events for Karwar "
            "in the configured time window. This does not prove the port is empty."
        ),
    }
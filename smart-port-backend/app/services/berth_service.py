import logging
import math
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.berth import Berth
from app.models.vessel import Vessel
from app.schemas.berth import BerthCreate, BerthResponse, BerthUpdate

logger = logging.getLogger(__name__)


# =========================================================
# LIVE OCCUPANCY SETTINGS
# =========================================================

def _env_int(name: str, default: int, low: int, high: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default

    return max(low, min(high, value))


# A moored vessel counts as being at a berth when its latest AIS position
# is within this many metres of the berth's coordinates.
MATCH_RADIUS_M = _env_int("BERTH_MATCH_RADIUS_M", 300, 50, 2000)

# Only AIS positions newer than this are trusted. A moored ship does not
# move, so its last saved position stays useful for a few days even when
# AIS has not been synced recently (for example when the VesselAPI quota
# is used up). The Berth Management page shows how old each position is.
# Older records are ignored: they do not prove a vessel is still there.
AIS_MAX_AGE_HOURS = _env_int("BERTH_AIS_MAX_AGE_HOURS", 72, 1, 720)

_REQUIRED_FIELDS = {
    "berth_code": "Berth code",
    "berth_name": "Berth name",
    "berth_type": "Berth type",
    "status": "Status",
    "is_active": "Active flag",
}


# =========================================================
# HELPERS
# =========================================================

def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (haversine)."""

    earth_radius_m = 6371008.8

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )

    return 2 * earth_radius_m * math.asin(min(1.0, math.sqrt(a)))


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _is_moored(status: str | None, navigation_status: str | None) -> bool:
    """
    Same rule as the Vessels page and the Live Port Map: the vessel's
    status (or, when it has none, its AIS navigation status) says
    "moored" or "berth".
    """

    text = (status or navigation_status or "").lower()

    return "moored" in text or "berth" in text


def _load_moored_vessels(db: Session) -> list[dict]:
    """Moored vessels with a recent, valid AIS position."""

    cutoff = datetime.now(timezone.utc) - timedelta(hours=AIS_MAX_AGE_HOURS)

    # The navigation status column is optional on purpose: if it does not
    # exist, matching still works from the status column alone.
    navigation_column = getattr(Vessel, "ais_navigation_status", None)

    columns = [
        Vessel.mmsi,
        Vessel.vessel_name,
        Vessel.latitude,
        Vessel.longitude,
        Vessel.ais_last_updated_at,
        Vessel.status,
    ]

    conditions = [
        Vessel.status.ilike("%moored%"),
        Vessel.status.ilike("%berth%"),
    ]

    if navigation_column is not None:
        columns.append(navigation_column)
        conditions.append(navigation_column.ilike("%moored%"))
        conditions.append(navigation_column.ilike("%berth%"))

    # The database narrows the list; _is_moored() makes the final decision
    # with exactly the rule the other pages use.
    rows = db.execute(select(*columns).where(or_(*conditions))).all()

    vessels = []

    for row in rows:
        mmsi, name, latitude, longitude, updated_at, status = row[:6]
        navigation_status = row[6] if navigation_column is not None else None

        if not _is_moored(status, navigation_status):
            continue

        seen_at = _as_utc(updated_at)

        if latitude is None or longitude is None:
            continue

        if seen_at is None or seen_at < cutoff:
            continue

        vessels.append(
            {
                "mmsi": str(mmsi),
                "name": name,
                "latitude": float(latitude),
                "longitude": float(longitude),
            }
        )

    return vessels


def _match_vessels_to_berths(
    berths: list[Berth],
    vessels: list[dict],
) -> dict[int, tuple[dict, float]]:
    """
    Pair moored vessels with berths, nearest pairs first, so one vessel
    is never assigned to two berths and one berth gets one vessel.
    """

    pairs = []

    for berth in berths:
        if (
            not berth.is_active
            or berth.status == "maintenance"
            or berth.latitude is None
            or berth.longitude is None
        ):
            continue

        for vessel in vessels:
            distance = _distance_m(
                berth.latitude,
                berth.longitude,
                vessel["latitude"],
                vessel["longitude"],
            )

            if distance <= MATCH_RADIUS_M:
                pairs.append((distance, berth.id, vessel))

    pairs.sort(key=lambda item: item[0])

    matched: dict[int, tuple[dict, float]] = {}
    used_vessels: set[str] = set()

    for distance, berth_id, vessel in pairs:
        if berth_id in matched or vessel["mmsi"] in used_vessels:
            continue

        matched[berth_id] = (vessel, distance)
        used_vessels.add(vessel["mmsi"])

    return matched


# =========================================================
# RESPONSES WITH LIVE OCCUPANCY
# =========================================================

def serialize_berths(
    db: Session,
    berths: list[Berth],
) -> list[BerthResponse]:
    """
    Build API responses. The database is not changed: a berth is shown
    as occupied only while AIS shows a moored vessel at its coordinates.
    """

    matches: dict[int, tuple[dict, float]] = {}
    ais_matching = True

    if berths:
        try:
            matches = _match_vessels_to_berths(
                berths,
                _load_moored_vessels(db),
            )
        except Exception:
            # Never take the berth list down because live matching failed,
            # but never pretend it worked either: ais_matching is False.
            logger.exception("Live berth occupancy check failed")
            db.rollback()
            matches = {}
            ais_matching = False

    responses = []

    for berth in berths:
        response = BerthResponse.model_validate(berth)

        changes = {
            "configured_status": berth.status,
            "ais_matching": ais_matching,
        }

        match = matches.get(berth.id)

        if match is not None:
            vessel, distance = match

            changes.update(
                status="occupied",
                vessel_name=vessel["name"] or f"Vessel {vessel['mmsi']}",
                vessel_mmsi=vessel["mmsi"],
                vessel_distance_m=round(distance),
                occupancy_source="ais",
            )
        elif berth.is_active and berth.status == "occupied":
            changes["occupancy_source"] = "manual"

        responses.append(response.model_copy(update=changes))

    return responses


def serialize_berth(db: Session, berth: Berth) -> BerthResponse:
    return serialize_berths(db, [berth])[0]


# =========================================================
# CRUD
# =========================================================

def _code_exists(
    db: Session,
    berth_code: str,
    exclude_id: int | None = None,
) -> bool:
    statement = select(Berth.id).where(
        func.upper(Berth.berth_code) == berth_code.upper()
    )

    if exclude_id is not None:
        statement = statement.where(Berth.id != exclude_id)

    return db.scalar(statement.limit(1)) is not None


def create_berth(db: Session, berth_data: BerthCreate) -> Berth:
    if _code_exists(db, berth_data.berth_code):
        raise ValueError(
            "A berth with this berth code already exists."
        )

    berth = Berth(**berth_data.model_dump())

    db.add(berth)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError(
            "A berth with this berth code already exists."
        ) from exc

    db.refresh(berth)

    return berth


def get_berth(
    db: Session,
    berth_id: int,
) -> Berth | None:
    return db.get(Berth, berth_id)


def get_berths(db: Session) -> list[Berth]:
    statement = select(Berth).order_by(Berth.berth_code.asc())

    return list(
        db.scalars(statement).all()
    )


def update_berth(
    db: Session,
    berth: Berth,
    berth_data: BerthUpdate,
) -> Berth:

    update_data = berth_data.model_dump(
        exclude_unset=True
    )

    # Required columns can be changed but never cleared.
    for field, label in _REQUIRED_FIELDS.items():
        if field in update_data and update_data[field] is None:
            raise ValueError(f"{label} cannot be empty.")

    if "berth_code" in update_data and _code_exists(
        db,
        update_data["berth_code"],
        exclude_id=berth.id,
    ):
        raise ValueError(
            "A berth with this berth code already exists."
        )

    new_latitude = update_data.get("latitude", berth.latitude)
    new_longitude = update_data.get("longitude", berth.longitude)

    if (new_latitude is None) != (new_longitude is None):
        raise ValueError(
            "Latitude and longitude must be given together."
        )

    for field, value in update_data.items():
        setattr(berth, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError(
            "A berth with this berth code already exists."
        ) from exc

    db.refresh(berth)

    return berth


def delete_berth(
    db: Session,
    berth: Berth,
) -> None:
    db.delete(berth)
    db.commit()
"""
Predictions (Intelligence & Analytics -> Delay Prediction page).

GET /predictions/vessel-delay
    What the "Predict Vessel Delay" tab shows:
      * how much training data has been collected so far;
      * the ML model's real test results (when a model has been trained);
      * ships about to arrive at the Port of Singapore with the ETA they
        reported. Ships already standing still (at anchor or at a berth)
        are left out.

GET /predictions/vessel-delay/estimate?mmsi=...
    The "Predict delay" button for one ship. Two honest ways:
      * when a trained ML model is in use: the model's prediction;
      * before that: a calculation from the ship's LIVE speed and its
        distance to the port (time still needed at that speed, compared
        with the ETA the ship reported). It is labelled as an estimate,
        not as machine learning.
    Nothing is made up: without a recent live position, no estimate.

GET /predictions/berth-congestion
    What the "Predict Berth Congestion" tab shows: ships in port waters
    right now (live AISStream feed), the last 48 hourly snapshots, how
    much training data exists, and the model's test results.

GET /predictions/berth-congestion/forecast
    The "Predict congestion" button: expected ships in port 6, 12 and
    24 hours from now. The trained ML model for each time ahead that has
    one; otherwise the trend of the last hours (arrivals - departures),
    labelled as not machine learning.

POST /predictions/cargo-throughput
    The "Predict Cargo Throughput" tab. It sends the cargo and container
    figures imported on the Cargo Operations page (kept in the browser);
    the answer has, for each series, the test results and the forecast
    (next 12 months, or next 3 years for yearly figures). No CSVs ->
    "No CSVs uploaded, please upload CSV."

Protected in app/main.py with the "analytics" feature.
"""

import logging
from typing import Literal
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.ml import berth_congestion as bc
from app.ml import cargo_throughput as ct
from app.ml import vessel_delay as vd
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predictions", tags=["Predictions"])

# A live position older than this is not used for an estimate.
LIVE_MAX_AGE_MINUTES = 30
# Below this speed a ship counts as standing still (at anchor / berth).
STOPPED_KNOTS = 0.5
# Below this speed the time still needed is too uncertain to estimate.
MIN_ESTIMATE_KNOTS = 2.0

ESTIMATE_METHOD = "Live speed and distance"
ESTIMATE_NOTE = (
    "Calculated from the ship's live speed and its straight-line distance "
    "to the port (Singapore Strait off the city terminals). The real route "
    "can be longer, so treat it as an estimate. This is not the machine-"
    "learning model; the model replaces it once it is trained."
)


def _iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat(timespec="seconds")
    return value


def _utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _collector_status() -> dict:
    try:
        from app.services.aisstream_collector import get_aisstream_status

        s = get_aisstream_status()
        return {
            "running": s.get("running"),
            "connected": s.get("connected"),
            "last_message_at": _iso(s.get("last_message_at")),
            "last_error": s.get("last_error"),
        }
    except Exception:
        return {"running": False, "connected": False,
                "last_message_at": None, "last_error": None}


def _live(mmsi: str, now: datetime) -> dict | None:
    """
    The ship's newest position from the live AISStream feed (kept in the
    collector's memory), or None when there is none in the last
    LIVE_MAX_AGE_MINUTES. Returns at, latitude, longitude, speed, stopped.
    """

    try:
        from app.services import aisstream_collector as feed

        ship = feed._ships.get(str(mmsi))
    except Exception:
        return None

    if not ship or not ship.get("position"):
        return None

    at, lat, lon, speed, _status = ship["position"]
    at = _utc(at)
    if now - at > timedelta(minutes=LIVE_MAX_AGE_MINUTES):
        return None

    stopped = bool(ship.get("stopped")) or (
        speed is not None and speed < STOPPED_KNOTS
    )
    return {"at": at, "latitude": lat, "longitude": lon,
            "speed": speed, "stopped": stopped}


def _already_stopped(row: dict, live: dict | None) -> bool:
    """At anchor or at a berth right now (or when it last reported)."""

    if live is not None:
        return live["stopped"]

    status_text = (row.get("navigation_status") or "").lower()
    speed = row.get("speed_knots")
    return (
        "anchor" in status_text
        or "moored" in status_text
        or (speed is not None and speed < STOPPED_KNOTS)
    )


def _model_state():
    """(model or None, error text or None)."""

    try:
        return vd.load_model(), None
    except vd.MLPackagesMissing as exc:
        return None, str(exc)
    except Exception as exc:
        logger.exception("Vessel delay: model could not be loaded")
        return None, (
            "The saved model could not be used "
            f"({type(exc).__name__}). Run the training script again."
        )


def _load(db: Session, with_counts: bool = True):
    try:
        connection = db.connection()
        counts = vd.load_counts(connection) if with_counts else {}
        return counts, vd.load_current_rows(connection)
    except SQLAlchemyError as exc:
        logger.exception("Vessel delay: database error")
        message = str(exc).splitlines()[0] if str(exc) else ""
        detail = (
            "The tables for the delay prediction are missing or incomplete. "
            "Run the ETA collector SQL scripts in the Supabase SQL Editor."
            if "does not exist" in message
            else "Could not read the collected data from the database."
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=detail) from exc


def _about_to_arrive(rows: list[dict], now: datetime):
    """Ships still on their way in. Returns (ships, number left out)."""

    ships, stopped = [], 0
    for row in rows:
        live = _live(row["mmsi"], now)
        if _already_stopped(row, live):
            stopped += 1
            continue
        ships.append((row, live))
    return ships, stopped


def _ship_json(row: dict, live: dict | None) -> dict:
    lat = live["latitude"] if live else row["latitude"]
    lon = live["longitude"] if live else row["longitude"]
    distance = vd.distance_nm(lat, lon)
    return {
        "mmsi": row["mmsi"],
        "vessel_name": row["vessel_name"],
        "destination": row["destination"],
        "reported_eta": _iso(row["eta"]),
        "reported_at": _iso(row["reported_at"]),
        "speed_knots": live["speed"] if live else row["speed_knots"],
        "distance_nm": round(distance, 1) if distance is not None else None,
        "live_position_at": _iso(live["at"]) if live else None,
    }


@router.get("/vessel-delay")
def vessel_delay(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    counts, current = _load(db)
    now = datetime.now(timezone.utc)

    metrics = vd.load_metrics()
    model, model_error = _model_state()
    in_use = model is not None and not model_error

    if in_use:
        state = "ready"
    elif metrics and metrics.get("status") == "not_better_than_eta":
        state = "not_better_than_eta"
    else:
        state = "not_trained"

    model_info = None
    if metrics and metrics.get("status") in ("trained", "not_better_than_eta"):
        model_info = {k: metrics.get(k) for k in (
            "status", "trained_at", "best_model", "train_arrivals",
            "test_arrivals", "test_from", "baseline_mae_minutes",
            "mean_delay_mae_minutes", "best_mae_minutes", "improvement_percent",
            "models", "feature_importance", "average_delay_minutes",
            "late_share_percent", "xgboost_available",
            "required_improvement_percent", "features_skipped_no_data",
        )}

    ships, stopped = _about_to_arrive(current, now)

    return {
        "success": True,
        "state": state,
        "model_error": model_error,
        "records_found": int(counts.get("usable_arrivals") or 0),
        "records_needed": vd.MIN_RECORDS,
        "collection": {
            "eta_reports": int(counts.get("eta_reports") or 0),
            "eta_reports_24h": int(counts.get("eta_reports_24h") or 0),
            "arrivals": int(counts.get("arrivals") or 0),
            "arrivals_24h": int(counts.get("arrivals_24h") or 0),
            "first_eta_report": _iso(counts.get("first_eta_report")),
            "collector": _collector_status(),
        },
        "model": model_info,
        "late_minutes": vd.LATE_MINUTES,
        "prediction_method": (
            model_info["best_model"] if in_use and model_info else ESTIMATE_METHOD
        ),
        "ships": [_ship_json(row, live) for row, live in ships],
        "ships_left_out_stopped": stopped,
        "generated_at": _iso(now),
    }


@router.get("/vessel-delay/estimate")
def vessel_delay_estimate(
    mmsi: str = Query(..., min_length=9, max_length=9, pattern=r"^\d{9}$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _counts, current = _load(db, with_counts=False)
    now = datetime.now(timezone.utc)

    row = next((r for r in current if str(r["mmsi"]) == mmsi), None)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "This ship has no current ETA for Singapore any more "
                "(it may have arrived). Press Refresh."
            ),
        )

    live = _live(mmsi, now)
    if _already_stopped(row, live):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This ship is already standing still (at anchor or at a berth).",
        )

    eta = _utc(row["eta"])
    base = {
        **_ship_json(row, live),
        "checked_at": _iso(now),
    }

    # 1. The trained machine-learning model, when one is in use.
    model, model_error = _model_state()
    if model is not None and not model_error:
        result = vd.predict([row])
        if result:
            p = result[0]
            metrics = vd.load_metrics() or {}
            return {
                **base,
                "available": True,
                "method": metrics.get("best_model") or "Machine-learning model",
                "is_ml": True,
                "expected_arrival": p["predicted_arrival"],
                "delay_minutes": p["predicted_delay_minutes"],
                "risk": p["risk"],
                "reason": p["main_reason"],
                "note": (
                    "Predicted by the trained machine-learning model "
                    f"(average error {metrics.get('best_mae_minutes')} min on "
                    "arrivals it had not seen)."
                ),
            }

    # 2. Before the model is trained: live speed and distance.
    if live is None:
        return {
            **base,
            "available": False,
            "method": ESTIMATE_METHOD,
            "is_ml": False,
            "reason": (
                "No live position from this ship in the last "
                f"{LIVE_MAX_AGE_MINUTES} minutes, so its delay cannot be "
                "worked out right now. Try again in a few minutes."
            ),
            "note": ESTIMATE_NOTE,
        }

    speed = live["speed"]
    distance = vd.distance_nm(live["latitude"], live["longitude"])
    if speed is None or speed < MIN_ESTIMATE_KNOTS or distance is None:
        return {
            **base,
            "available": False,
            "method": ESTIMATE_METHOD,
            "is_ml": False,
            "reason": (
                f"The ship is moving very slowly ({speed:.1f} knots), so the "
                "time it still needs cannot be worked out reliably."
                if speed is not None
                else "The ship did not report its speed."
            ),
            "note": ESTIMATE_NOTE,
        }

    hours_needed = distance / speed
    expected = live["at"] + timedelta(hours=hours_needed)
    delay = (expected - eta).total_seconds() / 60

    return {
        **base,
        "available": True,
        "method": ESTIMATE_METHOD,
        "is_ml": False,
        "expected_arrival": _iso(expected),
        "delay_minutes": round(delay),
        "risk": vd.risk_of(delay),
        "reason": (
            f"{distance:.1f} nautical miles to go at {speed:.1f} knots = about "
            f"{hours_needed * 60:.0f} minutes from its position at "
            f"{live['at'].astimezone(vd.SGT):%H:%M} SGT."
        ),
        "note": ESTIMATE_NOTE,
    }


# =========================================================
# PREDICT BERTH CONGESTION (port crowding)
# =========================================================

TREND_METHOD = "Trend of the last hours"
TREND_NOTE = (
    "Ships in port now plus the recent difference between arrivals and "
    "departures, carried forward. This is a simple calculation, not the "
    "machine-learning model; the model replaces it once it is trained."
)

_WINDOW_SQL = """
SELECT
    count(*) FILTER (WHERE event_type = 'Arrival')   AS arrivals,
    count(*) FILTER (WHERE event_type = 'Departure') AS departures
  FROM port_call_events
 WHERE occurred_at > :since AND occurred_at <= :now
"""


def _feed():
    from app.services import aisstream_collector as feed

    return feed


def _congestion_db(work):
    try:
        return work()
    except SQLAlchemyError as exc:
        logger.exception("Berth congestion: database error")
        message = str(exc).splitlines()[0] if str(exc) else ""
        detail = (
            "The table for the berth congestion prediction is missing. Run "
            "the port congestion SQL script in the Supabase SQL Editor."
            if "does not exist" in message
            else "Could not read the collected data from the database."
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=detail) from exc


def _congestion_model():
    try:
        return bc.load_model(), None
    except bc.MLPackagesMissing as exc:
        return None, str(exc)
    except Exception as exc:
        logger.exception("Berth congestion: model could not be loaded")
        return None, (
            "The saved model could not be used "
            f"({type(exc).__name__}). Run the training script again."
        )


def _live_counts(now: datetime) -> dict:
    try:
        live = _feed().live_port_counts(now)
    except Exception:
        logger.exception("Berth congestion: live counts failed")
        return {"available": False,
                "reason": "The live AIS feed could not be read."}
    live = dict(live)
    if "counted_at" in live:
        live["counted_at"] = _iso(live["counted_at"])
    return live


@router.get("/berth-congestion")
def berth_congestion(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)

    def read():
        connection = db.connection()
        return bc.load_counts(connection), bc.load_recent(connection, 48)

    counts, recent = _congestion_db(read)
    levels = bc.levels_from(counts)

    metrics = bc.load_metrics()
    model, model_error = _congestion_model()
    in_use = sorted(int(h) for h in (model or {}).get("horizons", {}))

    if in_use and not model_error:
        state = "ready"
    elif metrics and metrics.get("status") == "not_better_than_baseline":
        state = "not_better_than_baseline"
    else:
        state = "not_trained"

    live = _live_counts(now)
    if live.get("available"):
        live["level"] = bc.level_of(live["ships_in_port"], levels)

    return {
        "success": True,
        "state": state,
        "model_error": model_error,
        "records_needed": bc.MIN_RECORDS,
        "records": [
            {"hours_ahead": h, "found": int(counts.get(f"pairs_{h}h") or 0)}
            for h in bc.HORIZONS
        ],
        "collection": {
            "snapshots": int(counts.get("snapshots") or 0),
            "snapshots_24h": int(counts.get("snapshots_24h") or 0),
            "first_snapshot": _iso(counts.get("first_snapshot")),
            "last_snapshot": _iso(counts.get("last_snapshot")),
            "collector": _collector_status(),
        },
        "now": live,
        "levels": levels,
        "levels_needed_snapshots": bc.MIN_LEVEL_SNAPSHOTS,
        "history": [
            {
                "taken_at": _iso(r["taken_at"]),
                "ships_in_port": r["ships_in_port"],
                "at_anchor": r["at_anchor"],
                "at_berth": r["at_berth"],
                "stopped_other": r["stopped_other"],
                "underway": r["underway"],
            }
            for r in recent
        ],
        "model": (
            {
                "status": metrics.get("status"),
                "trained_at": metrics.get("trained_at"),
                "snapshots": metrics.get("snapshots"),
                "required_improvement_percent": metrics.get("required_improvement_percent"),
                "xgboost_available": metrics.get("xgboost_available"),
                "horizons": metrics.get("horizons", []),
                "in_use_hours": in_use if not model_error else [],
            }
            if metrics and metrics.get("status") in ("trained", "not_better_than_baseline")
            else None
        ),
        "generated_at": _iso(now),
    }


@router.get("/berth-congestion/forecast")
def berth_congestion_forecast(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    feed = _feed()

    live = _live_counts(now)
    if not live.get("available"):
        return {
            "available": False,
            "reason": live.get("reason") or "The ships in port cannot be counted right now.",
            "checked_at": _iso(now),
        }

    counts = feed.port_counts(now)
    hours_connected = float(live.get("feed_hours") or 0)
    window = round(min(float(bc.TREND_WINDOW_HOURS), hours_connected), 1)

    def read():
        connection = db.connection()
        extra = feed.due_and_moves(db, now, counts["stopped_mmsis"])
        moved = db.execute(
            text(_WINDOW_SQL), {"since": now - timedelta(hours=window), "now": now}
        ).mappings().one()
        before = bc.count_near(connection, now - timedelta(hours=6))
        level_counts = bc.load_counts(connection)
        return extra, moved, before, level_counts

    extra, moved, before, level_counts = _congestion_db(read)
    levels = bc.levels_from(level_counts)

    row = {
        "taken_at": now,
        "ships_in_port": counts["ships_in_port"],
        "at_anchor": counts["at_anchor"],
        "at_berth": counts["at_berth"],
        "stopped_other": counts["stopped_other"],
        "underway": counts["underway"],
        **extra,
    }

    model, model_error = _congestion_model()
    ml = {}
    if model is not None and not model_error:
        try:
            ml = bc.predict(row, before)
        except Exception:
            logger.exception("Berth congestion: model prediction failed")
            ml = {}
    metrics = bc.load_metrics() or {}
    errors = {h.get("hours_ahead"): h.get("best_mae_ships")
              for h in metrics.get("horizons", [])}

    arrivals = int(moved["arrivals"] or 0)
    departures = int(moved["departures"] or 0)
    now_count = counts["ships_in_port"]

    forecasts = []
    for hours in bc.HORIZONS:
        item = {
            "hours_ahead": hours,
            "at": _iso(now + timedelta(hours=hours)),
            "due_by_eta": extra[f"due_{hours}h"],
        }
        if hours in ml:
            expected = round(ml[hours])
            item.update(
                available=True, is_ml=True,
                method=model["horizons"][hours]["model_name"],
                expected_ships=expected,
                note=(
                    "Predicted by the trained machine-learning model "
                    f"(average error {errors.get(hours)} ships on hours it had not seen)."
                ),
            )
        elif window >= bc.MIN_TREND_HOURS:
            value = bc.trend_estimate(now_count, arrivals, departures, window, hours)
            expected = round(value)
            item.update(
                available=True, is_ml=False, method=TREND_METHOD,
                expected_ships=expected,
                note=(
                    f"{now_count} ships now; in the last {window:g} h "
                    f"{arrivals} arrived and {departures} left "
                    f"({(arrivals - departures) / window:+.1f} per hour), "
                    f"carried forward {hours} h."
                ),
            )
        else:
            item.update(
                available=False, is_ml=False, method=TREND_METHOD,
                note=(
                    "The trend needs arrivals and departures from at least "
                    f"{bc.MIN_TREND_HOURS:g} hour of live feed; the feed has "
                    f"been connected for {int(window * 60)} minutes. Try again later."
                ),
            )
        if item["available"]:
            item["change"] = item["expected_ships"] - now_count
            item["level"] = bc.level_of(item["expected_ships"], levels)
        forecasts.append(item)

    return {
        "available": True,
        "checked_at": _iso(now),
        "now": {
            "ships_in_port": now_count,
            "at_anchor": counts["at_anchor"],
            "at_berth": counts["at_berth"],
            "stopped_other": counts["stopped_other"],
            "underway": counts["underway"],
            "level": bc.level_of(now_count, levels),
        },
        "trend": {"window_hours": window, "arrivals": arrivals, "departures": departures},
        "levels": levels,
        "forecasts": forecasts,
        "trend_note": TREND_NOTE,
    }


# =========================================================
# PREDICT CARGO THROUGHPUT (the CSVs imported on Cargo Operations)
# =========================================================


class ThroughputPoint(BaseModel):
    period: str = Field(max_length=10)
    value: float


class ThroughputSeries(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    unit: str = Field(default="", max_length=60)
    frequency: Literal["monthly", "yearly"]
    source: str = Field(default="", max_length=200)
    points: list[ThroughputPoint] = Field(default_factory=list, max_length=1200)


class ThroughputRequest(BaseModel):
    series: list[ThroughputSeries] = Field(default_factory=list, max_length=40)


@router.post("/cargo-throughput")
def cargo_throughput(
    data: ThroughputRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Forecasts for every series the Cargo Operations page has imported
    (the page keeps the CSVs in the browser and sends them here). Each
    series is trained and tested by itself the first time its figures are
    seen (a few seconds), then the saved result is reused.
    No series -> "No CSVs uploaded, please upload CSV."
    """

    try:
        result = ct.analyse_all([item.model_dump() for item in data.series])
    except Exception:
        logger.exception("Cargo throughput: prediction failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The cargo throughput forecast could not be worked out. Try again.",
        )
    return {**result, "generated_at": _iso(datetime.now(timezone.utc))}



# =========================================================
# PREDICT EQUIPMENT FAILURE (Asset & Maintenance records)
# =========================================================

from datetime import datetime as _ef_datetime, timezone as _ef_timezone

from fastapi import Depends as _ef_Depends, HTTPException as _ef_HTTPException
from sqlalchemy.exc import SQLAlchemyError as _ef_SQLAlchemyError
from sqlalchemy.orm import Session as _ef_Session

from app.api.dependencies import get_current_user as _ef_get_current_user, get_db as _ef_get_db
from app.ml import equipment_failure as ef
from app.models.user import User as _ef_User


@router.get("/equipment-failure")
def equipment_failure(
    db: _ef_Session = _ef_Depends(_ef_get_db),
    current_user: _ef_User = _ef_Depends(_ef_get_current_user),
):
    """Every asset with its maintenance risk and, once trained, the chance of a breakdown in 30 days."""

    try:
        result = ef.analyse(db)
    except _ef_SQLAlchemyError as exc:
        logging.getLogger(__name__).exception("Equipment failure: database error")
        raise _ef_HTTPException(
            status_code=500,
            detail="Could not read the Asset & Maintenance records from the database.",
        ) from exc

    return {
        **result,
        "generated_at": _ef_datetime.now(_ef_timezone.utc).isoformat(timespec="seconds"),
    }
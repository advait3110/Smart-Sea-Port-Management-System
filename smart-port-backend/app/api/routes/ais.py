import asyncio
from datetime import date, datetime, time, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.ais_position_history import AISPositionHistory
from app.models.user import User
from app.services.ais_service import (
    AISConfigurationError,
    AISProviderError,
    get_ais_listener_status,
    start_ais_background_listener,
    stop_ais_background_listener,
    synchronize_ais_vessels,
)
from app.services.port_events_service import (
    MAX_DESTINATION_LOOKUPS,
    fetch_declared_destinations,
    fetch_port_events,
)

logger = logging.getLogger(__name__)

# Singapore is fixed UTC+8 with no daylight saving. A fixed offset avoids
# needing tzdata on Windows. The history date range is read as Singapore
# calendar days, matching the dates shown on the Vessels page.
PORT_TIMEZONE = timezone(timedelta(hours=8))

router = APIRouter(prefix="/ais", tags=["AIS"])

# A ship counts as "stopped" (at a berth or at anchor) on a day when
# one of its stored positions that day reports a speed below this.
STOPPED_BELOW_KNOTS = 0.5

SECONDS_PER_DAY = 24 * 60 * 60

SINGAPORE_OFFSET_SECONDS = 8 * 60 * 60


@router.post("/start")
async def start_ais_listener(
    current_user: User = Depends(get_current_user),
):
    """Start the background AIS polling task."""
    try:
        return start_ais_background_listener()
    except AISConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Unable to start AIS listener")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to start AIS listener: {type(exc).__name__}",
        ) from exc


@router.post("/stop")
async def stop_ais_listener(
    current_user: User = Depends(get_current_user),
):
    """Stop the background AIS polling task."""
    try:
        await stop_ais_background_listener()
        return {
            "success": True,
            "message": "AIS background listener stopped.",
        }
    except Exception as exc:
        logger.exception("Unable to stop AIS listener")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to stop AIS listener: {type(exc).__name__}",
        ) from exc


@router.get("/status")
async def ais_listener_status(
    current_user: User = Depends(get_current_user),
):
    """Return listener state and the most recent synchronization counters."""
    try:
        return {
            "success": True,
            **get_ais_listener_status(),
        }
    except Exception as exc:
        logger.exception("Unable to retrieve AIS status")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to retrieve AIS status: {type(exc).__name__}",
        ) from exc


@router.post("/sync")
async def sync_ais_vessels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch provider positions, validate them, and save them."""
    try:
        result = await synchronize_ais_vessels(db)
        return result

    except AISConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    except AISProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    except SQLAlchemyError as exc:
        logger.exception("Database failure during AIS synchronization")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AIS synchronization failed while saving database records.",
        ) from exc

    except Exception as exc:
        logger.exception("Unexpected AIS synchronization failure")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AIS synchronization failed: {type(exc).__name__}",
        ) from exc


@router.get("/port-events")
async def get_port_events(
    hours: int = Query(default=24, ge=1, le=168),
    current_user: User = Depends(get_current_user),
):
    """
    Arrivals and departures at the configured port (SGSIN by default),
    as two separate lists.

    Arrivals carry from_port (the port the vessel last departed from).
    Departures carry to_port (the destination the vessel declares over
    AIS). Either is null when the provider has no answer.
    """
    try:
        return await asyncio.to_thread(fetch_port_events, hours)

    except AISConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    except AISProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Unexpected error retrieving port events")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to retrieve port events: {type(exc).__name__}",
        ) from exc


@router.get("/destinations")
async def get_declared_destinations(
    mmsi: list[str] = Query(default=[]),
    current_user: User = Depends(get_current_user),
):
    """
    The destination each listed vessel declares over AIS (repeat the mmsi
    parameter, up to MAX_DESTINATION_LOOKUPS times). A vessel that
    declares nothing has a null destination; a vessel whose lookup failed
    is left out and explained in warnings.
    """
    if len(mmsi) > MAX_DESTINATION_LOOKUPS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"At most {MAX_DESTINATION_LOOKUPS} vessels can be "
                "looked up at once."
            ),
        )

    try:
        return await asyncio.to_thread(fetch_declared_destinations, mmsi)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except AISConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    except AISProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Unexpected error retrieving declared destinations")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to retrieve destinations: {type(exc).__name__}",
        ) from exc


@router.get("/history")
def get_ais_history(
    start_date: date,
    end_date: date,
    mmsi: str | None = Query(default=None, min_length=1, max_length=20),
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return stored AIS position snapshots for an inclusive date range,
    where each date is a Singapore (UTC+8) calendar day.
    """

    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )

    # Prevent accidentally expensive historical queries.
    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The date range cannot exceed 366 days.",
        )

    start_datetime = datetime.combine(
        start_date,
        time.min,
        tzinfo=PORT_TIMEZONE,
    )
    end_datetime = datetime.combine(
        end_date + timedelta(days=1),
        time.min,
        tzinfo=PORT_TIMEZONE,
    )

    statement = (
        select(AISPositionHistory)
        .where(AISPositionHistory.recorded_at >= start_datetime)
        .where(AISPositionHistory.recorded_at < end_datetime)
    )

    normalized_mmsi = mmsi.strip() if mmsi else None
    if normalized_mmsi:
        statement = statement.where(
            AISPositionHistory.mmsi == normalized_mmsi
        )

    statement = (
        statement
        .order_by(AISPositionHistory.recorded_at.desc())
        .limit(limit)
    )

    try:
        records = db.scalars(statement).all()

        return {
            "success": True,
            "count": len(records),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "mmsi": normalized_mmsi,
            "records": [
                {
                    "id": record.id,
                    "mmsi": record.mmsi,
                    "vessel_name": record.vessel_name,
                    "latitude": record.latitude,
                    "longitude": record.longitude,
                    "speed_knots": record.speed_knots,
                    "course_deg": record.course_deg,
                    "heading_deg": record.heading_deg,
                    "ais_source": record.ais_source,
                    "recorded_at": record.recorded_at,
                }
                for record in records
            ],
        }

    except SQLAlchemyError as exc:
        logger.exception("Database error retrieving AIS history")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve vessel history from the database.",
        ) from exc

    except Exception as exc:
        logger.exception("Unexpected error retrieving AIS history")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to retrieve vessel history: {type(exc).__name__}",
        ) from exc


@router.get("/traffic")
def get_ais_traffic(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ships seen by the tracking system on each Singapore (UTC+8)
    calendar day of an inclusive date range, counted from the stored
    AIS positions.

    For every day that has at least one stored position:
      ships       different ships with a stored position that day
      stationary  different ships that reported a speed below
                  0.5 knots at least once that day

    Days without any stored position are left out (they are not
    reported as zero, because the tracking may simply not have been
    running).
    """

    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )

    if (end_date - start_date).days > 366:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The date range cannot exceed 366 days.",
        )

    start_datetime = datetime.combine(
        start_date,
        time.min,
        tzinfo=PORT_TIMEZONE,
    )
    end_datetime = datetime.combine(
        end_date + timedelta(days=1),
        time.min,
        tzinfo=PORT_TIMEZONE,
    )

    # Whole days since 1 Jan 1970 in Singapore time. Working with the
    # epoch seconds gives the same answer whether the column keeps a
    # time zone or not. Only numbers from this file are written into
    # the text (the names of the table and its columns come from the
    # model); the dates travel as separate values.
    table = AISPositionHistory.__table__.name

    columns = AISPositionHistory.__table__.c

    recorded_at_column = columns.recorded_at.name

    mmsi_column = columns.mmsi.name

    speed_column = columns.speed_knots.name

    statement = text(
        f"""
        SELECT
            CAST(
                floor(
                    (extract(epoch FROM "{recorded_at_column}")
                        + {int(SINGAPORE_OFFSET_SECONDS)})
                    / {int(SECONDS_PER_DAY)}
                ) AS INTEGER
            ) AS day_number,
            count(DISTINCT "{mmsi_column}") AS ships,
            count(
                DISTINCT CASE
                    WHEN "{speed_column}" < {float(STOPPED_BELOW_KNOTS)}
                    THEN "{mmsi_column}"
                END
            ) AS stationary
        FROM "{table}"
        WHERE "{recorded_at_column}" >= :start_at
          AND "{recorded_at_column}" < :end_at
        GROUP BY 1
        ORDER BY 1
        """
    )

    try:
        rows = db.execute(
            statement,
            {"start_at": start_datetime, "end_at": end_datetime},
        ).all()

        epoch = date(1970, 1, 1)

        return {
            "success": True,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": [
                {
                    "date": (
                        epoch + timedelta(days=int(row.day_number))
                    ).isoformat(),
                    "ships": int(row.ships),
                    "stationary": int(row.stationary),
                }
                for row in rows
            ],
        }

    except SQLAlchemyError as exc:
        logger.exception("Database error retrieving AIS traffic")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve vessel traffic from the database.",
        ) from exc

    except Exception as exc:
        logger.exception("Unexpected error retrieving AIS traffic")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to retrieve vessel traffic: {type(exc).__name__}",
        ) from exc
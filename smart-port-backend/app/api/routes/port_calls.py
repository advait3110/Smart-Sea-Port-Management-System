from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.port_call_event import PortCallEvent
from app.models.user import User
from app.services.port_call_service import (
    PortCallConfigurationError,
    PortCallProviderError,
    synchronize_karwar_port_calls,
)

router = APIRouter(prefix="/port-calls", tags=["Port Call History"])


@router.post("/sync")
def sync_port_calls(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch and persist Karwar port-call events from VesselAPI."""
    try:
        return synchronize_karwar_port_calls(db)
    except PortCallConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PortCallProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while saving port-call events.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Port-call synchronization failed: {type(exc).__name__}",
        ) from exc


@router.get("")
def list_port_calls(
    start_date: date | None = None,
    end_date: date | None = None,
    event_type: str | None = Query(
        default=None, pattern="^(arrival|departure)$"
    ),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List stored Karwar port-call events, newest first."""
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date.",
        )

    statement = select(PortCallEvent).where(
        PortCallEvent.unlocode == "INKRW"
    )

    if start_date:
        start = datetime.combine(
            start_date, time.min, tzinfo=timezone.utc
        )
        statement = statement.where(
            PortCallEvent.event_timestamp >= start
        )

    if end_date:
        end_exclusive = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        )
        statement = statement.where(
            PortCallEvent.event_timestamp < end_exclusive
        )

    if event_type:
        statement = statement.where(
            PortCallEvent.event_type == event_type
        )

    statement = statement.order_by(
        PortCallEvent.event_timestamp.desc()
    ).limit(limit)

    try:
        rows = db.scalars(statement).all()
        return {
            "success": True,
            "port": "INKRW",
            "count": len(rows),
            "events": [
                {
                    "id": row.id,
                    "event_key": row.event_key,
                    "event_type": row.event_type,
                    "event_timestamp": row.event_timestamp,
                    "mmsi": row.mmsi,
                    "imo_number": row.imo_number,
                    "vessel_name": row.vessel_name,
                    "port_name": row.port_name,
                    "port_country": row.port_country,
                    "unlocode": row.unlocode,
                    "source": row.source,
                    "fetched_at": row.fetched_at,
                }
                for row in rows
            ],
        }
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve port-call events.",
        ) from exc
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.weather_service import (
    WeatherProviderError,
    WeatherRequestError,
    get_weather_data,
    get_weather_history,
)


logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/weather",
    tags=["Weather"],
)


# =========================================================
# LIVE WEATHER AND MARINE CONDITIONS
# =========================================================

@router.get("")
async def get_port_weather(
    current_user: User = Depends(get_current_user),
):
    """
    Get live weather and marine conditions
    for Port of Singapore from Open-Meteo.
    """

    try:
        return await get_weather_data()

    except WeatherProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Weather endpoint error")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve weather data.",
        ) from exc


# =========================================================
# WEATHER AND MARINE HISTORY
# =========================================================

@router.get("/history")
async def get_port_weather_history(
    start_date: date = Query(
        ...,
        description="First day, YYYY-MM-DD (Singapore date).",
    ),
    end_date: date = Query(
        ...,
        description="Last day, YYYY-MM-DD (Singapore date).",
    ),
    current_user: User = Depends(get_current_user),
):
    """
    Past weather and marine conditions for Port of Singapore,
    one row per day, for up to 31 days at a time.
    """

    try:
        return await get_weather_history(start_date, end_date)

    except WeatherRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except WeatherProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Weather history endpoint error")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve weather history.",
        ) from exc
import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

import httpx


logger = logging.getLogger(__name__)


# =========================================================
# OPEN-METEO CONFIGURATION
# =========================================================

# Port of Singapore coordinates
SINGAPORE_PORT_LATITUDE = 1.265
SINGAPORE_PORT_LONGITUDE = 103.8

PORT_LOCATION_NAME = "Port of Singapore"

PORT_TIMEZONE = "Asia/Singapore"

# Singapore does not use daylight saving, so it is always UTC+8.
# A fixed offset avoids needing the tzdata package on Windows.
PORT_UTC_OFFSET = timezone(timedelta(hours=8))


WEATHER_API_URL = (
    "https://api.open-meteo.com/v1/forecast"
)


MARINE_API_URL = (
    "https://marine-api.open-meteo.com/v1/marine"
)


# Past days (reanalysis archive)
ARCHIVE_API_URL = (
    "https://archive-api.open-meteo.com/v1/archive"
)


REQUEST_TIMEOUT = 20.0


# History limits. Keep MAX_HISTORY_DAYS in sync with the
# Weather page (src/views/admin/Weather/index.jsx).
MAX_HISTORY_DAYS = 31

MIN_HISTORY_DATE = date(1940, 1, 1)


# =========================================================
# CUSTOM EXCEPTIONS
# =========================================================

class WeatherProviderError(Exception):
    """Raised when Open-Meteo cannot provide valid data."""

    pass


class WeatherRequestError(Exception):
    """Raised when the caller asks for an invalid date range."""

    pass


# =========================================================
# WEATHER PARAMETERS
# =========================================================

WEATHER_CURRENT_VARIABLES = (
    "temperature_2m,"
    "relative_humidity_2m,"
    "apparent_temperature,"
    "weather_code,"
    "wind_speed_10m,"
    "wind_direction_10m,"
    "visibility,"
    "precipitation,"
    "pressure_msl"
)


WEATHER_HOURLY_VARIABLES = (
    "temperature_2m,"
    "precipitation_probability,"
    "wind_speed_10m,"
    "wind_direction_10m"
)


WEATHER_DAILY_VARIABLES = (
    "weather_code,"
    "temperature_2m_max,"
    "temperature_2m_min,"
    "precipitation_probability_max"
)


# Daily values for past days (the archive has no probabilities).
HISTORY_DAILY_VARIABLES = (
    "weather_code,"
    "temperature_2m_max,"
    "temperature_2m_min,"
    "precipitation_sum,"
    "wind_speed_10m_max,"
    "wind_gusts_10m_max"
)


# =========================================================
# MARINE PARAMETERS
# =========================================================

MARINE_CURRENT_VARIABLES = (
    "wave_height,"
    "wave_direction,"
    "wave_period,"
    "swell_wave_height,"
    "swell_wave_direction,"
    "swell_wave_period,"
    "sea_surface_temperature,"
    "ocean_current_velocity,"
    "ocean_current_direction,"
    "sea_level_height_msl"
)


MARINE_HOURLY_VARIABLES = (
    "wave_height,"
    "wave_direction,"
    "wave_period,"
    "swell_wave_height,"
    "swell_wave_direction,"
    "swell_wave_period,"
    "sea_surface_temperature,"
    "ocean_current_velocity,"
    "ocean_current_direction,"
    "sea_level_height_msl"
)


# Hourly marine values used to build the daily history maximums.
MARINE_HISTORY_HOURLY_VARIABLES = (
    "wave_height,"
    "ocean_current_velocity"
)


# =========================================================
# SHARED HTTP HELPER
# =========================================================

def _provider_reason(response: httpx.Response) -> str:
    """Open-Meteo explains a 400 in the JSON body; pass it on."""

    try:
        body = response.json()
    except ValueError:
        return ""

    if isinstance(body, dict) and body.get("reason"):
        return f" ({body['reason']})"

    return ""


async def _get_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    label: str,
) -> dict:
    """
    GET one Open-Meteo endpoint and return its JSON object.
    Every failure becomes a WeatherProviderError with a clear
    message (nothing is hidden or replaced with made-up data).
    """

    try:
        response = await client.get(url, params=params)

        response.raise_for_status()

        data = response.json()

    except httpx.TimeoutException as exc:
        raise WeatherProviderError(
            f"Open-Meteo {label} request timed out."
        ) from exc

    except httpx.HTTPStatusError as exc:
        raise WeatherProviderError(
            f"Open-Meteo {label} API returned "
            f"HTTP {exc.response.status_code}"
            f"{_provider_reason(exc.response)}."
        ) from exc

    except httpx.RequestError as exc:
        raise WeatherProviderError(
            f"Unable to connect to the Open-Meteo {label} API."
        ) from exc

    except ValueError as exc:
        raise WeatherProviderError(
            f"Open-Meteo returned invalid {label} JSON."
        ) from exc

    if not isinstance(data, dict):
        raise WeatherProviderError(
            f"Open-Meteo returned an invalid {label} response."
        )

    if data.get("error"):
        raise WeatherProviderError(
            data.get(
                "reason",
                f"Open-Meteo {label} API returned an error.",
            )
        )

    return data


# =========================================================
# FETCH OPEN-METEO WEATHER DATA
# =========================================================

async def fetch_weather_data(
    client: httpx.AsyncClient,
):
    params = {
        "latitude": SINGAPORE_PORT_LATITUDE,
        "longitude": SINGAPORE_PORT_LONGITUDE,
        "current": WEATHER_CURRENT_VARIABLES,
        "hourly": WEATHER_HOURLY_VARIABLES,
        "daily": WEATHER_DAILY_VARIABLES,
        "forecast_days": 7,
        "timezone": PORT_TIMEZONE,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }

    return await _get_json(
        client,
        WEATHER_API_URL,
        params,
        "weather",
    )


# =========================================================
# FETCH OPEN-METEO MARINE DATA
# =========================================================

async def fetch_marine_data(
    client: httpx.AsyncClient,
):
    params = {
        "latitude": SINGAPORE_PORT_LATITUDE,
        "longitude": SINGAPORE_PORT_LONGITUDE,
        "current": MARINE_CURRENT_VARIABLES,
        "hourly": MARINE_HOURLY_VARIABLES,
        "forecast_days": 7,
        "timezone": PORT_TIMEZONE,
    }

    return await _get_json(
        client,
        MARINE_API_URL,
        params,
        "marine",
    )


# =========================================================
# MAIN WEATHER SERVICE (LIVE)
# =========================================================

async def get_weather_data():
    """
    Retrieve current weather, hourly forecast,
    daily forecast and marine conditions for Port of Singapore.
    """

    timeout = httpx.Timeout(
        REQUEST_TIMEOUT,
        connect=10.0,
    )

    async with httpx.AsyncClient(
        timeout=timeout
    ) as client:

        weather_data, marine_data = (
            await _fetch_all_data(client)
        )

    return {
        "success": True,
        "source": {
            "weather": "Open-Meteo Weather Forecast API",
            "marine": "Open-Meteo Marine API",
        },
        "location": {
            "name": PORT_LOCATION_NAME,
            "latitude": SINGAPORE_PORT_LATITUDE,
            "longitude": SINGAPORE_PORT_LONGITUDE,
            "timezone": PORT_TIMEZONE,
        },
        "weather": weather_data,
        "marine": marine_data,
    }


# =========================================================
# PARALLEL PROVIDER REQUESTS
# =========================================================

async def _fetch_all_data(
    client: httpx.AsyncClient,
):
    """
    Fetch weather and marine data concurrently.
    """

    try:
        return await asyncio.gather(
            fetch_weather_data(client),
            fetch_marine_data(client),
        )

    except WeatherProviderError:
        raise

    except Exception as exc:
        raise WeatherProviderError(
            "Unexpected error while retrieving "
            "Open-Meteo weather and marine data."
        ) from exc


# =========================================================
# HISTORY: VALIDATION
# =========================================================

def validate_history_range(
    start_date: date,
    end_date: date,
) -> None:
    """Reject ranges that make no sense. Dates are Singapore dates."""

    today = datetime.now(PORT_UTC_OFFSET).date()

    if end_date < start_date:
        raise WeatherRequestError(
            "The end date cannot be before the start date."
        )

    if end_date > today:
        raise WeatherRequestError(
            "The end date cannot be in the future."
        )

    if start_date < MIN_HISTORY_DATE:
        raise WeatherRequestError(
            "The start date cannot be before "
            f"{MIN_HISTORY_DATE.isoformat()}."
        )

    day_count = (end_date - start_date).days + 1

    if day_count > MAX_HISTORY_DAYS:
        raise WeatherRequestError(
            f"Select at most {MAX_HISTORY_DAYS} days at a time."
        )


# =========================================================
# HISTORY: FETCH
# =========================================================

async def fetch_history_weather(
    client: httpx.AsyncClient,
    start_date: date,
    end_date: date,
):
    params = {
        "latitude": SINGAPORE_PORT_LATITUDE,
        "longitude": SINGAPORE_PORT_LONGITUDE,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": HISTORY_DAILY_VARIABLES,
        "timezone": PORT_TIMEZONE,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }

    return await _get_json(
        client,
        ARCHIVE_API_URL,
        params,
        "weather history",
    )


async def fetch_history_marine(
    client: httpx.AsyncClient,
    start_date: date,
    end_date: date,
):
    params = {
        "latitude": SINGAPORE_PORT_LATITUDE,
        "longitude": SINGAPORE_PORT_LONGITUDE,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": MARINE_HISTORY_HOURLY_VARIABLES,
        "timezone": PORT_TIMEZONE,
    }

    return await _get_json(
        client,
        MARINE_API_URL,
        params,
        "marine history",
    )


# =========================================================
# HISTORY: BUILD DAILY ROWS
# =========================================================

def _larger(current, candidate):
    """Larger of two values, ignoring None."""

    if candidate is None:
        return current

    if current is None or candidate > current:
        return candidate

    return current


def _summarise_marine_by_day(marine: dict | None) -> dict:
    """Highest hourly wave height and current speed per day."""

    if not marine:
        return {}

    hourly = marine.get("hourly") or {}

    times = hourly.get("time") or []

    waves = hourly.get("wave_height") or []

    currents = hourly.get("ocean_current_velocity") or []

    summary: dict = {}

    for index, time_text in enumerate(times):
        day = str(time_text)[:10]

        entry = summary.setdefault(
            day,
            {
                "wave_height_max_m": None,
                "ocean_current_max_kmh": None,
            },
        )

        if index < len(waves):
            entry["wave_height_max_m"] = _larger(
                entry["wave_height_max_m"],
                waves[index],
            )

        if index < len(currents):
            entry["ocean_current_max_kmh"] = _larger(
                entry["ocean_current_max_kmh"],
                currents[index],
            )

    return summary


def _build_history_days(
    weather: dict,
    marine: dict | None,
) -> list[dict]:
    daily = weather.get("daily") or {}

    dates = daily.get("time") or []

    def pick(key: str, index: int):
        values = daily.get(key) or []

        return values[index] if index < len(values) else None

    marine_by_day = _summarise_marine_by_day(marine)

    days = []

    for index, day in enumerate(dates):
        marine_day = marine_by_day.get(day, {})

        days.append(
            {
                "date": day,
                "weather_code": pick("weather_code", index),
                "temperature_max": pick(
                    "temperature_2m_max", index
                ),
                "temperature_min": pick(
                    "temperature_2m_min", index
                ),
                "rain_total_mm": pick(
                    "precipitation_sum", index
                ),
                "wind_max_kmh": pick(
                    "wind_speed_10m_max", index
                ),
                "wind_gust_max_kmh": pick(
                    "wind_gusts_10m_max", index
                ),
                "wave_height_max_m": marine_day.get(
                    "wave_height_max_m"
                ),
                "ocean_current_max_kmh": marine_day.get(
                    "ocean_current_max_kmh"
                ),
            }
        )

    return days


# =========================================================
# MAIN WEATHER SERVICE (HISTORY)
# =========================================================

async def get_weather_history(
    start_date: date,
    end_date: date,
):
    """
    Past weather and marine conditions for Port of Singapore,
    one row per Singapore day (start and end included).

    Weather history is required: if it fails the request fails.
    Marine history is best effort: if it fails, the weather rows
    are still returned and marine_error says why.
    """

    validate_history_range(start_date, end_date)

    timeout = httpx.Timeout(
        REQUEST_TIMEOUT,
        connect=10.0,
    )

    async with httpx.AsyncClient(
        timeout=timeout
    ) as client:

        weather_result, marine_result = await asyncio.gather(
            fetch_history_weather(client, start_date, end_date),
            fetch_history_marine(client, start_date, end_date),
            return_exceptions=True,
        )

    if isinstance(weather_result, Exception):
        raise weather_result

    marine_data = None

    marine_error = None

    if isinstance(marine_result, WeatherProviderError):
        marine_error = str(marine_result)

    elif isinstance(marine_result, Exception):
        logger.error(
            "Unexpected marine history error: %s: %s",
            type(marine_result).__name__,
            marine_result,
        )

        marine_error = (
            "Unexpected error while retrieving marine history."
        )

    else:
        marine_data = marine_result

    return {
        "success": True,
        "source": {
            "weather": "Open-Meteo Historical Weather API",
            "marine": "Open-Meteo Marine API",
        },
        "location": {
            "name": PORT_LOCATION_NAME,
            "latitude": SINGAPORE_PORT_LATITUDE,
            "longitude": SINGAPORE_PORT_LONGITUDE,
            "timezone": PORT_TIMEZONE,
        },
        "range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "weather_grid": {
            "latitude": weather_result.get("latitude"),
            "longitude": weather_result.get("longitude"),
        },
        "marine_grid": (
            {
                "latitude": marine_data.get("latitude"),
                "longitude": marine_data.get("longitude"),
            }
            if marine_data
            else None
        ),
        "marine_error": marine_error,
        "days": _build_history_days(weather_result, marine_data),
    }
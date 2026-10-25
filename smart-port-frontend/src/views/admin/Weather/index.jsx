import React from "react";
import {
  MdCloud,
  MdAir,
  MdWater,
  MdVisibility,
  MdUmbrella,
  MdWaves,
  MdWarning,
  MdAccessTime,
  MdLocationOn,
  MdThermostat,
  MdCheckCircle,
  MdCalendarToday,
  MdRefresh,
  MdExplore,
  MdSpeed,
  MdWaterDrop,
  MdNavigation,
} from "react-icons/md";

import { apiGet } from "services/api";

/* =========================================================
   PORT OF SINGAPORE LOCATION

   Display only. The backend /weather route decides which
   location is actually queried; keep its coordinates in sync
   with these.
   ========================================================= */

const SINGAPORE_PORT = {
  name: "Port of Singapore",
  latitude: 1.265,
  longitude: 103.8,
};

const PORT_TIME_ZONE = "Asia/Singapore";

/* Singapore has no daylight saving. Used only when the API does
   not report its own UTC offset. */
const FALLBACK_UTC_OFFSET_SECONDS = 8 * 60 * 60;

/* Maximum difference (degrees) before we warn that the backend
   is returning data for a different place. */
const LOCATION_MISMATCH_DEGREES = 0.5;

/* The weather is refreshed automatically this often while the
   tab is visible. */
const AUTO_REFRESH_MS = 10 * 60 * 1000;

/* If the newest observation is older than this, warn that the
   data may be stale. */
const STALE_AFTER_MINUTES = 45;

/* =========================================================
   OPERATIONAL THRESHOLDS

   These are example values for the demo. They are NOT official
   port rules: set them to the limits your port operations
   team actually uses.
   ========================================================= */

const THRESHOLDS = {
  waveHeightMetres: 3,
  oceanCurrentKnots: 2,
  windKmh: 40,
  visibilityKm: 2,
};

/* Weather codes treated as an operational concern. */
const SEVERE_WEATHER_CODES = {
  65: "Heavy rain",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

const KMH_PER_KNOT = 1.852;

/* =========================================================
   DEFAULT WEATHER DATA
   ========================================================= */

const emptyWeather = {
  location: SINGAPORE_PORT.name,
  temperature: null,
  feelsLike: null,
  condition: "Loading weather...",
  weatherCode: null,
  humidity: null,
  windSpeed: null,
  windDirectionDegrees: null,
  visibility: null,
  pressure: null,
  precipitation: null,
  observedAt: null,
};

/* =========================================================
   DEFAULT MARINE DATA
   ========================================================= */

const emptyMarineConditions = {
  waveHeight: null,
  waveDirection: null,
  wavePeriod: null,
  swellHeight: null,
  swellDirection: null,
  swellPeriod: null,
  seaSurfaceTemperature: null,
  oceanCurrentVelocity: null,
  oceanCurrentDirection: null,
  seaLevelHeight: null,
};

/* =========================================================
   WEATHER CODE → DESCRIPTION
   ========================================================= */

const getWeatherCondition = (weatherCode) => {
  const conditions = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    56: "Light Freezing Drizzle",
    57: "Dense Freezing Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    66: "Light Freezing Rain",
    67: "Heavy Freezing Rain",
    71: "Slight Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    85: "Slight Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Hail",
    99: "Thunderstorm with Heavy Hail",
  };

  return conditions[weatherCode] || "Unknown Conditions";
};

/* =========================================================
   NUMBER HELPERS
   ========================================================= */

const isNumber = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const formatNumber = (value, decimals = 1) => {
  if (!isNumber(value)) {
    return "--";
  }

  return Number(value).toFixed(decimals);
};

const kmhToKnots = (kmh) =>
  isNumber(kmh) ? Number(kmh) / KMH_PER_KNOT : null;

/* =========================================================
   COMPASS DIRECTION
   ========================================================= */

const getCompassDirection = (degrees) => {
  if (!isNumber(degrees)) {
    return "--";
  }

  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];

  /* ((x % 360) + 360) % 360 keeps negative and 360+ values
     inside 0-359 before choosing the compass point. */
  const normalized = ((Number(degrees) % 360) + 360) % 360;

  return directions[Math.round(normalized / 22.5) % 16];
};

/* =========================================================
   TIME HELPERS (everything is shown in Singapore time)

   Open-Meteo sends times like "2026-10-14T21:30" with NO
   offset, expressed in the timezone the backend asked for.
   Reading that text with new Date() would treat it as the
   viewer's own timezone, so the offset the API reports
   (utc_offset_seconds) is applied explicitly.
   ========================================================= */

const parseApiTime = (value, utcOffsetSeconds) => {
  if (!value) {
    return null;
  }

  const text = String(value);

  /* Already has Z or an explicit offset: trust it. */
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text) && text.includes("T")) {
    const direct = new Date(text);

    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "00", minute = "00"] = match;

  const offset = isNumber(utcOffsetSeconds)
    ? Number(utcOffsetSeconds)
    : FALLBACK_UTC_OFFSET_SECONDS;

  const instant = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    ) -
      offset * 1000
  );

  return Number.isNaN(instant.getTime()) ? null : instant;
};

const formatPortTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* "YYYY-MM-DD" for a moment, as the date in Singapore. */
const getPortDateString = (date) =>
  date.toLocaleDateString("en-CA", {
    timeZone: PORT_TIME_ZONE,
  });

/* Moves a "YYYY-MM-DD" string by whole days (calendar maths,
   independent of the viewer's timezone). */
const shiftDateString = (dateString, days = 0, years = 0) => {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(Date.UTC(year + years, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};

const getToday = () => getPortDateString(new Date());

const getYesterday = () => shiftDateString(getToday(), -1);

const getSevenDaysAgo = () => shiftDateString(getToday(), -7);

const getOneYearAgo = () => shiftDateString(getToday(), 0, -1);

const formatDate = (dateString) => {
  if (!dateString) {
    return "Select date";
  }

  const date = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return "Select date";
  }

  return date.toLocaleDateString("en-SG", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getForecastDayLabel = (dateString) => {
  const today = getToday();

  if (dateString === today) {
    return "Today";
  }

  if (dateString === shiftDateString(today, 1)) {
    return "Tomorrow";
  }

  const date = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleDateString("en-SG", {
    timeZone: "UTC",
    weekday: "long",
  });
};

/* =========================================================
   OPERATIONAL STATUS

   Collects EVERY exceeded threshold (not just the first one)
   and reports which inputs could not be assessed. If there is
   no data at all it says "Unavailable" instead of "Normal".
   ========================================================= */

const getOperationalStatus = (marine, weather) => {
  const alerts = [];
  const notAssessed = [];

  const currentKnots = kmhToKnots(marine.oceanCurrentVelocity);

  if (isNumber(marine.waveHeight)) {
    if (Number(marine.waveHeight) >= THRESHOLDS.waveHeightMetres) {
      alerts.push(
        `Wave height is ${formatNumber(marine.waveHeight, 1)} m.`
      );
    }
  } else {
    notAssessed.push("waves");
  }

  if (currentKnots !== null) {
    if (currentKnots >= THRESHOLDS.oceanCurrentKnots) {
      alerts.push(
        `Ocean current is ${formatNumber(currentKnots, 1)} kn.`
      );
    }
  } else {
    notAssessed.push("ocean current");
  }

  if (isNumber(weather.windSpeed)) {
    if (Number(weather.windSpeed) >= THRESHOLDS.windKmh) {
      alerts.push(
        `Wind is ${formatNumber(weather.windSpeed, 0)} km/h.`
      );
    }
  } else {
    notAssessed.push("wind");
  }

  if (isNumber(weather.visibility)) {
    if (Number(weather.visibility) < THRESHOLDS.visibilityKm) {
      alerts.push(
        `Visibility is ${formatNumber(weather.visibility, 1)} km.`
      );
    }
  } else {
    notAssessed.push("visibility");
  }

  if (SEVERE_WEATHER_CODES[weather.weatherCode]) {
    alerts.push(`${SEVERE_WEATHER_CODES[weather.weatherCode]} reported.`);
  }

  if (notAssessed.length === 4) {
    return {
      level: "Unavailable",
      message:
        "Live weather and marine data is not available, so no operational assessment can be made.",
    };
  }

  const missingText =
    notAssessed.length > 0
      ? ` Not assessed (no data): ${notAssessed.join(", ")}.`
      : "";

  if (alerts.length > 0) {
    return {
      level: "Attention",
      message: `${alerts.join(
        " "
      )} Vessel movement, berth and cargo operations should be monitored.${missingText}`,
    };
  }

  return {
    level: "Normal",
    message: `No monitored threshold is exceeded.${missingText}`,
  };
};

/* =========================================================
   HISTORY HELPERS
   ========================================================= */

/* Must match MAX_HISTORY_DAYS in the backend weather_service.py. */
const MAX_HISTORY_DAYS = 31;

/* Whole days from one "YYYY-MM-DD" to another (inclusive count
   is this + 1). */
const daysBetween = (fromString, toString) =>
  Math.round(
    (new Date(`${toString}T00:00:00Z`) -
      new Date(`${fromString}T00:00:00Z`)) /
      86400000
  );

/* Highest numeric value in a list, or null if there is none. */
const maxOf = (values) => {
  const numbers = values.filter(isNumber).map(Number);

  return numbers.length > 0 ? Math.max(...numbers) : null;
};

/* Which example thresholds a past day crossed. Visibility is not
   part of the daily history, so it is not assessed here. */
const getDayFlags = (day) => {
  const flags = [];

  if (
    isNumber(day.wave_height_max_m) &&
    Number(day.wave_height_max_m) >= THRESHOLDS.waveHeightMetres
  ) {
    flags.push(`Waves ${formatNumber(day.wave_height_max_m, 1)} m`);
  }

  const dayCurrentKnots = kmhToKnots(day.ocean_current_max_kmh);

  if (
    dayCurrentKnots !== null &&
    dayCurrentKnots >= THRESHOLDS.oceanCurrentKnots
  ) {
    flags.push(`Current ${formatNumber(dayCurrentKnots, 1)} kn`);
  }

  if (
    isNumber(day.wind_max_kmh) &&
    Number(day.wind_max_kmh) >= THRESHOLDS.windKmh
  ) {
    flags.push(`Wind ${formatNumber(day.wind_max_kmh, 0)} km/h`);
  }

  if (SEVERE_WEATHER_CODES[day.weather_code]) {
    flags.push(SEVERE_WEATHER_CODES[day.weather_code]);
  }

  return flags;
};

/* =========================================================
   WEATHER METRIC
   ========================================================= */

const WeatherMetric = ({
  icon,
  title,
  value,
  subtitle,
  iconClass = "text-brand-500",
}) => {
  return (
    <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-400">{title}</p>

          <h2 className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
            {value}
          </h2>

          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>

        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary dark:bg-navy-700 ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   MARINE METRIC
   ========================================================= */

const MarineMetric = ({
  icon,
  title,
  value,
  subtitle,
  iconClass = "text-brand-500",
}) => {
  return (
    <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full bg-white dark:bg-navy-800 ${iconClass}`}
      >
        {icon}
      </div>

      <p className="mt-4 text-sm text-gray-400">{title}</p>

      <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
        {value}
      </p>

      {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
};

/* =========================================================
   WEATHER PAGE
   ========================================================= */

const Weather = () => {
  const [currentWeather, setCurrentWeather] =
    React.useState(emptyWeather);

  const [marineConditions, setMarineConditions] = React.useState(
    emptyMarineConditions
  );

  const [hourlyWeather, setHourlyWeather] = React.useState([]);

  const [forecastData, setForecastData] = React.useState([]);

  const [isLoading, setIsLoading] = React.useState(true);

  const [error, setError] = React.useState("");

  /* Set when the data the backend returns does not match Port
     of Singapore (wrong place, wrong timezone, stale data). */
  const [dataWarnings, setDataWarnings] = React.useState([]);

  /* When this page last received data from the backend. */
  const [fetchedAt, setFetchedAt] = React.useState(null);

  /* Ignores answers from older requests that finish late. */
  const requestIdRef = React.useRef(0);

  /* Last successful or attempted load, for the tab-visible
     refresh check. */
  const lastLoadRef = React.useRef(0);

  /* =======================================================
     HISTORY STATE
     ======================================================= */

  const [selectedDate, setSelectedDate] = React.useState(getYesterday());

  const [fromDate, setFromDate] = React.useState(getSevenDaysAgo());

  const [toDate, setToDate] = React.useState(getYesterday());

  const [historyMode, setHistoryMode] = React.useState("single");

  /* Result of GET /weather/history, plus its own loading/error
     state so it never disturbs the live weather above. */
  const [historyData, setHistoryData] = React.useState(null);

  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [historyError, setHistoryError] = React.useState("");

  const historyRequestIdRef = React.useRef(0);

  /* =======================================================
     LOAD WEATHER DATA FROM BACKEND
     ======================================================= */

  const loadWeatherData = React.useCallback(async () => {
    requestIdRef.current += 1;

    const requestId = requestIdRef.current;

    lastLoadRef.current = Date.now();

    try {
      setIsLoading(true);
      setError("");

      const response = await apiGet("/weather");

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response) {
        throw new Error("Weather service returned an empty response.");
      }

      const weatherData = response.weather || {};

      const marineData = response.marine || {};

      const weatherCurrent = weatherData.current || {};

      const marineCurrent = marineData.current || {};

      const utcOffsetSeconds = weatherData.utc_offset_seconds;

      const warnings = [];

      /* ==================================================
         LOCATION CHECK (weather and marine)

         Open-Meteo reports the coordinates it used. If they
         are present and far from Singapore, the backend is
         still querying another location.
         ================================================== */

      const checkLocation = (label, data) => {
        const latitude = isNumber(data.latitude)
          ? Number(data.latitude)
          : null;

        const longitude = isNumber(data.longitude)
          ? Number(data.longitude)
          : null;

        if (latitude === null || longitude === null) {
          return;
        }

        if (
          Math.abs(latitude - SINGAPORE_PORT.latitude) >
            LOCATION_MISMATCH_DEGREES ||
          Math.abs(longitude - SINGAPORE_PORT.longitude) >
            LOCATION_MISMATCH_DEGREES
        ) {
          warnings.push(
            `The backend returned ${label} data for ${latitude.toFixed(
              2
            )}, ${longitude.toFixed(2)}, not ${
              SINGAPORE_PORT.name
            }. Update the coordinates in the FastAPI /weather route.`
          );
        }
      };

      checkLocation("weather", weatherData);

      checkLocation("marine", marineData);

      /* ==================================================
         TIMEZONE CHECK

         Times on this page are converted correctly either way,
         but daily forecast days are cut at midnight in the
         timezone the backend requested.
         ================================================== */

      if (
        weatherData.timezone &&
        weatherData.timezone !== PORT_TIME_ZONE
      ) {
        warnings.push(
          `The weather data uses the timezone "${weatherData.timezone}", not ${PORT_TIME_ZONE}. Daily forecast days may not match Singapore days. Set timezone=${PORT_TIME_ZONE} in the backend request.`
        );
      }

      /* ==================================================
         CURRENT WEATHER
         ================================================== */

      const observedAt = parseApiTime(
        weatherCurrent.time,
        utcOffsetSeconds
      );

      if (observedAt) {
        const ageMinutes = Math.round(
          (Date.now() - observedAt.getTime()) / 60000
        );

        if (ageMinutes > STALE_AFTER_MINUTES) {
          warnings.push(
            `The newest weather observation is ${ageMinutes} minutes old, so the values below may be out of date.`
          );
        }
      }

      setCurrentWeather({
        location: response.location?.name || SINGAPORE_PORT.name,

        temperature: weatherCurrent.temperature_2m ?? null,

        feelsLike: weatherCurrent.apparent_temperature ?? null,

        weatherCode: isNumber(weatherCurrent.weather_code)
          ? Number(weatherCurrent.weather_code)
          : null,

        condition: isNumber(weatherCurrent.weather_code)
          ? getWeatherCondition(Number(weatherCurrent.weather_code))
          : "Conditions unavailable",

        humidity: weatherCurrent.relative_humidity_2m ?? null,

        windSpeed: weatherCurrent.wind_speed_10m ?? null,

        windDirectionDegrees: weatherCurrent.wind_direction_10m ?? null,

        /* Open-Meteo sends visibility in metres. */
        visibility: isNumber(weatherCurrent.visibility)
          ? Number(weatherCurrent.visibility) / 1000
          : null,

        pressure: weatherCurrent.pressure_msl ?? null,

        precipitation: weatherCurrent.precipitation ?? null,

        observedAt,
      });

      /* ==================================================
         HOURLY WEATHER (next 6 hours, including this hour)
         ================================================== */

      const weatherTimes = weatherData.hourly?.time || [];

      const hourlyTemperature = weatherData.hourly?.temperature_2m || [];

      const hourlyRain =
        weatherData.hourly?.precipitation_probability || [];

      const hourlyWind = weatherData.hourly?.wind_speed_10m || [];

      const hourlyWindDirection =
        weatherData.hourly?.wind_direction_10m || [];

      const hourStart = Date.now() - 60 * 60 * 1000;

      const formattedHourly = weatherTimes
        .map((time, index) => ({
          time,

          instant: parseApiTime(time, utcOffsetSeconds),

          temperature: hourlyTemperature[index] ?? null,

          rain: hourlyRain[index] ?? null,

          wind: hourlyWind[index] ?? null,

          windDirection: hourlyWindDirection[index] ?? null,
        }))
        .filter(
          (item) =>
            item.instant !== null && item.instant.getTime() > hourStart
        )
        .slice(0, 6);

      setHourlyWeather(formattedHourly);

      /* ==================================================
         7-DAY FORECAST
         ================================================== */

      const dailyTimes = weatherData.daily?.time || [];

      const dailyCodes = weatherData.daily?.weather_code || [];

      const dailyMax = weatherData.daily?.temperature_2m_max || [];

      const dailyMin = weatherData.daily?.temperature_2m_min || [];

      const dailyRain =
        weatherData.daily?.precipitation_probability_max || [];

      const formattedForecast = dailyTimes.map((date, index) => ({
        date,

        day: getForecastDayLabel(date),

        condition: isNumber(dailyCodes[index])
          ? getWeatherCondition(Number(dailyCodes[index]))
          : "Conditions unavailable",

        temperature: dailyMax[index] ?? null,

        low: dailyMin[index] ?? null,

        rain: dailyRain[index] ?? null,
      }));

      setForecastData(formattedForecast);

      /* ==================================================
         MARINE DATA
         ================================================== */

      setMarineConditions({
        waveHeight: marineCurrent.wave_height ?? null,

        waveDirection: marineCurrent.wave_direction ?? null,

        wavePeriod: marineCurrent.wave_period ?? null,

        swellHeight: marineCurrent.swell_wave_height ?? null,

        swellDirection: marineCurrent.swell_wave_direction ?? null,

        swellPeriod: marineCurrent.swell_wave_period ?? null,

        seaSurfaceTemperature:
          marineCurrent.sea_surface_temperature ?? null,

        oceanCurrentVelocity: marineCurrent.ocean_current_velocity ?? null,

        oceanCurrentDirection:
          marineCurrent.ocean_current_direction ?? null,

        seaLevelHeight: marineCurrent.sea_level_height_msl ?? null,
      });

      setDataWarnings(warnings);

      setFetchedAt(new Date());
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error("Weather data error:", fetchError);

      setError(
        fetchError?.message ||
          "Unable to retrieve live weather and marine data. Please try again."
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  React.useEffect(() => {
    loadWeatherData();
  }, [loadWeatherData]);

  /* =======================================================
     AUTO REFRESH (only while the tab is visible)
     ======================================================= */

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadWeatherData();
      }
    }, AUTO_REFRESH_MS);

    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastLoadRef.current > AUTO_REFRESH_MS
      ) {
        loadWeatherData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);

      document.removeEventListener("visibilitychange", handleVisibility);

      /* Drop any answer still on its way after leaving the page. */
      requestIdRef.current += 1;
    };
  }, [loadWeatherData]);

  /* =======================================================
     QUICK DATE SELECTION
     ======================================================= */

  /* Loads past weather and marine conditions for start..end
     (Singapore dates, both included) from GET /weather/history. */
  const loadHistory = async (start, end) => {
    if (!start || !end) {
      setHistoryError("Select a date first.");
      return;
    }

    if (start > end) {
      setHistoryError("The start date is after the end date.");
      return;
    }

    if (end > getToday()) {
      setHistoryError("The end date cannot be in the future.");
      return;
    }

    if (daysBetween(start, end) + 1 > MAX_HISTORY_DAYS) {
      setHistoryError(
        `Select at most ${MAX_HISTORY_DAYS} days at a time.`
      );
      return;
    }

    historyRequestIdRef.current += 1;

    const requestId = historyRequestIdRef.current;

    try {
      setHistoryLoading(true);
      setHistoryError("");

      const response = await apiGet(
        `/weather/history?start_date=${start}&end_date=${end}`
      );

      if (requestId !== historyRequestIdRef.current) {
        return;
      }

      if (!response || !Array.isArray(response.days)) {
        throw new Error("Weather history service returned no data.");
      }

      setHistoryData(response);
    } catch (historyLoadError) {
      if (requestId !== historyRequestIdRef.current) {
        return;
      }

      console.error("Weather history error:", historyLoadError);

      setHistoryData(null);

      setHistoryError(
        historyLoadError?.message ||
          "Unable to retrieve weather history. Please try again."
      );
    } finally {
      if (requestId === historyRequestIdRef.current) {
        setHistoryLoading(false);
      }
    }
  };

  const handleToday = () => {
    const day = getToday();

    setHistoryMode("single");
    setSelectedDate(day);
    loadHistory(day, day);
  };

  const handleYesterday = () => {
    const day = getYesterday();

    setHistoryMode("single");
    setSelectedDate(day);
    loadHistory(day, day);
  };

  const handleLastWeek = () => {
    const start = getSevenDaysAgo();

    const end = getYesterday();

    setHistoryMode("range");
    setFromDate(start);
    setToDate(end);
    loadHistory(start, end);
  };

  const handleLastYear = () => {
    const day = getOneYearAgo();

    setHistoryMode("single");
    setSelectedDate(day);
    loadHistory(day, day);
  };

  const handleShowHistory = () => {
    if (historyMode === "single") {
      loadHistory(selectedDate, selectedDate);
    } else {
      loadHistory(fromDate, toDate);
    }
  };

  /* =======================================================
     REFRESH
     ======================================================= */

  const handleRefresh = () => {
    loadWeatherData();
  };

  /* =======================================================
     OPERATIONAL STATUS
     ======================================================= */

  const operationalStatus = getOperationalStatus(
    marineConditions,
    currentWeather
  );

  const statusIsNormal = operationalStatus.level === "Normal";

  const statusIsAttention = operationalStatus.level === "Attention";

  const windKnots = kmhToKnots(currentWeather.windSpeed);

  const currentKnots = kmhToKnots(marineConditions.oceanCurrentVelocity);

  const today = getToday();

  const rangeInvalid = fromDate && toDate && fromDate > toDate;

  /* History summary figures. */
  const historyDays = historyData?.days || [];

  const historyDaysWithWeather = historyDays.filter((day) =>
    isNumber(day.temperature_max)
  );

  const historyRainTotal =
    historyDaysWithWeather.length > 0
      ? historyDaysWithWeather.reduce(
          (sum, day) => sum + (isNumber(day.rain_total_mm) ? Number(day.rain_total_mm) : 0),
          0
        )
      : null;

  const historyMaxWind = maxOf(historyDays.map((day) => day.wind_max_kmh));

  const historyMaxWave = maxOf(
    historyDays.map((day) => day.wave_height_max_m)
  );

  const historyFlaggedDays = historyDays.filter(
    (day) => getDayFlags(day).length > 0
  ).length;

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="mt-3">
      {/* =====================================================
          PAGE INTRO
          ===================================================== */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdCloud className="h-8 w-8" />
          </div>

          <div>
            <p className="text-sm text-black dark:text-white">
              Monitor weather and marine conditions affecting port
              operations.
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {SINGAPORE_PORT.name} • Open-Meteo model data • All times
              are Singapore time (SGT)
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          DATA WARNINGS (wrong location, timezone, stale data)
          ===================================================== */}

      {dataWarnings.map((warning) => (
        <div
          key={warning}
          className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400"
        >
          {warning}
        </div>
      ))}

      {/* =====================================================
          ERROR
          ===================================================== */}

      {error && (
        <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
          {error}
        </div>
      )}

      {/* =====================================================
          CURRENT WEATHER + OPERATIONAL STATUS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800 xl:col-span-2">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <MdLocationOn className="h-5 w-5 flex-shrink-0 text-brand-500" />

                <span>{currentWeather.location}</span>
              </div>

              <div className="mt-4 flex items-center gap-5">
                <MdCloud className="h-20 w-20 flex-shrink-0 text-brand-500" />

                <div>
                  <p className="text-5xl font-bold text-navy-700 dark:text-white">
                    {isNumber(currentWeather.temperature)
                      ? `${formatNumber(currentWeather.temperature, 1)}°C`
                      : "--"}
                  </p>

                  <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-300">
                    {currentWeather.condition}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Feels like{" "}
                    {isNumber(currentWeather.feelsLike)
                      ? `${formatNumber(currentWeather.feelsLike, 1)}°C`
                      : "--"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 flex-col justify-center border-l border-gray-100 pl-6 dark:border-white/10 md:min-w-[150px] md:text-right">
              <p className="text-sm text-gray-400">Observed (SGT)</p>

              <p className="mt-1 whitespace-nowrap text-xl font-bold text-navy-700 dark:text-white">
                {formatPortTime(currentWeather.observedAt)}
              </p>

              <p className="mt-2 text-xs text-gray-400">
                {isLoading
                  ? "Retrieving data..."
                  : fetchedAt
                  ? `Fetched ${formatPortTime(fetchedAt)}`
                  : "Not fetched"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${
                statusIsNormal
                  ? "bg-green-50 text-green-500 dark:bg-green-500/10"
                  : statusIsAttention
                  ? "bg-orange-50 text-orange-500 dark:bg-orange-500/10"
                  : "bg-gray-100 text-gray-400 dark:bg-white/10"
              }`}
            >
              {statusIsNormal ? (
                <MdCheckCircle className="h-6 w-6" />
              ) : (
                <MdWarning className="h-6 w-6" />
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-400">
                Operational Status
              </p>

              <h2
                className={`mt-1 text-2xl font-bold ${
                  statusIsNormal
                    ? "text-green-500"
                    : statusIsAttention
                    ? "text-orange-500"
                    : "text-gray-400"
                }`}
              >
                {operationalStatus.level}
              </h2>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-gray-500 dark:text-gray-300">
            {operationalStatus.message}
          </p>
        </div>
      </div>

      {/* =====================================================
          CURRENT WEATHER METRICS
          ===================================================== */}

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <WeatherMetric
          title="Humidity"
          value={
            isNumber(currentWeather.humidity)
              ? `${formatNumber(currentWeather.humidity, 0)}%`
              : "--"
          }
          subtitle="Relative humidity"
          icon={<MdWater className="h-6 w-6" />}
        />

        <WeatherMetric
          title="Wind Speed"
          value={
            isNumber(currentWeather.windSpeed)
              ? `${formatNumber(currentWeather.windSpeed, 1)} km/h`
              : "--"
          }
          subtitle={
            isNumber(currentWeather.windDirectionDegrees)
              ? `From ${getCompassDirection(
                  currentWeather.windDirectionDegrees
                )} (${formatNumber(
                  currentWeather.windDirectionDegrees,
                  0
                )}°) • ${formatNumber(windKnots, 1)} kn`
              : "Direction unavailable"
          }
          icon={<MdAir className="h-6 w-6" />}
        />

        <WeatherMetric
          title="Visibility"
          value={
            isNumber(currentWeather.visibility)
              ? `${formatNumber(currentWeather.visibility, 1)} km`
              : "--"
          }
          subtitle="Model-estimated visibility"
          icon={<MdVisibility className="h-6 w-6" />}
        />

        <WeatherMetric
          title="Rainfall"
          value={
            isNumber(currentWeather.precipitation)
              ? `${formatNumber(currentWeather.precipitation, 1)} mm`
              : "--"
          }
          subtitle="Current precipitation"
          icon={<MdUmbrella className="h-6 w-6" />}
        />
      </div>

      {/* =====================================================
          WEATHER ANALYTICS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdCloud className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Weather Analytics
              </h2>

              <p className="mt-1 text-sm text-black dark:text-white">
                Review selected dates and date ranges for operational
                analysis.
              </p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-4 py-3 text-sm font-bold text-navy-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-700 dark:text-white"
          >
            <MdRefresh
              className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
            />

            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* QUICK SELECTION */}

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-300">
            Quick selection
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleToday}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                historyMode === "single" && selectedDate === getToday()
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-navy-700 hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
              }`}
            >
              Today
            </button>

            <button
              onClick={handleYesterday}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                historyMode === "single" && selectedDate === getYesterday()
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-navy-700 hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
              }`}
            >
              Yesterday
            </button>

            <button
              onClick={handleLastWeek}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                historyMode === "range"
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-navy-700 hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
              }`}
            >
              Last 7 Days
            </button>

            <button
              onClick={handleLastYear}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                historyMode === "single" && selectedDate === getOneYearAgo()
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-navy-700 hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
              }`}
            >
              Last Year
            </button>
          </div>
        </div>

        {/* DATE SELECTION */}

        <div className="mt-6 rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-300">
                <MdCalendarToday className="h-4 w-4 text-brand-500" />
                Historical Date
              </label>

              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => {
                  setHistoryMode("single");
                  setSelectedDate(e.target.value);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-300">
                <MdCalendarToday className="h-4 w-4 text-brand-500" />
                Date Range
              </label>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || today}
                  onChange={(e) => {
                    setHistoryMode("range");
                    setFromDate(e.target.value);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />

                <input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  max={today}
                  onChange={(e) => {
                    setHistoryMode("range");
                    setToDate(e.target.value);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-white p-4 dark:bg-navy-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Selected period (Singapore dates)
            </p>

            <p className="mt-1 font-bold text-navy-700 dark:text-white">
              {historyMode === "single"
                ? formatDate(selectedDate)
                : `${formatDate(fromDate)} → ${formatDate(toDate)}`}
            </p>

            {rangeInvalid && (
              <p className="mt-2 text-xs text-red-500">
                The start date is after the end date.
              </p>
            )}

            <button
              onClick={handleShowHistory}
              disabled={historyLoading || rangeInvalid}
              className="mt-4 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {historyLoading ? "Loading history..." : "Show history"}
            </button>
          </div>
        </div>

        {/* HISTORY RESULTS */}

        {historyError && (
          <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
            {historyError}
          </div>
        )}

        {historyData && historyData.marine_error && (
          <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
            Marine history could not be loaded, so wave and current columns
            are empty: {historyData.marine_error}
          </div>
        )}

        {!historyData && !historyError && !historyLoading && (
          <p className="mt-5 text-sm text-gray-400">
            Choose a date or range and press "Show history" to see what
            the weather and sea conditions were.
          </p>
        )}

        {historyData && (
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
                <p className="text-xs text-gray-400">Days with data</p>

                <p className="mt-1 text-xl font-bold text-navy-700 dark:text-white">
                  {historyDaysWithWeather.length} / {historyDays.length}
                </p>
              </div>

              <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
                <p className="text-xs text-gray-400">Total rain</p>

                <p className="mt-1 text-xl font-bold text-navy-700 dark:text-white">
                  {historyRainTotal !== null
                    ? `${formatNumber(historyRainTotal, 1)} mm`
                    : "--"}
                </p>
              </div>

              <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
                <p className="text-xs text-gray-400">Highest wind</p>

                <p className="mt-1 text-xl font-bold text-navy-700 dark:text-white">
                  {historyMaxWind !== null
                    ? `${formatNumber(historyMaxWind, 0)} km/h`
                    : "--"}
                </p>
              </div>

              <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
                <p className="text-xs text-gray-400">Highest wave</p>

                <p className="mt-1 text-xl font-bold text-navy-700 dark:text-white">
                  {historyMaxWave !== null
                    ? `${formatNumber(historyMaxWave, 1)} m`
                    : "--"}
                </p>
              </div>

              <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
                <p className="text-xs text-gray-400">Days over limits</p>

                <p
                  className={`mt-1 text-xl font-bold ${
                    historyFlaggedDays > 0
                      ? "text-orange-500"
                      : "text-navy-700 dark:text-white"
                  }`}
                >
                  {historyFlaggedDays}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/10">
                    {[
                      "Date",
                      "Conditions",
                      "Temp (max / min)",
                      "Rain",
                      "Max wind",
                      "Max wave",
                      "Max current",
                      "Over limits",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {historyDays.map((day) => {
                    const flags = getDayFlags(day);

                    const noWeather = !isNumber(day.temperature_max);

                    const dayCurrentKnots = kmhToKnots(
                      day.ocean_current_max_kmh
                    );

                    return (
                      <tr
                        key={day.date}
                        className="border-b border-gray-100 last:border-0 dark:border-white/5"
                      >
                        <td className="whitespace-nowrap px-4 py-4 font-bold text-navy-700 dark:text-white">
                          {formatDate(day.date)}
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {isNumber(day.weather_code)
                            ? getWeatherCondition(Number(day.weather_code))
                            : noWeather
                            ? "Not available yet"
                            : "--"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {noWeather
                            ? "--"
                            : `${formatNumber(
                                day.temperature_max,
                                1
                              )}° / ${formatNumber(day.temperature_min, 1)}°`}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {isNumber(day.rain_total_mm)
                            ? `${formatNumber(day.rain_total_mm, 1)} mm`
                            : "--"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {isNumber(day.wind_max_kmh)
                            ? `${formatNumber(day.wind_max_kmh, 0)} km/h`
                            : "--"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {isNumber(day.wave_height_max_m)
                            ? `${formatNumber(day.wave_height_max_m, 1)} m`
                            : "--"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                          {dayCurrentKnots !== null
                            ? `${formatNumber(dayCurrentKnots, 1)} kn`
                            : "--"}
                        </td>

                        <td className="px-4 py-4">
                          {flags.length > 0 ? (
                            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                              {flags.join(", ")}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">
                              {noWeather ? "--" : "None"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs leading-5 text-gray-400">
              Source: Open-Meteo historical weather archive and marine
              model, Singapore dates. Wind is the highest hourly wind of the
              day; wave and current are the highest hourly model values.
              The archive runs a few days behind real time, so the newest
              days may show "--". Past visibility is not available, so it is
              not checked here. Limits are the same example values as
              above, not official port limits.
            </p>
          </div>
        )}
      </div>

      {/* =====================================================
          MARINE CONDITIONS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdWaves className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Today's Marine Conditions
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Ocean and coastal conditions relevant to vessel movement
                and port operations.
              </p>
            </div>
          </div>

          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            Marine Model Data
          </div>
        </div>

        {/* WAVE CONDITIONS */}

        <div className="mt-6">
          <p className="mb-3 text-sm font-bold text-navy-700 dark:text-white">
            Wave Conditions
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MarineMetric
              title="Wave Height"
              value={
                isNumber(marineConditions.waveHeight)
                  ? `${formatNumber(marineConditions.waveHeight, 1)} m`
                  : "--"
              }
              subtitle="Significant wave height"
              icon={<MdWaves className="h-5 w-5" />}
            />

            <MarineMetric
              title="Wave Direction"
              value={
                isNumber(marineConditions.waveDirection)
                  ? `${formatNumber(marineConditions.waveDirection, 0)}°`
                  : "--"
              }
              subtitle={
                isNumber(marineConditions.waveDirection)
                  ? `From ${getCompassDirection(
                      marineConditions.waveDirection
                    )}`
                  : "Direction unavailable"
              }
              icon={<MdExplore className="h-5 w-5" />}
              iconClass="text-blue-500"
            />

            <MarineMetric
              title="Wave Period"
              value={
                isNumber(marineConditions.wavePeriod)
                  ? `${formatNumber(marineConditions.wavePeriod, 1)} s`
                  : "--"
              }
              subtitle="Time between waves"
              icon={<MdAccessTime className="h-5 w-5" />}
              iconClass="text-indigo-500"
            />
          </div>
        </div>

        {/* SWELL CONDITIONS */}

        <div className="mt-6">
          <p className="mb-3 text-sm font-bold text-navy-700 dark:text-white">
            Swell Conditions
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MarineMetric
              title="Swell Height"
              value={
                isNumber(marineConditions.swellHeight)
                  ? `${formatNumber(marineConditions.swellHeight, 1)} m`
                  : "--"
              }
              subtitle="Significant swell height"
              icon={<MdWaves className="h-5 w-5" />}
              iconClass="text-cyan-500"
            />

            <MarineMetric
              title="Swell Direction"
              value={
                isNumber(marineConditions.swellDirection)
                  ? `${formatNumber(marineConditions.swellDirection, 0)}°`
                  : "--"
              }
              subtitle={
                isNumber(marineConditions.swellDirection)
                  ? `From ${getCompassDirection(
                      marineConditions.swellDirection
                    )}`
                  : "Direction unavailable"
              }
              icon={<MdNavigation className="h-5 w-5" />}
              iconClass="text-purple-500"
            />

            <MarineMetric
              title="Swell Period"
              value={
                isNumber(marineConditions.swellPeriod)
                  ? `${formatNumber(marineConditions.swellPeriod, 1)} s`
                  : "--"
              }
              subtitle="Swell wave period"
              icon={<MdAccessTime className="h-5 w-5" />}
              iconClass="text-violet-500"
            />
          </div>
        </div>

        {/* OCEAN CONDITIONS */}

        <div className="mt-6">
          <p className="mb-3 text-sm font-bold text-navy-700 dark:text-white">
            Ocean Conditions
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MarineMetric
              title="Sea Surface Temperature"
              value={
                isNumber(marineConditions.seaSurfaceTemperature)
                  ? `${formatNumber(
                      marineConditions.seaSurfaceTemperature,
                      1
                    )}°C`
                  : "--"
              }
              subtitle="Near-surface water temperature"
              icon={<MdThermostat className="h-5 w-5" />}
              iconClass="text-orange-500"
            />

            <MarineMetric
              title="Ocean Current"
              value={
                isNumber(marineConditions.oceanCurrentVelocity)
                  ? `${formatNumber(
                      marineConditions.oceanCurrentVelocity,
                      1
                    )} km/h`
                  : "--"
              }
              subtitle={
                currentKnots !== null
                  ? `${formatNumber(currentKnots, 1)} kn • Current velocity`
                  : "Current velocity"
              }
              icon={<MdSpeed className="h-5 w-5" />}
              iconClass="text-blue-500"
            />

            <MarineMetric
              title="Current Direction"
              value={
                isNumber(marineConditions.oceanCurrentDirection)
                  ? `${formatNumber(
                      marineConditions.oceanCurrentDirection,
                      0
                    )}°`
                  : "--"
              }
              subtitle={
                isNumber(marineConditions.oceanCurrentDirection)
                  ? `Towards ${getCompassDirection(
                      marineConditions.oceanCurrentDirection
                    )}`
                  : "Direction unavailable"
              }
              icon={<MdNavigation className="h-5 w-5" />}
              iconClass="text-green-500"
            />

            <MarineMetric
              title="Tide / Sea Level"
              value={
                isNumber(marineConditions.seaLevelHeight)
                  ? `${formatNumber(marineConditions.seaLevelHeight, 2)} m`
                  : "--"
              }
              subtitle="Sea level relative to mean sea level"
              icon={<MdWaterDrop className="h-5 w-5" />}
              iconClass="text-cyan-500"
            />
          </div>
        </div>

        {/* MARINE NOTE */}

        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
          <div className="flex items-start gap-3">
            <MdWaves className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />

            <div>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                Marine monitoring note
              </p>

              <p className="mt-1 text-xs leading-5 text-blue-600 dark:text-blue-400">
                Wave and swell directions indicate the direction the waves
                are coming from. Ocean-current direction indicates the
                direction the current is flowing toward. These are model
                values on a coarse grid, so they describe open water near
                the port, not conditions at a berth. A value of "--" means
                the model has no data for this point. Treat the values as
                decision-support information, not authoritative navigation
                data.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          HOURLY CONDITIONS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Hourly Conditions
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Short-term weather conditions for port operations (SGT).
            </p>
          </div>

          <MdAccessTime className="h-8 w-8 text-brand-500" />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10">
                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Time
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Temperature
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Rain chance
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Wind
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Wind Direction
                </th>
              </tr>
            </thead>

            <tbody>
              {hourlyWeather.length > 0 ? (
                hourlyWeather.map((item) => (
                  <tr
                    key={item.time}
                    className="border-b border-gray-100 last:border-0 dark:border-white/5"
                  >
                    <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                      {formatPortTime(item.instant)}
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {isNumber(item.temperature)
                        ? `${formatNumber(item.temperature, 1)}°C`
                        : "--"}
                    </td>

                    <td className="px-4 py-4">
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                        {isNumber(item.rain)
                          ? `${formatNumber(item.rain, 0)}%`
                          : "--"}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {isNumber(item.wind)
                        ? `${formatNumber(item.wind, 1)} km/h`
                        : "--"}
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {isNumber(item.windDirection)
                        ? `${formatNumber(
                            item.windDirection,
                            0
                          )}° (${getCompassDirection(item.windDirection)})`
                        : "--"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    {isLoading
                      ? "Loading hourly conditions..."
                      : "Hourly data unavailable."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================
          7-DAY FORECAST
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              7-Day Forecast
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Forecast conditions for operational planning.
            </p>
          </div>

          <MdCloud className="h-8 w-8 text-brand-500" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {forecastData.map((day) => (
            <div
              key={day.date}
              className="flex min-w-0 flex-col rounded-xl bg-lightPrimary p-5 text-center dark:bg-navy-700"
            >
              <p className="min-h-[24px] whitespace-nowrap font-bold text-navy-700 dark:text-white">
                {day.day}
              </p>

              <div className="flex h-16 items-center justify-center">
                <MdCloud className="h-9 w-9 text-brand-500" />
              </div>

              <div className="flex h-[48px] items-start justify-center">
                <p className="text-sm font-medium leading-6 text-gray-500 dark:text-gray-300">
                  {day.condition}
                </p>
              </div>

              <p className="mt-3 text-2xl font-bold text-navy-700 dark:text-white">
                {isNumber(day.temperature)
                  ? `${formatNumber(day.temperature, 0)}°`
                  : "--"}
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Low {isNumber(day.low) ? `${formatNumber(day.low, 0)}°` : "--"}
              </p>

              <div className="my-4 h-px w-full bg-gray-200 dark:bg-white/10" />

              <div className="flex items-center justify-center">
                <span className="whitespace-nowrap rounded-full bg-blue-100 px-3 py-2 text-xs font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  Rain{" "}
                  {isNumber(day.rain) ? `${formatNumber(day.rain, 0)}%` : "--"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {forecastData.length === 0 && !isLoading && (
          <div className="py-8 text-center text-sm text-gray-400">
            Forecast data unavailable.
          </div>
        )}
      </div>

      {/* =====================================================
          OPERATIONAL MONITORING
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-orange-50 p-6 dark:bg-orange-500/10">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500 dark:bg-orange-500/20">
            <MdWarning className="h-6 w-6" />
          </div>

          <div>
            <h2 className="font-bold text-orange-600 dark:text-orange-400">
              Weather & Marine Operational Monitoring
            </h2>

            <p className="mt-2 text-sm leading-6 text-orange-500">
              Weather and marine conditions can influence vessel
              maneuvering, berth operations, cargo handling, truck movement
              and overall port safety. This module compares live values with
              example thresholds: wave height {THRESHOLDS.waveHeightMetres}{" "}
              m, ocean current {THRESHOLDS.oceanCurrentKnots} kn, wind{" "}
              {THRESHOLDS.windKmh} km/h, visibility below{" "}
              {THRESHOLDS.visibilityKm} km, and heavy rain or thunderstorm
              weather codes. These are demonstration values, not official
              port limits.
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          DATA SOURCE
          ===================================================== */}

      <div className="mt-5 rounded-[20px] border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">
        <div className="flex items-start gap-3">
          <MdCloud className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-500" />

          <div>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-300">
              <span className="font-bold text-navy-700 dark:text-white">
                Current data source:
              </span>{" "}
              Open-Meteo Weather Forecast API and Open-Meteo Marine API,
              accessed through the Smart Port backend. The page refreshes
              automatically every 10 minutes while this tab is open.
            </p>

            <p className="mt-2 text-xs leading-5 text-gray-400">
              {SINGAPORE_PORT.name} coordinates:{" "}
              {SINGAPORE_PORT.latitude}, {SINGAPORE_PORT.longitude}
            </p>

            <p className="mt-2 text-xs leading-5 text-orange-500">
              These are model values, not readings from a port sensor or
              tide gauge. Marine values, particularly tides and ocean
              currents, should not be treated as authoritative navigational
              data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Weather;
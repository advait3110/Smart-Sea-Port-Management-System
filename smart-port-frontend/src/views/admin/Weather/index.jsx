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
} from "react-icons/md";

// =========================================================
// DEMONSTRATION CURRENT WEATHER DATA
// =========================================================

const currentWeather = {
  location: "Karwar Port",
  temperature: 29,
  feelsLike: 32,
  condition: "Partly Cloudy",
  humidity: 78,
  windSpeed: 18,
  windDirection: "SW",
  visibility: 8.5,
  pressure: 1008,
  precipitation: 20,
  waveHeight: 1.2,
  updated: "10:30 AM",
};

// =========================================================
// HOURLY WEATHER DATA
// =========================================================

const hourlyWeather = [
  {
    time: "11 AM",
    temperature: 29,
    rain: 20,
    wind: 18,
  },
  {
    time: "12 PM",
    temperature: 30,
    rain: 25,
    wind: 20,
  },
  {
    time: "01 PM",
    temperature: 31,
    rain: 30,
    wind: 21,
  },
  {
    time: "02 PM",
    temperature: 31,
    rain: 35,
    wind: 22,
  },
  {
    time: "03 PM",
    temperature: 30,
    rain: 40,
    wind: 24,
  },
  {
    time: "04 PM",
    temperature: 29,
    rain: 45,
    wind: 23,
  },
];

// =========================================================
// 7-DAY FORECAST
// =========================================================

const forecastData = [
  {
    day: "Today",
    condition: "Partly Cloudy",
    temperature: 31,
    low: 25,
    rain: 30,
  },
  {
    day: "Tomorrow",
    condition: "Cloudy",
    temperature: 30,
    low: 25,
    rain: 45,
  },
  {
    day: "Monday",
    condition: "Light Rain",
    temperature: 29,
    low: 24,
    rain: 65,
  },
  {
    day: "Tuesday",
    condition: "Rain",
    temperature: 28,
    low: 24,
    rain: 75,
  },
  {
    day: "Wednesday",
    condition: "Cloudy",
    temperature: 29,
    low: 24,
    rain: 50,
  },
  {
    day: "Thursday",
    condition: "Partly Cloudy",
    temperature: 31,
    low: 25,
    rain: 35,
  },
  {
    day: "Friday",
    condition: "Partly Cloudy",
    temperature: 31,
    low: 25,
    rain: 30,
  },
];

// =========================================================
// DEMONSTRATION HISTORICAL WEATHER
// =========================================================

const historicalWeather = {
  temperature: 28.4,
  maxTemperature: 31.2,
  minTemperature: 24.9,
  rainfall: 12.6,
  humidity: 79,
  windSpeed: 21,
  windDirection: "SW",
  visibility: 7.8,
  pressure: 1009,
  waveHeight: 1.4,
};

// =========================================================
// MARINE CONDITIONS
// =========================================================

const marineConditions = {
  waveHeight: 1.2,
  swellPeriod: 6.4,
  seaCondition: "Moderate",
  waterTemperature: 28,
  windSpeed: 18,
  windDirection: "SW",
};

// =========================================================
// OPERATIONAL WEATHER STATUS
// =========================================================

const operationalStatus = {
  level: "Normal",
  message:
    "Current weather conditions are suitable for normal port operations.",
};

// =========================================================
// HELPER COMPONENT
// =========================================================

const WeatherMetric = ({
  icon,
  title,
  value,
  subtitle,
  iconClass = "text-brand-500",
}) => {
  return (
    <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">
            {title}
          </p>

          <h2 className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
            {value}
          </h2>

          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">
              {subtitle}
            </p>
          )}
        </div>

        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary dark:bg-navy-700 ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

// =========================================================
// DATE HELPERS
// =========================================================

const formatDate = (dateString) => {
  if (!dateString) return "Select date";

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getToday = () => {
  return getDateString(new Date());
};

const getYesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return getDateString(date);
};

const getSevenDaysAgo = () => {
  const date = new Date();
  date.setDate(date.getDate() - 7);

  return getDateString(date);
};

const getOneYearAgo = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);

  return getDateString(date);
};

// =========================================================
// WEATHER PAGE
// =========================================================

const Weather = () => {
  // =======================================================
  // HISTORY STATE
  // =======================================================

  const [selectedDate, setSelectedDate] = React.useState(
    getYesterday()
  );

  const [fromDate, setFromDate] = React.useState(
    getSevenDaysAgo()
  );

  const [toDate, setToDate] = React.useState(
    getYesterday()
  );

  const [historyMode, setHistoryMode] = React.useState("single");

  // =======================================================
  // QUICK DATE SELECTION
  // =======================================================

  const handleYesterday = () => {
    const yesterday = getYesterday();

    setHistoryMode("single");
    setSelectedDate(yesterday);
  };

  const handleLastWeek = () => {
    setHistoryMode("range");
    setFromDate(getSevenDaysAgo());
    setToDate(getYesterday());
  };

  const handleLastYear = () => {
    setHistoryMode("single");
    setSelectedDate(getOneYearAgo());
  };

  const handleToday = () => {
    setHistoryMode("single");
    setSelectedDate(getToday());
  };

  // =======================================================
  // REFRESH PROTOTYPE DATA
  // =======================================================

  const handleRefresh = () => {
    if (historyMode === "single") {
      setSelectedDate(selectedDate);
    } else {
      setFromDate(fromDate);
      setToDate(toDate);
    }
  };

  return (
    <div className="mt-3">

      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div className="flex items-center gap-4">

          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdCloud className="h-8 w-8" />
          </div>

          <div>
            <p className="mt-1 text-sm text-black dark:text-white">
              Monitor weather and marine conditions affecting port operations.
            </p>
          </div>

        </div>

      </div>

  



      {/* =====================================================
          CURRENT WEATHER
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">

        {/* Main Weather Card */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800 xl:col-span-2">

          <div className="flex flex-col justify-between gap-5 md:flex-row">

            <div>

              <div className="flex items-center gap-2 text-sm text-gray-400">

                <MdLocationOn className="h-5 w-5 text-brand-500" />

                {currentWeather.location}

              </div>

              <div className="mt-4 flex items-center gap-5">

                <MdCloud className="h-20 w-20 text-brand-500" />

                <div>

                  <p className="text-5xl font-bold text-navy-700 dark:text-white">
                    {currentWeather.temperature}°C
                  </p>

                  <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-300">
                    {currentWeather.condition}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Feels like {currentWeather.feelsLike}°C
                  </p>

                </div>

              </div>

            </div>

            <div className="flex flex-col justify-center md:text-right">

              <p className="text-sm text-gray-400">
                Last Updated
              </p>

              <p className="mt-1 font-bold text-navy-700 dark:text-white">
                {currentWeather.updated}
              </p>

              <p className="mt-2 text-xs text-gray-400">
                Prototype observation
              </p>

            </div>

          </div>

        </div>

        {/* Operational Status */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">
              <MdCheckCircle className="h-6 w-6" />
            </div>

            <div>

              <p className="text-sm font-medium text-gray-400">
                Operational Status
              </p>

              <h2 className="mt-1 text-2xl font-bold text-green-500">
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
          value={`${currentWeather.humidity}%`}
          subtitle="Relative humidity"
          icon={<MdWater className="h-6 w-6" />}
        />

        <WeatherMetric
          title="Wind Speed"
          value={`${currentWeather.windSpeed} km/h`}
          subtitle={`Direction: ${currentWeather.windDirection}`}
          icon={<MdAir className="h-6 w-6" />}
        />

        <WeatherMetric
          title="Visibility"
          value={`${currentWeather.visibility} km`}
          subtitle="Estimated visibility"
          icon={<MdVisibility className="h-6 w-6" />}
        />

        <WeatherMetric
          title="Rain Probability"
          value={`${currentWeather.precipitation}%`}
          subtitle="Current probability"
          icon={<MdUmbrella className="h-6 w-6" />}
        />

      </div>

      {/* =====================================================
          WEATHER ANALYTICS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">

          <div className="flex items-center gap-3">

            {/* CLOUD ICON */}

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdCloud className="h-6 w-6" />
            </div>

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Weather Analytics
              </h2>

              <p className="mt-1 text-sm text-black dark:text-white">
                Review historical weather conditions & trends for operational analysis.
              </p>

            </div>

          </div>

          <button
            onClick={handleRefresh}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-4 py-3 text-sm font-bold text-navy-700 transition hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
          >
            <MdRefresh className="h-5 w-5" />
            Refresh
          </button>

        </div>

        {/* ===================================================
            QUICK SELECTION
            =================================================== */}

        <div className="mt-6">

          <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-300">
            Quick selection
          </p>

          <div className="flex flex-wrap gap-3">

            <button
              onClick={handleToday}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                historyMode === "single" &&
                selectedDate === getToday()
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-navy-700 hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
              }`}
            >
              Today
            </button>

            <button
              onClick={handleYesterday}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                historyMode === "single" &&
                selectedDate === getYesterday()
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
                historyMode === "single" &&
                selectedDate === getOneYearAgo()
                  ? "bg-brand-500 text-white"
                  : "bg-lightPrimary text-navy-700 hover:bg-gray-100 dark:bg-navy-700 dark:text-white"
              }`}
            >
              Last Year
            </button>

          </div>

        </div>

        {/* ===================================================
            DATE SELECTION
            =================================================== */}

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
                  onChange={(e) => {
                    setHistoryMode("range");
                    setFromDate(e.target.value);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />

                <input
                  type="date"
                  value={toDate}
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
              Selected period
            </p>

            <p className="mt-1 font-bold text-navy-700 dark:text-white">

              {historyMode === "single"
                ? formatDate(selectedDate)
                : `${formatDate(fromDate)} → ${formatDate(toDate)}`}

            </p>

          </div>

        </div>

        {/* ===================================================
            HISTORICAL WEATHER METRICS
            =================================================== */}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">

          <WeatherMetric
            title="Average Temperature"
            value={`${historicalWeather.temperature}°C`}
            subtitle={`High ${historicalWeather.maxTemperature}°C`}
            icon={<MdThermostat className="h-6 w-6" />}
          />

          <WeatherMetric
            title="Rainfall"
            value={`${historicalWeather.rainfall} mm`}
            subtitle="Recorded precipitation"
            icon={<MdUmbrella className="h-6 w-6" />}
            iconClass="text-blue-500"
          />

          <WeatherMetric
            title="Wind Speed"
            value={`${historicalWeather.windSpeed} km/h`}
            subtitle={`Direction: ${historicalWeather.windDirection}`}
            icon={<MdAir className="h-6 w-6" />}
            iconClass="text-orange-500"
          />

          <WeatherMetric
            title="Visibility"
            value={`${historicalWeather.visibility} km`}
            subtitle={`Pressure ${historicalWeather.pressure} hPa`}
            icon={<MdVisibility className="h-6 w-6" />}
          />

        </div>

        {/* ===================================================
            HISTORICAL DETAIL TABLE
            =================================================== */}

        <div className="mt-6 overflow-x-auto">

          <table className="w-full min-w-[850px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Metric
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Value
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Operational Relevance
                </th>

              </tr>

            </thead>

            <tbody>

              <tr className="border-b border-gray-100 dark:border-white/5">

                <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                  Temperature
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  {historicalWeather.temperature}°C
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  Environmental conditions for port personnel and equipment.
                </td>

              </tr>

              <tr className="border-b border-gray-100 dark:border-white/5">

                <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                  Rainfall
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  {historicalWeather.rainfall} mm
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  May affect cargo handling and truck movement.
                </td>

              </tr>

              <tr className="border-b border-gray-100 dark:border-white/5">

                <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                  Wind
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  {historicalWeather.windSpeed} km/h{" "}
                  ({historicalWeather.windDirection})
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  Relevant to vessel maneuvering and berth operations.
                </td>

              </tr>

              <tr className="border-b border-gray-100 dark:border-white/5">

                <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                  Visibility
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  {historicalWeather.visibility} km
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  Relevant to navigation and vessel safety.
                </td>

              </tr>

              <tr>

                <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                  Wave Height
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  {historicalWeather.waveHeight} m
                </td>

                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                  Relevant to marine conditions and vessel movement.
                </td>

              </tr>

            </tbody>

          </table>

        </div>

      </div>

      {/* =====================================================
          MARINE CONDITIONS
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex items-center gap-3">

          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">
            <MdWaves className="h-6 w-6" />
          </div>

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Marine Conditions
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Conditions relevant to vessel movement and port operations.
            </p>

          </div>

        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <MdWaves className="h-6 w-6 text-brand-500" />

            <p className="mt-4 text-sm text-gray-400">
              Wave Height
            </p>

            <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
              {marineConditions.waveHeight} m
            </p>

          </div>

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <MdAccessTime className="h-6 w-6 text-brand-500" />

            <p className="mt-4 text-sm text-gray-400">
              Swell Period
            </p>

            <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
              {marineConditions.swellPeriod} s
            </p>

          </div>

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <MdWaves className="h-6 w-6 text-brand-500" />

            <p className="mt-4 text-sm text-gray-400">
              Sea Condition
            </p>

            <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
              {marineConditions.seaCondition}
            </p>

          </div>

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <MdThermostat className="h-6 w-6 text-brand-500" />

            <p className="mt-4 text-sm text-gray-400">
              Water Temperature
            </p>

            <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
              {marineConditions.waterTemperature}°C
            </p>

          </div>

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <MdAir className="h-6 w-6 text-brand-500" />

            <p className="mt-4 text-sm text-gray-400">
              Wind
            </p>

            <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
              {marineConditions.windSpeed} km/h
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {marineConditions.windDirection}
            </p>

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
              Short-term weather conditions for port operations.
            </p>

          </div>

          <MdAccessTime className="h-8 w-8 text-brand-500" />

        </div>

        <div className="mt-6 overflow-x-auto">

          <table className="w-full min-w-[700px]">

            <thead>

              <tr className="border-b border-gray-200 dark:border-white/10">

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Time
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Temperature
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Rain Probability
                </th>

                <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                  Wind Speed
                </th>

              </tr>

            </thead>

            <tbody>

              {hourlyWeather.map((item) => (

                <tr
                  key={item.time}
                  className="border-b border-gray-100 last:border-0 dark:border-white/5"
                >

                  <td className="px-4 py-4 font-bold text-navy-700 dark:text-white">
                    {item.time}
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {item.temperature}°C
                  </td>

                  <td className="px-4 py-4">

                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                      {item.rain}%
                    </span>

                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {item.wind} km/h
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

      {/* =====================================================
          7-DAY FORECAST
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        {/* Forecast Header */}

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

        {/* Forecast Cards */}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">

          {forecastData.map((day) => (

            <div
              key={day.day}
              className="flex min-w-0 flex-col rounded-xl bg-lightPrimary p-5 text-center dark:bg-navy-700"
            >

              {/* Day */}

              <p className="min-h-[24px] whitespace-nowrap font-bold text-navy-700 dark:text-white">
                {day.day}
              </p>

              {/* Weather Icon */}

              <div className="flex h-16 items-center justify-center">

                <MdCloud className="h-9 w-9 text-brand-500" />

              </div>

              {/* Condition */}

              <div className="flex h-[48px] items-start justify-center">

                <p className="text-sm font-medium leading-6 text-gray-500 dark:text-gray-300">
                  {day.condition}
                </p>

              </div>

              {/* Temperature */}

              <p className="mt-3 text-2xl font-bold text-navy-700 dark:text-white">
                {day.temperature}°
              </p>

              {/* Low Temperature */}

              <p className="mt-1 text-xs text-gray-400">
                Low {day.low}°
              </p>

              {/* Divider */}

              <div className="my-4 h-px w-full bg-gray-200 dark:bg-white/10" />

              {/* Rain */}

              <div className="flex items-center justify-center">

                <span className="whitespace-nowrap rounded-full bg-blue-100 px-3 py-2 text-xs font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  Rain {day.rain}%
                </span>

              </div>

            </div>

          ))}

        </div>

      </div>

      {/* =====================================================
          WEATHER-BASED OPERATIONAL MONITORING
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-orange-50 p-6 dark:bg-orange-500/10">

        <div className="flex items-start gap-4">

          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500 dark:bg-orange-500/20">
            <MdWarning className="h-6 w-6" />
          </div>

          <div>

            <h2 className="font-bold text-orange-600 dark:text-orange-400">
              Weather-Based Operational Monitoring
            </h2>

            <p className="mt-2 text-sm leading-6 text-orange-500">
              Weather conditions can influence vessel maneuvering, berth
              operations, cargo handling, truck movement and overall port
              safety. Future versions can automatically generate operational
              alerts when wind, rainfall, visibility or marine conditions
              cross configured thresholds.
            </p>

          </div>

        </div>

      </div>

      {/* =====================================================
          FUTURE API INTEGRATION
          ===================================================== */}

      <div className="mt-5 rounded-[20px] border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdCloud className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-500" />

          <p className="text-sm leading-6 text-gray-500 dark:text-gray-300">

            <span className="font-bold text-navy-700 dark:text-white">
              Future integration:
            </span>{" "}

            Current and historical weather data will later be retrieved
            through the FastAPI backend. The backend can connect to a
            weather service, store selected observations in PostgreSQL,
            and provide them to the React.js interface for operational
            analysis.

          </p>

        </div>

      </div>

    </div>
  );
};

export default Weather;
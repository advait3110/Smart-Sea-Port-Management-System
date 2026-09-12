import React from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

import {
  MdAnalytics,
  MdDirectionsBoat,
  MdInventory,
  MdAnchor,
  MdLocalShipping,
  MdWarning,
  MdTrendingUp,
  MdTrendingDown,
  MdCalendarMonth,
  MdAssessment,
  MdHistory,
  MdRefresh,
  MdChevronLeft,
  MdChevronRight,
} from "react-icons/md";

// =========================================================
// DEMONSTRATION ANALYTICS DATA
// =========================================================
//
// Prototype frontend data.
// This will later be replaced by data received from
// FastAPI + PostgreSQL.
//
// =========================================================

// =========================================================
// MONTHLY CARGO DATA
// =========================================================

const monthlyCargoData = [
  { month: "Jan", importCargo: 3250, exportCargo: 2180 },
  { month: "Feb", importCargo: 3480, exportCargo: 2310 },
  { month: "Mar", importCargo: 3720, exportCargo: 2450 },
  { month: "Apr", importCargo: 3910, exportCargo: 2580 },
  { month: "May", importCargo: 4180, exportCargo: 2740 },
  { month: "Jun", importCargo: 4020, exportCargo: 2890 },
  { month: "Jul", importCargo: 4380, exportCargo: 3010 },
  { month: "Aug", importCargo: 4280, exportCargo: 2960 },
];

// =========================================================
// VESSEL TRAFFIC DATA
// =========================================================

const vesselTrafficData = [
  { month: "Jan", vessels: 42 },
  { month: "Feb", vessels: 46 },
  { month: "Mar", vessels: 51 },
  { month: "Apr", vessels: 48 },
  { month: "May", vessels: 56 },
  { month: "Jun", vessels: 61 },
  { month: "Jul", vessels: 65 },
  { month: "Aug", vessels: 63 },
];

// =========================================================
// CARGO DISTRIBUTION
// =========================================================

const cargoDistribution = [
  { name: "Import", value: 2540 },
  { name: "Export", value: 1740 },
];

// =========================================================
// BERTH UTILIZATION
// =========================================================

const berthUtilizationData = [
  { day: "Mon", utilization: 61 },
  { day: "Tue", utilization: 65 },
  { day: "Wed", utilization: 72 },
  { day: "Thu", utilization: 68 },
  { day: "Fri", utilization: 75 },
  { day: "Sat", utilization: 71 },
  { day: "Sun", utilization: 64 },
];

// =========================================================
// GATE ACTIVITY
// =========================================================

const gateActivityData = [
  { day: "Mon", entries: 118, exits: 91 },
  { day: "Tue", entries: 132, exits: 102 },
  { day: "Wed", entries: 141, exits: 110 },
  { day: "Thu", entries: 124, exits: 96 },
  { day: "Fri", entries: 156, exits: 121 },
  { day: "Sat", entries: 137, exits: 108 },
  { day: "Sun", entries: 105, exits: 82 },
];

// =========================================================
// ALERT DISTRIBUTION
// =========================================================

const alertData = [
  { name: "Critical", value: 1 },
  { name: "Warning", value: 2 },
  { name: "Attention", value: 1 },
  { name: "Information", value: 3 },
];

// =========================================================
// VESSEL TYPE DISTRIBUTION
// =========================================================

const vesselTypeData = [
  { type: "Bitumen Tanker", vessels: 6 },
  { type: "Bulk Carrier", vessels: 3 },
  { type: "Cargo Vessel", vessels: 2 },
  { type: "Oil Products Tanker", vessels: 1 },
  { type: "Offshore Support", vessels: 2 },
  { type: "Tug", vessels: 1 },
];

// =========================================================
// OPERATIONAL PERFORMANCE
// =========================================================

const operationalPerformance = [
  { subject: "Berth", value: 82 },
  { subject: "Cargo", value: 76 },
  { subject: "Gate", value: 88 },
  { subject: "Vessel", value: 79 },
  { subject: "Safety", value: 91 },
];

// =========================================================
// HELPER FUNCTIONS
// =========================================================

const formatDate = (date) => {
  if (!date) return "";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatInputDate = (date) => {
  if (!date) return "";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const sameDay = (date1, date2) => {
  if (!date1 || !date2) return false;

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (date) => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

// =========================================================
// CALENDAR COMPONENT
// =========================================================

const DateCalendar = ({
  value,
  onChange,
  minDate,
  maxDate,
  selectingLabel,
}) => {
  const [viewDate, setViewDate] = React.useState(
    value ? new Date(value) : new Date()
  );

  React.useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const previousMonthDays = new Date(year, month, 0).getDate();

  const calendarDays = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({
      date: new Date(year, month - 1, previousMonthDays - i),
      currentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({
      date: new Date(year, month, day),
      currentMonth: true,
    });
  }

  let nextDay = 1;

  while (calendarDays.length < 42) {
    calendarDays.push({
      date: new Date(year, month + 1, nextDay),
      currentMonth: false,
    });

    nextDay++;
  }

  const monthName = viewDate.toLocaleDateString("en-US", {
    month: "long",
  });

  const goPreviousMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const goNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const isDisabled = (date) => {
    if (minDate && startOfDay(date) < startOfDay(minDate)) {
      return true;
    }

    if (maxDate && startOfDay(date) > startOfDay(maxDate)) {
      return true;
    }

    return false;
  };

  return (
    <div className="absolute left-0 top-full z-[100] mt-3 w-[350px] rounded-[20px] border border-gray-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-navy-800">

      {/* Calendar Header */}

      <div className="flex items-center justify-between">

        <button
          type="button"
          onClick={goPreviousMonth}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition hover:bg-lightPrimary hover:text-brand-500 dark:hover:bg-navy-700"
        >
          <MdChevronLeft className="h-6 w-6" />
        </button>

        <div className="text-center">

          <p className="text-lg font-bold text-navy-700 dark:text-white">
            {monthName}
          </p>

          <p className="text-sm text-gray-400">
            {year}
          </p>

        </div>

        <button
          type="button"
          onClick={goNextMonth}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition hover:bg-lightPrimary hover:text-brand-500 dark:hover:bg-navy-700"
        >
          <MdChevronRight className="h-6 w-6" />
        </button>

      </div>

      {/* Selection indicator */}

      <div className="mt-4 rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">

        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          {selectingLabel}
        </p>

        <p className="mt-1 text-sm font-bold text-navy-700 dark:text-white">
          {value ? formatDate(value) : "Select a date"}
        </p>

      </div>

      {/* Weekdays */}

      <div className="mt-5 grid grid-cols-7 gap-1">

        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
          (day) => (
            <div
              key={day}
              className={`py-2 text-center text-xs font-bold ${
                day === "Sun"
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              {day}
            </div>
          )
        )}

      </div>

      {/* Calendar days */}

      <div className="grid grid-cols-7 gap-1">

        {calendarDays.map((item, index) => {

          const selected = sameDay(item.date, value);

          const disabled = isDisabled(item.date);

          const sunday = item.date.getDay() === 0;

          return (
            <button
              type="button"
              key={`${item.date.toISOString()}-${index}`}
              disabled={disabled}
              onClick={() => {
                if (!disabled) {
                  onChange(item.date);
                }
              }}
              className={`flex h-9 items-center justify-center rounded-lg text-sm font-medium transition ${
                selected
                  ? "bg-brand-500 text-white"
                  : item.currentMonth
                  ? sunday
                    ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    : "text-navy-700 hover:bg-lightPrimary dark:text-white dark:hover:bg-navy-700"
                  : "text-gray-300 dark:text-gray-600"
              } ${
                disabled
                  ? "cursor-not-allowed opacity-30"
                  : "cursor-pointer"
              }`}
            >
              {item.date.getDate()}
            </button>
          );
        })}

      </div>

    </div>
  );
};

// =========================================================
// DATE PICKER
// =========================================================

const DatePicker = ({
  value,
  onChange,
  label,
  minDate,
  maxDate,
  selectingLabel,
}) => {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const closeCalendar = (event) => {
      if (!event.target.closest(".analytics-date-picker")) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeCalendar);

    return () => {
      document.removeEventListener("mousedown", closeCalendar);
    };
  }, []);

  return (
    <div className="analytics-date-picker relative">

      <div className="mb-2 flex items-center gap-2">

        <MdCalendarMonth className="h-5 w-5 text-brand-500" />

        <span className="text-sm font-medium text-gray-400">
          {label}
        </span>

      </div>

      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className={`flex h-16 w-full items-center justify-between rounded-2xl border bg-white px-5 text-left transition dark:bg-navy-800 ${
          open
            ? "border-brand-500 ring-2 ring-brand-500/20"
            : "border-gray-200 hover:border-brand-300 dark:border-white/10"
        }`}
      >

        <span className="text-base font-medium text-navy-700 dark:text-white">
          {formatInputDate(value)}
        </span>

        <MdCalendarMonth className="h-6 w-6 text-gray-400" />

      </button>

      {open && (
        <DateCalendar
          value={value}
          onChange={(date) => {
            onChange(date);
            setOpen(false);
          }}
          minDate={minDate}
          maxDate={maxDate}
          selectingLabel={selectingLabel}
        />
      )}

    </div>
  );
};

// =========================================================
// CHART CARD
// =========================================================

const ChartCard = ({
  title,
  description,
  children,
}) => {
  return (
    <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

      <div className="mb-5">

        <h2 className="text-xl font-bold text-navy-700 dark:text-white">
          {title}
        </h2>

        <p className="mt-1 text-sm text-gray-400">
          {description}
        </p>

      </div>

      <div className="h-[320px] w-full">
        {children}
      </div>

    </div>
  );
};

// =========================================================
// ANALYTICS PAGE
// =========================================================

const Analytics = () => {

  // =======================================================
  // PERIOD STATE
  // =======================================================

  const [period, setPeriod] = React.useState("Monthly");

  // =======================================================
  // DATE STATE
  // =======================================================

  const today = startOfDay(new Date());

  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(today);

  // =======================================================
  // QUICK SELECTION
  // =======================================================

  const applyQuickSelection = (selection) => {

    const currentDate = startOfDay(new Date());

    let start = currentDate;
    let end = currentDate;

    switch (selection) {

      case "Today":
        start = currentDate;
        end = currentDate;
        break;

      case "Yesterday": {
        start = new Date(currentDate);
        start.setDate(start.getDate() - 1);

        end = new Date(start);
        break;
      }

      case "Last 7 Days":
        start = new Date(currentDate);
        start.setDate(start.getDate() - 6);

        end = currentDate;
        break;

      case "Last 30 Days":
        start = new Date(currentDate);
        start.setDate(start.getDate() - 29);

        end = currentDate;
        break;

      case "Last Year":
        start = new Date(currentDate);
        start.setFullYear(start.getFullYear() - 1);

        end = currentDate;
        break;

      default:
        break;
    }

    setStartDate(start);
    setEndDate(end);
  };

  // =======================================================
  // RESET
  // =======================================================

  const resetFilters = () => {

    const currentDate = startOfDay(new Date());

    setPeriod("Monthly");
    setStartDate(currentDate);
    setEndDate(currentDate);
  };

  // =======================================================
  // DATE HANDLERS
  // =======================================================

  const handleStartDateChange = (date) => {

    setStartDate(date);

    if (endDate && startOfDay(date) > startOfDay(endDate)) {
      setEndDate(date);
    }
  };

  const handleEndDateChange = (date) => {

    if (startDate && startOfDay(date) < startOfDay(startDate)) {
      setStartDate(date);
    }

    setEndDate(date);
  };

  // =======================================================
  // SELECTED PERIOD LABEL
  // =======================================================

  const getSelectedPeriodLabel = () => {

    if (sameDay(startDate, endDate)) {
      if (sameDay(startDate, today)) {
        return "Today";
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (sameDay(startDate, yesterday)) {
        return "Yesterday";
      }

      return formatDate(startDate);
    }

    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  };

  // =======================================================
  // DERIVED VALUES
  // =======================================================

  const latestCargo =
    monthlyCargoData[monthlyCargoData.length - 1];

  const importCargo =
    cargoDistribution.find(
      (item) => item.name === "Import"
    )?.value || 0;

  const exportCargo =
    cargoDistribution.find(
      (item) => item.name === "Export"
    )?.value || 0;

  const importExportRatio =
    exportCargo > 0
      ? (importCargo / exportCargo).toFixed(2)
      : "0.00";

  const highestBerthUtilization =
    Math.max(
      ...berthUtilizationData.map(
        (item) => item.utilization
      )
    );

  const highestGateEntries =
    Math.max(
      ...gateActivityData.map(
        (item) => item.entries
      )
    );

  const totalAlerts =
    alertData.reduce(
      (total, item) => total + item.value,
      0
    );

  const totalCargo =
    importCargo + exportCargo;

  const importShare =
    totalCargo > 0
      ? ((importCargo / totalCargo) * 100).toFixed(1)
      : "0.0";

  const exportShare =
    totalCargo > 0
      ? ((exportCargo / totalCargo) * 100).toFixed(1)
      : "0.0";

  // =======================================================
  // PAGE
  // =======================================================

  return (
    <div className="mt-3">

      {/* =================================================
          PAGE HEADER
          ================================================= */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div className="flex items-center gap-4">

          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">

            <MdAnalytics className="h-8 w-8" />

          </div>

          <div>

            {/* ONLY ONE ANALYTICS & STATISTICS HEADING */}

            <h1 className="text-3xl font-bold text-navy-700 dark:text-white">
              Port Statistics
            </h1>

            <p className="mt-1 text-sm text-black dark:text-white">
              Operational statistics, trends and performance insights for Karwar Port.
            </p>

          </div>

        </div>

      </div>

      {/* =================================================
          HISTORICAL ANALYTICS
          ================================================= */}

      <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        {/* Section Header */}

        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">

          <div className="flex items-center gap-4">

            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">

              <MdHistory className="h-8 w-8" />

            </div>

            <div>

              <h2 className="text-2xl font-bold text-navy-700 dark:text-white">
                Historical Analytics
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Analyze port performance for a selected date or period.
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-5 py-3 text-sm font-bold text-navy-700 transition hover:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          >

            <MdRefresh className="h-5 w-5" />

            Reset

          </button>

        </div>

        {/* Quick Selection */}

        <div className="mt-8">

          <p className="mb-4 text-sm font-medium text-gray-400">
            Quick selection
          </p>

          <div className="flex flex-wrap gap-3">

            {[
              "Today",
              "Yesterday",
              "Last 7 Days",
              "Last 30 Days",
              "Last Year",
            ].map((item) => {

              const selected =
                item === "Today" &&
                sameDay(startDate, today) &&
                sameDay(endDate, today);

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    applyQuickSelection(item)
                  }
                  className={`rounded-xl px-6 py-3 text-sm font-bold transition ${
                    selected
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-lightPrimary text-navy-700 hover:bg-brand-50 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                  }`}
                >
                  {item}
                </button>
              );
            })}

          </div>

        </div>

        {/* Date Selection Area */}

        <div className="mt-8 rounded-[20px] bg-lightPrimary p-6 dark:bg-navy-700">

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* Start Date */}

            <DatePicker
              value={startDate}
              onChange={handleStartDateChange}
              label="Start Date"
              maxDate={endDate}
              selectingLabel="SELECTING START DATE"
            />

            {/* End Date */}

            <DatePicker
              value={endDate}
              onChange={handleEndDateChange}
              label="End Date"
              minDate={startDate}
              maxDate={today}
              selectingLabel="SELECTING END DATE"
            />

          </div>

          {/* Selected Period */}

          <div className="mt-5 rounded-2xl bg-white p-6 dark:bg-navy-800">

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Selected Period
                </p>

                <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
                  {getSelectedPeriodLabel()}
                </p>

              </div>

              <span className="w-fit rounded-full bg-lightPrimary px-5 py-3 text-sm font-bold text-brand-500 dark:bg-navy-700">
                {sameDay(startDate, endDate)
                  ? `${getSelectedPeriodLabel()} Analysis`
                  : `${period} Analysis`}
              </span>

            </div>

          </div>

        </div>

      </div>

      {/* =================================================
          DEMONSTRATION NOTICE
          ================================================= */}

      <div className="mt-5 rounded-[20px] border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdAssessment className="mt-0.5 h-6 w-6 text-blue-500" />

          <div>

            <p className="font-medium text-blue-600 dark:text-blue-300">
              Demonstration analytics — {getSelectedPeriodLabel()}
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-500 dark:text-blue-200">
              The statistics shown here are prototype data for demonstrating
              the Smart Sea Port Management System. They are not live or
              confidential Karwar Port operational statistics.
            </p>

          </div>

        </div>

      </div>

      {/* =================================================
          KPI SUMMARY
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

        {/* Cargo */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Cargo Handled
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {latestCargo.importCargo.toLocaleString()} MT
              </h2>

              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-green-500">

                <MdTrendingUp />

                8.4% this month

              </p>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdInventory className="h-6 w-6" />

            </div>

          </div>

        </div>

        {/* Vessel Calls */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Vessel Calls
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                {vesselTrafficData[
                  vesselTrafficData.length - 1
                ].vessels}
              </h2>

              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-green-500">

                <MdTrendingUp />

                5.2% this month

              </p>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdDirectionsBoat className="h-6 w-6" />

            </div>

          </div>

        </div>

        {/* Berth */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Berth Utilization
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                68%
              </h2>

              <p className="mt-2 text-xs font-medium text-gray-400">
                Current utilization
              </p>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdAnchor className="h-6 w-6" />

            </div>

          </div>

        </div>

        {/* Gate */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-gray-400">
                Gate Movements
              </p>

              <h2 className="mt-2 text-3xl font-bold text-navy-700 dark:text-white">
                211
              </h2>

              <p className="mt-2 text-xs font-medium text-gray-400">
                Today's entries + exits
              </p>

            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

              <MdLocalShipping className="h-6 w-6" />

            </div>

          </div>

        </div>

      </div>

      {/* =================================================
          IMPORT / EXPORT ANALYTICS
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">

        {/* Ratio */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                Import / Export Ratio
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                Current cargo balance
              </p>

            </div>

            <MdAssessment className="h-8 w-8 text-brand-500" />

          </div>

          <div className="mt-8">

            <p className="text-4xl font-bold text-navy-700 dark:text-white">
              {importExportRatio} : 1
            </p>

            <p className="mt-1 text-sm text-gray-400">
              Import : Export
            </p>

            {/* Import */}

            <div className="mt-7">

              <div className="mb-2 flex items-center justify-between">

                <span className="text-sm font-medium text-gray-500">
                  Import
                </span>

                <span className="text-sm font-bold text-navy-700 dark:text-white">
                  {importCargo.toLocaleString()} MT
                </span>

              </div>

              <div className="h-3 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">

                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{
                    width: `${(
                      (importCargo / totalCargo) *
                      100
                    ).toFixed(1)}%`,
                  }}
                />

              </div>

            </div>

            {/* Export */}

            <div className="mt-5">

              <div className="mb-2 flex items-center justify-between">

                <span className="text-sm font-medium text-gray-500">
                  Export
                </span>

                <span className="text-sm font-bold text-navy-700 dark:text-white">
                  {exportCargo.toLocaleString()} MT
                </span>

              </div>

              <div className="h-3 overflow-hidden rounded-full bg-lightPrimary dark:bg-navy-700">

                <div
                  className="h-full rounded-full bg-green-500"
                  style={{
                    width: `${(
                      (exportCargo / totalCargo) *
                      100
                    ).toFixed(1)}%`,
                  }}
                />

              </div>

            </div>

          </div>

        </div>

        {/* Import Share */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <p className="text-sm font-medium text-gray-400">
            Import Share
          </p>

          <p className="mt-3 text-4xl font-bold text-brand-500">
            {importShare}%
          </p>

          <p className="mt-2 text-sm text-gray-400">
            Of total cargo represented in the prototype dataset.
          </p>

          <div className="mt-8 flex items-center gap-3">

            <MdTrendingUp className="h-7 w-7 text-brand-500" />

            <div>

              <p className="text-sm font-bold text-navy-700 dark:text-white">
                {importCargo.toLocaleString()} MT
              </p>

              <p className="text-xs text-gray-400">
                Import volume
              </p>

            </div>

          </div>

        </div>

        {/* Export Share */}

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

          <p className="text-sm font-medium text-gray-400">
            Export Share
          </p>

          <p className="mt-3 text-4xl font-bold text-green-500">
            {exportShare}%
          </p>

          <p className="mt-2 text-sm text-gray-400">
            Of total cargo represented in the prototype dataset.
          </p>

          <div className="mt-8 flex items-center gap-3">

            <MdTrendingDown className="h-7 w-7 text-green-500" />

            <div>

              <p className="text-sm font-bold text-navy-700 dark:text-white">
                {exportCargo.toLocaleString()} MT
              </p>

              <p className="text-xs text-gray-400">
                Export volume
              </p>

            </div>

          </div>

        </div>

      </div>

      {/* =================================================
          ROW 1
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        <ChartCard
          title="Monthly Cargo Handling"
          description="Import and export cargo handled over the year."
        >

          <ResponsiveContainer width="100%" height="100%">

            <BarChart data={monthlyCargoData}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="month" />

              <YAxis />

              <Tooltip />

              <Legend />

              <Bar
                dataKey="importCargo"
                name="Import"
                fill="#4318FF"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="exportCargo"
                name="Export"
                fill="#05CD99"
                radius={[6, 6, 0, 0]}
              />

            </BarChart>

          </ResponsiveContainer>

        </ChartCard>

        <ChartCard
          title="Vessel Traffic Trend"
          description="Monthly vessel calls recorded by the port."
        >

          <ResponsiveContainer width="100%" height="100%">

            <LineChart data={vesselTrafficData}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="month" />

              <YAxis />

              <Tooltip />

              <Legend />

              <Line
                type="monotone"
                dataKey="vessels"
                name="Vessel Calls"
                stroke="#4318FF"
                strokeWidth={3}
                dot={{ r: 5 }}
              />

            </LineChart>

          </ResponsiveContainer>

        </ChartCard>

      </div>

      {/* =================================================
          ROW 2
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        <ChartCard
          title="Cargo Composition"
          description="Current distribution between import and export cargo."
        >

          <ResponsiveContainer width="100%" height="100%">

            <PieChart>

              <Pie
                data={cargoDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={105}
                label
              >

                {cargoDistribution.map(
                  (entry, index) => (

                    <Cell
                      key={`cargo-${index}`}
                      fill={
                        index === 0
                          ? "#4318FF"
                          : "#05CD99"
                      }
                    />

                  )
                )}

              </Pie>

              <Tooltip />

              <Legend />

            </PieChart>

          </ResponsiveContainer>

        </ChartCard>

        <ChartCard
          title="Weekly Berth Utilization"
          description="Daily berth utilization percentage."
        >

          <ResponsiveContainer width="100%" height="100%">

            <AreaChart data={berthUtilizationData}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" />

              <YAxis domain={[0, 100]} />

              <Tooltip />

              <Legend />

              <Area
                type="monotone"
                dataKey="utilization"
                name="Utilization %"
                stroke="#4318FF"
                fill="#4318FF"
                fillOpacity={0.18}
                strokeWidth={3}
              />

            </AreaChart>

          </ResponsiveContainer>

        </ChartCard>

      </div>

      {/* =================================================
          ROW 3
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        <ChartCard
          title="Gate Activity"
          description="Daily truck entries and exits."
        >

          <ResponsiveContainer width="100%" height="100%">

            <BarChart data={gateActivityData}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" />

              <YAxis />

              <Tooltip />

              <Legend />

              <Bar
                dataKey="entries"
                name="Entries"
                fill="#4318FF"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="exits"
                name="Exits"
                fill="#FFB547"
                radius={[6, 6, 0, 0]}
              />

            </BarChart>

          </ResponsiveContainer>

        </ChartCard>

        <ChartCard
          title="Alert Distribution"
          description="Current alerts grouped by severity."
        >

          <ResponsiveContainer width="100%" height="100%">

            <PieChart>

              <Pie
                data={alertData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={105}
                label
              >

                {alertData.map(
                  (entry, index) => (

                    <Cell
                      key={`alert-${index}`}
                      fill={
                        index === 0
                          ? "#EE5D50"
                          : index === 1
                          ? "#FF9B52"
                          : index === 2
                          ? "#FFB547"
                          : "#4318FF"
                      }
                    />

                  )
                )}

              </Pie>

              <Tooltip />

              <Legend />

            </PieChart>

          </ResponsiveContainer>

        </ChartCard>

      </div>

      {/* =================================================
          ROW 4
          ================================================= */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">

        <ChartCard
          title="Vessel Type Distribution"
          description="Vessel categories represented in the prototype dataset."
        >

          <ResponsiveContainer width="100%" height="100%">

            <BarChart
              data={vesselTypeData}
              layout="vertical"
              margin={{
                left: 30,
                right: 20,
              }}
            >

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis type="number" />

              <YAxis
                type="category"
                dataKey="type"
                width={130}
              />

              <Tooltip />

              <Bar
                dataKey="vessels"
                name="Vessels"
                fill="#4318FF"
                radius={[0, 6, 6, 0]}
              />

            </BarChart>

          </ResponsiveContainer>

        </ChartCard>

        <ChartCard
          title="Operational Performance"
          description="Prototype performance indicators across major port functions."
        >

          <ResponsiveContainer width="100%" height="100%">

            <RadarChart data={operationalPerformance}>

              <PolarGrid />

              <PolarAngleAxis dataKey="subject" />

              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
              />

              <Radar
                name="Performance"
                dataKey="value"
                stroke="#4318FF"
                fill="#4318FF"
                fillOpacity={0.25}
              />

              <Tooltip />

            </RadarChart>

          </ResponsiveContainer>

        </ChartCard>

      </div>

      {/* =================================================
          OPERATIONAL INSIGHTS
          ================================================= */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-lightPrimary text-brand-500">

            <MdAnalytics className="h-6 w-6" />

          </div>

          <div>

            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Operational Insights
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Key observations from the demonstration dataset.
            </p>

          </div>

        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Highest Berth */}

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <p className="text-sm font-medium text-gray-400">
              Highest Berth Utilization
            </p>

            <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
              {highestBerthUtilization}%
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Highest utilization recorded during the prototype week.
            </p>

          </div>

          {/* Highest Gate */}

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <p className="text-sm font-medium text-gray-400">
              Highest Gate Activity
            </p>

            <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
              {highestGateEntries}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Highest truck entry count recorded during the prototype week.
            </p>

          </div>

          {/* Alerts */}

          <div className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700">

            <p className="text-sm font-medium text-gray-400">
              Active Alerts
            </p>

            <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-red-500">

              <MdWarning className="h-6 w-6" />

              {totalAlerts}

            </p>

            <p className="mt-1 text-xs text-gray-400">
              Alerts represented in the prototype dataset.
            </p>

          </div>

        </div>

      </div>

      {/* =================================================
          FUTURE BACKEND INTEGRATION
          ================================================= */}

      <div className="mt-5 rounded-[20px] border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800">

        <div className="flex items-start gap-3">

          <MdAnalytics className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-500" />

          <p className="text-sm leading-6 text-gray-500 dark:text-gray-300">

            <span className="font-bold text-navy-700 dark:text-white">
              Future backend integration:
            </span>{" "}

            These charts and statistics currently use frontend demonstration
            data. During backend development, they will consume aggregated
            operational data from the FastAPI backend and PostgreSQL database.
            The selected date range and analysis period will determine the
            analytics returned by the backend.

          </p>

        </div>

      </div>

    </div>
  );
};

export default Analytics;
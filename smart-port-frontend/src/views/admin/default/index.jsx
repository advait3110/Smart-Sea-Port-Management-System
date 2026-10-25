import React from "react";

import { Link } from "react-router-dom";

import {
  MdDirectionsBoat,
  MdAnchor,
  MdLocalShipping,
  MdWarning,
  MdBuild,
  MdInventory2,
  MdCloud,
  MdNotifications,
  MdReportProblem,
  MdRefresh,
  MdLock,
} from "react-icons/md";

import { apiGet } from "services/api";

import authService from "layouts/auth/authService";

import { hasModuleAccess } from "layouts/auth/permissions";

import {
  BERTH_POOL,
  assignBerths,
  listAvailableBerths,
} from "../Berths/berthNumbers";

// =========================================================
// PORT DASHBOARD (Port of Singapore)
// =========================================================
//
// Every figure on this page is worked out from the port's own
// records: vessels, cargo, gate trucks, incidents, equipment,
// notifications, published throughput and live weather. The berth
// figures come from the ships at berth and the berth numbers of
// Berth Management (one shared file gives the numbers to both
// pages). Nothing here is sample data. When nobody has entered
// anything yet, the page shows 0 or an empty message.
//
// Each part is loaded on its own. If your account is not allowed
// to read one of them (for example the gate records need the
// Gate & Truck feature), only that part says so.

const PORT_TIME_ZONE = "Asia/Singapore";

const REFRESH_MS = 60 * 1000;

const WEATHER_REFRESH_MS = 10 * 60 * 1000;

// Vacant berth numbers written out in the Berth status panel.
const VACANT_SHOWN = 12;

const SOURCES = [
  { key: "vessels", path: "/vessels" },
  { key: "cargo", path: "/cargo" },
  { key: "container", path: "/throughput?metric=container" },
  { key: "cargoYears", path: "/throughput?metric=cargo" },
  { key: "trucks", path: "/trucks" },
  { key: "incidents", path: "/incidents" },
  { key: "assets", path: "/assets" },
  { key: "notifications", path: "/notifications" },
  { key: "weather", path: "/weather", slow: true },
];

const INCIDENT_STATUSES = [
  "Reported",
  "Under Investigation",
  "Action Required",
  "Resolved",
  "Closed",
];

const INCIDENT_FINISHED = ["Resolved", "Closed"];

const COLORS = {
  blue: "#3b82f6",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  grey: "#94a3b8",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#8b5cf6",
};

const CYCLE = [
  COLORS.blue,
  COLORS.purple,
  COLORS.amber,
  COLORS.green,
  COLORS.cyan,
  COLORS.red,
  COLORS.grey,
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEATHER_WORDS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

// =========================================================
// SMALL HELPERS
// =========================================================

// Most lists come back as a plain array. A few come wrapped
// (for example { incidents: [...] }), so look inside as well.
const asList = (value, key) => {
  if (Array.isArray(value)) {
    return value;
  }

  const wrappers = [key, "items", "data"];

  for (const name of wrappers) {
    if (name && value && Array.isArray(value[name])) {
      return value[name];
    }
  }

  return [];
};

const num = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value, digits = 0) =>
  num(value).toLocaleString("en-SG", {
    maximumFractionDigits: digits,
  });

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-10-20" for a moment, as a Singapore calendar day.
const dayKey = (value) => {
  if (!value) {
    return "";
  }

  const moment = new Date(value);

  if (Number.isNaN(moment.getTime())) {
    return "";
  }

  return dayKeyFormatter.format(moment);
};

const whenFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: PORT_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const clockFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: PORT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const formatWhen = (value) => {
  if (!value) {
    return "";
  }

  const moment = new Date(value);

  if (Number.isNaN(moment.getTime())) {
    return "";
  }

  return whenFormatter.format(moment);
};

const timeAgo = (value) => {
  if (!value) {
    return "";
  }

  const moment = new Date(value).getTime();

  if (Number.isNaN(moment)) {
    return "";
  }

  const minutes = Math.max(
    0,
    Math.round((Date.now() - moment) / 60000)
  );

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} h ago`;
  }

  return formatWhen(value);
};

const isDenied = (error) =>
  error?.status === 403 ||
  error?.response?.status === 403 ||
  /do not have permission|not have access|only port administrator/i.test(
    String(error?.message || "")
  );

const prettyStatus = (value) => {
  const text = String(value || "Unknown")
    .replace(/[_-]+/g, " ")
    .trim();

  return (
    text.charAt(0).toUpperCase() + text.slice(1)
  );
};

const compass = (degrees) => {
  if (
    degrees === null ||
    degrees === undefined ||
    degrees === "" ||
    !Number.isFinite(Number(degrees))
  ) {
    return "";
  }

  const names = [
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

  const index =
    Math.round(((Number(degrees) % 360) + 360) % 360 / 22.5) % 16;

  return names[index];
};

const countBy = (list, pick) => {
  const counts = new Map();

  list.forEach((item) => {
    const key = pick(item);

    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()].map(([label, value]) => ({
    label,
    value,
  }));
};

// =========================================================
// WORKING OUT THE FIGURES
// =========================================================

// Same wording rule as the Berth Management page:
// "berth" = moored / at a berth, "anchor" = at anchor.
const shipState = (vessel) => {
  const text = String(
    vessel?.status || vessel?.ais_navigation_status || ""
  ).toLowerCase();

  if (text.includes("berth") || text.includes("moored")) {
    return "berth";
  }

  if (text.includes("anchor")) {
    return "anchor";
  }

  if (text.includes("underway") || text.includes("under way")) {
    return "underway";
  }

  return "other";
};

const summariseShips = (vessels, now) => {
  const summary = {
    total: vessels.length,
    berth: 0,
    anchor: 0,
    underway: 0,
    other: 0,
    expected: 0,
  };

  vessels.forEach((vessel) => {
    const state = shipState(vessel);

    summary[state] += 1;

    if (state !== "berth" && state !== "anchor" && vessel?.eta) {
      const eta = new Date(vessel.eta).getTime();

      if (
        Number.isFinite(eta) &&
        eta >= now &&
        eta <= now + 24 * 60 * 60 * 1000
      ) {
        summary.expected += 1;
      }
    }
  });

  return summary;
};

// Berths are worked out from the ships at berth, with exactly the
// berth numbers of the Berth Management page (see
// ../Berths/berthNumbers.js): a berth is available when no ship at
// berth has its number.
const summariseBerths = (vessels) => {
  const moored = vessels
    .filter((vessel) => shipState(vessel) === "berth")
    .map((vessel, index) => {
      const mmsi =
        vessel?.mmsi === null || vessel?.mmsi === undefined
          ? ""
          : String(vessel.mmsi);

      return {
        key: vessel?.id ?? (mmsi || `ship-${index}`),
        mmsi,
        name:
          vessel?.vessel_name ||
          vessel?.ship_name ||
          vessel?.name ||
          (mmsi ? `Vessel ${mmsi}` : "Unnamed vessel"),
      };
    });

  const numbers = assignBerths(moored);

  const occupiedList = moored
    .map((ship) => ({
      ...ship,
      label: numbers.get(ship.key).label,
      slot: numbers.get(ship.key).slot,
    }))
    .sort((a, b) => a.slot - b.slot);

  const availableList = listAvailableBerths(
    occupiedList.map((ship) => ship.slot)
  );

  const occupied = BERTH_POOL - availableList.length;

  return {
    total: BERTH_POOL,
    occupied,
    available: availableList.length,
    percent: Math.round((occupied / BERTH_POOL) * 100),
    occupiedList,
    availableList,
    ships: occupiedList.length,
  };
};

const summariseCargo = (cargo, today) => ({
  total: cargo.length,
  addedToday: cargo.filter(
    (item) => dayKey(item?.created_at) === today
  ).length,
  byStatus: countBy(cargo, (item) =>
    prettyStatus(item?.status)
  ).sort((a, b) => b.value - a.value),
});

// Same reading of a truck as the Gate & Truck Management page.
const entryOf = (truck) =>
  truck?.entry_time ??
  truck?.entry_at ??
  truck?.gate_entry_time ??
  truck?.entered_at ??
  truck?.created_at ??
  null;

const exitOf = (truck) =>
  truck?.exit_time ??
  truck?.exit_at ??
  truck?.gate_exit_time ??
  truck?.exited_at ??
  null;

const truckState = (truck) => {
  const text = String(truck?.status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (["exited", "exit", "out"].includes(text)) {
    return "exited";
  }

  if (["inside_port", "inside", "entered"].includes(text)) {
    return "inside";
  }

  if (["pending", "pending_verification"].includes(text)) {
    return "pending";
  }

  return exitOf(truck) ? "exited" : "inside";
};

const summariseTrucks = (trucks, today) => {
  const rows = trucks.map((truck) => ({
    id: truck?.id,
    state: truckState(truck),
    entry: entryOf(truck),
    exit: exitOf(truck),
    vehicle:
      truck?.vehicle_number ??
      truck?.vehicle_no ??
      truck?.registration_number ??
      truck?.license_plate ??
      truck?.truck_number ??
      "—",
    driver: truck?.driver_name ?? truck?.driver ?? "",
  }));

  const arrived = rows.filter((row) => row.state !== "pending");

  return {
    total: rows.length,
    inside: rows.filter((row) => row.state === "inside").length,
    entriesToday: arrived.filter(
      (row) => dayKey(row.entry) === today
    ).length,
    exitsToday: rows.filter(
      (row) => row.state === "exited" && dayKey(row.exit) === today
    ).length,
    latest: arrived
      .sort(
        (a, b) =>
          new Date(b.exit || b.entry || 0) -
          new Date(a.exit || a.entry || 0)
      )
      .slice(0, 5),
  };
};

const summariseIncidents = (incidents) => {
  const counts = new Map(
    INCIDENT_STATUSES.map((status) => [status, 0])
  );

  incidents.forEach((incident) => {
    const status = incident?.status || "Unknown";

    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const open = incidents.filter(
    (incident) => !INCIDENT_FINISHED.includes(incident?.status)
  );

  return {
    total: incidents.length,
    open: open.length,
    urgent: open.filter(
      (incident) =>
        incident?.severity === "Critical" ||
        incident?.severity === "High"
    ).length,
    byStatus: [...counts.entries()].map(([label, value]) => ({
      label,
      value,
    })),
    latest: incidents.slice(0, 5),
  };
};

const summariseAssets = (payload) => {
  const assets = asList(payload?.assets);

  const given = payload?.summary || {};

  const operational =
    given.operational ??
    assets.filter((asset) => asset?.status === "Operational")
      .length;

  const maintenance =
    given.maintenance ??
    assets.filter((asset) => asset?.status === "Maintenance")
      .length;

  const total = given.total ?? assets.length;

  const jobs = given.jobs || {};

  return {
    total: num(total),
    operational: num(operational),
    maintenance: num(maintenance),
    attention: num(
      given.attention ?? total - operational - maintenance
    ),
    jobs: {
      scheduled: num(jobs.scheduled),
      inProgress: num(jobs.in_progress),
      completed: num(jobs.completed),
      overdue: num(jobs.overdue),
    },
    alerts: asList(payload?.alerts).slice(0, 5),
  };
};

const summariseThroughput = (rows, metric) => {
  const totals = new Map();

  rows.forEach((row) => {
    const period = String(row?.period || "").trim();

    if (period) {
      totals.set(period, (totals.get(period) || 0) + num(row?.value));
    }
  });

  const sorted = [...totals.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  if (metric === "container") {
    return sorted.slice(-12).map(([period, value], index, all) => {
      const [year, month] = period.split("-");

      const monthIndex = Number(month) - 1;

      const showYear =
        index === 0 ||
        monthIndex === 0 ||
        all[index - 1][0].split("-")[0] !== year;

      return {
        label: MONTHS[monthIndex] || period,
        sub: showYear ? year : "",
        title: `${MONTHS[monthIndex] || period} ${year}`,
        value,
      };
    });
  }

  return sorted.slice(-6).map(([period, value]) => ({
    label: period,
    sub: "",
    title: period,
    value,
  }));
};

// =========================================================
// SMALL SCREEN PIECES
// =========================================================

const Panel = ({ title, subtitle, icon, action, children, testId }) => (
  <section
    data-testid={testId}
    className="min-w-0 rounded-[20px] bg-white p-5 shadow-sm transition-colors dark:bg-navy-800"
  >
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-navy-700 dark:text-white">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {action}

        {icon}
      </div>
    </div>

    {children}
  </section>
);

const SectionTitle = ({ children }) => (
  <h3 className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
    {children}
  </h3>
);

const OpenLink = ({ to, allowed, children }) =>
  allowed ? (
    <Link
      to={to}
      className="text-sm font-semibold text-brand-500 hover:underline dark:text-brand-400"
    >
      {children}
    </Link>
  ) : null;

const StateNote = ({ state, what }) => {
  if (!state || state.status === "loading") {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        Loading {what}...
      </p>
    );
  }

  if (state.status === "denied") {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-gray-400">
        <MdLock className="h-4 w-4 shrink-0" />
        Your account is not allowed to view {what}.
      </p>
    );
  }

  return (
    <p className="py-6 text-center text-sm text-red-500">
      {what.charAt(0).toUpperCase() + what.slice(1)} could not be
      loaded. {state.message}
    </p>
  );
};

const isReady = (state) => Boolean(state) && state.status === "ready";

const Empty = ({ children }) => (
  <p className="py-6 text-center text-sm text-gray-400">{children}</p>
);

const StatCard = ({
  to,
  icon,
  tint,
  title,
  value,
  note,
  testId,
}) => {
  const body = (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${tint}`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {title}
        </p>

        <p
          data-testid={`${testId}-value`}
          className="mt-0.5 text-2xl font-bold text-navy-700 dark:text-white"
        >
          {value}
        </p>

        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
          {note}
        </p>
      </div>
    </div>
  );

  const classes =
    "block min-w-0 rounded-[20px] bg-white p-5 shadow-sm transition dark:bg-navy-800";

  return to ? (
    <Link
      to={to}
      data-testid={testId}
      className={`${classes} hover:shadow-md`}
    >
      {body}
    </Link>
  ) : (
    <div data-testid={testId} className={classes}>
      {body}
    </div>
  );
};

const MiniStat = ({ label, value, note, testId }) => (
  <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>

    <p
      data-testid={testId}
      className="mt-1 text-xl font-bold text-navy-700 dark:text-white"
    >
      {value}
    </p>

    {note && (
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {note}
      </p>
    )}
  </div>
);

const Chip = ({ tone, children }) => {
  const tones = {
    red: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
    orange:
      "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
    green:
      "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400",
    grey: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  };

  return (
    <span
      className={`inline-block shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
        tones[tone] || tones.grey
      }`}
    >
      {children}
    </span>
  );
};

const severityTone = (severity) =>
  ({
    Critical: "red",
    High: "orange",
    Medium: "blue",
    Low: "grey",
  }[severity] || "grey");

const Legend = ({ items }) => (
  <ul className="min-w-0 flex-1 space-y-2">
    {items.map((item) => (
      <li
        key={item.label}
        className="flex items-center justify-between gap-3 text-sm"
      >
        <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />

          <span className="truncate">{item.label}</span>
        </span>

        <span className="font-bold text-navy-700 dark:text-white">
          {fmt(item.value)}
        </span>
      </li>
    ))}
  </ul>
);

const Donut = ({ segments, total, centerLabel, label }) => {
  const radius = 54;

  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <svg
      viewBox="0 0 140 140"
      className="h-36 w-36 shrink-0"
      role="img"
      aria-label={label}
    >
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        strokeWidth="16"
        stroke="currentColor"
        className="text-gray-100 dark:text-white/10"
      />

      {total > 0 &&
        segments
          .filter((segment) => segment.value > 0)
          .map((segment) => {
            const length = (segment.value / total) * circumference;

            const piece = (
              <circle
                key={segment.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                strokeWidth="16"
                stroke={segment.color}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              >
                <title>{`${segment.label}: ${segment.value}`}</title>
              </circle>
            );

            offset += length;

            return piece;
          })}

      <text
        x="70"
        y="68"
        textAnchor="middle"
        className="fill-navy-700 dark:fill-white"
        style={{ fontSize: 26, fontWeight: 700 }}
      >
        {fmt(total)}
      </text>

      <text
        x="70"
        y="86"
        textAnchor="middle"
        className="fill-gray-400"
        style={{ fontSize: 10 }}
      >
        {centerLabel}
      </text>
    </svg>
  );
};

const BarList = ({ items, emptyText }) => {
  const max = Math.max(...items.map((item) => item.value), 0);

  const shown = items.filter(
    (item) => item.value > 0 || item.keep
  );

  if (max === 0) {
    return <Empty>{emptyText}</Empty>;
  }

  return (
    <ul className="space-y-3">
      {shown.map((item, index) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-gray-600 dark:text-gray-300">
              {item.label}
            </span>

            <span className="font-bold text-navy-700 dark:text-white">
              {fmt(item.value)}
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor:
                  item.color || CYCLE[index % CYCLE.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

const niceMax = (value) => {
  if (value <= 0) {
    return 1;
  }

  const power = Math.pow(10, Math.floor(Math.log10(value)));

  const scaled = value / power;

  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;

  return step * power;
};

const ColumnChart = ({ items, unit, label }) => {
  const width = 520;

  const height = 220;

  const left = 58;

  const bottom = 40;

  const top = 14;

  const plotHeight = height - top - bottom;

  const max = niceMax(Math.max(...items.map((item) => item.value), 0));

  const slot = (width - left - 8) / items.length;

  const barWidth = Math.min(34, slot * 0.62);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
    >
      {[0, 0.5, 1].map((fraction) => {
        const y = top + plotHeight - fraction * plotHeight;

        return (
          <g key={fraction}>
            <line
              x1={left}
              x2={width - 8}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-gray-200 dark:text-white/10"
            />

            <text
              x={left - 6}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-400"
              style={{ fontSize: 10 }}
            >
              {fmt(max * fraction, 1)}
            </text>
          </g>
        );
      })}

      {items.map((item, index) => {
        const barHeight = (item.value / max) * plotHeight;

        const x = left + index * slot + (slot - barWidth) / 2;

        return (
          <g key={`${item.title}-${index}`}>
            <rect
              x={x}
              y={top + plotHeight - barHeight}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx="4"
              fill={COLORS.blue}
            >
              <title>{`${item.title}: ${fmt(item.value, 1)} ${unit}`}</title>
            </rect>

            <text
              x={x + barWidth / 2}
              y={height - bottom + 14}
              textAnchor="middle"
              className="fill-gray-500"
              style={{ fontSize: 10 }}
            >
              {item.label}
            </text>

            {item.sub && (
              <text
                x={x + barWidth / 2}
                y={height - bottom + 27}
                textAnchor="middle"
                className="fill-gray-400"
                style={{ fontSize: 9 }}
              >
                {item.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// =========================================================
// THE PAGE
// =========================================================

const mergeResult = (previous, key, result) => {
  const old = previous[key];

  if (result.ok) {
    return {
      ...previous,
      [key]: {
        status: "ready",
        data: result.data,
        message: "",
        stale: false,
      },
    };
  }

  if (result.denied) {
    return {
      ...previous,
      [key]: {
        status: "denied",
        data: null,
        message: result.message,
        stale: false,
      },
    };
  }

  // Keep the last good figures when a refresh fails.
  if (old && old.status === "ready") {
    return {
      ...previous,
      [key]: { ...old, stale: true, message: result.message },
    };
  }

  return {
    ...previous,
    [key]: {
      status: "error",
      data: null,
      message: result.message,
      stale: false,
    },
  };
};

const loadSource = async (source) => {
  try {
    const data = await apiGet(source.path);

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      denied: isDenied(error),
      message: String(error?.message || "Please try again."),
    };
  }
};

const Dashboard = () => {
  const user = authService.getCurrentUser();

  const canOpen = (moduleKey) =>
    Boolean(user) && Boolean(hasModuleAccess(user, moduleKey));

  const [sources, setSources] = React.useState(() =>
    Object.fromEntries(
      SOURCES.map((source) => [
        source.key,
        { status: "loading", data: null, message: "", stale: false },
      ])
    )
  );

  const [updatedAt, setUpdatedAt] = React.useState(null);

  const [refreshing, setRefreshing] = React.useState(false);

  const aliveRef = React.useRef(true);

  const busyRef = React.useRef(false);

  const weatherAtRef = React.useRef(0);

  const updatedAtRef = React.useRef(0);

  const refresh = React.useCallback(async (force) => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;

    setRefreshing(true);

    try {
      const now = Date.now();

      const due = SOURCES.filter(
        (source) =>
          !source.slow ||
          force ||
          now - weatherAtRef.current >= WEATHER_REFRESH_MS
      );

      await Promise.all(
        due.map(async (source) => {
          const result = await loadSource(source);

          if (!aliveRef.current) {
            return;
          }

          if (source.slow && result.ok) {
            weatherAtRef.current = Date.now();
          }

          setSources((previous) =>
            mergeResult(previous, source.key, result)
          );
        })
      );

      if (aliveRef.current) {
        updatedAtRef.current = Date.now();

        setUpdatedAt(updatedAtRef.current);
      }
    } finally {
      busyRef.current = false;

      if (aliveRef.current) {
        setRefreshing(false);
      }
    }
  }, []);

  React.useEffect(() => {
    aliveRef.current = true;

    refresh(true);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh(false);
      }
    }, REFRESH_MS);

    const handleVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - updatedAtRef.current > REFRESH_MS
      ) {
        refresh(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      aliveRef.current = false;

      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisible
      );
    };
  }, [refresh]);

  // =======================================================
  // FIGURES
  // =======================================================

  const today = dayKey(updatedAt || Date.now());

  const now = updatedAt || Date.now();

  const ships = React.useMemo(
    () => summariseShips(asList(sources.vessels.data), now),
    [sources.vessels.data, now]
  );

  const berths = React.useMemo(
    () => summariseBerths(asList(sources.vessels.data)),
    [sources.vessels.data]
  );

  const cargo = React.useMemo(
    () => summariseCargo(asList(sources.cargo.data), today),
    [sources.cargo.data, today]
  );

  const trucks = React.useMemo(
    () => summariseTrucks(asList(sources.trucks.data), today),
    [sources.trucks.data, today]
  );

  const incidents = React.useMemo(
    () =>
      summariseIncidents(
        asList(sources.incidents.data, "incidents")
      ),
    [sources.incidents.data]
  );

  const equipment = React.useMemo(
    () => summariseAssets(sources.assets.data),
    [sources.assets.data]
  );

  const containerBars = React.useMemo(
    () =>
      summariseThroughput(
        asList(sources.container.data),
        "container"
      ),
    [sources.container.data]
  );

  const cargoBars = React.useMemo(
    () =>
      summariseThroughput(asList(sources.cargoYears.data), "cargo"),
    [sources.cargoYears.data]
  );

  const notifications = asList(sources.notifications.data);

  const unread = notifications.filter(
    (item) => item && item.is_read === false
  ).length;

  const weather = sources.weather.data?.weather?.current || {};

  const weatherUnits = sources.weather.data?.weather?.current_units || {};

  const marine = sources.weather.data?.marine?.current || {};

  const marineUnits = sources.weather.data?.marine?.current_units || {};

  const anyStale = Object.values(sources).some((state) => state.stale);

  const unitOf = (units, name, fallback) => units[name] || fallback;

  // What a card shows while its figures are not available.
  const shown = (state, value) => (isReady(state) ? value : "—");

  const missing = (state) =>
    state.status === "denied"
      ? "Not allowed for your account"
      : state.status === "error"
      ? "Could not be loaded"
      : "Loading...";

  const note = (state, text) => (isReady(state) ? text : missing(state));

  return (
    <div className="w-full">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
            Port of Singapore: live overview
          </h1>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Figures come from the port's own records and update every
            minute.
            {updatedAt
              ? ` Updated ${clockFormatter.format(
                  new Date(updatedAt)
                )} (Singapore time).`
              : ""}
          </p>
        </div>

        <button
          type="button"
          data-testid="refresh"
          onClick={() => refresh(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-navy-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-navy-700"
        >
          <MdRefresh
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {anyStale && (
        <p
          data-testid="stale-note"
          className="mt-3 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
        >
          Some figures could not be refreshed just now. They show the
          last values received.
        </p>
      )}

      {/* =====================================================
          NUMBER CARDS
          ===================================================== */}

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          testId="card-berth"
          to={canOpen("vessels") ? "/admin/vessels" : undefined}
          icon={
            <MdDirectionsBoat className="h-7 w-7 text-blue-500 dark:text-blue-400" />
          }
          tint="bg-blue-50 dark:bg-blue-500/10"
          title="Ships at berth"
          value={shown(sources.vessels, fmt(ships.berth))}
          note={note(sources.vessels, "Moored at the port now")}
        />

        <StatCard
          testId="card-anchor"
          to={canOpen("vessels") ? "/admin/vessels" : undefined}
          icon={
            <MdAnchor className="h-7 w-7 text-amber-500 dark:text-amber-400" />
          }
          tint="bg-amber-50 dark:bg-amber-500/10"
          title="Ships at anchorage"
          value={shown(sources.vessels, fmt(ships.anchor))}
          note={note(
            sources.vessels,
            `${fmt(ships.expected)} more expected within 24 h`
          )}
        />

        <StatCard
          testId="card-berths"
          to={canOpen("berths") ? "/admin/berths" : undefined}
          icon={
            <MdAnchor className="h-7 w-7 text-cyan-500 dark:text-cyan-400" />
          }
          tint="bg-cyan-50 dark:bg-cyan-500/10"
          title="Available berths"
          value={shown(sources.vessels, fmt(berths.available))}
          note={note(
            sources.vessels,
            `Out of ${fmt(berths.total)} berths · ${berths.percent}% occupied`
          )}
        />

        <StatCard
          testId="card-trucks"
          to={canOpen("gate_trucks") ? "/admin/gate-management" : undefined}
          icon={
            <MdLocalShipping className="h-7 w-7 text-purple-500 dark:text-purple-400" />
          }
          tint="bg-purple-50 dark:bg-purple-500/10"
          title="Trucks inside the port"
          value={shown(sources.trucks, fmt(trucks.inside))}
          note={note(
            sources.trucks,
            `${fmt(trucks.entriesToday)} in · ${fmt(
              trucks.exitsToday
            )} out today`
          )}
        />

        <StatCard
          testId="card-incidents"
          to={canOpen("incidents") ? "/admin/incidents" : undefined}
          icon={
            <MdReportProblem className="h-7 w-7 text-red-500 dark:text-red-400" />
          }
          tint="bg-red-50 dark:bg-red-500/10"
          title="Open incidents"
          value={shown(sources.incidents, fmt(incidents.open))}
          note={note(
            sources.incidents,
            `${fmt(incidents.urgent)} critical or high`
          )}
        />

        <StatCard
          testId="card-equipment"
          to={canOpen("asset_maintenance") ? "/admin/maintenance" : undefined}
          icon={
            <MdBuild className="h-7 w-7 text-orange-500 dark:text-orange-400" />
          }
          tint="bg-orange-50 dark:bg-orange-500/10"
          title="Equipment needing attention"
          value={shown(sources.assets, fmt(equipment.attention))}
          note={note(
            sources.assets,
            `${fmt(equipment.maintenance)} under maintenance · ${fmt(
              equipment.jobs.overdue
            )} overdue ${equipment.jobs.overdue === 1 ? "job" : "jobs"}`
          )}
        />
      </div>

      {/* =====================================================
          VESSELS & BERTHS
          ===================================================== */}

      <SectionTitle>Vessels &amp; berths</SectionTitle>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          testId="panel-ships"
          title="Ships in the port area"
          subtitle="From the Vessel Management list"
          icon={
            <MdDirectionsBoat className="h-7 w-7 text-brand-500 dark:text-brand-400" />
          }
          action={
            <OpenLink to="/admin/vessels" allowed={canOpen("vessels")}>
              Open
            </OpenLink>
          }
        >
          {isReady(sources.vessels) ? (
            ships.total === 0 ? (
              <Empty>
                No vessels are recorded yet. Ships appear here after
                AIS tracking has been synchronised.
              </Empty>
            ) : (
              <div className="flex flex-wrap items-center gap-6">
                <Donut
                  label="Ships by status"
                  total={ships.total}
                  centerLabel="ships"
                  segments={[
                    {
                      label: "At berth",
                      value: ships.berth,
                      color: COLORS.blue,
                    },
                    {
                      label: "At anchorage",
                      value: ships.anchor,
                      color: COLORS.amber,
                    },
                    {
                      label: "Underway",
                      value: ships.underway,
                      color: COLORS.cyan,
                    },
                    {
                      label: "Other",
                      value: ships.other,
                      color: COLORS.grey,
                    },
                  ]}
                />

                <Legend
                  items={[
                    {
                      label: "At berth",
                      value: ships.berth,
                      color: COLORS.blue,
                    },
                    {
                      label: "At anchorage",
                      value: ships.anchor,
                      color: COLORS.amber,
                    },
                    {
                      label: "Underway",
                      value: ships.underway,
                      color: COLORS.cyan,
                    },
                    {
                      label: "Other",
                      value: ships.other,
                      color: COLORS.grey,
                    },
                  ]}
                />
              </div>
            )
          ) : (
            <StateNote state={sources.vessels} what="the vessels" />
          )}
        </Panel>

        <Panel
          testId="panel-berths"
          title="Berth status"
          subtitle="Vacant and used berths, worked out from the ships at berth"
          icon={
            <MdAnchor className="h-7 w-7 text-brand-500 dark:text-brand-400" />
          }
          action={
            <OpenLink to="/admin/berths" allowed={canOpen("berths")}>
              Open
            </OpenLink>
          }
        >
          {isReady(sources.vessels) ? (
            <div className="space-y-5">
              <BarList
                items={[
                  {
                    label: "Occupied",
                    value: berths.occupied,
                    color: COLORS.red,
                    keep: true,
                  },
                  {
                    label: "Available",
                    value: berths.available,
                    color: COLORS.green,
                    keep: true,
                  },
                ]}
                emptyText=""
              />

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Available now
                </p>

                {berths.availableList.length === 0 ? (
                  <p
                    data-testid="no-vacant-berth"
                    className="text-sm text-gray-500 dark:text-gray-400"
                  >
                    No berth is vacant right now.
                  </p>
                ) : (
                  <p
                    data-testid="vacant-berths"
                    className="text-sm font-semibold text-navy-700 dark:text-white"
                  >
                    {berths.availableList
                      .slice(0, VACANT_SHOWN)
                      .map((berth) => berth.label)
                      .join(", ")}
                    {berths.availableList.length > VACANT_SHOWN ? (
                      <span className="font-normal text-gray-500 dark:text-gray-400">
                        {` and ${fmt(
                          berths.availableList.length - VACANT_SHOWN
                        )} more`}
                      </span>
                    ) : null}
                  </p>
                )}
              </div>

              {berths.occupiedList.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    Occupied now
                  </p>

                  <ul className="space-y-2">
                    {berths.occupiedList.slice(0, 5).map((ship) => (
                      <li
                        key={ship.key}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="font-semibold text-navy-700 dark:text-white">
                          {ship.label}
                        </span>

                        <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">
                          {ship.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-gray-400">
                Berth numbers are generated from each ship's MMSI by Berth
                Management. They are not read from a berth database.
              </p>
            </div>
          ) : (
            <StateNote state={sources.vessels} what="the berths" />
          )}
        </Panel>
      </div>

      {/* =====================================================
          CARGO & GATE TRUCKS
          ===================================================== */}

      <SectionTitle>Cargo &amp; gate trucks</SectionTitle>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          testId="panel-cargo"
          title="Cargo records"
          subtitle="By status"
          icon={
            <MdInventory2 className="h-7 w-7 text-brand-500 dark:text-brand-400" />
          }
          action={
            <OpenLink to="/admin/cargo" allowed={canOpen("cargo")}>
              Open
            </OpenLink>
          }
        >
          {isReady(sources.cargo) ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat
                  testId="cargo-total"
                  label="Cargo records"
                  value={fmt(cargo.total)}
                />

                <MiniStat
                  testId="cargo-today"
                  label="Added today"
                  value={fmt(cargo.addedToday)}
                />
              </div>

              <BarList
                items={cargo.byStatus}
                emptyText="No cargo records have been entered yet."
              />
            </div>
          ) : (
            <StateNote state={sources.cargo} what="the cargo records" />
          )}
        </Panel>

        <Panel
          testId="panel-gate"
          title="Gate activity today"
          subtitle="Entered by the gate officers"
          icon={
            <MdLocalShipping className="h-7 w-7 text-brand-500 dark:text-brand-400" />
          }
          action={
            <OpenLink
              to="/admin/gate-management"
              allowed={canOpen("gate_trucks")}
            >
              Open
            </OpenLink>
          }
        >
          {isReady(sources.trucks) ? (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat
                  testId="gate-inside"
                  label="Inside now"
                  value={fmt(trucks.inside)}
                />

                <MiniStat
                  testId="gate-in"
                  label="Entries today"
                  value={fmt(trucks.entriesToday)}
                />

                <MiniStat
                  testId="gate-out"
                  label="Exits today"
                  value={fmt(trucks.exitsToday)}
                />
              </div>

              {trucks.latest.length === 0 ? (
                <Empty>No gate records have been entered yet.</Empty>
              ) : (
                <ul className="space-y-2">
                  {trucks.latest.map((truck) => (
                    <li
                      key={truck.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-navy-700 dark:text-white">
                          {truck.vehicle}
                        </span>

                        {truck.driver && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {" "}
                            · {truck.driver}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {truck.state === "exited"
                          ? `Out ${formatWhen(truck.exit)}`
                          : `In ${formatWhen(truck.entry)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <StateNote state={sources.trucks} what="the gate records" />
          )}
        </Panel>

        <Panel
          testId="panel-container"
          title="Container throughput"
          subtitle="Thousand TEU per month (published figures imported in Cargo Operations)"
        >
          {isReady(sources.container) ? (
            containerBars.length === 0 ? (
              <Empty>
                No container throughput figures have been imported yet.
              </Empty>
            ) : (
              <ColumnChart
                items={containerBars}
                unit="thousand TEU"
                label="Container throughput per month"
              />
            )
          ) : (
            <StateNote
              state={sources.container}
              what="the container throughput"
            />
          )}
        </Panel>

        <Panel
          testId="panel-cargo-years"
          title="Cargo throughput"
          subtitle="Thousand tonnes per year (published figures imported in Cargo Operations)"
        >
          {isReady(sources.cargoYears) ? (
            cargoBars.length === 0 ? (
              <Empty>
                No cargo throughput figures have been imported yet.
              </Empty>
            ) : (
              <ColumnChart
                items={cargoBars}
                unit="thousand tonnes"
                label="Cargo throughput per year"
              />
            )
          ) : (
            <StateNote
              state={sources.cargoYears}
              what="the cargo throughput"
            />
          )}
        </Panel>
      </div>

      {/* =====================================================
          INCIDENTS & EQUIPMENT
          ===================================================== */}

      <SectionTitle>Incidents &amp; equipment</SectionTitle>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          testId="panel-incident-status"
          title="Incidents by status"
          subtitle="All reported incidents"
          icon={
            <MdReportProblem className="h-7 w-7 text-red-500 dark:text-red-400" />
          }
          action={
            <OpenLink
              to="/admin/incidents"
              allowed={canOpen("incidents")}
            >
              Open
            </OpenLink>
          }
        >
          {isReady(sources.incidents) ? (
            <BarList
              items={incidents.byStatus.map((item) => ({
                ...item,
                color: {
                  Reported: COLORS.blue,
                  "Under Investigation": COLORS.purple,
                  "Action Required": COLORS.red,
                  Resolved: COLORS.green,
                  Closed: COLORS.grey,
                }[item.label],
                keep: INCIDENT_STATUSES.includes(item.label),
              }))}
              emptyText="No incidents have been reported yet."
            />
          ) : (
            <StateNote state={sources.incidents} what="the incidents" />
          )}
        </Panel>

        <Panel
          testId="panel-jobs"
          title="Maintenance jobs"
          subtitle="Equipment register"
          icon={
            <MdBuild className="h-7 w-7 text-orange-500 dark:text-orange-400" />
          }
          action={
            <OpenLink
              to="/admin/maintenance"
              allowed={canOpen("asset_maintenance")}
            >
              Open
            </OpenLink>
          }
        >
          {isReady(sources.assets) ? (
            equipment.total === 0 ? (
              <Empty>No equipment has been added yet.</Empty>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat
                    testId="eq-operational"
                    label="Operational"
                    value={fmt(equipment.operational)}
                  />

                  <MiniStat
                    testId="eq-maintenance"
                    label="In maintenance"
                    value={fmt(equipment.maintenance)}
                  />

                  <MiniStat
                    testId="eq-attention"
                    label="Need attention"
                    value={fmt(equipment.attention)}
                  />
                </div>

                <BarList
                  items={[
                    {
                      label: "Scheduled",
                      value: equipment.jobs.scheduled,
                      color: COLORS.blue,
                    },
                    {
                      label: "In progress",
                      value: equipment.jobs.inProgress,
                      color: COLORS.amber,
                    },
                    {
                      label: "Completed",
                      value: equipment.jobs.completed,
                      color: COLORS.green,
                    },
                    {
                      label: "Overdue",
                      value: equipment.jobs.overdue,
                      color: COLORS.red,
                    },
                  ]}
                  emptyText="No maintenance jobs have been scheduled yet."
                />
              </div>
            )
          ) : (
            <StateNote state={sources.assets} what="the equipment" />
          )}
        </Panel>

        <Panel
          testId="panel-latest-incidents"
          title="Latest incidents"
          subtitle="Newest first"
          icon={
            <MdWarning className="h-7 w-7 text-red-500 dark:text-red-400" />
          }
        >
          {isReady(sources.incidents) ? (
            incidents.latest.length === 0 ? (
              <Empty>No incidents have been reported yet.</Empty>
            ) : (
              <ul className="space-y-3">
                {incidents.latest.map((incident) => (
                  <li
                    key={incident.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-lightPrimary p-3 dark:bg-navy-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">
                        {incident.number} · {incident.type}
                      </p>

                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {[
                          incident.location,
                          incident.status,
                          formatWhen(incident.occurred_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <Chip tone={severityTone(incident.severity)}>
                      {incident.severity}
                    </Chip>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <StateNote state={sources.incidents} what="the incidents" />
          )}
        </Panel>

        <Panel
          testId="panel-equipment-alerts"
          title="Equipment alerts"
          subtitle="Out of service, overdue or due soon"
          icon={
            <MdBuild className="h-7 w-7 text-orange-500 dark:text-orange-400" />
          }
        >
          {isReady(sources.assets) ? (
            equipment.alerts.length === 0 ? (
              <Empty>No equipment needs attention right now.</Empty>
            ) : (
              <ul className="space-y-3">
                {equipment.alerts.map((alert) => (
                  <li
                    key={alert.key}
                    className="flex items-start justify-between gap-3 rounded-xl bg-lightPrimary p-3 dark:bg-navy-900"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-700 dark:text-white">
                        {alert.title}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {alert.message}
                      </p>
                    </div>

                    <Chip
                      tone={
                        alert.type === "critical"
                          ? "red"
                          : alert.type === "warning"
                          ? "orange"
                          : "blue"
                      }
                    >
                      {alert.type === "critical"
                        ? "Critical"
                        : alert.type === "warning"
                        ? "Warning"
                        : "Due soon"}
                    </Chip>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <StateNote state={sources.assets} what="the equipment" />
          )}
        </Panel>
      </div>

      {/* =====================================================
          WEATHER & RECENT ACTIVITY
          ===================================================== */}

      <SectionTitle>Weather &amp; recent activity</SectionTitle>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          testId="panel-weather"
          title="Weather and sea conditions"
          subtitle="Port of Singapore, live from Open-Meteo"
          icon={
            <MdCloud className="h-7 w-7 text-brand-500 dark:text-brand-400" />
          }
          action={
            <OpenLink to="/admin/weather" allowed={canOpen("weather")}>
              Open
            </OpenLink>
          }
        >
          {isReady(sources.weather) ? (
            <div className="space-y-5">
              <div>
                <p
                  data-testid="weather-headline"
                  className="text-3xl font-bold text-navy-700 dark:text-white"
                >
                  {weather.temperature_2m !== undefined
                    ? `${fmt(weather.temperature_2m, 1)}${unitOf(
                        weatherUnits,
                        "temperature_2m",
                        "°C"
                      )}`
                    : "—"}
                </p>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {WEATHER_WORDS[weather.weather_code] || "Conditions"}
                  {weather.apparent_temperature !== undefined
                    ? ` · feels like ${fmt(
                        weather.apparent_temperature,
                        1
                      )}${unitOf(
                        weatherUnits,
                        "apparent_temperature",
                        "°C"
                      )}`
                    : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniStat
                  label="Wind"
                  testId="w-wind"
                  value={
                    weather.wind_speed_10m !== undefined
                      ? `${fmt(weather.wind_speed_10m, 0)} ${unitOf(
                          weatherUnits,
                          "wind_speed_10m",
                          "km/h"
                        )}`
                      : "—"
                  }
                  note={compass(weather.wind_direction_10m)}
                />

                <MiniStat
                  label="Visibility"
                  testId="w-visibility"
                  value={
                    weather.visibility !== undefined &&
                    weather.visibility !== null
                      ? `${fmt(num(weather.visibility) / 1000, 1)} km`
                      : "—"
                  }
                />

                <MiniStat
                  label="Rain"
                  testId="w-rain"
                  value={
                    weather.precipitation !== undefined
                      ? `${fmt(weather.precipitation, 1)} ${unitOf(
                          weatherUnits,
                          "precipitation",
                          "mm"
                        )}`
                      : "—"
                  }
                />

                <MiniStat
                  label="Wave height"
                  testId="w-wave"
                  value={
                    marine.wave_height !== undefined &&
                    marine.wave_height !== null
                      ? `${fmt(marine.wave_height, 1)} ${unitOf(
                          marineUnits,
                          "wave_height",
                          "m"
                        )}`
                      : "—"
                  }
                  note={
                    marine.swell_wave_height !== undefined &&
                    marine.swell_wave_height !== null
                      ? `Swell ${fmt(marine.swell_wave_height, 1)} ${unitOf(
                          marineUnits,
                          "swell_wave_height",
                          "m"
                        )}`
                      : ""
                  }
                />

                <MiniStat
                  label="Sea temperature"
                  testId="w-sea"
                  value={
                    marine.sea_surface_temperature !== undefined &&
                    marine.sea_surface_temperature !== null
                      ? `${fmt(marine.sea_surface_temperature, 1)}${unitOf(
                          marineUnits,
                          "sea_surface_temperature",
                          "°C"
                        )}`
                      : "—"
                  }
                />

                <MiniStat
                  label="Pressure"
                  testId="w-pressure"
                  value={
                    weather.pressure_msl !== undefined
                      ? `${fmt(weather.pressure_msl, 0)} ${unitOf(
                          weatherUnits,
                          "pressure_msl",
                          "hPa"
                        )}`
                      : "—"
                  }
                />
              </div>
            </div>
          ) : (
            <StateNote state={sources.weather} what="the weather" />
          )}
        </Panel>

        <Panel
          testId="panel-notifications"
          title="Latest notifications"
          subtitle={
            isReady(sources.notifications)
              ? `${fmt(unread)} unread`
              : "Your own notifications"
          }
          icon={
            <MdNotifications className="h-7 w-7 text-brand-500 dark:text-brand-400" />
          }
          action={
            <OpenLink
              to="/admin/notifications"
              allowed={canOpen("notifications")}
            >
              Open
            </OpenLink>
          }
        >
          {isReady(sources.notifications) ? (
            notifications.length === 0 ? (
              <Empty>You have no notifications.</Empty>
            ) : (
              <ul className="space-y-3">
                {notifications.slice(0, 5).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl bg-lightPrimary p-3 dark:bg-navy-900"
                  >
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        item.is_read === false
                          ? "bg-red-500"
                          : "bg-gray-300 dark:bg-white/20"
                      }`}
                    />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">
                        {item.title}
                      </p>

                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {[item.category, timeAgo(item.created_at)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <StateNote
              state={sources.notifications}
              what="the notifications"
            />
          )}
        </Panel>
      </div>
    </div>
  );
};

export default Dashboard;
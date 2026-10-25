// =========================================================
// PORT STATISTICS: THE FIGURES
// =========================================================
//
// Everything that WORKS OUT a number for the Port Statistics page
// lives here, away from the screen code: Singapore dates, the bars
// of a graph, and the sums over vessels, berths, gate records,
// incidents, cargo records, equipment and the published throughput.
// No sample data: every function only reads the lists it is given.

export const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export const HOUR_MS = 60 * 60 * 1000;

export const DAY_MS = 24 * HOUR_MS;

export const PORT_TIME_ZONE = "Asia/Singapore";

export const REFRESH_MS = 5 * 60 * 1000;

export const TICK_MS = 60 * 1000;

// The gate and incident lists can return at most this many
// (the newest ones). A longer period may therefore be incomplete.
export const TRUCK_LIMIT = 1000;

export const INCIDENT_LIMIT = 1000;

export const SOURCES = [
  { key: "vessels", path: "/vessels" },
  { key: "berths", path: "/berths" },
  { key: "cargo", path: "/cargo" },
  { key: "container", path: "/throughput?metric=container" },
  { key: "cargoYears", path: "/throughput?metric=cargo" },
  { key: "trucks", path: `/trucks?limit=${TRUCK_LIMIT}` },
  { key: "incidents", path: "/incidents" },
  { key: "assets", path: "/assets" },
];

export const SOURCE_NAMES = {
  vessels: "Vessels",
  berths: "Berths",
  cargo: "Cargo records",
  container: "Container throughput",
  cargoYears: "Cargo throughput",
  trucks: "Gate records",
  incidents: "Incidents",
  assets: "Equipment",
};

export const PRESETS = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Last 30 Days",
  "Last Year",
];

export const DEFAULT_PRESET = "Last 30 Days";

export const SEVERITIES = ["Critical", "High", "Medium", "Low"];

export const SEVERITY_COLORS = {
  Critical: "var(--an-crit)",
  High: "var(--an-high)",
  Medium: "var(--an-med)",
  Low: "var(--an-low)",
  Other: "var(--an-other)",
};

export const INCIDENT_FINISHED = ["Resolved", "Closed"];

export const CATEGORICAL = [
  "var(--an-s1)",
  "var(--an-s2)",
  "var(--an-s3)",
  "var(--an-s4)",
  "var(--an-s5)",
  "var(--an-s6)",
  "var(--an-s7)",
  "var(--an-s8)",
];

export const MONTHS = [
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

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];


// =========================================================
// SINGAPORE DAYS
// =========================================================
//
// A day is stored as a whole number (days since 1 Jan 1970) so
// that adding and comparing days is simple and never depends on
// the time zone of the computer.

export const toDayNumber = (year, month, day) =>
  Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);

export const dayParts = (dayNumber) => {
  const date = new Date(dayNumber * DAY_MS);

  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    dow: date.getUTCDay(),
  };
};

export const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const dayOfMs = (ms) => Math.floor((ms + SGT_OFFSET_MS) / DAY_MS);

export const hourOfMs = (ms) =>
  Math.floor((((ms + SGT_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);

export const pad = (value) => String(value).padStart(2, "0");

export const formatDay = (dayNumber) => {
  const { y, m, d } = dayParts(dayNumber);

  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
};

export const formatDayShort = (dayNumber) => {
  const { m, d } = dayParts(dayNumber);

  return `${d} ${MONTHS[m - 1]}`;
};

export const formatDayInput = (dayNumber) => {
  const { y, m, d } = dayParts(dayNumber);

  return `${pad(d)}/${pad(m)}/${y}`;
};

export const dayKey = (dayNumber) => {
  const { y, m, d } = dayParts(dayNumber);

  return `${y}-${pad(m)}-${pad(d)}`;
};

// The same calendar date one year earlier (29 Feb -> 28 Feb).
export const yearAgo = (dayNumber) => {
  const { y, m, d } = dayParts(dayNumber);

  return toDayNumber(y - 1, m, Math.min(d, daysInMonth(y - 1, m)));
};

export const EARLIEST_DAY = toDayNumber(2000, 1, 1);

// Times that arrive without a time zone are UTC (that is how the
// backend stores them). Dates without a time are Singapore dates.
export const momentMs = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    const time = value.getTime();

    return Number.isNaN(time) ? null : time;
  }

  let text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    text = `${text}T00:00:00+08:00`;
  } else if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)
  ) {
    text = `${text.replace(" ", "T")}Z`;
  }

  const time = Date.parse(text);

  return Number.isNaN(time) ? null : time;
};

export const sgDay = (value) => {
  const ms = momentMs(value);

  return ms === null ? null : dayOfMs(ms);
};

export const inRange = (dayNumber, range) =>
  dayNumber !== null &&
  dayNumber >= range.from &&
  dayNumber <= range.to;

export const presetRange = (preset, today) => {
  switch (preset) {
    case "Yesterday":
      return { from: today - 1, to: today - 1 };

    case "Last 7 Days":
      return { from: today - 6, to: today };

    case "Last 30 Days":
      return { from: today - 29, to: today };

    case "Last Year":
      return { from: yearAgo(today), to: today };

    default:
      return { from: today, to: today };
  }
};

export const clampDay = (dayNumber, today) =>
  Math.min(Math.max(dayNumber, EARLIEST_DAY), today);

export const resolveRange = (selection, today) => {
  if (selection.preset) {
    return presetRange(selection.preset, today);
  }

  const from = clampDay(selection.from, today);

  const to = clampDay(selection.to, today);

  return from <= to ? { from, to } : { from: to, to: from };
};

export const periodLabel = (range, today) => {
  if (range.from === range.to) {
    if (range.from === today) {
      return "Today";
    }

    if (range.from === today - 1) {
      return "Yesterday";
    }

    return formatDay(range.from);
  }

  return `${formatDay(range.from)} – ${formatDay(range.to)}`;
};

// The bars of a graph: one per day for short periods, then per
// week, per month and per year so that a graph never has more than
// about three dozen bars.
export const makeBuckets = (range) => {
  const days = range.to - range.from + 1;

  const buckets = [];

  if (days <= 31) {
    for (let n = range.from; n <= range.to; n += 1) {
      const { d, m } = dayParts(n);

      buckets.push({
        from: n,
        to: n,
        label: String(d),
        sub: n === range.from || d === 1 ? MONTHS[m - 1] : "",
        title: formatDay(n),
      });
    }

    return { grain: "day", unit: "per day", buckets };
  }

  if (days <= 182) {
    for (let start = range.from; start <= range.to; start += 7) {
      const end = Math.min(start + 6, range.to);

      buckets.push({
        from: start,
        to: end,
        label: formatDayShort(start),
        sub: "",
        title: `${formatDay(start)} – ${formatDay(end)}`,
      });
    }

    return { grain: "week", unit: "per week", buckets };
  }

  const first = dayParts(range.from);

  const last = dayParts(range.to);

  const monthCount = (last.y - first.y) * 12 + (last.m - first.m) + 1;

  if (monthCount <= 36) {
    for (let index = 0; index < monthCount; index += 1) {
      const absolute = first.y * 12 + (first.m - 1) + index;

      const y = Math.floor(absolute / 12);

      const m = (absolute % 12) + 1;

      const monthStart = toDayNumber(y, m, 1);

      const monthEnd = toDayNumber(y, m, daysInMonth(y, m));

      const from = Math.max(range.from, monthStart);

      const to = Math.min(range.to, monthEnd);

      const clipped = from > monthStart || to < monthEnd;

      buckets.push({
        from,
        to,
        label: MONTHS[m - 1],
        sub: index === 0 || m === 1 ? String(y) : "",
        title: `${MONTHS[m - 1]} ${y}${
          clipped
            ? ` (${dayParts(from).d}–${dayParts(to).d} ${MONTHS[m - 1]})`
            : ""
        }`,
      });
    }

    return { grain: "month", unit: "per month", buckets };
  }

  for (let y = first.y; y <= last.y; y += 1) {
    const from = Math.max(range.from, toDayNumber(y, 1, 1));

    const to = Math.min(range.to, toDayNumber(y, 12, 31));

    const clipped = from > toDayNumber(y, 1, 1) || to < toDayNumber(y, 12, 31);

    buckets.push({
      from,
      to,
      label: String(y),
      sub: "",
      title: clipped
        ? `${y} (${formatDay(from)} – ${formatDay(to)})`
        : String(y),
    });
  }

  return { grain: "year", unit: "per year", buckets };
};

export const bucketIndex = (buckets, dayNumber) => {
  if (
    dayNumber === null ||
    dayNumber < buckets[0].from ||
    dayNumber > buckets[buckets.length - 1].to
  ) {
    return -1;
  }

  for (let index = 0; index < buckets.length; index += 1) {
    if (dayNumber >= buckets[index].from && dayNumber <= buckets[index].to) {
      return index;
    }
  }

  return -1;
};

// =========================================================
// SMALL HELPERS
// =========================================================

// Most lists come back as a plain array. A few come wrapped
// (for example { incidents: [...] }), so look inside as well.
export const asList = (value, key) => {
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

export const num = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

export const fmt = (value, digits = 0) =>
  num(value).toLocaleString("en-SG", {
    maximumFractionDigits: digits,
  });

export const percent = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

export const zeros = (count) => new Array(count).fill(0);

export const sum = (list) => list.reduce((total, value) => total + value, 0);

export const clockFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: PORT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

export const isDenied = (error) =>
  error?.status === 403 ||
  error?.response?.status === 403 ||
  /do not have permission|not have access|only port administrator/i.test(
    String(error?.message || "")
  );

export const prettyText = (value, fallback = "Not given") => {
  const text = String(value ?? "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!text) {
    return fallback;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
};

// A name as it is stored (only trimmed), or a fallback when blank.
export const tidyText = (value, fallback = "Not given") => {
  const text = String(value ?? "").trim();

  return text || fallback;
};

export const countBy = (list, pick) => {
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

export const byValueThenName = (a, b) =>
  b.value - a.value || String(a.label).localeCompare(String(b.label));

// The biggest few, with everything else added up as "Other".
export const topWithOther = (items, keep) => {
  const sorted = [...items].sort(byValueThenName);

  if (sorted.length <= keep) {
    return sorted;
  }

  const rest = sorted.slice(keep);

  return [
    ...sorted.slice(0, keep),
    {
      label: `Other (${rest.length})`,
      value: sum(rest.map((item) => item.value)),
      other: true,
    },
  ];
};

export const fmtDuration = (minutes) => {
  if (!Number.isFinite(minutes)) {
    return "—";
  }

  const total = Math.max(0, Math.round(minutes));

  if (total < 60) {
    return `${total} min`;
  }

  const hours = Math.floor(total / 60);

  if (hours < 24) {
    const rest = total % 60;

    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  const days = Math.floor(hours / 24);

  const restHours = hours % 24;

  return restHours ? `${days} d ${restHours} h` : `${days} d`;
};

// A neat top for a graph axis and the tick marks up to it.
export const niceScale = (maxValue, whole) => {
  let top = Math.max(maxValue, whole ? 1 : 0.000001);

  const raw = top / 4;

  const power = Math.pow(10, Math.floor(Math.log10(raw)));

  const scaled = raw / power;

  let step =
    (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;

  if (whole) {
    step = Math.max(1, step);
  }

  top = Math.ceil(top / step - 1e-9) * step;

  const ticks = [];

  for (let value = 0; value <= top + step / 1000; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }

  return { top, ticks };
};

export const axisNumber = (value) => {
  if (value >= 1000000) {
    return `${fmt(value / 1000000, 1)}M`;
  }

  if (value >= 1000) {
    return `${fmt(value / 1000, 1)}K`;
  }

  return fmt(value, 1);
};

// =========================================================
// WORKING OUT THE FIGURES
// =========================================================

// Same wording rule as the Berth page and the Dashboard:
// "berth"/"moored" = at a berth, "anchor" = at anchor.
export const shipState = (vessel) => {
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

export const analyseShips = (vessels) => {
  const states = { berth: 0, anchor: 0, underway: 0, other: 0 };

  vessels.forEach((vessel) => {
    states[shipState(vessel)] += 1;
  });

  return {
    total: vessels.length,
    states,
    byType: topWithOther(
      countBy(vessels, (vessel) => tidyText(vessel?.vessel_type)),
      7
    ),
    byFlag: topWithOther(
      countBy(vessels, (vessel) => tidyText(vessel?.flag)),
      5
    ),
  };
};

export const analyseBerths = (berths) => {
  const active = berths.filter((berth) => berth?.is_active !== false);

  const status = { occupied: 0, available: 0, maintenance: 0, other: 0 };

  const terminals = new Map();

  active.forEach((berth) => {
    const text = String(berth?.status || "").toLowerCase();

    const key =
      text === "occupied" ||
      text === "available" ||
      text === "maintenance"
        ? text
        : "other";

    status[key] += 1;

    const terminal = tidyText(berth?.terminal, "No terminal");

    const entry = terminals.get(terminal) || { total: 0, occupied: 0 };

    entry.total += 1;

    if (key === "occupied") {
      entry.occupied += 1;
    }

    terminals.set(terminal, entry);
  });

  return {
    total: active.length,
    status,
    percent: percent(status.occupied, active.length),
    terminals: [...terminals.entries()]
      .map(([label, entry]) => ({ label, ...entry }))
      .sort(
        (a, b) =>
          b.total - a.total || a.label.localeCompare(b.label)
      ),
    byType: topWithOther(
      countBy(active, (berth) => tidyText(berth?.berth_type)),
      6
    ),
  };
};

// Same reading of a truck as the Gate & Truck Management page.
export const entryOf = (truck) =>
  truck?.entry_time ??
  truck?.entry_at ??
  truck?.gate_entry_time ??
  truck?.entered_at ??
  truck?.created_at ??
  null;

export const exitOf = (truck) =>
  truck?.exit_time ??
  truck?.exit_at ??
  truck?.gate_exit_time ??
  truck?.exited_at ??
  null;

export const truckState = (truck) => {
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

export const analyseTrucks = (trucks, range, grid) => {
  const count = grid.buckets.length;

  const entriesBy = zeros(count);

  const exitsBy = zeros(count);

  const hours = zeros(24);

  const perDay = new Map();

  const gates = [];

  const companies = [];

  let entries = 0;

  let exits = 0;

  let tonnes = 0;

  let withWeight = 0;

  let stayTotal = 0;

  let stayCount = 0;

  let entriesLeft = 0;

  let oldestDay = null;

  trucks.forEach((truck) => {
    const state = truckState(truck);

    const entryMs = momentMs(entryOf(truck));

    const exitMs = state === "exited" ? momentMs(exitOf(truck)) : null;

    const entryDay = entryMs === null ? null : dayOfMs(entryMs);

    const exitDay = exitMs === null ? null : dayOfMs(exitMs);

    if (entryDay !== null && (oldestDay === null || entryDay < oldestDay)) {
      oldestDay = entryDay;
    }

    if (state !== "pending" && inRange(entryDay, range)) {
      entries += 1;

      entriesBy[bucketIndex(grid.buckets, entryDay)] += 1;

      hours[hourOfMs(entryMs)] += 1;

      perDay.set(entryDay, (perDay.get(entryDay) || 0) + 1);

      if (state === "exited") {
        entriesLeft += 1;
      }

      gates.push(tidyText(truck?.gate_number, "No gate given"));

      companies.push(tidyText(truck?.transport_company, "Not given"));

      if (
        truck?.cargo_weight_tonnes !== null &&
        truck?.cargo_weight_tonnes !== undefined &&
        Number.isFinite(Number(truck.cargo_weight_tonnes))
      ) {
        tonnes += Number(truck.cargo_weight_tonnes);

        withWeight += 1;
      }
    }

    if (state === "exited" && inRange(exitDay, range)) {
      exits += 1;

      exitsBy[bucketIndex(grid.buckets, exitDay)] += 1;

      if (entryMs !== null && exitMs >= entryMs) {
        stayTotal += (exitMs - entryMs) / 60000;

        stayCount += 1;
      }
    }
  });

  let busiest = null;

  perDay.forEach((value, day) => {
    if (
      busiest === null ||
      value > busiest.count ||
      (value === busiest.count && day < busiest.day)
    ) {
      busiest = { day, count: value };
    }
  });

  const counted = (list) =>
    countBy(list, (name) => name).sort(byValueThenName);

  return {
    loaded: trucks.length,
    entries,
    exits,
    entriesLeft,
    entriesBy,
    exitsBy,
    hours,
    busiest,
    tonnes,
    withWeight,
    averageStay: stayCount ? stayTotal / stayCount : null,
    stayCount,
    gates: counted(gates),
    companies: topWithOther(counted(companies), 5),
    cutShort:
      trucks.length >= TRUCK_LIMIT &&
      oldestDay !== null &&
      range.from < oldestDay,
    oldestDay,
  };
};

export const analyseIncidents = (incidents, range, grid) => {
  const count = grid.buckets.length;

  const known = SEVERITIES;

  const bySeverityBucket = Object.fromEntries(
    [...known, "Other"].map((name) => [name, zeros(count)])
  );

  const severityTotals = Object.fromEntries(
    [...known, "Other"].map((name) => [name, 0])
  );

  const types = [];

  const statuses = [];

  let reported = 0;

  let stillOpen = 0;

  let resolved = 0;

  let resolveTotal = 0;

  let resolveCount = 0;

  let oldestDay = null;

  incidents.forEach((incident) => {
    const occurredMs = momentMs(incident?.occurred_at ?? incident?.created_at);

    const occurredDay = occurredMs === null ? null : dayOfMs(occurredMs);

    if (
      occurredDay !== null &&
      (oldestDay === null || occurredDay < oldestDay)
    ) {
      oldestDay = occurredDay;
    }

    if (inRange(occurredDay, range)) {
      reported += 1;

      const severity = known.includes(incident?.severity)
        ? incident.severity
        : "Other";

      bySeverityBucket[severity][bucketIndex(grid.buckets, occurredDay)] += 1;

      severityTotals[severity] += 1;

      types.push(tidyText(incident?.type, "Not given"));

      statuses.push(incident?.status || "Unknown");

      if (!INCIDENT_FINISHED.includes(incident?.status)) {
        stillOpen += 1;
      }
    }

    const resolvedMs = momentMs(incident?.resolved_at);

    if (resolvedMs !== null && inRange(dayOfMs(resolvedMs), range)) {
      resolved += 1;

      if (occurredMs !== null && resolvedMs >= occurredMs) {
        resolveTotal += (resolvedMs - occurredMs) / 60000;

        resolveCount += 1;
      }
    }
  });

  const series = [...known, "Other"]
    .filter((name) => name !== "Other" || severityTotals.Other > 0)
    .map((name) => ({
      key: name,
      name,
      color: SEVERITY_COLORS[name],
      values: bySeverityBucket[name],
    }));

  return {
    loaded: incidents.length,
    reported,
    stillOpen,
    finished: reported - stillOpen,
    resolved,
    averageResolve: resolveCount ? resolveTotal / resolveCount : null,
    resolveCount,
    series,
    severityTotals,
    types: topWithOther(countBy(types, (name) => name), 6),
    statuses: countBy(statuses, (name) => name).sort(byValueThenName),
    cutShort:
      incidents.length >= INCIDENT_LIMIT &&
      oldestDay !== null &&
      range.from < oldestDay,
    oldestDay,
  };
};

// Fields that a cargo record MAY carry. They are read only when
// present; nothing is guessed when they are missing.
export const firstField = (item, names) => {
  for (const name of names) {
    const value = item?.[name];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
};

export const cargoOperation = (item) => {
  const text = String(
    firstField(item, [
      "operation",
      "operation_type",
      "movement_type",
      "import_export",
    ]) ?? ""
  )
    .trim()
    .toLowerCase();

  if (text === "import" || text === "inbound") {
    return "Import";
  }

  if (text === "export" || text === "outbound") {
    return "Export";
  }

  return null;
};

export const TONNE_UNITS = [
  "mt",
  "t",
  "tonne",
  "tonnes",
  "ton",
  "tons",
  "metric ton",
  "metric tons",
  "metric tonne",
  "metric tonnes",
];

export const cargoTonnes = (item) => {
  const raw = firstField(item, [
    "quantity",
    "quantity_mt",
    "weight",
    "cargo_quantity",
  ]);

  if (raw === null) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  const unit = String(
    firstField(item, ["unit", "quantity_unit", "uom"]) ?? "mt"
  )
    .trim()
    .toLowerCase();

  return TONNE_UNITS.includes(unit) ? value : null;
};

export const CARGO_STATUS_ORDER = ["planned", "in_transit", "arrived", "delivered"];

export const CARGO_STATUS_NAMES = {
  planned: "Planned",
  in_transit: "In transit",
  arrived: "Arrived",
  delivered: "Delivered",
};

export const CARGO_STATUS_COLORS = {
  planned: "var(--an-s4)",
  in_transit: "var(--an-s1)",
  arrived: "var(--an-s3)",
  delivered: "var(--an-s7)",
};

export const cargoStatusKey = (item) =>
  String(item?.status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const analyseCargo = (cargo, range, grid) => {
  const added = zeros(grid.buckets.length);

  const inPeriod = cargo.filter((item) =>
    inRange(sgDay(item?.created_at), range)
  );

  inPeriod.forEach((item) => {
    added[bucketIndex(grid.buckets, sgDay(item?.created_at))] += 1;
  });

  const statusCounts = new Map();

  inPeriod.forEach((item) => {
    const key = cargoStatusKey(item) || "unknown";

    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
  });

  const statuses = [
    ...CARGO_STATUS_ORDER.filter((key) => statusCounts.has(key)),
    ...[...statusCounts.keys()]
      .filter((key) => !CARGO_STATUS_ORDER.includes(key))
      .sort(),
  ].map((key) => ({
    key,
    label: CARGO_STATUS_NAMES[key] || prettyText(key, "Unknown"),
    value: statusCounts.get(key),
    color: CARGO_STATUS_COLORS[key] || "var(--an-other)",
  }));

  const operation = {
    Import: { records: 0, tonnes: 0, weighed: 0 },
    Export: { records: 0, tonnes: 0, weighed: 0 },
  };

  let withOperation = 0;

  const kinds = [];

  inPeriod.forEach((item) => {
    const name = cargoOperation(item);

    if (name) {
      withOperation += 1;

      operation[name].records += 1;

      const tonnes = cargoTonnes(item);

      if (tonnes !== null) {
        operation[name].tonnes += tonnes;

        operation[name].weighed += 1;
      }
    }

    const kind = firstField(item, [
      "cargo_type",
      "cargo_name",
      "cargo",
      "commodity",
    ]);

    if (kind !== null) {
      kinds.push(tidyText(kind));
    }
  });

  return {
    loaded: cargo.length,
    added,
    addedTotal: inPeriod.length,
    statuses,
    operation,
    withOperation,
    kinds: topWithOther(countBy(kinds, (name) => name), 5),
  };
};

export const analyseEquipment = (payload, range) => {
  const assets = asList(payload?.assets);

  const given = payload?.summary || {};

  const statusCounts = countBy(assets, (asset) =>
    tidyText(asset?.status, "Unknown")
  );

  const jobs = given.jobs || {};

  const categories = asList(given.categories).length
    ? asList(given.categories).map((entry) => ({
        label: tidyText(entry?.category, "Other"),
        value: num(entry?.count),
      }))
    : countBy(assets, (asset) => tidyText(asset?.category, "Other"));

  return {
    total: num(given.total ?? assets.length),
    statuses: statusCounts,
    categories: topWithOther(categories, 7),
    jobs: [
      { label: "Scheduled", value: num(jobs.scheduled) },
      { label: "In progress", value: num(jobs.in_progress) },
      { label: "Overdue", value: num(jobs.overdue) },
      { label: "Completed (all time)", value: num(jobs.completed) },
    ],
    servicedInPeriod: assets.filter((asset) =>
      inRange(sgDay(asset?.last_maintenance), range)
    ).length,
  };
};

// Published throughput figures --------------------------

export const monthIndexOf = (period) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());

  return match ? Number(match[1]) * 12 + (Number(match[2]) - 1) : null;
};

export const monthLabelOf = (index) =>
  `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;

export const analyseContainers = (rows, range) => {
  const totals = new Map();

  rows.forEach((row) => {
    const index = monthIndexOf(row?.period);

    if (index !== null) {
      totals.set(index, (totals.get(index) || 0) + num(row?.value));
    }
  });

  const first = dayParts(range.from);

  const last = dayParts(range.to);

  const fromIndex = first.y * 12 + (first.m - 1);

  const toIndex = last.y * 12 + (last.m - 1);

  let months = [...totals.keys()]
    .filter((index) => index >= fromIndex && index <= toIndex)
    .sort((a, b) => a - b);

  const latest = totals.size ? Math.max(...totals.keys()) : null;

  // Nothing is published for the selected days (the newest months
  // are not out yet): show the latest published months instead and
  // say so, rather than an empty graph.
  const fallback = months.length === 0 && totals.size > 0;

  if (fallback) {
    months = [...totals.keys()].sort((a, b) => a - b).slice(-12);
  }

  const base = {
    published: totals.size,
    latest: latest === null ? "" : monthLabelOf(latest),
    fallback,
  };

  if (!months.length) {
    return { ...base, items: [], total: 0, mode: "month" };
  }

  if (fallback || toIndex - fromIndex + 1 <= 36) {
    return {
      ...base,
      mode: "month",
      items: months.map((index) => ({
        label: MONTHS[index % 12],
        sub:
          index === months[0] || index % 12 === 0
            ? String(Math.floor(index / 12))
            : "",
        title: monthLabelOf(index),
        value: totals.get(index),
      })),
      total: sum(months.map((index) => totals.get(index))),
    };
  }

  const years = new Map();

  months.forEach((index) => {
    const year = Math.floor(index / 12);

    const entry = years.get(year) || { value: 0, months: 0 };

    entry.value += totals.get(index);

    entry.months += 1;

    years.set(year, entry);
  });

  return {
    ...base,
    mode: "year",
    items: [...years.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, entry]) => ({
        label: String(year),
        sub: entry.months < 12 ? `${entry.months}/12 mo` : "",
        title:
          entry.months < 12
            ? `${year} (${entry.months} of 12 months published)`
            : String(year),
        value: entry.value,
      })),
    total: sum(months.map((index) => totals.get(index))),
  };
};

export const analyseCargoYears = (rows, range) => {
  const first = dayParts(range.from).y;

  const last = dayParts(range.to).y;

  const all = new Set();

  const primaries = new Set();

  rows.forEach((row) => {
    const year = Number(String(row?.period || "").trim());

    if (Number.isInteger(year)) {
      all.add(year);
    }

    if (row?.category_primary) {
      primaries.add(String(row.category_primary));
    }
  });

  const names = [...primaries].sort();

  let years = [...all]
    .filter((year) => year >= first && year <= last)
    .sort((a, b) => a - b);

  // Nothing is published for the selected years yet: show the
  // latest published years instead and say so.
  const fallback = years.length === 0 && all.size > 0;

  if (fallback) {
    years = [...all].sort((a, b) => a - b).slice(-6);
  }

  const series = names.map((name, index) => ({
    key: name,
    name,
    color: CATEGORICAL[index % CATEGORICAL.length],
    values: years.map((year) =>
      sum(
        rows
          .filter(
            (row) =>
              Number(String(row?.period || "").trim()) === year &&
              String(row?.category_primary || "") === name
          )
          .map((row) => num(row?.value))
      )
    ),
  }));

  const latestYear = years.length ? years[years.length - 1] : null;

  const detail =
    latestYear === null
      ? []
      : rows
          .filter(
            (row) => Number(String(row?.period || "").trim()) === latestYear
          )
          .map((row) => ({
            label: tidyText(row?.category_secondary, "Other"),
            sub: tidyText(row?.category_primary, ""),
            value: num(row?.value),
          }))
          .sort(byValueThenName);

  return {
    published: all.size,
    latestPublished: all.size ? Math.max(...all) : null,
    fallback,
    years,
    series,
    detail,
    detailYear: latestYear,
    total: sum(series.map((entry) => sum(entry.values))),
  };
};


// =========================================================
// THE CLASSIC CHARTS (pie, line, area, radar ...)
// =========================================================
//
// The extra figures behind the pie charts, the traffic line, the
// "ships stopped" area graph, the ship-type bars and the radar.
// Like everything above, they only read the lists they are given.

// The backend answers a traffic request for at most this many days.
export const TRAFFIC_MAX_DAYS = 366;

export const DAY_FRESH_MS = DAY_MS;

// The days that are asked from /ais/traffic: the whole period, or
// its last 366 days when the period is longer than that.
export const trafficWindow = (range) => ({
  from: Math.max(range.from, range.to - TRAFFIC_MAX_DAYS),
  to: range.to,
  capped: range.to - range.from > TRAFFIC_MAX_DAYS,
});

const roundOne = (value) => Math.round(value * 10) / 10;

// Ships seen by the tracking system, day by day. A bar that covers
// several days shows the AVERAGE per day (a ship seen on three days
// of a week must not be counted three times). Days that have no
// stored position at all are left blank, not counted as zero.
export const analyseTraffic = (payload, range, grid) => {
  const window = trafficWindow(range);

  const byDay = new Map();

  asList(payload?.days).forEach((entry) => {
    const day = sgDay(entry?.date);

    if (day !== null && day >= window.from && day <= window.to) {
      byDay.set(day, {
        ships: num(entry?.ships),
        stationary: num(entry?.stationary),
      });
    }
  });

  const ships = [];

  const stopped = [];

  grid.buckets.forEach((bucket) => {
    let count = 0;

    let shipTotal = 0;

    let stoppedTotal = 0;

    for (
      let day = Math.max(bucket.from, window.from);
      day <= bucket.to;
      day += 1
    ) {
      const entry = byDay.get(day);

      if (entry) {
        count += 1;

        shipTotal += entry.ships;

        stoppedTotal += entry.stationary;
      }
    }

    ships.push(count ? roundOne(shipTotal / count) : null);

    stopped.push(count ? roundOne(stoppedTotal / count) : null);
  });

  let peak = null;

  let total = 0;

  byDay.forEach((entry, day) => {
    total += entry.ships;

    if (
      peak === null ||
      entry.ships > peak.ships ||
      (entry.ships === peak.ships && day < peak.day)
    ) {
      peak = { day, ships: entry.ships };
    }
  });

  return {
    window,
    ships,
    stopped,
    averaged: grid.grain !== "day",
    recordedDays: byDay.size,
    totalDays: window.to - window.from + 1,
    average: byDay.size ? roundOne(total / byDay.size) : null,
    peak,
  };
};

// Open incidents (the "alerts" of the Port Alerts page), by how
// serious they are, right now.
export const analyseOpenAlerts = (incidents) => {
  const counts = Object.fromEntries(
    [...SEVERITIES, "Other"].map((name) => [name, 0])
  );

  let total = 0;

  incidents.forEach((incident) => {
    if (INCIDENT_FINISHED.includes(incident?.status)) {
      return;
    }

    total += 1;

    counts[SEVERITIES.includes(incident?.severity) ? incident.severity : "Other"] += 1;
  });

  return {
    total,
    items: [...SEVERITIES, "Other"]
      .filter((name) => name !== "Other" || counts.Other > 0)
      .map((name) => ({
        label: name,
        value: counts[name],
        color: SEVERITY_COLORS[name],
      })),
  };
};

// Ships whose latest position is not older than one day.
export const shipsReporting = (vessels, nowMs) =>
  vessels.filter((vessel) => {
    const ms = momentMs(vessel?.ais_last_updated_at);

    return ms !== null && nowMs - ms <= DAY_FRESH_MS;
  }).length;

// Container handling month by month: the year the period ends in,
// against the year before. Months that are not published are null.
export const analyseContainerYears = (rows, range) => {
  const totals = new Map();

  rows.forEach((row) => {
    const index = monthIndexOf(row?.period);

    if (index !== null) {
      totals.set(index, (totals.get(index) || 0) + num(row?.value));
    }
  });

  const years = [...new Set([...totals.keys()].map((index) => Math.floor(index / 12)))];

  if (!years.length) {
    return {
      year: null,
      previous: null,
      fallback: false,
      buckets: [],
      series: [],
      latest: "",
      published: 0,
      change: null,
      comparedMonths: 0,
    };
  }

  const wanted = dayParts(range.to).y;

  let year = wanted;

  if (!years.includes(year)) {
    const earlier = years.filter((value) => value <= wanted);

    year = earlier.length ? Math.max(...earlier) : Math.min(...years);
  }

  const valueOf = (y, m) => {
    const value = totals.get(y * 12 + m);

    return value === undefined ? null : value;
  };

  const thisYear = MONTHS.map((_, m) => valueOf(year, m));

  const lastYear = MONTHS.map((_, m) => valueOf(year - 1, m));

  let comparedThis = 0;

  let comparedLast = 0;

  let comparedMonths = 0;

  MONTHS.forEach((_, m) => {
    if (thisYear[m] !== null && lastYear[m] !== null) {
      comparedThis += thisYear[m];

      comparedLast += lastYear[m];

      comparedMonths += 1;
    }
  });

  return {
    year,
    previous: year - 1,
    fallback: year !== wanted,
    buckets: MONTHS.map((name, m) => ({
      label: name,
      sub: "",
      title: `${MONTHS_LONG[m]} ${year} compared with ${year - 1}`,
    })),
    series: [
      {
        key: "this",
        name: String(year),
        color: "var(--an-s1)",
        values: thisYear,
      },
      {
        key: "last",
        name: String(year - 1),
        color: "var(--an-s2)",
        values: lastYear,
      },
    ],
    latest: monthLabelOf(Math.max(...totals.keys())),
    published: totals.size,
    change:
      comparedMonths && comparedLast > 0
        ? roundOne(((comparedThis - comparedLast) / comparedLast) * 100)
        : null,
    comparedMonths,
  };
};

// The share of each kind of cargo in one published year (the year
// the period ends in, or the latest year before it).
export const analyseCargoMix = (rows, range) => {
  const byYear = new Map();

  const names = new Set();

  rows.forEach((row) => {
    const year = Number(String(row?.period || "").trim());

    if (!Number.isInteger(year)) {
      return;
    }

    const name = tidyText(row?.category_secondary, "Other");

    names.add(name);

    const kinds = byYear.get(year) || new Map();

    kinds.set(name, (kinds.get(name) || 0) + num(row?.value));

    byYear.set(year, kinds);
  });

  const years = [...byYear.keys()].sort((a, b) => a - b);

  if (!years.length) {
    return { year: null, items: [], total: 0, latest: null, older: false };
  }

  const wanted = dayParts(range.to).y;

  const earlier = years.filter((year) => year <= wanted);

  const year = earlier.length ? Math.max(...earlier) : Math.min(...years);

  const kinds = byYear.get(year);

  // Colours follow the kind of cargo (alphabetical order of ALL
  // kinds), so a kind keeps its colour from year to year.
  const items = [...names]
    .sort()
    .map((name, index) => ({
      label: name,
      value: kinds.get(name) || 0,
      color: CATEGORICAL[index % CATEGORICAL.length],
    }))
    .filter((item) => item.value > 0)
    .sort(byValueThenName);

  return {
    year,
    items,
    total: sum(items.map((item) => item.value)),
    latest: years[years.length - 1],
    older: year !== wanted,
  };
};

// The terminal with the highest share of occupied berths right now.
export const busiestTerminal = (berths) => {
  let best = null;

  berths.terminals.forEach((terminal) => {
    const share = percent(terminal.occupied, terminal.total);

    if (
      terminal.total > 0 &&
      (best === null ||
        share > best.share ||
        (share === best.share && terminal.total > best.total))
    ) {
      best = { label: terminal.label, share, total: terminal.total, occupied: terminal.occupied };
    }
  });

  return best;
};

// The five radar scores, 0 to 100. Each one is a plain share worked
// out from real records (the formula is written in "detail"). A score
// that cannot be worked out (no records, or not allowed) is null and
// the radar leaves it out instead of drawing a made-up zero.
export const makeScores = ({ berths, cargo, trucks, incidents, shipTotal, shipFresh, why }) => {
  const cargoDone = sum(
    cargo.statuses
      .filter((entry) => entry.key === "arrived" || entry.key === "delivered")
      .map((entry) => entry.value)
  );

  const share = (part, whole) => (whole > 0 ? percent(part, whole) : null);

  const pick = (key, label, value, detail, empty) => ({
    key,
    label,
    value: why[key] ? null : value,
    detail: why[key] || (value === null ? empty : detail),
  });

  return [
    pick(
      "berth",
      "Berth use",
      share(berths.status.occupied, berths.total),
      `${fmt(berths.status.occupied)} of ${fmt(berths.total)} active berths are occupied right now.`,
      "No berths are on record."
    ),
    pick(
      "cargo",
      "Cargo progress",
      share(cargoDone, cargo.addedTotal),
      `${fmt(cargoDone)} of ${fmt(cargo.addedTotal)} cargo records added in this period have arrived or been delivered.`,
      "No cargo records were added in this period."
    ),
    pick(
      "gate",
      "Gate flow",
      share(trucks.entriesLeft, trucks.entries),
      `${fmt(trucks.entriesLeft)} of ${fmt(trucks.entries)} trucks that entered in this period have left again.`,
      "No truck entries in this period."
    ),
    pick(
      "ships",
      "Ship tracking",
      share(shipFresh, shipTotal),
      `${fmt(shipFresh)} of ${fmt(shipTotal)} ships reported a position in the last 24 hours.`,
      "No ships are on record."
    ),
    pick(
      "safety",
      "Incident closure",
      share(incidents.finished, incidents.reported),
      `${fmt(incidents.finished)} of ${fmt(incidents.reported)} incidents in this period are resolved or closed.`,
      "No incidents happened in this period."
    ),
  ];
};
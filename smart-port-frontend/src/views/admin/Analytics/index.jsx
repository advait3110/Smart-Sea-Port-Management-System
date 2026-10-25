import React from "react";

import { Link } from "react-router-dom";

import { MdAnalytics, MdHistory, MdRefresh, MdWarning } from "react-icons/md";

import { apiGet } from "../../../services/api";

import authService from "../../../layouts/auth/authService";

import { hasModuleAccess } from "../../../layouts/auth/permissions";

import {
  REFRESH_MS,
  TICK_MS,
  TRUCK_LIMIT,
  INCIDENT_LIMIT,
  SOURCES,
  SOURCE_NAMES,
  PRESETS,
  DEFAULT_PRESET,
  SEVERITIES,
  SEVERITY_COLORS,
  dayOfMs,
  dayKey,
  dayParts,
  pad,
  formatDay,
  formatDayShort,
  EARLIEST_DAY,
  presetRange,
  resolveRange,
  periodLabel,
  makeBuckets,
  asList,
  fmt,
  percent,
  sum,
  clockFormatter,
  isDenied,
  fmtDuration,
  analyseShips,
  analyseBerths,
  analyseTrucks,
  analyseIncidents,
  analyseCargo,
  analyseEquipment,
  analyseContainers,
  analyseCargoYears,
  TRAFFIC_MAX_DAYS,
  trafficWindow,
  analyseTraffic,
  analyseOpenAlerts,
  analyseContainerYears,
  analyseCargoMix,
  shipsReporting,
  busiestTerminal,
  makeScores,
} from "./figures";

import {
  CHART_CSS,
  Panel,
  SectionTitle,
  Empty,
  StateNote,
  Warning,
  InfoNote,
  StatTile,
  ShareBar,
  BarList,
  ColumnChart,
  LineChart,
  HBarChart,
  PieChart,
  RadarChart,
  DatePicker,
} from "./charts";

// =========================================================
// PORT STATISTICS (Port of Singapore)
// =========================================================
//
// Every number and every graph on this page is worked out from
// the port's own records. There is no sample data here. When
// nobody has entered anything yet, a graph says so instead of
// drawing made-up numbers.
//
//   GET /vessels, /berths          ships and berths right now
//   GET /cargo                     cargo records
//   GET /trucks?limit=1000         gate entries and exits
//   GET /incidents                 the incident register
//   GET /assets                    equipment and maintenance jobs
//   GET /ais/traffic               ships seen per day (stored AIS positions)
//   GET /throughput?metric=...     published container (monthly)
//                                  and cargo (yearly) throughput
//
// The files of this page (all in this folder):
//   index.jsx    this page: loading, the date filter, the layout
//   figures.js   Singapore dates and every sum and count
//   charts.jsx   the graphs, cards and the date picker
//
// The Start / End date and the quick buttons choose the days that
// the activity graphs cover. All dates are Singapore dates
// (Singapore time is UTC+8 all year), whatever the time zone of
// the computer. Ships, berths and equipment are kept as they are
// right now, so they do not change with the dates.
//
// Every list loads on its own. If your account is not allowed to
// read one of them (for example the gate records need the Gate &
// Truck feature), only the graphs that use it say so.

// =========================================================
// LOADING THE LISTS
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

const isReady = (state) => Boolean(state) && state.status === "ready";

// =========================================================
// THE PAGE
// =========================================================

const OpenLink = ({ to, allowed, children }) =>
  allowed ? (
    <Link
      to={to}
      className="text-sm font-semibold text-brand-500 hover:underline dark:text-brand-400"
    >
      {children}
    </Link>
  ) : null;

const Chip = ({ tone, children }) => {
  const tones = {
    green:
      "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",
    red: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
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

const BERTH_COLORS = {
  occupied: "var(--an-s1)",
  available: "var(--an-s3)",
  maintenance: "var(--an-s4)",
  other: "var(--an-other)",
};

const EQUIPMENT_COLORS = {
  Operational: "var(--an-good)",
  Maintenance: "var(--an-s1)",
  "Maintenance Due": "var(--an-med)",
  Overdue: "var(--an-high)",
  "Out of Service": "var(--an-crit)",
};

const EQUIPMENT_ORDER = [
  "Operational",
  "Maintenance",
  "Maintenance Due",
  "Overdue",
  "Out of Service",
];

const Analytics = () => {
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

  const [nowMs, setNowMs] = React.useState(() => Date.now());

  const [selection, setSelection] = React.useState({
    preset: DEFAULT_PRESET,
    from: null,
    to: null,
  });

  const [traffic, setTraffic] = React.useState({
    status: "loading",
    data: null,
    message: "",
    stale: false,
    key: "",
  });

  const aliveRef = React.useRef(true);

  const busyRef = React.useRef(false);

  const updatedAtRef = React.useRef(0);

  // The days the traffic graphs ask the backend for (set while the
  // page is drawn, read when a request is made).
  const windowRef = React.useRef(null);

  const trafficSeq = React.useRef(0);

  // Ships seen per day. It depends on the selected days, so it is
  // loaded on its own, again whenever the days change.
  const loadTraffic = React.useCallback(async (win) => {
    trafficSeq.current += 1;

    const seq = trafficSeq.current;

    const key = `${win.from}-${win.to}`;

    try {
      const data = await apiGet(
        `/ais/traffic?start_date=${dayKey(win.from)}&end_date=${dayKey(win.to)}`
      );

      if (!aliveRef.current || seq !== trafficSeq.current) {
        return;
      }

      setTraffic({ status: "ready", data, message: "", stale: false, key });
    } catch (error) {
      if (!aliveRef.current || seq !== trafficSeq.current) {
        return;
      }

      const message =
        error?.status === 404
          ? "The backend does not have the traffic service yet. Replace ais.py on the backend and restart it."
          : String(error?.message || "Please try again.");

      setTraffic((previous) => {
        if (isDenied(error)) {
          return { status: "denied", data: null, message, stale: false, key };
        }

        if (previous.status === "ready" && previous.key === key) {
          return { ...previous, stale: true, message };
        }

        return { status: "error", data: null, message, stale: false, key };
      });
    }
  }, []);

  const refresh = React.useCallback(async () => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;

    setRefreshing(true);

    try {
      await Promise.all([
        ...SOURCES.map(async (source) => {
          const result = await loadSource(source);

          if (!aliveRef.current) {
            return;
          }

          setSources((previous) =>
            mergeResult(previous, source.key, result)
          );
        }),
        windowRef.current ? loadTraffic(windowRef.current) : Promise.resolve(),
      ]);

      if (aliveRef.current) {
        updatedAtRef.current = Date.now();

        setUpdatedAt(updatedAtRef.current);

        setNowMs(Date.now());
      }
    } finally {
      busyRef.current = false;

      if (aliveRef.current) {
        setRefreshing(false);
      }
    }
  }, [loadTraffic]);

  React.useEffect(() => {
    aliveRef.current = true;

    refresh();

    // Every minute: keep "today" right (the page may stay open past
    // midnight) and fetch again when the lists are 5 minutes old.
    const timer = window.setInterval(() => {
      setNowMs(Date.now());

      if (
        document.visibilityState === "visible" &&
        Date.now() - updatedAtRef.current >= REFRESH_MS
      ) {
        refresh();
      }
    }, TICK_MS);

    const handleVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - updatedAtRef.current >= REFRESH_MS
      ) {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      aliveRef.current = false;

      window.clearInterval(timer);

      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [refresh]);

  // =======================================================
  // THE SELECTED DAYS
  // =======================================================

  const today = dayOfMs(nowMs);

  const range = React.useMemo(
    () => resolveRange(selection, today),
    [selection, today]
  );

  const activePreset =
    PRESETS.find((name) => {
      const wanted = presetRange(name, today);

      return wanted.from === range.from && wanted.to === range.to;
    }) || null;

  const dayCount = range.to - range.from + 1;

  const label = periodLabel(range, today);

  const grid = React.useMemo(
    () => makeBuckets(range),
    [range]
  );

  const trafficDays = React.useMemo(() => trafficWindow(range), [range]);

  windowRef.current = trafficDays;

  const firstWindow = React.useRef(true);

  // Other days chosen: ask for the traffic of those days.
  React.useEffect(() => {
    if (firstWindow.current) {
      firstWindow.current = false;

      return;
    }

    setTraffic({
      status: "loading",
      data: null,
      message: "",
      stale: false,
      key: "",
    });

    loadTraffic(windowRef.current);
  }, [trafficDays.from, trafficDays.to, loadTraffic]);

  const applyPreset = (name) =>
    setSelection({ preset: name, from: null, to: null });

  const resetFilters = () =>
    setSelection({ preset: DEFAULT_PRESET, from: null, to: null });

  const chooseFrom = (dayNumber) =>
    setSelection({
      preset: null,
      from: dayNumber,
      to: Math.max(dayNumber, range.to),
    });

  const chooseTo = (dayNumber) =>
    setSelection({
      preset: null,
      from: Math.min(range.from, dayNumber),
      to: dayNumber,
    });

  // =======================================================
  // FIGURES
  // =======================================================

  const ships = React.useMemo(
    () => analyseShips(asList(sources.vessels.data)),
    [sources.vessels.data]
  );

  const berths = React.useMemo(
    () => analyseBerths(asList(sources.berths.data)),
    [sources.berths.data]
  );

  const trucks = React.useMemo(
    () => analyseTrucks(asList(sources.trucks.data), range, grid),
    [sources.trucks.data, range, grid]
  );

  const incidents = React.useMemo(
    () =>
      analyseIncidents(
        asList(sources.incidents.data, "incidents"),
        range,
        grid
      ),
    [sources.incidents.data, range, grid]
  );

  const cargo = React.useMemo(
    () => analyseCargo(asList(sources.cargo.data), range, grid),
    [sources.cargo.data, range, grid]
  );

  const equipment = React.useMemo(
    () => analyseEquipment(sources.assets.data, range),
    [sources.assets.data, range]
  );

  const containers = React.useMemo(
    () => analyseContainers(asList(sources.container.data), range),
    [sources.container.data, range]
  );

  const cargoYears = React.useMemo(
    () => analyseCargoYears(asList(sources.cargoYears.data), range),
    [sources.cargoYears.data, range]
  );

  const trafficFigures = React.useMemo(
    () => analyseTraffic(traffic.data, range, grid),
    [traffic.data, range, grid]
  );

  const openAlerts = React.useMemo(
    () => analyseOpenAlerts(asList(sources.incidents.data, "incidents")),
    [sources.incidents.data]
  );

  const containerYears = React.useMemo(
    () => analyseContainerYears(asList(sources.container.data), range),
    [sources.container.data, range]
  );

  const cargoMix = React.useMemo(
    () => analyseCargoMix(asList(sources.cargoYears.data), range),
    [sources.cargoYears.data, range]
  );

  const shipFresh = React.useMemo(
    () => shipsReporting(asList(sources.vessels.data), nowMs),
    [sources.vessels.data, nowMs]
  );

  const periodEndYear = dayParts(range.to).y;

  const anyStale =
    Object.values(sources).some((state) => state.stale) || traffic.stale;

  const shown = (state, value) => (isReady(state) ? value : "—");

  const missing = (state) =>
    state.status === "denied"
      ? "Not allowed for your account"
      : state.status === "error"
      ? "Could not be loaded"
      : "Loading...";

  const note = (state, text) => (isReady(state) ? text : missing(state));

  const periodNote = `${label} · ${grid.unit}`;

  const gateSource = sources.trucks;

  const incidentState = sources.incidents;

  const cargoState = sources.cargo;

  const whyMissing = (state) => (isReady(state) ? "" : missing(state));

  const scores = makeScores({
    berths,
    cargo,
    trucks,
    incidents,
    shipTotal: ships.total,
    shipFresh,
    why: {
      berth: whyMissing(sources.berths),
      cargo: whyMissing(cargoState),
      gate: whyMissing(gateSource),
      ships: whyMissing(sources.vessels),
      safety: whyMissing(incidentState),
    },
  });

  const busiest = busiestTerminal(berths);

  const trafficSeries = [
    {
      key: "ships",
      name: trafficFigures.averaged ? "Ships per day (average)" : "Ships seen",
      color: "var(--an-s1)",
      values: trafficFigures.ships,
    },
  ];

  const stoppedSeries = [
    {
      key: "stopped",
      name: trafficFigures.averaged
        ? "Stopped ships per day (average)"
        : "Stopped ships",
      color: "var(--an-s3)",
      values: trafficFigures.stopped,
    },
  ];

  const gateSeries = [
    {
      key: "entries",
      name: "Entries",
      color: "var(--an-s1)",
      values: trucks.entriesBy,
    },
    {
      key: "exits",
      name: "Exits",
      color: "var(--an-s2)",
      values: trucks.exitsBy,
    },
  ];

  const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
    label: String(hour),
    sub: "",
    title: `${pad(hour)}:00 – ${pad(hour)}:59`,
  }));

  const cargoAddedSeries = [
    {
      key: "added",
      name: "Cargo records added",
      color: "var(--an-s1)",
      values: cargo.added,
    },
  ];

  const containerBuckets = containers.items.map((item) => ({
    label: item.label,
    sub: item.sub,
    title: item.title,
  }));

  const containerSeries = [
    {
      key: "container",
      name: "Container throughput",
      color: "var(--an-s1)",
      values: containers.items.map((item) => item.value),
    },
  ];

  const cargoYearBuckets = cargoYears.years.map((year) => ({
    label: String(year),
    sub: "",
    title: String(year),
  }));

  const importExport = cargo.operation;

  const byTonnes =
    importExport.Import.weighed > 0 && importExport.Export.weighed > 0;

  const ratioBase = byTonnes
    ? [importExport.Import.tonnes, importExport.Export.tonnes]
    : [importExport.Import.records, importExport.Export.records];

  const ratioText =
    ratioBase[0] > 0 && ratioBase[1] > 0
      ? `${fmt(ratioBase[0] / ratioBase[1], 2)} : 1`
      : "—";

  const sameName = (a, b) =>
    String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  const equipmentStatuses = [
    ...EQUIPMENT_ORDER,
    ...equipment.statuses
      .map((entry) => entry.label)
      .filter(
        (name) => !EQUIPMENT_ORDER.some((known) => sameName(known, name))
      ),
  ].map((name) => ({
    label: name,
    value: sum(
      equipment.statuses
        .filter((entry) => sameName(entry.label, name))
        .map((entry) => entry.value)
    ),
    color: EQUIPMENT_COLORS[name] || "var(--an-other)",
  }));

  // What each list holds, for the "where do these figures come
  // from" box at the bottom.
  const coverage = {
    vessels: `${fmt(ships.total)} ships on record`,
    berths: `${fmt(berths.total)} berths on record`,
    cargo: `${fmt(cargo.loaded)} cargo records`,
    container: `${fmt(containers.published)} months published${
      containers.latest ? `, latest ${containers.latest}` : ""
    }`,
    cargoYears: `${fmt(cargoYears.published)} years published${
      cargoYears.latestPublished ? `, latest ${cargoYears.latestPublished}` : ""
    }`,
    trucks: `${fmt(trucks.loaded)} gate records${
      trucks.loaded >= TRUCK_LIMIT ? ` (the newest ${fmt(TRUCK_LIMIT)} only)` : ""
    }`,
    incidents: `${fmt(incidents.loaded)} incidents${
      incidents.loaded >= INCIDENT_LIMIT
        ? ` (the newest ${fmt(INCIDENT_LIMIT)} only)`
        : ""
    }`,
    assets: `${fmt(equipment.total)} pieces of equipment`,
  };

  return (
    <div className="an-root w-full">
      <style>{CHART_CSS}</style>

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="mb-6 mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdAnalytics className="h-8 w-8" />
          </div>

          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-navy-700 dark:text-white">
              Port Statistics
            </h1>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Operational statistics and trends for the whole Port of
              Singapore, worked out from the port's own records.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            data-testid="updated-at"
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            {updatedAt
              ? `Updated ${clockFormatter.format(new Date(updatedAt))} SGT`
              : "Loading..."}
          </span>

          <button
            type="button"
            data-testid="refresh-button"
            disabled={refreshing}
            onClick={() => refresh()}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-4 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          >
            <MdRefresh
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />

            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {anyStale && (
        <Warning testId="stale-note">
          Some figures could not be refreshed just now. The last loaded
          figures are still shown.
        </Warning>
      )}

      {/* =====================================================
          HISTORICAL ANALYTICS (the date filter)
          ===================================================== */}

      <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800 sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdHistory className="h-8 w-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-navy-700 dark:text-white">
                Historical Analytics
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Analyze port performance for a selected date or period.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="reset-button"
            onClick={resetFilters}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-5 py-3 text-sm font-bold text-navy-700 transition hover:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          >
            <MdRefresh className="h-5 w-5" />
            Reset
          </button>
        </div>

        <div className="mt-8">
          <p className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">
            Quick selection
          </p>

          <div className="flex flex-wrap gap-3">
            {PRESETS.map((name) => {
              const selected = activePreset === name;

              return (
                <button
                  key={name}
                  type="button"
                  data-testid={`preset-${name.toLowerCase().replace(/\s+/g, "-")}`}
                  aria-pressed={selected}
                  onClick={() => applyPreset(name)}
                  className={`rounded-xl px-6 py-3 text-sm font-bold transition ${
                    selected
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-lightPrimary text-navy-700 hover:bg-brand-50 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 rounded-[20px] bg-lightPrimary p-5 dark:bg-navy-700 sm:p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <DatePicker
              testId="picker-from"
              label="Start Date"
              value={range.from}
              onChange={chooseFrom}
              minDay={EARLIEST_DAY}
              maxDay={range.to}
              today={today}
              selectingLabel="SELECTING START DATE"
            />

            <DatePicker
              testId="picker-to"
              label="End Date"
              value={range.to}
              onChange={chooseTo}
              minDay={range.from}
              maxDay={today}
              today={today}
              selectingLabel="SELECTING END DATE"
              alignRight
            />
          </div>

          <div className="mt-5 rounded-2xl bg-white p-5 dark:bg-navy-800 sm:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Selected Period
                </p>

                <p
                  data-testid="selected-period"
                  className="mt-2 text-2xl font-bold text-navy-700 dark:text-white"
                >
                  {label}
                </p>
              </div>

              <span
                data-testid="selected-days"
                className="w-fit rounded-full bg-lightPrimary px-5 py-3 text-sm font-bold text-brand-500 dark:bg-navy-700"
              >
                {dayCount === 1 ? "1 day" : `${fmt(dayCount)} days`} ·
                Singapore time
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          THE SELECTED PERIOD AT A GLANCE
          ===================================================== */}

      <SectionTitle note={label}>Selected period at a glance</SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatTile
          testId="tile-entries"
          label="Truck entries"
          value={shown(gateSource, fmt(trucks.entries))}
          note={note(
            gateSource,
            trucks.busiest
              ? `Busiest day: ${formatDayShort(trucks.busiest.day)} (${fmt(
                  trucks.busiest.count
                )})`
              : "No entries in this period"
          )}
        />

        <StatTile
          testId="tile-exits"
          label="Truck exits"
          value={shown(gateSource, fmt(trucks.exits))}
          note={note(gateSource, "Trucks that left the port")}
        />

        <StatTile
          testId="tile-stay"
          label="Average time inside"
          value={shown(
            gateSource,
            trucks.averageStay === null
              ? "—"
              : fmtDuration(trucks.averageStay)
          )}
          note={note(
            gateSource,
            trucks.stayCount
              ? `${fmt(trucks.stayCount)} completed visit${
                  trucks.stayCount === 1 ? "" : "s"
                }`
              : "No completed visits"
          )}
        />

        <StatTile
          testId="tile-incidents"
          label="Incidents reported"
          value={shown(incidentState, fmt(incidents.reported))}
          note={note(
            incidentState,
            incidents.reported
              ? `${fmt(incidents.stillOpen)} still open`
              : "None in this period"
          )}
        />

        <StatTile
          testId="tile-resolved"
          label="Incidents resolved"
          value={shown(incidentState, fmt(incidents.resolved))}
          note={note(
            incidentState,
            incidents.averageResolve === null
              ? "None resolved in this period"
              : `Average ${fmtDuration(incidents.averageResolve)} to resolve`
          )}
        />

        <StatTile
          testId="tile-cargo"
          label="Cargo records added"
          value={shown(cargoState, fmt(cargo.addedTotal))}
          note={note(
            cargoState,
            `${fmt(cargo.loaded)} cargo record${
              cargo.loaded === 1 ? "" : "s"
            } in total`
          )}
        />
      </div>

      {/* =====================================================
          THE EIGHT MAIN GRAPHS (rows 1 to 4)
          ===================================================== */}

      <SectionTitle note={periodNote}>Port charts</SectionTitle>

      {/* ROW 1: monthly container handling, vessel traffic */}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-monthly"
          title="Monthly Container Handling"
          subtitle={
            containerYears.year
              ? `Thousand TEU handled each month in ${containerYears.year}, against ${containerYears.previous}.`
              : "Thousand TEU handled each month."
          }
        >
          {!isReady(sources.container) ? (
            <StateNote state={sources.container} what="container throughput" />
          ) : (
            <>
              {containerYears.fallback && (
                <InfoNote testId="monthly-fallback">
                  No container figure is published for {periodEndYear}. The
                  nearest published year, {containerYears.year}, is shown.
                </InfoNote>
              )}

              <ColumnChart
                testId="chart-monthly"
                buckets={containerYears.buckets}
                series={containerYears.series}
                mode="grouped"
                whole={false}
                digits={1}
                unitWord="thousand TEU"
                label={`Container throughput by month, ${containerYears.year} against ${containerYears.previous}`}
                emptyText="No container throughput has been published yet."
              />

              {containerYears.change !== null && (
                <p
                  data-testid="monthly-change"
                  className="mt-3 text-sm text-gray-600 dark:text-gray-300"
                >
                  Months published in both years (
                  {fmt(containerYears.comparedMonths)}):{" "}
                  <span className="font-bold text-navy-700 dark:text-white">
                    {containerYears.change > 0 ? "+" : ""}
                    {fmt(containerYears.change, 1)}%
                  </span>{" "}
                  compared with {containerYears.previous}.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          testId="panel-traffic"
          title="Vessel Traffic Trend"
          subtitle={
            trafficFigures.averaged
              ? "Average number of different ships seen per day, from the stored ship positions."
              : "Different ships seen each day, from the stored ship positions."
          }
          action={
            <OpenLink to="/admin/vessels" allowed={canOpen("vessels")}>
              Open Vessels
            </OpenLink>
          }
        >
          {!isReady(traffic) ? (
            <StateNote state={traffic} what="vessel traffic" />
          ) : (
            <>
              {trafficDays.capped && (
                <Warning testId="traffic-capped-note">
                  Only the last {fmt(TRAFFIC_MAX_DAYS + 1)} days of this period
                  can be read ({formatDay(trafficDays.from)} –{" "}
                  {formatDay(trafficDays.to)}).
                </Warning>
              )}

              <LineChart
                testId="chart-traffic"
                buckets={grid.buckets}
                series={trafficSeries}
                whole={!trafficFigures.averaged}
                digits={trafficFigures.averaged ? 1 : 0}
                unitWord="ships"
                label={`Ships seen ${grid.unit}, ${label}`}
                emptyText="No ship positions were stored in this period."
              />

              <p
                data-testid="traffic-note"
                className="mt-3 text-xs text-gray-500 dark:text-gray-400"
              >
                {trafficFigures.recordedDays
                  ? `Positions were stored on ${fmt(
                      trafficFigures.recordedDays
                    )} of ${fmt(trafficFigures.totalDays)} days (average ${fmt(
                      trafficFigures.average,
                      1
                    )} ships a day, busiest day ${formatDayShort(
                      trafficFigures.peak.day
                    )} with ${fmt(trafficFigures.peak.ships)}). Days without stored positions are left blank. `
                  : ""}
                This counts ships seen by the tracking system, not formal port
                calls.
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* ROW 2: cargo composition, ships stopped */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-composition"
          title="Cargo Composition"
          subtitle={
            cargoMix.year
              ? `Share of each kind of cargo handled in ${cargoMix.year} (published yearly figures).`
              : "Share of each kind of cargo handled in a year."
          }
        >
          {!isReady(sources.cargoYears) ? (
            <StateNote state={sources.cargoYears} what="cargo throughput" />
          ) : (
            <>
              {cargoMix.older && (
                <InfoNote testId="composition-older">
                  No cargo figure is published for {periodEndYear}. The nearest
                  published year, {cargoMix.year}, is shown.
                </InfoNote>
              )}

              <PieChart
                testId="chart-composition"
                items={cargoMix.items}
                unitWord="thousand t"
                label={`Cargo composition in ${cargoMix.year}`}
                emptyText="No cargo throughput has been published yet."
              />

              {cargoMix.total > 0 && (
                <p
                  data-testid="composition-total"
                  className="mt-3 text-sm text-gray-600 dark:text-gray-300"
                >
                  Total in {cargoMix.year}:{" "}
                  <span className="font-bold text-navy-700 dark:text-white">
                    {fmt(cargoMix.total, 1)} thousand tonnes
                  </span>
                  .
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          testId="panel-stopped"
          title="Ships Stopped in Port Waters"
          subtitle={
            trafficFigures.averaged
              ? "Average number of different ships per day that reported a speed under 0.5 knots (berthed, moored or at anchor)."
              : "Different ships that reported a speed under 0.5 knots (berthed, moored or at anchor) each day."
          }
        >
          {!isReady(traffic) ? (
            <StateNote state={traffic} what="vessel traffic" />
          ) : (
            <>
              <LineChart
                area
                testId="chart-stopped"
                buckets={grid.buckets}
                series={stoppedSeries}
                whole={!trafficFigures.averaged}
                digits={trafficFigures.averaged ? 1 : 0}
                unitWord="ships"
                label={`Stopped ships ${grid.unit}, ${label}`}
                emptyText="No ship positions were stored in this period."
              />

              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                This counts ships standing still. It is not the share of berths
                in use; berth use right now is in the Operational Performance
                graph and the Berths card below.
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* ROW 3: gate activity, alert distribution */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-gate"
          title="Gate Activity"
          subtitle="Trucks that came in and trucks that left the port."
          action={
            <OpenLink to="/admin/gate-management" allowed={canOpen("gate_trucks")}>
              Open Gate Management
            </OpenLink>
          }
        >
          {!isReady(gateSource) ? (
            <StateNote state={gateSource} what="gate records" />
          ) : (
            <>
              {trucks.cutShort && (
                <Warning testId="gate-cut-note">
                  Only the newest {fmt(TRUCK_LIMIT)} gate records can be read
                  (back to {formatDay(trucks.oldestDay)}). Earlier days in
                  this period may be missing.
                </Warning>
              )}

              <ColumnChart
                testId="chart-gate"
                buckets={grid.buckets}
                series={gateSeries}
                mode="grouped"
                unitWord="trucks"
                label={`Truck entries and exits ${grid.unit}, ${label}`}
                emptyText="No truck entries or exits were recorded in this period."
              />
            </>
          )}
        </Panel>

        <Panel
          testId="panel-alerts"
          title="Alert Distribution"
          subtitle="Open alerts right now (the incidents on the Port Alerts page), by how serious they are."
          action={
            <OpenLink to="/admin/alerts" allowed={canOpen("port_alerts")}>
              Open Port Alerts
            </OpenLink>
          }
        >
          {!isReady(incidentState) ? (
            <StateNote state={incidentState} what="incidents" />
          ) : (
            <PieChart
              testId="chart-alerts"
              items={openAlerts.items}
              unitWord="open alerts"
              label="Open alerts by seriousness"
              emptyText="There are no open alerts right now."
            />
          )}
        </Panel>
      </div>

      {/* ROW 4: ship types, operational performance */}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-ship-types"
          title="Vessel Type Distribution"
          subtitle="Ships the system is tracking right now, by type."
        >
          {!isReady(sources.vessels) ? (
            <StateNote state={sources.vessels} what="ships" />
          ) : (
            <HBarChart
              testId="chart-ship-types"
              items={ships.byType}
              unitWord="ships"
              label="Ships by type"
              emptyText="No ships are on record yet."
            />
          )}
        </Panel>

        <Panel
          testId="panel-radar"
          title="Operational Performance"
          subtitle="Five scores from 0 to 100, each worked out from real records. How each score is calculated is written under the graph."
        >
          <RadarChart
            testId="chart-radar"
            axes={scores}
            label="Operational performance scores"
            emptyText="There are not enough records yet to draw the scores. At least three of them need figures."
          />
        </Panel>
      </div>

      {/* OPERATIONAL INSIGHTS */}

      <div className="mt-5 rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdAnalytics className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Operational Insights
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Key observations worked out from the port's own records.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div
            data-testid="insight-berth"
            className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700"
          >
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Busiest Terminal Right Now
            </p>

            <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
              {isReady(sources.berths) && busiest ? `${busiest.share}%` : "—"}
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {!isReady(sources.berths)
                ? missing(sources.berths)
                : busiest
                ? `${busiest.label}: ${fmt(busiest.occupied)} of ${fmt(
                    busiest.total
                  )} berths occupied`
                : "No berths are on record"}
            </p>
          </div>

          <div
            data-testid="insight-gate"
            className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700"
          >
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Highest Gate Activity
            </p>

            <p className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
              {isReady(gateSource) && trucks.busiest
                ? fmt(trucks.busiest.count)
                : "—"}
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {!isReady(gateSource)
                ? missing(gateSource)
                : trucks.busiest
                ? `Most truck entries in one day: ${formatDay(
                    trucks.busiest.day
                  )}`
                : "No truck entries in this period"}
            </p>
          </div>

          <div
            data-testid="insight-alerts"
            className="rounded-xl bg-lightPrimary p-5 dark:bg-navy-700"
          >
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Open Alerts
            </p>

            <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-red-500">
              <MdWarning className="h-6 w-6" />

              {isReady(incidentState) ? fmt(openAlerts.total) : "—"}
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isReady(incidentState)
                ? "Incidents that are not yet resolved or closed"
                : missing(incidentState)}
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          GATE AND TRUCKS (more detail)
          ===================================================== */}

      <SectionTitle note={periodNote}>Gate and trucks in detail</SectionTitle>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-hours"
          title="Entries by hour of the day"
          subtitle="When trucks arrive at the gate (Singapore time), over the selected days."
        >
          {!isReady(gateSource) ? (
            <StateNote state={gateSource} what="gate records" />
          ) : (
            <ColumnChart
              testId="chart-hours"
              buckets={hourBuckets}
              series={[
                {
                  key: "hours",
                  name: "Entries",
                  color: "var(--an-s1)",
                  values: trucks.hours,
                },
              ]}
              unitWord="entries"
              label={`Truck entries by hour of the day, ${label}`}
              emptyText="No truck entries were recorded in this period."
            />
          )}
        </Panel>

        <Panel
          testId="panel-gates"
          title="Gates and transport companies"
          subtitle="Where the entries in this period came in and who sent them."
        >
          {!isReady(gateSource) ? (
            <StateNote state={gateSource} what="gate records" />
          ) : trucks.entries === 0 ? (
            <Empty>No truck entries were recorded in this period.</Empty>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Entries by gate
                </p>

                <BarList
                  testId="bars-gates"
                  items={trucks.gates}
                  emptyText="No gate was given."
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Transport companies
                </p>

                <BarList
                  testId="bars-companies"
                  color="var(--an-s2)"
                  items={trucks.companies}
                  emptyText="No company was given."
                />
              </div>

              <p
                data-testid="gate-tonnes"
                className="rounded-xl bg-lightPrimary px-4 py-3 text-sm text-gray-600 dark:bg-navy-900 dark:text-gray-300"
              >
                {trucks.withWeight
                  ? `Cargo weight recorded at entry: ${fmt(
                      trucks.tonnes,
                      1
                    )} tonnes (${fmt(trucks.withWeight)} of ${fmt(
                      trucks.entries
                    )} entries had a weight).`
                  : "No cargo weight was recorded for these entries."}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* =====================================================
          INCIDENTS
          ===================================================== */}

      <SectionTitle note={periodNote}>Incidents and safety</SectionTitle>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-incidents"
          title="Incidents over time"
          subtitle="Incidents that happened in the period, by how serious they were."
          action={
            <OpenLink to="/admin/incidents" allowed={canOpen("incidents")}>
              Open Incident Management
            </OpenLink>
          }
        >
          {!isReady(incidentState) ? (
            <StateNote state={incidentState} what="incidents" />
          ) : (
            <>
              {incidents.cutShort && (
                <Warning testId="incident-cut-note">
                  Only the newest {fmt(INCIDENT_LIMIT)} incidents can be
                  read (back to {formatDay(incidents.oldestDay)}). Earlier
                  days in this period may be missing.
                </Warning>
              )}

              <ColumnChart
                testId="chart-incidents"
                buckets={grid.buckets}
                series={incidents.series}
                mode="stacked"
                unitWord="incidents"
                label={`Incidents ${grid.unit} by seriousness, ${label}`}
                emptyText="No incidents happened in this period."
              />
            </>
          )}
        </Panel>

        <Panel
          testId="panel-incident-mix"
          title="What kind of incidents"
          subtitle="Seriousness, type and handling status of the incidents above."
        >
          {!isReady(incidentState) ? (
            <StateNote state={incidentState} what="incidents" />
          ) : incidents.reported === 0 ? (
            <Empty>No incidents happened in this period.</Empty>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Seriousness
                </p>

                <ShareBar
                  testId="share-severity"
                  emptyText="No incidents."
                  items={[...SEVERITIES, "Other"]
                    .filter(
                      (name) =>
                        name !== "Other" || incidents.severityTotals.Other > 0
                    )
                    .map((name) => ({
                      label: name,
                      value: incidents.severityTotals[name],
                      color: SEVERITY_COLORS[name],
                    }))}
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Types
                </p>

                <BarList
                  testId="bars-incident-types"
                  items={incidents.types}
                  emptyText="No types."
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Handling status
                </p>

                <BarList
                  testId="bars-incident-status"
                  color="var(--an-s7)"
                  items={incidents.statuses}
                  emptyText="No statuses."
                />
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* =====================================================
          CARGO RECORDS
          ===================================================== */}

      <SectionTitle note={periodNote}>Cargo records</SectionTitle>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-cargo"
          title="Cargo records added"
          subtitle="Cargo entries that were registered in the period."
          action={
            <OpenLink to="/admin/cargo" allowed={canOpen("cargo")}>
              Open Cargo Operations
            </OpenLink>
          }
        >
          {!isReady(cargoState) ? (
            <StateNote state={cargoState} what="cargo records" />
          ) : (
            <ColumnChart
              testId="chart-cargo"
              buckets={grid.buckets}
              series={cargoAddedSeries}
              unitWord="records"
              label={`Cargo records added ${grid.unit}, ${label}`}
              emptyText="No cargo records were added in this period."
            />
          )}
        </Panel>

        <Panel
          testId="panel-cargo-mix"
          title="Cargo records by progress"
          subtitle="Where the cargo registered in this period stands now."
        >
          {!isReady(cargoState) ? (
            <StateNote state={cargoState} what="cargo records" />
          ) : cargo.addedTotal === 0 ? (
            <Empty>No cargo records were added in this period.</Empty>
          ) : (
            <div className="space-y-6">
              <ShareBar
                testId="share-cargo-status"
                emptyText="No cargo records."
                items={cargo.statuses}
              />

              {cargo.withOperation > 0 ? (
                <div data-testid="import-export">
                  <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                    Import and export
                  </p>

                  <BarList
                    testId="bars-import-export"
                    emptyText="No import or export records."
                    items={[
                      {
                        label: "Import",
                        value: importExport.Import.records,
                        color: "var(--an-s1)",
                        text: `${fmt(importExport.Import.records)} records${
                          importExport.Import.weighed
                            ? ` · ${fmt(importExport.Import.tonnes, 1)} t`
                            : ""
                        }`,
                      },
                      {
                        label: "Export",
                        value: importExport.Export.records,
                        color: "var(--an-s2)",
                        text: `${fmt(importExport.Export.records)} records${
                          importExport.Export.weighed
                            ? ` · ${fmt(importExport.Export.tonnes, 1)} t`
                            : ""
                        }`,
                      },
                    ]}
                  />

                  <p
                    data-testid="import-export-ratio"
                    className="mt-3 text-sm text-gray-600 dark:text-gray-300"
                  >
                    Import : Export ={" "}
                    <span className="font-bold text-navy-700 dark:text-white">
                      {ratioText}
                    </span>{" "}
                    (by {byTonnes ? "tonnes" : "number of records"})
                  </p>
                </div>
              ) : (
                <p
                  data-testid="import-export-missing"
                  className="rounded-xl bg-lightPrimary px-4 py-3 text-sm text-gray-600 dark:bg-navy-900 dark:text-gray-300"
                >
                  These cargo records do not say whether they are imports or
                  exports, so no import / export split can be shown.
                </p>
              )}

              {cargo.kinds.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                    Cargo types
                  </p>

                  <BarList
                    testId="bars-cargo-types"
                    color="var(--an-s3)"
                    items={cargo.kinds}
                    emptyText="No cargo types."
                  />
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* =====================================================
          PUBLISHED THROUGHPUT
          ===================================================== */}

      <SectionTitle note="Published figures, so they follow the months and years of the selected period">
        Port throughput
      </SectionTitle>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          testId="panel-containers"
          title="Container throughput in the selected period"
          subtitle={`Thousand TEU handled each ${
            containers.mode === "year" ? "year" : "month"
          }.`}
        >
          {!isReady(sources.container) ? (
            <StateNote state={sources.container} what="container throughput" />
          ) : (
            <>
              {containers.fallback && (
                <InfoNote testId="container-fallback">
                  No container figure is published for {label} yet. The
                  latest published months ({containers.items[0].title} –{" "}
                  {containers.items[containers.items.length - 1].title}) are
                  shown instead.
                </InfoNote>
              )}

              <ColumnChart
                testId="chart-containers"
                buckets={containerBuckets}
                series={containerSeries}
                whole={false}
                digits={1}
                unitWord="thousand TEU"
                label={`Container throughput in thousand TEU, ${
                  containers.fallback ? "latest published months" : label
                }`}
                emptyText="No container throughput has been published yet."
              />

              {containers.items.length > 0 && (
                <p
                  data-testid="container-total"
                  className="mt-3 text-sm text-gray-600 dark:text-gray-300"
                >
                  Total for the bars shown:{" "}
                  <span className="font-bold text-navy-700 dark:text-white">
                    {fmt(containers.total, 1)} thousand TEU
                  </span>
                  . Latest published month: {containers.latest}.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          testId="panel-cargo-years"
          title="Cargo throughput"
          subtitle="Thousand tonnes handled each year, by kind of cargo."
        >
          {!isReady(sources.cargoYears) ? (
            <StateNote state={sources.cargoYears} what="cargo throughput" />
          ) : (
            <>
              {cargoYears.fallback && (
                <InfoNote testId="cargo-years-fallback">
                  No cargo figure is published for {label} yet. The latest
                  published years ({cargoYears.years[0]} –{" "}
                  {cargoYears.years[cargoYears.years.length - 1]}) are shown
                  instead.
                </InfoNote>
              )}

              <ColumnChart
                testId="chart-cargo-years"
                buckets={cargoYearBuckets}
                series={cargoYears.series}
                mode="stacked"
                whole={false}
                digits={1}
                unitWord="thousand t"
                label={`Cargo throughput in thousand tonnes, ${
                  cargoYears.fallback ? "latest published years" : label
                }`}
                emptyText="No cargo throughput has been published yet."
              />

              {cargoYears.detail.length > 0 && (
                <div className="mt-5">
                  <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                    {cargoYears.detailYear} in detail (thousand tonnes)
                  </p>

                  <BarList
                    testId="bars-cargo-detail"
                    color="var(--an-s3)"
                    items={cargoYears.detail}
                    emptyText="No detail."
                  />
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* =====================================================
          RIGHT NOW
          ===================================================== */}

      <SectionTitle note="The situation right now. These do not change with the dates above.">
        Ships, berths and equipment
      </SectionTitle>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel
          testId="panel-ships"
          title="Ships"
          subtitle="Ships the system is tracking right now."
          action={
            <OpenLink to="/admin/vessels" allowed={canOpen("vessels")}>
              Open
            </OpenLink>
          }
        >
          {!isReady(sources.vessels) ? (
            <StateNote state={sources.vessels} what="ships" />
          ) : ships.total === 0 ? (
            <Empty>No ships are on record yet.</Empty>
          ) : (
            <div className="space-y-6">
              <ShareBar
                testId="share-ships"
                emptyText="No ships."
                items={[
                  {
                    label: "At berth",
                    value: ships.states.berth,
                    color: "var(--an-s1)",
                  },
                  {
                    label: "At anchorage",
                    value: ships.states.anchor,
                    color: "var(--an-s2)",
                  },
                  {
                    label: "Underway",
                    value: ships.states.underway,
                    color: "var(--an-s3)",
                  },
                  {
                    label: "Other",
                    value: ships.states.other,
                    color: "var(--an-other)",
                  },
                ]}
              />

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  By flag
                </p>

                <BarList
                  testId="bars-ship-flags"
                  color="var(--an-s2)"
                  items={ships.byFlag}
                  emptyText="No flags."
                />
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ship types are in the Vessel Type Distribution graph above.
                The Vessel Traffic Trend graph counts ships seen by the
                tracking system, not formal port calls.
              </p>
            </div>
          )}
        </Panel>

        <Panel
          testId="panel-berths"
          title="Berths"
          subtitle="Active berths right now."
          action={
            <OpenLink to="/admin/berths" allowed={canOpen("berths")}>
              Open
            </OpenLink>
          }
        >
          {!isReady(sources.berths) ? (
            <StateNote state={sources.berths} what="berths" />
          ) : berths.total === 0 ? (
            <Empty>No berths are on record yet.</Empty>
          ) : (
            <div className="space-y-6">
              <p
                data-testid="berth-use"
                className="text-sm text-gray-600 dark:text-gray-300"
              >
                <span className="text-3xl font-bold text-navy-700 dark:text-white">
                  {berths.percent}%
                </span>{" "}
                in use ({fmt(berths.status.occupied)} of {fmt(berths.total)}{" "}
                berths)
              </p>

              <ShareBar
                testId="share-berths"
                emptyText="No berths."
                items={[
                  {
                    label: "Occupied",
                    value: berths.status.occupied,
                    color: BERTH_COLORS.occupied,
                  },
                  {
                    label: "Available",
                    value: berths.status.available,
                    color: BERTH_COLORS.available,
                  },
                  {
                    label: "Maintenance",
                    value: berths.status.maintenance,
                    color: BERTH_COLORS.maintenance,
                  },
                  {
                    label: "Other",
                    value: berths.status.other,
                    color: BERTH_COLORS.other,
                  },
                ]}
              />

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Use by terminal
                </p>

                <BarList
                  testId="bars-terminals"
                  keepZero
                  max={100}
                  items={berths.terminals.map((terminal) => ({
                    label: terminal.label,
                    value: percent(terminal.occupied, terminal.total),
                    text: `${fmt(terminal.occupied)} of ${fmt(
                      terminal.total
                    )} · ${percent(terminal.occupied, terminal.total)}%`,
                  }))}
                  emptyText="No terminals."
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  By berth type
                </p>

                <BarList
                  testId="bars-berth-types"
                  color="var(--an-s3)"
                  items={berths.byType}
                  emptyText="No berth types."
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel
          testId="panel-equipment"
          title="Equipment and maintenance"
          subtitle="Port equipment right now."
          action={
            <OpenLink to="/admin/maintenance" allowed={canOpen("asset_maintenance")}>
              Open
            </OpenLink>
          }
        >
          {!isReady(sources.assets) ? (
            <StateNote state={sources.assets} what="equipment" />
          ) : equipment.total === 0 ? (
            <Empty>No equipment has been added yet.</Empty>
          ) : (
            <div className="space-y-6">
              <ShareBar
                testId="share-equipment"
                emptyText="No equipment."
                items={equipmentStatuses}
              />

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  By kind of equipment
                </p>

                <BarList
                  testId="bars-equipment-categories"
                  items={equipment.categories}
                  emptyText="No categories."
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                  Maintenance jobs
                </p>

                <BarList
                  testId="bars-jobs"
                  color="var(--an-s7)"
                  items={equipment.jobs}
                  emptyText="No maintenance jobs yet."
                />
              </div>

              <p
                data-testid="equipment-serviced"
                className="rounded-xl bg-lightPrimary px-4 py-3 text-sm text-gray-600 dark:bg-navy-900 dark:text-gray-300"
              >
                Equipment whose last service was in the selected period:{" "}
                <span className="font-bold text-navy-700 dark:text-white">
                  {fmt(equipment.servicedInPeriod)}
                </span>
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* =====================================================
          WHERE THE FIGURES COME FROM
          ===================================================== */}

      <SectionTitle>Where these figures come from</SectionTitle>

      <Panel
        testId="panel-coverage"
        title="Data used on this page"
        subtitle="Every graph above is worked out from these lists. Nothing on this page is sample data."
      >
        <ul className="divide-y divide-gray-100 dark:divide-white/10">
          {SOURCES.map((source) => {
            const state = sources[source.key];

            const tone =
              state.status === "ready"
                ? "green"
                : state.status === "error"
                ? "red"
                : "grey";

            const words =
              state.status === "ready"
                ? state.stale
                  ? "Old data"
                  : "Loaded"
                : state.status === "denied"
                ? "Not allowed"
                : state.status === "error"
                ? "Could not load"
                : "Loading";

            return (
              <li
                key={source.key}
                data-testid={`coverage-${source.key}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="text-sm font-medium text-navy-700 dark:text-white">
                  {SOURCE_NAMES[source.key]}
                </span>

                <span className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                  {state.status === "ready" ? coverage[source.key] : ""}

                  <Chip tone={tone}>{words}</Chip>
                </span>
              </li>
            );
          })}

          <li
            data-testid="coverage-traffic"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
          >
            <span className="text-sm font-medium text-navy-700 dark:text-white">
              Ship positions (traffic)
            </span>

            <span className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              {traffic.status === "ready"
                ? `${fmt(trafficFigures.recordedDays)} of ${fmt(
                    trafficFigures.totalDays
                  )} days have stored positions`
                : ""}

              <Chip
                tone={
                  traffic.status === "ready"
                    ? "green"
                    : traffic.status === "error"
                    ? "red"
                    : "grey"
                }
              >
                {traffic.status === "ready"
                  ? traffic.stale
                    ? "Old data"
                    : "Loaded"
                  : traffic.status === "denied"
                  ? "Not allowed"
                  : traffic.status === "error"
                  ? "Could not load"
                  : "Loading"}
              </Chip>
            </span>
          </li>
        </ul>

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Times and dates are Singapore time (UTC+8). The lists refresh
          every 5 minutes, or when you press Refresh.
        </p>
      </Panel>
    </div>
  );
};

export default Analytics;
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MdDirectionsBoat,
  MdSearch,
  MdRefresh,
  MdHistory,
  MdLocationOn,
  MdSpeed,
  MdSync,
  MdWifi,
  MdWifiOff,
} from "react-icons/md";

import "flag-icons/css/flag-icons.min.css";

import { apiGet, apiPost } from "services/api";

import { getVesselFlag } from "./vesselFlags";

/* =========================================================
   PORT OF SINGAPORE SETTINGS
   ========================================================= */

const PORT_TIME_ZONE = "Asia/Singapore";

/* A saved AIS position older than this is marked "stale" in the
   table. It is a display rule only; nothing is deleted. */
const STALE_POSITION_MINUTES = 120;

/* The page re-reads the database and AIS status this often while the
   browser tab is visible. */
const AUTO_REFRESH_MS = 60 * 1000;

/* The Singapore Strait can return hundreds of vessels, so the table
   shows this many rows at a time. */
const PAGE_SIZE = 50;

/* Vessels looked up per destination request. The backend accepts at
   most this many at once. */
const DESTINATION_BATCH_SIZE = 50;

/* Periods offered for the arrivals and departures tables. */
const EVENT_HOUR_OPTIONS = [
  { hours: 6, label: "Last 6 hours" },
  { hours: 24, label: "Last 24 hours" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last 7 days" },
];

const DEFAULT_EVENT_HOURS = 24;

/* =========================================================
   HELPERS
   ========================================================= */

/* "YYYY-MM-DD" for a moment, as the date in Singapore. */
const toDateInputValue = (date) =>
  date.toLocaleDateString("en-CA", { timeZone: PORT_TIME_ZONE });

const formatDateTime = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return `${date.toLocaleString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} SGT`;
};

/* Minutes since a timestamp, or null if it cannot be read. */
const ageInMinutes = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
};

const formatAge = (value) => {
  const minutes = ageInMinutes(value);

  if (minutes === null) return "";

  if (minutes < 1) return "just now";

  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 48) return `${hours} h ago`;

  return `${Math.floor(hours / 24)} d ago`;
};

const isStalePosition = (vessel) => {
  const minutes = ageInMinutes(vessel.ais_last_updated_at);

  return minutes !== null && minutes > STALE_POSITION_MINUTES;
};

const formatCoordinate = (value) => {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);

  return Number.isFinite(number) ? number.toFixed(5) : "—";
};

const formatNumber = (value, decimals = 1) => {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);

  return Number.isFinite(number) ? number.toFixed(decimals) : "—";
};

const vesselName = (vessel) =>
  vessel.vessel_name || vessel.name || vessel.ship_name || "Unknown vessel";

const asArray = (response, keys = []) => {
  if (Array.isArray(response)) return response;

  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key];
  }

  return null;
};

const isValidPosition = (vessel) => {
  const lat = Number(vessel.latitude);

  const lon = Number(vessel.longitude);

  return (
    vessel.latitude !== null &&
    vessel.latitude !== undefined &&
    vessel.latitude !== "" &&
    vessel.longitude !== null &&
    vessel.longitude !== undefined &&
    vessel.longitude !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
};

const statusFor = (vessel) => {
  const status = String(
    vessel.status || vessel.ais_navigation_status || ""
  ).toLowerCase();

  if (status.includes("berth") || status.includes("moored")) return "At Berth";

  if (status.includes("anchor")) return "Anchorage";

  if (status.includes("expected")) return "Expected";

  if (status.includes("under way") || status.includes("underway")) {
    return "Underway";
  }

  return vessel.status || "Unknown";
};

const statusClass = (status) => {
  if (status === "At Berth") {
    return "bg-green-500/10 text-green-400";
  }

  if (status === "Anchorage") {
    return "bg-orange-500/10 text-orange-400";
  }

  if (status === "Expected") {
    return "bg-blue-500/10 text-blue-400";
  }

  if (status === "Underway") {
    return "bg-cyan-500/10 text-cyan-400";
  }

  return "bg-white/10 text-gray-300";
};

/* =========================================================
   PAGE
   ========================================================= */

const textOrDash = (value) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

/* Flag of the country that issued the vessel's MMSI (its flag state),
   with the country name shown when the flag is hovered. */
const VesselFlag = ({ mmsi, fallback }) => {
  const flag = getVesselFlag(mmsi);

  if (flag && flag.code) {
    return (
      <span
        className={`fi fi-${flag.code} rounded-sm text-xl`}
        title={flag.name}
        role="img"
        aria-label={`Flag: ${flag.name}`}
      />
    );
  }

  if (flag) {
    return <span className="text-xs text-gray-500">{flag.name}</span>;
  }

  return (
    <span className="text-xs text-gray-500" title="Flag not reported">
      {fallback || "—"}
    </span>
  );
};

/* Newest event first; events without a readable time go last. */
const sortNewestFirst = (rows) => {
  const time = (row) => {
    const value = row.event_time ? new Date(row.event_time).getTime() : NaN;

    return Number.isNaN(value) ? -Infinity : value;
  };

  return [...rows].sort((a, b) => {
    const difference = time(b) - time(a);

    return difference !== 0 && !Number.isNaN(difference) ? difference : 0;
  });
};

/* One table of port-call events. Arrivals and departures each get
   their own table, so "arrived from" and "departing to" are never
   mixed in one list. */
const MovementTable = ({
  title,
  description,
  emptyText,
  atLabel,
  otherLabel,
  otherKey,
  rows,
}) => (
  <section className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800">
    <h2 className="text-lg font-bold text-navy-700 dark:text-white">
      {title} ({rows.length})
    </h2>

    <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
      {description}
    </p>

    {rows.length === 0 ? (
      <p className="mt-5 rounded-xl bg-black/10 p-4 text-sm text-gray-400">
        {emptyText}
      </p>
    ) : (
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-white/10">
              {["Vessel", "MMSI", "IMO", atLabel, otherLabel, "Event Time"].map(
                (heading) => (
                  <th
                    key={heading}
                    className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500"
                  >
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id ?? `${row.mmsi}-${row.event_time}-${index}`}
                className="border-b border-gray-100 dark:border-white/5"
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <MdDirectionsBoat className="h-6 w-6 shrink-0 text-brand-500" />

                    <p className="font-semibold text-navy-700 dark:text-white">
                      {vesselName(row)}
                    </p>
                  </div>
                </td>

                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                  {textOrDash(row.mmsi)}
                </td>

                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                  {textOrDash(row.imo_number)}
                </td>

                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                  {textOrDash(row.port)}
                </td>

                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                  {textOrDash(row[otherKey])}
                </td>

                <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                  {formatDateTime(row.event_time)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const VesselManagement = () => {
  const [vessels, setVessels] = useState([]);

  const [history, setHistory] = useState([]);

  const [search, setSearch] = useState("");

  const [mmsi, setMmsi] = useState("");

  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  );

  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));

  const [activeTab, setActiveTab] = useState("current");

  const [loadingVessels, setLoadingVessels] = useState(true);

  const [syncing, setSyncing] = useState(false);

  const [loadingHistory, setLoadingHistory] = useState(false);

  const [vesselError, setVesselError] = useState("");

  const [syncMessage, setSyncMessage] = useState("");

  const [historyError, setHistoryError] = useState("");

  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [aisStatus, setAisStatus] = useState(null);

  const [aisStatusError, setAisStatusError] = useState("");

  const [syncFailed, setSyncFailed] = useState(false);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* Declared destinations, keyed by MMSI. A string is the destination, null
     means the vessel declares none, and a missing key means not looked up. */
  const [destinations, setDestinations] = useState({});

  const [destinationsLoading, setDestinationsLoading] = useState(false);

  const [destinationsError, setDestinationsError] = useState("");

  const mountedRef = useRef(true);

  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const [eventHours, setEventHours] = useState(DEFAULT_EVENT_HOURS);

  const [arrivals, setArrivals] = useState([]);

  const [departures, setDepartures] = useState([]);

  const [loadingEvents, setLoadingEvents] = useState(false);

  const [eventsError, setEventsError] = useState("");

  const [eventsLoaded, setEventsLoaded] = useState(false);

  const [eventsRefreshedAt, setEventsRefreshedAt] = useState(null);

  const [eventsMeta, setEventsMeta] = useState(null);

  const loadAisStatus = useCallback(async () => {
    try {
      const result = await apiGet("/ais/status");

      setAisStatus(result);

      setAisStatusError("");
    } catch (error) {
      setAisStatus(null);

      setAisStatusError(
        error?.message || "Unable to read AIS listener status."
      );
    }
  }, []);

  /* silent = true is used by the automatic refresh: it does not
     replace the table with "Loading..." every minute. */
  const loadVessels = useCallback(async (silent = false) => {
    if (!silent) setLoadingVessels(true);

    setVesselError("");

    try {
      const response = await apiGet("/vessels");

      const records = asArray(response, ["items", "vessels", "data"]);

      if (!records) {
        throw new Error("The vessels endpoint returned an unexpected response.");
      }

      setVessels(records);

      setLastRefreshedAt(new Date());
    } catch (error) {
      if (!silent) setVessels([]);

      setVesselError(
        error?.message || "Unable to load vessels from the backend."
      );
    } finally {
      setLoadingVessels(false);
    }
  }, []);

  const refreshAll = useCallback(
    async (silent = false) => {
      await Promise.all([loadVessels(silent), loadAisStatus()]);
    },
    [loadVessels, loadAisStatus]
  );

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  /* Automatic refresh while the tab is visible, and again when the
     person comes back to a tab that has been in the background. */
  useEffect(() => {
    let lastRun = Date.now();

    const run = () => {
      lastRun = Date.now();

      refreshAll(true);
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, AUTO_REFRESH_MS);

    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRun > AUTO_REFRESH_MS
      ) {
        run();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);

      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshAll]);

  /* Back to the first page of rows whenever the search changes. */
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const syncAisNow = async () => {
    setSyncing(true);

    setSyncMessage("");

    setSyncFailed(false);

    setVesselError("");

    try {
      // Existing backend endpoint: POST /ais/sync
      const result = await apiPost("/ais/sync", {});

      const message =
        result?.message ||
        result?.detail ||
        "AIS synchronization request completed.";

      setSyncMessage(String(message));

      await refreshAll();
    } catch (error) {
      setSyncFailed(true);

      setSyncMessage(
        error?.message ||
          "AIS sync failed. Check authentication and the backend endpoint."
      );

      await loadAisStatus();
    } finally {
      setSyncing(false);
    }
  };

  const loadHistory = async (event) => {
    event?.preventDefault();

    if (!startDate || !endDate) {
      setHistoryError("Select a start date and end date.");

      return;
    }

    if (startDate > endDate) {
      setHistoryError("Start date must not be after end date.");

      return;
    }

    setLoadingHistory(true);

    setHistoryError("");

    setHistoryLoaded(false);

    setHistory([]);

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });

      if (mmsi.trim()) params.set("mmsi", mmsi.trim());

      // Requires a backend GET /ais/history endpoint.
      const response = await apiGet(`/ais/history?${params.toString()}`);

      const records = asArray(response, ["records", "items", "history", "data"]);

      if (!records) {
        throw new Error("Unexpected response format from the history endpoint.");
      }

      setHistory(records);

      setHistoryLoaded(true);
    } catch (error) {
      setHistory([]);

      setHistoryError(
        error?.message ||
          "Historical data is unavailable. The backend history endpoint may not exist."
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  /* Arrivals and departures come from the backend GET /ais/port-events
     endpoint. They are loaded when the tab is opened or the period
     changes, and by the Refresh button, but not by the one-minute
     automatic refresh, because each load asks the AIS provider. */
  const loadPortEvents = useCallback(async () => {
    setLoadingEvents(true);

    setEventsError("");

    try {
      const response = await apiGet(`/ais/port-events?hours=${eventHours}`);

      if (
        !Array.isArray(response?.arrivals) ||
        !Array.isArray(response?.departures)
      ) {
        throw new Error(
          "Unexpected response format from the port-events endpoint."
        );
      }

      setArrivals(response.arrivals);

      setDepartures(response.departures);

      setEventsMeta({
        oldest: response.oldest_event_time || null,
        newest: response.newest_event_time || null,
        warnings: Array.isArray(response.warnings) ? response.warnings : [],
      });

      setEventsLoaded(true);

      setEventsRefreshedAt(new Date());
    } catch (error) {
      setArrivals([]);

      setDepartures([]);

      setEventsMeta(null);

      setEventsLoaded(false);

      setEventsError(
        error?.message ||
          "Arrival and departure data is unavailable. The backend port-events endpoint may not exist."
      );
    } finally {
      setLoadingEvents(false);
    }
  }, [eventHours]);

  useEffect(() => {
    if (activeTab === "movements") loadPortEvents();
  }, [activeTab, loadPortEvents]);

  const sortedArrivals = useMemo(() => sortNewestFirst(arrivals), [arrivals]);

  const sortedDepartures = useMemo(
    () => sortNewestFirst(departures),
    [departures]
  );

  /* Newest AIS update first; vessels without a timestamp go last. */
  const sortedVessels = useMemo(() => {
    const time = (vessel) => {
      const value = vessel.ais_last_updated_at
        ? new Date(vessel.ais_last_updated_at).getTime()
        : NaN;

      return Number.isNaN(value) ? -Infinity : value;
    };

    return [...vessels].sort((a, b) => {
      const difference = time(b) - time(a);

      if (difference !== 0 && !Number.isNaN(difference)) return difference;

      return vesselName(a).localeCompare(vesselName(b));
    });
  }, [vessels]);

  const filteredVessels = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return sortedVessels;

    return sortedVessels.filter((vessel) =>
      [
        vesselName(vessel),
        vessel.mmsi,
        vessel.imo_number,
        vessel.vessel_type,
        vessel.flag,
        getVesselFlag(vessel.mmsi)?.name,
        vessel.destination,
        destinations[String(vessel.mmsi)],
        vessel.status,
      ].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [sortedVessels, search, destinations]);

  const visibleVessels = filteredVessels.slice(0, visibleCount);

  /* Vessels on screen whose destination has not been looked up. */
  const pendingDestinationMmsis = Array.from(
    new Set(
      visibleVessels
        .filter(
          (vessel) =>
            !vessel.destination &&
            /^\d{9}$/.test(String(vessel.mmsi ?? "")) &&
            !(String(vessel.mmsi) in destinations)
        )
        .map((vessel) => String(vessel.mmsi))
    )
  );

  /* After VesselAPI refuses a request (HTTP 403 or 429) the backend sends
     it nothing for a while, and /ais/status reports how long. */
  const providerPauseSeconds = Number(aisStatus?.provider_pause_seconds);

  const providerPaused =
    Number.isFinite(providerPauseSeconds) && providerPauseSeconds > 0;

  const providerPauseMinutes = Math.max(
    1,
    Math.ceil((providerPauseSeconds || 0) / 60)
  );

  /* The stored error text was written when the failure happened, so any
     "N minutes" inside it is out of date by now. The live figure is shown
     in its own message, and a message that only says "requests are paused"
     is dropped once the pause is over. */
  const rawAisError = aisStatus?.last_error ? String(aisStatus.last_error) : "";

  const aisErrorIsPauseNotice = /VesselAPI requests are paused for about/i.test(
    rawAisError
  );

  const aisErrorText = rawAisError
    .replace(/\s*Further requests are paused for about \d+ minute\(s\)\.?\s*$/i, "")
    .replace(/paused for about \d+ more minute\(s\) because/i, "paused because");

  const showAisError =
    Boolean(aisErrorText) && !(aisErrorIsPauseNotice && !providerPaused);

  /* "No positions returned" only means something when a request to the
     provider actually succeeded and the latest attempt had no error. */
  const providerBatchEmpty =
    Boolean(aisStatus?.last_message_at) &&
    Number(aisStatus?.last_provider_received ?? 0) === 0 &&
    !aisStatus?.last_error;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* The vessel records have no destination, so the destination each
     vessel declares over AIS is looked up on request. It is not done
     automatically because every vessel is one VesselAPI request, which
     counts against the monthly quota. */
  const loadDestinations = async () => {
    const pending = pendingDestinationMmsis;

    if (pending.length === 0 || destinationsLoading || providerPaused) return;

    setDestinationsLoading(true);

    setDestinationsError("");

    for (
      let start = 0;
      start < pending.length;
      start += DESTINATION_BATCH_SIZE
    ) {
      const batch = pending.slice(start, start + DESTINATION_BATCH_SIZE);

      try {
        const params = new URLSearchParams();

        batch.forEach((value) => params.append("mmsi", value));

        const response = await apiGet(
          `/ais/destinations?${params.toString()}`
        );

        if (
          !response ||
          typeof response.destinations !== "object" ||
          response.destinations === null
        ) {
          throw new Error(
            "Unexpected response format from the destinations endpoint."
          );
        }

        if (!mountedRef.current) return;

        setDestinations((current) => ({
          ...current,
          ...response.destinations,
        }));

        if (Array.isArray(response.warnings) && response.warnings.length) {
          setDestinationsError(String(response.warnings[0]));

          // The provider is refusing requests: do not send the rest.
          break;
        }
      } catch (error) {
        if (mountedRef.current) {
          setDestinationsError(
            error?.message || "Unable to load vessel destinations."
          );
        }

        break;
      }
    }

    if (mountedRef.current) setDestinationsLoading(false);
  };

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return history;

    return history.filter((record) =>
      [
        vesselName(record),
        record.mmsi,
        record.imo_number,
        record.vessel_type,
        record.ais_source,
        record.source,
      ].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [history, search]);

  const positionedVessels = vessels.filter(isValidPosition).length;

  const atBerth = vessels.filter((vessel) => statusFor(vessel) === "At Berth").length;

  const atAnchor = vessels.filter((vessel) => statusFor(vessel) === "Anchorage").length;

  const stalePositions = vessels.filter(
    (vessel) => isValidPosition(vessel) && isStalePosition(vessel)
  ).length;

  /* Newest saved AIS update across all vessels. */
  const newestUpdate = vessels.reduce((newest, vessel) => {
    const date = vessel.ais_last_updated_at
      ? new Date(vessel.ais_last_updated_at)
      : null;

    if (!date || Number.isNaN(date.getTime())) return newest;

    return !newest || date > newest ? date : newest;
  }, null);

  const inputClass =
    "!box-border !w-full !rounded-xl !border !border-white/10 !bg-transparent !px-3 !py-3 !text-sm !text-white !shadow-none !outline-none placeholder:!text-gray-400 focus:!border-brand-500 focus:!ring-0";

  const panelClass =
    "rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800";

  return (
    <div className="mt-5 space-y-5">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdDirectionsBoat className="h-7 w-7" />
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
              Vessel Management
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
              Vessel records, AIS positions and historical movement records
              for the Port of Singapore. All times are Singapore time (SGT).
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 md:flex-nowrap">
          <button
            type="button"
            onClick={syncAisNow}
            disabled={syncing || providerPaused}
            title={
              providerPaused
                ? "VesselAPI refused the last request, so syncing is paused."
                : undefined
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MdSync className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />

            {syncing ? "Syncing AIS..." : "Sync AIS Now"}
          </button>

          <button
            type="button"
            onClick={() => refreshAll()}
            disabled={loadingVessels}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-navy-700 hover:bg-gray-100 dark:text-white dark:hover:bg-navy-700 disabled:opacity-60"
          >
            <MdRefresh className="h-5 w-5" />

            Refresh
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
        <p className="font-semibold text-blue-300">Live vessel data status</p>

        <p className="mt-1 text-sm text-blue-200">
          Vessels displayed here come from the backend database. This page does
          not generate sample vessels or fabricate positions.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-gray-200">
            {aisStatus?.running ? (
              <MdWifi className="h-5 w-5 text-green-400" />
            ) : (
              <MdWifiOff className="h-5 w-5 text-orange-400" />
            )}

            Listener: {aisStatus?.running ? "Running" : "Not confirmed"}
          </span>

          <span className="text-gray-200">
            Messages received: {aisStatus?.total_received ?? "—"}
          </span>

          <span className="text-gray-200">
            Last provider batch: {aisStatus?.last_provider_received ?? "—"}
          </span>

          <span className="text-gray-200">
            Created: {aisStatus?.total_created ?? "—"}
          </span>

          <span className="text-gray-200">
            Updated: {aisStatus?.total_updated ?? "—"}
          </span>

          <span className="text-gray-200">
            Newest saved position:{" "}
            {newestUpdate
              ? `${formatDateTime(newestUpdate)} (${formatAge(newestUpdate)})`
              : "—"}
          </span>

          <span className="text-gray-200">
            Page refreshed:{" "}
            {lastRefreshedAt ? formatDateTime(lastRefreshedAt) : "—"}
          </span>
        </div>

        {providerPaused && (
          <p className="mt-3 break-words text-sm text-orange-300" role="status">
            VesselAPI refused the last request, so this backend is sending it
            nothing for about {providerPauseMinutes} more minute(s). Sync AIS
            Now and destination lookups are switched off until then. The
            vessels below are the last positions saved in the database.
          </p>
        )}

        {showAisError && (
          <p className="mt-3 break-words text-sm text-red-300">
            AIS error: {aisErrorText}
          </p>
        )}

        {aisStatusError && (
          <p className="mt-3 break-words text-sm text-orange-300">
            Status unavailable: {aisStatusError}
          </p>
        )}

        {providerBatchEmpty && (
          <p className="mt-3 text-sm text-amber-300" role="status">
            No vessel positions were returned in the last recorded provider
            batch. The listener can be running while the provider returns no
            data for the configured area. This does not mean the Port of
            Singapore is empty.
          </p>
        )}

        {syncMessage && (
          <p
            className={`mt-3 break-words text-sm ${
              syncFailed ? "text-red-300" : "text-gray-200"
            }`}
            role="status"
          >
            {syncMessage}
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Vessels", value: vessels.length, color: "text-white" },
          { label: "At Berth", value: atBerth, color: "text-green-400" },
          { label: "At Anchorage", value: atAnchor, color: "text-orange-400" },
          { label: "With Valid Position", value: positionedVessels, color: "text-brand-500" },
          {
            label: `Stale (> ${STALE_POSITION_MINUTES / 60} h)`,
            value: stalePositions,
            color: stalePositions > 0 ? "text-orange-400" : "text-white",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800"
          >
            <p className="text-sm text-gray-500 dark:text-gray-300">
              {item.label}
            </p>

            <p className={`mt-2 text-2xl font-bold ${item.color}`}>
              {item.value}
            </p>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Vessel data views">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            activeTab === "current"
              ? "bg-brand-500 text-white"
              : "bg-white text-gray-600 dark:bg-navy-800 dark:text-gray-300"
          }`}
        >
          Current Vessels
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            activeTab === "history"
              ? "bg-brand-500 text-white"
              : "bg-white text-gray-600 dark:bg-navy-800 dark:text-gray-300"
          }`}
        >
          <MdHistory className="h-5 w-5" />

          Historical Vessel Data
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("movements")}
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            activeTab === "movements"
              ? "bg-brand-500 text-white"
              : "bg-white text-gray-600 dark:bg-navy-800 dark:text-gray-300"
          }`}
        >
          <MdLocationOn className="h-5 w-5" />

          Arrivals &amp; Departures
        </button>
      </nav>

      {activeTab === "current" && (
        <section className={panelClass}>
          <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                Vessel Records
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                Current vessel records and their latest saved AIS positions.
              </p>
            </div>

            <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-white/10 bg-transparent px-3 md:w-72">
              <MdSearch className="h-5 w-5 shrink-0 text-gray-400" />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vessels..."
                aria-label="Search vessels"
                className="!m-0 !min-w-0 !flex-1 !border-0 !bg-transparent !p-0 !text-sm !text-white !shadow-none !outline-none placeholder:!text-gray-400 focus:!border-0 focus:!ring-0"
                style={{
                  background: "transparent",
                  backgroundColor: "transparent",
                  boxShadow: "none",
                  color: "inherit",
                }}
              />
            </label>
          </div>

          {vesselError && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <p className="font-semibold">Unable to load vessels</p>

              <p className="mt-1 break-words">{vesselError}</p>

              <button
                type="button"
                onClick={() => loadVessels()}
                className="mt-2 font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}

          {destinationsError && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
              <p className="font-semibold">
                Some destinations could not be loaded
              </p>

              <p className="mt-1 break-words">{destinationsError}</p>
            </div>
          )}

          {!loadingVessels &&
            !vesselError &&
            pendingDestinationMmsis.length > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-300">
                  {providerPaused
                    ? "Destination lookups are switched off while VesselAPI is refusing requests (see the status box above). "
                    : "Destinations are not loaded automatically, because each vessel is one VesselAPI request against your monthly quota. "}
                  {pendingDestinationMmsis.length} vessel(s) on screen have no
                  destination yet.
                </p>

                <button
                  type="button"
                  onClick={loadDestinations}
                  disabled={destinationsLoading || providerPaused}
                  title={
                    providerPaused
                      ? "VesselAPI refused the last request, so lookups are paused."
                      : undefined
                  }
                  className="shrink-0 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {destinationsLoading
                    ? "Looking up..."
                    : `Look up ${pendingDestinationMmsis.length} destination(s)`}
                </button>
              </div>
            )}

          {loadingVessels ? (
            <p className="py-10 text-center text-sm text-gray-400">
              Loading vessel records...
            </p>
          ) : !vesselError && filteredVessels.length === 0 ? (
            <div className="py-10 text-center">
              <MdDirectionsBoat className="mx-auto mb-3 h-10 w-10 text-gray-500" />

              <p className="font-semibold text-white">
                No vessel records found
              </p>

              <p className="mx-auto mt-2 max-w-xl text-sm text-gray-400">
                {vessels.length > 0
                  ? "No vessel matches your search."
                  : "The backend currently has no vessel records to display. Select Sync AIS Now to request a fresh provider query. If the provider returns no positions again, the frontend cannot create genuine live vessel records. This does not prove that the Port of Singapore is empty."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/10">
                    {[
                      "Vessel",
                      "MMSI",
                      "IMO",
                      "Flag",
                      "Position",
                      "Speed / Course",
                      "Destination",
                      "Status",
                      "Last AIS Update",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {visibleVessels.map((vessel, index) => {
                    const status = statusFor(vessel);

                    const stale = isStalePosition(vessel);

                    const lookedUp = destinations[String(vessel.mmsi)];

                    const destinationText =
                      vessel.destination ||
                      (typeof lookedUp === "string" ? lookedUp : null);

                    // "Unknown" is not information, so it is not shown.
                    const vesselType =
                      vessel.vessel_type &&
                      String(vessel.vessel_type).trim().toLowerCase() !==
                        "unknown"
                        ? vessel.vessel_type
                        : null;

                    return (
                      <tr
                        key={vessel.id ?? vessel.mmsi ?? `${vesselName(vessel)}-${index}`}
                        className="border-b border-gray-100 dark:border-white/5"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <MdDirectionsBoat className="h-6 w-6 text-brand-500" />

                            <div>
                              <p className="font-semibold text-navy-700 dark:text-white">
                                {vesselName(vessel)}
                              </p>

                              <p className="text-xs text-gray-500">
                                ID: {vessel.id ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {vessel.mmsi ?? "—"}
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {vessel.imo_number ?? "—"}
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {vesselType && <p>{vesselType}</p>}

                          <div
                            className={`flex items-center ${
                              vesselType ? "mt-1" : ""
                            }`}
                          >
                            <VesselFlag
                              mmsi={vessel.mmsi}
                              fallback={vessel.flag}
                            />
                          </div>
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {isValidPosition(vessel) ? (
                            <span className="flex items-center gap-1 whitespace-nowrap">
                              <MdLocationOn className="text-brand-500" />

                              {formatCoordinate(vessel.latitude)},{" "}
                              {formatCoordinate(vessel.longitude)}
                            </span>
                          ) : (
                            "No position"
                          )}
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <MdSpeed />

                            {vessel.speed_knots == null
                              ? "—"
                              : `${formatNumber(vessel.speed_knots, 1)} kn`}
                          </span>

                          <p className="text-xs text-gray-500">
                            Course{" "}
                            {vessel.course_deg == null
                              ? "—"
                              : `${formatNumber(vessel.course_deg, 0)}°`}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {destinationText ? (
                            <p>{destinationText}</p>
                          ) : lookedUp === null ? (
                            <p
                              className="text-xs text-gray-500"
                              title="This vessel has not declared a destination over AIS."
                            >
                              Not declared
                            </p>
                          ) : destinationsLoading ? (
                            <p className="text-xs text-gray-500">Loading…</p>
                          ) : (
                            <p title="Not looked up yet. Use the Look up destinations button above the table.">
                              —
                            </p>
                          )}

                          {vessel.eta && (
                            <p className="text-xs text-gray-500">
                              ETA {formatDateTime(vessel.eta)}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>
                            {status}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          <p className="whitespace-nowrap">
                            {formatDateTime(vessel.ais_last_updated_at)}
                          </p>

                          {vessel.ais_last_updated_at && (
                            <p
                              className={`text-xs ${
                                stale ? "text-orange-400" : "text-gray-500"
                              }`}
                            >
                              {formatAge(vessel.ais_last_updated_at)}
                              {stale ? " • stale position" : ""}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-xs text-gray-400">
                  Showing {visibleVessels.length} of {filteredVessels.length}{" "}
                  vessel(s)
                  {filteredVessels.length !== vessels.length
                    ? ` (filtered from ${vessels.length})`
                    : ""}
                  , newest AIS update first. Flags come from the country code
                  in each vessel&apos;s MMSI. Destinations are what each
                  vessel&apos;s crew declares over AIS, so they can be blank,
                  free text or out of date.
                </p>

                {filteredVessels.length > visibleVessels.length && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((count) => count + PAGE_SIZE)
                    }
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-100 dark:text-white dark:hover:bg-navy-700"
                  >
                    Show {Math.min(PAGE_SIZE, filteredVessels.length - visibleVessels.length)} more
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === "history" && (
        <section className={panelClass}>
          <h2 className="flex items-center gap-2 text-lg font-bold text-navy-700 dark:text-white">
            <MdHistory className="h-6 w-6 text-brand-500" />

            Historical AIS Positions
          </h2>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
            Search recorded positions by date range and optional MMSI.
          </p>

          <form
            onSubmit={loadHistory}
            className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <div>
              <label htmlFor="history-start" className="mb-2 block text-sm text-gray-300">
                Start date
              </label>

              <input
                id="history-start"
                type="date"
                required
                value={startDate}
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="history-end" className="mb-2 block text-sm text-gray-300">
                End date
              </label>

              <input
                id="history-end"
                type="date"
                required
                value={endDate}
                min={startDate}
                max={toDateInputValue(new Date())}
                onChange={(event) => setEndDate(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="history-mmsi" className="mb-2 block text-sm text-gray-300">
                MMSI (optional)
              </label>

              <input
                id="history-mmsi"
                value={mmsi}
                onChange={(event) => setMmsi(event.target.value)}
                placeholder="Filter by MMSI"
                className={inputClass}
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={loadingHistory}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                <MdHistory className="h-5 w-5" />

                {loadingHistory ? "Loading..." : "Load History"}
              </button>
            </div>
          </form>

          {historyError && (
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
              <p className="font-semibold">Historical data unavailable</p>

              <p className="mt-1 break-words">{historyError}</p>

              <p className="mt-2">
                Historical positions can only be shown when the backend history
                endpoint is available and records exist in the database. Check
                the backend response if this request fails.
              </p>
            </div>
          )}

          {loadingHistory ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Querying historical positions...
            </p>
          ) : historyLoaded && filteredHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No historical positions were returned for this date range.
            </p>
          ) : historyLoaded && filteredHistory.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Vessel", "MMSI", "Latitude", "Longitude", "Speed", "Course", "Recorded At", "Source"].map((heading) => (
                      <th key={heading} className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredHistory.map((record, index) => (
                    <tr key={record.id ?? `${record.mmsi}-${record.recorded_at ?? index}`} className="border-b border-white/5">
                      <td className="px-4 py-4 text-sm text-white">{vesselName(record)}</td>

                      <td className="px-4 py-4 text-sm text-gray-300">{record.mmsi ?? "—"}</td>

                      <td className="px-4 py-4 text-sm text-gray-300">{formatCoordinate(record.latitude)}</td>

                      <td className="px-4 py-4 text-sm text-gray-300">{formatCoordinate(record.longitude)}</td>

                      <td className="px-4 py-4 text-sm text-gray-300">{record.speed_knots == null ? "—" : `${record.speed_knots} kn`}</td>

                      <td className="px-4 py-4 text-sm text-gray-300">{record.course_deg == null ? "—" : `${record.course_deg}°`}</td>

                      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-300">{formatDateTime(record.recorded_at || record.timestamp || record.created_at)}</td>

                      <td className="px-4 py-4 text-sm text-gray-300">{record.ais_source || record.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-4 text-xs text-gray-400">
                Showing {filteredHistory.length} recorded position(s).
              </p>
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-black/10 p-4 text-sm text-gray-400">
              Select a date range and choose Load History to query stored AIS positions.
            </p>
          )}
        </section>
      )}

      {activeTab === "movements" && (
        <div className="space-y-5">
          <section className={panelClass}>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-navy-700 dark:text-white">
                  <MdLocationOn className="h-6 w-6 text-brand-500" />

                  Arrivals &amp; Departures
                </h2>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                  Port-call events for the Port of Singapore as reported by the
                  AIS provider, newest first. Arrived-from and destination
                  values are shown only when the provider has them; otherwise
                  they show —. Nothing here is predicted or generated by this
                  page.
                </p>

                {eventsRefreshedAt && (
                  <p className="mt-2 text-xs text-gray-400">
                    Loaded: {formatDateTime(eventsRefreshedAt)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-end gap-3">
                <div>
                  <label
                    htmlFor="events-period"
                    className="mb-2 block text-sm text-gray-300"
                  >
                    Period
                  </label>

                  <select
                    id="events-period"
                    value={eventHours}
                    onChange={(event) =>
                      setEventHours(Number(event.target.value))
                    }
                    className={inputClass}
                  >
                    {EVENT_HOUR_OPTIONS.map((option) => (
                      <option
                        key={option.hours}
                        value={option.hours}
                        className="text-black"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={loadPortEvents}
                  disabled={loadingEvents}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-navy-700 hover:bg-gray-100 dark:text-white dark:hover:bg-navy-700 disabled:opacity-60"
                >
                  <MdRefresh
                    className={`h-5 w-5 ${loadingEvents ? "animate-spin" : ""}`}
                  />

                  {loadingEvents ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>

            {eventsError && (
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
                <p className="font-semibold">
                  Arrival and departure data unavailable
                </p>

                <p className="mt-1 break-words">{eventsError}</p>

                <p className="mt-2">
                  This data comes from the backend port-events endpoint. The
                  tables stay empty rather than showing invented movements.
                </p>
              </div>
            )}

            {eventsLoaded && eventsMeta && (
              <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-200">
                <p>
                  {eventsMeta.oldest && eventsMeta.newest
                    ? `Events shown cover ${formatDateTime(
                        eventsMeta.oldest
                      )} to ${formatDateTime(eventsMeta.newest)}.`
                    : "The provider reported no arrivals or departures for this period."}
                </p>

                {eventsMeta.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-300">
                    {eventsMeta.warnings.map((warning) => (
                      <li key={warning} className="break-words">
                        {warning}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {loadingEvents && !eventsLoaded ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Loading arrivals and departures...
            </p>
          ) : eventsLoaded ? (
            <>
              <MovementTable
                title="Arrivals — Arrived From"
                description="Vessels that arrived at a port, with the port they came from when the provider reports it."
                emptyText="No arrivals were reported for this period."
                atLabel="Arrived At"
                otherLabel="Arrived From"
                otherKey="from_port"
                rows={sortedArrivals}
              />

              <MovementTable
                title="Departures — Declared Destination"
                description="Vessels that departed a port, with the destination each vessel declares over AIS. This is entered by the crew, so it can be a short code, free text or out of date."
                emptyText="No departures were reported for this period."
                atLabel="Departed From"
                otherLabel="Declared Destination"
                otherKey="to_port"
                rows={sortedDepartures}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default VesselManagement;
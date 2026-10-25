import React from "react";

import {
  MdAnchor,
  MdDirectionsBoat,
  MdCheckCircle,
  MdEventAvailable,
  MdRefresh,
  MdSearch,
  MdNavigation,
  MdMap,
  MdLocationOn,
  MdSpeed,
} from "react-icons/md";

import "flag-icons/css/flag-icons.min.css";

import { apiGet } from "services/api";

import { getVesselFlag } from "../Vessels/vesselFlags";

import {
  BERTH_POOL,
  berthLabel,
  assignBerths,
  listAvailableBerths,
} from "./berthNumbers";

// =========================================================
// SETTINGS
// =========================================================

// The ship list is re-read quietly this often while the tab is visible.
const AUTO_REFRESH_MS = 60 * 1000;

// Same rule as the Vessels page and the Live Port Map: a saved position
// older than this is shown in amber.
const STALE_POSITION_MINUTES = 120;

// Rows shown in each table before "Show all".
const SHIP_ROWS_SHOWN = 15;

// The number of berths (B-01 ... B-120) is set in ./berthNumbers.js. The
// same file gives the berth numbers to the Port Dashboard, so both pages
// always agree.

// Available berth numbers shown before "Show all".
const FREE_BERTHS_SHOWN = 36;

const PORT_TIME_ZONE = "Asia/Singapore";

// =========================================================
// SHIPS
//
// Ships are read from GET /vessels: the same list Vessel Management
// shows and the Live Port Map draws. This page never contacts
// VesselAPI, so opening or refreshing it uses no quota.
// =========================================================

// Same wording rule as statusFor() on the Vessels page and the
// Port Dashboard: "berth" = moored / at a berth, "anchor" = at anchor,
// "underway" = under way (on the way, moving).
// Everything else (expected, unknown...) is not shown here.
const portStateOf = (vessel) => {
  const text = String(
    vessel?.status || vessel?.ais_navigation_status || ""
  ).toLowerCase();

  if (text.includes("berth") || text.includes("moored")) return "berth";

  if (text.includes("anchor")) return "anchor";

  if (text.includes("underway") || text.includes("under way")) {
    return "underway";
  }

  return "other";
};

const minutesSince = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
};

const formatAge = (minutes) => {
  if (minutes === null || minutes === undefined) return "time unknown";

  if (minutes < 1) return "just now";

  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 48) return `${hours} h ago`;

  return `${Math.floor(hours / 24)} d ago`;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const isValidPosition = (latitude, longitude) =>
  latitude !== null &&
  longitude !== null &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const mapVessel = (vessel) => {
  const mmsi =
    vessel?.mmsi === null || vessel?.mmsi === undefined
      ? ""
      : String(vessel.mmsi);

  const rawType = String(vessel?.vessel_type ?? "").trim();

  const latitude = toNumber(vessel?.latitude);

  const longitude = toNumber(vessel?.longitude);

  return {
    key: vessel?.id ?? (mmsi || `${vessel?.vessel_name}-${Math.random()}`),

    id: vessel?.id ?? null,

    mmsi,

    name:
      vessel?.vessel_name ||
      vessel?.ship_name ||
      vessel?.name ||
      (mmsi ? `Vessel ${mmsi}` : "Unnamed vessel"),

    // "Unknown" is not information, so it is not shown.
    type: rawType.toLowerCase() === "unknown" ? "" : rawType,

    state: portStateOf(vessel),

    latitude,

    longitude,

    hasPosition: isValidPosition(latitude, longitude),

    imo: vessel?.imo_number ?? null,

    flag: vessel?.flag ?? "",

    speed: toNumber(vessel?.speed_knots),

    course: toNumber(vessel?.course_deg),

    updatedAt: vessel?.ais_last_updated_at ?? null,

    ageMinutes: minutesSince(vessel?.ais_last_updated_at),
  };
};

// =========================================================
// GENERATED BERTH NUMBERS
//
// There is no berth database behind this page, so each ship at berth
// is given a berth number made from its MMSI (see ./berthNumbers.js).
// The same ship gets the same number every time, and two ships never
// share a number. A berth number is vacant when no ship at berth has it.
// =========================================================

// =========================================================
// FORMATTERS
// =========================================================

// Turns a raw error into a sentence a port officer can act on, and
// keeps the original text at the end so nothing is hidden.
const describeError = (message, subject) => {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  let help = "";

  if (!text || /failed to fetch|networkerror|network request|load failed/.test(lower)) {
    help = "Cannot reach the backend. Check that it is running, then try again.";
  } else if (/not authenticated|could not validate|invalid token|expired|unauthori|\b401\b/.test(lower)) {
    help = "Your login has expired. Please sign in again.";
  } else if (/forbidden|permission|not allowed|\b403\b/.test(lower)) {
    help = `Your account does not have access to ${subject}.`;
  } else if (/internal server error|\b500\b/.test(lower)) {
    help = `The backend failed while reading ${subject}. Check the backend window for the error, restart the backend and try again.`;
  } else if (/not found|\b404\b/.test(lower)) {
    help = `The backend has no route for ${subject}. Update the backend and restart it.`;
  }

  if (!help) return text || `Unable to load ${subject}.`;

  return text ? `${help} (Details: ${text})` : help;
};

const formatCoordinate = (value) =>
  value === null || value === undefined ? "—" : Number(value).toFixed(5);

const formatNumber = (value, decimals) =>
  value === null || value === undefined ? "—" : Number(value).toFixed(decimals);

// "17 Oct 2026, 13:41 SGT", the same format as Vessel Management.
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

const formatClock = (date) =>
  `${date.toLocaleTimeString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} SGT`;

// Flag of the country that issued the ship's MMSI, as on the Vessels page.
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

// Same colours as the status badges on the Vessels page, with a small
// dot so the badge reads as a status at a glance.
const STATUS_BADGE = {
  berth: {
    label: "At Berth",
    className: "bg-green-500/10 text-green-400",
    dotClassName: "bg-green-400",
  },
  anchor: {
    label: "Anchorage",
    className: "bg-orange-500/10 text-orange-400",
    dotClassName: "bg-orange-400",
  },
  underway: {
    label: "Underway",
    className: "bg-cyan-500/10 text-cyan-400",
    dotClassName: "bg-cyan-400",
  },
};

// =========================================================
// ONE TABLE OF SHIPS
// Used three times: ships at berth, ships at anchorage and ships
// underway, so the groups are never mixed.
// =========================================================

const ShipTable = ({
  title,
  description,
  note,
  icon,
  iconClass,
  ships,
  totalCount,
  loaded,
  emptyText,
  withBerth,
  expanded,
  onToggle,
}) => {
  const visibleShips = expanded ? ships : ships.slice(0, SHIP_ROWS_SHOWN);

  const headings = [
    "Vessel",
    "MMSI",
    "IMO",
    "Flag",
    "Position",
    "Speed / Course",
    ...(withBerth ? ["Berth"] : []),
    "Status",
    "Last AIS Update",
  ];

  return (
    <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-700 dark:text-white">
            {title}
          </h2>

          <p className="mt-1 text-sm text-gray-400">
            {loaded ? description : "Loading ships..."}
          </p>

          {note && loaded && (
            <p className="mt-1 text-xs text-gray-500">{note}</p>
          )}
        </div>

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          {icon}
        </div>
      </div>

      {!loaded ? (
        <div className="mt-5 flex items-center gap-3 text-sm text-gray-400">
          <MdRefresh className="h-5 w-5 animate-spin text-brand-500" />
          Loading ships...
        </div>
      ) : ships.length === 0 ? (
        <div className="mt-5 rounded-xl bg-lightPrimary p-5 text-sm text-gray-500 dark:bg-navy-900 dark:text-gray-300">
          {emptyText}
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  {headings.map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleShips.map((ship) => {
                  const stale =
                    ship.ageMinutes !== null &&
                    ship.ageMinutes > STALE_POSITION_MINUTES;

                  const badge = STATUS_BADGE[ship.state];

                  return (
                    <tr
                      key={ship.key}
                      className="border-b border-gray-100 last:border-0 dark:border-white/5"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <MdDirectionsBoat className="h-6 w-6 shrink-0 text-brand-500" />

                          <div>
                            <p className="font-semibold text-navy-700 dark:text-white">
                              {ship.name}
                            </p>

                            <p className="text-xs text-gray-500">
                              ID: {ship.id ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {ship.mmsi || "—"}
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {ship.imo ?? "—"}
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {ship.type && <p>{ship.type}</p>}

                        <div
                          className={`flex items-center ${
                            ship.type ? "mt-1" : ""
                          }`}
                        >
                          <VesselFlag mmsi={ship.mmsi} fallback={ship.flag} />
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {ship.hasPosition ? (
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <MdLocationOn className="text-brand-500" />

                            {formatCoordinate(ship.latitude)},{" "}
                            {formatCoordinate(ship.longitude)}
                          </span>
                        ) : (
                          "No position"
                        )}
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <MdSpeed />

                          {ship.speed === null
                            ? "—"
                            : `${formatNumber(ship.speed, 1)} kn`}
                        </span>

                        <p className="text-xs text-gray-500">
                          Course{" "}
                          {ship.course === null
                            ? "—"
                            : `${formatNumber(ship.course, 0)}°`}
                        </p>
                      </td>

                      {withBerth && (
                        <td className="px-4 py-4 text-sm">
                          <span className="inline-block whitespace-nowrap rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-500 dark:text-white">
                            {ship.berthLabel}
                          </span>
                        </td>
                      )}

                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${badge.className}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${badge.dotClassName}`}
                          />

                          {badge.label}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <p className="whitespace-nowrap">
                          {formatDateTime(ship.updatedAt)}
                        </p>

                        {ship.updatedAt && (
                          <p
                            className={`text-xs ${
                              stale ? "text-orange-400" : "text-gray-500"
                            }`}
                          >
                            {formatAge(ship.ageMinutes)}
                            {stale ? " • stale position" : ""}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-gray-400">
              Showing {visibleShips.length} of {ships.length} ship
              {ships.length === 1 ? "" : "s"}
              {ships.length !== totalCount
                ? ` (filtered from ${totalCount})`
                : ""}
            </p>

            {ships.length > SHIP_ROWS_SHOWN && (
              <button
                type="button"
                onClick={onToggle}
                className="text-sm font-bold text-brand-500 hover:underline"
              >
                {expanded ? "Show fewer" : `Show all ${ships.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// =========================================================
// AVAILABLE BERTHS
// The vacant berths: the berth numbers that no ship at berth is using
// right now. Shown as the fourth section, below the three ship tables.
// =========================================================

const AvailableBerths = ({
  berths,
  shipCount,
  loaded,
  failed,
  expanded,
  onToggle,
}) => {
  const visibleBerths = expanded ? berths : berths.slice(0, FREE_BERTHS_SHOWN);

  const inUse = BERTH_POOL - berths.length;

  return (
    <div
      className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800"
      data-testid="available-berths"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-700 dark:text-white">
            Available Berths
          </h2>

          <p className="mt-1 text-sm text-gray-400">
            {!loaded
              ? "Loading berths..."
              : failed
              ? "Not known until the ship list loads"
              : `${berths.length} of ${BERTH_POOL} berths are vacant, ${inUse} ${
                  inUse === 1 ? "is" : "are"
                } in use`}
          </p>

          {loaded && !failed && (
            <p className="mt-1 text-xs text-gray-500">
              Berth numbers {berthLabel(0)} to {berthLabel(BERTH_POOL - 1)}. A
              berth is vacant when no ship at berth has its number. The numbers
              and the total of {BERTH_POOL} are generated automatically, they
              are not read from a berth database.
            </p>
          )}
        </div>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">
          <MdEventAvailable className="h-6 w-6" />
        </div>
      </div>

      {!loaded ? (
        <div className="mt-5 flex items-center gap-3 text-sm text-gray-400">
          <MdRefresh className="h-5 w-5 animate-spin text-brand-500" />
          Loading berths...
        </div>
      ) : failed ? (
        <div className="mt-5 rounded-xl bg-lightPrimary p-5 text-sm text-gray-500 dark:bg-navy-900 dark:text-gray-300">
          The ship list could not be loaded, so the vacant berths cannot be
          worked out. See the message above.
        </div>
      ) : berths.length === 0 ? (
        <div className="mt-5 rounded-xl bg-lightPrimary p-5 text-sm text-gray-500 dark:bg-navy-900 dark:text-gray-300">
          No berth is vacant right now. All {BERTH_POOL} berths are in use.
          {shipCount > BERTH_POOL
            ? ` ${shipCount} ships are at berth, more than the ${BERTH_POOL} berth numbers.`
            : ""}
        </div>
      ) : (
        <>
          <ul
            aria-label="Vacant berths"
            className="mt-5 flex flex-wrap gap-2"
          >
            {visibleBerths.map((berth) => (
              <li
                key={berth.slot}
                data-testid="available-berth"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-bold text-green-600 dark:text-green-400"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />

                {berth.label}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-gray-400">
              Showing {visibleBerths.length} of {berths.length} vacant berth
              {berths.length === 1 ? "" : "s"}
            </p>

            {berths.length > FREE_BERTHS_SHOWN && (
              <button
                type="button"
                onClick={onToggle}
                className="text-sm font-bold text-brand-500 hover:underline"
              >
                {expanded ? "Show fewer" : `Show all ${berths.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// =========================================================
// BERTH MANAGEMENT
// =========================================================

const Berths = () => {
  // =======================================================
  // STATE
  // =======================================================

  const [vessels, setVessels] = React.useState([]);

  const [loaded, setLoaded] = React.useState(false);

  const [refreshing, setRefreshing] = React.useState(false);

  const [error, setError] = React.useState("");

  const [lastChecked, setLastChecked] = React.useState(null);

  const [showAllBerthShips, setShowAllBerthShips] = React.useState(false);

  const [showAllAnchorShips, setShowAllAnchorShips] = React.useState(false);

  const [showAllUnderwayShips, setShowAllUnderwayShips] = React.useState(false);

  const [showAllFreeBerths, setShowAllFreeBerths] = React.useState(false);

  const [search, setSearch] = React.useState("");

  // =======================================================
  // FETCH SHIPS (Vessel Management / Live Port Map list)
  // =======================================================

  const fetchVessels = React.useCallback(async ({ manual = false } = {}) => {
    try {
      if (manual) setRefreshing(true);

      const data = await apiGet("/vessels");

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setVessels(list.map(mapVessel));

      setError("");

      setLastChecked(new Date());
    } catch (fetchError) {
      console.error("Unable to fetch vessels:", fetchError);

      setError(describeError(fetchError?.message, "the vessel list"));
    } finally {
      setLoaded(true);

      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchVessels();
      }
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [fetchVessels]);

  // =======================================================
  // DERIVED DATA
  // Only ships at berth, at anchorage or underway are kept. Every other
  // status (expected, unknown...) is left out.
  // =======================================================

  const mooredShips = vessels.filter((ship) => ship.state === "berth");

  const anchoredShips = vessels.filter((ship) => ship.state === "anchor");

  const underwayShips = vessels.filter((ship) => ship.state === "underway");

  const berthNumbers = assignBerths(mooredShips);

  const shipsAtBerth = mooredShips
    .map((ship) => ({
      ...ship,
      berthLabel: berthNumbers.get(ship.key).label,
      berthSlot: berthNumbers.get(ship.key).slot,
    }))
    .sort((a, b) => a.berthSlot - b.berthSlot);

  const shipsAtAnchor = [...anchoredShips].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const shipsUnderway = [...underwayShips].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const availableBerths = listAvailableBerths(
    shipsAtBerth.map((ship) => ship.berthSlot)
  );

  const searchText = search.trim().toLowerCase();

  const matchesSearch = (ship) =>
    !searchText ||
    [ship.name, ship.mmsi, ship.imo, ship.type, ship.berthLabel].some(
      (value) => String(value ?? "").toLowerCase().includes(searchText)
    );

  const shownBerthShips = shipsAtBerth.filter(matchesSearch);

  const shownAnchorShips = shipsAtAnchor.filter(matchesSearch);

  const shownUnderwayShips = shipsUnderway.filter(matchesSearch);

  const hasData = vessels.length > 0;

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="mt-3">
      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdAnchor className="h-8 w-8" />
          </div>

          <div>
            <p className="text-sm text-navy-700 dark:text-white">
              Ships at berth, at anchorage and underway in the Port of
              Singapore, taken from Vessel Management, and the vacant berths.
            </p>

            <a
              href="/admin/port-map"
              className="mt-1 flex w-fit items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
            >
              <MdMap className="h-4 w-4" />

              Open Live Port Map
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-gray-400">
              Checked {formatClock(lastChecked)}
            </span>
          )}

          <button
            type="button"
            onClick={() => fetchVessels({ manual: true })}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MdRefresh
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />

            Refresh
          </button>
        </div>
      </div>

      {/* =====================================================
          MESSAGES
          ===================================================== */}

      {error && (
        <div className="mb-6 rounded-[20px] border border-red-200 bg-red-50 p-5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <span className="break-words">
              {error}
              {hasData ? " The ships below are from the last successful check." : ""}
            </span>

            <button
              type="button"
              onClick={() => fetchVessels({ manual: true })}
              className="font-bold underline"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Ships at Berth</p>

              <h2 className="mt-2 text-3xl font-bold text-green-500">
                {loaded ? shipsAtBerth.length : "—"}
              </h2>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">
              <MdCheckCircle className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">
                Ships at Anchorage
              </p>

              <h2 className="mt-2 text-3xl font-bold text-orange-500">
                {loaded ? shipsAtAnchor.length : "—"}
              </h2>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/10">
              <MdAnchor className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">
                Ships Underway
              </p>

              <h2
                data-testid="underway-count"
                className="mt-2 text-3xl font-bold text-cyan-500"
              >
                {loaded ? shipsUnderway.length : "—"}
              </h2>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-500 dark:bg-cyan-500/10">
              <MdNavigation className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">
                Available Berths
              </p>

              <h2
                data-testid="available-count"
                className="mt-2 text-3xl font-bold text-green-500"
              >
                {loaded && !(error && !hasData) ? availableBerths.length : "—"}
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Out of {BERTH_POOL} berths
              </p>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 dark:bg-green-500/10">
              <MdEventAvailable className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          SEARCH
          ===================================================== */}

      <div className="relative mt-5">
        <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search ships by name, MMSI, IMO or berth"
          aria-label="Search ships"
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-3 text-sm text-navy-700 outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
        />
      </div>

      {/* =====================================================
          SHIPS AT BERTH, SHIPS AT ANCHORAGE, SHIPS UNDERWAY,
          VACANT BERTHS
          ===================================================== */}

      <div className="mt-5 space-y-5">
        <ShipTable
          title="Ships at Berth"
          description={`${shipsAtBerth.length} ship${
            shipsAtBerth.length === 1 ? "" : "s"
          } at berth`}
          note="Berth numbers are generated automatically from each ship's MMSI. They are not read from a berth database."
          icon={<MdDirectionsBoat className="h-6 w-6" />}
          iconClass="bg-green-50 text-green-500 dark:bg-green-500/10"
          ships={shownBerthShips}
          totalCount={shipsAtBerth.length}
          loaded={loaded}
          emptyText={
            error && !hasData
              ? "The ship list could not be loaded. See the message above."
              : searchText && shipsAtBerth.length > 0
              ? "No ship at berth matches the search."
              : "No ship is at berth right now. A ship appears here when its saved AIS status is Moored."
          }
          withBerth
          expanded={showAllBerthShips}
          onToggle={() => setShowAllBerthShips((value) => !value)}
        />

        <ShipTable
          title="Ships at Anchorage"
          description={`${shipsAtAnchor.length} ship${
            shipsAtAnchor.length === 1 ? "" : "s"
          } at anchorage, waiting for a berth`}
          icon={<MdAnchor className="h-6 w-6" />}
          iconClass="bg-orange-50 text-orange-500 dark:bg-orange-500/10"
          ships={shownAnchorShips}
          totalCount={shipsAtAnchor.length}
          loaded={loaded}
          emptyText={
            error && !hasData
              ? "The ship list could not be loaded. See the message above."
              : searchText && shipsAtAnchor.length > 0
              ? "No ship at anchorage matches the search."
              : "No ship is at anchorage right now. A ship appears here when its saved AIS status is At anchor."
          }
          expanded={showAllAnchorShips}
          onToggle={() => setShowAllAnchorShips((value) => !value)}
        />

        <ShipTable
          title="Ships Underway"
          description={`${shipsUnderway.length} ship${
            shipsUnderway.length === 1 ? "" : "s"
          } underway, on the way and not at berth or anchorage`}
          icon={<MdNavigation className="h-6 w-6" />}
          iconClass="bg-cyan-50 text-cyan-500 dark:bg-cyan-500/10"
          ships={shownUnderwayShips}
          totalCount={shipsUnderway.length}
          loaded={loaded}
          emptyText={
            error && !hasData
              ? "The ship list could not be loaded. See the message above."
              : searchText && shipsUnderway.length > 0
              ? "No ship underway matches the search."
              : "No ship is underway right now. A ship appears here when its saved AIS status is Under way."
          }
          expanded={showAllUnderwayShips}
          onToggle={() => setShowAllUnderwayShips((value) => !value)}
        />

        <AvailableBerths
          berths={availableBerths}
          shipCount={shipsAtBerth.length}
          loaded={loaded}
          failed={!!error && !hasData}
          expanded={showAllFreeBerths}
          onToggle={() => setShowAllFreeBerths((value) => !value)}
        />
      </div>
    </div>
  );
};

export default Berths;
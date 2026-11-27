import React from "react";

import { createPortal } from "react-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  ZoomControl,
  useMap,
  useMapEvents,
  Tooltip,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { apiGet, apiPost } from "services/api";

import authService from "layouts/auth/authService";

import { hasModuleAccess } from "layouts/auth/permissions";

/*
=========================================================
PORT OF SINGAPORE SMART SEA PORT MANAGEMENT & MONITORING SYSTEM
=========================================================

PORT MAP

Data flow:

VesselAPI
    ↓
FastAPI AIS service (saves positions)
    ↓
PostgreSQL vessels table
    ↓
GET /vessels            GET /berths            GET /incidents
    ↓                       ↓                       ↓
                  React / Leaflet

The frontend NEVER calls VesselAPI. This page only reads the
database, so opening it or refreshing it uses no VesselAPI quota.
Positions are as fresh as the last AIS sync (Vessel Management).

Ships shown: only vessels that are moored / at a berth, or at
anchor. Ships at anchor carry an anchor symbol, ships at a berth
carry a ship symbol. Ship markers are NOT draggable.

A position older than STALE_POSITION_MINUTES is drawn faded and
counted as "older".

Berths: read from GET /berths (Berth Management). A berth is drawn
only if it has coordinates.

Full size: the button under Default / Satellite makes the map as wide
as the page and moves the "Ships in port" list below it.

Operational circle: drag the round handle on its edge (or use the
slider in the Port panel) to resize it.

INCIDENTS (all types)
Every OPEN incident (not Resolved / Closed) from GET /incidents is
shown, whichever page it was reported from (Live Port Map or
Incident Management). Each type has its own icon and the ring colour
shows the severity:

  Vessel Incident          ship
  Equipment Failure        wrench
  Gate/Security Incident   shield
  Environmental Incident   droplet
  Fire/Safety              flame
  Injury / Medical         cross
  Cargo Damage             box
  Other                    info mark

Where an incident is drawn (first match wins):
  1. Its own map spot (latitude / longitude saved with the incident:
     reported by right-click on this map, or "Pick spot on map" in
     Incident Management). Same for every account.
  2. Its location text names a berth ("Berth 6", "Berth 05", "B-06")
     and exactly one berth with that number has coordinates in
     GET /berths. The incident is drawn at that berth.
  3. Its location text names a gate ("Gate-02") and a gate marker
     with that number exists (the gate markers of this map).
  4. A spot placed by hand with "Place on map" for that same
     location text. Saved in THIS browser only.
Incidents that match none of these are listed under "Not placed on
map" in the Incidents panel. Nothing is invented: they are never
drawn at a made-up spot.

Several incidents at one spot are spread a little around it so none
hides another.

An account with the Incident Management permission can right-click
the map to report an incident at that spot (POST /incidents with
latitude / longitude). The backend then tells the accounts that must
know (by incident type, see incident_service.py).

Gate / truck markers (Operations panel) are placed by hand: drag to
move, double-click to add another one next to it, right-click an added
one to remove it. Positions are saved in this browser only
(localStorage); they are not survey data.

=========================================================
*/

/* =========================================================
   PORT OF SINGAPORE MAP CENTER
   ========================================================= */

const SINGAPORE_PORT = [1.265, 103.8];
const DEFAULT_ZOOM = 14.8;
const DEFAULT_RADIUS = 650;
const MIN_RADIUS = 100;
const MAX_RADIUS = 10000;

/* Same earth radius Leaflet uses for circles and distances. */
const EARTH_RADIUS_M = 6371000;

const clampRadius = (value) =>
  Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(value)));

/* The resize handle sits on the circle edge. Its place is worked out
   from two numbers only: the radius and the angle (radians,
   counter-clockwise from east). Nothing else moves it, so it cannot
   jump while it is being dragged. */
const pointFromCentre = (distance, angle) => {
  const latitude = SINGAPORE_PORT[0];
  const latitudeOffset = (distance * Math.sin(angle)) / EARTH_RADIUS_M;
  const longitudeOffset =
    (distance * Math.cos(angle)) /
    (EARTH_RADIUS_M * Math.cos((latitude * Math.PI) / 180));

  return [
    latitude + (latitudeOffset * 180) / Math.PI,
    SINGAPORE_PORT[1] + (longitudeOffset * 180) / Math.PI,
  ];
};

const angleFromCentre = (point) => {
  const latitude = SINGAPORE_PORT[0];
  const north =
    (((point.lat - latitude) * Math.PI) / 180) * EARTH_RADIUS_M;
  const east =
    (((point.lng - SINGAPORE_PORT[1]) * Math.PI) / 180) *
    EARTH_RADIUS_M *
    Math.cos((latitude * Math.PI) / 180);

  return Math.atan2(north, east);
};

const formatRadius = (metres) =>
  metres >= 1000 ? `${Math.round(metres / 10) / 100} km` : `${metres} m`;

const PORT_TIME_ZONE = "Asia/Singapore";

/* =========================================================
   DATA REFRESH

   Each refresh reads the database (GET /vessels, GET /berths,
   GET /incidents). It does not contact VesselAPI.
   ========================================================= */

const DATA_REFRESH_INTERVAL = 30000;

/* =========================================================
   FAST START (weak networks)

   The ships of the last successful load are kept in this
   browser. They are real records from the database (nothing is
   made up), so the next visit draws them at once while the
   latest positions are loading; then they are replaced. Older
   positions are drawn faded as usual. Kept for 24 hours.
   ========================================================= */

const SHIP_CACHE_KEY = "singaporePortMapShips";

const SHIP_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const readShipCache = () => {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(SHIP_CACHE_KEY) || "null"
    );

    if (
      !saved ||
      !Array.isArray(saved.records) ||
      !Number.isFinite(saved.savedAt) ||
      Date.now() - saved.savedAt > SHIP_CACHE_MAX_AGE_MS
    ) {
      return null;
    }

    return saved.records;
  } catch {
    return null;
  }
};

const saveShipCache = (records) => {
  try {
    window.localStorage.setItem(
      SHIP_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), records })
    );
  } catch {
    /* Storage full or blocked: the map works without it. */
  }
};

/* Map pictures (tiles) for the Default map.

   Esri World Street Map is used. It needs no key, it is the same
   provider (arcgisonline.com) as the Satellite map, so it is
   already reachable on this network, and it is fast.

   Note: Esri tile addresses are {z}/{y}/{x} (y before x), and
   there are no subdomains. The highest zoom with pictures is 19. */
const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

const DEFAULT_TILE_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, and the GIS User Community";

const DEFAULT_TILE_MAX_ZOOM = 19;

/* A saved position older than this is drawn faded and counted as
   "older". Same rule as the Vessels page. Display only. */
const STALE_POSITION_MINUTES = 120;

/* The ship list shows at most this many rows; search narrows it. */
const LIST_LIMIT = 150;

/* =========================================================
   SHIP STATES

   "berth"  = moored / at a berth
   "anchor" = at anchor
   ========================================================= */

const PORT_STATE_LABELS = {
  berth: "At berth",
  anchor: "At anchor",
};

const PORT_STATE_COLORS = {
  berth: "#22c55e",
  anchor: "#f97316",
};

/* Same wording rule as statusFor() on the Vessels page. */
const portStateOf = (vessel) => {
  const text = String(
    vessel.status || vessel.ais_navigation_status || ""
  ).toLowerCase();

  if (text.includes("berth") || text.includes("moored")) {
    return "berth";
  }

  if (text.includes("anchor")) {
    return "anchor";
  }

  return null;
};

/* =========================================================
   CUSTOM MAP ICONS
   ========================================================= */

const createIcon = (
  backgroundColor,
  content,
  contentType = "text",
  size = 42
) => {
  return L.divIcon({
    className: "port-map-marker",

    html: `
      <div
        style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${backgroundColor};
          border: 3px solid white;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: ${contentType === "text" ? "18px" : "20px"};
          font-weight: 700;
          line-height: 1;
        "
      >
        ${content}
      </div>
    `,

    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2)],
  });
};

/* Berths are rounded squares with the letter B, so they are never
   mistaken for the round ship symbols. */
const createBerthIcon = (backgroundColor, size) => {
  return L.divIcon({
    className: "port-map-marker",

    html: `
      <div
        style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 8px;
          background: ${backgroundColor};
          border: 2px solid white;
          box-shadow: 0 3px 10px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: ${Math.round(size * 0.5)}px;
          font-weight: 700;
          line-height: 1;
        "
      >
        B
      </div>
    `,

    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2)],
  });
};

/* =========================================================
   MAP ICONS
   ========================================================= */

const BERTH_ICONS = {
  small: {
    occupied: createBerthIcon("#ef4444", 24),
    available: createBerthIcon("#22c55e", 24),
    maintenance: createBerthIcon("#f97316", 24),
  },
  large: {
    occupied: createBerthIcon("#ef4444", 34),
    available: createBerthIcon("#22c55e", 34),
    maintenance: createBerthIcon("#f97316", 34),
  },
};

/* Ship symbols, drawn as SVG so they look the same on every
   computer: an anchor for ships at anchor, a ship for ships at a
   berth (arrived). */
const ANCHOR_PATH =
  "M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z";

const SHIP_PATH = "M3 15h18l-2.5 5h-13zM7 9.5h10V14H7zM10.5 4h3v5h-3z";

const SYMBOL_PATHS = { anchor: ANCHOR_PATH, berth: SHIP_PATH };

/* Icons of the full size button. */
const EXPAND_PATH =
  "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z";

const COMPRESS_PATH =
  "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z";

const shipIconCache = {};

/* A round badge in the ship's colour with the symbol inside. Below
   16 px there is no room for a symbol, so it stays a plain dot. */
const getShipIcon = (portState, size, selected) => {
  const key = `${portState}-${size}-${selected ? 1 : 0}`;

  if (!shipIconCache[key]) {
    const symbolSize = Math.round(size * 0.7);

    const symbol =
      size >= 16
        ? `<svg viewBox="0 0 24 24" width="${symbolSize}" height="${symbolSize}" fill="#ffffff"><path d="${SYMBOL_PATHS[portState]}"/></svg>`
        : "";

    shipIconCache[key] = L.divIcon({
      className: "port-map-marker",

      html: `
        <div
          style="
            width: ${size}px;
            height: ${size}px;
            box-sizing: border-box;
            border-radius: 50%;
            background: ${PORT_STATE_COLORS[portState]};
            border: ${selected ? 3 : 2}px solid ${
        selected ? "#facc15" : "#ffffff"
      };
            box-shadow: 0 2px 6px rgba(0,0,0,0.45);
            display: flex;
            align-items: center;
            justify-content: center;
          "
        >
          ${symbol}
        </div>
      `,

      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      tooltipAnchor: [0, -(size / 2)],
    });
  }

  return shipIconCache[key];
};

const gateIcon = createIcon("#7c3aed", "🚚", "emoji", 42);

/* =========================================================
   GATE / TRUCK MARKERS (starting positions, not survey data)
   ========================================================= */

const gates = [
  {
    id: "G01",
    name: "Main Port Gate",
    position: [1.2681, 103.7988],
  },
  {
    id: "G02",
    name: "Cargo Gate",
    position: [1.2672, 103.8012],
  },
];

/* =========================================================
   INCIDENTS ON THE MAP
   The same lists as the backend (app/services/incident_service.py).
   ========================================================= */

const INCIDENT_TYPES = [
  "Vessel Incident",
  "Equipment Failure",
  "Gate/Security Incident",
  "Environmental Incident",
  "Fire/Safety",
  "Injury / Medical",
  "Cargo Damage",
  "Other",
];

const INCIDENT_SEVERITIES = ["Critical", "High", "Medium", "Low"];

const FINISHED_INCIDENT_STATUSES = ["Resolved", "Closed"];

const MAX_INCIDENT_LOCATION = 120;
const MAX_INCIDENT_VESSEL = 120;
const MAX_INCIDENT_TEXT = 4000;

/* One symbol per incident type (24 x 24 drawing, filled white on
   the map). */
const INCIDENT_TYPE_STYLES = {
  "Vessel Incident": {
    label: "Ship",
    path: SHIP_PATH,
  },
  "Equipment Failure": {
    label: "Wrench",
    path: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
  },
  "Gate/Security Incident": {
    label: "Shield",
    path: "M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z",
  },
  "Environmental Incident": {
    label: "Droplet",
    path: "M12 2.5c-3.5 4.4-6 7.6-6 10.7a6 6 0 0012 0c0-3.1-2.5-6.3-6-10.7z",
  },
  "Fire/Safety": {
    label: "Flame",
    path: "M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14.37c.38 5.6 5.11 7.32 6.81 7.54 2.43.31 5.06-.14 6.95-1.87 2.08-1.93 2.84-5.01 1.72-7.69z",
  },
  "Injury / Medical": {
    label: "Cross",
    path: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z",
  },
  "Cargo Damage": {
    label: "Box",
    path: "M12 2L3 6.5v11L12 22l9-4.5v-11L12 2zm0 2.2l5.9 2.95L12 10 6.1 7.15 12 4.2zM5 8.7l6 3v7.1l-6-3V8.7zm14 7.1l-6 3v-7.1l6-3v7.1z",
  },
  Other: {
    label: "Info",
    path: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
  },
};

/* The ring around an incident icon shows how serious it is. */
const SEVERITY_COLORS = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#22c55e",
};

const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const NEUTRAL_RING = "#9ca3af";

const incidentIconCache = {};

const getIncidentIcon = (type, severity) => {
  const key = `${type}|${severity}`;

  if (!incidentIconCache[key]) {
    const style = INCIDENT_TYPE_STYLES[type] || INCIDENT_TYPE_STYLES.Other;
    const ring = SEVERITY_COLORS[severity] || SEVERITY_COLORS.Medium;
    const size = severity === "Critical" ? 44 : 38;
    const symbolSize = Math.round(size * 0.52);

    incidentIconCache[key] = L.divIcon({
      className: "port-map-marker",

      html: `
        <div
          style="
            width: ${size}px;
            height: ${size}px;
            box-sizing: border-box;
            border-radius: 50%;
            background: #111827;
            border: 4px solid ${ring};
            box-shadow: 0 0 0 2px #ffffff, 0 4px 12px rgba(0,0,0,0.55);
            display: flex;
            align-items: center;
            justify-content: center;
          "
        >
          <svg viewBox="0 0 24 24" width="${symbolSize}" height="${symbolSize}" fill="#ffffff"><path d="${style.path}"/></svg>
        </div>
      `,

      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      tooltipAnchor: [0, -(size / 2)],
    });
  }

  return incidentIconCache[key];
};

/* The marker of the spot that is being reported (before saving). */
const pendingIncidentIcon = createIcon("#f97316", "?", "text", 36);

const emptyIncidentForm = () => ({
  type: INCIDENT_TYPES[0],
  severity: "Medium",
  location: "",
  vessel: "",
  description: "",
});

/* A spot must be in or near the Port of Singapore (same check as
   the backend). */
const isInsidePortArea = (latitude, longitude) =>
  latitude >= 1.0 &&
  latitude <= 1.6 &&
  longitude >= 103.4 &&
  longitude <= 104.3;

/* =========================================================
   NUMBER HELPERS
   ========================================================= */

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const isValidLatitude = (value) => {
  const latitude = toNumber(value);

  return latitude !== null && latitude >= -90 && latitude <= 90;
};

const isValidLongitude = (value) => {
  const longitude = toNumber(value);

  return longitude !== null && longitude >= -180 && longitude <= 180;
};

const isPoint = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  isValidLatitude(value[0]) &&
  isValidLongitude(value[1]);

/* =========================================================
   SAVED LAYOUT (localStorage, this browser only)

   Every read and write is wrapped in try/catch because
   storage can be unavailable or hold corrupted data.

   v2: the layer list changed, so older saved layouts are
   not reused.
   ========================================================= */

const LAYOUT_STORAGE_KEY = "portOfSingaporeMapLayout.v2";

const readStoredLayout = () => {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Unable to read saved map layout:", error);
    return {};
  }
};

const updateStoredLayout = (partial) => {
  try {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ ...readStoredLayout(), ...partial })
    );
  } catch (error) {
    console.warn("Unable to save map layout:", error);
  }
};

const cloneItems = (items) =>
  items.map((item) => ({ ...item, position: [...item.position] }));

/*
 * Apply saved positions (an {id: [lat, lng]} map) on top of the
 * default items. Missing or invalid entries use the default.
 */
const applySavedPositions = (defaults, savedById) =>
  defaults.map((item) => {
    const savedPoint = savedById ? savedById[item.id] : null;

    return {
      ...item,
      position: isPoint(savedPoint)
        ? [Number(savedPoint[0]), Number(savedPoint[1])]
        : [...item.position],
    };
  });

/* Default items with their saved positions, plus the extra items the
   user added by double-click (saved separately). */
const buildItems = (defaults, savedById, savedExtras, nameKey) => {
  const extras = Array.isArray(savedExtras)
    ? savedExtras
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item[nameKey] === "string" &&
            isPoint(item.position)
        )
        .map((item) => ({
          id: item.id,
          [nameKey]: item[nameKey],
          extra: true,
          position: [Number(item.position[0]), Number(item.position[1])],
        }))
    : [];

  return [...applySavedPositions(defaults, savedById), ...extras];
};

/* A new item a little way from the one that was double-clicked. */
const nearbyPosition = (point) => [point.lat + 0.0006, point.lng + 0.0006];

const newItemId = () => `x-${Date.now().toString(36)}`;

const positionsToMap = (items) =>
  items.reduce((accumulator, item) => {
    accumulator[item.id] = item.position;
    return accumulator;
  }, {});

const booleanOr = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

/* =========================================================
   TIME HELPERS
   ========================================================= */

/* Minutes since a timestamp, or null if it cannot be read. */
const ageInMinutes = (value, nowMs) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((nowMs - date.getTime()) / 60000));
};

const formatAge = (minutes) => {
  if (minutes === null) {
    return "time unknown";
  }

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours} h ago`;
  }

  return `${Math.floor(hours / 24)} d ago`;
};

const formatPortTime = (value) => {
  if (!value) {
    return "Time unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return `${date.toLocaleString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} SGT`;
};

/* The backend may send times without a time zone. Those times are
   UTC, so "Z" is added before reading them. */
const parseServerDate = (value) => {
  if (!value) {
    return null;
  }

  let text = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(text)
  ) {
    text = text.replace(" ", "T") + "Z";
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
};

/* =========================================================
   API HELPERS
   ========================================================= */

/* Never throws: resolves to { ok, value } or { ok, error }. */
const settle = async (action) => {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, error };
  }
};

/* Accepts a bare array or an object that wraps the array. */
const toRecordList = (response) => {
  if (Array.isArray(response)) {
    return response;
  }

  const keys = ["items", "vessels", "berths", "data"];

  for (let index = 0; index < keys.length; index += 1) {
    const candidate = response ? response[keys[index]] : null;

    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
};

/* =========================================================
   AIS VESSEL NORMALIZER
   ========================================================= */

const normalizeAisVessel = (vessel) => {
  if (!vessel) {
    return null;
  }

  /*
   * GET /vessels contains all vessel records.
   *
   * Only records written by an AIS provider are drawn. A vessel
   * entered by hand has no ais_source and must not look like AIS
   * traffic.
   */

  const aisSource =
    typeof vessel.ais_source === "string" ? vessel.ais_source.trim() : "";

  if (!aisSource) {
    return null;
  }

  const latitude = toNumber(vessel.latitude);
  const longitude = toNumber(vessel.longitude);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

  const vesselName = vessel.vessel_name || vessel.name || "Unknown Vessel";
  const imoNumber = vessel.imo_number || vessel.imo || null;
  const mmsi = vessel.mmsi ? String(vessel.mmsi) : null;

  return {
    id: vessel.id ?? mmsi ?? imoNumber ?? `${latitude}-${longitude}`,
    name: vesselName,
    imo: imoNumber,
    mmsi,
    latitude,
    longitude,
    position: [latitude, longitude],
    speed: toNumber(vessel.speed_knots),
    course: toNumber(vessel.course_deg),
    heading: toNumber(vessel.heading_deg),
    status:
      typeof vessel.status === "string"
        ? vessel.status.trim().toLowerCase()
        : "",
    portState: portStateOf(vessel),
    navigationStatus: vessel.ais_navigation_status || null,
    destination: vessel.destination || null,
    aisSource,
    lastUpdated: vessel.ais_last_updated_at || null,
  };
};

/* =========================================================
   BERTH NORMALIZER

   status: "occupied" | "available" | "maintenance"
   ========================================================= */

const BERTH_STATUS_LABELS = {
  occupied: "Occupied",
  available: "Available",
  maintenance: "Under maintenance",
};

const normalizeBerthStatus = (value) => {
  const cleaned =
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
      : "";

  if (cleaned === "occupied") {
    return "occupied";
  }

  if (cleaned === "maintenance" || cleaned === "under_maintenance") {
    return "maintenance";
  }

  return "available";
};

const normalizeBerth = (berth) => {
  if (!berth) {
    return null;
  }

  const latitude = toNumber(berth.latitude);
  const longitude = toNumber(berth.longitude);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

  const code = berth.berth_code ? String(berth.berth_code) : "";

  return {
    id: berth.id ?? (code || `${latitude}-${longitude}`),
    code,
    name: berth.berth_name || code || "Berth",
    terminal: berth.terminal || null,
    position: [latitude, longitude],
    status: normalizeBerthStatus(berth.status),
    occupancySource: berth.occupancy_source || null,
    vesselName: berth.vessel_name || null,
    vesselMmsi: berth.vessel_mmsi ? String(berth.vessel_mmsi) : null,
    vesselDistance: toNumber(berth.vessel_distance_m),
    aisMatching: berth.ais_matching !== false,
  };
};

/* =========================================================
   INCIDENT NORMALIZER

   Every OPEN incident is kept. `position` is its own saved map
   spot, or null when it has none (the page then tries to place it
   by its location text, see incidentPlacement below).
   ========================================================= */

const normalizeMapIncident = (incident) => {
  if (!incident) {
    return null;
  }

  const status = incident.status || "Reported";

  if (FINISHED_INCIDENT_STATUSES.includes(status)) {
    return null;
  }

  const latitude = toNumber(incident.latitude);
  const longitude = toNumber(incident.longitude);

  const hasSpot =
    latitude !== null &&
    longitude !== null &&
    isValidLatitude(latitude) &&
    isValidLongitude(longitude);

  return {
    id: incident.id,
    number: incident.number || `INC-${incident.id}`,
    type: incident.type || "Other",
    severity: incident.severity || "Medium",
    status,
    location: incident.location || "",
    vessel: incident.vessel || "",
    description: incident.description || "",
    reportedBy: incident.reported_by ? incident.reported_by.name : "",
    occurredAt: incident.occurred_at || incident.created_at || null,
    position: hasSpot ? [latitude, longitude] : null,
  };
};

const shortText = (value, length) => {
  const clean = String(value || "").replace(/\s+/g, " ").trim();

  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
};

const readErrorMessage = (error, fallback) => {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error.detail === "string" && error.detail.trim()) {
    return error.detail;
  }

  return fallback;
};

/* =========================================================
   PLACING AN INCIDENT FROM ITS LOCATION TEXT

   "Berth 6", "Berth 05", "B-06" -> berth number
   "Gate-02", "Gate 2"           -> gate number
   ========================================================= */

const berthNumberOf = (text) => {
  const match =
    /\bberth\s*(?:no\.?|number|#)?\s*[-:]?\s*0*(\d{1,3})\b/i.exec(text) ||
    /\bB-?0*(\d{1,3})\b/.exec(text);

  return match ? Number(match[1]) : null;
};

const gateNumberOf = (text) => {
  const match = /\bgate\s*(?:no\.?|#)?\s*[-:]?\s*0*(\d{1,2})\b/i.exec(text);

  return match ? Number(match[1]) : null;
};

/* The same words give the same key: "Berth 6", "berth 06" and
   "Berth-6" are one place. Used for spots placed by hand. */
const locationKey = (incident) => {
  const key = String(incident.location || "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\b0+(\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return key || `incident ${incident.id}`;
};

/* =========================================================
   RIGHT-CLICK ON THE MAP (report an incident here)
   ========================================================= */

const MapRightClick = ({ onPick }) => {
  useMapEvents({
    contextmenu: (event) => {
      onPick([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
};

/* =========================================================
   CLICK ON THE MAP (place a not-yet-placed incident)
   ========================================================= */

const MapPickHandler = ({ active, onPick }) => {
  const map = useMap();

  React.useEffect(() => {
    const container = map.getContainer();

    if (active) {
      container.style.cursor = "crosshair";
    }

    return () => {
      container.style.cursor = "";
    };
  }, [active, map]);

  useMapEvents({
    click: (event) => {
      if (active) {
        onPick([event.latlng.lat, event.latlng.lng]);
      }
    },
  });

  return null;
};

/* The report window is drawn straight in <body>, above the map, with
   the dark colours of the page when dark mode is on. */
const BodyPortal = ({ children }) => {
  if (typeof document === "undefined") {
    return null;
  }

  const dark =
    document.documentElement.classList.contains("dark") ||
    document.body.classList.contains("dark");

  return createPortal(
    <div className={dark ? "dark" : undefined}>{children}</div>,
    document.body
  );
};

/* =========================================================
   MAP RECENTER COMPONENT

   Only moves when the user asks (marker click, list click,
   Reset View) or once when the page first has something to
   show. `target` is a fresh object each time, so repeated
   requests to the same place still work. It does nothing on
   mount, so a saved view is not overwritten.

   target = { coordinates, zoom }
         or { bounds, instant }

   Bounds are fitted with room left for the layer panel and
   the bottom buttons.
   ========================================================= */

const RecenterMap = ({ target }) => {
  const map = useMap();

  React.useEffect(() => {
    if (!target) {
      return;
    }

    if (target.bounds) {
      const size = map.getSize();

      const options = {
        paddingTopLeft: [
          Math.min(230, Math.round(size.x * 0.25)),
          Math.min(50, Math.round(size.y * 0.1)),
        ],
        paddingBottomRight: [
          Math.min(50, Math.round(size.x * 0.1)),
          Math.min(80, Math.round(size.y * 0.15)),
        ],
        maxZoom: 16,
      };

      if (target.instant) {
        map.fitBounds(target.bounds, { ...options, animate: false });
      } else {
        map.flyToBounds(target.bounds, { ...options, duration: 0.8 });
      }

      return;
    }

    if (target.coordinates) {
      map.flyTo(target.coordinates, target.zoom, {
        duration: 0.8,
      });
    }
  }, [target, map]);

  return null;
};

/* =========================================================
   MAP RESIZE HANDLER

   Leaflet does not notice its container changing size (for
   example when the sidebar is dragged). Without this the map
   shows grey strips and markers drift.
   ========================================================= */

const MapResizeHandler = () => {
  const map = useMap();

  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const container = map.getContainer();
    let frame = null;

    const observer = new ResizeObserver(() => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
      });
    });

    observer.observe(container);
    map.invalidateSize({ pan: false });

    return () => {
      observer.disconnect();

      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [map]);

  return null;
};

/* =========================================================
   MAP VIEW TRACKER

   Saves the last centre and zoom so the map reopens where
   the user left it, and reports the zoom so markers can be
   sized to it.
   ========================================================= */

const MapViewTracker = ({ onZoomChange }) => {
  const map = useMap();

  useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      const zoom = map.getZoom();

      updateStoredLayout({
        view: {
          center: [center.lat, center.lng],
          zoom,
        },
      });

      onZoomChange(zoom);
    },
  });

  return null;
};

/* =========================================================
   MARKER SIZE HELPERS
   ========================================================= */

/* Ship badges grow as the map is zoomed in. Far out they shrink to
   plain dots so a busy anchorage stays readable. */
const shipIconSize = (zoom) => {
  if (zoom >= 16) {
    return 28;
  }

  if (zoom >= 14) {
    return 24;
  }

  if (zoom >= 12) {
    return 18;
  }

  return 11;
};

const getBerthIcon = (status, zoom) =>
  BERTH_ICONS[zoom >= 14 ? "large" : "small"][status] ||
  BERTH_ICONS.large.available;

/* =========================================================
   SHIP MARKERS

   An anchor badge (orange) for ships at anchor, a ship badge
   (green) for ships at a berth. Kept in a memoised component so
   dragging a gate marker does not redraw every ship.
   ========================================================= */

const ShipMarkersBase = ({
  vessels,
  berthByMmsi,
  zoom,
  selectedId,
  onSelect,
}) => {
  const size = shipIconSize(zoom);

  return (
    <>
      {vessels.map((vessel) => {
        const berth = vessel.mmsi ? berthByMmsi.get(vessel.mmsi) : undefined;
        const selected = vessel.id === selectedId;

        return (
          <Marker
            key={`ship-${vessel.id}`}
            position={vessel.position}
            icon={getShipIcon(
              vessel.portState,
              selected ? size + 6 : size,
              selected
            )}
            opacity={vessel.stale && !selected ? 0.55 : 1}
            zIndexOffset={selected ? 1500 : 800}
            eventHandlers={{
              click: () => onSelect(vessel),
            }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <div>
                <div className="font-bold">{vessel.name}</div>

                {vessel.mmsi && <div>MMSI: {vessel.mmsi}</div>}

                <div>{PORT_STATE_LABELS[vessel.portState]}</div>

                {berth && (
                  <div>
                    Berth: {berth.code || berth.name}
                    {berth.code && berth.name ? ` — ${berth.name}` : ""}
                  </div>
                )}

                {berth && berth.vesselDistance !== null && (
                  <div>
                    {Math.round(berth.vesselDistance)} m from berth point
                  </div>
                )}

                {vessel.destination && (
                  <div>Destination: {vessel.destination}</div>
                )}

                <div>
                  Position: {formatPortTime(vessel.lastUpdated)} (
                  {formatAge(vessel.ageMinutes)})
                </div>

                {vessel.stale && (
                  <div>
                    Older than {STALE_POSITION_MINUTES / 60} h, last known
                  </div>
                )}

                <div>Source: {vessel.aisSource}</div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
};

const ShipMarkers = React.memo(ShipMarkersBase);

/* =========================================================
   SMALL PAGE PIECES
   ========================================================= */

/* The round ship / anchor badge used on the map, as a small React
   element for tiles, switches, the legend and the ship list. */
const SymbolBadge = ({ portState, size = 18, faded = false }) => (
  <span
    className="inline-flex flex-shrink-0 items-center justify-center rounded-full"
    style={{
      width: size,
      height: size,
      boxSizing: "border-box",
      background: PORT_STATE_COLORS[portState],
      border: "1.5px solid #ffffff",
      boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
      opacity: faded ? 0.45 : 1,
    }}
  >
    <svg
      viewBox="0 0 24 24"
      width="70%"
      height="70%"
      fill="#ffffff"
      aria-hidden="true"
    >
      <path d={SYMBOL_PATHS[portState]} />
    </svg>
  </span>
);

/* The incident icon of one type as a small React element (panel,
   legend, lists). The ring is grey unless a severity is given. */
const IncidentBadge = ({ type, severity, size = 18 }) => {
  const style = INCIDENT_TYPE_STYLES[type] || INCIDENT_TYPE_STYLES.Other;

  return (
    <span
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        boxSizing: "border-box",
        background: "#111827",
        border: `2px solid ${SEVERITY_COLORS[severity] || NEUTRAL_RING}`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="62%"
        height="62%"
        fill="#ffffff"
        aria-hidden="true"
      >
        <path d={style.path} />
      </svg>
    </span>
  );
};

const StatTile = ({ label, value, detail, dotClass, icon }) => (
  <div className="rounded-[20px] bg-white px-5 py-4 shadow-sm dark:bg-navy-800">
    <div className="flex items-center gap-2">
      {icon ||
        (dotClass && (
          <span
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotClass}`}
          />
        ))}

      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
    </div>

    <p className="mt-1 text-3xl font-bold text-navy-700 dark:text-white">
      {value}
    </p>

    <p className="mt-0.5 min-h-[16px] text-[11px] text-gray-500 dark:text-gray-400">
      {detail}
    </p>
  </div>
);

const NOTICE_STYLES = {
  error: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  warn: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300",
  info: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
};

const LayerRow = ({ swatch, icon, label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between py-1.5">
    <span className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
      {icon || <span className={`h-2.5 w-2.5 flex-shrink-0 ${swatch}`} />}
      {label}
    </span>

    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-indigo-600"
    />
  </label>
);

const LegendItem = ({ swatch, label }) => (
  <span className="flex items-center gap-1.5">
    <span className={`h-2.5 w-2.5 flex-shrink-0 ${swatch}`} />
    {label}
  </span>
);

/* =========================================================
   MAIN PORT MAP
   ========================================================= */

const PortMap = () => {
  /* =======================================================
     SAVED LAYOUT (read once when the page opens)
     ======================================================= */

  const savedLayoutRef = React.useRef(null);

  if (savedLayoutRef.current === null) {
    savedLayoutRef.current = readStoredLayout();
  }

  const saved = savedLayoutRef.current;

  const hasSavedView =
    isPoint(saved.view?.center) && toNumber(saved.view?.zoom) !== null;

  /* =======================================================
     MAP LAYERS

     Ships, berths, incidents and the operational circle are on by
     default. The gate markers are off.
     ======================================================= */

  const [showBerthShips, setShowBerthShips] = React.useState(
    booleanOr(saved.layers?.berthShips, true)
  );

  const [showAnchorShips, setShowAnchorShips] = React.useState(
    booleanOr(saved.layers?.anchorShips, true)
  );

  const [showOldShips, setShowOldShips] = React.useState(
    booleanOr(saved.layers?.oldShips, true)
  );

  const [showBerths, setShowBerths] = React.useState(
    booleanOr(saved.layers?.berths, true)
  );

  const [showGates, setShowGates] = React.useState(
    booleanOr(saved.layers?.gates, false)
  );

  /* Real incidents from the database: on by default. */
  const [showIncidents, setShowIncidents] = React.useState(
    booleanOr(saved.layers?.incidents, true)
  );

  /* Incident types switched off in the Incidents panel. */
  const [hiddenIncidentTypes, setHiddenIncidentTypes] = React.useState(() =>
    Array.isArray(saved.hiddenIncidentTypes)
      ? saved.hiddenIncidentTypes.filter((type) =>
          INCIDENT_TYPES.includes(type)
        )
      : []
  );

  /* The operational circle (saved under "zone"). */
  const [showArea, setShowArea] = React.useState(
    booleanOr(saved.layers?.zone, true)
  );

  /* =======================================================
     DRAGGABLE GATE MARKERS, RESIZABLE CIRCLE

     Gate markers and the circle size are kept in this browser only
     (localStorage).
     ======================================================= */

  const [gatePositions, setGatePositions] = React.useState(() =>
    buildItems(gates, saved.gates, saved.gatesExtra, "name")
  );

  const [operationalRadius, setOperationalRadius] = React.useState(() => {
    const savedRadius = toNumber(saved.radius);

    return savedRadius !== null &&
      savedRadius >= MIN_RADIUS &&
      savedRadius <= MAX_RADIUS
      ? Math.round(savedRadius)
      : DEFAULT_RADIUS;
  });

  /* Where on the edge the handle sits (radians from east). */
  const [handleAngle, setHandleAngle] = React.useState(0);

  const resizeHandleIcon = React.useMemo(
    () =>
      L.divIcon({
        className: "port-map-resize-handle",
        html: '<div title="Drag to resize the circle" style="width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:#ffffff;border:5px solid #6366f1;box-shadow:0 1px 8px rgba(0,0,0,.55);cursor:grab;"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    []
  );

  const radiusHandlePosition = React.useMemo(
    () => pointFromCentre(operationalRadius, handleAngle),
    [operationalRadius, handleAngle]
  );

  /* Dragging the handle: the radius is the distance from the circle
     centre to the pointer (kept between MIN_RADIUS and MAX_RADIUS)
     and the handle is put back exactly on the edge on every step. */
  const handleRadiusDrag = (event) => {
    const point = event.target.getLatLng();
    const distance = L.latLng(SINGAPORE_PORT).distanceTo(point);
    const nextRadius = clampRadius(distance);
    const nextAngle = distance > 0 ? angleFromCentre(point) : handleAngle;

    event.target.setLatLng(pointFromCentre(nextRadius, nextAngle));

    setHandleAngle(nextAngle);
    setOperationalRadius(nextRadius);
  };

  /* =======================================================
     MAP TYPE
     ======================================================= */

  const [mapType, setMapType] = React.useState(
    saved.mapType === "default" ? "default" : "satellite"
  );

  /* =======================================================
     INITIAL MAP VIEW (saved view or Singapore default)
     ======================================================= */

  const initialView = React.useMemo(() => {
    const savedZoom = toNumber(saved.view?.zoom);

    if (isPoint(saved.view?.center) && savedZoom !== null) {
      return {
        center: [
          Number(saved.view.center[0]),
          Number(saved.view.center[1]),
        ],
        zoom: savedZoom,
      };
    }

    return { center: SINGAPORE_PORT, zoom: DEFAULT_ZOOM };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [zoom, setZoom] = React.useState(initialView.zoom);

  /* =======================================================
     SHIP + BERTH STATE
     ======================================================= */

  const [vessels, setVessels] = React.useState([]);
  const [hiddenVesselCount, setHiddenVesselCount] = React.useState(0);
  const [berths, setBerths] = React.useState([]);
  const [berthsWithoutCoordinates, setBerthsWithoutCoordinates] =
    React.useState(0);

  const [aisLoading, setAisLoading] = React.useState(true);
  const [aisError, setAisError] = React.useState("");
  const [berthError, setBerthError] = React.useState("");
  const [lastAisRefresh, setLastAisRefresh] = React.useState(null);

  /* Time used to work out how old each position is. It moves
     forward with every refresh. */
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState("");

  /* =======================================================
     INCIDENTS (from the database) + REPORTING ON THE MAP
     ======================================================= */

  /* Every open incident (with or without its own map spot). */
  const [mapIncidents, setMapIncidents] = React.useState([]);

  /* Spots placed by hand for incidents that had no spot, keyed by
     their location text. Kept in this browser only. */
  const [incidentSpots, setIncidentSpots] = React.useState(() => {
    const raw = saved.incidentSpots;
    const spots = {};

    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach((key) => {
        if (isPoint(raw[key])) {
          spots[key] = [Number(raw[key][0]), Number(raw[key][1])];
        }
      });
    }

    return spots;
  });

  /* The "Not placed on map" window and the "click the map" mode. */
  const [showUnplaced, setShowUnplaced] = React.useState(false);
  const [placing, setPlacing] = React.useState(null);

  /* Where the person right-clicked (null = report window closed). */
  const [reportSpot, setReportSpot] = React.useState(null);
  const [reportForm, setReportForm] = React.useState(emptyIncidentForm);
  const [reportError, setReportError] = React.useState("");
  const [reportSaving, setReportSaving] = React.useState(false);
  const [mapMessage, setMapMessage] = React.useState("");
  const mapMessageTimerRef = React.useRef(null);

  /* Reporting needs the Incident Management permission (the backend
     checks it too). */
  const canReport = (() => {
    try {
      return hasModuleAccess(authService.getCurrentUser(), "incidents");
    } catch (error) {
      return false;
    }
  })();

  /* =======================================================
     FLY-TO TARGET (null until the user asks)
     ======================================================= */

  const [flyTarget, setFlyTarget] = React.useState(null);

  /* =======================================================
     FULL SIZE MAP

     Off by default. When on, the map takes the whole width and
     the ship list moves below it. Not saved.
     ======================================================= */

  const [mapExpanded, setMapExpanded] = React.useState(false);
  const mapCardRef = React.useRef(null);

  React.useEffect(() => {
    if (!mapExpanded) {
      return undefined;
    }

    /* Bring the bigger map into view, and let Esc close it. */
    if (mapCardRef.current && mapCardRef.current.scrollIntoView) {
      mapCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMapExpanded(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mapExpanded]);

  /* =======================================================
     SAVE LAYOUT WHEN ANYTHING CHANGES
     ======================================================= */

  React.useEffect(() => {
    updateStoredLayout({
      gates: positionsToMap(gatePositions.filter((item) => !item.extra)),
      gatesExtra: gatePositions.filter((item) => item.extra),
      radius: operationalRadius,
      layers: {
        berthShips: showBerthShips,
        anchorShips: showAnchorShips,
        oldShips: showOldShips,
        berths: showBerths,
        gates: showGates,
        incidents: showIncidents,
        zone: showArea,
      },
      hiddenIncidentTypes,
      incidentSpots,
      mapType,
    });
  }, [
    gatePositions,
    operationalRadius,
    showBerthShips,
    showAnchorShips,
    showOldShips,
    showBerths,
    showGates,
    showIncidents,
    showArea,
    hiddenIncidentTypes,
    incidentSpots,
    mapType,
  ]);

  /* =======================================================
     FETCH SHIPS + BERTHS + INCIDENTS (database only)

     The requests are independent: if berths fail, the
     ships still load, and the other way round. When a
     refresh fails the last loaded data stays on the map and
     the error says so.
     ======================================================= */

  const mountedRef = React.useRef(true);
  const requestCounterRef = React.useRef(0);

  /* True while the ships of the last visit are shown. */
  const cachedNoticeRef = React.useRef(false);

  const fetchMapData = React.useCallback(async () => {
    requestCounterRef.current += 1;

    const requestId = requestCounterRef.current;

    const [vesselResult, berthResult, incidentResult] = await Promise.all([
      settle(() => apiGet("/vessels")),
      settle(() => apiGet("/berths")),
      settle(() => apiGet("/incidents")),
    ]);

    /* Ignore the answer if the page was closed or a newer
       request has already been sent. */
    if (!mountedRef.current || requestId !== requestCounterRef.current) {
      return;
    }

    const loadedAt = new Date();

    setNowMs(loadedAt.getTime());

    /* ---------- ships ---------- */

    if (vesselResult.ok) {
      const records = toRecordList(vesselResult.value);

      if (records) {
        const withPosition = records.map(normalizeAisVessel).filter(Boolean);

        /* Only moored / at-berth and anchored ships are kept. */
        const inPort = withPosition.filter((vessel) => vessel.portState);

        /* Remembered for a fast start next time (see FAST START). */
        saveShipCache(
          records.filter((record) => {
            const vessel = normalizeAisVessel(record);

            return Boolean(vessel && vessel.portState);
          })
        );

        if (cachedNoticeRef.current) {
          cachedNoticeRef.current = false;
          setMapMessage("");
        }

        setVessels(inPort);
        setHiddenVesselCount(withPosition.length - inPort.length);
        setLastAisRefresh(loadedAt);
        setAisError("");
      } else {
        setAisError("The vessels endpoint returned an unexpected response.");
      }
    } else {
      console.error("Unable to load AIS vessels:", vesselResult.error);

      setAisError(
        vesselResult.error?.message ||
          "Unable to retrieve AIS vessel positions."
      );
    }

    /* ---------- berths ---------- */

    if (berthResult.ok) {
      const records = toRecordList(berthResult.value);

      if (records) {
        const activeBerths = records.filter(
          (berth) => berth && berth.is_active !== false
        );

        const placedBerths = activeBerths.map(normalizeBerth).filter(Boolean);

        setBerths(placedBerths);
        setBerthsWithoutCoordinates(activeBerths.length - placedBerths.length);
        setBerthError("");
      } else {
        setBerthError("The berths endpoint returned an unexpected response.");
      }
    } else {
      console.error("Unable to load berths:", berthResult.error);

      setBerthError(
        berthResult.error?.message || "Unable to retrieve berth data."
      );
    }

    /* ---------- incidents ----------

       A refusal (no permission) or a failure keeps the last list;
       nothing is made up. */

    if (incidentResult.ok) {
      const value = incidentResult.value;

      const records = Array.isArray(value)
        ? value
        : Array.isArray(value?.incidents)
        ? value.incidents
        : null;

      if (records) {
        setMapIncidents(records.map(normalizeMapIncident).filter(Boolean));
      }
    }

    setAisLoading(false);
  }, []);

  /* =======================================================
     INITIAL LOAD + POLLING
     ======================================================= */

  React.useEffect(() => {
    mountedRef.current = true;

    /* Fast start: draw the ships of the last visit at once. */
    const cached = readShipCache();

    if (cached) {
      const fromCache = cached
        .map(normalizeAisVessel)
        .filter((vessel) => vessel && vessel.portState);

      if (fromCache.length > 0) {
        setVessels(fromCache);

        cachedNoticeRef.current = true;

        setMapMessage(
          "Showing the ships from your last visit. The latest positions are loading…"
        );
      }
    }

    fetchMapData();

    /* While this browser tab is hidden nothing is downloaded (saves
       the network for the tab you are using); coming back loads the
       latest data at once. */
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        fetchMapData();
      }
    }, DATA_REFRESH_INTERVAL);

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        fetchMapData();
      }
    };

    document.addEventListener("visibilitychange", handleVisible);

    /* A new or changed incident (live alerts, if installed): reload. */
    window.addEventListener("singapore-incidents-changed", fetchMapData);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("singapore-incidents-changed", fetchMapData);
      window.clearTimeout(mapMessageTimerRef.current);
    };
  }, [fetchMapData]);

  /* =======================================================
     DERIVED SHIP + BERTH DATA
     ======================================================= */

  const vesselViews = React.useMemo(
    () =>
      vessels.map((vessel) => {
        const minutes = ageInMinutes(vessel.lastUpdated, nowMs);

        return {
          ...vessel,
          ageMinutes: minutes,
          /* A position with no readable time cannot be called recent. */
          stale: minutes === null || minutes > STALE_POSITION_MINUTES,
        };
      }),
    [vessels, nowMs]
  );

  const staleCount = vesselViews.filter((vessel) => vessel.stale).length;
  const freshCount = vesselViews.length - staleCount;

  const atBerthCount = vesselViews.filter(
    (vessel) => vessel.portState === "berth"
  ).length;

  const atAnchorCount = vesselViews.length - atBerthCount;

  const newestMinutes = vesselViews.reduce(
    (newest, vessel) =>
      vessel.ageMinutes !== null &&
      (newest === null || vessel.ageMinutes < newest)
        ? vessel.ageMinutes
        : newest,
    null
  );

  /* The ships the layer switches currently allow. */
  const visibleVessels = React.useMemo(
    () =>
      vesselViews.filter(
        (vessel) =>
          (vessel.portState === "berth" ? showBerthShips : showAnchorShips) &&
          (showOldShips || !vessel.stale)
      ),
    [vesselViews, showBerthShips, showAnchorShips, showOldShips]
  );

  /* Ships (as currently shown) that lie inside the operational circle. */
  const insideCircle = React.useMemo(() => {
    const centre = L.latLng(SINGAPORE_PORT);
    const inside = { total: 0, berth: 0, anchor: 0 };

    visibleVessels.forEach((vessel) => {
      if (centre.distanceTo(L.latLng(vessel.position)) <= operationalRadius) {
        inside.total += 1;
        inside[vessel.portState] += 1;
      }
    });

    return inside;
  }, [visibleVessels, operationalRadius]);

  /* Berths where the backend found a vessel by AIS, keyed by the
     vessel's MMSI. */
  const berthByMmsi = React.useMemo(() => {
    const lookup = new Map();

    berths.forEach((berth) => {
      if (berth.occupancySource === "ais" && berth.vesselMmsi) {
        lookup.set(berth.vesselMmsi, berth);
      }
    });

    return lookup;
  }, [berths]);

  const berthVesselLinks = React.useMemo(() => {
    const vesselByMmsi = new Map();

    visibleVessels.forEach((vessel) => {
      if (vessel.mmsi) {
        vesselByMmsi.set(vessel.mmsi, vessel);
      }
    });

    return berths
      .filter(
        (berth) =>
          berth.occupancySource === "ais" &&
          berth.vesselMmsi &&
          vesselByMmsi.has(berth.vesselMmsi)
      )
      .map((berth) => ({
        id: berth.id,
        positions: [
          berth.position,
          vesselByMmsi.get(berth.vesselMmsi).position,
        ],
      }));
  }, [berths, visibleVessels]);

  const occupiedByAisCount = berths.filter(
    (berth) => berth.occupancySource === "ais"
  ).length;

  const fitAnyLayer = showBerthShips || showAnchorShips;

  const fitPoints = React.useMemo(
    () => [
      ...(fitAnyLayer ? visibleVessels.map((vessel) => vessel.position) : []),
      ...(showBerths ? berths.map((berth) => berth.position) : []),
    ],
    [fitAnyLayer, visibleVessels, showBerths, berths]
  );

  /* The list beside the map follows the same switches, plus search. */
  const listVessels = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return visibleVessels
      .filter((vessel) => {
        if (!query) {
          return true;
        }

        const berth = vessel.mmsi ? berthByMmsi.get(vessel.mmsi) : undefined;

        return (
          vessel.name.toLowerCase().includes(query) ||
          (vessel.mmsi && vessel.mmsi.includes(query)) ||
          (berth && berth.code.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleVessels, search, berthByMmsi]);

  /* =======================================================
     WHERE EACH OPEN INCIDENT IS DRAWN

     1. its own saved map spot
     2. the berth named in its location (exactly one berth with that
        number, with coordinates, in GET /berths)
     3. the gate named in its location (a gate marker of this map)
     4. a spot placed by hand for that location text (this browser)
     Otherwise it goes to the "Not placed on map" list.
     ======================================================= */

  const incidentPlacement = React.useMemo(() => {
    const gateByNumber = new Map();

    gatePositions.forEach((gate) => {
      const match =
        /^G0*(\d+)$/i.exec(String(gate.id)) ||
        /gate\s*0*(\d+)/i.exec(String(gate.name || ""));

      if (match) {
        const number = Number(match[1]);

        if (!gateByNumber.has(number)) {
          gateByNumber.set(number, gate);
        }
      }
    });

    const berthsByNumber = new Map();

    berths.forEach((berth) => {
      const match = /(\d+)\s*$/.exec(String(berth.code || berth.name || ""));

      if (match) {
        const number = Number(match[1]);

        berthsByNumber.set(number, [
          ...(berthsByNumber.get(number) || []),
          berth,
        ]);
      }
    });

    const placed = [];
    const unplaced = [];

    mapIncidents.forEach((incident) => {
      if (incident.position) {
        placed.push({ ...incident, how: "exact", note: "" });

        return;
      }

      const text = incident.location;
      const berthNumber = berthNumberOf(text);

      if (berthNumber !== null) {
        const matches = berthsByNumber.get(berthNumber) || [];

        if (matches.length === 1) {
          placed.push({
            ...incident,
            position: matches[0].position,
            how: "berth",
            note: `Drawn at ${
              matches[0].code || matches[0].name
            } (from the location name, no exact spot was set)`,
          });

          return;
        }
      } else {
        const gateNumber = gateNumberOf(text);

        if (gateNumber !== null && gateByNumber.has(gateNumber)) {
          const gate = gateByNumber.get(gateNumber);

          placed.push({
            ...incident,
            position: [...gate.position],
            how: "gate",
            note: `Drawn at the ${gate.name} marker (from the location name, no exact spot was set)`,
          });

          return;
        }
      }

      const key = locationKey(incident);

      if (isPoint(incidentSpots[key])) {
        placed.push({
          ...incident,
          position: [...incidentSpots[key]],
          how: "saved",
          note: "Spot placed by hand, saved in this browser only",
        });

        return;
      }

      unplaced.push({ ...incident, placeKey: key });
    });

    /* Incidents that fall on the same point are spread a little
       around it, the most serious in the middle, so none hides
       another. */

    const groups = new Map();

    placed.forEach((item) => {
      const key = `${item.position[0].toFixed(5)}|${item.position[1].toFixed(
        5
      )}`;

      groups.set(key, [...(groups.get(key) || []), item]);
    });

    const spread = [];

    groups.forEach((list) => {
      list.sort(
        (a, b) =>
          (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
      );

      list.forEach((item, index) => {
        if (index === 0) {
          spread.push(item);

          return;
        }

        const ring = Math.floor((index - 1) / 6) + 1;
        const angle = ((index - 1) % 6) * (Math.PI / 3);
        const metres = 35 * ring;
        const latitude = item.position[0];

        spread.push({
          ...item,
          position: [
            latitude + (metres * Math.sin(angle)) / 111320,
            item.position[1] +
              (metres * Math.cos(angle)) /
                (111320 * Math.cos((latitude * Math.PI) / 180)),
          ],
        });
      });
    });

    return { placed: spread, unplaced };
  }, [mapIncidents, berths, gatePositions, incidentSpots]);

  const placedIncidents = incidentPlacement.placed;
  const unplacedIncidents = incidentPlacement.unplaced;

  const incidentTypeCounts = React.useMemo(() => {
    const counts = {};

    INCIDENT_TYPES.forEach((type) => {
      counts[type] = 0;
    });

    placedIncidents.forEach((incident) => {
      const type = INCIDENT_TYPES.includes(incident.type)
        ? incident.type
        : "Other";

      counts[type] += 1;
    });

    return counts;
  }, [placedIncidents]);

  const visibleIncidents = React.useMemo(
    () =>
      placedIncidents.filter(
        (incident) =>
          !hiddenIncidentTypes.includes(
            INCIDENT_TYPES.includes(incident.type) ? incident.type : "Other"
          )
      ),
    [placedIncidents, hiddenIncidentTypes]
  );

  /* The not-placed incidents grouped by the words of their location. */
  const unplacedGroups = React.useMemo(() => {
    const groups = new Map();

    unplacedIncidents.forEach((incident) => {
      const group = groups.get(incident.placeKey) || {
        key: incident.placeKey,
        label: incident.location || incident.number,
        incidents: [],
      };

      group.incidents.push(incident);
      groups.set(incident.placeKey, group);
    });

    return Array.from(groups.values());
  }, [unplacedIncidents]);

  const savedSpotCount = Object.keys(incidentSpots).length;

  const toggleIncidentType = (type, visible) =>
    setHiddenIncidentTypes((current) =>
      visible
        ? current.filter((item) => item !== type)
        : current.includes(type)
        ? current
        : [...current, type]
    );

  /* =======================================================
     FIT THE MAP TO THE SHIPS ONCE
     (only when no saved view exists)
     ======================================================= */

  const autoFitDoneRef = React.useRef(false);

  React.useEffect(() => {
    if (autoFitDoneRef.current || hasSavedView || aisLoading) {
      return;
    }

    if (fitPoints.length === 0) {
      return;
    }

    autoFitDoneRef.current = true;

    setFlyTarget({ bounds: L.latLngBounds(fitPoints), instant: true });
  }, [aisLoading, hasSavedView, fitPoints]);

  /* =======================================================
     LOCATE / SELECT
     ======================================================= */

  const locatePosition = React.useCallback((position, targetZoom = 16) => {
    setFlyTarget({ coordinates: position, zoom: targetZoom });
  }, []);

  const handleSelectVessel = React.useCallback(
    (vessel) => {
      setSelectedId(vessel.id);
      locatePosition(vessel.position, 17);
    },
    [locatePosition]
  );

  /* =======================================================
     RESET VIEW (camera only)

     Shows every visible ship and berth; with nothing to show
     it returns to the Singapore port centre.
     ======================================================= */

  const handleReset = () => {
    if (fitPoints.length > 0) {
      setFlyTarget({ bounds: L.latLngBounds(fitPoints) });

      return;
    }

    setFlyTarget({ coordinates: SINGAPORE_PORT, zoom: DEFAULT_ZOOM });
  };

  /* =======================================================
     RESET ICONS (gate markers back to their defaults, added ones
     removed)
     ======================================================= */

  const handleResetIcons = () => {
    setGatePositions(cloneItems(gates));
  };

  const handleResetCircle = () => {
    setOperationalRadius(DEFAULT_RADIUS);
    setHandleAngle(0);
  };

  /* =======================================================
     MESSAGE AT THE BOTTOM
     ======================================================= */

  const showMapMessage = (text) => {
    setMapMessage(text);
    window.clearTimeout(mapMessageTimerRef.current);
    mapMessageTimerRef.current = window.setTimeout(
      () => setMapMessage(""),
      7000
    );
  };

  /* =======================================================
     PLACE AN INCIDENT THAT HAS NO SPOT (click on the map)
     ======================================================= */

  const startPlacing = (group) => {
    setShowUnplaced(false);
    setShowIncidents(true);
    setReportSpot(null);

    setPlacing({
      key: group.key,
      label: group.label,
      count: group.incidents.length,
    });
  };

  const cancelPlacing = React.useCallback(() => setPlacing(null), []);

  const handlePlaceOnMap = (spot) => {
    if (!placing) {
      return;
    }

    if (!isInsidePortArea(spot[0], spot[1])) {
      showMapMessage("The spot must be in or near the Port of Singapore.");

      return;
    }

    setIncidentSpots((current) => ({
      ...current,
      [placing.key]: [spot[0], spot[1]],
    }));

    showMapMessage(
      `"${placing.label}" is placed on the map (${placing.count} incident${
        placing.count === 1 ? "" : "s"
      }). This spot is saved in this browser only.`
    );

    setPlacing(null);
    locatePosition(spot, 17);
  };

  const clearSavedSpots = () => {
    setIncidentSpots({});
  };

  React.useEffect(() => {
    if (!placing && !showUnplaced) {
      return undefined;
    }

    const closeOnEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (placing) {
        setPlacing(null);
      } else {
        setShowUnplaced(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [placing, showUnplaced]);

  /* =======================================================
     REPORT AN INCIDENT AT A SPOT (right-click on the map)
     ======================================================= */

  const openReport = React.useCallback((spot) => {
    setReportSpot(spot);
    setReportForm(emptyIncidentForm());
    setReportError("");
  }, []);

  const closeReport = React.useCallback(() => {
    if (!reportSaving) {
      setReportSpot(null);
      setReportError("");
    }
  }, [reportSaving]);

  React.useEffect(() => {
    if (!reportSpot) {
      return undefined;
    }

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        closeReport();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [reportSpot, closeReport]);

  const updateReport = (field, value) =>
    setReportForm((current) => ({ ...current, [field]: value }));

  const submitReport = async (event) => {
    event.preventDefault();

    if (reportSaving || !reportSpot) {
      return;
    }

    const location = reportForm.location.trim();
    const description = reportForm.description.trim();

    if (!location) {
      setReportError("Enter where it happened (for example Berth 2).");
      return;
    }

    if (!description) {
      setReportError("Describe what happened.");
      return;
    }

    setReportSaving(true);
    setReportError("");

    try {
      const result = await apiPost("/incidents", {
        type: reportForm.type,
        severity: reportForm.severity,
        location,
        vessel: reportForm.vessel.trim() || null,
        description,
        latitude: reportSpot[0],
        longitude: reportSpot[1],
      });

      if (!mountedRef.current) {
        return;
      }

      const savedIncident = normalizeMapIncident(result?.incident);

      if (savedIncident) {
        setMapIncidents((current) => [
          savedIncident,
          ...current.filter((item) => item.id !== savedIncident.id),
        ]);
      }

      setShowIncidents(true);
      setReportSpot(null);

      showMapMessage(
        `${
          savedIncident ? savedIncident.number : "The incident"
        } is saved and shown on the map. The people who must know have been notified.`
      );
    } catch (error) {
      if (mountedRef.current) {
        setReportError(
          readErrorMessage(error, "The incident could not be saved.")
        );
      }
    } finally {
      if (mountedRef.current) {
        setReportSaving(false);
      }
    }
  };

  /* =======================================================
     LAYER SWITCHES
     ======================================================= */

  const liveLayers = [
    {
      key: "berthShips",
      icon: <SymbolBadge portState="berth" size={18} />,
      label: "Ships at berth",
      checked: showBerthShips,
      onChange: setShowBerthShips,
    },
    {
      key: "anchorShips",
      icon: <SymbolBadge portState="anchor" size={18} />,
      label: "Ships at anchor",
      checked: showAnchorShips,
      onChange: setShowAnchorShips,
    },
    {
      key: "oldShips",
      swatch: "rounded-full border border-gray-400 bg-gray-400/30",
      label: `Older than ${STALE_POSITION_MINUTES / 60} h`,
      checked: showOldShips,
      onChange: setShowOldShips,
    },
  ];

  const portLayers = [
    {
      key: "berths",
      swatch: "rounded-[3px] bg-red-500",
      label: "Berths",
      checked: showBerths,
      onChange: setShowBerths,
    },
    {
      key: "area",
      swatch: "rounded-full border-2 border-indigo-500",
      label: "Operational circle",
      checked: showArea,
      onChange: setShowArea,
    },
  ];

  const gateLayer = {
    key: "gates",
    swatch: "rounded-full bg-purple-500",
    label: "Gates / Trucks",
    checked: showGates,
    onChange: setShowGates,
  };

  const incidentLayer = {
    key: "incidents",
    swatch: "rounded-full bg-red-600",
    label: `Incidents (${placedIncidents.length})`,
    checked: showIncidents,
    onChange: setShowIncidents,
  };

  /* =======================================================
     NOTICES (shown above the map, never on top of it)
     ======================================================= */

  const notices = [];

  if (aisError) {
    notices.push({
      key: "ais",
      tone: "error",
      title: "AIS data unavailable.",
      text: `${aisError}${
        lastAisRefresh
          ? ` Showing the data loaded at ${formatPortTime(lastAisRefresh)}.`
          : ""
      }`,
    });
  }

  if (berthError) {
    notices.push({
      key: "berth-error",
      tone: "error",
      title: "Berth data unavailable.",
      text: `${berthError}${
        berths.length > 0 ? " Showing the berths loaded earlier." : ""
      }`,
    });
  }

  if (!berthError && berthsWithoutCoordinates > 0) {
    notices.push({
      key: "berth-coordinates",
      tone: "warn",
      title: `${berthsWithoutCoordinates} active berth${
        berthsWithoutCoordinates === 1 ? " has" : "s have"
      } no coordinates,`,
      text: `so ${
        berthsWithoutCoordinates === 1 ? "it is" : "they are"
      } not shown. Add latitude and longitude in Berth Management.`,
    });
  }

  if (unplacedIncidents.length > 0) {
    notices.push({
      key: "unplaced-incidents",
      tone: "warn",
      title: `${unplacedIncidents.length} open incident${
        unplacedIncidents.length === 1 ? " is" : "s are"
      } not on the map yet.`,
      text: "They have no map spot and their location does not match a berth with coordinates or a gate marker. Open \"Not placed on map\" in the Incidents panel to place them.",
    });
  }

  if (lastAisRefresh && !aisError && vesselViews.length === 0) {
    notices.push({
      key: "none",
      tone: "info",
      title:
        hiddenVesselCount > 0
          ? `${hiddenVesselCount} vessel${
              hiddenVesselCount === 1 ? " is" : "s are"
            } saved, but none is moored or at anchor right now.`
          : "No AIS vessel positions are saved yet.",
      text: "Run Sync AIS Now in Vessel Management to refresh.",
    });
  }

  if (vesselViews.length > 0 && freshCount === 0) {
    notices.push({
      key: "stale",
      tone: "warn",
      title: "No recent positions.",
      text: "These are the last saved positions, not live. Run Sync AIS Now in Vessel Management to refresh.",
    });
  }

  /* =======================================================
     RENDER
     ======================================================= */

  const loadingValue = aisLoading ? "…" : null;

  return (
    <div className="mt-3">
      <style>
        {`
          .port-map-marker {
            background: transparent !important;
            border: none !important;
          }

          .leaflet-container {
            font-family: inherit;
          }

          .leaflet-tooltip {
            border: none !important;
            border-radius: 8px !important;
            padding: 6px 9px !important;
            font-size: 11px !important;
            font-weight: 500 !important;
            line-height: 1.45 !important;
            box-shadow: 0 3px 12px rgba(0,0,0,0.18) !important;
          }

          .leaflet-tooltip.port-map-radius-label {
            background: #4f46e5 !important;
            color: #ffffff !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            padding: 3px 9px !important;
          }

          .leaflet-tooltip-top.port-map-radius-label::before {
            border-top-color: #4f46e5 !important;
          }

          .port-map-layer-control {
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
        `}
      </style>

      {/* ===================================================
          NUMBERS
          =================================================== */}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Ships in port"
          value={loadingValue ?? vesselViews.length}
          detail={
            lastAisRefresh
              ? `${freshCount} updated within ${
                  STALE_POSITION_MINUTES / 60
                } h`
              : ""
          }
        />

        <StatTile
          label="At berth"
          icon={<SymbolBadge portState="berth" size={20} />}
          value={loadingValue ?? atBerthCount}
          detail="Moored"
        />

        <StatTile
          label="At anchor"
          icon={<SymbolBadge portState="anchor" size={20} />}
          value={loadingValue ?? atAnchorCount}
          detail="Waiting at the anchorage"
        />

        <StatTile
          label="Berths occupied"
          dotClass="bg-red-500"
          value={loadingValue ?? (berthError ? "—" : occupiedByAisCount)}
          detail={
            aisLoading
              ? ""
              : berthError
              ? "Berth data unavailable"
              : berths.length === 0
              ? "No berths on the map yet"
              : `of ${berths.length} berth${
                  berths.length === 1 ? "" : "s"
                } on the map`
          }
        />
      </div>

      {lastAisRefresh && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Showing ships that are moored or at anchor.{" "}
          {hiddenVesselCount} other vessel
          {hiddenVesselCount === 1 ? "" : "s"} (underway or without a mooring
          or anchor status) {hiddenVesselCount === 1 ? "is" : "are"} not
          shown.
          {newestMinutes !== null
            ? ` Newest position: ${formatAge(newestMinutes)}.`
            : ""}
        </p>
      )}

      {notices.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {notices.map((notice) => (
            <div
              key={notice.key}
              className={`rounded-xl px-4 py-3 text-xs leading-5 ${
                NOTICE_STYLES[notice.tone]
              }`}
            >
              <span className="font-bold">{notice.title}</span> {notice.text}
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex flex-col gap-4 ${mapExpanded ? "" : "xl:flex-row"}`}
      >
        {/* ===================================================
            MAP CONTAINER
            =================================================== */}

        <div
          ref={mapCardRef}
          className={`relative min-w-0 overflow-hidden rounded-[20px] bg-white shadow-sm dark:bg-navy-800 ${
            mapExpanded ? "w-full" : "flex-1"
          }`}
        >
          {/* ===================================================
              MAP LAYERS
              =================================================== */}

          <div
            className="port-map-layer-control absolute left-4 top-4 z-[1000] w-[210px] rounded-2xl bg-white/95 p-3 shadow-xl dark:bg-navy-800/95"
            style={{ maxHeight: "calc(100% - 7.5rem)", overflowY: "auto" }}
          >
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Ships
            </p>

            {liveLayers.map((layer) => (
              <LayerRow
                key={layer.key}
                swatch={layer.swatch}
                icon={layer.icon}
                label={layer.label}
                checked={layer.checked}
                onChange={layer.onChange}
              />
            ))}

            <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Port
            </p>

            {portLayers.map((layer) => (
              <LayerRow
                key={layer.key}
                swatch={layer.swatch}
                label={layer.label}
                checked={layer.checked}
                onChange={layer.onChange}
              />
            ))}

            {showArea && (
              <div className="mb-1 mt-1 rounded-xl bg-indigo-50 px-2.5 py-2 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
                    {formatRadius(operationalRadius)}
                  </span>

                  <button
                    type="button"
                    onClick={handleResetCircle}
                    className="text-[10px] font-semibold text-gray-500 hover:text-indigo-600 dark:text-gray-300"
                  >
                    Reset size
                  </button>
                </div>

                <input
                  type="range"
                  min={MIN_RADIUS}
                  max={MAX_RADIUS}
                  step={50}
                  value={operationalRadius}
                  onChange={(event) =>
                    setOperationalRadius(clampRadius(Number(event.target.value)))
                  }
                  aria-label="Operational circle radius"
                  className="mt-1 w-full accent-indigo-600"
                />

                <p className="mt-1 text-[10px] leading-4 text-gray-600 dark:text-gray-300">
                  {insideCircle.total} ship{insideCircle.total === 1 ? "" : "s"}{" "}
                  inside
                  {insideCircle.total > 0
                    ? ` (${insideCircle.berth} at berth, ${insideCircle.anchor} at anchor)`
                    : ""}
                </p>

                <p className="text-[10px] leading-4 text-gray-400">
                  Or drag the round handle on the circle.
                </p>
              </div>
            )}

            <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Operations
            </p>

            <LayerRow
              swatch={gateLayer.swatch}
              label={gateLayer.label}
              checked={gateLayer.checked}
              onChange={gateLayer.onChange}
            />

            <LayerRow
              swatch={incidentLayer.swatch}
              label={incidentLayer.label}
              checked={incidentLayer.checked}
              onChange={incidentLayer.onChange}
            />

            {showIncidents && (
              <div
                className="mb-1 rounded-xl bg-red-50 px-2.5 py-1.5 dark:bg-white/5"
                data-testid="incident-type-list"
              >
                {INCIDENT_TYPES.map((type) => (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center justify-between py-1"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      <IncidentBadge type={type} size={16} />
                      <span className="truncate">
                        {type} ({incidentTypeCounts[type]})
                      </span>
                    </span>

                    <input
                      type="checkbox"
                      checked={!hiddenIncidentTypes.includes(type)}
                      onChange={(event) =>
                        toggleIncidentType(type, event.target.checked)
                      }
                      aria-label={`Show ${type}`}
                      className="h-3.5 w-3.5 flex-shrink-0 accent-indigo-600"
                    />
                  </label>
                ))}

                <p className="mt-1 text-[10px] leading-4 text-gray-400">
                  Ring colour: red Critical, orange High, yellow Medium,
                  green Low.
                </p>
              </div>
            )}

            {(unplacedIncidents.length > 0 || savedSpotCount > 0) && (
              <button
                type="button"
                onClick={() => setShowUnplaced(true)}
                data-testid="unplaced-button"
                className="mb-1 mt-1 w-full rounded-xl bg-orange-50 px-2.5 py-2 text-left text-[11px] font-bold text-orange-600 transition hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-300"
              >
                Not placed on map ({unplacedIncidents.length})
                <span className="block text-[10px] font-normal text-orange-500 dark:text-orange-300">
                  Click to place them
                </span>
              </button>
            )}

            <p
              className="mt-1 text-[10px] leading-4 text-gray-500 dark:text-gray-400"
              data-testid="report-hint"
            >
              {canReport
                ? "Right-click the map to report an incident at that spot."
                : "All open incidents are listed here, wherever they were reported."}
            </p>
          </div>

          {/* ===================================================
              CLICK-THE-MAP MESSAGE (placing an incident)
              =================================================== */}

          {placing && (
            <div
              data-testid="placing-banner"
              className="absolute left-1/2 top-4 z-[1100] flex max-w-[min(92%,460px)] -translate-x-1/2 items-center gap-3 rounded-xl bg-orange-500 px-4 py-3 text-xs font-semibold text-white shadow-xl"
            >
              <span>
                Click the map where &ldquo;{placing.label}&rdquo; is
                {placing.count > 1 ? ` (${placing.count} incidents)` : ""}.
                Press Esc to cancel.
              </span>

              <button
                type="button"
                onClick={cancelPlacing}
                className="flex-shrink-0 rounded-lg bg-white/20 px-2.5 py-1 font-bold hover:bg-white/30"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ===================================================
              AIS STATUS

              DO NOT CHANGE
              =================================================== */}

          <div className="absolute left-[250px] top-4 z-[1000] hidden rounded-xl bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:bg-navy-800/95">
            <div className="flex items-center gap-3">
              <span
                className={`relative flex h-3 w-3 ${
                  aisLoading ? "" : aisError ? "" : "animate-pulse"
                }`}
              >
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    aisLoading
                      ? "bg-yellow-500"
                      : aisError
                      ? "bg-red-500"
                      : "bg-green-500"
                  }`}
                />
              </span>

              <div>
                <p className="text-xs font-bold text-navy-700 dark:text-white">
                  {aisLoading
                    ? "AIS Loading"
                    : aisError
                    ? "AIS Connection Issue"
                    : "AIS Live"}
                </p>

                <p className="text-[10px] text-gray-400">
                  {vessels.length} vessel
                  {vessels.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>

          {/* ===================================================
              MAP TYPE

              DO NOT CHANGE
              =================================================== */}

          <div className="absolute right-4 top-4 z-[1000] overflow-hidden rounded-xl bg-white/95 p-1 shadow-xl backdrop-blur dark:bg-navy-800/95">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMapType("default")}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  mapType === "default"
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
                }`}
              >
                Default
              </button>

              <button
                type="button"
                onClick={() => setMapType("satellite")}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  mapType === "satellite"
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-navy-700"
                }`}
              >
                Satellite
              </button>
            </div>
          </div>

          {/* ===================================================
              FULL SIZE MAP
              =================================================== */}

          <button
            type="button"
            onClick={() => setMapExpanded((current) => !current)}
            aria-label={mapExpanded ? "Exit full size map" : "Full size map"}
            title={mapExpanded ? "Exit full size map" : "Full size map"}
            className="absolute right-4 top-[80px] z-[1000] flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-navy-700 shadow-xl backdrop-blur transition hover:bg-white dark:bg-navy-800/95 dark:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={mapExpanded ? COMPRESS_PATH : EXPAND_PATH} />
            </svg>
          </button>

          {/* ===================================================
              RESET ICONS / RESET VIEW
              =================================================== */}

          <div className="absolute bottom-5 right-[56px] z-[1000] flex gap-2">
            {showGates && (
              <button
                type="button"
                onClick={handleResetIcons}
                title="Restore the default gate markers"
                className="rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-navy-700 shadow-xl backdrop-blur transition hover:bg-white dark:bg-navy-800/95 dark:text-white"
              >
                Reset Icons
              </button>
            )}

            <button
              type="button"
              onClick={handleReset}
              title="Zoom to show every visible ship and berth"
              className="rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-navy-700 shadow-xl backdrop-blur transition hover:bg-white dark:bg-navy-800/95 dark:text-white"
            >
              Reset View
            </button>
          </div>

          {/* ===================================================
              BERTH LEGEND
              =================================================== */}

          <div className="absolute bottom-5 left-4 z-[1000] flex max-w-[360px] flex-wrap gap-x-4 gap-y-1 rounded-xl bg-white/95 px-3 py-2 text-[11px] text-gray-600 shadow-xl backdrop-blur dark:bg-navy-800/95 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <SymbolBadge portState="anchor" size={16} />
              At anchor
            </span>
            <span className="flex items-center gap-1.5">
              <SymbolBadge portState="berth" size={16} />
              At berth (arrived)
            </span>
            <LegendItem swatch="rounded-[3px] bg-red-500" label="Berth occupied" />
            <LegendItem swatch="rounded-[3px] bg-green-500" label="Berth free" />
            <LegendItem
              swatch="rounded-[3px] bg-orange-500"
              label="Maintenance"
            />
            <LegendItem
              swatch="rounded-full border border-gray-400 bg-gray-400/30"
              label="Faded: older position"
            />
            {showIncidents &&
              INCIDENT_SEVERITIES.map((severity) => (
                <span key={severity} className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 flex-shrink-0 rounded-full"
                    style={{
                      background: "#111827",
                      border: `2.5px solid ${SEVERITY_COLORS[severity]}`,
                    }}
                  />
                  {severity}
                </span>
              ))}
          </div>

          {/* ===================================================
              LEAFLET MAP
              =================================================== */}

          <MapContainer
            center={initialView.center}
            zoom={initialView.zoom}
            scrollWheelZoom={true}
            zoomControl={false}
            className={`w-full ${mapExpanded ? "" : "h-[700px]"}`}
            style={
              mapExpanded
                ? { height: "calc(100vh - 160px)", minHeight: 600 }
                : undefined
            }
          >
            <ZoomControl position="bottomright" />

            {/* =================================================
                DEFAULT MAP

                Esri World Street Map. No "subdomains" prop (Esri
                has none) and maxZoom 19 (the highest zoom Esri
                has pictures for).
                ================================================= */}

            {mapType === "default" && (
              <TileLayer
                key="tiles-default"
                attribution={DEFAULT_TILE_ATTRIBUTION}
                url={DEFAULT_TILE_URL}
                maxZoom={DEFAULT_TILE_MAX_ZOOM}
                keepBuffer={4}
                updateWhenZooming={false}
              />
            )}

            {/* =================================================
                SATELLITE MAP
                ================================================= */}

            {mapType === "satellite" && (
              <TileLayer
                key="tiles-satellite"
                attribution="&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
                keepBuffer={4}
                updateWhenZooming={false}
              />
            )}

            {/* =================================================
                RESIZE / VIEW / RECENTER HELPERS
                ================================================= */}

            <MapResizeHandler />
            <MapViewTracker onZoomChange={setZoom} />
            <RecenterMap target={flyTarget} />

            {canReport && !placing && <MapRightClick onPick={openReport} />}

            <MapPickHandler active={!!placing} onPick={handlePlaceOnMap} />

            {/* =================================================
                OPERATIONAL CIRCLE

                Drag the round handle on its edge to resize. The
                label shows the radius while you drag.
                ================================================= */}

            {showArea && (
              <>
                <Circle
                  center={SINGAPORE_PORT}
                  radius={operationalRadius}
                  pathOptions={{
                    color: "#6366f1",
                    fillColor: "#6366f1",
                    fillOpacity: 0.07,
                    weight: 2.5,
                  }}
                />

                <Marker
                  position={radiusHandlePosition}
                  icon={resizeHandleIcon}
                  draggable={true}
                  zIndexOffset={2000}
                  eventHandlers={{ drag: handleRadiusDrag }}
                >
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[0, -12]}
                    className="port-map-radius-label"
                  >
                    {formatRadius(operationalRadius)}
                  </Tooltip>
                </Marker>
              </>
            )}

            {/* =================================================
                BERTH ↔ SHIP LINKS

                A dashed line joins a berth to the ship the
                backend detected there from AIS.
                ================================================= */}

            {showBerths &&
              berthVesselLinks.map((link) => (
                <Polyline
                  key={`link-${link.id}`}
                  positions={link.positions}
                  pathOptions={{
                    color: "#ef4444",
                    weight: 2,
                    dashArray: "4 4",
                  }}
                />
              ))}

            {/* =================================================
                SHIPS (moored / at anchor)

                NOT draggable: these are reported positions.
                ================================================= */}

            <ShipMarkers
              vessels={visibleVessels}
              berthByMmsi={berthByMmsi}
              zoom={zoom}
              selectedId={selectedId}
              onSelect={handleSelectVessel}
            />

            {/* =================================================
                BERTH MARKERS (from Berth Management)

                NOT draggable: change the coordinates in Berth
                Management.
                ================================================= */}

            {showBerths &&
              berths.map((berth) => (
                <Marker
                  key={`berth-${berth.id}`}
                  position={berth.position}
                  icon={getBerthIcon(berth.status, zoom)}
                  zIndexOffset={500}
                  eventHandlers={{
                    click: () => locatePosition(berth.position, 17),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]}>
                    <div>
                      <div className="font-bold">
                        {berth.code
                          ? `${berth.code} — ${berth.name}`
                          : berth.name}
                      </div>

                      {berth.terminal && <div>Terminal: {berth.terminal}</div>}

                      <div>Status: {BERTH_STATUS_LABELS[berth.status]}</div>

                      {berth.occupancySource === "ais" && (
                        <>
                          <div>
                            Vessel: {berth.vesselName || "Unknown vessel"}
                          </div>

                          {berth.vesselMmsi && (
                            <div>MMSI: {berth.vesselMmsi}</div>
                          )}

                          {berth.vesselDistance !== null && (
                            <div>
                              {Math.round(berth.vesselDistance)} m from berth
                              point
                            </div>
                          )}

                          <div>Detected by AIS</div>
                        </>
                      )}

                      {berth.occupancySource === "manual" && (
                        <div>Occupied manually, no AIS vessel detected</div>
                      )}

                      {berth.status === "available" &&
                        berth.aisMatching &&
                        !berth.occupancySource && (
                          <div>No moored vessel with a recent AIS position</div>
                        )}

                      {!berth.aisMatching && (
                        <>
                          <div>Live AIS matching unavailable</div>
                          <div>Showing the configured status</div>
                        </>
                      )}
                    </div>
                  </Tooltip>
                </Marker>
              ))}

            {/* =================================================
                GATES / TRUCKS (draggable, saved; double-click adds one)
                ================================================= */}

            {showGates &&
              gatePositions.map((gate) => (
                <Marker
                  key={gate.id}
                  position={gate.position}
                  icon={gateIcon}
                  draggable={true}
                  eventHandlers={{
                    ...(gate.extra
                      ? {
                          contextmenu: () =>
                            setGatePositions((current) =>
                              current.filter((item) => item.id !== gate.id)
                            ),
                        }
                      : {}),
                    dblclick: (event) => {
                      const point = event.target.getLatLng();

                      setGatePositions((current) => [
                        ...current,
                        {
                          id: newItemId(),
                          name: `Gate ${current.length + 1}`,
                          extra: true,
                          position: nearbyPosition(point),
                        },
                      ]);
                    },
                    dragend: (event) => {
                      const point = event.target.getLatLng();

                      setGatePositions((current) =>
                        current.map((item) =>
                          item.id === gate.id
                            ? { ...item, position: [point.lat, point.lng] }
                            : item
                        )
                      );
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -18]}>
                    <div className="font-bold">{gate.name}</div>
                    <div>Drag to move · double-click to add another</div>
                    {gate.extra && <div>Right-click to remove</div>}
                  </Tooltip>
                </Marker>
              ))}

            {/* =================================================
                INCIDENTS (from the database, not draggable)

                One icon per type, ring colour = severity.
                ================================================= */}

            {showIncidents &&
              visibleIncidents.map((incident) => (
                <Marker
                  key={`incident-${incident.id}`}
                  position={incident.position}
                  icon={getIncidentIcon(incident.type, incident.severity)}
                  zIndexOffset={1800 + (SEVERITY_RANK[incident.severity] || 0) * 10}
                >
                  <Tooltip direction="top" offset={[0, -18]}>
                    <div className="max-w-[240px] whitespace-normal">
                      <div className="font-bold">
                        {incident.number} · {incident.severity}
                      </div>
                      <div>{incident.type}</div>
                      <div>At: {incident.location}</div>
                      {incident.vessel && <div>Vessel: {incident.vessel}</div>}
                      <div>Status: {incident.status}</div>
                      {incident.description && (
                        <div>{shortText(incident.description, 120)}</div>
                      )}
                      <div>
                        {incident.reportedBy
                          ? `Reported by ${incident.reportedBy}, `
                          : ""}
                        {formatPortTime(incident.occurredAt)}
                      </div>
                      {incident.note && (
                        <div className="italic">{incident.note}</div>
                      )}
                    </div>
                  </Tooltip>
                </Marker>
              ))}

            {reportSpot && (
              <Marker
                position={reportSpot}
                icon={pendingIncidentIcon}
                zIndexOffset={1900}
              />
            )}
          </MapContainer>

          {/* ===================================================
              AIS LAST UPDATE
              =================================================== */}

          <div className="absolute bottom-5 right-5 z-[1000] mr-[110px] hidden rounded-xl bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:bg-navy-800/95">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    aisError
                      ? "bg-red-500"
                      : aisLoading
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                />
              </span>

              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {aisError
                    ? "AIS unavailable"
                    : aisLoading
                    ? "Loading AIS..."
                    : "AIS data active"}
                </p>

                {lastAisRefresh && (
                  <p className="text-[10px] text-gray-400">
                    Updated{" "}
                    {lastAisRefresh.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================
            SHIP LIST
            =================================================== */}

        <div
          className={`flex w-full flex-none flex-col rounded-[20px] bg-white p-4 shadow-sm dark:bg-navy-800 ${
            mapExpanded ? "h-[420px]" : "h-[480px] xl:h-[700px] xl:w-[320px]"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <p className="text-base font-bold text-navy-700 dark:text-white">
              Ships in port
            </p>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {listVessels.length} of {vesselViews.length}
            </p>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, MMSI or berth"
            className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-navy-700 outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            {aisLoading && (
              <p className="px-1 py-4 text-sm text-gray-500 dark:text-gray-400">
                Loading ships…
              </p>
            )}

            {!aisLoading && listVessels.length === 0 && (
              <p className="px-1 py-4 text-sm text-gray-500 dark:text-gray-400">
                {vesselViews.length === 0
                  ? "No ships are moored or at anchor."
                  : "No ships match the current search and layer switches."}
              </p>
            )}

            <div
              className={
                mapExpanded
                  ? "grid grid-cols-1 gap-x-3 md:grid-cols-2 xl:grid-cols-3"
                  : ""
              }
            >
              {listVessels.slice(0, LIST_LIMIT).map((vessel) => {
                const berth = vessel.mmsi
                  ? berthByMmsi.get(vessel.mmsi)
                  : undefined;

                return (
                  <button
                    key={`row-${vessel.id}`}
                    type="button"
                    onClick={() => {
                      handleSelectVessel(vessel);

                      /* In full size the list is below the map, so
                         bring the map back into view. */
                      if (mapExpanded && mapCardRef.current) {
                        mapCardRef.current.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-gray-100 dark:hover:bg-white/10 ${
                      vessel.id === selectedId
                        ? "bg-indigo-50 dark:bg-white/10"
                        : ""
                    }`}
                  >
                    <SymbolBadge
                      portState={vessel.portState}
                      size={24}
                      faded={vessel.stale}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-700 dark:text-white">
                        {vessel.name}
                      </span>

                      <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                        {PORT_STATE_LABELS[vessel.portState]}
                        {berth ? ` · ${berth.code || berth.name}` : ""} ·{" "}
                        {formatAge(vessel.ageMinutes)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {listVessels.length > LIST_LIMIT && (
              <p className="px-1 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                Showing the first {LIST_LIMIT} of {listVessels.length}. Use
                search to narrow the list.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
        Ship positions are the last AIS positions saved in the database, not a
        live feed. Berths come from Berth Management. Incidents are all open
        incidents of the incident register, whichever page they were reported
        from: an incident with a map spot is drawn there; otherwise it is
        drawn at the berth or gate named in its location when that is known.
        Gate markers and spots placed by hand are saved in this browser.
      </p>

      {/* ===================================================
          MESSAGE AFTER REPORTING / PLACING
          =================================================== */}

      {mapMessage && (
        <BodyPortal>
          <div
            role="status"
            data-testid="map-message"
            className="fixed bottom-6 left-1/2 z-[3200] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl bg-navy-700 px-4 py-3 text-sm font-semibold text-white shadow-xl"
          >
            {mapMessage}
          </div>
        </BodyPortal>
      )}

      {/* ===================================================
          NOT PLACED ON MAP WINDOW
          =================================================== */}

      {showUnplaced && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/50 p-4"
            data-testid="unplaced-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowUnplaced(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Incidents not placed on the map"
              data-testid="unplaced-dialog"
              className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-navy-800"
            >
              <h3 className="text-base font-bold text-navy-700 dark:text-white">
                Not placed on map ({unplacedIncidents.length})
              </h3>

              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                These open incidents have no map spot, and their location does
                not match a berth with coordinates or a gate marker. Choose
                &ldquo;Place on map&rdquo; and click the spot. All incidents
                with the same location words are placed together. A spot
                placed here is saved in this browser only; other accounts do
                not see it. To give an incident an exact spot for everybody,
                pick the spot when reporting it (right-click on this map, or
                &ldquo;Pick spot on map&rdquo; in Incident Management).
              </p>

              {unplacedGroups.length === 0 && (
                <p className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-600 dark:bg-green-500/10 dark:text-green-300">
                  Every open incident is on the map.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2">
                {unplacedGroups.map((group) => (
                  <div
                    key={group.key}
                    data-testid="unplaced-group"
                    className="rounded-xl border border-gray-200 p-3 dark:border-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                          {group.label}
                        </p>

                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {group.incidents.length} incident
                          {group.incidents.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => startPlacing(group)}
                        data-testid="place-button"
                        className="flex-shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600"
                      >
                        Place on map
                      </button>
                    </div>

                    <div className="mt-2 flex flex-col gap-1">
                      {group.incidents.map((incident) => (
                        <div
                          key={incident.id}
                          className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300"
                        >
                          <IncidentBadge
                            type={incident.type}
                            severity={incident.severity}
                            size={18}
                          />

                          <span className="font-semibold">
                            {incident.number}
                          </span>

                          <span className="truncate">
                            {incident.type} · {incident.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                {savedSpotCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearSavedSpots}
                    data-testid="clear-spots"
                    className="text-xs font-semibold text-red-500 hover:text-red-600"
                  >
                    Remove the {savedSpotCount} spot
                    {savedSpotCount === 1 ? "" : "s"} saved in this browser
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => setShowUnplaced(false)}
                  className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-200 dark:bg-navy-700 dark:text-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}

      {/* ===================================================
          REPORT AN INCIDENT WINDOW
          =================================================== */}

      {reportSpot && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/50 p-4"
            data-testid="report-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeReport();
              }
            }}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-label="Report an incident here"
              data-testid="report-dialog"
              onSubmit={submitReport}
              className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-navy-800"
            >
              <h3 className="text-base font-bold text-navy-700 dark:text-white">
                Report an incident here
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Map spot {reportSpot[0].toFixed(5)},{" "}
                {reportSpot[1].toFixed(5)}. Everyone who can open the map
                will see it, and the people who must know are notified.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-navy-700 dark:text-white">
                  Type
                  <select
                    value={reportForm.type}
                    onChange={(event) => updateReport("type", event.target.value)}
                    data-testid="report-type"
                    className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-sm font-normal text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  >
                    {INCIDENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-navy-700 dark:text-white">
                  Severity
                  <select
                    value={reportForm.severity}
                    onChange={(event) =>
                      updateReport("severity", event.target.value)
                    }
                    data-testid="report-severity"
                    className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-sm font-normal text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  >
                    {INCIDENT_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <IncidentBadge
                  type={reportForm.type}
                  severity={reportForm.severity}
                  size={22}
                />
                This is how it will look on the map.
              </div>

              <label className="mt-3 block text-xs font-semibold text-navy-700 dark:text-white">
                Where (place name)
                <input
                  type="text"
                  value={reportForm.location}
                  maxLength={MAX_INCIDENT_LOCATION}
                  onChange={(event) =>
                    updateReport("location", event.target.value)
                  }
                  placeholder="For example Pasir Panjang Terminal, Berth 4"
                  data-testid="report-location"
                  autoFocus
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                />
              </label>

              <label className="mt-3 block text-xs font-semibold text-navy-700 dark:text-white">
                Vessel (optional)
                <input
                  type="text"
                  value={reportForm.vessel}
                  maxLength={MAX_INCIDENT_VESSEL}
                  onChange={(event) => updateReport("vessel", event.target.value)}
                  data-testid="report-vessel"
                  className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-normal text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                />
              </label>

              <label className="mt-3 block text-xs font-semibold text-navy-700 dark:text-white">
                What happened
                <textarea
                  value={reportForm.description}
                  maxLength={MAX_INCIDENT_TEXT}
                  rows={4}
                  onChange={(event) =>
                    updateReport("description", event.target.value)
                  }
                  data-testid="report-description"
                  className="mt-1 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                />
              </label>

              {reportError && (
                <div
                  role="alert"
                  data-testid="report-error"
                  className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300"
                >
                  {reportError}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReport}
                  disabled={reportSaving}
                  data-testid="report-cancel"
                  className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={reportSaving}
                  data-testid="report-submit"
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {reportSaving ? "Saving…" : "Report incident"}
                </button>
              </div>
            </form>
          </div>
        </BodyPortal>
      )}
    </div>
  );
};

export default PortMap;
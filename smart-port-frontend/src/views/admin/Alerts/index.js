import React from "react";

import { createPortal } from "react-dom";

import { Link } from "react-router-dom";

import {
  MdAdd,
  MdSearch,
  MdWarning,
  MdError,
  MdInfo,
  MdCheckCircle,
  MdClose,
  MdRefresh,
  MdDirectionsBoat,
  MdBuild,
  MdSecurity,
  MdEco,
  MdWhatshot,
  MdLocalHospital,
  MdLocalShipping,
  MdPlace,
} from "react-icons/md";

import { apiGet, apiPost } from "../../../services/api";

import { startPollTimer } from "../../../services/pollTimer";

import authService from "../../../layouts/auth/authService";

import { hasModuleAccess } from "../../../layouts/auth/permissions";

// =========================================================
// PORT ALERTS
// =========================================================
//
// The live board of port alerts. An alert is an incident that a
// port employee posted BY HAND. There is no sample data on this
// page: every alert you see was typed in by a person, and it is
// saved in the database through the backend.
//
//   GET  /incidents         every incident posted so far
//   GET  /incidents/{id}    one incident + its timeline
//   POST /incidents         post a new incident
//
// This is the same register that Incident Management uses, so an
// incident posted here also appears there (and the other way
// round). The board only shows and posts. Changing the status,
// assigning the team and adding notes is done in Incident
// Management.
//
// Who can do what:
//   - Everybody who may open this page can see the alerts.
//   - Posting needs the "Incident Management" permission.
//
// The page refreshes itself every 30 seconds, so an incident
// posted by a colleague appears without reloading.
//
// All times are shown in Singapore time (SGT).
//
// =========================================================

// =========================================================
// SETTINGS
// =========================================================

// These lists are the same as in the backend
// (app/services/incident_service.py).
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

const SEVERITIES = ["Critical", "High", "Medium", "Low"];

const SEVERITY_ORDER = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const OPEN_STATUSES = [
  "Reported",
  "Under Investigation",
  "Action Required",
];

const FINISHED_STATUSES = ["Resolved", "Closed"];

const REFRESH_MS = 30000;

const PAGE_SIZE = 10;

const MAX_LOCATION = 120;

const MAX_VESSEL = 120;

const MAX_TEXT = 4000;

const SNIPPET_LENGTH = 140;

// Singapore does not change its clocks: it is always 8 hours
// ahead of UTC. So the Singapore time is worked out with a plain
// addition, which gives the same answer in every browser and on
// every computer, wherever the person is sitting.
const SINGAPORE_OFFSET_HOURS = 8;

const SINGAPORE_OFFSET_MS = SINGAPORE_OFFSET_HOURS * 60 * 60 * 1000;

// The time an incident happened may be a few minutes ahead of the
// clock of the server (computers differ a little).
const FUTURE_SLACK_MS = 5 * 60 * 1000;

const severityClasses = {
  Critical: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  High: "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Medium: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400",
  Low: "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
};

const severityIconClasses = {
  Critical: "bg-red-50 text-red-500 dark:bg-red-500/10",
  High: "bg-orange-50 text-orange-500 dark:bg-orange-500/10",
  Medium: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10",
  Low: "bg-green-50 text-green-600 dark:bg-green-500/10",
};

const finishedIconClasses =
  "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-400";

const statusClasses = {
  Reported: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  "Under Investigation":
    "bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  "Action Required":
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Resolved:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  Closed: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const statusBarClasses = {
  Reported: "bg-blue-500",
  "Under Investigation": "bg-purple-500",
  "Action Required": "bg-orange-500",
};

const inputClasses =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const labelClasses =
  "mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white";

const filterClasses =
  "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white";

// =========================================================
// SMALL HELPERS
// =========================================================

const getErrorMessage = (error, fallback) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error?.detail) {
    if (typeof error.detail === "string") {
      return error.detail;
    }

    try {
      return JSON.stringify(error.detail);
    } catch {
      return fallback;
    }
  }

  return fallback;
};

// True when the backend said "you may not do this".
const isDenied = (error) => {
  if (error && (error.status === 403 || error.statusCode === 403)) {
    return true;
  }

  const text = getErrorMessage(error, "");

  return /do not have permission|only .* can/i.test(text);
};

const plural = (count, word) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const shorten = (text, length) => {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > length
    ? `${clean.slice(0, length).trimEnd()}…`
    : clean;
};

const getCurrentUser = () => {
  try {
    return authService.getCurrentUser();
  } catch {
    return null;
  }
};

// The backend may send times without a time zone. Those
// times are UTC, so "Z" is added before reading them.
const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
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

const pad2 = (number) => String(number).padStart(2, "0");

// The year, month, day, hour, minute on the Singapore clock.
const singaporeParts = (date) => {
  const shifted = new Date(date.getTime() + SINGAPORE_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
};

// 04 Sep 2026
const formatDate = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  const parts = singaporeParts(date);

  return `${pad2(parts.day)} ${MONTHS[parts.month - 1]} ${parts.year}`;
};

// 08:42 AM
const formatTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  const parts = singaporeParts(date);

  return `${pad2(parts.hour % 12 === 0 ? 12 : parts.hour % 12)}:${pad2(
    parts.minute
  )} ${parts.hour < 12 ? "AM" : "PM"}`;
};

// 04 Sep 2026 · 08:42 AM
const formatDateTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return `${formatDate(date)} · ${formatTime(date)}`;
};

// A number that is the same for every moment of one Singapore day.
const dayNumber = (date) => {
  const parts = singaporeParts(date);

  return parts.year * 10000 + parts.month * 100 + parts.day;
};

// "10 minutes ago", "3 hours ago" ...
const timeAgo = (value, now) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${plural(minutes, "minute")} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${plural(hours, "hour")} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${plural(days, "day")} ago`;
  }

  return formatDate(date);
};

// The text a "datetime-local" box needs: 2026-09-04T08:42
// (the Singapore time).
const toSingaporeInput = (date) => {
  const parts = singaporeParts(date);

  return (
    `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T` +
    `${pad2(parts.hour)}:${pad2(parts.minute)}`
  );
};

// The other way round: the text of the box -> a real moment.
const fromSingaporeInput = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    return null;
  }

  const date = new Date(
    `${text}:00+${pad2(SINGAPORE_OFFSET_HOURS)}:00`
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const createEmptyForm = () => ({
  type: INCIDENT_TYPES[0],
  location: "",
  severity: "Medium",
  vessel: "",
  description: "",
  occurredAt: toSingaporeInput(new Date()),
});

// =========================================================
// BACKEND DATA -> SCREEN DATA
// =========================================================

const normalizePerson = (raw) =>
  raw
    ? {
        id: raw.id === undefined ? null : raw.id,
        name: raw.name || "Unknown",
        role: raw.role || "",
      }
    : null;

const normalizeIncident = (raw) => ({
  id: raw.id,
  number: raw.number || `INC-${raw.id}`,
  type: raw.type || "",
  location: raw.location || "",
  severity: raw.severity || "Medium",
  status: raw.status || "Reported",
  vessel: raw.vessel || "",
  description: raw.description || "",
  reportedBy: normalizePerson(raw.reported_by),
  assignedTo: normalizePerson(raw.assigned_to),
  assignedRole: raw.assigned_role || "",
  occurredAt: raw.occurred_at || raw.created_at || null,
  createdAt: raw.created_at || null,
  updatedAt: raw.updated_at || null,
  resolvedAt: raw.resolved_at || null,
});

const normalizeEvent = (raw) => ({
  id: raw.id,
  type: raw.type || "note",
  actor: normalizePerson(raw.actor),
  oldValue: raw.old_value || "",
  newValue: raw.new_value || "",
  note: raw.note || "",
  createdAt: raw.created_at || null,
});

const isFinished = (incident) =>
  FINISHED_STATUSES.includes(incident.status);

const severityRank = (severity) =>
  Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, severity)
    ? SEVERITY_ORDER[severity]
    : 9;

const timeOf = (incident) => {
  const date = parseDate(incident.occurredAt);

  return date ? date.getTime() : 0;
};

// Open alerts first (the most serious on top, then the newest).
// Resolved and closed ones go to the end (newest first).
const sortAlerts = (list) =>
  [...list].sort((first, second) => {
    const firstDone = isFinished(first) ? 1 : 0;
    const secondDone = isFinished(second) ? 1 : 0;

    if (firstDone !== secondDone) {
      return firstDone - secondDone;
    }

    if (!firstDone) {
      const bySeverity =
        severityRank(first.severity) - severityRank(second.severity);

      if (bySeverity !== 0) {
        return bySeverity;
      }
    }

    const byTime = timeOf(second) - timeOf(first);

    return byTime !== 0 ? byTime : second.id - first.id;
  });

// Who an incident is assigned to, as text: a person, a team or nobody.
const assigneeName = (incident) => {
  if (incident.assignedTo) {
    return incident.assignedTo.name;
  }

  if (incident.assignedRole) {
    return `${incident.assignedRole} team`;
  }

  return "";
};

const isUnassigned = (incident) =>
  !incident.assignedTo && !incident.assignedRole;

const typeIcon = (type) => {
  switch (type) {
    case "Vessel Incident":
      return MdDirectionsBoat;

    case "Equipment Failure":
      return MdBuild;

    case "Gate/Security Incident":
      return MdSecurity;

    case "Environmental Incident":
      return MdEco;

    case "Fire/Safety":
      return MdWhatshot;

    case "Injury / Medical":
      return MdLocalHospital;

    case "Cargo Damage":
      return MdLocalShipping;

    default:
      return MdInfo;
  }
};

const describeEvent = (event) => {
  const who = event.actor ? event.actor.name : "Someone";

  if (event.type === "reported") {
    return `${who} posted the incident.`;
  }

  if (event.type === "status") {
    return `${who} changed the status from ${event.oldValue} to ${event.newValue}.`;
  }

  if (event.type === "assigned") {
    if (event.newValue && event.oldValue) {
      return `${who} reassigned it from ${event.oldValue} to ${event.newValue}.`;
    }

    if (event.newValue) {
      return `${who} assigned it to ${event.newValue}.`;
    }

    return `${who} removed ${event.oldValue} as the assignee.`;
  }

  return `${who} added a note.`;
};

const eventDotClass = (event) => {
  if (event.type === "reported") {
    return "bg-blue-500";
  }

  if (event.type === "status") {
    return FINISHED_STATUSES.includes(event.newValue)
      ? "bg-green-500"
      : "bg-purple-500";
  }

  if (event.type === "assigned") {
    return "bg-orange-500";
  }

  return "bg-gray-400";
};

// =========================================================
// DRAW OUTSIDE THE PAGE FRAME
// =========================================================

// The windows (post, details) and the little message are drawn
// straight in <body>. A page frame (or top bar) with "transform",
// "filter" or "backdrop blur" turns "position: fixed" into
// "relative to that frame", which can push a window out of sight.
// The dark colours and the font of the page are passed on.
const BodyPortal = ({ anchor, children }) => {
  if (typeof document === "undefined") {
    return null;
  }

  const root = anchor ? anchor.current : null;

  const dark = !!(root && root.closest && root.closest(".dark"));

  let font = "";

  try {
    font = root ? window.getComputedStyle(root).fontFamily : "";
  } catch {
    font = "";
  }

  return createPortal(
    <div
      className={dark ? "dark" : undefined}
      style={font ? { fontFamily: font } : undefined}
    >
      {children}
    </div>,
    document.body
  );
};

// =========================================================
// INTERVAL HOOK
// =========================================================

// Keeps running at its normal pace even when this browser tab is in
// the background, so new incidents arrive without switching tabs.
const useInterval = (callback, delay) => {
  const saved = React.useRef(callback);

  saved.current = callback;

  React.useEffect(
    () => startPollTimer(() => saved.current(), delay),
    [delay]
  );
};

// =========================================================
// SMALL PIECES OF THE SCREEN
// =========================================================

const Chip = ({ className, children }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${className}`}
  >
    {children}
  </span>
);

const StatCard = ({ label, value, note, valueClass, iconBox, icon }) => (
  <div className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-400">{label}</p>

        <h2
          className={`mt-2 text-3xl font-bold ${valueClass}`}
          data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value}
        </h2>

        <p className="mt-1 text-xs text-gray-400">{note}</p>
      </div>

      <div
        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconBox}`}
      >
        {icon}
      </div>
    </div>
  </div>
);

const BarRow = ({ label, count, total, barClass }) => {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-navy-700 dark:text-white">
          {label}
        </span>

        <span className="font-bold text-navy-700 dark:text-white">
          {count}
        </span>
      </div>

      <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className={`h-2 rounded-full ${barClass}`}
          style={{ width: count > 0 ? `${Math.max(percent, 4)}%` : "0%" }}
        />
      </div>
    </li>
  );
};

// =========================================================
// MAIN COMPONENT
// =========================================================

const PortAlerts = () => {
  const [incidents, setIncidents] = React.useState([]);
  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState(null);
  const [now, setNow] = React.useState(() => new Date());

  const [scope, setScope] = React.useState("open");
  const [search, setSearch] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState("All");
  const [typeFilter, setTypeFilter] = React.useState("All");
  const [shown, setShown] = React.useState(PAGE_SIZE);

  // Post an incident
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState(createEmptyForm);
  const [formError, setFormError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // One alert open in the details window
  const [detail, setDetail] = React.useState(null);

  const [toast, setToast] = React.useState("");

  // -------------------------------------------------------
  // REFS (latest values for timers)
  // -------------------------------------------------------

  const mountedRef = React.useRef(true);
  const rootRef = React.useRef(null);
  const locationInputRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const toastTimerRef = React.useRef(null);

  const listBusyRef = React.useRef(false);
  const loadedRef = React.useRef(false);

  // Goes up whenever this screen changes the list itself, so an
  // older answer that arrives late never overwrites the newer one.
  const listVersionRef = React.useRef(0);

  const detailIdRef = React.useRef(null);

  // Who is signed in decides whether the "Post" button is shown.
  const user = getCurrentUser();

  const canPost = hasModuleAccess(user, "incidents");

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------
  // MESSAGE AT THE BOTTOM (toast)
  // -------------------------------------------------------

  const showToast = React.useCallback((text) => {
    setToast(text);

    window.clearTimeout(toastTimerRef.current);

    toastTimerRef.current = window.setTimeout(
      () => setToast(""),
      5000
    );
  }, []);

  // -------------------------------------------------------
  // CLOSE THE DETAILS WINDOW
  // -------------------------------------------------------

  const closeDetail = React.useCallback(() => {
    detailIdRef.current = null;

    setDetail(null);
  }, []);

  // -------------------------------------------------------
  // LOAD THE LIST
  // -------------------------------------------------------

  const loadIncidents = React.useCallback(
    async (manual) => {
      if (listBusyRef.current) {
        return;
      }

      listBusyRef.current = true;

      if (manual === true) {
        setRefreshing(true);
      }

      const version = listVersionRef.current;

      try {
        const data = await apiGet("/incidents");

        if (!mountedRef.current) {
          return;
        }

        // Something was changed on this screen while the list was
        // on its way: the next refresh brings the newest list.
        if (version !== listVersionRef.current) {
          return;
        }

        const rows = Array.isArray(data) ? data : data?.incidents;

        const list = Array.isArray(rows)
          ? rows.map(normalizeIncident)
          : [];

        setIncidents(list);

        // The alert in the open window was deleted by someone.
        if (
          detailIdRef.current !== null &&
          !list.some((item) => item.id === detailIdRef.current)
        ) {
          closeDetail();
          showToast("That incident was removed by somebody else.");
        }

        loadedRef.current = true;

        const loadedAt = new Date();

        setNow(loadedAt);
        setLastRefresh(loadedAt);
        setLoadState("ready");
        setLoadError("");
        setConnectionLost(false);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (isDenied(error)) {
          setLoadState("denied");
          setLoadError(
            getErrorMessage(
              error,
              "You do not have permission to see port alerts."
            )
          );
        } else if (!loadedRef.current) {
          setLoadState("error");
          setLoadError(
            getErrorMessage(error, "The alerts could not be loaded.")
          );
        } else {
          setConnectionLost(true);
        }
      } finally {
        listBusyRef.current = false;

        if (mountedRef.current && manual === true) {
          setRefreshing(false);
        }
      }
    },
    [closeDetail, showToast]
  );

  React.useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  // -------------------------------------------------------
  // LOAD ONE ALERT (with its timeline)
  // -------------------------------------------------------

  const loadDetail = React.useCallback(async (id) => {
    try {
      const data = await apiGet(`/incidents/${id}`);

      if (!mountedRef.current || detailIdRef.current !== id) {
        return;
      }

      const events = Array.isArray(data?.events)
        ? data.events.map(normalizeEvent)
        : [];

      setDetail((previous) =>
        previous && previous.incident.id === id
          ? {
              incident: data?.incident
                ? normalizeIncident(data.incident)
                : previous.incident,
              events,
              error: "",
            }
          : previous
      );
    } catch (error) {
      if (!mountedRef.current || detailIdRef.current !== id) {
        return;
      }

      setDetail((previous) =>
        previous && previous.incident.id === id
          ? {
              ...previous,
              error: getErrorMessage(
                error,
                "The timeline could not be loaded."
              ),
            }
          : previous
      );
    }
  }, []);

  // Every 30 seconds: the clock of "10 minutes ago" moves on and
  // the newest alerts are fetched.
  useInterval(() => {
    setNow(new Date());

    loadIncidents();

    if (detailIdRef.current !== null) {
      loadDetail(detailIdRef.current);
    }
  }, REFRESH_MS);

  // Coming back to this browser tab: fetch the newest alerts at once.
  React.useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        loadIncidents();
      }
    };

    document.addEventListener("visibilitychange", handleVisible);

    return () =>
      document.removeEventListener("visibilitychange", handleVisible);
  }, [loadIncidents]);

  const openDetail = (incident) => {
    detailIdRef.current = incident.id;

    setDetail({ incident, events: null, error: "" });

    loadDetail(incident.id);
  };

  // -------------------------------------------------------
  // POST AN INCIDENT
  // -------------------------------------------------------

  const openForm = () => {
    setForm(createEmptyForm());
    setFormError("");
    setShowForm(true);
  };

  const closeForm = React.useCallback(() => {
    setShowForm(false);
    setFormError("");
  }, []);

  React.useEffect(() => {
    if (showForm && locationInputRef.current) {
      locationInputRef.current.focus();
    }
  }, [showForm]);

  const detailOpen = detail !== null;

  React.useEffect(() => {
    if (detailOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [detailOpen]);

  const handleFormChange = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handlePost = async (event) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const location = form.location.trim();
    const description = form.description.trim();

    if (!location) {
      setFormError("Enter where it happened (for example Berth 2).");

      return;
    }

    if (!description) {
      setFormError("Describe what happened.");

      return;
    }

    let occurredAt = null;

    if (form.occurredAt) {
      const moment = fromSingaporeInput(form.occurredAt);

      if (!moment) {
        setFormError("Enter a valid date and time.");

        return;
      }

      if (moment.getTime() > Date.now() + FUTURE_SLACK_MS) {
        setFormError(
          "The time when it happened cannot be in the future."
        );

        return;
      }

      occurredAt = moment.toISOString();
    }

    setSubmitting(true);
    setFormError("");

    try {
      const data = await apiPost("/incidents", {
        type: form.type,
        location,
        severity: form.severity,
        vessel: form.vessel.trim() || null,
        description,
        occurred_at: occurredAt,
      });

      if (!mountedRef.current) {
        return;
      }

      const incident = normalizeIncident(data.incident);

      listVersionRef.current += 1;

      setIncidents((previous) => [
        incident,
        ...previous.filter((item) => item.id !== incident.id),
      ]);

      loadedRef.current = true;

      setLoadState("ready");
      setLoadError("");
      setNow(new Date());

      // Show the new alert: nothing may hide it.
      setScope("open");
      setSearch("");
      setSeverityFilter("All");
      setTypeFilter("All");

      setShowForm(false);
      setForm(createEmptyForm());

      showToast(`${incident.number} has been posted.`);
    } catch (error) {
      if (mountedRef.current) {
        setFormError(
          getErrorMessage(error, "The incident could not be saved.")
        );
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  // Esc closes the open window (unless it is busy saving).
  React.useEffect(() => {
    if (!showForm && !detailOpen) {
      return undefined;
    }

    const handleKey = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (showForm) {
        if (!submitting) {
          closeForm();
        }
      } else {
        closeDetail();
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => document.removeEventListener("keydown", handleKey);
  }, [showForm, detailOpen, submitting, closeForm, closeDetail]);

  // -------------------------------------------------------
  // WHAT THE SCREEN SHOWS
  // -------------------------------------------------------

  const sorted = React.useMemo(() => sortAlerts(incidents), [incidents]);

  const openList = sorted.filter((item) => !isFinished(item));

  const finishedCount = sorted.length - openList.length;

  const criticalList = openList.filter(
    (item) => item.severity === "Critical"
  );

  const highCount = openList.filter(
    (item) => item.severity === "High"
  ).length;

  const todayNumber = dayNumber(now);

  const postedToday = sorted.filter((item) => {
    const created = parseDate(item.createdAt || item.occurredAt);

    return created ? dayNumber(created) === todayNumber : false;
  }).length;

  const unassignedCount = openList.filter(isUnassigned).length;

  const typeOptions = React.useMemo(() => {
    const seen = incidents
      .map((item) => item.type)
      .filter((item) => item && !INCIDENT_TYPES.includes(item));

    return [...INCIDENT_TYPES, ...Array.from(new Set(seen))];
  }, [incidents]);

  const openByType = typeOptions
    .map((name) => ({
      name,
      count: openList.filter((item) => item.type === name).length,
    }))
    .filter((item) => item.count > 0)
    .sort((first, second) => second.count - first.count);

  const query = search.trim().toLowerCase();

  const filtered = sorted.filter((item) => {
    if (scope === "open" && isFinished(item)) {
      return false;
    }

    if (scope === "resolved" && !isFinished(item)) {
      return false;
    }

    if (severityFilter !== "All" && item.severity !== severityFilter) {
      return false;
    }

    if (typeFilter !== "All" && item.type !== typeFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      item.number,
      item.type,
      item.location,
      item.vessel,
      item.description,
      item.reportedBy ? item.reportedBy.name : "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  const visible = filtered.slice(0, shown);

  const filtersUsed =
    search.trim() !== "" ||
    severityFilter !== "All" ||
    typeFilter !== "All";

  const clearFilters = () => {
    setSearch("");
    setSeverityFilter("All");
    setTypeFilter("All");
    setShown(PAGE_SIZE);
  };

  // Another filter -> start again from the first ten.
  React.useEffect(() => {
    setShown(PAGE_SIZE);
  }, [scope, search, severityFilter, typeFilter]);

  const lastRefreshText = lastRefresh
    ? `${formatTime(lastRefresh)} SGT`
    : "—";

  // -------------------------------------------------------
  // PIECES OF THE BOARD
  // -------------------------------------------------------

  const renderIcon = (item, size) => {
    const Icon = typeIcon(item.type);

    const colour = isFinished(item)
      ? finishedIconClasses
      : severityIconClasses[item.severity] ||
        severityIconClasses.Medium;

    return (
      <div
        className={`flex flex-shrink-0 items-center justify-center rounded-xl ${size} ${colour}`}
      >
        <Icon className="h-5 w-5" />
      </div>
    );
  };

  const renderAlertText = (item) => (
    <div className="min-w-0">
      <p className="font-bold text-navy-700 dark:text-white">
        {item.type || "Incident"}
      </p>

      <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-300">
        <MdPlace className="h-4 w-4 flex-shrink-0 text-gray-400" />

        <span className="break-words">{item.location}</span>
      </p>

      {item.description && (
        <p className="mt-1 max-w-[380px] break-words text-xs leading-5 text-gray-400">
          {shorten(item.description, SNIPPET_LENGTH)}
        </p>
      )}

      <p className="mt-1 text-xs text-gray-400">
        {item.number}

        {item.vessel ? ` · Vessel: ${item.vessel}` : ""}
      </p>
    </div>
  );

  const renderTable = () => (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-white/10">
            {["Alert", "Severity", "Status", "Posted by", "When", "Action"].map(
              (title) => (
                <th
                  key={title}
                  scope="col"
                  className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400"
                >
                  {title}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {visible.map((item) => (
            <tr
              key={item.id}
              data-testid="alert-row"
              className="border-b border-gray-100 transition last:border-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-navy-700"
            >
              <td className="px-4 py-5">
                <div className="flex items-start gap-3">
                  {renderIcon(item, "h-10 w-10")}

                  {renderAlertText(item)}
                </div>
              </td>

              <td className="px-4 py-5">
                <Chip
                  className={
                    severityClasses[item.severity] || severityClasses.Medium
                  }
                >
                  {item.severity}
                </Chip>
              </td>

              <td className="px-4 py-5">
                <Chip
                  className={
                    statusClasses[item.status] || statusClasses.Reported
                  }
                >
                  {item.status}
                </Chip>

                {!isFinished(item) && isUnassigned(item) && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Not assigned yet
                  </p>
                )}
              </td>

              <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                {item.reportedBy ? (
                  <>
                    <p className="font-semibold text-navy-700 dark:text-white">
                      {item.reportedBy.name}
                    </p>

                    {item.reportedBy.role && (
                      <p className="text-xs text-gray-400">
                        {item.reportedBy.role}
                      </p>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>

              <td className="px-4 py-5 text-sm text-gray-500 dark:text-gray-300">
                <p className="font-semibold text-navy-700 dark:text-white">
                  {timeAgo(item.occurredAt, now)}
                </p>

                <p className="text-xs text-gray-400">
                  {formatDateTime(item.occurredAt)}
                </p>
              </td>

              <td className="px-4 py-5">
                <button
                  type="button"
                  onClick={() => openDetail(item)}
                  aria-label={`View details of ${item.number}`}
                  className="text-sm font-bold text-brand-500 transition hover:text-brand-600"
                >
                  View Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCards = () => (
    <ul className="space-y-3 md:hidden">
      {visible.map((item) => (
        <li
          key={item.id}
          data-testid="alert-card"
          className="rounded-2xl border border-gray-100 p-4 dark:border-white/10"
        >
          <div className="flex items-start gap-3">
            {renderIcon(item, "h-10 w-10")}

            {renderAlertText(item)}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip
              className={
                severityClasses[item.severity] || severityClasses.Medium
              }
            >
              {item.severity}
            </Chip>

            <Chip
              className={
                statusClasses[item.status] || statusClasses.Reported
              }
            >
              {item.status}
            </Chip>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 text-xs text-gray-400">
              {item.reportedBy ? `${item.reportedBy.name} · ` : ""}

              {timeAgo(item.occurredAt, now)}
            </p>

            <button
              type="button"
              onClick={() => openDetail(item)}
              aria-label={`View details of ${item.number}`}
              className="flex-shrink-0 text-sm font-bold text-brand-500 transition hover:text-brand-600"
            >
              View Details
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  const postButton = canPost ? (
    <button
      type="button"
      onClick={openForm}
      data-testid="post-button"
      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600"
    >
      <MdAdd className="h-5 w-5" />
      Post an Incident
    </button>
  ) : null;

  // -------------------------------------------------------
  // PAGE: STILL LOADING / FAILED / NOT ALLOWED
  // -------------------------------------------------------

  if (loadState !== "ready") {
    return (
      <div ref={rootRef} className="mt-3">
        <div
          className="rounded-[20px] bg-white p-8 text-center shadow-sm dark:bg-navy-800"
          data-testid={`state-${loadState}`}
        >
          {loadState === "loading" && (
            <>
              <MdRefresh className="mx-auto h-8 w-8 animate-spin text-brand-500" />

              <p className="mt-3 font-bold text-navy-700 dark:text-white">
                Loading port alerts…
              </p>
            </>
          )}

          {loadState === "error" && (
            <>
              <MdError className="mx-auto h-8 w-8 text-red-500" />

              <p className="mt-3 font-bold text-navy-700 dark:text-white">
                The alerts could not be loaded.
              </p>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                {loadError}
              </p>

              <button
                type="button"
                onClick={() => {
                  setLoadState("loading");
                  loadIncidents();
                }}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                Try again
              </button>
            </>
          )}

          {loadState === "denied" && (
            <>
              <MdWarning className="mx-auto h-8 w-8 text-orange-500" />

              <p className="mt-3 font-bold text-navy-700 dark:text-white">
                You do not have permission to see port alerts.
              </p>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                Ask the Port Administrator to switch the Port Alerts
                permission on for your role.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // PAGE
  // -------------------------------------------------------

  const total = sorted.length;

  const scopeTabs = [
    { key: "open", label: "Open", count: openList.length },
    { key: "resolved", label: "Resolved", count: finishedCount },
    { key: "all", label: "All", count: total },
  ];

  return (
    <div ref={rootRef} className="mt-3">
      {/* =====================================================
          CRITICAL BANNER (only while a critical alert is open)
          ===================================================== */}

      {criticalList.length > 0 && (
        <div
          role="alert"
          data-testid="critical-banner"
          className="mb-5 rounded-[20px] border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/10"
        >
          <div className="flex items-center gap-3">
            <MdError className="h-6 w-6 flex-shrink-0 text-red-500" />

            <p className="font-bold text-red-600 dark:text-red-400">
              {criticalList.length === 1
                ? "1 critical incident needs attention now"
                : `${criticalList.length} critical incidents need attention now`}
            </p>
          </div>

          <ul className="mt-3 space-y-2">
            {criticalList.slice(0, 3).map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="min-w-0 break-words text-sm text-gray-600 dark:text-gray-200">
                  <span className="font-bold">{item.number}</span>
                  {" · "}
                  {item.type} · {item.location} ·{" "}
                  {timeAgo(item.occurredAt, now)}
                </p>

                <button
                  type="button"
                  onClick={() => openDetail(item)}
                  aria-label={`View details of ${item.number}`}
                  className="w-fit text-sm font-bold text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  View
                </button>
              </li>
            ))}
          </ul>

          {criticalList.length > 3 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
              and {criticalList.length - 3} more in the list below
            </p>
          )}
        </div>
      )}

      {/* =====================================================
          SUMMARY CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open Alerts"
          value={openList.length}
          note={`${total} posted in all`}
          valueClass="text-navy-700 dark:text-white"
          iconBox="bg-lightPrimary text-brand-500 dark:bg-navy-900"
          icon={<MdWarning className="h-6 w-6" />}
        />

        <StatCard
          label="Critical"
          value={criticalList.length}
          note="still open"
          valueClass="text-red-500"
          iconBox="bg-red-50 text-red-500 dark:bg-red-500/10"
          icon={<MdError className="h-6 w-6" />}
        />

        <StatCard
          label="High"
          value={highCount}
          note="still open"
          valueClass="text-orange-500"
          iconBox="bg-orange-50 text-orange-500 dark:bg-orange-500/10"
          icon={<MdWarning className="h-6 w-6" />}
        />

        <StatCard
          label="Posted Today"
          value={postedToday}
          note={`Singapore date: ${formatDate(now)}`}
          valueClass="text-blue-500"
          iconBox="bg-blue-50 text-blue-500 dark:bg-blue-500/10"
          icon={<MdInfo className="h-6 w-6" />}
        />
      </div>

      {/* =====================================================
          ALERT OVERVIEW (only when something has been posted)
          ===================================================== */}

      {total > 0 && (
        <div
          className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800"
          data-testid="overview"
        >
          <h2 className="text-xl font-bold text-navy-700 dark:text-white">
            Alert Overview
          </h2>

          <p className="mt-1 text-sm text-gray-400">
            Worked out from the open alerts posted by port employees
          </p>

          {openList.length === 0 ? (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-green-50 p-5 dark:bg-green-500/10">
              <MdCheckCircle className="h-6 w-6 flex-shrink-0 text-green-500" />

              <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                Nothing is open. All {plural(total, "posted incident")}{" "}
                {total === 1 ? "is" : "are"} resolved or closed.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                  By status
                </h3>

                <ul className="mt-4 space-y-4">
                  {OPEN_STATUSES.map((name) => (
                    <BarRow
                      key={name}
                      label={name}
                      count={
                        openList.filter((item) => item.status === name)
                          .length
                      }
                      total={openList.length}
                      barClass={statusBarClasses[name]}
                    />
                  ))}
                </ul>

                <p
                  className="mt-4 text-sm text-gray-500 dark:text-gray-300"
                  data-testid="unassigned-note"
                >
                  {unassignedCount === 0
                    ? "Every open alert has somebody assigned."
                    : `${plural(unassignedCount, "open alert")} ${
                        unassignedCount === 1 ? "has" : "have"
                      } nobody assigned yet.`}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400">
                  By type
                </h3>

                <ul className="mt-4 space-y-4">
                  {openByType.map((item) => (
                    <BarRow
                      key={item.name}
                      label={item.name}
                      count={item.count}
                      total={openList.length}
                      barClass="bg-brand-500"
                    />
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================
          ALERTS BOARD
          ===================================================== */}

      <div className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-navy-800">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Alerts Board
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Incidents posted by port employees. New ones appear here
              automatically.
            </p>

            {!canPost && (
              <p
                className="mt-1 text-xs text-gray-400"
                data-testid="cannot-post-note"
              >
                You can view the alerts. Posting an incident needs the
                Incident Management permission.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="text-xs text-gray-400"
              data-testid="last-refresh"
            >
              Last refresh: {lastRefreshText}
            </span>

            <button
              type="button"
              onClick={() => loadIncidents(true)}
              disabled={refreshing}
              title="Refresh alerts"
              aria-label="Refresh alerts"
              data-testid="refresh-button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-gray-600 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-navy-900 dark:text-white dark:hover:bg-navy-700"
            >
              <MdRefresh
                className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>

            {postButton}
          </div>
        </div>

        {connectionLost && (
          <div
            role="status"
            data-testid="connection-note"
            className="mt-4 rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
          >
            The newest alerts could not be loaded. The list below is
            from {lastRefreshText}. It will try again by itself.
          </div>
        )}

        {/* FILTERS */}

        {total > 0 && (
          <div className="mt-6 space-y-3">
            <div
              className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-lightPrimary p-1 dark:bg-navy-900"
              role="group"
              aria-label="Which alerts to show"
            >
              {scopeTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setScope(tab.key)}
                  aria-pressed={scope === tab.key}
                  data-testid={`scope-${tab.key}`}
                  className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                    scope === tab.key
                      ? "bg-white text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white"
                      : "text-gray-500 hover:text-navy-700 dark:text-gray-300 dark:hover:text-white"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative md:w-72">
                <MdSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search alerts…"
                  aria-label="Search alerts"
                  data-testid="search-input"
                  className={`${filterClasses} w-full pl-10`}
                />
              </div>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                aria-label="Filter by severity"
                data-testid="severity-filter"
                className={filterClasses}
              >
                <option value="All">All severities</option>

                {SEVERITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by type"
                data-testid="type-filter"
                className={filterClasses}
              >
                <option value="All">All types</option>

                {typeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              {filtersUsed && (
                <button
                  type="button"
                  onClick={clearFilters}
                  data-testid="clear-filters"
                  className="w-fit text-sm font-bold text-brand-500 hover:text-brand-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* LIST */}

        <div className="mt-6">
          {total === 0 && (
            <div
              className="rounded-xl bg-lightPrimary p-8 text-center dark:bg-navy-900"
              data-testid="empty-register"
            >
              <MdInfo className="mx-auto h-8 w-8 text-brand-500" />

              <p className="mt-3 font-bold text-navy-700 dark:text-white">
                No incidents have been posted yet.
              </p>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-300">
                When a port employee posts an incident, it appears here
                for everybody who can open this page.
              </p>
            </div>
          )}

          {total > 0 && filtered.length === 0 && (
            <div
              className="rounded-xl bg-lightPrimary p-8 text-center dark:bg-navy-900"
              data-testid="empty-filtered"
            >
              {scope === "open" && !filtersUsed ? (
                <>
                  <MdCheckCircle className="mx-auto h-8 w-8 text-green-500" />

                  <p className="mt-3 font-bold text-navy-700 dark:text-white">
                    No open alerts right now.
                  </p>

                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                    All {plural(total, "posted incident")}{" "}
                    {total === 1 ? "is" : "are"} resolved or closed.
                  </p>
                </>
              ) : (
                <>
                  <MdSearch className="mx-auto h-8 w-8 text-gray-400" />

                  <p className="mt-3 font-bold text-navy-700 dark:text-white">
                    No alerts match what you chose.
                  </p>

                  {filtersUsed && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-3 text-sm font-bold text-brand-500 hover:text-brand-600"
                    >
                      Clear filters
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {visible.length > 0 && (
            <>
              {renderTable()}

              {renderCards()}

              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p
                  className="text-xs text-gray-400"
                  data-testid="showing-note"
                >
                  Showing {visible.length} of {filtered.length}
                </p>

                {filtered.length > visible.length && (
                  <button
                    type="button"
                    onClick={() => setShown((count) => count + PAGE_SIZE)}
                    data-testid="show-more"
                    className="rounded-xl bg-lightPrimary px-5 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 dark:bg-navy-900 dark:text-white dark:hover:bg-navy-700"
                  >
                    Show {Math.min(PAGE_SIZE, filtered.length - visible.length)}{" "}
                    more
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* =====================================================
          POST AN INCIDENT WINDOW
          ===================================================== */}

      {showForm && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="post-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget && !submitting) {
                closeForm();
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Post an Incident"
              data-testid="post-dialog"
              className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    Post an Incident
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Tell the port what happened. Your name is saved as
                    the person who posted it.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  aria-label="Close"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10"
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handlePost} noValidate className="space-y-4">
                <div>
                  <label htmlFor="alert-type" className={labelClasses}>
                    Incident Type
                  </label>

                  <select
                    id="alert-type"
                    value={form.type}
                    disabled={submitting}
                    onChange={(e) =>
                      handleFormChange("type", e.target.value)
                    }
                    className={inputClasses}
                  >
                    {INCIDENT_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="alert-location" className={labelClasses}>
                    Location
                  </label>

                  <input
                    id="alert-location"
                    ref={locationInputRef}
                    type="text"
                    value={form.location}
                    maxLength={MAX_LOCATION}
                    disabled={submitting}
                    onChange={(e) =>
                      handleFormChange("location", e.target.value)
                    }
                    placeholder="e.g. Berth 2"
                    className={inputClasses}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="alert-severity" className={labelClasses}>
                      Severity
                    </label>

                    <select
                      id="alert-severity"
                      value={form.severity}
                      disabled={submitting}
                      onChange={(e) =>
                        handleFormChange("severity", e.target.value)
                      }
                      className={inputClasses}
                    >
                      {SEVERITIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="alert-vessel" className={labelClasses}>
                      Vessel
                    </label>

                    <input
                      id="alert-vessel"
                      type="text"
                      value={form.vessel}
                      maxLength={MAX_VESSEL}
                      disabled={submitting}
                      onChange={(e) =>
                        handleFormChange("vessel", e.target.value)
                      }
                      placeholder="Optional"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="alert-time" className={labelClasses}>
                    When did it happen? (Singapore time)
                  </label>

                  <input
                    id="alert-time"
                    type="datetime-local"
                    value={form.occurredAt}
                    max={toSingaporeInput(new Date())}
                    disabled={submitting}
                    onChange={(e) =>
                      handleFormChange("occurredAt", e.target.value)
                    }
                    className={`${inputClasses} dark:[color-scheme:dark]`}
                  />
                </div>

                <div>
                  <label htmlFor="alert-description" className={labelClasses}>
                    Description
                  </label>

                  <textarea
                    id="alert-description"
                    value={form.description}
                    maxLength={MAX_TEXT}
                    disabled={submitting}
                    onChange={(e) =>
                      handleFormChange("description", e.target.value)
                    }
                    placeholder="Describe what happened…"
                    rows="4"
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  Everybody who can open Incident Management gets a bell
                  message. A Critical incident is sent to every active
                  account.
                </p>

                {formError && (
                  <div
                    role="alert"
                    data-testid="form-error"
                    className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
                  >
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="submit-incident"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && (
                    <MdRefresh className="h-4 w-4 animate-spin" />
                  )}

                  {submitting ? "Saving…" : "Post Incident"}
                </button>
              </form>
            </div>
          </div>
        </BodyPortal>
      )}

      {/* =====================================================
          ALERT DETAILS WINDOW (read only)
          ===================================================== */}

      {detail && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="detail-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeDetail();
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Details of ${detail.incident.number}`}
              data-testid="detail-dialog"
              className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {renderIcon(detail.incident, "h-11 w-11")}

                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-bold text-navy-700 dark:text-white">
                      {detail.incident.type || "Incident"}
                    </h2>

                    <p className="mt-0.5 text-xs text-gray-500">
                      {detail.incident.number}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  ref={closeButtonRef}
                  onClick={closeDetail}
                  aria-label="Close"
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Chip
                  className={
                    severityClasses[detail.incident.severity] ||
                    severityClasses.Medium
                  }
                >
                  {detail.incident.severity}
                </Chip>

                <Chip
                  className={
                    statusClasses[detail.incident.status] ||
                    statusClasses.Reported
                  }
                >
                  {detail.incident.status}
                </Chip>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Location
                  </dt>

                  <dd className="mt-1 break-words text-sm text-navy-700 dark:text-white">
                    {detail.incident.location || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Vessel
                  </dt>

                  <dd className="mt-1 break-words text-sm text-navy-700 dark:text-white">
                    {detail.incident.vessel || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Happened (SGT)
                  </dt>

                  <dd className="mt-1 text-sm text-navy-700 dark:text-white">
                    {formatDateTime(detail.incident.occurredAt)}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Posted by
                  </dt>

                  <dd className="mt-1 text-sm text-navy-700 dark:text-white">
                    {detail.incident.reportedBy
                      ? detail.incident.reportedBy.name
                      : "—"}

                    {detail.incident.reportedBy &&
                      detail.incident.reportedBy.role && (
                        <span className="text-gray-400">
                          {" "}
                          · {detail.incident.reportedBy.role}
                        </span>
                      )}

                    {detail.incident.createdAt && (
                      <span className="block text-xs text-gray-400">
                        {formatDateTime(detail.incident.createdAt)} SGT
                      </span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Assigned to
                  </dt>

                  <dd className="mt-1 break-words text-sm text-navy-700 dark:text-white">
                    {assigneeName(detail.incident) || "Nobody yet"}
                  </dd>
                </div>

                {detail.incident.resolvedAt && (
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Resolved (SGT)
                    </dt>

                    <dd className="mt-1 text-sm text-navy-700 dark:text-white">
                      {formatDateTime(detail.incident.resolvedAt)}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Description
                </p>

                <p
                  className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-lightPrimary p-3 text-sm text-navy-700 dark:bg-navy-900 dark:text-white"
                  data-testid="detail-description"
                >
                  {detail.incident.description || "—"}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Timeline
                </p>

                {detail.error && (
                  <p
                    role="alert"
                    className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
                  >
                    {detail.error}
                  </p>
                )}

                {!detail.error && detail.events === null && (
                  <p className="mt-2 text-sm text-gray-400">
                    Loading the timeline…
                  </p>
                )}

                {detail.events !== null && detail.events.length === 0 && (
                  <p className="mt-2 text-sm text-gray-400">
                    Nothing has happened yet.
                  </p>
                )}

                {detail.events !== null && detail.events.length > 0 && (
                  <ol
                    className="mt-3 space-y-4"
                    data-testid="timeline"
                  >
                    {detail.events.map((item) => (
                      <li key={item.id} className="flex gap-3">
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${eventDotClass(
                            item
                          )}`}
                        />

                        <div className="min-w-0">
                          <p className="break-words text-sm text-navy-700 dark:text-white">
                            {describeEvent(item)}
                          </p>

                          {item.note && (
                            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-lightPrimary px-3 py-2 text-sm text-gray-600 dark:bg-navy-900 dark:text-gray-300">
                              {item.note}
                            </p>
                          )}

                          <p className="mt-0.5 text-xs text-gray-400">
                            {formatDateTime(item.createdAt)} SGT
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {canPost ? (
                  <Link
                    to="/admin/incidents"
                    data-testid="manage-link"
                    className="text-sm font-bold text-brand-500 hover:text-brand-600"
                  >
                    Change the status or add a note in Incident
                    Management
                  </Link>
                ) : (
                  <p className="text-xs text-gray-400">
                    The status is changed by the team in Incident
                    Management.
                  </p>
                )}

                <button
                  type="button"
                  onClick={closeDetail}
                  className="h-10 rounded-xl bg-lightPrimary px-5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 dark:bg-navy-900 dark:text-white dark:hover:bg-navy-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}

      {/* =====================================================
          MESSAGE AT THE BOTTOM
          ===================================================== */}

      {toast && (
        <BodyPortal anchor={rootRef}>
          <div
            role="status"
            data-testid="toast"
            className="fixed bottom-6 right-6 z-[3200] max-w-sm rounded-xl bg-navy-700 px-4 py-3 text-sm font-semibold text-white shadow-2xl"
          >
            {toast}
          </div>
        </BodyPortal>
      )}
    </div>
  );
};

export default PortAlerts;
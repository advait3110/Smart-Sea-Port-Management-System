import React from "react";

import { createPortal } from "react-dom";

import {
  MdAdd,
  MdBuild,
  MdCheckCircle,
  MdClose,
  MdDeleteOutline,
  MdEdit,
  MdElectricBolt,
  MdEngineering,
  MdError,
  MdErrorOutline,
  MdPrecisionManufacturing,
  MdRefresh,
  MdSchedule,
  MdSearch,
  MdWarning,
} from "react-icons/md";

import { apiGet, apiPost, apiDelete } from "../../../services/api";

import { startPollTimer } from "../../../services/pollTimer";

// =========================================================
// ASSET & MAINTENANCE
// =========================================================
//
// The register of port equipment and its maintenance jobs. Port
// employees enter everything by hand; there is no sample data.
// Everything is saved in the database through the backend:
//
//   GET    /assets                                  every asset + the
//                                                   numbers and alerts
//   GET    /assets/assignees                        who a job can go to
//   POST   /assets                                  add an asset
//   GET    /assets/{id}                             one asset + its jobs
//                                                   + its history
//   POST   /assets/{id}/edit                        { name, location,
//                                                     serial_number }
//   POST   /assets/{id}/status                      { status, note }
//   POST   /assets/{id}/notes                       { note }
//   POST   /assets/{id}/jobs                        schedule a job
//   POST   /assets/{id}/jobs/{job}/start            { note }
//   POST   /assets/{id}/jobs/{job}/complete         { completed_on, note,
//                                                     next_due_date,
//                                                     return_to_service }
//   POST   /assets/{id}/jobs/{job}/cancel           { note }
//   DELETE /assets/{id}                             Port Administrator only
//
// The page refreshes itself every few seconds, so a change made by
// a colleague appears without reloading.
//
// =========================================================

// =========================================================
// SETTINGS
// =========================================================

// These lists are the same as in the backend
// (app/services/asset_service.py).
const CATEGORIES = [
  "Crane",
  "Forklift",
  "Truck",
  "Generator",
  "Pump",
  "Weighbridge",
  "Other Equipment",
];

const CATEGORY_PLURALS = {
  Crane: "Cranes",
  Forklift: "Forklifts",
  Truck: "Trucks",
  Generator: "Generators",
  Pump: "Pumps",
  Weighbridge: "Weighbridges",
  "Other Equipment": "Other Equipment",
};

const JOB_TYPES = [
  "Inspection",
  "Preventive Maintenance",
  "Repair",
  "Calibration",
  "Other",
];

const ASSET_STATUS_FILTERS = [
  "Operational",
  "Maintenance",
  "Maintenance Due",
  "Overdue",
  "Out of Service",
];

const REFRESH_MS = 8000;

const MAX_NAME = 120;

const MAX_LOCATION = 120;

const MAX_SERIAL = 80;

const MAX_DESCRIPTION = 2000;

const MAX_NOTE = 2000;

// Jobs shown in the details window before "Show all".
const JOBS_SHOWN = 8;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const assetStatusClasses = {
  Operational:
    "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  Maintenance:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  "Maintenance Due":
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  Overdue:
    "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  "Out of Service":
    "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300",
};

const jobStatusClasses = {
  Scheduled:
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  "In Progress":
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Completed:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  Cancelled: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const inputClasses =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const textareaClasses =
  "w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const labelClasses =
  "mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white";

const primaryButtonClasses =
  "flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

const quietButtonClasses =
  "h-10 rounded-xl bg-gray-100 px-4 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600";

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

// The backend may send times without a time zone. Those
// times are UTC, so "Z" is added before reading them.
const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
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

// 04 Sep 2026 from a plain date such as 2026-09-04 (no time zone
// is involved, so the day never shifts).
const formatDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));

  if (!match) {
    return "—";
  }

  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return "—";
  }

  return `${match[3]} ${MONTHS[month - 1]} ${match[1]}`;
};

// 04 Sep 2026 from a moment in time (shown in the local time zone)
const formatDate = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return `${pad2(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

// 08:42 AM
const formatTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  const hours = date.getHours();

  return `${pad2(hours % 12 === 0 ? 12 : hours % 12)}:${pad2(
    date.getMinutes()
  )} ${hours < 12 ? "AM" : "PM"}`;
};

const formatDateTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return `${formatDate(date)} · ${formatTime(date)}`;
};

// The text a "date" box needs: 2026-09-04
const toDateInput = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;

// A date box may not be more than a day ahead (the server clock is
// in Singapore, which can be ahead of this computer).
const latestDateInput = () => toDateInput(new Date(Date.now() + ONE_DAY_MS));

const daysWord = (count) => (count === 1 ? "1 day" : `${count} days`);

const percentOf = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

const createEmptyAssetForm = () => ({
  mode: "add",
  id: null,
  code: "",
  category: CATEGORIES[0],
  name: "",
  location: "",
  serial: "",
  lastMaintenance: "",
  nextMaintenance: "",
});

const createEmptySchedule = () => ({
  type: JOB_TYPES[0],
  dueDate: "",
  assignee: "",
  description: "",
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

const normalizeAsset = (raw) => ({
  id: raw.id,
  code: raw.code || `AST-${raw.id}`,
  name: raw.name || "",
  category: raw.category || "",
  location: raw.location || "",
  serialNumber: raw.serial_number || "",
  manualStatus: raw.manual_status || "Operational",
  status: raw.status || "Operational",
  lastMaintenance: raw.last_maintenance || null,
  nextMaintenance: raw.next_maintenance || null,
  nextOverdue: !!raw.next_maintenance_overdue,
  openJobs: Number(raw.open_jobs) || 0,
  statusChangedAt: raw.status_changed_at || null,
  createdBy: normalizePerson(raw.created_by),
  createdAt: raw.created_at || null,
  updatedAt: raw.updated_at || null,
  canDelete: !!raw.can_delete,
});

const normalizeJob = (raw) => ({
  id: raw.id,
  number: raw.number || `MNT-${raw.id}`,
  assetId: raw.asset_id,
  type: raw.type || "",
  description: raw.description || "",
  status: raw.status || "Scheduled",
  overdue: !!raw.overdue,
  daysOverdue: Number(raw.days_overdue) || 0,
  dueDate: raw.due_date || null,
  startedAt: raw.started_at || null,
  completedOn: raw.completed_on || null,
  assignedTo: normalizePerson(raw.assigned_to),
  createdBy: normalizePerson(raw.created_by),
  createdAt: raw.created_at || null,
});

const normalizeEvent = (raw) => ({
  id: raw.id,
  jobId: raw.job_id === undefined ? null : raw.job_id,
  type: raw.type || "note",
  actor: normalizePerson(raw.actor),
  oldValue: raw.old_value || "",
  newValue: raw.new_value || "",
  note: raw.note || "",
  createdAt: raw.created_at || null,
});

const normalizeAlert = (raw) => ({
  key: raw.key || `${raw.asset_id}-${raw.job_id}-${raw.title}`,
  type: raw.type || "info",
  assetId: raw.asset_id === undefined ? null : raw.asset_id,
  jobId: raw.job_id === undefined ? null : raw.job_id,
  title: raw.title || "",
  message: raw.message || "",
});

const EMPTY_SUMMARY = {
  total: 0,
  operational: 0,
  maintenance: 0,
  attention: 0,
  categories: [],
  jobs: { scheduled: 0, inProgress: 0, completed: 0, overdue: 0 },
};

const normalizeSummary = (raw) => {
  if (!raw) {
    return EMPTY_SUMMARY;
  }

  const jobs = raw.jobs || {};

  return {
    total: Number(raw.total) || 0,
    operational: Number(raw.operational) || 0,
    maintenance: Number(raw.maintenance) || 0,
    attention: Number(raw.attention) || 0,
    categories: Array.isArray(raw.categories)
      ? raw.categories.map((item) => ({
          category: item.category,
          count: Number(item.count) || 0,
        }))
      : [],
    jobs: {
      scheduled: Number(jobs.scheduled) || 0,
      inProgress: Number(jobs.in_progress) || 0,
      completed: Number(jobs.completed) || 0,
      overdue: Number(jobs.overdue) || 0,
    },
  };
};

// In the order of the Asset ID (CRN-001, CRN-002, FLT-001 ...).
const sortAssets = (list) =>
  [...list].sort((first, second) =>
    first.code.localeCompare(second.code, undefined, { numeric: true })
  );

const isOpenJob = (job) =>
  job.status === "Scheduled" || job.status === "In Progress";

// Jobs that still have to be done first (the earliest due date at
// the top), then the finished ones (the newest first).
const sortJobs = (list) => {
  const open = list
    .filter(isOpenJob)
    .sort((first, second) =>
      String(first.dueDate).localeCompare(String(second.dueDate))
    );

  const finished = list
    .filter((job) => !isOpenJob(job))
    .sort((first, second) =>
      String(second.dueDate).localeCompare(String(first.dueDate))
    );

  return [...open, ...finished];
};

const describeEvent = (event) => {
  const who = event.actor ? event.actor.name : "Someone";

  if (event.type === "registered") {
    return `${who} added the asset to the register.`;
  }

  if (event.type === "edited") {
    return `${who} changed the details.`;
  }

  if (event.type === "status") {
    return `${who} changed the status from ${event.oldValue} to ${event.newValue}.`;
  }

  if (event.type === "job_scheduled") {
    return `${who} scheduled ${event.newValue}.`;
  }

  if (event.type === "job_started") {
    return `${who} started ${event.newValue}.`;
  }

  if (event.type === "job_completed") {
    return `${who} completed ${event.newValue}.`;
  }

  if (event.type === "job_cancelled") {
    return `${who} cancelled ${event.newValue}.`;
  }

  return `${who} added a note.`;
};

const eventDotClass = (event) => {
  if (event.type === "registered") {
    return "bg-blue-500";
  }

  if (event.type === "status") {
    return event.newValue === "Out of Service"
      ? "bg-red-500"
      : "bg-green-500";
  }

  if (event.type === "job_scheduled") {
    return "bg-purple-500";
  }

  if (event.type === "job_started") {
    return "bg-orange-500";
  }

  if (event.type === "job_completed") {
    return "bg-green-500";
  }

  return "bg-gray-400";
};

// =========================================================
// DRAW OUTSIDE THE PAGE FRAME
// =========================================================

// The windows (add, details) and the little message are drawn
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
// the background, so changes arrive without switching tabs.
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

const Spinner = ({ show }) =>
  show ? <MdRefresh className="h-4 w-4 animate-spin" /> : null;

const KpiCard = ({
  label,
  value,
  note,
  noteClass,
  iconBox,
  icon,
  testId,
  hint,
}) => (
  <div
    className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800"
    title={hint}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
          {label}
        </p>
        <h3
          data-testid={testId}
          className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
        >
          {value}
        </h3>
      </div>

      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBox}`}
      >
        {icon}
      </div>
    </div>

    <p className={`mt-3 text-xs ${noteClass}`}>{note}</p>
  </div>
);

const InfoItem = ({ label, children }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <div className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
      {children}
    </div>
  </div>
);

// =========================================================
// MAIN COMPONENT
// =========================================================

const AssetMaintenance = () => {
  const [assets, setAssets] = React.useState([]);
  const [summary, setSummary] = React.useState(EMPTY_SUMMARY);
  const [alerts, setAlerts] = React.useState([]);
  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);

  const [assignees, setAssignees] = React.useState([]);

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("All");
  const [statusFilter, setStatusFilter] = React.useState("All");

  // Add / edit an asset (null = the window is closed)
  const [assetForm, setAssetForm] = React.useState(null);
  const [formError, setFormError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // One asset open in the details window
  const [detail, setDetail] = React.useState(null);
  const [showAllJobs, setShowAllJobs] = React.useState(false);

  const [schedule, setSchedule] = React.useState(null);

  const [jobPanel, setJobPanel] = React.useState(null);
  const [jobNote, setJobNote] = React.useState("");
  const [jobCompletedOn, setJobCompletedOn] = React.useState("");
  const [jobNextDue, setJobNextDue] = React.useState("");
  const [jobReturn, setJobReturn] = React.useState(false);

  const [statusNote, setStatusNote] = React.useState("");
  const [noteText, setNoteText] = React.useState("");
  const [actionBusy, setActionBusy] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // The "Delete ... for good?" question opened from the table
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const [toast, setToast] = React.useState("");

  // -------------------------------------------------------
  // REFS (latest values for timers)
  // -------------------------------------------------------

  const mountedRef = React.useRef(true);
  const rootRef = React.useRef(null);
  const nameInputRef = React.useRef(null);
  const toastTimerRef = React.useRef(null);

  const listBusyRef = React.useRef(false);
  const loadedRef = React.useRef(false);
  const reloadRef = React.useRef(false);
  const loadAssetsRef = React.useRef(null);

  // Goes up whenever this screen changes the data itself, so an
  // older answer that arrives late never overwrites the newer one.
  const listVersionRef = React.useRef(0);
  const detailVersionRef = React.useRef(0);

  const detailIdRef = React.useRef(null);

  const deleteIdRef = React.useRef(null);
  const deletingRef = React.useRef(false);

  React.useEffect(() => {
    deleteIdRef.current = deleteTarget ? deleteTarget.id : null;
  }, [deleteTarget]);

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
    detailVersionRef.current += 1;

    setDetail(null);
    setShowAllJobs(false);
    setSchedule(null);
    setJobPanel(null);
    setJobNote("");
    setJobCompletedOn("");
    setJobNextDue("");
    setJobReturn(false);
    setStatusNote("");
    setNoteText("");
    setActionBusy("");
    setActionError("");
    setConfirmDelete(false);
  }, []);

  // -------------------------------------------------------
  // LOAD THE LIST
  // -------------------------------------------------------

  // `force` = something was just changed on this screen: load the
  // list again right away (also when a load is already running).
  const loadAssets = React.useCallback(
    async (force) => {
      if (listBusyRef.current) {
        if (force) {
          reloadRef.current = true;
        }

        return;
      }

      listBusyRef.current = true;

      const version = listVersionRef.current;

      try {
        const data = await apiGet("/assets");

        if (!mountedRef.current) {
          return;
        }

        // Something was changed on this screen while the list was
        // on its way: load the newest list once more.
        if (version !== listVersionRef.current) {
          reloadRef.current = true;

          return;
        }

        const list = Array.isArray(data?.assets)
          ? data.assets.map(normalizeAsset)
          : [];

        setAssets(list);
        setSummary(normalizeSummary(data?.summary));
        setAlerts(
          Array.isArray(data?.alerts)
            ? data.alerts.map(normalizeAlert)
            : []
        );

        // The asset in the open window was deleted by someone.
        if (
          !deletingRef.current &&
          detailIdRef.current !== null &&
          !list.some((item) => item.id === detailIdRef.current)
        ) {
          closeDetail();
          showToast("That asset was deleted by somebody else.");
        }

        // The same for the "Delete ... for good?" question.
        if (
          !deletingRef.current &&
          deleteIdRef.current !== null &&
          !list.some((item) => item.id === deleteIdRef.current)
        ) {
          deleteIdRef.current = null;
          setDeleteTarget(null);
          setActionError("");
          showToast("That asset was deleted by somebody else.");
        }

        loadedRef.current = true;

        setLoadState("ready");
        setLoadError("");
        setConnectionLost(false);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (!loadedRef.current) {
          setLoadState("error");
          setLoadError(
            getErrorMessage(error, "Assets could not be loaded.")
          );
        } else {
          setConnectionLost(true);
        }
      } finally {
        listBusyRef.current = false;

        if (reloadRef.current && mountedRef.current) {
          reloadRef.current = false;

          if (loadAssetsRef.current) {
            loadAssetsRef.current(false);
          }
        }
      }
    },
    [closeDetail, showToast]
  );

  loadAssetsRef.current = loadAssets;

  const loadAssignees = React.useCallback(async () => {
    try {
      const data = await apiGet("/assets/assignees");

      if (!mountedRef.current) {
        return;
      }

      setAssignees(
        Array.isArray(data) ? data.map(normalizePerson) : []
      );
    } catch {
      // The list keeps its last value.
    }
  }, []);

  React.useEffect(() => {
    loadAssets(false);
    loadAssignees();
  }, [loadAssets, loadAssignees]);

  // -------------------------------------------------------
  // LOAD ONE ASSET (with its jobs and history)
  // -------------------------------------------------------

  // Shows the answer of the backend in the open window and in the list.
  const applyDetail = React.useCallback((data) => {
    const asset = normalizeAsset(data.asset);

    const jobs = Array.isArray(data.jobs)
      ? data.jobs.map(normalizeJob)
      : [];

    const events = Array.isArray(data.events)
      ? data.events.map(normalizeEvent)
      : [];

    setDetail((previous) =>
      previous && previous.asset.id === asset.id
        ? { asset, jobs, events, error: "" }
        : previous
    );

    setAssets((previous) =>
      previous.map((item) => (item.id === asset.id ? asset : item))
    );
  }, []);

  const loadDetail = React.useCallback(
    async (id) => {
      const version = detailVersionRef.current;

      try {
        const data = await apiGet(`/assets/${id}`);

        if (
          !mountedRef.current ||
          detailIdRef.current !== id ||
          detailVersionRef.current !== version
        ) {
          return;
        }

        applyDetail(data);
      } catch (error) {
        if (!mountedRef.current || detailIdRef.current !== id) {
          return;
        }

        setDetail((previous) =>
          previous && previous.asset.id === id
            ? {
                ...previous,
                error: getErrorMessage(
                  error,
                  "The jobs and history could not be loaded."
                ),
              }
            : previous
        );
      }
    },
    [applyDetail]
  );

  useInterval(() => {
    loadAssets(false);

    if (detailIdRef.current !== null) {
      loadDetail(detailIdRef.current);
    }
  }, REFRESH_MS);

  const openDetail = (asset) => {
    detailIdRef.current = asset.id;
    detailVersionRef.current += 1;

    setDetail({ asset, jobs: null, events: null, error: "" });
    setShowAllJobs(false);
    setSchedule(null);
    setJobPanel(null);
    setJobNote("");
    setJobCompletedOn("");
    setJobNextDue("");
    setJobReturn(false);
    setStatusNote("");
    setNoteText("");
    setActionBusy("");
    setActionError("");
    setConfirmDelete(false);

    loadDetail(asset.id);
    loadAssignees();
  };

  // An alert opens the asset it is about.
  const openAlert = (alert) => {
    const asset = assets.find((item) => item.id === alert.assetId);

    if (asset) {
      openDetail(asset);
    }
  };

  // -------------------------------------------------------
  // ADD / EDIT AN ASSET
  // -------------------------------------------------------

  const openAddForm = () => {
    setAssetForm(createEmptyAssetForm());
    setFormError("");
  };

  const openEditForm = () => {
    if (!detail) {
      return;
    }

    const asset = detail.asset;

    setAssetForm({
      ...createEmptyAssetForm(),
      mode: "edit",
      id: asset.id,
      code: asset.code,
      category: asset.category,
      name: asset.name,
      location: asset.location,
      serial: asset.serialNumber,
    });

    setFormError("");
  };

  const closeForm = React.useCallback(() => {
    setAssetForm(null);
    setFormError("");
  }, []);

  const formOpen = assetForm !== null;

  React.useEffect(() => {
    if (formOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [formOpen]);

  const handleFormChange = (field, value) => {
    setAssetForm((previous) =>
      previous ? { ...previous, [field]: value } : previous
    );
  };

  const handleSaveAsset = async (event) => {
    event.preventDefault();

    if (submitting || !assetForm) {
      return;
    }

    const name = assetForm.name.trim();
    const location = assetForm.location.trim();
    const adding = assetForm.mode === "add";

    if (!name) {
      setFormError("Enter the asset name (for example Container Crane 01).");

      return;
    }

    if (!location) {
      setFormError("Enter where the asset is (for example Berth 1).");

      return;
    }

    if (adding && assetForm.lastMaintenance) {
      if (assetForm.lastMaintenance > latestDateInput()) {
        setFormError("The last maintenance date cannot be in the future.");

        return;
      }
    }

    setSubmitting(true);
    setFormError("");

    try {
      if (adding) {
        const data = await apiPost("/assets", {
          name,
          category: assetForm.category,
          location,
          serial_number: assetForm.serial.trim() || null,
          last_maintenance_on: assetForm.lastMaintenance || null,
          next_maintenance_on: assetForm.nextMaintenance || null,
        });

        if (!mountedRef.current) {
          return;
        }

        const asset = normalizeAsset(data.asset);

        listVersionRef.current += 1;

        setAssets((previous) =>
          sortAssets([
            ...previous.filter((item) => item.id !== asset.id),
            asset,
          ])
        );

        loadedRef.current = true;

        setLoadState("ready");
        setAssetForm(null);

        showToast(`${asset.code} has been added to the register.`);
      } else {
        const data = await apiPost(`/assets/${assetForm.id}/edit`, {
          name,
          location,
          serial_number: assetForm.serial.trim() || null,
        });

        if (!mountedRef.current) {
          return;
        }

        listVersionRef.current += 1;
        detailVersionRef.current += 1;

        applyDetail(data);

        setAssetForm(null);

        showToast("The details were saved.");
      }

      loadAssets(true);
    } catch (error) {
      if (mountedRef.current) {
        setFormError(
          getErrorMessage(error, "The asset could not be saved.")
        );
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  // -------------------------------------------------------
  // ACTIONS IN THE DETAILS WINDOW
  // -------------------------------------------------------

  // Runs one request while the window shows "busy"; an error stays
  // inside the window so it can be read. Returns true when it worked.
  const runAction = async (name, request, successText) => {
    if (!detail || actionBusy) {
      return false;
    }

    setActionBusy(name);
    setActionError("");

    try {
      const data = await request();

      if (!mountedRef.current) {
        return false;
      }

      listVersionRef.current += 1;
      detailVersionRef.current += 1;

      applyDetail(data);

      loadAssets(true);

      if (successText) {
        showToast(successText);
      }

      return true;
    } catch (error) {
      if (mountedRef.current) {
        setActionError(
          getErrorMessage(error, "It could not be saved.")
        );
      }

      return false;
    } finally {
      if (mountedRef.current) {
        setActionBusy("");
      }
    }
  };

  const openSchedule = () => {
    setJobPanel(null);
    setActionError("");
    setSchedule(createEmptySchedule());
  };

  const handleSchedule = async (event) => {
    event.preventDefault();

    if (!detail || !schedule) {
      return;
    }

    if (!schedule.dueDate) {
      setActionError("Choose the date the job is due.");

      return;
    }

    const worked = await runAction(
      "schedule",
      () =>
        apiPost(`/assets/${detail.asset.id}/jobs`, {
          job_type: schedule.type,
          due_date: schedule.dueDate,
          description: schedule.description.trim() || null,
          assigned_to_id: schedule.assignee
            ? Number(schedule.assignee)
            : null,
        }),
      "The maintenance job was scheduled."
    );

    if (worked && mountedRef.current) {
      setSchedule(null);
    }
  };

  const openJobPanel = (job, kind) => {
    setSchedule(null);
    setActionError("");
    setJobPanel({ jobId: job.id, kind });
    setJobNote("");
    setJobCompletedOn(toDateInput(new Date()));
    setJobNextDue("");
    setJobReturn(!!detail && detail.asset.manualStatus === "Out of Service");
  };

  const closeJobPanel = () => {
    setJobPanel(null);
    setActionError("");
  };

  const handleJobAction = async (event, job) => {
    event.preventDefault();

    if (!detail || !jobPanel) {
      return;
    }

    const base = `/assets/${detail.asset.id}/jobs/${job.id}`;

    let name = "";
    let request = null;
    let success = "";

    if (jobPanel.kind === "start") {
      name = `start-${job.id}`;
      success = `${job.number} was started.`;

      request = () =>
        apiPost(`${base}/start`, { note: jobNote.trim() || null });
    } else if (jobPanel.kind === "complete") {
      if (jobCompletedOn && jobCompletedOn > latestDateInput()) {
        setActionError("The completion date cannot be in the future.");

        return;
      }

      if (jobNextDue && jobCompletedOn && jobNextDue < jobCompletedOn) {
        setActionError(
          "The next maintenance date cannot be before the completion date."
        );

        return;
      }

      name = `complete-${job.id}`;
      success = `${job.number} was completed.`;

      request = () =>
        apiPost(`${base}/complete`, {
          completed_on: jobCompletedOn || null,
          note: jobNote.trim() || null,
          next_due_date: jobNextDue || null,
          return_to_service: jobReturn,
        });
    } else {
      if (!jobNote.trim()) {
        setActionError("Write why the job is cancelled.");

        return;
      }

      name = `cancel-${job.id}`;
      success = `${job.number} was cancelled.`;

      request = () =>
        apiPost(`${base}/cancel`, { note: jobNote.trim() });
    }

    const worked = await runAction(name, request, success);

    if (worked && mountedRef.current) {
      setJobPanel(null);
      setJobNote("");
      setJobNextDue("");
    }
  };

  const handleEquipmentStatus = async () => {
    if (!detail) {
      return;
    }

    const next =
      detail.asset.manualStatus === "Out of Service"
        ? "Operational"
        : "Out of Service";

    const worked = await runAction(
      "status",
      () =>
        apiPost(`/assets/${detail.asset.id}/status`, {
          status: next,
          note: statusNote.trim() || null,
        }),
      next === "Out of Service"
        ? `${detail.asset.code} was marked out of service.`
        : `${detail.asset.code} was returned to service.`
    );

    if (worked && mountedRef.current) {
      setStatusNote("");
    }
  };

  const handleAddNote = async (event) => {
    event.preventDefault();

    if (!detail) {
      return;
    }

    const note = noteText.trim();

    if (!note) {
      setActionError("Write the note first.");

      return;
    }

    const worked = await runAction(
      "note",
      () => apiPost(`/assets/${detail.asset.id}/notes`, { note }),
      "Note added."
    );

    if (worked && mountedRef.current) {
      setNoteText("");
    }
  };

  // Deletes one asset (with its jobs and history). It is used by
  // the "Delete" button of the table and by the details window.
  const deleteAsset = async (target) => {
    if (!target || actionBusy) {
      return;
    }

    deletingRef.current = true;

    setActionBusy("delete");
    setActionError("");

    try {
      await apiDelete(`/assets/${target.id}`);

      if (!mountedRef.current) {
        return;
      }

      listVersionRef.current += 1;

      setAssets((previous) =>
        previous.filter((item) => item.id !== target.id)
      );

      if (detailIdRef.current === target.id) {
        closeDetail();
      }

      deleteIdRef.current = null;

      setDeleteTarget(null);
      setActionBusy("");

      showToast(`${target.code} was deleted.`);

      loadAssets(true);
    } catch (error) {
      if (mountedRef.current) {
        setActionError(
          getErrorMessage(error, "The asset could not be deleted.")
        );

        setActionBusy("");
      }
    } finally {
      deletingRef.current = false;
    }
  };

  const handleDelete = () => {
    if (detail) {
      deleteAsset(detail.asset);
    }
  };

  const openDeleteDialog = (asset) => {
    setActionError("");
    setDeleteTarget(asset);
  };

  const closeDeleteDialog = React.useCallback(() => {
    deleteIdRef.current = null;

    setDeleteTarget(null);
    setActionError("");
  }, []);

  // Esc closes the open window (unless it is busy saving).
  const detailOpen = detail !== null;
  const deleteOpen = deleteTarget !== null;

  React.useEffect(() => {
    if (!formOpen && !detailOpen && !deleteOpen) {
      return undefined;
    }

    const handleKey = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (deleteOpen) {
        if (!actionBusy) {
          closeDeleteDialog();
        }
      } else if (formOpen) {
        if (!submitting) {
          closeForm();
        }
      } else if (detailOpen) {
        if (!actionBusy) {
          closeDetail();
        }
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => document.removeEventListener("keydown", handleKey);
  }, [
    formOpen,
    detailOpen,
    deleteOpen,
    submitting,
    actionBusy,
    closeDetail,
    closeForm,
    closeDeleteDialog,
  ]);

  // -------------------------------------------------------
  // WHAT THE SCREEN SHOWS
  // -------------------------------------------------------

  const filteredAssets = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSearch =
        !query ||
        [
          asset.code,
          asset.name,
          asset.category,
          asset.location,
          asset.serialNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesCategory =
        categoryFilter === "All" || asset.category === categoryFilter;

      const matchesStatus =
        statusFilter === "All" || asset.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [assets, search, categoryFilter, statusFilter]);

  const total = summary.total;

  const operationalNote =
    total > 0
      ? `${percentOf(summary.operational, total)}% of total assets`
      : "No assets registered yet";

  // -------------------------------------------------------
  // THE OPEN WINDOW
  // -------------------------------------------------------

  const selected = detail ? detail.asset : null;

  const sortedJobs = detail && detail.jobs ? sortJobs(detail.jobs) : null;

  const visibleJobs =
    sortedJobs && !showAllJobs ? sortedJobs.slice(0, JOBS_SHOWN) : sortedJobs;

  const assigneeOptions = [...assignees];

  const colSpan = 8;

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div ref={rootRef} className="mt-3 space-y-6">

      {/* =====================================================
          INTRO
          ===================================================== */}

      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-700">
          <MdBuild className="h-7 w-7" />
        </div>

        <div>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Monitor port assets, equipment health and maintenance activities.
          </p>
        </div>

        {connectionLost && (
          <span className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <MdRefresh className="h-4 w-4 animate-spin" />
            Reconnecting...
          </span>
        )}
      </div>

      {/* =====================================================
          KPI CARDS
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">

        <KpiCard
          label="Total Assets"
          value={total}
          testId="kpi-total"
          note="Registered port equipment"
          noteClass="text-gray-400"
          iconBox="bg-blue-100 text-blue-500 dark:bg-blue-500/10"
          icon={<MdPrecisionManufacturing className="h-6 w-6" />}
        />

        <KpiCard
          label="Operational"
          value={summary.operational}
          testId="kpi-operational"
          note={operationalNote}
          noteClass="text-green-500"
          iconBox="bg-green-100 text-green-500 dark:bg-green-500/10"
          icon={<MdCheckCircle className="h-6 w-6" />}
          hint="Assets that are working and have no maintenance due within 7 days"
        />

        <KpiCard
          label="Under Maintenance"
          value={summary.maintenance}
          testId="kpi-maintenance"
          note="Assets with a job in progress"
          noteClass="text-orange-500"
          iconBox="bg-orange-100 text-orange-500 dark:bg-orange-500/10"
          icon={<MdBuild className="h-6 w-6" />}
          hint="Assets that have a maintenance job in progress"
        />

        <KpiCard
          label="Critical / Due"
          value={summary.attention}
          testId="kpi-attention"
          note="Requires attention"
          noteClass="text-red-500"
          iconBox="bg-red-100 text-red-500 dark:bg-red-500/10"
          icon={<MdError className="h-6 w-6" />}
          hint="Assets that are out of service, overdue or due within 7 days"
        />

      </div>

      {/* =====================================================
          ASSET CATEGORIES
          ===================================================== */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdEngineering className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                Asset Categories
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Distribution of registered port equipment
              </p>
            </div>
          </div>

          <div className="space-y-4" data-testid="category-list">

            {summary.categories.map((item) => (
              <div key={item.category} data-testid="category-row">

                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-navy-700 dark:text-white">
                    {CATEGORY_PLURALS[item.category] || item.category}
                  </span>

                  <span
                    data-testid="category-count"
                    className="text-gray-500 dark:text-gray-400"
                  >
                    {item.count}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-navy-700">
                  <div
                    data-testid="category-bar"
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${percentOf(item.count, total)}%` }}
                  />
                </div>

              </div>
            ))}

            {summary.categories.length === 0 && (
              <p
                data-testid="category-empty"
                className="text-sm text-gray-500 dark:text-gray-400"
              >
                {loadState === "loading"
                  ? "Loading..."
                  : "No equipment has been added yet. The categories appear here as soon as you add assets."}
              </p>
            )}

          </div>
        </div>

        {/* =================================================
            MAINTENANCE SUMMARY
            ================================================= */}

        <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-700">
              <MdSchedule className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                Maintenance Summary
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Current maintenance workload
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div
              className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700"
              title="Jobs that are scheduled and not yet due"
            >
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Scheduled
              </p>
              <p
                data-testid="jobs-scheduled"
                className="mt-2 text-2xl font-bold text-navy-700 dark:text-white"
              >
                {summary.jobs.scheduled}
              </p>
            </div>

            <div
              className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700"
              title="Jobs that are being worked on"
            >
              <p className="text-xs text-gray-500 dark:text-gray-300">
                In Progress
              </p>
              <p
                data-testid="jobs-progress"
                className="mt-2 text-2xl font-bold text-orange-500"
              >
                {summary.jobs.inProgress}
              </p>
            </div>

            <div
              className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700"
              title="Jobs that are finished"
            >
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Completed
              </p>
              <p
                data-testid="jobs-completed"
                className="mt-2 text-2xl font-bold text-green-500"
              >
                {summary.jobs.completed}
              </p>
            </div>

            <div
              className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700"
              title="Jobs that are past their due date and not finished"
            >
              <p className="text-xs text-gray-500 dark:text-gray-300">
                Overdue
              </p>
              <p
                data-testid="jobs-overdue"
                className="mt-2 text-2xl font-bold text-red-500"
              >
                {summary.jobs.overdue}
              </p>
            </div>

          </div>
        </div>

      </div>

      {/* =====================================================
          ASSET REGISTER
          ===================================================== */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">

          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Asset Register
            </h3>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Monitor equipment status and maintenance schedules
            </p>
          </div>

          <button
            type="button"
            onClick={openAddForm}
            data-testid="add-asset-button"
            className="flex items-center justify-center gap-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            <MdAdd className="h-5 w-5" />
            Add Asset
          </button>

        </div>

        {/* FILTERS */}
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">

          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              aria-label="Search assets"
              data-testid="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
            />
          </div>

          <select
            value={categoryFilter}
            aria-label="Filter by category"
            data-testid="category-filter"
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Categories</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            aria-label="Filter by status"
            data-testid="status-filter"
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Statuses</option>
            {ASSET_STATUS_FILTERS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

        </div>

        {/* LOAD ERROR */}
        {loadState === "error" && (
          <div
            role="alert"
            data-testid="load-error"
            className="mb-5 flex flex-col items-center rounded-xl bg-red-50 px-4 py-8 text-center dark:bg-red-500/10"
          >
            <MdErrorOutline className="mb-2 h-8 w-8 text-red-400" />

            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              Asset &amp; Maintenance is not available
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              {loadError}
            </p>

            <button
              type="button"
              onClick={() => {
                setLoadState("loading");
                loadAssets(false);
              }}
              className="mt-4 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
            >
              Try again
            </button>
          </div>
        )}

        {/* TABLE */}
        {loadState !== "error" && (
          <div className="overflow-x-auto">

            <table
              className="w-full min-w-[780px]"
              data-testid="asset-table"
            >

              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Asset ID
                  </th>

                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Asset
                  </th>

                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Category
                  </th>

                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Location
                  </th>

                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Status
                  </th>

                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Last Maintenance
                  </th>

                  <th className="px-2 py-3 text-left text-xs font-bold uppercase text-gray-500">
                    Next Maintenance
                  </th>

                  <th className="sticky right-0 bg-white px-2 py-3 text-left text-xs font-bold uppercase text-gray-500 dark:bg-navy-800">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>

                {filteredAssets.map((asset) => (
                  <tr
                    key={asset.id}
                    data-testid="asset-row"
                    data-code={asset.code}
                    className="group border-b border-gray-100 transition last:border-0 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >

                    <td className="whitespace-nowrap px-2 py-4 text-sm font-bold text-brand-500">
                      {asset.code}
                    </td>

                    <td className="px-2 py-4 text-sm font-medium text-navy-700 dark:text-white">
                      {asset.name}

                      {asset.serialNumber && (
                        <p className="mt-0.5 text-xs font-normal text-gray-500">
                          {asset.serialNumber}
                        </p>
                      )}
                    </td>

                    <td className="px-2 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {asset.category}
                    </td>

                    <td className="px-2 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {asset.location}
                    </td>

                    <td className="px-2 py-4">

                      <span
                        data-testid="row-status"
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                          assetStatusClasses[asset.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {asset.status}
                      </span>

                    </td>

                    <td
                      data-testid="row-last"
                      className="whitespace-nowrap px-2 py-4 text-sm text-gray-500 dark:text-gray-300"
                    >
                      {formatDay(asset.lastMaintenance)}
                    </td>

                    <td
                      data-testid="row-next"
                      className={`whitespace-nowrap px-2 py-4 text-sm font-medium ${
                        asset.nextOverdue
                          ? "text-red-500"
                          : "text-navy-700 dark:text-white"
                      }`}
                    >
                      {formatDay(asset.nextMaintenance)}
                    </td>

                    <td className="sticky right-0 bg-white px-2 py-4 group-hover:bg-gray-50 dark:bg-navy-800 dark:group-hover:bg-[#1d274d]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(asset)}
                          data-testid="view-button"
                          className="rounded-lg bg-lightPrimary px-3 py-2 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white dark:bg-navy-900"
                        >
                          View
                        </button>

                        {asset.canDelete && (
                          <button
                            type="button"
                            onClick={() => openDeleteDialog(asset)}
                            title="Delete this asset"
                            aria-label={`Delete ${asset.code}`}
                            data-testid="row-delete"
                            className="rounded-lg bg-red-50 p-2 text-red-500 transition hover:bg-red-500 hover:text-white dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                          >
                            <MdDeleteOutline className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))}

                {filteredAssets.length === 0 && (
                  <tr>
                    <td
                      colSpan={colSpan}
                      data-testid="empty-row"
                      className="px-3 py-12 text-center text-sm text-gray-500"
                    >
                      {loadState === "loading"
                        ? "Loading assets..."
                        : assets.length === 0
                        ? "No assets have been added yet. Select Add Asset to register the first one."
                        : "No assets match your search or filters."}
                    </td>
                  </tr>
                )}

              </tbody>

            </table>

          </div>
        )}
      </div>

      {/* =====================================================
          MAINTENANCE ALERTS
          ===================================================== */}

      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-navy-800">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-500 dark:bg-red-500/10">
            <MdWarning className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Maintenance Alerts
            </h3>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Equipment requiring attention
            </p>
          </div>

        </div>

        <div className="space-y-3" data-testid="alert-list">

          {alerts.map((alert) => {

            const styles =
              alert.type === "critical"
                ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5"
                : alert.type === "warning"
                ? "border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/5"
                : "border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/5";

            const icon =
              alert.type === "critical"
                ? <MdError className="h-5 w-5 text-red-500" />
                : alert.type === "warning"
                ? <MdBuild className="h-5 w-5 text-orange-500" />
                : <MdSchedule className="h-5 w-5 text-blue-500" />;

            return (
              <button
                key={alert.key}
                type="button"
                onClick={() => openAlert(alert)}
                title="Open this asset"
                data-testid="alert-item"
                data-type={alert.type}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition hover:opacity-90 ${styles}`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {icon}
                </div>

                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-navy-700 dark:text-white">
                    {alert.title}
                  </p>

                  <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
                    {alert.message}
                  </p>
                </div>
              </button>
            );
          })}

          {alerts.length === 0 && (
            <div
              data-testid="alert-empty"
              className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-500/20 dark:bg-green-500/5"
            >
              <MdCheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />

              <p className="text-sm text-gray-600 dark:text-gray-300">
                {loadState === "loading"
                  ? "Loading..."
                  : "No equipment needs attention right now."}
              </p>
            </div>
          )}

        </div>
      </div>

      {/* =====================================================
          FUTURE PREDICTIVE MAINTENANCE
          ===================================================== */}

      <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5 dark:border-brand-500/20 dark:bg-brand-500/5">

        <div className="flex items-start gap-3">

          <MdElectricBolt className="mt-1 h-6 w-6 flex-shrink-0 text-brand-500" />

          <div>
            <h3 className="font-bold text-navy-700 dark:text-white">
              Predictive Maintenance
            </h3>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Future integration can use equipment history, maintenance
              records and sensor data to identify assets that may require
              maintenance before failure occurs.
            </p>
          </div>

        </div>
      </div>

      {/* =====================================================
          ASSET DETAILS WINDOW
          ===================================================== */}

      {selected && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="detail-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget && !actionBusy) {
                closeDetail();
              }
            }}
          >

            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Asset ${selected.code}`}
              data-testid="detail-dialog"
              className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >

              <div className="mb-5 flex items-start justify-between gap-3">

                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-500">
                    Asset Details
                  </p>

                  <h2
                    data-testid="detail-code"
                    className="mt-1 text-2xl font-bold text-navy-700 dark:text-white"
                  >
                    {selected.code}
                  </h2>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={openEditForm}
                    disabled={!!actionBusy}
                    data-testid="edit-asset"
                    className="flex h-9 items-center gap-1 rounded-lg bg-lightPrimary px-3 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white disabled:opacity-50 dark:bg-navy-900"
                  >
                    <MdEdit className="h-4 w-4" />
                    Edit details
                  </button>

                  <button
                    type="button"
                    onClick={closeDetail}
                    disabled={!!actionBusy}
                    aria-label="Close"
                    data-testid="detail-close"
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10"
                  >
                    <MdClose className="h-5 w-5" />
                  </button>
                </div>

              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <InfoItem label="Asset">
                  <span data-testid="detail-name" className="break-words">
                    {selected.name}
                  </span>
                </InfoItem>

                <InfoItem label="Category">{selected.category}</InfoItem>

                <InfoItem label="Location">
                  <span className="break-words">{selected.location}</span>
                </InfoItem>

                <InfoItem label="Serial / tag number">
                  <span className="break-words">
                    {selected.serialNumber || "—"}
                  </span>
                </InfoItem>

                <InfoItem label="Status">
                  <span
                    data-testid="detail-status"
                    className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                      assetStatusClasses[selected.status] ||
                      "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {selected.status}
                  </span>
                </InfoItem>

                <InfoItem label="Open jobs">
                  <span data-testid="detail-open-jobs">
                    {selected.openJobs}
                  </span>
                </InfoItem>

                <InfoItem label="Last maintenance">
                  <span data-testid="detail-last">
                    {formatDay(selected.lastMaintenance)}
                  </span>
                </InfoItem>

                <InfoItem label="Next maintenance">
                  <span
                    data-testid="detail-next"
                    className={selected.nextOverdue ? "text-red-500" : ""}
                  >
                    {formatDay(selected.nextMaintenance)}
                    {selected.nextOverdue ? " (overdue)" : ""}
                  </span>
                </InfoItem>

                <InfoItem label="Added by">
                  {selected.createdBy ? selected.createdBy.name : "—"}
                  {selected.createdBy && selected.createdBy.role && (
                    <p className="text-xs font-normal text-gray-500">
                      {selected.createdBy.role}
                    </p>
                  )}
                </InfoItem>

                <InfoItem label="Added">
                  {formatDateTime(selected.createdAt)}
                </InfoItem>

              </div>

              {/* MAINTENANCE JOBS */}

              <div className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-white/10">

                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Maintenance jobs
                  </p>

                  <button
                    type="button"
                    onClick={openSchedule}
                    disabled={!!actionBusy || schedule !== null}
                    data-testid="schedule-open"
                    className="flex h-9 items-center gap-1 rounded-lg bg-brand-500 px-3 text-xs font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MdAdd className="h-4 w-4" />
                    Schedule maintenance
                  </button>
                </div>

                {schedule && (
                  <form
                    onSubmit={handleSchedule}
                    noValidate
                    data-testid="schedule-form"
                    className="mb-4 space-y-3 rounded-xl bg-lightPrimary p-4 dark:bg-navy-900"
                  >

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                      <div>
                        <label htmlFor="schedule-type" className={labelClasses}>
                          Job type
                        </label>
                        <select
                          id="schedule-type"
                          value={schedule.type}
                          disabled={!!actionBusy}
                          onChange={(e) =>
                            setSchedule({ ...schedule, type: e.target.value })
                          }
                          className={inputClasses}
                        >
                          {JOB_TYPES.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="schedule-due" className={labelClasses}>
                          Due date
                        </label>
                        <input
                          id="schedule-due"
                          type="date"
                          value={schedule.dueDate}
                          disabled={!!actionBusy}
                          onChange={(e) =>
                            setSchedule({ ...schedule, dueDate: e.target.value })
                          }
                          className={`${inputClasses} dark:[color-scheme:dark]`}
                        />
                      </div>

                    </div>

                    <div>
                      <label htmlFor="schedule-assignee" className={labelClasses}>
                        Assign to (optional)
                      </label>
                      <select
                        id="schedule-assignee"
                        value={schedule.assignee}
                        disabled={!!actionBusy}
                        onChange={(e) =>
                          setSchedule({ ...schedule, assignee: e.target.value })
                        }
                        className={inputClasses}
                      >
                        <option value="">Not assigned</option>

                        {assigneeOptions.map((person) => (
                          <option key={person.id} value={String(person.id)}>
                            {person.name}
                            {person.role ? ` (${person.role})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-400">
                        The person you choose is told through the bell.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="schedule-description" className={labelClasses}>
                        What has to be done (optional)
                      </label>
                      <textarea
                        id="schedule-description"
                        value={schedule.description}
                        maxLength={MAX_DESCRIPTION}
                        disabled={!!actionBusy}
                        onChange={(e) =>
                          setSchedule({
                            ...schedule,
                            description: e.target.value,
                          })
                        }
                        rows="2"
                        placeholder="e.g. Check the hoist cable and grease the boom."
                        className={textareaClasses}
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={!!actionBusy}
                        data-testid="schedule-save"
                        className={primaryButtonClasses}
                      >
                        <Spinner show={actionBusy === "schedule"} />
                        Save job
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSchedule(null);
                          setActionError("");
                        }}
                        disabled={!!actionBusy}
                        data-testid="schedule-cancel"
                        className={quietButtonClasses}
                      >
                        Cancel
                      </button>
                    </div>

                  </form>
                )}

                {detail.jobs === null && !detail.error && (
                  <p className="text-sm text-gray-400">Loading jobs...</p>
                )}

                {detail.error && (
                  <p
                    role="alert"
                    data-testid="jobs-error"
                    className="text-xs font-semibold text-red-500"
                  >
                    {detail.error}
                  </p>
                )}

                {visibleJobs && visibleJobs.length === 0 && (
                  <p
                    data-testid="jobs-empty"
                    className="text-sm text-gray-500 dark:text-gray-400"
                  >
                    No maintenance jobs yet. Select Schedule maintenance to
                    plan the first one.
                  </p>
                )}

                {visibleJobs && visibleJobs.length > 0 && (
                  <ul data-testid="job-list" className="space-y-3">

                    {visibleJobs.map((job) => {

                      const open = isOpenJob(job);

                      const panelHere =
                        jobPanel && jobPanel.jobId === job.id
                          ? jobPanel.kind
                          : null;

                      return (
                        <li
                          key={job.id}
                          data-testid="job-item"
                          data-number={job.number}
                          data-status={job.status}
                          className="rounded-xl border border-gray-200 p-3 dark:border-white/10"
                        >

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-navy-700 dark:text-white">
                              {job.number}
                            </span>

                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {job.type}
                            </span>

                            <span
                              data-testid="job-status"
                              className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                jobStatusClasses[job.status] || ""
                              }`}
                            >
                              {job.status}
                            </span>

                            {job.overdue && (
                              <span
                                data-testid="job-overdue"
                                className="whitespace-nowrap rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-500/10 dark:text-red-400"
                              >
                                Overdue · {daysWord(job.daysOverdue)}
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            Due {formatDay(job.dueDate)}
                            {job.completedOn
                              ? ` · Completed ${formatDay(job.completedOn)}`
                              : ""}
                            {job.assignedTo
                              ? ` · ${job.assignedTo.name}`
                              : ""}
                          </p>

                          {job.description && (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                              {job.description}
                            </p>
                          )}

                          {open && !panelHere && (
                            <div className="mt-3 flex flex-wrap gap-2">

                              {job.status === "Scheduled" && (
                                <button
                                  type="button"
                                  onClick={() => openJobPanel(job, "start")}
                                  disabled={!!actionBusy}
                                  data-testid="job-start"
                                  className="h-8 rounded-lg bg-orange-100 px-3 text-xs font-bold text-orange-600 hover:bg-orange-500 hover:text-white disabled:opacity-50 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500 dark:hover:text-white"
                                >
                                  Start
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openJobPanel(job, "complete")}
                                disabled={!!actionBusy}
                                data-testid="job-complete"
                                className="h-8 rounded-lg bg-green-100 px-3 text-xs font-bold text-green-600 hover:bg-green-500 hover:text-white disabled:opacity-50 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                              >
                                Complete
                              </button>

                              <button
                                type="button"
                                onClick={() => openJobPanel(job, "cancel")}
                                disabled={!!actionBusy}
                                data-testid="job-cancel"
                                className="h-8 rounded-lg bg-gray-100 px-3 text-xs font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20"
                              >
                                Cancel job
                              </button>

                            </div>
                          )}

                          {panelHere && (
                            <form
                              onSubmit={(event) => handleJobAction(event, job)}
                              noValidate
                              data-testid="job-panel"
                              data-kind={panelHere}
                              className="mt-3 space-y-3 rounded-xl bg-lightPrimary p-3 dark:bg-navy-900"
                            >

                              {panelHere === "complete" && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                                  <div>
                                    <label
                                      htmlFor={`done-on-${job.id}`}
                                      className={labelClasses}
                                    >
                                      Completed on
                                    </label>
                                    <input
                                      id={`done-on-${job.id}`}
                                      type="date"
                                      value={jobCompletedOn}
                                      max={latestDateInput()}
                                      disabled={!!actionBusy}
                                      onChange={(e) =>
                                        setJobCompletedOn(e.target.value)
                                      }
                                      className={`${inputClasses} dark:[color-scheme:dark]`}
                                    />
                                  </div>

                                  <div>
                                    <label
                                      htmlFor={`next-due-${job.id}`}
                                      className={labelClasses}
                                    >
                                      Next maintenance (optional)
                                    </label>
                                    <input
                                      id={`next-due-${job.id}`}
                                      type="date"
                                      value={jobNextDue}
                                      disabled={!!actionBusy}
                                      onChange={(e) =>
                                        setJobNextDue(e.target.value)
                                      }
                                      className={`${inputClasses} dark:[color-scheme:dark]`}
                                    />
                                  </div>

                                </div>
                              )}

                              {panelHere === "complete" && (
                                <p className="text-xs text-gray-400">
                                  A date in &quot;Next maintenance&quot;
                                  schedules a follow-up job.
                                </p>
                              )}

                              <div>
                                <label
                                  htmlFor={`job-note-${job.id}`}
                                  className={labelClasses}
                                >
                                  {panelHere === "cancel"
                                    ? "Why is the job cancelled?"
                                    : "Note (optional)"}
                                </label>
                                <input
                                  id={`job-note-${job.id}`}
                                  type="text"
                                  value={jobNote}
                                  maxLength={MAX_NOTE}
                                  disabled={!!actionBusy}
                                  onChange={(e) => setJobNote(e.target.value)}
                                  placeholder={
                                    panelHere === "complete"
                                      ? "What was done..."
                                      : panelHere === "cancel"
                                      ? "Reason"
                                      : "e.g. Crew on site"
                                  }
                                  className={inputClasses}
                                />
                              </div>

                              {panelHere === "complete" &&
                                selected.manualStatus === "Out of Service" && (
                                  <label className="flex items-center gap-2 text-sm text-navy-700 dark:text-white">
                                    <input
                                      type="checkbox"
                                      checked={jobReturn}
                                      disabled={!!actionBusy}
                                      data-testid="job-return"
                                      onChange={(e) =>
                                        setJobReturn(e.target.checked)
                                      }
                                      className="h-4 w-4"
                                    />
                                    Return this asset to service
                                  </label>
                                )}

                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  disabled={!!actionBusy}
                                  data-testid="job-panel-submit"
                                  className={primaryButtonClasses}
                                >
                                  <Spinner
                                    show={
                                      actionBusy ===
                                      `${panelHere}-${job.id}`
                                    }
                                  />
                                  {panelHere === "start"
                                    ? "Start work"
                                    : panelHere === "complete"
                                    ? "Mark as completed"
                                    : "Cancel this job"}
                                </button>

                                <button
                                  type="button"
                                  onClick={closeJobPanel}
                                  disabled={!!actionBusy}
                                  data-testid="job-panel-close"
                                  className={quietButtonClasses}
                                >
                                  Back
                                </button>
                              </div>

                            </form>
                          )}

                        </li>
                      );
                    })}

                  </ul>
                )}

                {sortedJobs && sortedJobs.length > JOBS_SHOWN && (
                  <button
                    type="button"
                    onClick={() => setShowAllJobs(!showAllJobs)}
                    data-testid="jobs-toggle"
                    className="mt-3 text-sm font-semibold text-brand-500 hover:text-brand-600"
                  >
                    {showAllJobs
                      ? "Show fewer jobs"
                      : `Show all ${sortedJobs.length} jobs`}
                  </button>
                )}

              </div>

              {/* EQUIPMENT STATUS */}

              <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-white/10">

                <p className="mb-1 text-xs font-bold uppercase text-gray-500">
                  Equipment status
                </p>

                <p className="mb-3 text-xs text-gray-500">
                  {selected.manualStatus === "Out of Service"
                    ? "This equipment is marked out of service. Return it to service when it has been repaired."
                    : "Mark the equipment out of service when it cannot be used. Maintenance, Overdue and Maintenance Due come from the jobs above."}
                </p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={statusNote}
                    maxLength={MAX_NOTE}
                    disabled={!!actionBusy}
                    onChange={(e) => setStatusNote(e.target.value)}
                    aria-label="Note for the status change"
                    placeholder="Note (optional)"
                    className={inputClasses}
                  />

                  <button
                    type="button"
                    onClick={handleEquipmentStatus}
                    disabled={!!actionBusy}
                    data-testid="toggle-service"
                    className={`flex h-11 flex-shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected.manualStatus === "Out of Service"
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-red-500 hover:bg-red-600"
                    }`}
                  >
                    <Spinner show={actionBusy === "status"} />
                    {selected.manualStatus === "Out of Service"
                      ? "Return to service"
                      : "Mark out of service"}
                  </button>
                </div>

              </div>

              {/* HISTORY */}

              <div className="mt-5">

                <p className="mb-3 text-xs font-bold uppercase text-gray-500">
                  History
                </p>

                {detail.events === null && !detail.error && (
                  <p className="text-sm text-gray-400">
                    Loading history...
                  </p>
                )}

                {detail.events !== null && (
                  <ol
                    data-testid="timeline"
                    className="space-y-3 border-l border-gray-200 pl-4 dark:border-white/10"
                  >
                    {detail.events.map((event) => (
                      <li
                        key={event.id}
                        data-testid="timeline-event"
                        data-type={event.type}
                        className="relative"
                      >
                        <span
                          className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${eventDotClass(event)}`}
                        />

                        <p className="break-words text-sm text-navy-700 dark:text-white">
                          {describeEvent(event)}
                        </p>

                        {event.note && (
                          <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-lightPrimary px-3 py-2 text-sm text-gray-700 dark:bg-navy-900 dark:text-gray-300">
                            {event.note}
                          </p>
                        )}

                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {event.actor && event.actor.role
                            ? `${event.actor.role} · `
                            : ""}
                          {formatDateTime(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}

                <form onSubmit={handleAddNote} className="mt-4">

                  <label htmlFor="detail-note" className={labelClasses}>
                    Add a note
                  </label>

                  <textarea
                    id="detail-note"
                    value={noteText}
                    maxLength={MAX_NOTE}
                    disabled={!!actionBusy}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows="2"
                    placeholder="What was found, checked or done..."
                    className={textareaClasses}
                  />

                  <button
                    type="submit"
                    disabled={!!actionBusy || !noteText.trim()}
                    data-testid="add-note"
                    className={`mt-2 ${primaryButtonClasses}`}
                  >
                    <Spinner show={actionBusy === "note"} />
                    Add note
                  </button>

                </form>

              </div>

              {actionError && !deleteOpen && (
                <div
                  role="alert"
                  data-testid="action-error"
                  className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
                >
                  {actionError}
                </div>
              )}

              {/* DELETE (Port Administrator) */}

              {selected.canDelete && (
                <div className="mt-5 border-t border-gray-200 pt-4 dark:border-white/10">

                  {!confirmDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      disabled={!!actionBusy}
                      data-testid="delete-asset"
                      className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                    >
                      <MdDeleteOutline className="h-5 w-5" />
                      Delete this asset
                    </button>
                  )}

                  {confirmDelete && (
                    <div
                      data-testid="delete-confirm"
                      className="rounded-xl bg-red-50 p-4 dark:bg-red-500/10"
                    >
                      <p className="text-sm font-semibold text-red-600 dark:text-red-300">
                        Delete {selected.code} for good?
                      </p>

                      <p className="mt-1 text-xs text-red-500 dark:text-red-300">
                        The asset, all its maintenance jobs and its whole
                        history are removed for everybody. This cannot be
                        undone.
                      </p>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={!!actionBusy}
                          data-testid="confirm-delete"
                          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          <Spinner show={actionBusy === "delete"} />
                          Yes, delete it
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          disabled={!!actionBusy}
                          data-testid="cancel-delete"
                          className="h-10 rounded-xl bg-white px-4 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              <button
                type="button"
                onClick={closeDetail}
                disabled={!!actionBusy}
                className="mt-5 h-11 w-full rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
              >
                Close
              </button>

            </div>

          </div>
        </BodyPortal>
      )}

      {/* =====================================================
          ADD / EDIT ASSET WINDOW
          ===================================================== */}

      {assetForm && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="form-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget && !submitting) {
                closeForm();
              }
            }}
          >

            <div
              role="dialog"
              aria-modal="true"
              aria-label={
                assetForm.mode === "add" ? "Add New Asset" : "Edit Asset"
              }
              data-testid="form-dialog"
              className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >

              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    {assetForm.mode === "add"
                      ? "Add New Asset"
                      : `Edit ${assetForm.code}`}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {assetForm.mode === "add"
                      ? "Register a piece of port equipment. The Asset ID (for example CRN-001) is created for you."
                      : "Change the name, the location or the serial number."}
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

              <form
                onSubmit={handleSaveAsset}
                noValidate
                className="space-y-4"
              >

                {assetForm.mode === "add" ? (
                  <div>
                    <label htmlFor="asset-category" className={labelClasses}>
                      Category
                    </label>
                    <select
                      id="asset-category"
                      value={assetForm.category}
                      disabled={submitting}
                      onChange={(e) =>
                        handleFormChange("category", e.target.value)
                      }
                      className={inputClasses}
                    >
                      {CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <p className={labelClasses}>Category</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {assetForm.category} (cannot be changed)
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="asset-name" className={labelClasses}>
                    Asset name
                  </label>
                  <input
                    id="asset-name"
                    ref={nameInputRef}
                    type="text"
                    value={assetForm.name}
                    maxLength={MAX_NAME}
                    disabled={submitting}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    placeholder="e.g. Container Crane 01"
                    className={inputClasses}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                  <div>
                    <label htmlFor="asset-location" className={labelClasses}>
                      Location
                    </label>
                    <input
                      id="asset-location"
                      type="text"
                      value={assetForm.location}
                      maxLength={MAX_LOCATION}
                      disabled={submitting}
                      onChange={(e) =>
                        handleFormChange("location", e.target.value)
                      }
                      placeholder="e.g. Berth 1"
                      className={inputClasses}
                    />
                  </div>

                  <div>
                    <label htmlFor="asset-serial" className={labelClasses}>
                      Serial / tag number
                    </label>
                    <input
                      id="asset-serial"
                      type="text"
                      value={assetForm.serial}
                      maxLength={MAX_SERIAL}
                      disabled={submitting}
                      onChange={(e) =>
                        handleFormChange("serial", e.target.value)
                      }
                      placeholder="Optional"
                      className={inputClasses}
                    />
                  </div>

                </div>

                {assetForm.mode === "add" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                    <div>
                      <label htmlFor="asset-last" className={labelClasses}>
                        Last maintenance
                      </label>
                      <input
                        id="asset-last"
                        type="date"
                        value={assetForm.lastMaintenance}
                        max={latestDateInput()}
                        disabled={submitting}
                        onChange={(e) =>
                          handleFormChange("lastMaintenance", e.target.value)
                        }
                        className={`${inputClasses} dark:[color-scheme:dark]`}
                      />
                    </div>

                    <div>
                      <label htmlFor="asset-next" className={labelClasses}>
                        Next maintenance
                      </label>
                      <input
                        id="asset-next"
                        type="date"
                        value={assetForm.nextMaintenance}
                        disabled={submitting}
                        onChange={(e) =>
                          handleFormChange("nextMaintenance", e.target.value)
                        }
                        className={`${inputClasses} dark:[color-scheme:dark]`}
                      />
                    </div>

                    <p className="text-xs text-gray-400 sm:col-span-2">
                      Both dates are optional. A date in &quot;Next
                      maintenance&quot; schedules a maintenance job for it.
                    </p>

                  </div>
                )}

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
                  data-testid="submit-asset"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Spinner show={submitting} />
                  {submitting
                    ? "Saving..."
                    : assetForm.mode === "add"
                    ? "Add to Register"
                    : "Save Changes"}
                </button>

              </form>

            </div>
          </div>
        </BodyPortal>
      )}

      {/* =====================================================
          DELETE QUESTION (opened from the table)
          ===================================================== */}

      {deleteTarget && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="delete-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget && !actionBusy) {
                closeDeleteDialog();
              }
            }}
          >

            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={`Delete ${deleteTarget.code}`}
              data-testid="delete-dialog"
              className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >

              <div className="flex items-start gap-3">

                <div className="flex-shrink-0 rounded-xl bg-red-100 p-3 text-red-500 dark:bg-red-500/10">
                  <MdDeleteOutline className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                    Delete {deleteTarget.code} for good?
                  </h2>

                  <p className="mt-1 break-words text-sm text-gray-500 dark:text-gray-300">
                    {deleteTarget.name} at {deleteTarget.location}
                  </p>
                </div>

              </div>

              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                The asset, all its maintenance jobs and its whole history
                are removed for everybody. This cannot be undone.
              </p>

              {actionError && (
                <div
                  role="alert"
                  data-testid="delete-error"
                  className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
                >
                  {actionError}
                </div>
              )}

              <div className="mt-5 flex gap-2">

                <button
                  type="button"
                  onClick={() => deleteAsset(deleteTarget)}
                  disabled={!!actionBusy}
                  data-testid="row-confirm-delete"
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Spinner show={actionBusy === "delete"} />
                  Yes, delete it
                </button>

                <button
                  type="button"
                  onClick={closeDeleteDialog}
                  disabled={!!actionBusy}
                  data-testid="row-cancel-delete"
                  className="h-11 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
                >
                  Cancel
                </button>

              </div>

            </div>

          </div>
        </BodyPortal>
      )}

      {/* MESSAGE AT THE BOTTOM */}
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

export default AssetMaintenance;
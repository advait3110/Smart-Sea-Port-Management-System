import React from "react";

import { createPortal } from "react-dom";

import {
  MdAdd,
  MdSearch,
  MdWarning,
  MdError,
  MdAccessTime,
  MdCheckCircle,
  MdClose,
  MdDirectionsBoat,
  MdRefresh,
  MdErrorOutline,
  MdDeleteOutline,
} from "react-icons/md";

import { apiGet, apiPost, apiDelete } from "../../../services/api";

import { startPollTimer } from "../../../services/pollTimer";

// =========================================================
// INCIDENT MANAGEMENT
// =========================================================
//
// The register of port incidents. Port employees report every
// incident by hand; there is no sample data. Everything is saved
// in the database through the backend:
//
//   GET    /incidents                    every incident
//   GET    /incidents/designations       the designations an incident can
//                                        be assigned to (not your own)
//   POST   /incidents                    report a new incident
//   GET    /incidents/{id}               one incident + its timeline
//   POST   /incidents/{id}/status        { status, note }
//   POST   /incidents/{id}/assign        { designation | null, note }
//   POST   /incidents/{id}/notes         { note }
//   DELETE /incidents/{id}               Port Administrator only
//
// An incident is assigned to a DESIGNATION (a team). The WHOLE team
// (every active account with that designation) gets a bell message.
// The designation of the person who is assigning is never offered.
//
// The page refreshes itself every few seconds, so an incident
// reported by a colleague appears without reloading.
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

const STATUSES = [
  "Reported",
  "Under Investigation",
  "Action Required",
  "Resolved",
  "Closed",
];

const FINISHED_STATUSES = ["Resolved", "Closed"];

const REFRESH_MS = 8000;

const MAX_LOCATION = 120;

const MAX_VESSEL = 120;

const MAX_TEXT = 4000;

const MAX_NOTE = 2000;

// The time an incident happened may be a few minutes ahead of the
// clock of the server (computers differ a little).
const FUTURE_SLACK_MS = 5 * 60 * 1000;

const severityClasses = {
  Critical: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  High: "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Medium: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400",
  Low: "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
};

const statusClasses = {
  Reported: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  "Under Investigation":
    "bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  "Action Required":
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Resolved:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  Closed:
    "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const inputClasses =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const labelClasses =
  "mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white";

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

// 04 Sep 2026 (written by hand so every browser shows the same)
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

const isSameDay = (first, second) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

// The text a "datetime-local" box needs: 2026-09-04T08:42
const toLocalInput = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-` +
  `${pad2(date.getDate())}T${pad2(date.getHours())}:` +
  pad2(date.getMinutes());

const createEmptyForm = () => ({
  type: INCIDENT_TYPES[0],
  location: "",
  severity: "Medium",
  vessel: "",
  description: "",
  occurredAt: toLocalInput(new Date()),
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
  canDelete: !!raw.can_delete,
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

const toCount = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const normalizeDesignation = (raw) => ({
  name: raw && raw.name ? String(raw.name) : "",
  members: raw ? toCount(raw.members) : 0,
  withAccess: raw ? toCount(raw.with_access) : 0,
});

const teamName = (designation) => `${designation} team`;

// Who an incident is assigned to, as text: a person, a team or nobody.
const assigneeName = (incident) => {
  if (incident.assignedTo) {
    return incident.assignedTo.name;
  }

  if (incident.assignedRole) {
    return teamName(incident.assignedRole);
  }

  return "";
};

const assigneeDetail = (incident) => {
  if (incident.assignedTo) {
    return incident.assignedTo.role || "";
  }

  if (incident.assignedRole) {
    return "Everybody with this designation";
  }

  return "";
};

// The value of the "Assigned to" list for what the incident has now.
const assigneeChoiceOf = (incident) => {
  if (incident.assignedTo && incident.assignedTo.id !== null) {
    return `person:${incident.assignedTo.id}`;
  }

  if (incident.assignedRole) {
    return `team:${incident.assignedRole}`;
  }

  return "";
};

// What the person who assigns is told about the team they chose.
const teamHint = (team) => {
  if (!team) {
    return "The whole team you choose is told through the bell.";
  }

  if (team.members === 0) {
    return "Nobody has this designation yet, so nobody can be told.";
  }

  const people =
    team.members === 1 ? "1 person" : `${team.members} people`;

  const told = `The whole team (${people}) is told through the bell.`;

  if (team.withAccess >= team.members) {
    return told;
  }

  if (team.withAccess === 0) {
    return `${told} None can open Incidents yet.`;
  }

  return `${told} ${team.members - team.withAccess} cannot open Incidents yet.`;
};

// Newest first (by when it happened).
const sortIncidents = (list) =>
  [...list].sort((first, second) => {
    const firstTime = parseDate(first.occurredAt);
    const secondTime = parseDate(second.occurredAt);

    const difference =
      (secondTime ? secondTime.getTime() : 0) -
      (firstTime ? firstTime.getTime() : 0);

    return difference !== 0 ? difference : second.id - first.id;
  });

const describeEvent = (event) => {
  const who = event.actor ? event.actor.name : "Someone";

  if (event.type === "reported") {
    return `${who} reported the incident.`;
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

// The windows (report, details) and the little message are drawn
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
// MAIN COMPONENT
// =========================================================

const IncidentManagement = () => {
  const [incidents, setIncidents] = React.useState([]);
  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);

  const [designations, setDesignations] = React.useState([]);

  const [search, setSearch] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState("All");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [typeFilter, setTypeFilter] = React.useState("All");

  // Report an incident
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState(createEmptyForm);
  const [formError, setFormError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // One incident open in the details window
  const [detail, setDetail] = React.useState(null);
  const [statusChoice, setStatusChoice] = React.useState("");
  const [statusNote, setStatusNote] = React.useState("");
  const [assignChoice, setAssignChoice] = React.useState(null);
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
  const locationInputRef = React.useRef(null);
  const toastTimerRef = React.useRef(null);

  const listBusyRef = React.useRef(false);
  const loadedRef = React.useRef(false);

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
    setStatusChoice("");
    setStatusNote("");
    setAssignChoice(null);
    setNoteText("");
    setActionBusy("");
    setActionError("");
    setConfirmDelete(false);
  }, []);

  // -------------------------------------------------------
  // LOAD THE LIST
  // -------------------------------------------------------

  const loadIncidents = React.useCallback(async () => {
    if (listBusyRef.current) {
      return;
    }

    listBusyRef.current = true;

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

      const list = Array.isArray(data?.incidents)
        ? data.incidents.map(normalizeIncident)
        : [];

      setIncidents(list);

      // The incident in the open window was deleted by someone.
      if (
        !deletingRef.current &&
        detailIdRef.current !== null &&
        !list.some((item) => item.id === detailIdRef.current)
      ) {
        closeDetail();
        showToast("That incident was deleted by somebody else.");
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
        showToast("That incident was deleted by somebody else.");
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
          getErrorMessage(error, "Incidents could not be loaded.")
        );
      } else {
        setConnectionLost(true);
      }
    } finally {
      listBusyRef.current = false;
    }
  }, [closeDetail, showToast]);

  const loadDesignations = React.useCallback(async () => {
    try {
      const data = await apiGet("/incidents/designations");

      if (!mountedRef.current) {
        return;
      }

      setDesignations(
        Array.isArray(data) ? data.map(normalizeDesignation) : []
      );
    } catch {
      // The list keeps its last value.
    }
  }, []);

  React.useEffect(() => {
    loadIncidents();
    loadDesignations();
  }, [loadIncidents, loadDesignations]);

  // -------------------------------------------------------
  // LOAD ONE INCIDENT (with its timeline)
  // -------------------------------------------------------

  // Shows the answer of the backend in the open window and in the list.
  const applyDetail = React.useCallback((data) => {
    const incident = normalizeIncident(data.incident);

    const events = Array.isArray(data.events)
      ? data.events.map(normalizeEvent)
      : [];

    setDetail((previous) =>
      previous && previous.incident.id === incident.id
        ? { incident, events, error: "" }
        : previous
    );

    setIncidents((previous) =>
      previous.map((item) =>
        item.id === incident.id ? incident : item
      )
    );
  }, []);

  const loadDetail = React.useCallback(
    async (id) => {
      const version = detailVersionRef.current;

      try {
        const data = await apiGet(`/incidents/${id}`);

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
    },
    [applyDetail]
  );

  useInterval(() => {
    loadIncidents();

    if (detailIdRef.current !== null) {
      loadDetail(detailIdRef.current);
    }
  }, REFRESH_MS);

  const openDetail = (incident) => {
    detailIdRef.current = incident.id;
    detailVersionRef.current += 1;

    setDetail({ incident, events: null, error: "" });
    setStatusChoice("");
    setStatusNote("");
    setAssignChoice(null);
    setNoteText("");
    setActionBusy("");
    setActionError("");
    setConfirmDelete(false);

    loadDetail(incident.id);
    loadDesignations();
  };

  // -------------------------------------------------------
  // REPORT AN INCIDENT
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

  const handleFormChange = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleCreateIncident = async (event) => {
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
      const moment = new Date(form.occurredAt);

      if (Number.isNaN(moment.getTime())) {
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

      setLoadState("ready");
      loadedRef.current = true;

      setShowForm(false);
      setForm(createEmptyForm());

      showToast(`${incident.number} has been reported.`);
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

  // -------------------------------------------------------
  // CHANGE STATUS / ASSIGN / NOTE / DELETE
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

  const handleChangeStatus = async () => {
    if (!detail) {
      return;
    }

    const chosen = statusChoice || detail.incident.status;

    if (chosen === detail.incident.status) {
      return;
    }

    const worked = await runAction(
      "status",
      () =>
        apiPost(`/incidents/${detail.incident.id}/status`, {
          status: chosen,
          note: statusNote.trim() || null,
        }),
      `Status changed to ${chosen}.`
    );

    if (worked && mountedRef.current) {
      setStatusChoice("");
      setStatusNote("");
    }
  };

  const handleAssign = async () => {
    if (!detail || assignChoice === null) {
      return;
    }

    const team = assignChoice.startsWith("team:")
      ? assignChoice.slice("team:".length)
      : null;

    const worked = await runAction(
      "assign",
      () =>
        apiPost(`/incidents/${detail.incident.id}/assign`, {
          designation: team,
          user_id: null,
          note: null,
        }),
      team === null
        ? "The assignee was removed."
        : `The incident was assigned to the ${teamName(team)}.`
    );

    if (worked && mountedRef.current) {
      setAssignChoice(null);
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
      () =>
        apiPost(`/incidents/${detail.incident.id}/notes`, { note }),
      "Note added."
    );

    if (worked && mountedRef.current) {
      setNoteText("");
    }
  };

  // Deletes one incident (with its timeline). It is used by the
  // "Delete" button of the table and by the details window.
  const deleteIncident = async (target) => {
    if (!target || actionBusy) {
      return;
    }

    deletingRef.current = true;

    setActionBusy("delete");
    setActionError("");

    try {
      await apiDelete(`/incidents/${target.id}`);

      if (!mountedRef.current) {
        return;
      }

      listVersionRef.current += 1;

      setIncidents((previous) =>
        previous.filter((item) => item.id !== target.id)
      );

      if (detailIdRef.current === target.id) {
        closeDetail();
      }

      deleteIdRef.current = null;

      setDeleteTarget(null);
      setActionBusy("");

      showToast(`${target.number} was deleted.`);
    } catch (error) {
      if (mountedRef.current) {
        setActionError(
          getErrorMessage(error, "The incident could not be deleted.")
        );

        setActionBusy("");
      }
    } finally {
      deletingRef.current = false;
    }
  };

  const handleDelete = () => {
    if (detail) {
      deleteIncident(detail.incident);
    }
  };

  const openDeleteDialog = (incident) => {
    setActionError("");
    setDeleteTarget(incident);
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
    if (!showForm && !detailOpen && !deleteOpen) {
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
      } else if (detailOpen) {
        if (!actionBusy) {
          closeDetail();
        }
      } else if (!submitting) {
        closeForm();
      }
    };

    document.addEventListener("keydown", handleKey);

    return () => document.removeEventListener("keydown", handleKey);
  }, [
    showForm,
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

  const filteredIncidents = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortIncidents(incidents).filter((incident) => {
      const matchesSearch =
        !query ||
        [
          incident.number,
          incident.type,
          incident.location,
          incident.vessel,
          incident.description,
          incident.reportedBy ? incident.reportedBy.name : "",
          assigneeName(incident),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesSeverity =
        severityFilter === "All" || incident.severity === severityFilter;

      const matchesStatus =
        statusFilter === "All" || incident.status === statusFilter;

      const matchesType =
        typeFilter === "All" || incident.type === typeFilter;

      return (
        matchesSearch &&
        matchesSeverity &&
        matchesStatus &&
        matchesType
      );
    });
  }, [incidents, search, severityFilter, statusFilter, typeFilter]);

  // The four cards at the top are counted from the real incidents.
  const today = new Date();

  const openIncidents = incidents.filter(
    (item) => !FINISHED_STATUSES.includes(item.status)
  ).length;

  const criticalIncidents = incidents.filter(
    (item) =>
      item.severity === "Critical" &&
      !FINISHED_STATUSES.includes(item.status)
  ).length;

  const investigationIncidents = incidents.filter(
    (item) => item.status === "Under Investigation"
  ).length;

  const resolvedToday = incidents.filter((item) => {
    const resolved = parseDate(item.resolvedAt);

    return (
      !!resolved &&
      FINISHED_STATUSES.includes(item.status) &&
      isSameDay(resolved, today)
    );
  }).length;

  // -------------------------------------------------------
  // THE OPEN WINDOW
  // -------------------------------------------------------

  const selected = detail ? detail.incident : null;

  const chosenStatus = selected
    ? statusChoice || selected.status
    : "";

  const currentAssignee = selected ? assigneeChoiceOf(selected) : "";

  const chosenAssignee =
    assignChoice === null ? currentAssignee : assignChoice;

  // Every designation once. What the incident has now stays in the
  // list even when it is not offered any more (the designation of
  // the person looking at it, or a single person assigned earlier).
  const currentIsListed =
    !currentAssignee.startsWith("team:") ||
    designations.some(
      (item) => `team:${item.name}` === currentAssignee
    );

  const currentIsPerson = currentAssignee.startsWith("person:");

  const chosenTeam = chosenAssignee.startsWith("team:")
    ? designations.find(
        (item) => `team:${item.name}` === chosenAssignee
      ) || null
    : null;

  const colSpan = 8;

  const maxOccurredAt = toLocalInput(
    new Date(Date.now() + FUTURE_SLACK_MS)
  );

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div ref={rootRef} className="mt-3">

      {/* SUBTITLE */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-300">
          Monitor, report and manage operational incidents across Singapore Port.
        </p>

        {connectionLost && (
          <span className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <MdRefresh className="h-4 w-4 animate-spin" />
            Reconnecting...
          </span>
        )}
      </div>

      {/* KPI CARDS */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div
          className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800"
          title="Incidents that are not Resolved or Closed yet"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Open Incidents
              </p>
              <p
                data-testid="kpi-open"
                className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
              >
                {openIncidents}
              </p>
            </div>
            <div className="rounded-xl bg-blue-100 p-3 text-blue-500 dark:bg-blue-500/10">
              <MdWarning className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800"
          title="Critical incidents that are not Resolved or Closed yet"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Critical Incidents
              </p>
              <p
                data-testid="kpi-critical"
                className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
              >
                {criticalIncidents}
              </p>
            </div>
            <div className="rounded-xl bg-red-100 p-3 text-red-500 dark:bg-red-500/10">
              <MdError className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Under Investigation
              </p>
              <p
                data-testid="kpi-investigation"
                className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
              >
                {investigationIncidents}
              </p>
            </div>
            <div className="rounded-xl bg-purple-100 p-3 text-purple-500 dark:bg-purple-500/10">
              <MdAccessTime className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800"
          title="Incidents that were resolved or closed today"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Resolved Today
              </p>
              <p
                data-testid="kpi-resolved"
                className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
              >
                {resolvedToday}
              </p>
            </div>
            <div className="rounded-xl bg-green-100 p-3 text-green-500 dark:bg-green-500/10">
              <MdCheckCircle className="h-6 w-6" />
            </div>
          </div>
        </div>

      </div>

      {/* INCIDENT TABLE CARD */}
      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">

        {/* HEADER */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Incident Register
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Track current and historical port incidents.
            </p>
          </div>

          <button
            type="button"
            onClick={openForm}
            data-testid="report-button"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
          >
            <MdAdd className="h-5 w-5" />
            Report Incident
          </button>

        </div>

        {/* FILTERS */}
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">

          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search incidents..."
              aria-label="Search incidents"
              data-testid="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
            />
          </div>

          <select
            value={severityFilter}
            aria-label="Filter by severity"
            data-testid="severity-filter"
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Severities</option>
            {SEVERITIES.map((item) => (
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
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            aria-label="Filter by incident type"
            data-testid="type-filter"
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none dark:border-white/10 dark:bg-navy-900 dark:text-white"
          >
            <option value="All">All Incident Types</option>
            {INCIDENT_TYPES.map((item) => (
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
              Incident Management is not available
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              {loadError}
            </p>

            <button
              type="button"
              onClick={() => {
                setLoadState("loading");
                loadIncidents();
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
              data-testid="incident-table"
            >

              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Incident
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Type
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Location
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Severity
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Assigned To
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Date / Time
                  </th>
                  <th className="sticky right-0 bg-white px-2 py-4 text-left text-xs font-bold uppercase text-gray-500 dark:bg-navy-800">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredIncidents.map((incident) => (
                  <tr
                    key={incident.id}
                    data-testid="incident-row"
                    data-number={incident.number}
                    className="group border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <td className="px-2 py-4">
                      <p className="whitespace-nowrap text-sm font-bold text-navy-700 dark:text-white">
                        {incident.number}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {incident.reportedBy
                          ? incident.reportedBy.name
                          : "—"}
                      </p>
                    </td>

                    <td className="px-2 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {incident.type}
                    </td>

                    <td className="px-2 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {incident.location}
                    </td>

                    <td className="px-2 py-4">
                      <span
                        data-testid="row-severity"
                        className={`rounded-full px-3 py-1 text-xs font-bold ${severityClasses[incident.severity] || ""}`}
                      >
                        {incident.severity}
                      </span>
                    </td>

                    <td className="px-2 py-4">
                      <span
                        data-testid="row-status"
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${statusClasses[incident.status] || ""}`}
                      >
                        {incident.status}
                      </span>
                    </td>

                    <td className="px-2 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {assigneeName(incident) ? (
                        assigneeName(incident)
                      ) : (
                        <span className="text-gray-400">
                          Not assigned
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-4">
                      <p className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(incident.occurredAt)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTime(incident.occurredAt)}
                      </p>
                    </td>

                    <td className="sticky right-0 bg-white px-2 py-4 group-hover:bg-gray-50 dark:bg-navy-800 dark:group-hover:bg-[#1d274d]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(incident)}
                          data-testid="view-button"
                          className="rounded-lg bg-lightPrimary px-3 py-2 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white dark:bg-navy-900"
                        >
                          View
                        </button>

                        {incident.canDelete && (
                          <button
                            type="button"
                            onClick={() => openDeleteDialog(incident)}
                            title="Delete this incident"
                            aria-label={`Delete ${incident.number}`}
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

                {filteredIncidents.length === 0 && (
                  <tr>
                    <td
                      colSpan={colSpan}
                      data-testid="empty-row"
                      className="px-3 py-12 text-center text-sm text-gray-500"
                    >
                      {loadState === "loading"
                        ? "Loading incidents..."
                        : incidents.length === 0
                        ? "No incidents have been reported yet. Select Report Incident to record the first one."
                        : "No incidents match your search or filters."}
                    </td>
                  </tr>
                )}
              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* REPORT INCIDENT WINDOW */}
      {showForm && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="report-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget && !submitting) {
                closeForm();
              }
            }}
          >

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Report New Incident"
              data-testid="report-dialog"
              className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >

              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-700 dark:text-white">
                    Report New Incident
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Record an operational incident. You are saved as the
                    reporter.
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
                onSubmit={handleCreateIncident}
                noValidate
                className="space-y-4"
              >

                <div>
                  <label htmlFor="incident-type" className={labelClasses}>
                    Incident Type
                  </label>
                  <select
                    id="incident-type"
                    value={form.type}
                    disabled={submitting}
                    onChange={(e) => handleFormChange("type", e.target.value)}
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
                  <label htmlFor="incident-location" className={labelClasses}>
                    Location
                  </label>
                  <input
                    id="incident-location"
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
                    <label htmlFor="incident-severity" className={labelClasses}>
                      Severity
                    </label>
                    <select
                      id="incident-severity"
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
                    <label htmlFor="incident-vessel" className={labelClasses}>
                      Vessel
                    </label>
                    <input
                      id="incident-vessel"
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
                  <label htmlFor="incident-time" className={labelClasses}>
                    When did it happen?
                  </label>
                  <input
                    id="incident-time"
                    type="datetime-local"
                    value={form.occurredAt}
                    max={maxOccurredAt}
                    disabled={submitting}
                    onChange={(e) =>
                      handleFormChange("occurredAt", e.target.value)
                    }
                    className={`${inputClasses} dark:[color-scheme:dark]`}
                  />
                </div>

                <div>
                  <label htmlFor="incident-description" className={labelClasses}>
                    Description
                  </label>
                  <textarea
                    id="incident-description"
                    value={form.description}
                    maxLength={MAX_TEXT}
                    disabled={submitting}
                    onChange={(e) =>
                      handleFormChange("description", e.target.value)
                    }
                    placeholder="Describe the incident..."
                    rows="4"
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  />
                </div>

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
                  {submitting && <MdRefresh className="h-4 w-4 animate-spin" />}
                  {submitting ? "Saving..." : "Submit Incident Report"}
                </button>

              </form>

            </div>
          </div>
        </BodyPortal>
      )}

      {/* INCIDENT DETAILS WINDOW */}
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
              aria-label={`Incident ${selected.number}`}
              data-testid="detail-dialog"
              className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >

              <div className="mb-5 flex items-start justify-between">

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-500">
                    Incident Details
                  </p>

                  <h2
                    data-testid="detail-number"
                    className="mt-1 text-2xl font-bold text-navy-700 dark:text-white"
                  >
                    {selected.number}
                  </h2>
                </div>

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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div>
                  <p className="text-xs text-gray-500">Incident Type</p>
                  <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                    {selected.type}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                    {selected.location}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Severity</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${severityClasses[selected.severity] || ""}`}
                  >
                    {selected.severity}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span
                    data-testid="detail-status"
                    className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${statusClasses[selected.status] || ""}`}
                  >
                    {selected.status}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Reported By</p>
                  <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                    {selected.reportedBy
                      ? selected.reportedBy.name
                      : "—"}
                  </p>
                  {selected.reportedBy && selected.reportedBy.role && (
                    <p className="text-xs text-gray-500">
                      {selected.reportedBy.role}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-500">Assigned To</p>
                  <p
                    data-testid="detail-assigned"
                    className="mt-1 text-sm font-semibold text-navy-700 dark:text-white"
                  >
                    {assigneeName(selected) || "Not assigned"}
                  </p>
                  {assigneeDetail(selected) && (
                    <p className="text-xs text-gray-500">
                      {assigneeDetail(selected)}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-500">Vessel</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-navy-700 dark:text-white">
                    <MdDirectionsBoat className="h-4 w-4 text-brand-500" />
                    {selected.vessel || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Happened</p>
                  <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                    {formatDateTime(selected.occurredAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Reported</p>
                  <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                    {formatDateTime(selected.createdAt)}
                  </p>
                </div>

                {selected.resolvedAt && (
                  <div>
                    <p className="text-xs text-gray-500">Resolved</p>
                    <p className="mt-1 text-sm font-semibold text-navy-700 dark:text-white">
                      {formatDateTime(selected.resolvedAt)}
                    </p>
                  </div>
                )}

              </div>

              <div className="mt-5 rounded-xl bg-lightPrimary p-4 dark:bg-navy-900">
                <p className="text-xs font-bold uppercase text-gray-500">
                  Description
                </p>

                <p
                  data-testid="detail-description"
                  className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-300"
                >
                  {selected.description}
                </p>
              </div>

              {/* UPDATE: STATUS AND ASSIGNEE */}

              <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-white/10">

                <p className="mb-3 text-xs font-bold uppercase text-gray-500">
                  Update this incident
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                  <div>
                    <label htmlFor="detail-status-select" className={labelClasses}>
                      Status
                    </label>

                    <select
                      id="detail-status-select"
                      value={chosenStatus}
                      disabled={!!actionBusy}
                      onChange={(e) => setStatusChoice(e.target.value)}
                      className={inputClasses}
                    >
                      {STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={statusNote}
                      maxLength={MAX_NOTE}
                      disabled={!!actionBusy}
                      onChange={(e) => setStatusNote(e.target.value)}
                      aria-label="Note for the status change"
                      placeholder="Note (optional)"
                      className={`${inputClasses} mt-2`}
                    />

                    <button
                      type="button"
                      onClick={handleChangeStatus}
                      disabled={
                        !!actionBusy || chosenStatus === selected.status
                      }
                      data-testid="update-status"
                      className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionBusy === "status" && (
                        <MdRefresh className="h-4 w-4 animate-spin" />
                      )}
                      Update status
                    </button>
                  </div>

                  <div>
                    <label htmlFor="detail-assign-select" className={labelClasses}>
                      Assigned to
                    </label>

                    <select
                      id="detail-assign-select"
                      value={chosenAssignee}
                      disabled={!!actionBusy}
                      onChange={(e) => setAssignChoice(e.target.value)}
                      className={inputClasses}
                    >
                      <option value="">Not assigned</option>

                      {currentIsPerson && (
                        <option value={currentAssignee}>
                          {selected.assignedTo.name}
                          {selected.assignedTo.role
                            ? ` (${selected.assignedTo.role})`
                            : ""}
                        </option>
                      )}

                      {!currentIsListed && (
                        <option value={currentAssignee}>
                          {teamName(selected.assignedRole)}
                        </option>
                      )}

                      {designations.map((item) => (
                        <option
                          key={item.name}
                          value={`team:${item.name}`}
                        >
                          {teamName(item.name)}
                        </option>
                      ))}
                    </select>

                    <p
                      data-testid="assign-hint"
                      className="mt-2 flex min-h-[2.75rem] items-center text-xs text-gray-400"
                    >
                      {teamHint(chosenTeam)}
                    </p>

                    <button
                      type="button"
                      onClick={handleAssign}
                      disabled={
                        !!actionBusy ||
                        assignChoice === null ||
                        assignChoice === currentAssignee
                      }
                      data-testid="update-assignee"
                      className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionBusy === "assign" && (
                        <MdRefresh className="h-4 w-4 animate-spin" />
                      )}
                      Save assignment
                    </button>
                  </div>

                </div>

              </div>

              {/* TIMELINE */}

              <div className="mt-5">

                <p className="mb-3 text-xs font-bold uppercase text-gray-500">
                  Timeline
                </p>

                {detail.events === null && !detail.error && (
                  <p className="text-sm text-gray-400">
                    Loading timeline...
                  </p>
                )}

                {detail.error && (
                  <p
                    role="alert"
                    data-testid="timeline-error"
                    className="text-xs font-semibold text-red-500"
                  >
                    {detail.error}
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

                        <p className="text-sm text-navy-700 dark:text-white">
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
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white"
                  />

                  <button
                    type="submit"
                    disabled={!!actionBusy || !noteText.trim()}
                    data-testid="add-note"
                    className="mt-2 flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === "note" && (
                      <MdRefresh className="h-4 w-4 animate-spin" />
                    )}
                    Add note
                  </button>

                </form>

              </div>

              {actionError && (
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
                      data-testid="delete-incident"
                      className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                    >
                      <MdDeleteOutline className="h-5 w-5" />
                      Delete this incident
                    </button>
                  )}

                  {confirmDelete && (
                    <div
                      data-testid="delete-confirm"
                      className="rounded-xl bg-red-50 p-4 dark:bg-red-500/10"
                    >
                      <p className="text-sm font-semibold text-red-600 dark:text-red-300">
                        Delete {selected.number} for good?
                      </p>

                      <p className="mt-1 text-xs text-red-500 dark:text-red-300">
                        The incident and its whole timeline are removed
                        for everybody. This cannot be undone.
                      </p>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={!!actionBusy}
                          data-testid="confirm-delete"
                          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          {actionBusy === "delete" && (
                            <MdRefresh className="h-4 w-4 animate-spin" />
                          )}
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

      {/* DELETE QUESTION (opened from the table) */}
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
              aria-label={`Delete ${deleteTarget.number}`}
              data-testid="delete-dialog"
              className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >

              <div className="flex items-start gap-3">

                <div className="flex-shrink-0 rounded-xl bg-red-100 p-3 text-red-500 dark:bg-red-500/10">
                  <MdDeleteOutline className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-navy-700 dark:text-white">
                    Delete {deleteTarget.number} for good?
                  </h2>

                  <p className="mt-1 break-words text-sm text-gray-500 dark:text-gray-300">
                    {deleteTarget.type} at {deleteTarget.location}
                  </p>
                </div>

              </div>

              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                The incident and its whole timeline are removed for
                everybody. This cannot be undone.
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
                  onClick={() => deleteIncident(deleteTarget)}
                  disabled={!!actionBusy}
                  data-testid="row-confirm-delete"
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionBusy === "delete" && (
                    <MdRefresh className="h-4 w-4 animate-spin" />
                  )}
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

export default IncidentManagement;
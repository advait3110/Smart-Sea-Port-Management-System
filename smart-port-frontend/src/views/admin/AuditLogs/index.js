import React from "react";

import { createPortal } from "react-dom";

import {
  MdAddCircleOutline,
  MdClose,
  MdDeleteOutline,
  MdEdit,
  MdErrorOutline,
  MdFileDownload,
  MdHistory,
  MdInfoOutline,
  MdLock,
  MdPeople,
  MdRefresh,
  MdSearch,
} from "react-icons/md";

import { apiGet } from "../../../services/api";

import { startPollTimer } from "../../../services/pollTimer";

import {
  PRESETS,
  PORT_TIME_ZONE,
  TICK_MS,
  EARLIEST_DAY,
  dayOfMs,
  dayKey,
  momentMs,
  presetRange,
  resolveRange,
  periodLabel,
  fmt,
  isDenied,
} from "../Analytics/figures";

import { CHART_CSS, DatePicker } from "../Analytics/charts";

// =========================================================
// AUDIT LOGS
// =========================================================
//
// A record of who did what in the port's work, kept by the system
// itself. Nobody can add, change or delete an entry (not even the
// Port Administrator): the page only reads.
//
// Only the Port Administrator and the Port Executive can read it
// (the server refuses everybody else).
//
// What it shows (the port's own activity):
//   - vessels, berths, cargo operations, gate and trucks,
//     incidents, asset maintenance and documents
//   - every record added, changed or deleted there, with what it
//     was before and after the change
//   - opening or downloading a document, making a report
// Sign-ins, account and role changes are not part of this page.
// Passwords and chat messages are never recorded. Only looking
// at a page is not recorded.
//
//   GET /audit/summary   the number cards + the lists for the filters
//   GET /audit           the entries, newest first (50 at a time)
//   GET /audit/export    the same entries as a CSV file
//
// All dates and times are Singapore time (UTC+8).
// The page refreshes itself every 30 seconds.
//
// =========================================================

// =========================================================
// SETTINGS
// =========================================================

const PAGE_SIZE = 50;

const REFRESH_MS = 30 * 1000;

const SEARCH_DELAY_MS = 350;

const RESULTS = ["Success", "Failed", "Refused"];

const RESULT_HINTS = {
  Success: "It worked.",
  Failed: "The server could not complete it.",
  Refused: "This account is not allowed to do this.",
};

const resultClasses = {
  Success:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  Failed: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  Refused:
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
};

const categoryClasses = {
  sign_in: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  sign_out: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  failed_sign_in:
    "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  create:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  change:
    "bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  delete: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  download: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  report:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
};

const FALLBACK_CATEGORY_CLASS =
  "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";

const inputClasses =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

// =========================================================
// SMALL HELPERS
// =========================================================

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORT_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatDate = (value) => {
  const ms = momentMs(value);

  return ms === null ? "—" : dateFormatter.format(new Date(ms));
};

const formatTime = (value) => {
  const ms = momentMs(value);

  return ms === null ? "" : timeFormatter.format(new Date(ms));
};

const getErrorMessage = (error, fallback) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error?.detail && typeof error.detail === "string") {
    return error.detail;
  }

  return fallback;
};

// The server answers 403 with this sentence when the account is not
// the Port Administrator or the Port Executive. The page also
// recognises the words themselves, because the answer may reach the
// page as plain text only.
const isNotAllowed = (error) =>
  isDenied(error) ||
  /only for the Port Administrator and the Port Executive/i.test(
    String(error?.message || error?.detail || "")
  );

// "sign_in" -> "Sign in" (only used when the list of types
// from the backend does not have the word).
const prettyKey = (value) => {
  const text = String(value ?? "")
    .replace(/[_-]+/g, " ")
    .trim();

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const showValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "(empty)";
  }

  if (Array.isArray(value)) {
    return value.length ? value.map(showValue).join(", ") : "(none)";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return String(value);
};

const normalizeEntry = (raw) => ({
  id: raw.id,
  at: raw.at,
  user: raw.user
    ? {
        id: raw.user.id ?? null,
        name: raw.user.name || "",
        adminId: raw.user.admin_id || "",
        role: raw.user.role || "",
      }
    : null,
  module: raw.module || "",
  category: raw.category || "",
  action: raw.action || "",
  target: raw.target || "",
  description: raw.description || "",
  result: raw.result || "Success",
  details:
    raw.details && typeof raw.details === "object" ? raw.details : null,
  ip: raw.ip_address || "",
  device: raw.device || "",
});

const normalizeSummary = (raw) => ({
  cards: {
    events: Number(raw?.cards?.events) || 0,
    added: Number(raw?.cards?.added) || 0,
    changed: Number(raw?.cards?.changed) || 0,
    deleted: Number(raw?.cards?.deleted) || 0,
    people: Number(raw?.cards?.people) || 0,
  },
  people: Array.isArray(raw?.people)
    ? raw.people.map((person) => ({
        id: person.id,
        name: person.name || "",
        adminId: person.admin_id || "",
      }))
    : [],
  modules: Array.isArray(raw?.modules) ? raw.modules : [],
  categories: Array.isArray(raw?.categories)
    ? raw.categories.map((item) => ({ key: item.key, label: item.label }))
    : [],
});

const EMPTY_SUMMARY = normalizeSummary(null);

const personText = (entry) => {
  if (entry.user && entry.user.name) {
    return entry.user.name;
  }

  // A failed sign-in has no account: the Admin ID that was typed
  // is in the "Record" column.
  return "Not signed in";
};

// =========================================================
// DRAW OUTSIDE THE PAGE FRAME
// =========================================================

// The window and the little message are drawn straight in <body>
// (a page frame with "transform" or "filter" would move a
// "fixed" window). The dark colours and the font are passed on.
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

// Keeps running at its normal pace in a background tab too.
const useInterval = (callback, delay) => {
  const saved = React.useRef(callback);

  saved.current = callback;

  React.useEffect(
    () => startPollTimer(() => saved.current(), delay),
    [delay]
  );
};

// =========================================================
// SMALL PIECES
// =========================================================

const ResultBadge = ({ result }) => (
  <span
    data-testid="row-result"
    title={RESULT_HINTS[result] || ""}
    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
      resultClasses[result] || FALLBACK_CATEGORY_CLASS
    }`}
  >
    {result}
  </span>
);

const KpiCard = ({ label, value, note, icon, tone, testId }) => (
  <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {label}
        </p>

        <p
          data-testid={testId}
          className="mt-2 text-3xl font-bold text-navy-700 dark:text-white"
        >
          {value}
        </p>

        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>
      </div>

      <div className={`flex-shrink-0 rounded-xl p-3 ${tone}`}>{icon}</div>
    </div>
  </div>
);

const DetailRow = ({ label, children, testId }) => (
  <div className="min-w-0">
    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
      {label}
    </p>

    <p
      data-testid={testId}
      className="mt-1 break-words text-sm text-navy-700 dark:text-white"
    >
      {children}
    </p>
  </div>
);

// =========================================================
// THE PAGE
// =========================================================

const AuditLogs = () => {
  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------

  const [selection, setSelection] = React.useState({
    preset: "Today",
    from: null,
    to: null,
  });

  const [nowMs, setNowMs] = React.useState(() => Date.now());

  const [personFilter, setPersonFilter] = React.useState("");
  const [moduleFilter, setModuleFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [resultFilter, setResultFilter] = React.useState("");

  const [searchText, setSearchText] = React.useState("");
  const [search, setSearch] = React.useState("");

  const [entries, setEntries] = React.useState([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextBefore, setNextBefore] = React.useState(null);

  const [summary, setSummary] = React.useState(EMPTY_SUMMARY);

  // loading | ready | error | denied
  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState("");

  const [updatedAt, setUpdatedAt] = React.useState(null);

  const [detail, setDetail] = React.useState(null);

  const [exporting, setExporting] = React.useState(false);

  const [toast, setToast] = React.useState("");

  // -------------------------------------------------------
  // REFS
  // -------------------------------------------------------

  const rootRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const toastTimerRef = React.useRef(null);

  // Goes up whenever the filters change, so an answer for old
  // filters that arrives late is ignored.
  const generationRef = React.useRef(0);

  const busyRef = React.useRef(false);
  const entriesRef = React.useRef([]);
  const queryRef = React.useRef(null);
  const loadStateRef = React.useRef("loading");

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = React.useCallback((text) => {
    setToast(text);

    window.clearTimeout(toastTimerRef.current);

    toastTimerRef.current = window.setTimeout(() => setToast(""), 5000);
  }, []);

  // -------------------------------------------------------
  // THE SELECTED DAYS (Singapore dates)
  // -------------------------------------------------------

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

  const label = periodLabel(range, today);

  const dayCount = range.to - range.from + 1;

  // Keep "today" right when the page stays open past midnight.
  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  // The search is sent a moment after the last key.
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setSearch(searchText.trim()),
      SEARCH_DELAY_MS
    );

    return () => window.clearTimeout(timer);
  }, [searchText]);

  // -------------------------------------------------------
  // THE REQUEST (the same filters for the list and the export)
  // -------------------------------------------------------

  const filterText = (extra) => {
    const parts = [
      `start_date=${dayKey(range.from)}`,
      `end_date=${dayKey(range.to)}`,
    ];

    if (personFilter) {
      parts.push(`user_id=${encodeURIComponent(personFilter)}`);
    }

    if (moduleFilter) {
      parts.push(`module=${encodeURIComponent(moduleFilter)}`);
    }

    if (categoryFilter) {
      parts.push(`category=${encodeURIComponent(categoryFilter)}`);
    }

    if (resultFilter) {
      parts.push(`result=${encodeURIComponent(resultFilter)}`);
    }

    if (search) {
      parts.push(`q=${encodeURIComponent(search)}`);
    }

    return parts.concat(extra || []).join("&");
  };

  // The newest values for the timers (set again on every render).
  queryRef.current = {
    list: filterText([`limit=${PAGE_SIZE}`]),
    summary: `start_date=${dayKey(range.from)}&end_date=${dayKey(range.to)}`,
    export: filterText(),
    key: filterText(),
  };

  // -------------------------------------------------------
  // LOAD THE FIRST PAGE (and the cards)
  // -------------------------------------------------------

  // mode "reset": new filters, the list starts again.
  // mode "quiet": the 30-second refresh. New entries are added on
  //               top, what the person already scrolled to stays.
  const load = React.useCallback(async (mode) => {
    if (mode === "quiet" && (busyRef.current || document.hidden)) {
      return;
    }

    const generation = generationRef.current;

    const query = queryRef.current;

    busyRef.current = true;

    try {
      const [page, numbers] = await Promise.all([
        apiGet(`/audit?${query.list}`),
        apiGet(`/audit/summary?${query.summary}`),
      ]);

      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }

      const fresh = Array.isArray(page?.entries)
        ? page.entries.map(normalizeEntry)
        : [];

      const known = entriesRef.current;

      if (mode === "quiet" && known.length) {
        const newest = known[0].id;

        const added = fresh.filter((entry) => entry.id > newest);

        // More new entries than one page: start the list again.
        if (added.length === fresh.length && page.has_more) {
          entriesRef.current = fresh;

          setEntries(fresh);
          setHasMore(!!page.has_more);
          setNextBefore(page.next_before_id ?? null);
        } else if (added.length) {
          const merged = added.concat(known);

          entriesRef.current = merged;

          setEntries(merged);
        }
      } else {
        entriesRef.current = fresh;

        setEntries(fresh);
        setHasMore(!!page?.has_more);
        setNextBefore(page?.next_before_id ?? null);
        setMoreError("");
      }

      setSummary(normalizeSummary(numbers));

      setLoadState("ready");
      setLoadError("");
      setConnectionLost(false);
      setUpdatedAt(Date.now());
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }

      if (isNotAllowed(error)) {
        setLoadState("denied");

        return;
      }

      if (mode === "quiet" && loadStateRef.current === "ready") {
        setConnectionLost(true);
      } else {
        setLoadState("error");
        setLoadError(
          getErrorMessage(error, "The audit log could not be loaded.")
        );
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  loadStateRef.current = loadState;

  // The filters (or the days) changed: load again from the top.
  const filterKey = queryRef.current.key;

  React.useEffect(() => {
    generationRef.current += 1;

    busyRef.current = false;

    entriesRef.current = [];

    setEntries([]);
    setHasMore(false);
    setNextBefore(null);
    setMoreError("");
    setLoadState("loading");

    load("reset");
  }, [filterKey, load]);

  useInterval(() => {
    if (loadStateRef.current === "ready") {
      load("quiet");
    }
  }, REFRESH_MS);

  React.useEffect(() => {
    const visible = () => {
      if (!document.hidden && loadStateRef.current === "ready") {
        load("quiet");
      }
    };

    document.addEventListener("visibilitychange", visible);

    return () => document.removeEventListener("visibilitychange", visible);
  }, [load]);

  // -------------------------------------------------------
  // SHOW MORE
  // -------------------------------------------------------

  const showMore = async () => {
    if (loadingMore || nextBefore === null) {
      return;
    }

    const generation = generationRef.current;

    setLoadingMore(true);
    setMoreError("");

    try {
      const page = await apiGet(
        `/audit?${queryRef.current.list}&before_id=${nextBefore}`
      );

      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }

      const more = Array.isArray(page?.entries)
        ? page.entries.map(normalizeEntry)
        : [];

      const have = new Set(entriesRef.current.map((entry) => entry.id));

      const merged = entriesRef.current.concat(
        more.filter((entry) => !have.has(entry.id))
      );

      entriesRef.current = merged;

      setEntries(merged);
      setHasMore(!!page?.has_more);
      setNextBefore(page?.next_before_id ?? null);
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) {
        setMoreError(
          getErrorMessage(error, "More entries could not be loaded.")
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoadingMore(false);
      }
    }
  };

  // -------------------------------------------------------
  // EXPORT
  // -------------------------------------------------------

  const exportCsv = async () => {
    if (exporting) {
      return;
    }

    setExporting(true);

    try {
      const data = await apiGet(`/audit/export?${queryRef.current.export}`);

      if (!mountedRef.current) {
        return;
      }

      const blob = new Blob([data.csv || ""], {
        type: "text/csv;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download = data.filename || "audit-log.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 2000);

      showToast(
        data.truncated
          ? `Saved ${fmt(data.rows)} entries (the newest ones; narrow the dates to get the rest).`
          : `Saved ${fmt(data.rows)} ${data.rows === 1 ? "entry" : "entries"} to ${
              data.filename
            }.`
      );
    } catch (error) {
      if (mountedRef.current) {
        showToast(getErrorMessage(error, "The file could not be made."));
      }
    } finally {
      if (mountedRef.current) {
        setExporting(false);
      }
    }
  };

  // -------------------------------------------------------
  // DATES
  // -------------------------------------------------------

  const applyPreset = (name) =>
    setSelection({ preset: name, from: null, to: null });

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

  const anyFilter =
    !!personFilter ||
    !!moduleFilter ||
    !!categoryFilter ||
    !!resultFilter ||
    !!search;

  const clearFilters = () => {
    setPersonFilter("");
    setModuleFilter("");
    setCategoryFilter("");
    setResultFilter("");
    setSearchText("");
    setSearch("");
  };

  const categoryLabel = React.useCallback(
    (key) => {
      const found = summary.categories.find((item) => item.key === key);

      return found ? found.label : prettyKey(key);
    },
    [summary.categories]
  );

  // A chosen value stays in its list even when the new days do
  // not contain it any more.
  const personOptions = summary.people.some(
    (person) => String(person.id) === String(personFilter)
  )
    ? summary.people
    : personFilter
    ? summary.people.concat([
        { id: personFilter, name: "Selected person", adminId: "" },
      ])
    : summary.people;

  const moduleOptions =
    moduleFilter && !summary.modules.includes(moduleFilter)
      ? summary.modules.concat([moduleFilter])
      : summary.modules;

  const cards = summary.cards;

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div ref={rootRef} className="an-root mt-3 w-full">
      <style>{CHART_CSS}</style>

      {/* HEADER */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
            <MdHistory className="h-8 w-8" />
          </div>

          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-navy-700 dark:text-white">
              Audit Logs
            </h1>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Who added, changed or deleted what in the port's work, and when.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {connectionLost && (
            <span className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <MdRefresh className="h-4 w-4 animate-spin" />
              Reconnecting...
            </span>
          )}

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
            onClick={() => load("quiet")}
            className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-4 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          >
            <MdRefresh className="h-5 w-5" />
            Refresh
          </button>

          <button
            type="button"
            data-testid="export-button"
            disabled={exporting || loadState !== "ready"}
            onClick={exportCsv}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MdFileDownload className="h-5 w-5" />
            {exporting ? "Preparing..." : "Export CSV"}
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-gray-600 shadow-sm dark:bg-navy-800 dark:text-gray-300">
        <MdLock className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-500" />

        <p data-testid="log-note">
          Only the Port Administrator and the Port Executive can read this
          page. It shows the port's work: vessels, berths, cargo, gate and
          trucks, incidents, equipment and documents. Entries are written by
          the system and cannot be edited or deleted by anybody. Passwords and
          chat messages are never recorded.
        </p>
      </div>

      {/* DATE FILTER */}
      <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800 sm:p-6">
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
                className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
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

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
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

        <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl bg-lightPrimary p-4 dark:bg-navy-700 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Selected Period
            </p>

            <p
              data-testid="selected-period"
              className="mt-1 text-xl font-bold text-navy-700 dark:text-white"
            >
              {label}
            </p>
          </div>

          <span
            data-testid="selected-days"
            className="w-fit rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-500 dark:bg-navy-800"
          >
            {dayCount === 1 ? "1 day" : `${fmt(dayCount)} days`} · Singapore
            time
          </span>
        </div>
      </div>

      {/* NUMBER CARDS */}
      <div className="mb-6 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          testId="kpi-events"
          label="Events"
          value={fmt(cards.events)}
          note="Port activity recorded"
          tone="bg-blue-100 text-blue-500 dark:bg-blue-500/10"
          icon={<MdHistory className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-added"
          label="Added"
          value={fmt(cards.added)}
          note="New records"
          tone="bg-green-100 text-green-500 dark:bg-green-500/10"
          icon={<MdAddCircleOutline className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-changed"
          label="Changed"
          value={fmt(cards.changed)}
          note="Records edited"
          tone="bg-purple-100 text-purple-500 dark:bg-purple-500/10"
          icon={<MdEdit className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-deleted"
          label="Deleted"
          value={fmt(cards.deleted)}
          note="Records removed"
          tone={
            cards.deleted > 0
              ? "bg-red-100 text-red-500 dark:bg-red-500/10"
              : "bg-gray-100 text-gray-500 dark:bg-white/10"
          }
          icon={<MdDeleteOutline className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-people"
          label="People active"
          value={fmt(cards.people)}
          note="Different accounts"
          tone="bg-orange-100 text-orange-500 dark:bg-orange-500/10"
          icon={<MdPeople className="h-6 w-6" />}
        />
      </div>

      {/* THE LOG */}
      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Activity
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Newest first. Select an entry to see the details.
            </p>
          </div>

          {loadState === "ready" && (
            <p
              data-testid="shown-count"
              className="text-xs text-gray-500 dark:text-gray-400"
            >
              Showing {fmt(entries.length)}{" "}
              {entries.length === 1 ? "entry" : "entries"}
              {hasMore ? " (more below)" : ""}
            </p>
          )}
        </div>

        {/* FILTERS */}
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={searchText}
              placeholder="Search name, action or record..."
              aria-label="Search the log"
              data-testid="search-input"
              onChange={(event) => setSearchText(event.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
            />
          </div>

          <select
            value={personFilter}
            aria-label="Filter by person"
            data-testid="person-filter"
            onChange={(event) => setPersonFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">All people</option>

            {personOptions.map((person) => (
              <option key={person.id} value={String(person.id)}>
                {person.adminId
                  ? `${person.name} (${person.adminId})`
                  : person.name}
              </option>
            ))}
          </select>

          <select
            value={moduleFilter}
            aria-label="Filter by module"
            data-testid="module-filter"
            onChange={(event) => setModuleFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">All modules</option>

            {moduleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            aria-label="Filter by type"
            data-testid="category-filter"
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">All types</option>

            {summary.categories.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={resultFilter}
            aria-label="Filter by result"
            data-testid="result-filter"
            onChange={(event) => setResultFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">Any result</option>

            {RESULTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {anyFilter && (
          <div className="-mt-2 mb-4">
            <button
              type="button"
              data-testid="clear-filters"
              onClick={clearFilters}
              className="text-xs font-bold text-brand-500 hover:underline"
            >
              Clear the filters
            </button>
          </div>
        )}

        {/* NOT ALLOWED */}
        {loadState === "denied" && (
          <div
            role="alert"
            data-testid="denied"
            className="flex flex-col items-center rounded-xl bg-amber-50 px-4 py-10 text-center dark:bg-amber-500/10"
          >
            <MdLock className="mb-2 h-8 w-8 text-amber-500" />

            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              The Audit Logs are only for the Port Administrator and the Port
              Executive
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              Your account is not allowed to read them.
            </p>
          </div>
        )}

        {/* LOAD ERROR */}
        {loadState === "error" && (
          <div
            role="alert"
            data-testid="load-error"
            className="flex flex-col items-center rounded-xl bg-red-50 px-4 py-8 text-center dark:bg-red-500/10"
          >
            <MdErrorOutline className="mb-2 h-8 w-8 text-red-400" />

            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              The Audit Logs are not available
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              {loadError}
            </p>

            <button
              type="button"
              data-testid="try-again"
              onClick={() => {
                setLoadState("loading");
                load("reset");
              }}
              className="mt-4 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
            >
              Try again
            </button>
          </div>
        )}

        {/* LOADING / EMPTY */}
        {loadState === "loading" && (
          <p
            data-testid="loading"
            className="px-3 py-12 text-center text-sm text-gray-500"
          >
            Loading the log...
          </p>
        )}

        {loadState === "ready" && entries.length === 0 && (
          <p
            data-testid="empty-row"
            className="px-3 py-12 text-center text-sm text-gray-500"
          >
            {anyFilter
              ? "No entries match your search or filters."
              : "Nothing was recorded in this period."}
          </p>
        )}

        {/* TABLE (computer) */}
        {loadState === "ready" && entries.length > 0 && (
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[860px]" data-testid="audit-table">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Time (SGT)
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Person
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    What happened
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Record
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Result
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    &nbsp;
                  </th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    data-testid="audit-row"
                    data-id={entry.id}
                    className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <td className="px-2 py-3">
                      <p className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(entry.at)}
                      </p>

                      <p className="text-xs text-gray-500">
                        {formatTime(entry.at)}
                      </p>
                    </td>

                    <td className="px-2 py-3">
                      <p
                        data-testid="row-person"
                        className="text-sm font-bold text-navy-700 dark:text-white"
                      >
                        {personText(entry)}
                      </p>

                      <p className="text-xs text-gray-500">
                        {entry.user && entry.user.adminId
                          ? `${entry.user.adminId}${
                              entry.user.role ? ` · ${entry.user.role}` : ""
                            }`
                          : ""}
                      </p>
                    </td>

                    <td className="px-2 py-3">
                      <p
                        data-testid="row-action"
                        className="text-sm font-semibold text-navy-700 dark:text-white"
                      >
                        {entry.action}
                      </p>

                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{entry.module}</span>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            categoryClasses[entry.category] ||
                            FALLBACK_CATEGORY_CLASS
                          }`}
                        >
                          {categoryLabel(entry.category)}
                        </span>
                      </p>
                    </td>

                    <td className="max-w-[260px] px-2 py-3 text-sm text-gray-600 dark:text-gray-300">
                      <span data-testid="row-target" className="break-words">
                        {entry.target || "—"}
                      </span>
                    </td>

                    <td className="px-2 py-3">
                      <ResultBadge result={entry.result} />
                    </td>

                    <td className="px-2 py-3">
                      <button
                        type="button"
                        data-testid="view-button"
                        onClick={() => setDetail(entry)}
                        className="rounded-lg bg-lightPrimary px-3 py-2 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white dark:bg-navy-900"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* CARDS (phone) */}
        {loadState === "ready" && entries.length > 0 && (
          <div className="space-y-3 xl:hidden" data-testid="audit-cards">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-testid="audit-card"
                onClick={() => setDetail(entry)}
                className="block w-full rounded-xl border border-gray-100 p-4 text-left dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-bold text-navy-700 dark:text-white">
                    {entry.action}
                  </p>

                  <ResultBadge result={entry.result} />
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  {entry.module} · {categoryLabel(entry.category)}
                </p>

                {entry.target && (
                  <p className="mt-2 break-words text-sm text-gray-600 dark:text-gray-300">
                    {entry.target}
                  </p>
                )}

                <p className="mt-2 text-xs text-gray-500">
                  {personText(entry)} · {formatDate(entry.at)}{" "}
                  {formatTime(entry.at)}
                </p>
              </button>
            ))}
          </div>
        )}

        {loadState === "ready" && hasMore && (
          <div className="mt-5 flex flex-col items-center gap-2">
            <button
              type="button"
              data-testid="show-more"
              disabled={loadingMore}
              onClick={showMore}
              className="flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-6 py-3 text-sm font-bold text-navy-700 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
            >
              {loadingMore && <MdRefresh className="h-4 w-4 animate-spin" />}
              Show more
            </button>

            {moreError && (
              <p
                role="alert"
                data-testid="more-error"
                className="text-xs font-semibold text-red-500"
              >
                {moreError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* DETAILS WINDOW */}
      {detail && (
        <BodyPortal anchor={rootRef}>
          <div
            className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
            data-testid="detail-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setDetail(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Audit entry"
              data-testid="detail-dialog"
              className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-bold text-navy-700 dark:text-white">
                    {detail.action}
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {formatDate(detail.at)} at {formatTime(detail.at)}{" "}
                    Singapore time
                  </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <ResultBadge result={detail.result} />

                  <button
                    type="button"
                    data-testid="detail-close"
                    onClick={() => setDetail(null)}
                    aria-label="Close"
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                  >
                    <MdClose className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailRow label="Person" testId="detail-person">
                  {detail.user && detail.user.name
                    ? detail.user.name
                    : "Not signed in"}
                </DetailRow>

                <DetailRow label="Admin ID and role" testId="detail-adminid">
                  {detail.user && detail.user.adminId
                    ? `${detail.user.adminId}${
                        detail.user.role ? ` · ${detail.user.role}` : ""
                      }`
                    : "—"}
                </DetailRow>

                <DetailRow label="Module" testId="detail-module">
                  {detail.module || "—"}
                </DetailRow>

                <DetailRow label="Type" testId="detail-type">
                  {categoryLabel(detail.category) || "—"}
                </DetailRow>

                <div className="sm:col-span-2">
                  <DetailRow label="Record" testId="detail-target">
                    {detail.target || "—"}
                  </DetailRow>
                </div>

                <DetailRow label="IP address" testId="detail-ip">
                  {detail.ip || "—"}
                </DetailRow>

                <DetailRow label="Device" testId="detail-device">
                  {detail.device || "—"}
                </DetailRow>
              </div>

              {detail.description && (
                <div className="mt-5 rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
                  <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                    Note
                  </p>

                  <p
                    data-testid="detail-description"
                    className="mt-1 break-words text-sm text-navy-700 dark:text-white"
                  >
                    {detail.description}
                  </p>
                </div>
              )}

              <ChangesAndFacts details={detail.details} />

              <button
                type="button"
                onClick={() => setDetail(null)}
                className="mt-6 h-11 w-full rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
              >
                Close
              </button>
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

// =========================================================
// WHAT CHANGED + THE OTHER FACTS OF AN ENTRY
// =========================================================

const FACT_NAMES = {
  request: "Request",
  status_code: "Answer code",
  sent: "Sent with the request",
  version: "Version",
  file: "File",
  size: "Size (bytes)",
  note: "Note",
  period: "Period",
  category: "Category",
  expires_on: "Expires on",
  visibility: "Visible to",
  allowed_roles: "Roles",
  new_version_of_existing: "New version of an earlier report",
  number: "Number",
  title: "Title",
  versions: "Versions",
  was_report: "Was a report",
  rows: "Rows",
  truncated: "Cut at the limit",
  filters: "Filters",
};

const ChangesAndFacts = ({ details }) => {
  if (!details) {
    return null;
  }

  const changes = Array.isArray(details.changes) ? details.changes : [];

  const facts = Object.keys(details).filter(
    (key) => key !== "changes" && key !== "sent"
  );

  const sent =
    details.sent && typeof details.sent === "object"
      ? Object.keys(details.sent)
      : [];

  return (
    <>
      {changes.length > 0 && (
        <div className="mt-5" data-testid="detail-changes">
          <p className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            What changed
          </p>

          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-lightPrimary dark:bg-navy-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500">
                    Field
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500">
                    Before
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500">
                    After
                  </th>
                </tr>
              </thead>

              <tbody>
                {changes.map((item, index) => (
                  <tr
                    key={`${item.field}-${index}`}
                    data-testid="change-row"
                    className="border-t border-gray-100 dark:border-white/10"
                  >
                    <td className="px-3 py-2 font-semibold text-navy-700 dark:text-white">
                      {item.field}
                    </td>

                    <td className="break-words px-3 py-2 text-gray-500 dark:text-gray-400">
                      {showValue(item.before)}
                    </td>

                    <td className="break-words px-3 py-2 font-semibold text-navy-700 dark:text-white">
                      {showValue(item.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(facts.length > 0 || sent.length > 0) && (
        <div className="mt-5" data-testid="detail-facts">
          <p className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
            More information
          </p>

          <dl className="space-y-1.5 text-sm">
            {facts.map((key) => (
              <div key={key} className="flex gap-3">
                <dt className="w-44 flex-shrink-0 text-gray-500 dark:text-gray-400">
                  {FACT_NAMES[key] || prettyKey(key)}
                </dt>

                <dd className="min-w-0 break-words text-navy-700 dark:text-white">
                  {showValue(details[key])}
                </dd>
              </div>
            ))}

            {sent.map((key) => (
              <div key={`sent-${key}`} className="flex gap-3">
                <dt className="w-44 flex-shrink-0 text-gray-500 dark:text-gray-400">
                  {prettyKey(key)}
                </dt>

                <dd className="min-w-0 break-words text-navy-700 dark:text-white">
                  {showValue(details.sent[key])}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <MdInfoOutline className="mt-0.5 h-4 w-4 flex-shrink-0" />
            Passwords are never recorded.
          </p>
        </div>
      )}
    </>
  );
};

export default AuditLogs;
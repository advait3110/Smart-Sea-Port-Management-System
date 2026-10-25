import React from "react";

import { createPortal } from "react-dom";

import {
  MdAdd,
  MdAssessment,
  MdBlock,
  MdClose,
  MdCloudUpload,
  MdDeleteOutline,
  MdDescription,
  MdEdit,
  MdErrorOutline,
  MdEventBusy,
  MdFileDownload,
  MdFolderOpen,
  MdImage,
  MdInsertDriveFile,
  MdLink,
  MdLock,
  MdOpenInNew,
  MdPictureAsPdf,
  MdRefresh,
  MdSearch,
  MdWarning,
} from "react-icons/md";

import { apiGet, apiPost, apiDelete } from "../../../services/api";

import { startPollTimer } from "../../../services/pollTimer";

import {
  PORT_TIME_ZONE,
  TICK_MS,
  EARLIEST_DAY,
  dayOfMs,
  dayKey,
  formatDay,
  momentMs,
  presetRange,
  periodLabel,
  toDayNumber,
  fmt,
  isDenied,
} from "../Analytics/figures";

import { CHART_CSS, DatePicker } from "../Analytics/charts";

// =========================================================
// DOCUMENT MANAGEMENT
// =========================================================
//
// The library of the port's papers: arrival papers, cargo
// documents, customs permits, safety plans, inspection reports,
// policies and the PDF reports made by this page. Everything is
// saved in the database through the backend; there are no sample
// documents.
//
//   GET    /documents                   the library + the choices
//   POST   /documents                   upload a new document
//   POST   /documents/reports           make the PDF report for a day
//                                       or a period (max 31 days);
//                                       only the Port Administrator
//                                       and the Port Executive
//   GET    /documents/{id}              one document + its versions
//   GET    /documents/{id}/file         the file (?version=2)
//   POST   /documents/{id}/versions     upload a newer file
//   POST   /documents/{id}/edit         change the details
//   DELETE /documents/{id}              delete it with all versions
//
// A document can have a date when it stops being valid. 30 days
// before that day (and on the day) the person who uploaded it and
// the Port Administrator get a bell message.
//
// Who may see a document: everybody who has the Documents
// feature, or only the roles chosen at upload. The person who
// uploaded it and the Port Administrator can always see it, and
// only they can change or delete it.
//
// Every upload, change, deletion, opening and report is written
// to the Audit Logs. All dates and times are Singapore time.
//
// =========================================================

// =========================================================
// SETTINGS
// =========================================================

const REFRESH_MS = 30 * 1000;

const SHOW_STEP = 40;

const REPORT_MAX_DAYS = 31;

const REPORT_PRESETS = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days"];

// What the browser can show by itself in a new tab.
const SHOWN_IN_BROWSER = ["pdf", "png", "jpg", "jpeg", "txt"];

const LINK_HINTS = {
  Vessel: "e.g. MV Pacific Star",
  "Cargo record": "e.g. the cargo or container reference",
  Incident: "e.g. INC-2026-004",
  Equipment: "e.g. CRN-001 Gantry Crane 1",
};

const STATUS_FILTERS = [
  { key: "valid", label: "Valid" },
  { key: "expiring", label: "Expiring soon" },
  { key: "expired", label: "Expired" },
  { key: "none", label: "No expiry date" },
];

const statusClasses = {
  valid: "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  expiring:
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  expired: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  none: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

const inputClasses =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const textareaClasses =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-navy-700 outline-none focus:border-brand-500 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white";

const labelClasses =
  "mb-1.5 block text-sm font-semibold text-navy-700 dark:text-white";

const primaryButton =
  "flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

const quietButton =
  "flex items-center justify-center gap-2 rounded-xl bg-lightPrimary px-4 py-3 text-sm font-bold text-navy-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600";

const smallButton =
  "flex items-center gap-1.5 rounded-lg bg-lightPrimary px-3 py-2 text-xs font-bold text-brand-500 transition hover:bg-brand-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-navy-900";

// =========================================================
// SMALL HELPERS
// =========================================================

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORT_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORT_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PORT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatStamp = (value) => {
  const ms = momentMs(value);

  return ms === null ? "—" : dateTimeFormatter.format(new Date(ms));
};

const formatStampDate = (value) => {
  const ms = momentMs(value);

  return ms === null ? "—" : dateFormatter.format(new Date(ms));
};

// "2026-12-31" -> "31 Dec 2026" (a calendar date, no time zone).
const formatCalendarDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));

  if (!match) {
    return "—";
  }

  return formatDay(toDayNumber(+match[1], +match[2], +match[3]));
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

const formatSize = (bytes) => {
  const size = Number(bytes) || 0;

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const extensionOf = (name) => {
  const text = String(name || "");

  const dot = text.lastIndexOf(".");

  return dot === -1 ? "" : text.slice(dot + 1).toLowerCase();
};

const canShowInBrowser = (name) => SHOWN_IN_BROWSER.includes(extensionOf(name));

const titleFromFileName = (name) =>
  String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const statusWords = (document) => {
  const left = document.daysLeft;

  switch (document.status) {
    case "expired":
      return left === -1
        ? "Expired yesterday"
        : `Expired ${fmt(Math.abs(left))} days ago`;

    case "expiring":
      if (left === 0) {
        return "Expires today";
      }

      return left === 1 ? "Expires tomorrow" : `Expires in ${fmt(left)} days`;

    case "valid":
      return "Valid";

    default:
      return "No expiry date";
  }
};

const normalizeDocument = (raw) => ({
  id: raw.id,
  number: raw.number || "",
  title: raw.title || "",
  category: raw.category || "",
  description: raw.description || "",
  expiresOn: raw.expires_on || "",
  status: raw.status || "none",
  daysLeft: typeof raw.days_left === "number" ? raw.days_left : null,
  link: raw.link
    ? { type: raw.link.type || "", label: raw.link.label || "" }
    : null,
  visibility: raw.visibility === "roles" ? "roles" : "all",
  allowedRoles: Array.isArray(raw.allowed_roles) ? raw.allowed_roles : [],
  isReport: !!raw.is_report,
  reportStart: raw.report_start || "",
  reportEnd: raw.report_end || "",
  version: raw.version || 1,
  versionCount: raw.version_count || 1,
  file: {
    name: raw.file?.name || "",
    type: raw.file?.type || "",
    size: raw.file?.size || 0,
    at: raw.file?.at || "",
  },
  uploadedBy: {
    id: raw.uploaded_by?.id ?? null,
    name: raw.uploaded_by?.name || "",
    role: raw.uploaded_by?.role || "",
  },
  createdAt: raw.created_at || "",
  updatedAt: raw.updated_at || "",
  canChange: !!raw.can_change,
});

const normalizeVersion = (raw) => ({
  version: raw.version,
  fileName: raw.file_name || "",
  fileType: raw.file_type || "",
  fileSize: raw.file_size || 0,
  note: raw.note || "",
  uploadedBy: raw.uploaded_by?.name || "",
  createdAt: raw.created_at || "",
});

const normalizeOptions = (raw) => ({
  categories: Array.isArray(raw?.categories) ? raw.categories : [],
  reportCategory: raw?.report_category || "Port Reports",
  linkTypes: Array.isArray(raw?.link_types) ? raw.link_types : [],
  roles: Array.isArray(raw?.roles) ? raw.roles : [],
  maxFileMb: raw?.max_file_mb || 10,
  fileTypes: Array.isArray(raw?.file_types) ? raw.file_types : [],
  warningDays: raw?.expiry_warning_days || 30,
});

// A document file turned into something the browser can save or show.
const fileToBlob = (file) => {
  const binary = window.atob(file.data || "");

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], {
    type: file.file_type || "application/octet-stream",
  });
};

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = name || "document";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};

// The text of a chosen file as the base64 the backend expects.
const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || "");

      const comma = text.indexOf(",");

      resolve(comma === -1 ? text : text.slice(comma + 1));
    };

    reader.onerror = () => reject(new Error("The file could not be read."));

    reader.readAsDataURL(file);
  });

const firstText = (item, keys) => {
  for (const key of keys) {
    const value = item?.[key];

    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
};

const asRows = (data, key) => {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data[key])) {
    return data[key];
  }

  if (data && Array.isArray(data.items)) {
    return data.items;
  }

  return [];
};

// =========================================================
// DRAW OUTSIDE THE PAGE FRAME
// =========================================================

// The windows and the little message are drawn straight in <body>
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

const FileIcon = ({ name, className }) => {
  const extension = extensionOf(name);

  if (extension === "pdf") {
    return <MdPictureAsPdf className={className} />;
  }

  if (["png", "jpg", "jpeg"].includes(extension)) {
    return <MdImage className={className} />;
  }

  if (["doc", "docx", "txt"].includes(extension)) {
    return <MdDescription className={className} />;
  }

  return <MdInsertDriveFile className={className} />;
};

const StatusChip = ({ document }) => (
  <span
    data-testid="status-chip"
    data-status={document.status}
    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
      statusClasses[document.status] || statusClasses.none
    }`}
  >
    {statusWords(document)}
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

const WindowFrame = ({
  anchor,
  title,
  subtitle,
  onClose,
  busy,
  wide,
  testId,
  children,
}) => (
  <BodyPortal anchor={anchor}>
    <div
      className="fixed inset-0 z-[3000] flex justify-center overflow-y-auto bg-black/50 p-5"
      data-testid={`${testId}-backdrop`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`my-auto w-full ${
          wide ? "max-w-3xl" : "max-w-xl"
        } rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-800`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold text-navy-700 dark:text-white">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            data-testid={`${testId}-close`}
            className="flex-shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  </BodyPortal>
);

const ErrorLine = ({ message, testId }) =>
  message ? (
    <div
      role="alert"
      data-testid={testId}
      className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:bg-red-500/10"
    >
      {message}
    </div>
  ) : null;

// =========================================================
// THE FORM (upload and "edit details")
// =========================================================

const emptyForm = {
  title: "",
  category: "",
  description: "",
  expiresOn: "",
  linkType: "",
  linkLabel: "",
  visibility: "all",
  allowedRoles: [],
};

const formFromDocument = (document) => ({
  title: document.title,
  category: document.category,
  description: document.description,
  expiresOn: document.expiresOn,
  linkType: document.link ? document.link.type : "",
  linkLabel: document.link ? document.link.label : "",
  visibility: document.visibility,
  allowedRoles: document.allowedRoles.slice(),
});

const DocumentForm = ({
  mode,
  form,
  setForm,
  options,
  suggestions,
  chosenFile,
  onChooseFile,
  fileError,
  busy,
  reportCategory,
}) => {
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const toggleRole = (name) =>
    setForm((old) => ({
      ...old,
      allowedRoles: old.allowedRoles.includes(name)
        ? old.allowedRoles.filter((item) => item !== name)
        : old.allowedRoles.concat([name]),
    }));

  const list = form.linkType ? suggestions[form.linkType] || [] : [];

  const accept = options.fileTypes.map((item) => `.${item}`).join(",");

  return (
    <div className="space-y-4">
      {mode === "upload" && (
        <div>
          <label htmlFor="doc-file" className={labelClasses}>
            File
          </label>

          <input
            id="doc-file"
            type="file"
            accept={accept}
            disabled={busy}
            data-testid="doc-file"
            onChange={onChooseFile}
            className="block w-full cursor-pointer rounded-xl border border-dashed border-gray-300 bg-lightPrimary p-3 text-sm text-navy-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white dark:border-white/20 dark:bg-navy-900 dark:text-white"
          />

          <p className="mt-1.5 text-xs text-gray-500">
            {chosenFile
              ? `${chosenFile.name} · ${formatSize(chosenFile.size)}`
              : `PDF, Word, Excel, CSV, text or picture. At most ${options.maxFileMb} MB.`}
          </p>

          {fileError && <ErrorLine message={fileError} testId="file-error" />}
        </div>
      )}

      <div>
        <label htmlFor="doc-title" className={labelClasses}>
          Title
        </label>

        <input
          id="doc-title"
          type="text"
          value={form.title}
          maxLength={160}
          disabled={busy}
          onChange={(event) => change("title", event.target.value)}
          placeholder="e.g. Berth 4 arrival checklist"
          className={inputClasses}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="doc-category" className={labelClasses}>
            Category
          </label>

          {form.category === reportCategory ? (
            <input
              id="doc-category"
              type="text"
              value={reportCategory}
              disabled
              className={inputClasses}
            />
          ) : (
            <select
              id="doc-category"
              value={form.category}
              disabled={busy}
              onChange={(event) => change("category", event.target.value)}
              className={inputClasses}
            >
              <option value="">Choose a category</option>

              {options.categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="doc-expires" className={labelClasses}>
            Valid until (optional)
          </label>

          <input
            id="doc-expires"
            type="date"
            value={form.expiresOn}
            disabled={busy}
            onChange={(event) => change("expiresOn", event.target.value)}
            className={inputClasses}
          />
        </div>
      </div>

      <p className="-mt-2 text-xs text-gray-500">
        Leave the date empty when the document never expires. You and the Port
        Administrator get a bell message {options.warningDays} days before it
        expires.
      </p>

      <div>
        <label htmlFor="doc-description" className={labelClasses}>
          Description (optional)
        </label>

        <textarea
          id="doc-description"
          rows={3}
          value={form.description}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => change("description", event.target.value)}
          placeholder="What is this document for?"
          className={textareaClasses}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="doc-link-type" className={labelClasses}>
            Belongs to (optional)
          </label>

          <select
            id="doc-link-type"
            value={form.linkType}
            disabled={busy}
            onChange={(event) => {
              change("linkType", event.target.value);
              change("linkLabel", "");
            }}
            className={inputClasses}
          >
            <option value="">Nothing in particular</option>

            {options.linkTypes.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doc-link-label" className={labelClasses}>
            Which one
          </label>

          <input
            id="doc-link-label"
            type="text"
            list="doc-link-list"
            value={form.linkLabel}
            maxLength={160}
            disabled={busy || !form.linkType}
            onChange={(event) => change("linkLabel", event.target.value)}
            placeholder={
              form.linkType ? LINK_HINTS[form.linkType] || "" : "Choose first"
            }
            className={inputClasses}
          />

          <datalist id="doc-link-list">
            {list.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <fieldset>
        <legend className={labelClasses}>Who can see it</legend>

        <div className="space-y-2 text-sm text-navy-700 dark:text-white">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="doc-visibility"
              checked={form.visibility === "all"}
              disabled={busy}
              data-testid="visibility-all"
              onChange={() => change("visibility", "all")}
            />
            Everybody who has the Documents feature
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="doc-visibility"
              checked={form.visibility === "roles"}
              disabled={busy}
              data-testid="visibility-roles"
              onChange={() => change("visibility", "roles")}
            />
            Only some roles
          </label>
        </div>

        {form.visibility === "roles" && (
          <div
            data-testid="role-list"
            className="mt-3 grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border border-gray-200 p-3 text-sm sm:grid-cols-2 dark:border-white/10"
          >
            {options.roles.map((name) => (
              <label
                key={name}
                className="flex items-center gap-2 text-navy-700 dark:text-white"
              >
                <input
                  type="checkbox"
                  checked={form.allowedRoles.includes(name)}
                  disabled={busy}
                  data-role={name}
                  onChange={() => toggleRole(name)}
                />
                {name}
              </label>
            ))}
          </div>
        )}

        <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
          <MdLock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          The person who uploaded it and the Port Administrator can always see
          it.
        </p>
      </fieldset>
    </div>
  );
};

// What the backend needs for a document form.
const formBody = (form) => ({
  title: form.title,
  category: form.category,
  description: form.description,
  expires_on: form.expiresOn || null,
  link_type: form.linkType || null,
  link_label: form.linkType ? form.linkLabel : null,
  visibility: form.visibility,
  allowed_roles: form.visibility === "roles" ? form.allowedRoles : null,
});

// The same checks as the backend, so the person is told at once.
const formProblem = (form) => {
  if (!form.title.trim()) {
    return "Enter a title for the document.";
  }

  if (!form.category) {
    return "Choose a category.";
  }

  if (form.linkType && !form.linkLabel.trim()) {
    return `Say which ${form.linkType.toLowerCase()} it belongs to.`;
  }

  if (form.visibility === "roles" && form.allowedRoles.length === 0) {
    return "Choose at least one role that may see the document.";
  }

  return "";
};

// =========================================================
// THE PAGE
// =========================================================

const DocumentManagement = () => {
  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------

  const [documents, setDocuments] = React.useState([]);
  const [options, setOptions] = React.useState(() => normalizeOptions(null));
  const [me, setMe] = React.useState({
    id: null,
    isAdmin: false,
    canReport: false,
  });

  // loading | ready | error | denied
  const [loadState, setLoadState] = React.useState("loading");
  const [loadError, setLoadError] = React.useState("");
  const [connectionLost, setConnectionLost] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState(null);

  const [nowMs, setNowMs] = React.useState(() => Date.now());

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [shown, setShown] = React.useState(SHOW_STEP);

  // null | "upload" | "report"  and  the open document (details)
  const [windowName, setWindowName] = React.useState(null);
  const [detailId, setDetailId] = React.useState(null);

  const [toast, setToast] = React.useState("");

  // -------------------------------------------------------
  // REFS
  // -------------------------------------------------------

  const rootRef = React.useRef(null);
  const mountedRef = React.useRef(true);
  const toastTimerRef = React.useRef(null);
  const busyRef = React.useRef(false);
  const loadedRef = React.useRef(false);
  const versionRef = React.useRef(0);

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

  React.useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  const today = dayOfMs(nowMs);

  // -------------------------------------------------------
  // LOAD THE LIBRARY
  // -------------------------------------------------------

  const load = React.useCallback(async (attempt = 0) => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;

    const version = versionRef.current;

    let again = false;

    try {
      const data = await apiGet("/documents");

      if (!mountedRef.current) {
        return;
      }

      // Something was changed on this page while the list was on
      // its way (the list is older than that change): ask again
      // at once instead of showing the older list.
      if (version !== versionRef.current) {
        again = attempt < 2;

        return;
      }

      setDocuments(
        Array.isArray(data?.documents)
          ? data.documents.map(normalizeDocument)
          : []
      );

      setOptions(normalizeOptions(data?.options));

      setMe({
        id: data?.me?.id ?? null,
        isAdmin: !!data?.me?.is_admin,
        canReport: !!data?.me?.can_report,
      });

      loadedRef.current = true;

      setLoadState("ready");
      setLoadError("");
      setConnectionLost(false);
      setUpdatedAt(Date.now());
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (isDenied(error)) {
        setLoadState("denied");
      } else if (loadedRef.current) {
        setConnectionLost(true);
      } else {
        setLoadState("error");
        setLoadError(
          getErrorMessage(error, "The documents could not be loaded.")
        );
      }
    } finally {
      busyRef.current = false;

      if (again && mountedRef.current) {
        load(attempt + 1);
      }
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useInterval(() => {
    if (!document.hidden) {
      load();
    }
  }, REFRESH_MS);

  // After this page itself changed something.
  const putDocument = React.useCallback((raw) => {
    versionRef.current += 1;

    const next = normalizeDocument(raw);

    setDocuments((old) => {
      const found = old.some((item) => item.id === next.id);

      return found
        ? old.map((item) => (item.id === next.id ? next : item))
        : [next].concat(old);
    });

    return next;
  }, []);

  const removeDocument = React.useCallback((id) => {
    versionRef.current += 1;

    setDocuments((old) => old.filter((item) => item.id !== id));
  }, []);

  // -------------------------------------------------------
  // OPENING AND SAVING FILES
  // -------------------------------------------------------

  const fetchFile = (id, version) =>
    apiGet(`/documents/${id}/file${version ? `?version=${version}` : ""}`);

  const openFile = async (id, name, version) => {
    const inBrowser = canShowInBrowser(name);

    // The new tab is opened right at the click (the browser would
    // block it after the file has arrived).
    let tab = null;

    if (inBrowser) {
      try {
        tab = window.open("", "_blank");

        if (tab) {
          tab.document.title = "Opening...";
          tab.document.body.textContent = "Opening the document...";
        }
      } catch {
        tab = null;
      }
    }

    try {
      const file = await fetchFile(id, version);

      const blob = fileToBlob(file);

      if (inBrowser && tab && !tab.closed) {
        const url = URL.createObjectURL(blob);

        tab.location.href = url;

        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
      } else {
        saveBlob(blob, file.file_name);
      }
    } catch (error) {
      if (tab && !tab.closed) {
        tab.close();
      }

      if (mountedRef.current) {
        showToast(getErrorMessage(error, "The document could not be opened."));
      }
    }
  };

  const downloadFile = async (id, version) => {
    try {
      const file = await fetchFile(id, version);

      saveBlob(fileToBlob(file), file.file_name);
    } catch (error) {
      if (mountedRef.current) {
        showToast(
          getErrorMessage(error, "The document could not be downloaded.")
        );
      }
    }
  };

  // -------------------------------------------------------
  // THE LIST ON SCREEN
  // -------------------------------------------------------

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return documents.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) {
        return false;
      }

      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      if (sourceFilter === "reports" && !item.isReport) {
        return false;
      }

      if (sourceFilter === "uploaded" && item.isReport) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        item.number,
        item.title,
        item.category,
        item.description,
        item.file.name,
        item.link ? item.link.label : "",
        item.link ? item.link.type : "",
        item.uploadedBy.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [documents, search, categoryFilter, statusFilter, sourceFilter]);

  React.useEffect(() => {
    setShown(SHOW_STEP);
  }, [search, categoryFilter, statusFilter, sourceFilter]);

  const anyFilter = !!(
    search.trim() ||
    categoryFilter ||
    statusFilter ||
    sourceFilter
  );

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setStatusFilter("");
    setSourceFilter("");
  };

  const countOf = (test) => documents.filter(test).length;

  const categoryChoices = options.categories.concat(
    documents.some((item) => item.category === options.reportCategory)
      ? [options.reportCategory]
      : []
  );

  const detailDocument = detailId
    ? documents.find((item) => item.id === detailId) || null
    : null;

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
            <MdFolderOpen className="h-8 w-8" />
          </div>

          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-navy-700 dark:text-white">
              Document Management
            </h1>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              The papers, permits and reports of the Port of Singapore, with
              versions and expiry reminders.
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

          {me.canReport && (
            <button
              type="button"
              data-testid="report-button"
              disabled={loadState !== "ready"}
              onClick={() => setWindowName("report")}
              className={quietButton}
            >
              <MdPictureAsPdf className="h-5 w-5" />
              Generate PDF
            </button>
          )}

          <button
            type="button"
            data-testid="upload-button"
            disabled={loadState !== "ready"}
            onClick={() => setWindowName("upload")}
            className={primaryButton}
          >
            <MdAdd className="h-5 w-5" />
            Upload Document
          </button>
        </div>
      </div>

      {/* NUMBER CARDS */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          testId="kpi-documents"
          label="Documents"
          value={fmt(documents.length)}
          note="You can see"
          tone="bg-blue-100 text-blue-500 dark:bg-blue-500/10"
          icon={<MdFolderOpen className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-expiring"
          label="Expiring soon"
          value={fmt(countOf((item) => item.status === "expiring"))}
          note={`Within ${options.warningDays} days`}
          tone="bg-orange-100 text-orange-500 dark:bg-orange-500/10"
          icon={<MdWarning className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-expired"
          label="Expired"
          value={fmt(countOf((item) => item.status === "expired"))}
          note="Need to be renewed"
          tone="bg-red-100 text-red-500 dark:bg-red-500/10"
          icon={<MdEventBusy className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-reports"
          label="Reports"
          value={fmt(countOf((item) => item.isReport))}
          note="Made by this page"
          tone="bg-purple-100 text-purple-500 dark:bg-purple-500/10"
          icon={<MdAssessment className="h-6 w-6" />}
        />

        <KpiCard
          testId="kpi-mine"
          label="Uploaded by me"
          value={fmt(
            countOf((item) => me.id !== null && item.uploadedBy.id === me.id)
          )}
          note="Reports included"
          tone="bg-green-100 text-green-500 dark:bg-green-500/10"
          icon={<MdCloudUpload className="h-6 w-6" />}
        />
      </div>

      {/* THE LIBRARY */}
      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-navy-800">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              Library
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Newest first. Select a document to see its details and versions.
            </p>
          </div>

          {loadState === "ready" && (
            <p
              data-testid="shown-count"
              className="text-xs text-gray-500 dark:text-gray-400"
            >
              {anyFilter
                ? `${fmt(filtered.length)} of ${fmt(documents.length)} documents`
                : `${fmt(documents.length)} ${
                    documents.length === 1 ? "document" : "documents"
                  }`}
            </p>
          )}
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              value={search}
              placeholder="Search title, number, file or vessel..."
              aria-label="Search documents"
              data-testid="search-input"
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
            />
          </div>

          <select
            value={categoryFilter}
            aria-label="Filter by category"
            data-testid="category-filter"
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">All categories</option>

            {categoryChoices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            aria-label="Filter by validity"
            data-testid="status-filter"
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">Any validity</option>

            {STATUS_FILTERS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            aria-label="Filter by source"
            data-testid="source-filter"
            onChange={(event) => setSourceFilter(event.target.value)}
            className={inputClasses}
          >
            <option value="">Uploaded and reports</option>
            <option value="uploaded">Uploaded documents only</option>
            <option value="reports">Reports only</option>
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

        {loadState === "denied" && (
          <div
            role="alert"
            data-testid="denied"
            className="flex flex-col items-center rounded-xl bg-amber-50 px-4 py-10 text-center dark:bg-amber-500/10"
          >
            <MdBlock className="mb-2 h-8 w-8 text-amber-500" />

            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              Your account is not allowed to use Document Management
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              Ask the Port Administrator if you need access.
            </p>
          </div>
        )}

        {loadState === "error" && (
          <div
            role="alert"
            data-testid="load-error"
            className="flex flex-col items-center rounded-xl bg-red-50 px-4 py-8 text-center dark:bg-red-500/10"
          >
            <MdErrorOutline className="mb-2 h-8 w-8 text-red-400" />

            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              Document Management is not available
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
              {loadError}
            </p>

            <button
              type="button"
              data-testid="try-again"
              onClick={() => {
                setLoadState("loading");
                load();
              }}
              className="mt-4 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
            >
              Try again
            </button>
          </div>
        )}

        {loadState === "loading" && (
          <p
            data-testid="loading"
            className="px-3 py-12 text-center text-sm text-gray-500"
          >
            Loading the documents...
          </p>
        )}

        {loadState === "ready" && filtered.length === 0 && (
          <p
            data-testid="empty-row"
            className="px-3 py-12 text-center text-sm text-gray-500"
          >
            {documents.length === 0
              ? "No documents have been uploaded yet. Select Upload Document to add the first one."
              : "No documents match your search or filters."}
          </p>
        )}

        {/* TABLE (computer) */}
        {loadState === "ready" && filtered.length > 0 && (
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[860px]" data-testid="doc-table">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10">
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Document
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Category
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Valid until
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Version
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    Uploaded by
                  </th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase text-gray-500">
                    &nbsp;
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.slice(0, shown).map((item) => (
                  <tr
                    key={item.id}
                    data-testid="doc-row"
                    data-number={item.number}
                    className="border-b border-gray-100 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <td className="max-w-[320px] px-2 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0 rounded-lg bg-lightPrimary p-2 text-brand-500 dark:bg-navy-900">
                          <FileIcon name={item.file.name} className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p
                            data-testid="row-title"
                            className="break-words text-sm font-bold text-navy-700 dark:text-white"
                          >
                            {item.title}
                          </p>

                          <p className="mt-0.5 break-words text-xs text-gray-500">
                            {item.number} · {item.file.name} ·{" "}
                            {formatSize(item.file.size)}
                          </p>

                          {item.link && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                              <MdLink className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="break-words">
                                {item.link.type}: {item.link.label}
                              </span>
                            </p>
                          )}

                          {item.visibility === "roles" && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                              <MdLock className="h-3.5 w-3.5 flex-shrink-0" />
                              Only some roles
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {item.category}
                    </td>

                    <td className="px-2 py-3">
                      <p className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {item.expiresOn
                          ? formatCalendarDate(item.expiresOn)
                          : "—"}
                      </p>

                      <div className="mt-1">
                        <StatusChip document={item} />
                      </div>
                    </td>

                    <td className="px-2 py-3 text-sm text-gray-600 dark:text-gray-300">
                      <span data-testid="row-version">v{item.version}</span>

                      {item.versionCount > 1 && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({item.versionCount} saved)
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {item.uploadedBy.name}
                      </p>

                      <p className="text-xs text-gray-500">
                        {formatStampDate(item.updatedAt)}
                      </p>
                    </td>

                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canShowInBrowser(item.file.name) && (
                          <button
                            type="button"
                            data-testid="row-open"
                            onClick={() => openFile(item.id, item.file.name)}
                            className={smallButton}
                          >
                            <MdOpenInNew className="h-4 w-4" />
                            Open
                          </button>
                        )}

                        <button
                          type="button"
                          data-testid="row-download"
                          onClick={() => downloadFile(item.id)}
                          className={smallButton}
                        >
                          <MdFileDownload className="h-4 w-4" />
                          Download
                        </button>

                        <button
                          type="button"
                          data-testid="row-details"
                          onClick={() => setDetailId(item.id)}
                          className={smallButton}
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* CARDS (phone) */}
        {loadState === "ready" && filtered.length > 0 && (
          <div className="space-y-3 xl:hidden" data-testid="doc-cards">
            {filtered.slice(0, shown).map((item) => (
              <div
                key={item.id}
                data-testid="doc-card"
                className="rounded-xl border border-gray-100 p-4 dark:border-white/10"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 rounded-lg bg-lightPrimary p-2 text-brand-500 dark:bg-navy-900">
                    <FileIcon name={item.file.name} className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-navy-700 dark:text-white">
                      {item.title}
                    </p>

                    <p className="mt-0.5 break-words text-xs text-gray-500">
                      {item.number} · v{item.version} ·{" "}
                      {formatSize(item.file.size)}
                    </p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">{item.category}</p>

                {item.link && (
                  <p className="mt-1 break-words text-xs text-gray-500">
                    {item.link.type}: {item.link.label}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip document={item} />

                  {item.expiresOn && (
                    <span className="text-xs text-gray-500">
                      until {formatCalendarDate(item.expiresOn)}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {canShowInBrowser(item.file.name) && (
                    <button
                      type="button"
                      onClick={() => openFile(item.id, item.file.name)}
                      className={smallButton}
                    >
                      <MdOpenInNew className="h-4 w-4" />
                      Open
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => downloadFile(item.id)}
                    className={smallButton}
                  >
                    <MdFileDownload className="h-4 w-4" />
                    Download
                  </button>

                  <button
                    type="button"
                    data-testid="card-details"
                    onClick={() => setDetailId(item.id)}
                    className={smallButton}
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loadState === "ready" && filtered.length > shown && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              data-testid="show-more"
              onClick={() => setShown((old) => old + SHOW_STEP)}
              className={quietButton}
            >
              Show more
            </button>
          </div>
        )}
      </div>

      {/* WINDOWS */}
      {windowName === "upload" && (
        <UploadWindow
          anchor={rootRef}
          options={options}
          onClose={() => setWindowName(null)}
          onDone={(raw) => {
            const added = putDocument(raw.document);

            setWindowName(null);

            showToast(`${added.number} was uploaded.`);
          }}
        />
      )}

      {windowName === "report" && me.canReport && (
        <ReportWindow
          anchor={rootRef}
          today={today}
          onClose={() => setWindowName(null)}
          onMade={(raw) => putDocument(raw)}
          onOpen={openFile}
          onDownload={downloadFile}
        />
      )}

      {detailId !== null && (
        <DetailWindow
          anchor={rootRef}
          documentId={detailId}
          listed={detailDocument}
          options={options}
          onClose={() => setDetailId(null)}
          onChanged={(raw) => putDocument(raw)}
          onDeleted={(id, number) => {
            removeDocument(id);

            setDetailId(null);

            showToast(`${number} was deleted.`);
          }}
          onGone={(text) => {
            setDetailId(null);

            showToast(text);
          }}
          onOpen={openFile}
          onDownload={downloadFile}
          showToast={showToast}
        />
      )}

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
// RECORDS A DOCUMENT CAN BELONG TO (hints for the form)
// =========================================================

// The names of the port's own records, read from the pages the
// account is allowed to read. An account that may not read one
// of them simply gets no hints for it (it can still type a name).
const useLinkSuggestions = () => {
  const [suggestions, setSuggestions] = React.useState({});

  React.useEffect(() => {
    let alive = true;

    const names = (data, key, make) =>
      Array.from(
        new Set(
          asRows(data, key)
            .map(make)
            .filter(Boolean)
        )
      ).slice(0, 300);

    Promise.allSettled([
      apiGet("/vessels"),
      apiGet("/cargo"),
      apiGet("/incidents"),
      apiGet("/assets"),
    ]).then((results) => {
      if (!alive) {
        return;
      }

      const [vessels, cargo, incidents, assets] = results.map((item) =>
        item.status === "fulfilled" ? item.value : null
      );

      setSuggestions({
        Vessel: names(vessels, "vessels", (item) =>
          firstText(item, ["vessel_name", "name", "ship_name"])
        ),
        "Cargo record": names(cargo, "cargo", (item) =>
          firstText(item, [
            "reference",
            "cargo_id",
            "container_number",
            "cargo_name",
            "cargo_type",
            "name",
          ])
        ),
        Incident: names(incidents, "incidents", (item) =>
          firstText(item, ["number"])
        ),
        Equipment: names(assets, "assets", (item) => {
          const code = firstText(item, ["code"]);

          const name = firstText(item, ["name"]);

          return code && name ? `${code} ${name}` : code || name;
        }),
      });
    });

    return () => {
      alive = false;
    };
  }, []);

  return suggestions;
};

// =========================================================
// UPLOAD WINDOW
// =========================================================

const UploadWindow = ({ anchor, options, onClose, onDone }) => {
  const suggestions = useLinkSuggestions();

  const [form, setForm] = React.useState(emptyForm);
  const [chosenFile, setChosenFile] = React.useState(null);
  const [fileError, setFileError] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const chooseFile = (event) => {
    const file = event.target.files && event.target.files[0];

    setFileError("");
    setError("");

    if (!file) {
      setChosenFile(null);

      return;
    }

    const extension = extensionOf(file.name);

    if (!options.fileTypes.includes(extension)) {
      setChosenFile(null);
      setFileError(
        `This kind of file is not allowed. Allowed: ${options.fileTypes
          .map((item) => item.toUpperCase())
          .join(", ")}.`
      );

      return;
    }

    if (file.size > options.maxFileMb * 1024 * 1024) {
      setChosenFile(null);
      setFileError(
        `The file is too large (at most ${options.maxFileMb} MB).`
      );

      return;
    }

    if (file.size === 0) {
      setChosenFile(null);
      setFileError("The file is empty.");

      return;
    }

    setChosenFile(file);

    setForm((old) =>
      old.title.trim() ? old : { ...old, title: titleFromFileName(file.name) }
    );
  };

  const submit = async (event) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    if (!chosenFile) {
      setError("Choose a file to upload.");

      return;
    }

    const problem = formProblem(form);

    if (problem) {
      setError(problem);

      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = await readAsBase64(chosenFile);

      const answer = await apiPost("/documents", {
        ...formBody(form),
        file_name: chosenFile.name,
        file_data: data,
      });

      if (aliveRef.current) {
        onDone(answer);
      }
    } catch (failure) {
      if (aliveRef.current) {
        setError(getErrorMessage(failure, "The document could not be saved."));

        setBusy(false);
      }
    }
  };

  return (
    <WindowFrame
      anchor={anchor}
      title="Upload Document"
      subtitle="You are saved as the person who uploaded it."
      onClose={onClose}
      busy={busy}
      testId="upload-dialog"
    >
      <form onSubmit={submit} noValidate>
        <DocumentForm
          mode="upload"
          form={form}
          setForm={setForm}
          options={options}
          suggestions={suggestions}
          chosenFile={chosenFile}
          onChooseFile={chooseFile}
          fileError={fileError}
          busy={busy}
          reportCategory={options.reportCategory}
        />

        {error && (
          <div className="mt-4">
            <ErrorLine message={error} testId="upload-error" />
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            data-testid="upload-submit"
            className={`${primaryButton} h-11 flex-1`}
          >
            {busy ? (
              <MdRefresh className="h-4 w-4 animate-spin" />
            ) : (
              <MdCloudUpload className="h-5 w-5" />
            )}
            {busy ? "Uploading..." : "Upload"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
          >
            Cancel
          </button>
        </div>
      </form>
    </WindowFrame>
  );
};

// =========================================================
// DETAILS WINDOW (versions, new version, edit, delete)
// =========================================================

const FactRow = ({ label, children, testId }) => (
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

const DetailWindow = ({
  anchor,
  documentId,
  listed,
  options,
  onClose,
  onChanged,
  onDeleted,
  onGone,
  onOpen,
  onDownload,
  showToast,
}) => {
  // The newest answer of the backend for this document.
  const [loaded, setLoaded] = React.useState(null);
  const [versions, setVersions] = React.useState(null);
  const [loadError, setLoadError] = React.useState("");

  // view | edit | version | delete
  const [mode, setMode] = React.useState("view");

  const [form, setForm] = React.useState(emptyForm);
  const [versionFile, setVersionFile] = React.useState(null);
  const [versionNote, setVersionNote] = React.useState("");
  const [fileError, setFileError] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const suggestions = useLinkSuggestions();

  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  // The two functions of the page are kept in a ref: a new function
  // on every render of the page must not start a new reload here.
  const callbacksRef = React.useRef({ onChanged, onGone });

  callbacksRef.current = { onChanged, onGone };

  const apply = React.useCallback((answer) => {
    setLoaded(normalizeDocument(answer.document));

    setVersions(
      Array.isArray(answer.versions) ? answer.versions.map(normalizeVersion) : []
    );

    callbacksRef.current.onChanged(answer.document);
  }, []);

  const reload = React.useCallback(async () => {
    try {
      const answer = await apiGet(`/documents/${documentId}`);

      if (aliveRef.current) {
        apply(answer);

        setLoadError("");
      }
    } catch (failure) {
      if (!aliveRef.current) {
        return;
      }

      if (
        failure?.status === 404 ||
        /not found|does not exist/i.test(String(failure?.message || ""))
      ) {
        callbacksRef.current.onGone("That document is not there any more.");
      } else {
        setLoadError(
          getErrorMessage(failure, "The versions could not be loaded.")
        );
      }
    }
  }, [documentId, apply]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // A colleague changed or deleted it while it is open.
  useInterval(() => {
    if (mode === "view" && !busy && !document.hidden) {
      reload();
    }
  }, 30 * 1000);

  const doc = loaded || listed;

  if (!doc) {
    return (
      <WindowFrame
        anchor={anchor}
        title="Document"
        onClose={onClose}
        testId="detail-dialog"
      >
        <p className="py-8 text-center text-sm text-gray-500">Loading...</p>
      </WindowFrame>
    );
  }

  const startEdit = () => {
    setForm(formFromDocument(doc));
    setError("");
    setMode("edit");
  };

  const saveEdit = async (event) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    const problem = formProblem(form);

    if (problem) {
      setError(problem);

      return;
    }

    setBusy(true);
    setError("");

    try {
      const answer = await apiPost(`/documents/${doc.id}/edit`, formBody(form));

      if (aliveRef.current) {
        apply(answer);

        setMode("view");

        showToast("The details were saved.");
      }
    } catch (failure) {
      if (aliveRef.current) {
        setError(getErrorMessage(failure, "The changes could not be saved."));
      }
    } finally {
      if (aliveRef.current) {
        setBusy(false);
      }
    }
  };

  const chooseVersionFile = (event) => {
    const file = event.target.files && event.target.files[0];

    setFileError("");
    setError("");

    if (!file) {
      setVersionFile(null);

      return;
    }

    if (!options.fileTypes.includes(extensionOf(file.name))) {
      setVersionFile(null);
      setFileError("This kind of file is not allowed.");

      return;
    }

    if (file.size > options.maxFileMb * 1024 * 1024) {
      setVersionFile(null);
      setFileError(
        `The file is too large (at most ${options.maxFileMb} MB).`
      );

      return;
    }

    setVersionFile(file);
  };

  const saveVersion = async (event) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    if (!versionFile) {
      setError("Choose the newer file.");

      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = await readAsBase64(versionFile);

      const answer = await apiPost(`/documents/${doc.id}/versions`, {
        file_name: versionFile.name,
        file_data: data,
        note: versionNote,
      });

      if (aliveRef.current) {
        apply(answer);

        setMode("view");
        setVersionFile(null);
        setVersionNote("");

        showToast(`Version ${answer.document.version} was saved.`);
      }
    } catch (failure) {
      if (aliveRef.current) {
        setError(getErrorMessage(failure, "The file could not be saved."));
      }
    } finally {
      if (aliveRef.current) {
        setBusy(false);
      }
    }
  };

  const confirmDelete = async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await apiDelete(`/documents/${doc.id}`);

      if (aliveRef.current) {
        onDeleted(doc.id, doc.number);
      }
    } catch (failure) {
      if (aliveRef.current) {
        setError(getErrorMessage(failure, "The document could not be deleted."));

        setBusy(false);
      }
    }
  };

  const close = () => {
    if (!busy) {
      onClose();
    }
  };

  return (
    <WindowFrame
      anchor={anchor}
      title={doc.title}
      subtitle={`${doc.number} · ${doc.category}`}
      onClose={close}
      busy={busy}
      wide
      testId="detail-dialog"
    >
      {mode === "view" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusChip document={doc} />

            {doc.isReport && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                Report
              </span>
            )}

            {doc.visibility === "roles" && (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                <MdLock className="h-3.5 w-3.5" />
                Only some roles
              </span>
            )}
          </div>

          {doc.description && (
            <p
              data-testid="detail-description"
              className="mb-4 whitespace-pre-line break-words text-sm text-gray-600 dark:text-gray-300"
            >
              {doc.description}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FactRow label="Valid until" testId="detail-expires">
              {doc.expiresOn
                ? `${formatCalendarDate(doc.expiresOn)} (${statusWords(doc)})`
                : "No expiry date"}
            </FactRow>

            <FactRow label="Belongs to" testId="detail-link">
              {doc.link ? `${doc.link.type}: ${doc.link.label}` : "—"}
            </FactRow>

            <FactRow label="Uploaded by" testId="detail-uploader">
              {doc.uploadedBy.name}
              {doc.uploadedBy.role ? ` · ${doc.uploadedBy.role}` : ""}
            </FactRow>

            <FactRow label="First saved" testId="detail-created">
              {formatStamp(doc.createdAt)}
            </FactRow>

            <FactRow label="Visible to" testId="detail-visible">
              {doc.visibility === "roles"
                ? doc.allowedRoles.join(", ")
                : "Everybody who has the Documents feature"}
            </FactRow>

            {doc.isReport && (
              <FactRow label="Report period" testId="detail-period">
                {doc.reportStart === doc.reportEnd
                  ? formatCalendarDate(doc.reportStart)
                  : `${formatCalendarDate(doc.reportStart)} to ${formatCalendarDate(
                      doc.reportEnd
                    )}`}
              </FactRow>
            )}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
              Versions
            </p>

            {versions === null && !loadError && (
              <p className="text-sm text-gray-500">Loading the versions...</p>
            )}

            {loadError && (
              <ErrorLine message={loadError} testId="versions-error" />
            )}

            <ul className="space-y-2" data-testid="version-list">
              {(versions || []).map((item) => (
                <li
                  key={item.version}
                  data-testid="version-row"
                  data-version={item.version}
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex-shrink-0 rounded-lg bg-lightPrimary p-2 text-brand-500 dark:bg-navy-900">
                      <FileIcon name={item.fileName} className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-navy-700 dark:text-white">
                        Version {item.version}
                        {item.version === doc.version ? " (current)" : ""} ·{" "}
                        {item.fileName}
                      </p>

                      <p className="text-xs text-gray-500">
                        {formatSize(item.fileSize)} · {item.uploadedBy} ·{" "}
                        {formatStamp(item.createdAt)}
                      </p>

                      {item.note && (
                        <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 gap-2">
                    {canShowInBrowser(item.fileName) && (
                      <button
                        type="button"
                        data-testid="version-open"
                        onClick={() =>
                          onOpen(doc.id, item.fileName, item.version)
                        }
                        className={smallButton}
                      >
                        <MdOpenInNew className="h-4 w-4" />
                        Open
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="version-download"
                      onClick={() => onDownload(doc.id, item.version)}
                      className={smallButton}
                    >
                      <MdFileDownload className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {doc.canChange ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {!doc.isReport && (
                <button
                  type="button"
                  data-testid="new-version-button"
                  onClick={() => {
                    setError("");
                    setMode("version");
                  }}
                  className={quietButton}
                >
                  <MdCloudUpload className="h-5 w-5" />
                  Upload a newer version
                </button>
              )}

              <button
                type="button"
                data-testid="edit-button"
                onClick={startEdit}
                className={quietButton}
              >
                <MdEdit className="h-5 w-5" />
                Edit details
              </button>

              <button
                type="button"
                data-testid="delete-button"
                onClick={() => {
                  setError("");
                  setMode("delete");
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-500 transition hover:bg-red-500 hover:text-white dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
              >
                <MdDeleteOutline className="h-5 w-5" />
                Delete
              </button>
            </div>
          ) : (
            <p
              data-testid="read-only-note"
              className="mt-6 flex items-start gap-1.5 text-xs text-gray-500"
            >
              <MdLock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Only the person who uploaded this document and the Port
              Administrator can change or delete it.
            </p>
          )}

          {doc.isReport && doc.canChange && (
            <p className="mt-3 text-xs text-gray-500">
              A report gets a new version when it is generated again for the
              same period (Generate PDF).
            </p>
          )}
        </div>
      )}

      {mode === "edit" && (
        <form onSubmit={saveEdit} noValidate>
          <DocumentForm
            mode="edit"
            form={form}
            setForm={setForm}
            options={options}
            suggestions={suggestions}
            chosenFile={null}
            onChooseFile={null}
            fileError=""
            busy={busy}
            reportCategory={options.reportCategory}
          />

          {error && (
            <div className="mt-4">
              <ErrorLine message={error} testId="edit-error" />
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              data-testid="edit-save"
              className={`${primaryButton} h-11 flex-1`}
            >
              {busy && <MdRefresh className="h-4 w-4 animate-spin" />}
              Save changes
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("view")}
              className="h-11 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "version" && (
        <form onSubmit={saveVersion} noValidate className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The newer file becomes the current version. The older versions are
            kept and can still be opened.
          </p>

          <div>
            <label htmlFor="version-file" className={labelClasses}>
              Newer file
            </label>

            <input
              id="version-file"
              type="file"
              accept={options.fileTypes.map((item) => `.${item}`).join(",")}
              disabled={busy}
              data-testid="version-file"
              onChange={chooseVersionFile}
              className="block w-full cursor-pointer rounded-xl border border-dashed border-gray-300 bg-lightPrimary p-3 text-sm text-navy-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white dark:border-white/20 dark:bg-navy-900 dark:text-white"
            />

            {versionFile && (
              <p className="mt-1.5 text-xs text-gray-500">
                {versionFile.name} · {formatSize(versionFile.size)}
              </p>
            )}

            {fileError && <ErrorLine message={fileError} testId="file-error" />}
          </div>

          <div>
            <label htmlFor="version-note" className={labelClasses}>
              What changed (optional)
            </label>

            <textarea
              id="version-note"
              rows={2}
              value={versionNote}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setVersionNote(event.target.value)}
              className={textareaClasses}
            />
          </div>

          {error && <ErrorLine message={error} testId="version-error" />}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              data-testid="version-save"
              className={`${primaryButton} h-11 flex-1`}
            >
              {busy && <MdRefresh className="h-4 w-4 animate-spin" />}
              Save the new version
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("view")}
              className="h-11 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <div data-testid="delete-question">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-xl bg-red-100 p-3 text-red-500 dark:bg-red-500/10">
              <MdDeleteOutline className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <h3 className="text-lg font-bold text-navy-700 dark:text-white">
                Delete {doc.number} for good?
              </h3>

              <p className="mt-1 break-words text-sm text-gray-500 dark:text-gray-300">
                {doc.title}
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            The document and all {fmt(doc.versionCount)}{" "}
            {doc.versionCount === 1 ? "version" : "versions"} are removed for
            everybody. This cannot be undone. The deletion is written to the
            Audit Logs.
          </p>

          {error && (
            <div className="mt-4">
              <ErrorLine message={error} testId="delete-error" />
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirmDelete}
              data-testid="confirm-delete"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <MdRefresh className="h-4 w-4 animate-spin" />}
              Yes, delete it
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("view")}
              data-testid="cancel-delete"
              className="h-11 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </WindowFrame>
  );
};

// =========================================================
// REPORT WINDOW
// =========================================================

const ReportWindow = ({
  anchor,
  today,
  onClose,
  onMade,
  onOpen,
  onDownload,
}) => {
  const [selection, setSelection] = React.useState({
    preset: "Today",
    from: null,
    to: null,
  });

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);

  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  const range = selection.preset
    ? presetRange(selection.preset, today)
    : {
        from: Math.min(selection.from, selection.to),
        to: Math.max(selection.from, selection.to),
      };

  const days = range.to - range.from + 1;

  const tooLong = days > REPORT_MAX_DAYS;

  const activePreset =
    REPORT_PRESETS.find((name) => {
      const wanted = presetRange(name, today);

      return wanted.from === range.from && wanted.to === range.to;
    }) || null;

  const choose = (name) => {
    setSelection({ preset: name, from: null, to: null });
    setResult(null);
    setError("");
  };

  const chooseFrom = (dayNumber) => {
    setSelection({
      preset: null,
      from: dayNumber,
      to: Math.max(dayNumber, range.to),
    });
    setResult(null);
    setError("");
  };

  const chooseTo = (dayNumber) => {
    setSelection({
      preset: null,
      from: Math.min(range.from, dayNumber),
      to: dayNumber,
    });
    setResult(null);
    setError("");
  };

  const generate = async () => {
    if (busy || tooLong) {
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const answer = await apiPost("/documents/reports", {
        start_date: dayKey(range.from),
        end_date: dayKey(range.to),
      });

      if (aliveRef.current) {
        setResult({
          document: normalizeDocument(answer.document),
          newVersion: !!answer.was_new_version,
          leftOut: Array.isArray(answer.left_out) ? answer.left_out : [],
        });

        onMade(answer.document);
      }
    } catch (failure) {
      if (aliveRef.current) {
        setError(getErrorMessage(failure, "The report could not be made."));
      }
    } finally {
      if (aliveRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <WindowFrame
      anchor={anchor}
      title="Generate PDF Report"
      subtitle="A PDF with the statistics and graphs of what happened in the port on a day (or a short period), made from the port's own records."
      onClose={onClose}
      busy={busy}
      testId="report-dialog"
    >
      <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
        Quick selection
      </p>

      <div className="flex flex-wrap gap-2">
        {REPORT_PRESETS.map((name) => {
          const selected = activePreset === name;

          return (
            <button
              key={name}
              type="button"
              disabled={busy}
              data-testid={`report-preset-${name
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
              aria-pressed={selected}
              onClick={() => choose(name)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
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

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DatePicker
          testId="report-from"
          label="Start Date"
          value={range.from}
          onChange={chooseFrom}
          minDay={EARLIEST_DAY}
          maxDay={range.to}
          today={today}
          selectingLabel="SELECTING START DATE"
        />

        <DatePicker
          testId="report-to"
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

      <div className="mt-4 rounded-xl bg-lightPrimary p-4 dark:bg-navy-700">
        <p
          data-testid="report-period"
          className="text-sm font-bold text-navy-700 dark:text-white"
        >
          {periodLabel(range, today)} ·{" "}
          {days === 1 ? "1 day" : `${fmt(days)} days`}
        </p>

        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          The PDF has the gate activity, incidents, cargo records, ship
          traffic and the port activity (what people added, changed and
          deleted), each with its graphs.
        </p>

        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
          {range.to === today
            ? "The report also shows the situation right now (ships by state, berth use, equipment and open alerts)."
            : "The port keeps no history of ships by state, berth use, equipment status and open alerts, so a report that does not end today leaves them out."}
        </p>
      </div>

      {tooLong && (
        <div className="mt-3">
          <ErrorLine
            message={`A report covers at most ${REPORT_MAX_DAYS} days.`}
            testId="report-too-long"
          />
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorLine message={error} testId="report-error" />
        </div>
      )}

      {result && (
        <div
          data-testid="report-result"
          className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-500/20 dark:bg-green-500/10"
        >
          <p className="text-sm font-bold text-navy-700 dark:text-white">
            {result.newVersion
              ? `A new version of ${result.document.number} was saved (version ${result.document.version}).`
              : `${result.document.number} was made and saved in the library.`}
          </p>

          <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
            {result.document.title} · {formatSize(result.document.file.size)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="report-open"
              onClick={() =>
                onOpen(result.document.id, result.document.file.name)
              }
              className={smallButton}
            >
              <MdOpenInNew className="h-4 w-4" />
              Open the PDF
            </button>

            <button
              type="button"
              data-testid="report-download"
              onClick={() => onDownload(result.document.id)}
              className={smallButton}
            >
              <MdFileDownload className="h-4 w-4" />
              Download
            </button>
          </div>

          {result.leftOut.length > 0 && (
            <div data-testid="report-left-out" className="mt-3">
              <p className="text-xs font-bold text-navy-700 dark:text-white">
                Left out of this report:
              </p>

              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600 dark:text-gray-300">
                {result.leftOut.map((item) => (
                  <li key={item.section}>
                    {item.section}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={busy || tooLong}
          onClick={generate}
          data-testid="report-generate"
          className={`${primaryButton} h-11 flex-1`}
        >
          {busy ? (
            <MdRefresh className="h-4 w-4 animate-spin" />
          ) : (
            <MdPictureAsPdf className="h-5 w-5" />
          )}
          {busy
            ? "Making the PDF..."
            : result
            ? "Generate again"
            : "Generate PDF"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-11 flex-1 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-700 dark:text-gray-200 dark:hover:bg-navy-600"
        >
          Close
        </button>
      </div>
    </WindowFrame>
  );
};

export default DocumentManagement;
// =========================================================
// CONSTANTS
// =========================================================

// Must match the PostgreSQL permission key checked by FastAPI.
export const GATE_MODULE_KEY = "gate_trucks";

const PORT_TIME_ZONE = "Asia/Singapore";

// Singapore has no daylight saving, so a fixed offset is exact.
const PORT_UTC_OFFSET = "+08:00";

// Only the first N passes are drawn in the table (newest first).
export const MAX_PASS_ROWS = 50;

export const EMPTY_FORM = {
  vehicle_number: "",
  driver_name: "",
  driver_phone: "",
  transport_company: "",
  gate_number: "",
  cargo_weight_tonnes: "",
  entry_remarks: "",
};

export const EMPTY_PASS_FORM = {
  vehicle_number: "",
  driver_name: "",
  driver_phone: "",
  transport_company: "",
  cargo_weight_tonnes: "",
  purpose: "",
  valid_from: "",
  valid_until: "",
};

// =========================================================
// STATUS STYLES
// =========================================================

export const statusStyles = {
  Exited:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",

  "Inside Port":
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",

  Unknown:
    "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400",
};

export const passStateStyles = {
  issued:
    "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  scheduled:
    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  expired:
    "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  used: "bg-gray-100 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400",
  cancelled:
    "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

export const passStateLabels = {
  issued: "Valid",
  scheduled: "Scheduled",
  expired: "Expired",
  used: "Used",
  cancelled: "Cancelled",
};

export const inputClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-navy-700 outline-none placeholder:text-gray-400 focus:border-brand-500 dark:border-white/10 dark:bg-navy-900 dark:text-white";

// =========================================================
// FORMAT STATUS
// =========================================================

const formatStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (normalized === "inside_port") {
    return "Inside Port";
  }

  if (normalized === "exited") {
    return "Exited";
  }

  return "Unknown";
};

// =========================================================
// DATE / TIME (always Port of Singapore time)
// =========================================================

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTime = (value) => {
  const date = parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleTimeString("en-SG", {
    timeZone: PORT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
};

// "YYYY-MM-DD" in Singapore time
const portDay = (value) => {
  const date = parseDate(value);

  if (!date) {
    return null;
  }

  return date.toLocaleDateString("en-CA", {
    timeZone: PORT_TIME_ZONE,
  });
};

export const isToday = (value) => {
  const day = portDay(value);

  return day !== null && day === portDay(new Date());
};

// <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm"),
// read as Singapore time, to an ISO string with an offset.
export const portLocalToIso = (value) => {
  if (!value) {
    return null;
  }

  const withSeconds = value.length === 16 ? `${value}:00` : value;

  return `${withSeconds}${PORT_UTC_OFFSET}`;
};

// "YYYY-MM-DDTHH:mm" for a moment, shown in Singapore time.
const toPortLocalInput = (date) =>
  date
    .toLocaleString("sv-SE", {
      timeZone: PORT_TIME_ZONE,
      hourCycle: "h23",
    })
    .replace(" ", "T")
    .slice(0, 16);

export const defaultValidUntil = () =>
  toPortLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000));

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return map[character];
  });

// Opens a print window with the pass details and the QR image.
// Returns false when the browser blocked the pop-up.
export const printGatePass = (pass, svgMarkup) => {
  const printWindow = window.open(
    "",
    "_blank",
    "width=520,height=760"
  );

  if (!printWindow) {
    return false;
  }

  const rows = [
    ["Vehicle", pass.vehicle],
    ["Driver", pass.driver],
    ["Company", pass.company],
    ["Cargo", pass.weight],
    ["Purpose", pass.purpose || "—"],
    ["Valid from", formatDateTime(pass.validFrom)],
    ["Valid until", formatDateTime(pass.validUntil)],
  ]
    .map(
      ([label, value]) =>
        `<tr><td class="l">${escapeHtml(label)}</td><td>${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");

  printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Gate Pass ${escapeHtml(pass.code)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 16px; color: #555; font-size: 12px; }
  .qr { text-align: center; margin: 12px 0; }
  .qr svg { width: 240px; height: 240px; }
  .code { text-align: center; font: bold 16px monospace; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  td { padding: 6px 4px; border-bottom: 1px solid #ddd; }
  td.l { color: #555; width: 35%; }
  .foot { margin-top: 16px; font-size: 11px; color: #555; }
</style>
</head>
<body>
  <h1>Port of Singapore — Gate Pass</h1>
  <p class="sub">Single use. Show this QR code at the gate.</p>
  <div class="qr">${svgMarkup}</div>
  <div class="code">${escapeHtml(pass.code)}</div>
  <table>${rows}</table>
  <p class="foot">Times are Singapore time. Issued by ${escapeHtml(
    pass.issuedBy
  )}.</p>
</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 300);

  return true;
};

// =========================================================
// BACKEND TRUCK → FRONTEND TRUCK
// =========================================================

export const mapTruck = (truck) => ({
  id: truck?.id,

  displayId:
    truck?.id !== undefined
      ? `TRK-${String(truck.id).padStart(3, "0")}`
      : "—",

  vehicle: truck?.vehicle_number || "—",

  driver: truck?.driver_name || "—",

  phone: truck?.driver_phone || "",

  company: truck?.transport_company || "—",

  gate: truck?.gate_number || "—",

  weight:
    truck?.cargo_weight_tonnes !== null &&
    truck?.cargo_weight_tonnes !== undefined
      ? `${truck.cargo_weight_tonnes} t`
      : "—",

  entry: formatDateTime(truck?.entry_time),
  entryTime: truck?.entry_time ?? null,
  entryBy: truck?.recorded_by_name || "—",
  entryRemarks: truck?.entry_remarks || "",

  exit: formatDateTime(truck?.exit_time),
  exitTime: truck?.exit_time ?? null,
  exitBy: truck?.exit_recorded_by_name || "—",
  exitRemarks: truck?.exit_remarks || "",

  status: formatStatus(truck?.status),

  entryMethod: truck?.entry_method === "qr_pass" ? "QR pass" : "Manual",
});

// =========================================================
// BACKEND GATE PASS → FRONTEND GATE PASS
// =========================================================

export const mapPass = (pass) => ({
  id: pass?.id,
  code: pass?.pass_code || "",
  vehicle: pass?.vehicle_number || "—",
  driver: pass?.driver_name || "—",
  phone: pass?.driver_phone || "",
  company: pass?.transport_company || "—",
  weight:
    pass?.cargo_weight_tonnes !== null &&
    pass?.cargo_weight_tonnes !== undefined
      ? `${pass.cargo_weight_tonnes} t`
      : "—",
  purpose: pass?.purpose || "",
  validFrom: pass?.valid_from ?? null,
  validUntil: pass?.valid_until ?? null,
  state: pass?.state || "cancelled",
  issuedBy: pass?.issued_by_name || "—",
  usedAt: pass?.used_at ?? null,
  cancelReason: pass?.cancel_reason || "",
});


export const cameraScanSupported = () =>
  typeof window !== "undefined" &&
  "BarcodeDetector" in window &&
  Boolean(navigator.mediaDevices?.getUserMedia);

// =========================================================
// SHARED UI CLASSES
// =========================================================

export const labelClass =
  "mb-1 block text-xs font-bold uppercase text-gray-400";

export const alertClass = {
  error:
    "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  success:
    "rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400",
};

export const ghostButton =
  "rounded-xl bg-lightPrimary px-5 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-navy-900 dark:text-white";

export const primaryButton =
  "rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

export const STATUS_FILTERS = ["All", "Inside Port", "Exited"];

import React from "react";

// Pieces shared by the Delay Prediction tabs (Vessel Delay, Berth
// Congestion). All times are shown in Singapore time.

export const REFRESH_MS = 5 * 60 * 1000;

// =========================================================
// FORMATTING (Singapore time)
// =========================================================

export const dateTimeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const clockFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const sgt = (iso) => {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : `${dateTimeFormat.format(date)}`;
};

export const fmt = (value, digits = 0) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : Number(value).toLocaleString("en-SG", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

// =========================================================
// SMALL PIECES
// =========================================================

export const Card = ({ children, testId, className = "" }) => (
  <div
    data-testid={testId}
    className={`rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800 sm:p-6 ${className}`}
  >
    {children}
  </div>
);

export const CardTitle = ({ title, subtitle }) => (
  <div className="mb-4">
    <h3 className="text-lg font-bold text-navy-700 dark:text-white">{title}</h3>
    {subtitle && (
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
    )}
  </div>
);

export const Tile = ({ label, value, note, testId }) => (
  <div
    data-testid={testId}
    className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700"
  >
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
    <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">{value}</p>
    {note && (
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>
    )}
  </div>
);

export const Bar = ({ label, value, max, text, color = "bg-brand-500", testId }) => {
  const width = max > 0 ? Math.max(2, Math.min(100, (Math.abs(value) / max) * 100)) : 0;
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-navy-700 dark:text-white">{label}</span>
        <span className="shrink-0 font-semibold text-gray-600 dark:text-gray-300">{text}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-navy-900">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
};

export const Notice = ({ tone, icon: Icon, children, testId }) => {
  const tones = {
    info: "bg-lightPrimary text-navy-700 dark:bg-navy-700 dark:text-white",
    good: "bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300",
    warn: "bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-200",
    bad: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  };
  return (
    <div
      data-testid={testId}
      className={`flex items-start gap-3 rounded-xl p-4 text-sm ${tones[tone] || tones.info}`}
    >
      {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
};
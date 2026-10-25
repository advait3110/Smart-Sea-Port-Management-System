import React from "react";

import {
  MdCheckCircle,
  MdInfoOutline,
  MdRefresh,
  MdUploadFile,
  MdWarning,
} from "react-icons/md";

import { apiPost } from "../../../services/api";
// The same imported CSV files as the Cargo Operations page (this browser).
import { STORAGE_KEY, loadStored, predictionSeries } from "./cargoSeries";
import { Card, CardTitle, Notice, clockFormat, fmt, sgt } from "./shared";

// =========================================================
// PREDICT CARGO THROUGHPUT
// =========================================================
//
// Forecasts every figure imported on the Cargo Operations page:
//   monthly figures (containers, cargo, cargo by type, ...) -> next 12 months
//   yearly figures  (yearly cargo, by type, bunker sales...) -> next 3 years
//
// The Cargo Operations page keeps the CSVs in this browser; this tab reads
// them and sends them to POST /predictions/cargo-throughput, where each
// series is trained and tested (the first time a few seconds).
// Nothing is made up: with no CSVs it shows "No CSVs uploaded, please
// upload CSV." and draws nothing. Reload on Cargo Operations removes them.

const ACTUAL = { stroke: "stroke-[#422AFB] dark:stroke-[#8F7BFF]", fill: "fill-[#422AFB] dark:fill-[#8F7BFF]", bg: "bg-[#422AFB] dark:bg-[#8F7BFF]" };
const FORECAST = { stroke: "stroke-[#05966A] dark:stroke-[#00A86B]", fill: "fill-[#05966A] dark:fill-[#00A86B]", bg: "bg-[#05966A] dark:bg-[#00A86B]", border: "border-[#05966A] dark:border-[#00A86B]" };

const pct = (value, digits = 1) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value), digits)}%`;

const useWidth = () => {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(640);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) {
        setWidth(next);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

// History (solid) + forecast (dashed) with the tested range as a band.
const ThroughputChart = ({ history, forecast, unit, frequency }) => {
  const [boxRef, width] = useWidth();
  const [hover, setHover] = React.useState(null);

  const actual = (frequency === "monthly" ? history.slice(-36) : history).map((h) => ({
    ...h,
    kind: "actual",
  }));
  const ahead = (forecast || []).map((m) => ({
    period: m.period,
    label: m.label,
    value: m.expected,
    low: m.low,
    high: m.high,
    kind: "forecast",
  }));
  const points = [...actual, ...ahead];

  const height = 260;
  const pad = { top: 16, right: 16, bottom: 30, left: 52 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const numbers = points
    .flatMap((p) => [p.value, p.low, p.high])
    .filter((v) => v !== null && v !== undefined);
  const rawMin = Math.min(...numbers);
  const rawMax = Math.max(...numbers);
  const span = Math.max(rawMax * 0.02, rawMax - rawMin, 1e-9);
  const step = Math.pow(10, Math.floor(Math.log10(span)));
  const yMin = Math.max(0, Math.floor((rawMin - span * 0.1) / step) * step);
  const yMax = Math.ceil((rawMax + span * 0.1) / step) * step || 1;

  const x = (i) => pad.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW);
  const y = (v) => pad.top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH;

  const actualIdx = points.map((p, i) => (p.kind === "actual" && p.value !== null ? i : null)).filter((i) => i !== null);
  // Draw actual as segments (gaps where a month is missing).
  const segments = [];
  points.forEach((p, i) => {
    if (p.kind !== "actual" || p.value === null || p.value === undefined) {
      segments.push(null);
      return;
    }
    if (!segments.length || segments[segments.length - 1] === null) {
      segments.push([i]);
    } else {
      segments[segments.length - 1].push(i);
    }
  });
  const lastActual = actualIdx.length ? actualIdx[actualIdx.length - 1] : null;
  const forecastIdx = points.map((p, i) => (p.kind === "forecast" ? i : null)).filter((i) => i !== null);
  const forecastLine = lastActual !== null && forecastIdx.length ? [lastActual, ...forecastIdx] : forecastIdx;
  const band = forecastIdx.filter((i) => points[i].low !== null && points[i].high !== null);

  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const every = frequency === "monthly" ? (width < 520 ? 12 : 6) : width < 520 ? 5 : 3;

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    let best = null;
    points.forEach((p, i) => {
      if (p.value === null || p.value === undefined) {
        return;
      }
      const d = Math.abs(x(i) - px);
      if (best === null || d < best.d) {
        best = { d, i };
      }
    });
    setHover(best ? best.i : null);
  };

  const hp = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-300" data-testid="ct-legend">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-0.5 w-5 rounded ${ACTUAL.bg}`} />
          Imported (MPA)
        </span>
        <span className="flex items-center gap-2">
          <span className={`inline-block w-5 border-t-2 border-dashed ${FORECAST.border}`} />
          Forecast
        </span>
        {band.length > 0 && (
          <span className="flex items-center gap-2">
            <span className={`inline-block h-3 w-5 rounded-sm opacity-30 ${FORECAST.bg}`} />
            Range (8 of 10 test forecasts were inside)
          </span>
        )}
      </div>
      <div ref={boxRef} className="relative w-full" data-testid="ct-chart">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Container throughput, last ${actual.length} months and ${ahead.length} months forecast, in ${unit}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="block"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y(t)} y2={y(t)} strokeWidth="1" className="stroke-gray-200 dark:stroke-white/10" />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-gray-500 text-[11px] dark:fill-gray-400">
                {fmt(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text key={p.period} x={x(i)} y={height - 8} textAnchor="middle" className="fill-gray-500 text-[11px] dark:fill-gray-400">
                {p.label}
              </text>
            ) : null
          )}
          {band.length > 1 && (
            <polygon
              points={[
                ...band.map((i) => `${x(i)},${y(points[i].high)}`),
                ...band.slice().reverse().map((i) => `${x(i)},${y(points[i].low)}`),
              ].join(" ")}
              className={FORECAST.fill}
              opacity="0.15"
            />
          )}
          {segments
            .filter((s) => s && s.length > 1)
            .map((s) => (
              <polyline
                key={s[0]}
                points={s.map((i) => `${x(i)},${y(points[i].value)}`).join(" ")}
                fill="none"
                className={ACTUAL.stroke}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          {forecastLine.length > 1 && (
            <polyline
              data-testid="ct-forecast-line"
              points={forecastLine.map((i) => `${x(i)},${y(points[i].value)}`).join(" ")}
              fill="none"
              className={FORECAST.stroke}
              strokeWidth="2"
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {hp && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} strokeWidth="1" className="stroke-gray-300 dark:stroke-white/20" />
              <circle
                cx={x(hover)}
                cy={y(hp.value)}
                r="5"
                strokeWidth="2"
                className={`stroke-white dark:stroke-navy-800 ${hp.kind === "actual" ? ACTUAL.fill : FORECAST.fill}`}
              />
            </g>
          )}
        </svg>
        {hp && (
          <div
            data-testid="ct-tooltip"
            className="pointer-events-none absolute top-2 z-10 rounded-lg bg-white px-3 py-2 text-xs shadow-md dark:bg-navy-900"
            style={{ left: Math.min(Math.max(0, x(hover) - 90), Math.max(0, width - 190)) }}
          >
            <p className="font-bold text-navy-700 dark:text-white">{hp.label}</p>
            <p className="text-gray-600 dark:text-gray-300">
              {hp.kind === "actual" ? "Imported" : "Forecast"}: {fmt(hp.value)} {unit}
            </p>
            {hp.kind === "forecast" && hp.low !== null && hp.low !== undefined && (
              <p className="text-gray-500 dark:text-gray-400">
                Range {fmt(hp.low)} – {fmt(hp.high)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


// =========================================================
// THE TAB
// =========================================================

const NO_CSV = "No CSVs uploaded, please upload CSV.";

// A number with its unit ("3,912 thousand TEU"); small numbers keep one decimal.
const value = (v, unit) =>
  v === null || v === undefined
    ? "—"
    : `${fmt(v, Math.abs(v) < 100 ? 1 : 0)}${unit ? ` ${unit}` : ""}`;

// A short fingerprint of what is stored, so a new import or Reload is noticed.
const storedSignature = () => {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY) || "";
    return `${text.length}:${text.slice(0, 64)}:${text.slice(-64)}`;
  } catch (error) {
    return "unreadable";
  }
};

const CargoThroughput = () => {
  const [state, setState] = React.useState({ status: "loading", data: null, message: "" });
  const [selected, setSelected] = React.useState(null);
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const alive = React.useRef(true);
  const running = React.useRef(false);
  const signature = React.useRef(null);

  const load = React.useCallback(async () => {
    if (running.current) {
      return;
    }
    signature.current = storedSignature();
    const series = predictionSeries(loadStored());

    if (series.length === 0) {
      setState({ status: "none", data: null, message: "" });
      setUpdatedAt(Date.now());
      return;
    }

    running.current = true;
    setBusy(true);
    try {
      const data = await apiPost("/predictions/cargo-throughput", { series });
      if (alive.current) {
        setState({ status: "ready", data, message: "" });
        setUpdatedAt(Date.now());
        setSelected((current) =>
          data.series && data.series.some((s) => s.key === current)
            ? current
            : data.series && data.series.length
            ? data.series[0].key
            : null
        );
      }
    } catch (error) {
      if (alive.current) {
        const denied = error?.status === 403 || error?.status === 401;
        const missing = error?.status === 404 || error?.status === 405;
        setState((previous) => ({
          status: denied ? "denied" : previous.data ? "ready" : "error",
          data: denied ? null : previous.data,
          stale: !denied && Boolean(previous.data),
          message: missing
            ? "The backend does not have the new cargo throughput service yet. Install the new predictions.py and cargo_throughput.py on the backend and restart it."
            : String(error?.message || "Please try again."),
        }));
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  }, []);

  React.useEffect(() => {
    alive.current = true;
    load();
    // A new import or Reload on Cargo Operations (also in another tab).
    const check = () => {
      if (storedSignature() !== signature.current) {
        load();
      }
    };
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 5000);
    return () => {
      alive.current = false;
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, [load]);

  const header = (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h2 className="text-xl font-bold text-navy-700 dark:text-white">Predict Cargo Throughput</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Future cargo and container throughput of the Port of Singapore,
          from the CSV files uploaded on the Cargo Operations page.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="ct-updated" className="text-xs text-gray-500 dark:text-gray-400">
          {updatedAt ? `Updated ${clockFormat.format(new Date(updatedAt))} SGT` : ""}
        </span>
        <button
          type="button"
          data-testid="ct-refresh"
          disabled={busy}
          onClick={() => load()}
          className="flex items-center gap-2 rounded-xl bg-lightPrimary px-4 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
        >
          <MdRefresh className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Working" : "Refresh"}
        </button>
      </div>
    </div>
  );

  if (state.status === "none") {
    return (
      <Card testId="ct-no-csv">
        {header}
        <div className="mt-5">
          <Notice tone="warn" icon={MdUploadFile} testId="ct-no-data">
            <p className="font-bold">{NO_CSV}</p>
            <p className="mt-1">
              Go to Port Operations → Cargo Operations, choose Import CSV and
              select the cargo throughput files (for example MPA's "Container
              Throughput, Monthly" and "Cargo Throughput, Monthly" from
              data.gov.sg). Then come back to this tab: the forecasts appear
              by themselves.
            </p>
          </Notice>
        </div>
      </Card>
    );
  }

  if (state.status === "loading" || (busy && !state.data)) {
    return (
      <Card>
        {header}
        <p data-testid="ct-loading" className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Working... The first time after new CSVs are uploaded, each figure is
          trained and tested, which can take up to a minute.
        </p>
      </Card>
    );
  }

  if (state.status === "denied") {
    return (
      <Card>
        {header}
        <div className="mt-4" />
        <Notice tone="warn" icon={MdWarning} testId="ct-denied">
          Your account is not allowed to see the throughput predictions. They
          need the Port Analytics feature.
        </Notice>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        {header}
        <div className="mt-4" />
        <Notice tone="bad" icon={MdWarning} testId="ct-error">
          <p className="font-semibold">The forecasts could not be worked out.</p>
          <p className="mt-1">{state.message}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-600 shadow-sm dark:bg-navy-800 dark:text-red-300"
          >
            Try again
          </button>
        </Notice>
      </Card>
    );
  }

  const list = (state.data && state.data.series) || [];
  const current = list.find((s) => s.key === selected) || list[0];
  const f = current && current.forecast;
  const model = current && current.model;
  const names = (model && model.method_names) || {};
  const errorsAvg = (model && model.average_error_percent) || {};
  const per = current && current.frequency === "monthly" ? "month" : "year";
  return (
    <div>
      <Card testId="ct-status">
        {header}
        <div className="mt-5 space-y-3">
          {state.stale && (
            <Notice tone="warn" icon={MdWarning} testId="ct-stale">
              The forecasts could not be refreshed just now ({state.message}). The last ones are shown.
            </Notice>
          )}
          <Notice tone="info" icon={MdInfoOutline} testId="ct-source">
            Made from the {fmt(list.length)} figure{list.length === 1 ? "" : "s"} in the CSV
            files uploaded on Cargo Operations in this browser. Each figure was
            tested on its newest part, which it had not seen; the machine-learning
            model is used only where it was at least 5% more accurate than the
            best simple guess.
          </Notice>
        </div>

        {/* OVERVIEW OF ALL FIGURES */}
        <div className="-mx-2 mt-5 overflow-x-auto">
          <table data-testid="ct-overview" className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="px-2 py-3">Figure</th>
                <th className="px-2 py-3">Imported</th>
                <th className="px-2 py-3">Next forecast</th>
                <th className="px-2 py-3">Method</th>
                <th className="px-2 py-3">Test error</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const first = s.forecast && s.forecast.available ? s.forecast.rows[0] : null;
                const m = s.model;
                const err = m ? (m.average_error_percent || {})[s.state === "ready" ? m.best_model : m.best_simple] : null;
                const active = current && s.key === current.key;
                return (
                  <tr
                    key={s.key}
                    data-testid="ct-overview-row"
                    onClick={() => setSelected(s.key)}
                    className={`cursor-pointer border-b border-gray-50 last:border-0 dark:border-white/5 ${
                      active ? "bg-lightPrimary dark:bg-navy-700" : "hover:bg-gray-50 dark:hover:bg-navy-700/60"
                    }`}
                  >
                    <td className="px-2 py-2.5 font-semibold text-navy-700 dark:text-white">
                      <button type="button" onClick={() => setSelected(s.key)} className="text-left" aria-pressed={active}>
                        {s.name}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-gray-600 dark:text-gray-300">
                      {s.first ? `${s.first} – ${s.last}` : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-navy-700 dark:text-white">
                      {first ? `${first.label}: ${value(first.expected, s.unit)}` : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-gray-600 dark:text-gray-300">
                      {s.forecast && s.forecast.available
                        ? s.forecast.is_ml
                          ? `ML: ${s.forecast.method}`
                          : `Simple: ${s.forecast.method}`
                        : "Cannot be worked out"}
                    </td>
                    <td className="px-2 py-2.5 text-gray-600 dark:text-gray-300">
                      {err !== null && err !== undefined ? `${fmt(err, 2)}%` : "Not tested"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* THE CHOSEN FIGURE */}

      {current && (
        <Card testId="ct-detail" className="mt-5">
          <div className="mb-4">
            <h3 data-testid="ct-detail-title" className="text-lg font-bold text-navy-700 dark:text-white">
              {current.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {fmt(current.points)} {current.frequency === "monthly" ? "months" : "years"} imported
              {current.first ? ` (${current.first} – ${current.last})` : ""}
              {current.unit ? `, in ${current.unit}` : ", units as in the file"}
              {current.source ? `. File: ${current.source}` : ""}
            </p>
          </div>

          <div className="space-y-3">
            {current.state === "ready" && model && (
              <Notice tone="good" icon={MdCheckCircle} testId="ct-ready">
                <p className="font-bold">
                  Machine-learning model used ({model.best_model}): on average{" "}
                  {fmt(errorsAvg[model.best_model], 2)}% off, against{" "}
                  {fmt(errorsAvg[model.best_simple], 2)}% for the best simple guess (
                  {names[model.best_simple]}), {fmt(model.improvement_percent, 1)}% better.
                </p>
                <p className="mt-1">
                  Tested from every {per} of {model.test_from} to {model.test_to}, which it had
                  not seen; learned from {fmt(model.train_points)} {per}s.
                </p>
              </Notice>
            )}
            {current.state === "not_better_than_baseline" && model && (
              <Notice tone="warn" icon={MdWarning} testId="ct-not-better">
                <p className="font-bold">
                  The model was not clearly more accurate than the best simple
                  guess, so the simple guess is used ({names[model.best_simple]}).
                </p>
                <p className="mt-1">
                  Average test error: best model {model.best_model}{" "}
                  {fmt(errorsAvg[model.best_model], 2)}%, {names[model.best_simple]}{" "}
                  {fmt(errorsAvg[model.best_simple], 2)}% (at least{" "}
                  {fmt(model.required_improvement_percent ?? 5)}% better is required).
                </p>
              </Notice>
            )}
            {current.state === "not_enough_data" && (
              <Notice tone="info" icon={MdInfoOutline} testId="ct-not-enough">
                <p className="font-bold">
                  Too few figures to train and test a model: {fmt(current.points)} imported,{" "}
                  {fmt(current.points_needed)} needed.
                </p>
                <p className="mt-1">
                  {current.reason ||
                    "A simple estimate is shown, labelled as not machine learning, without a tested range."}
                </p>
              </Notice>
            )}
            {current.model_error && (
              <Notice tone="bad" icon={MdWarning} testId="ct-model-error">
                {current.model_error}
              </Notice>
            )}
            {f && !f.available && (
              <Notice tone="warn" icon={MdWarning} testId="ct-forecast-unavailable">
                <p className="font-semibold">Cannot be worked out right now.</p>
                <p className="mt-1">{f.reason}</p>
              </Notice>
            )}
          </div>

          {f && f.available && (
            <div data-testid="ct-forecast" className="mt-5">
              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700" data-testid="ct-tile-next">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{f.total_label_next}</p>
                  <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">{value(f.total_next)}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{current.unit || "units as in the file"}</p>
                </div>
                <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700" data-testid="ct-tile-last">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{f.total_label_last}</p>
                  <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">{value(f.total_last)}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Up to {f.based_on_last}</p>
                </div>
                <div className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700" data-testid="ct-tile-change">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Change</p>
                  <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
                    {f.total_next !== null && f.total_last ? pct((f.total_next / f.total_last - 1) * 100) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Forecast against the imported figure</p>
                </div>
              </div>

              <p data-testid="ct-method" className="mb-3 text-sm font-semibold text-navy-700 dark:text-white">
                {f.is_ml ? `ML model: ${f.method}` : `Simple estimate (not machine learning): ${f.method}`}
              </p>

              <ThroughputChart
                history={current.history || []}
                forecast={f.rows}
                unit={current.unit || ""}
                frequency={current.frequency}
              />

              <div className="-mx-2 mt-5 overflow-x-auto">
                <table data-testid="ct-table" className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                      <th className="px-2 py-3">{current.frequency === "monthly" ? "Month" : "Year"}</th>
                      <th className="px-2 py-3">Forecast{current.unit ? ` (${current.unit})` : ""}</th>
                      <th className="px-2 py-3">Range</th>
                      <th className="px-2 py-3">{f.rows[0] ? f.rows[0].compare_label : ""}</th>
                      <th className="px-2 py-3">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.rows.map((m) => (
                      <tr key={m.period} data-testid="ct-row" className="border-b border-gray-50 last:border-0 dark:border-white/5">
                        <td className="px-2 py-2.5 font-semibold text-navy-700 dark:text-white">{m.label}</td>
                        <td className="px-2 py-2.5 text-navy-700 dark:text-white">{value(m.expected)}</td>
                        <td className="px-2 py-2.5 text-gray-600 dark:text-gray-300">
                          {m.low !== null ? `${value(m.low)} – ${value(m.high)}` : "Not tested"}
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 dark:text-gray-300">{value(m.compare)}</td>
                        <td className="px-2 py-2.5 text-gray-600 dark:text-gray-300">{pct(m.change_percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {f.tested
                  ? "Range: in the test, 8 of 10 forecasts this far ahead were inside it. "
                  : "No range: it comes from the test, which needs more imported figures. "}
                Forecasts further ahead are less certain, and sudden events (like
                2009 or 2020) cannot be foreseen from past figures.
              </p>
            </div>
          )}

          {model && (
            <div className="mt-6">
              <CardTitle
                title="How accurate is it?"
                subtitle={`Average error in % on ${model.test_from} – ${model.test_to}, which the methods did not see while learning. Lower is better.`}
              />
              <div className="-mx-2 overflow-x-auto">
                <table data-testid="ct-accuracy" className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                      <th className="px-2 py-3">Method</th>
                      {(model.by_ahead || []).map((r) => (
                        <th key={r.ahead} className="px-2 py-3">
                          {r.ahead} {per}{r.ahead === 1 ? "" : "s"} ahead
                        </th>
                      ))}
                      <th className="px-2 py-3">Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(errorsAvg)
                      .sort((a, b) => errorsAvg[a] - errorsAvg[b])
                      .map((key) => {
                        const used = key === (current.state === "ready" ? model.best_model : model.best_simple);
                        return (
                          <tr
                            key={key}
                            data-testid="ct-accuracy-row"
                            className={`border-b border-gray-50 last:border-0 dark:border-white/5 ${
                              used ? "font-semibold text-navy-700 dark:text-white" : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            <td className="px-2 py-2.5">
                              {names[key] || key}
                              {used ? " (used)" : ""}
                            </td>
                            {(model.by_ahead || []).map((r) => (
                              <td key={r.ahead} className="px-2 py-2.5">
                                {r[key] !== null && r[key] !== undefined ? `${fmt(r[key], 2)}%` : "—"}
                              </td>
                            ))}
                            <td className="px-2 py-2.5">{fmt(errorsAvg[key], 2)}%</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {current.frequency === "monthly" && !model.xgboost_available && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  XGBoost was not installed on the backend, so it was not compared.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
        Sources: the CSV files uploaded on Cargo Operations (MPA and SingStat via
        data.gov.sg). Forecasts are decision support, not certainties.
      </p>
    </div>
  );
};

export default CargoThroughput;
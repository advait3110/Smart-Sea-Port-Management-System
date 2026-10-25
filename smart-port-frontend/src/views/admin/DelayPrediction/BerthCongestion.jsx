import React from "react";

import {
  MdCheckCircle,
  MdDirectionsBoat,
  MdInfoOutline,
  MdRefresh,
  MdTrendingUp,
  MdWarning,
} from "react-icons/md";

import { apiGet } from "../../../services/api";
import {
  Card,
  CardTitle,
  Notice,
  REFRESH_MS,
  Tile,
  clockFormat,
  fmt,
  sgt,
} from "./shared";

// =========================================================
// PREDICT BERTH CONGESTION (port crowding)
// =========================================================
//
//   GET /predictions/berth-congestion
//     ships in port waters right now (live AIS feed), the last 48 hourly
//     snapshots, how much training data exists, the model's test results.
//   GET /predictions/berth-congestion/forecast
//     the "Predict congestion" button: expected ships in port in 6, 12
//     and 24 hours. The trained ML model where it is in use; otherwise
//     the trend of the last hours, labelled as not machine learning.
//
// Nothing here is made up: no live feed or no history means the page
// says so instead of showing a number.

const LEVEL_TONES = {
  Low: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  Normal: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  High: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  "Very high": "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const LevelChip = ({ level, testId }) =>
  level ? (
    <span
      data-testid={testId}
      className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${LEVEL_TONES[level] || LEVEL_TONES.Normal}`}
    >
      {level} congestion
    </span>
  ) : null;

const changeText = (change) => {
  if (change === null || change === undefined) {
    return "";
  }
  if (change === 0) {
    return "same as now";
  }
  return `${change > 0 ? "+" : "−"}${fmt(Math.abs(change))} from now`;
};

const dayHourFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  hour12: false,
});

// =========================================================
// 48-HOUR CHART (ships in port, one point per hourly snapshot)
// =========================================================

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

const HistoryChart = ({ history, levels }) => {
  const [boxRef, width] = useWidth();
  const [hover, setHover] = React.useState(null);

  const points = history
    .map((h) => ({ ...h, time: new Date(h.taken_at).getTime() }))
    .filter((h) => !Number.isNaN(h.time))
    .sort((a, b) => a.time - b.time);

  const height = 240;
  const pad = { top: 16, right: 16, bottom: 30, left: 40 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const values = points.map((p) => p.ships_in_port);
  const refs = levels ? [levels.p75, levels.p90] : [];
  const rawMin = Math.min(...values, ...refs);
  const rawMax = Math.max(...values, ...refs);
  const span = Math.max(4, rawMax - rawMin);
  const yMin = Math.max(0, Math.floor((rawMin - span * 0.15) / 5) * 5);
  const yMax = Math.ceil((rawMax + span * 0.15) / 5) * 5;

  const tMax = points.length ? points[points.length - 1].time : Date.now();
  const tMin = Math.min(points.length ? points[0].time : tMax, tMax - 47 * 3600 * 1000);
  const x = (t) => pad.left + ((t - tMin) / Math.max(1, tMax - tMin)) * plotW;
  const y = (v) => pad.top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH;

  // Break the line where an hour is missing (backend was off).
  const segments = [];
  points.forEach((p, i) => {
    if (i === 0 || p.time - points[i - 1].time > 90 * 60 * 1000) {
      segments.push([p]);
    } else {
      segments[segments.length - 1].push(p);
    }
  });

  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const xTicks = [];
  const stepHours = width < 480 ? 24 : 12;
  const firstTick = Math.ceil(tMin / (stepHours * 3600 * 1000)) * stepHours * 3600 * 1000;
  for (let t = firstTick; t <= tMax; t += stepHours * 3600 * 1000) {
    xTicks.push(t);
  }

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    let best = null;
    points.forEach((p) => {
      const d = Math.abs(x(p.time) - px);
      if (best === null || d < best.d) {
        best = { d, p };
      }
    });
    setHover(best ? best.p : null);
  };

  return (
    <div ref={boxRef} className="relative w-full" data-testid="bc-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Ships in port over the last 48 hours, ${points.length} hourly counts`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={y(t)}
              y2={y(t)}
              className="stroke-gray-200 dark:stroke-white/10"
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-gray-500 text-[11px] dark:fill-gray-400"
            >
              {Math.round(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={height - 8}
            textAnchor="middle"
            className="fill-gray-500 text-[11px] dark:fill-gray-400"
          >
            {`${dayHourFormat.format(new Date(t))}:00`}
          </text>
        ))}
        {levels &&
          [
            { value: levels.p75, label: "High" },
            { value: levels.p90, label: "Very high" },
          ].map((r) => (
            <g key={r.label}>
              <line
                x1={pad.left}
                x2={pad.left + plotW}
                y1={y(r.value)}
                y2={y(r.value)}
                strokeDasharray="4 4"
                strokeWidth="1"
                className="stroke-gray-400 dark:stroke-gray-500"
              />
              <text
                x={pad.left + plotW}
                y={y(r.value) - 4}
                textAnchor="end"
                className="fill-gray-500 text-[11px] dark:fill-gray-400"
              >
                {`${r.label} from ${fmt(r.value)}`}
              </text>
            </g>
          ))}
        {segments.map((segment) =>
          segment.length === 1 ? (
            <circle
              key={segment[0].time}
              cx={x(segment[0].time)}
              cy={y(segment[0].ships_in_port)}
              r="3"
              className="fill-brand-500 dark:fill-brand-400"
            />
          ) : (
            <polyline
              key={segment[0].time}
              points={segment.map((p) => `${x(p.time)},${y(p.ships_in_port)}`).join(" ")}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-brand-500 dark:stroke-brand-400"
            />
          )
        )}
        {hover && (
          <g>
            <line
              x1={x(hover.time)}
              x2={x(hover.time)}
              y1={pad.top}
              y2={pad.top + plotH}
              strokeWidth="1"
              className="stroke-gray-300 dark:stroke-white/20"
            />
            <circle
              cx={x(hover.time)}
              cy={y(hover.ships_in_port)}
              r="5"
              strokeWidth="2"
              className="fill-brand-500 stroke-white dark:fill-brand-400 dark:stroke-navy-800"
            />
          </g>
        )}
      </svg>
      {hover && (
        <div
          data-testid="bc-tooltip"
          className="pointer-events-none absolute top-2 z-10 rounded-lg bg-white px-3 py-2 text-xs shadow-md dark:bg-navy-900"
          style={{
            left: Math.min(Math.max(0, x(hover.time) - 80), Math.max(0, width - 170)),
          }}
        >
          <p className="font-bold text-navy-700 dark:text-white">{sgt(hover.taken_at)}</p>
          <p className="text-gray-600 dark:text-gray-300">
            {fmt(hover.ships_in_port)} ships in port
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            {fmt(hover.at_anchor)} at anchorage · {fmt(hover.at_berth)} at a berth
          </p>
        </div>
      )}
    </div>
  );
};

// =========================================================
// THE TAB
// =========================================================

const BerthCongestion = () => {
  const [state, setState] = React.useState({ status: "loading", data: null, message: "" });
  const [refreshing, setRefreshing] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [forecast, setForecast] = React.useState(null); // {status, data|message}

  const alive = React.useRef(true);
  const busy = React.useRef(false);

  const load = React.useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setRefreshing(true);
    try {
      const data = await apiGet("/predictions/berth-congestion");
      if (alive.current) {
        setState({ status: "ready", data, message: "" });
        setUpdatedAt(Date.now());
      }
    } catch (error) {
      if (alive.current) {
        const denied = error?.status === 403 || error?.status === 401;
        const missing = error?.status === 404;
        setState((previous) => ({
          status: denied ? "denied" : previous.data ? "ready" : "error",
          data: denied ? null : previous.data,
          stale: !denied && Boolean(previous.data),
          message: missing
            ? "The backend does not have the berth congestion service yet. Install the new predictions.py on the backend and restart it."
            : String(error?.message || "Please try again."),
        }));
      }
    } finally {
      busy.current = false;
      if (alive.current) {
        setRefreshing(false);
      }
    }
  }, []);

  React.useEffect(() => {
    alive.current = true;
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
      }
    }, REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const predict = async () => {
    setForecast({ status: "loading" });
    try {
      const data = await apiGet("/predictions/berth-congestion/forecast");
      if (alive.current) {
        setForecast({ status: "done", data });
      }
    } catch (error) {
      if (alive.current) {
        setForecast({
          status: "error",
          message: String(error?.message || "Could not be predicted."),
        });
      }
    }
  };

  const header = (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h2 className="text-xl font-bold text-navy-700 dark:text-white">
          Predict Berth Congestion
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          How crowded the Port of Singapore will be: ships waiting at
          anchorage or at a berth in 6, 12 and 24 hours.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="bc-updated" className="text-xs text-gray-500 dark:text-gray-400">
          {updatedAt ? `Updated ${clockFormat.format(new Date(updatedAt))} SGT` : ""}
        </span>
        <button
          type="button"
          data-testid="bc-refresh"
          disabled={refreshing}
          onClick={() => load()}
          className="flex items-center gap-2 rounded-xl bg-lightPrimary px-4 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
        >
          <MdRefresh className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </div>
  );

  if (state.status === "loading") {
    return (
      <Card>
        {header}
        <p data-testid="bc-loading" className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Loading...
        </p>
      </Card>
    );
  }

  if (state.status === "denied") {
    return (
      <Card>
        {header}
        <div className="mt-4" />
        <Notice tone="warn" icon={MdWarning} testId="bc-denied">
          Your account is not allowed to see the congestion predictions. They
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
        <Notice tone="bad" icon={MdWarning} testId="bc-error">
          <p className="font-semibold">The congestion data could not be loaded.</p>
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

  const data = state.data || {};
  const now = data.now || {};
  const levels = data.levels;
  const collection = data.collection || {};
  const collector = collection.collector || {};
  const model = data.model;
  const records = Array.isArray(data.records) ? data.records : [];
  const needed = Number(data.records_needed) || 300;
  const history = Array.isArray(data.history) ? data.history : [];
  const inUse = model && Array.isArray(model.in_use_hours) ? model.in_use_hours : [];
  const f = forecast && forecast.status === "done" ? forecast.data : null;

  return (
    <div>
      <Card testId="bc-status">
        {header}
        <div className="mt-5 space-y-3">
          {state.stale && (
            <Notice tone="warn" icon={MdWarning} testId="bc-stale">
              The data could not be refreshed just now ({state.message}). The
              last loaded data is shown.
            </Notice>
          )}

          {data.state === "ready" ? (
            <Notice tone="good" icon={MdCheckCircle} testId="bc-ready">
              <p className="font-bold">
                Predict congestion uses the trained model for{" "}
                {inUse.map((h) => `${h} h`).join(", ")} ahead.
              </p>
              <p className="mt-1">
                {inUse.length < 3
                  ? "The other times ahead keep the trend estimate, because the model was not clearly more accurate there. "
                  : ""}
                Last trained {sgt(model.trained_at)} SGT.
              </p>
            </Notice>
          ) : (
            <Notice tone="info" icon={MdInfoOutline} testId="bc-estimate-mode">
              <p className="font-bold">
                Predict congestion works now from live data: the ships in port
                now plus the recent difference between arrivals and
                departures, carried forward.
              </p>
              <p className="mt-1">
                This is a calculation, not the machine-learning model, and it
                gets less reliable the further ahead it looks. The model takes
                over automatically once it is trained.
              </p>
            </Notice>
          )}

          {data.state === "not_trained" && (
            <Notice tone="info" icon={MdInfoOutline} testId="bc-not-trained">
              <p className="font-bold">
                Model not trained yet: {needed} records are needed for each time ahead.
              </p>
              <p className="mt-1">
                A record is an hourly snapshot of the port with another
                snapshot exactly 6, 12 or 24 hours later. Snapshots are saved
                every hour while the backend is running.
              </p>
              <div className="mt-3 space-y-2">
                {records.map((r) => {
                  const pct = Math.min(100, (r.found / needed) * 100);
                  return (
                    <div key={r.hours_ahead} data-testid="bc-record">
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{r.hours_ahead} hours ahead</span>
                        <span>
                          {fmt(r.found)} / {fmt(needed)}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-white dark:bg-navy-900">
                        <div
                          className="h-2.5 rounded-full bg-brand-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {records.length > 0 && records.every((r) => r.found >= needed) && (
                <p className="mt-2 text-xs">
                  Enough data: run the training script on the backend.
                </p>
              )}
            </Notice>
          )}

          {data.state === "not_better_than_baseline" && model && (
            <Notice tone="warn" icon={MdWarning} testId="bc-not-better">
              <p className="font-bold">
                The model was trained, but it was not clearly more accurate
                than simple guesses, so it is not used yet.
              </p>
              <p className="mt-1">
                It has to beat the best of "same as now", the recent trend
                and the usual number by at least{" "}
                {fmt(model.required_improvement_percent ?? 5)}%. See the
                details below.
              </p>
            </Notice>
          )}

          {data.model_error && (
            <Notice tone="bad" icon={MdWarning} testId="bc-model-error">
              {data.model_error}
            </Notice>
          )}
        </div>
      </Card>

      {/* ---------------- RIGHT NOW ---------------- */}

      <Card testId="bc-now" className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              The port right now
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Seagoing ships seen by the live AIS feed in the last 2 hours.
            </p>
          </div>
          {now.available && <LevelChip level={now.level} testId="bc-now-level" />}
        </div>
        {now.available || now.partial ? (
          <>
            {now.partial && (
              <div className="mb-4">
                <Notice tone="info" icon={MdInfoOutline} testId="bc-now-partial">
                  {now.reason}
                </Notice>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                testId="bc-tile-in-port"
                label="Ships in port"
                value={fmt(now.ships_in_port)}
                note={now.partial ? "Counted so far (still going up)" : "At anchorage or at a berth"}
              />
              <Tile
                testId="bc-tile-anchor"
                label="At anchorage"
                value={fmt(now.at_anchor)}
                note="Waiting, status “At anchor”"
              />
              <Tile
                testId="bc-tile-berth"
                label="At a berth"
                value={fmt(now.at_berth)}
                note={`Status “Moored”${
                  now.stopped_other ? ` · ${fmt(now.stopped_other)} more stopped without a status` : ""
                }`}
              />
              <Tile
                testId="bc-tile-underway"
                label="Underway"
                value={fmt(now.underway)}
                note="Moving in the area"
              />
            </div>
            {!levels && (
              <p data-testid="bc-no-levels" className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Low / Normal / High levels are shown after{" "}
                {fmt(data.levels_needed_snapshots || 48)} hourly snapshots
                (now {fmt(collection.snapshots)}), because they compare with
                the port's own history.
              </p>
            )}
          </>
        ) : (
          <Notice tone="warn" icon={MdWarning} testId="bc-now-unavailable">
            {now.reason || "The ships in port cannot be counted right now."}
          </Notice>
        )}
      </Card>

      {/* ---------------- PREDICT ---------------- */}

      <Card testId="bc-predict-card" className="mt-5">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Congestion in the next 24 hours
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Press Predict congestion to see how many ships are expected in
              port 6, 12 and 24 hours from now.
            </p>
          </div>
          <button
            type="button"
            data-testid="bc-predict"
            disabled={forecast?.status === "loading"}
            onClick={() => predict()}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            <MdTrendingUp className="h-5 w-5" />
            {forecast?.status === "loading"
              ? "Predicting..."
              : f
              ? "Predict again"
              : "Predict congestion"}
          </button>
        </div>

        {forecast?.status === "error" && (
          <Notice tone="bad" icon={MdWarning} testId="bc-predict-error">
            {forecast.message}
          </Notice>
        )}

        {f && !f.available && (
          <Notice tone="warn" icon={MdWarning} testId="bc-forecast-unavailable">
            <p className="font-semibold">Cannot be worked out right now.</p>
            <p className="mt-1">{f.reason}</p>
          </Notice>
        )}

        {f && f.available && (
          <div data-testid="bc-forecast">
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              Now: <strong>{fmt(f.now.ships_in_port)} ships in port</strong>{" "}
              ({fmt(f.now.at_anchor)} at anchorage, {fmt(f.now.at_berth)} at a
              berth), worked out at {sgt(f.checked_at)} SGT.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {f.forecasts.map((item) => (
                <div
                  key={item.hours_ahead}
                  data-testid="bc-horizon"
                  className="rounded-xl bg-lightPrimary p-4 dark:bg-navy-700"
                >
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    In {item.hours_ahead} hours · {sgt(item.at)}
                  </p>
                  {item.available ? (
                    <>
                      <p className="mt-1 text-2xl font-bold text-navy-700 dark:text-white">
                        {fmt(item.expected_ships)} ships
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {changeText(item.change)}
                      </p>
                      <div className="mt-2">
                        <LevelChip level={item.level} />
                      </div>
                      <p className="mt-3 text-xs font-semibold text-navy-700 dark:text-white">
                        {item.is_ml
                          ? `ML model: ${item.method}`
                          : "Trend estimate (not machine learning)"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                        {item.note}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {item.note}
                    </p>
                  )}
                  <p className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <MdDirectionsBoat className="h-3.5 w-3.5 shrink-0" />
                    {fmt(item.due_by_eta)} ship{item.due_by_eta === 1 ? "" : "s"} due by
                    reported ETA in this time
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---------------- LAST 48 HOURS ---------------- */}

      <Card testId="bc-history" className="mt-5">
        <CardTitle
          title="Ships in port, last 48 hours"
          subtitle="One count per hour while the backend was running. Gaps are hours when it was off."
        />
        {history.length >= 2 ? (
          <HistoryChart history={history} levels={levels} />
        ) : (
          <p
            data-testid="bc-no-history"
            className="rounded-xl bg-lightPrimary p-4 text-sm text-gray-500 dark:bg-navy-900 dark:text-gray-300"
          >
            {history.length === 1
              ? "Only one hourly snapshot so far; the chart starts with the second."
              : "No hourly snapshots in the last 48 hours. The first one is saved at the first full hour after the backend has been running for 30 minutes, then one every hour."}
          </p>
        )}
      </Card>

      {/* ---------------- DATA ---------------- */}

      <Card testId="bc-collection" className="mt-5">
        <CardTitle
          title="Training data for the machine-learning model"
          subtitle="Hourly snapshots of the port from the live AIS feed."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            testId="bc-tile-snapshots"
            label="Hourly snapshots saved"
            value={fmt(collection.snapshots)}
            note={
              collection.first_snapshot
                ? `Since ${sgt(collection.first_snapshot)} SGT`
                : "None yet"
            }
          />
          <Tile
            testId="bc-tile-24h"
            label="In the last 24 hours"
            value={`${fmt(collection.snapshots_24h)} / 24`}
            note="One per hour while the backend runs"
          />
          <Tile
            testId="bc-tile-last"
            label="Last snapshot"
            value={collection.last_snapshot ? clockFormat.format(new Date(collection.last_snapshot)) : "—"}
            note={collection.last_snapshot ? `${sgt(collection.last_snapshot)} SGT` : "None yet"}
          />
          <Tile
            testId="bc-tile-feed"
            label="Live AIS feed"
            value={collector.connected ? "Connected" : "Not connected"}
            note={
              collector.connected
                ? "Collecting"
                : collector.last_error || "Data is only collected while the backend runs."
            }
          />
        </div>
      </Card>

      {/* ---------------- MODEL DETAILS ---------------- */}

      {model && (
        <Card testId="bc-model" className="mt-5">
          <CardTitle
            title="How accurate is the model?"
            subtitle="Average error in ships on the newest records, which the model did not see while learning. Lower is better."
          />
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                  <th className="px-2 py-3">Time ahead</th>
                  <th className="px-2 py-3">Records</th>
                  <th className="px-2 py-3">Best simple guess</th>
                  <th className="px-2 py-3">Model</th>
                  <th className="px-2 py-3">Better by</th>
                  <th className="px-2 py-3">Used?</th>
                </tr>
              </thead>
              <tbody>
                {(model.horizons || []).map((h) => (
                  <tr
                    key={h.hours_ahead}
                    data-testid="bc-model-row"
                    className="border-b border-gray-50 last:border-0 dark:border-white/5"
                  >
                    <td className="px-2 py-3 font-semibold text-navy-700 dark:text-white">
                      {h.hours_ahead} h
                    </td>
                    <td className="px-2 py-3 text-gray-600 dark:text-gray-300">
                      {fmt(h.records_found)}
                    </td>
                    {h.status === "not_enough_data" ? (
                      <td colSpan={4} className="px-2 py-3 text-gray-500 dark:text-gray-400">
                        Not enough data yet ({fmt(h.records_needed)} needed).
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-3 text-gray-600 dark:text-gray-300">
                          {h.baseline}: {fmt(h.baseline_mae_ships, 1)} ships
                        </td>
                        <td className="px-2 py-3 text-gray-600 dark:text-gray-300">
                          {h.best_model}: {fmt(h.best_mae_ships, 1)} ships
                        </td>
                        <td className="px-2 py-3 text-gray-600 dark:text-gray-300">
                          {fmt(h.improvement_percent, 1)}%
                        </td>
                        <td className="px-2 py-3 font-semibold">
                          {h.status === "trained" && inUse.includes(h.hours_ahead) ? (
                            <span className="text-green-700 dark:text-green-300">Yes</span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">
                              No (needs {fmt(model.required_improvement_percent ?? 5)}%)
                            </span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!model.xgboost_available && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              XGBoost was not installed when the model was trained, so only
              scikit-learn was compared.
            </p>
          )}
        </Card>
      )}

      <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
        Counted in the live AIS feed's area around Singapore, which can include
        a few ships in neighbouring waters. The app has no records for each
        individual berth, so congestion is predicted for the port as a whole.
      </p>
    </div>
  );
};

export default BerthCongestion;
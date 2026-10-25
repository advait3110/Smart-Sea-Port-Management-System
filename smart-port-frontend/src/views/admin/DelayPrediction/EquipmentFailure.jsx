import React from "react";

import {
  MdBuild,
  MdCheckCircle,
  MdInfoOutline,
  MdRefresh,
  MdWarning,
} from "react-icons/md";

import { apiGet } from "../../../services/api";
import { Card, CardTitle, Notice, REFRESH_MS, Tile, clockFormat, fmt } from "./shared";

// =========================================================
// PREDICT EQUIPMENT FAILURE
// =========================================================
//
// GET /predictions/equipment-failure
//   Every asset from the Asset & Maintenance page, most at risk first.
//
// Two parts, always labelled honestly:
//   1. Maintenance risk (rules, not machine learning): points from the
//      records (out of service, overdue jobs, breakdowns in the last 12
//      months, maintenance later than usual), with the reasons written out.
//   2. Chance of a breakdown in the next 30 days (machine learning): only
//      once 30 breakdowns are recorded and the model beat the simple guess
//      "usual breakdown rate" by at least 5 % on the newest records.
//
// Nothing is made up: with no equipment registered the tab says so.

const LEVEL_STYLE = {
  High: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  Medium: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200",
  Low: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
};

const STATUS_STYLE = {
  "Out of Service": "text-red-600 dark:text-red-300",
  Overdue: "text-orange-600 dark:text-orange-300",
  Maintenance: "text-brand-500 dark:text-brand-400",
  "Maintenance Due": "text-amber-600 dark:text-amber-300",
  Operational: "text-green-600 dark:text-green-300",
};

const shortDate = (iso) => {
  if (!iso) {
    return "Never";
  }
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const Level = ({ level }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL_STYLE[level] || ""}`}>
    {level}
  </span>
);

const Chance = ({ value }) =>
  value === null || value === undefined ? (
    <span className="text-gray-400 dark:text-gray-500">—</span>
  ) : (
    <span className="font-semibold text-navy-700 dark:text-white">{fmt(value, 0)}%</span>
  );

// =========================================================
// THE MACHINE-LEARNING PART
// =========================================================

const ModelCard = ({ ml }) => {
  const model = ml.model;
  const needed = ml.breakdowns_needed || 30;
  const found = ml.breakdowns || 0;

  return (
    <Card testId="ef-model">
      <CardTitle
        title={`Chance of a breakdown in the next ${ml.window_days || 30} days (machine learning)`}
        subtitle="Learned from this port's own breakdown and maintenance records. Tested on the newest records, which the model did not see while learning."
      />

      {ml.model_error && (
        <div className="mb-4">
          <Notice tone="bad" icon={MdWarning} testId="ef-model-error">
            {ml.model_error}
          </Notice>
        </div>
      )}

      {ml.state === "ready" && model && (
        <Notice tone="good" icon={MdCheckCircle} testId="ef-model-ready">
          In use: <b>{model.best_model}</b>. On the test records its chances
          were <b>{fmt(model.improvement_percent, 1)}% more accurate</b> than
          the simple guess "{model.best_simple}" (at least{" "}
          {fmt(model.required_improvement_percent, 0)}% is required). The
          "Chance in 30 days" column shows its result.
        </Notice>
      )}

      {ml.state === "not_better_than_baseline" && model && (
        <Notice tone="warn" icon={MdInfoOutline} testId="ef-model-not-better">
          A model was trained on {fmt(found)} breakdowns but it was{" "}
          <b>not better</b> than the simple guess "{model.best_simple}" on the
          test records ({fmt(model.improvement_percent, 1)}%, at least{" "}
          {fmt(model.required_improvement_percent, 0)}% is required). It is
          not used, so no chances are shown. It is trained again by itself
          when the records change.
        </Notice>
      )}

      {ml.state === "not_enough_data" && (
        <div data-testid="ef-model-waiting">
          <Notice tone="info" icon={MdInfoOutline}>
            Not trained yet: {fmt(found)} of {fmt(needed)} breakdowns are
            recorded. A breakdown is when equipment is marked{" "}
            <b>Out of Service</b> or a <b>Repair</b> job is entered on the
            Asset & Maintenance page. The model trains by itself once there
            are enough. Until then only the risk from the rules is shown.
            {ml.reason ? ` ${ml.reason}` : ""}
          </Notice>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-navy-700 dark:text-white">Breakdowns recorded</span>
              <span className="font-semibold text-gray-600 dark:text-gray-300">
                {fmt(found)} / {fmt(needed)}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-navy-900">
              <div
                className="h-2.5 rounded-full bg-brand-500"
                style={{ width: `${Math.min(100, (found / needed) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {model && model.brier && (
        <div className="mt-5 overflow-x-auto">
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            Test from {shortDate(model.test_from)} to {shortDate(model.test_to)}:{" "}
            {fmt(model.looks_test)} checks of the equipment,{" "}
            {fmt(model.breakdowns_in_test)} of them followed by a breakdown.
            Error of the chances (Brier score), lower is better:
          </p>
          <table data-testid="ef-accuracy" className="w-full min-w-[360px] text-left text-sm">
            <tbody>
              {Object.entries(model.brier)
                .sort((a, b) => a[1] - b[1])
                .map(([name, score]) => (
                  <tr key={name} className="border-t border-gray-100 dark:border-white/10">
                    <td className="py-2 pr-3 text-navy-700 dark:text-white">
                      {name}
                      {name === model.best_model && ml.state === "ready" ? " (in use)" : ""}
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-600 dark:text-gray-300">
                      {fmt(score, 4)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

// =========================================================
// THE TAB
// =========================================================

const FILTERS = ["All", "High", "Medium", "Low"];

const EquipmentFailure = () => {
  const [state, setState] = React.useState({ status: "loading", data: null, message: "" });
  const [refreshing, setRefreshing] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [filter, setFilter] = React.useState("All");

  const alive = React.useRef(true);
  const busy = React.useRef(false);

  const load = React.useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setRefreshing(true);
    try {
      const data = await apiGet("/predictions/equipment-failure");
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
          message: missing
            ? "The backend does not have the equipment failure service yet. Install the new predictions.py and app/ml/equipment_failure.py on the backend and restart it."
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

  const header = (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h2 className="text-xl font-bold text-navy-700 dark:text-white">
          Predict Equipment Failure
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Which port equipment is most likely to break down, so it can be
          serviced first. From the Asset & Maintenance records.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="ef-updated" className="text-xs text-gray-500 dark:text-gray-400">
          {updatedAt ? `Updated ${clockFormat.format(new Date(updatedAt))} SGT` : ""}
        </span>
        <button
          type="button"
          data-testid="ef-refresh"
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
        <p data-testid="ef-loading" className="mt-4 text-sm text-gray-500 dark:text-gray-400">
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
        <Notice tone="warn" icon={MdWarning} testId="ef-denied">
          Your account is not allowed to see the equipment predictions. They
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
        <Notice tone="bad" icon={MdWarning} testId="ef-error">
          <p className="font-semibold">The equipment records could not be loaded.</p>
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

  if (data.state === "no_assets") {
    return (
      <Card>
        {header}
        <div className="mt-4" />
        <Notice tone="info" icon={MdBuild} testId="ef-no-assets">
          {data.message}
        </Notice>
      </Card>
    );
  }

  const counts = data.counts || {};
  const ml = data.ml || {};
  const assets = data.assets || [];
  const shown = filter === "All" ? assets : assets.filter((a) => a.risk_level === filter);
  const showChance = ml.state === "ready";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        {header}
        {state.message && (
          <div className="mt-4">
            <Notice tone="warn" icon={MdWarning} testId="ef-stale">
              Could not refresh: {state.message} The figures below are from the
              last successful load.
            </Notice>
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile testId="ef-tile-high" label="High risk" value={fmt(counts.high)} />
          <Tile testId="ef-tile-medium" label="Medium risk" value={fmt(counts.medium)} />
          <Tile testId="ef-tile-low" label="Low risk" value={fmt(counts.low)} />
          <Tile testId="ef-tile-oos" label="Out of service" value={fmt(counts.out_of_service)} />
          <Tile
            testId="ef-tile-overdue"
            label="Maintenance overdue"
            value={fmt(counts.overdue)}
            note={`of ${fmt(counts.assets)} assets`}
          />
        </div>
      </Card>

      <Card testId="ef-risk">
        <CardTitle
          title="Maintenance risk (rules, not machine learning)"
          subtitle={`Points from the records: out of service +10, overdue job +3 (+1 per week late, up to +3), job due within 7 days +1, each breakdown in the last 12 months +2 (up to +6), maintenance later than usual +2 or +3, no maintenance recorded +1. High from ${
            data.rules?.high_points ?? 6
          } points, Medium from ${data.rules?.medium_points ?? 3}.`}
        />

        <div role="group" aria-label="Risk filter" className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((name) => {
            const count = name === "All" ? assets.length : counts[name.toLowerCase()] || 0;
            const selected = filter === name;
            return (
              <button
                key={name}
                type="button"
                data-testid={`ef-filter-${name.toLowerCase()}`}
                aria-pressed={selected}
                onClick={() => setFilter(name)}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                  selected
                    ? "bg-brand-500 text-white"
                    : "bg-lightPrimary text-gray-600 hover:text-brand-500 dark:bg-navy-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                {name} ({count})
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <p data-testid="ef-empty-filter" className="text-sm text-gray-500 dark:text-gray-400">
            No equipment at this risk level.
          </p>
        ) : (
          <>
            {/* Phones: one card per asset */}
            <div className="flex flex-col gap-3 md:hidden">
              {shown.map((a) => (
                <div
                  key={a.id}
                  data-testid="ef-card"
                  className="rounded-xl border border-gray-100 p-4 dark:border-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-navy-700 dark:text-white">
                        {a.code} · {a.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {a.category} · {a.location}
                      </p>
                    </div>
                    <Level level={a.risk_level} />
                  </div>
                  <p className={`mt-2 text-sm font-semibold ${STATUS_STYLE[a.status] || ""}`}>
                    {a.status}
                    {showChance && (
                      <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                        · Chance in 30 days: <Chance value={a.chance_30d} />
                      </span>
                    )}
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
                    {a.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Wider screens: a table */}
            <div className="hidden overflow-x-auto md:block">
              <table data-testid="ef-table" className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pr-3">Asset</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3">Risk</th>
                    {showChance && <th className="pb-2 pr-3 text-right">Chance in 30 days</th>}
                    <th className="pb-2 pr-3">Last maintenance</th>
                    <th className="pb-2">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr
                      key={a.id}
                      data-testid="ef-row"
                      className="border-t border-gray-100 align-top dark:border-white/10"
                    >
                      <td className="py-3 pr-3">
                        <p className="font-bold text-navy-700 dark:text-white">{a.code}</p>
                        <p className="text-gray-600 dark:text-gray-300">{a.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {a.category} · {a.location}
                        </p>
                      </td>
                      <td className={`py-3 pr-3 font-semibold ${STATUS_STYLE[a.status] || ""}`}>
                        {a.status}
                      </td>
                      <td className="py-3 pr-3">
                        <Level level={a.risk_level} />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {fmt(a.risk_points)} points
                        </p>
                      </td>
                      {showChance && (
                        <td className="py-3 pr-3 text-right">
                          <Chance value={a.chance_30d} />
                        </td>
                      )}
                      <td className="whitespace-nowrap py-3 pr-3 text-gray-600 dark:text-gray-300">
                        {shortDate(a.last_maintenance)}
                      </td>
                      <td className="py-3 text-gray-600 dark:text-gray-300">
                        <ul className="list-disc pl-4">
                          {a.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <ModelCard ml={ml} />
    </div>
  );
};

export default EquipmentFailure;
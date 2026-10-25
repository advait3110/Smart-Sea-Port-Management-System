import React from "react";

import {
  MdCheckCircle,
  MdDirectionsBoat,
  MdInfoOutline,
  MdRefresh,
  MdSchedule,
  MdWarning,
} from "react-icons/md";

import { apiGet } from "../../../services/api";
import BerthCongestion from "./BerthCongestion";
import CargoThroughput from "./CargoThroughput";
import EquipmentFailure from "./EquipmentFailure";
import {
  Bar,
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
// DELAY PREDICTION (Intelligence & Analytics)
// =========================================================
//
// One page, four predictions as tabs: "Predict Vessel Delay" (below),
// "Predict Berth Congestion" (BerthCongestion.jsx), "Predict Cargo
// Throughput" (CargoThroughput.jsx) and "Predict Equipment Failure"
// (EquipmentFailure.jsx).
//
// Predict Vessel Delay:
//   GET /predictions/vessel-delay
//     ships about to arrive (not yet at anchor or at a berth) with the
//     ETA they reported, how much training data has been collected,
//     and the model's real test results once it has been trained.
//   GET /predictions/vessel-delay/estimate?mmsi=...
//     the "Predict delay" button: the trained ML model when it is in
//     use; before that, a calculation from the ship's live speed and
//     distance to the port, clearly labelled as not machine learning.
//
// Nothing on this page is made up. All times are Singapore time.

// Tabs that are built (the others say "not built yet").
const BUILT = ["vessel-delay", "berth-congestion", "cargo-throughput", "equipment-failure"];

const PREDICTIONS = [
  {
    key: "vessel-delay",
    title: "Predict Vessel Delay",
    description: "Predicts which ships will arrive late and by how long.",
  },
  {
    key: "berth-congestion",
    title: "Predict Berth Congestion",
    description:
      "Predicts how crowded the port will be in 6, 12 and 24 hours.",
  },
  {
    key: "cargo-throughput",
    title: "Predict Cargo Throughput",
    description:
      "Predicts how many containers the port will handle in the next 12 months.",
  },
  {
    key: "equipment-failure",
    title: "Predict Equipment Failure",
    description:
      "Predicts which equipment is likely to fail, so it can be serviced first.",
  },
];

const duration = (minutes) => {
  const total = Math.round(Math.abs(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

const delayText = (minutes) => {
  if (minutes === null || minutes === undefined) {
    return "—";
  }
  if (Math.abs(minutes) < 1) {
    return "On the ETA";
  }
  return minutes > 0
    ? `${duration(minutes)} late`
    : `${duration(minutes)} early`;
};

const RISK_TONES = {
  "Very late": "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  Late: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
  "On time":
    "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",
  Early: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
};

// =========================================================
// PREDICT VESSEL DELAY
// =========================================================

const VesselDelay = () => {
  const [state, setState] = React.useState({
    status: "loading",
    data: null,
    message: "",
  });
  const [refreshing, setRefreshing] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState(null);

  const alive = React.useRef(true);
  const busy = React.useRef(false);

  const load = React.useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setRefreshing(true);
    try {
      const data = await apiGet("/predictions/vessel-delay");
      if (alive.current) {
        setState({ status: "ready", data, message: "" });
        setUpdatedAt(Date.now());
      }
    } catch (error) {
      if (alive.current) {
        const denied = error?.status === 403 || error?.status === 401;
        const missing = error?.status === 404;
        setState((previous) => ({
          // Keep the last good figures when a refresh fails.
          status: denied ? "denied" : previous.data ? "ready" : "error",
          data: denied ? null : previous.data,
          stale: !denied && Boolean(previous.data),
          message: missing
            ? "The backend does not have the prediction service yet. Add predictions.py and the new main.py on the backend and restart it."
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

  // "Predict delay" results per ship (by MMSI).
  const [results, setResults] = React.useState({});

  const predictOne = React.useCallback(async (mmsi) => {
    setResults((previous) => ({ ...previous, [mmsi]: { status: "loading" } }));
    try {
      const data = await apiGet(
        `/predictions/vessel-delay/estimate?mmsi=${encodeURIComponent(mmsi)}`
      );
      if (alive.current) {
        setResults((previous) => ({ ...previous, [mmsi]: { status: "done", data } }));
      }
    } catch (error) {
      if (alive.current) {
        setResults((previous) => ({
          ...previous,
          [mmsi]: {
            status: "error",
            message: String(error?.message || "Could not be predicted."),
          },
        }));
      }
    }
  }, []);

  const predictAll = async () => {
    const list = (state.data?.ships || []).map((ship) => ship.mmsi);
    // A few at a time, so the backend is not flooded.
    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(list.slice(i, i + 3).map((mmsi) => predictOne(mmsi)));
      if (!alive.current) {
        return;
      }
    }
  };

  const header = (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h2 className="text-xl font-bold text-navy-700 dark:text-white">
          Predict Vessel Delay
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Which ships about to arrive at the Port of Singapore will be later
          than the ETA they reported, and by how long.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="vd-updated" className="text-xs text-gray-500 dark:text-gray-400">
          {updatedAt ? `Updated ${clockFormat.format(new Date(updatedAt))} SGT` : ""}
        </span>
        <button
          type="button"
          data-testid="vd-refresh"
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
        <p data-testid="vd-loading" className="mt-4 text-sm text-gray-500 dark:text-gray-400">
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
        <Notice tone="warn" icon={MdWarning} testId="vd-denied">
          Your account is not allowed to see the delay predictions. They need
          the Port Analytics feature.
        </Notice>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        {header}
        <div className="mt-4" />
        <Notice tone="bad" icon={MdWarning} testId="vd-error">
          <p className="font-semibold">The predictions could not be loaded.</p>
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
  const collection = data.collection || {};
  const collector = collection.collector || {};
  const model = data.model;
  const ships = Array.isArray(data.ships) ? data.ships : [];
  const found = Number(data.records_found) || 0;
  const needed = Number(data.records_needed) || 300;
  const ready = data.state === "ready";
  const lateMinutes = Number(data.late_minutes) || 30;
  const leftOut = Number(data.ships_left_out_stopped) || 0;

  const shown = ships
    .map((ship) => results[ship.mmsi])
    .filter((r) => r && r.status === "done" && r.data.available);
  const lateCount = shown.filter((r) => r.data.delay_minutes >= lateMinutes).length;
  const averageDelay = shown.length
    ? shown.reduce((total, r) => total + r.data.delay_minutes, 0) / shown.length
    : null;
  const anyLoading = ships.some((ship) => results[ship.mmsi]?.status === "loading");

  const errorRows = model
    ? [
        { label: "Ship's own ETA is right (baseline)", value: model.baseline_mae_minutes, color: "bg-gray-400" },
        ...(model.models || []).map((m) => ({
          label: m.model,
          value: m.mae_minutes,
          color: m.model === model.best_model ? "bg-brand-500" : "bg-brand-300",
        })),
      ]
    : [];
  const errorMax = Math.max(1, ...errorRows.map((r) => Number(r.value) || 0));
  const topInputs = model ? (model.feature_importance || []).slice(0, 5) : [];
  const inputMax = Math.max(0.1, ...topInputs.map((i) => Math.max(0, i.importance_minutes)));

  return (
    <div>
      <Card testId="vd-status">
        {header}

        <div className="mt-5 space-y-3">
          {state.stale && (
            <Notice tone="warn" icon={MdWarning} testId="vd-stale">
              The list could not be refreshed just now ({state.message}).
              The last loaded list is shown.
            </Notice>
          )}

          {/* ---------------- HOW "PREDICT DELAY" WORKS ---------------- */}

          {ready && model ? (
            <Notice tone="good" icon={MdCheckCircle} testId="vd-ready">
              <p className="font-bold">
                Predict delay uses the trained model ({model.best_model}): on
                average {fmt(model.best_mae_minutes, 1)} min off, against{" "}
                {fmt(model.baseline_mae_minutes, 1)} min when trusting the
                ships' own ETAs ({fmt(model.improvement_percent, 1)}% better).
              </p>
              <p className="mt-1">
                Tested on the newest {fmt(model.test_arrivals)} arrivals it had
                not seen; trained on {fmt(found)} arrivals. Last trained{" "}
                {sgt(model.trained_at)} SGT.
              </p>
            </Notice>
          ) : (
            <Notice tone="info" icon={MdInfoOutline} testId="vd-estimate-mode">
              <p className="font-bold">
                Predict delay works now from live ship data: the ship's
                current speed and its distance to the port give the time it
                still needs, which is compared with the ETA it reported.
              </p>
              <p className="mt-1">
                This is a calculation, not the machine-learning model. The
                model takes over automatically once it is trained.
              </p>
            </Notice>
          )}

          {data.state === "not_trained" && (
            <Notice tone="info" icon={MdInfoOutline} testId="vd-not-trained">
              <p className="font-bold">
                Model not trained yet: {fmt(found)} record{found === 1 ? "" : "s"} found,{" "}
                {fmt(needed)} needed.
              </p>
              <p className="mt-1">
                A record is a ship that reported an ETA and was later seen
                arriving. They are collected automatically while the backend is
                running.
              </p>
              <div className="mt-3 h-2.5 w-full rounded-full bg-white dark:bg-navy-900">
                <div
                  data-testid="vd-progress"
                  className="h-2.5 rounded-full bg-brand-500"
                  style={{ width: `${Math.min(100, (found / needed) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs">
                {fmt(Math.min(100, (found / needed) * 100))}% of the data needed
                {found >= needed
                  ? ". Enough data: run the training script on the backend."
                  : ""}
              </p>
            </Notice>
          )}

          {data.state === "not_better_than_eta" && model && (
            <Notice tone="warn" icon={MdWarning} testId="vd-not-better">
              <p className="font-bold">
                The model was trained, but it is not clearly more accurate
                than the ships' own ETAs, so it is not used yet.
              </p>
              <p className="mt-1">
                Average error on the newest {fmt(model.test_arrivals)} arrivals:
                best model {fmt(model.best_mae_minutes, 1)} min, ships' own ETA{" "}
                {fmt(model.baseline_mae_minutes, 1)} min (
                {fmt(model.improvement_percent, 1)}% better; at least{" "}
                {fmt(model.required_improvement_percent ?? 5)}% is required).
              </p>
            </Notice>
          )}

          {data.model_error && (
            <Notice tone="bad" icon={MdWarning} testId="vd-model-error">
              {data.model_error}
            </Notice>
          )}
        </div>
      </Card>

      {/* ---------------- SHIPS ABOUT TO ARRIVE ---------------- */}

      <Card testId="vd-ships" className="mt-5">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Ships about to arrive
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Ships heading to Singapore with the newest ETA they reported in
              the last 24 hours. Press Predict delay to see when each one will
              really arrive.
            </p>
          </div>
          {ships.length > 0 && (
            <button
              type="button"
              data-testid="vd-predict-all"
              disabled={anyLoading}
              onClick={() => predictAll()}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              <MdSchedule className="h-5 w-5" />
              {anyLoading ? "Predicting..." : "Predict delay for all"}
            </button>
          )}
        </div>

        {shown.length > 0 && (
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="vd-summary">
            <Tile
              testId="vd-tile-predicted"
              label="Ships predicted"
              value={`${fmt(shown.length)} of ${fmt(ships.length)}`}
              note="Press Predict delay for more"
            />
            <Tile
              testId="vd-tile-late"
              label="Expected to be late"
              value={fmt(lateCount)}
              note={`${fmt(lateMinutes)} minutes or more after their ETA`}
            />
            <Tile
              testId="vd-tile-average"
              label="Average delay"
              value={averageDelay === null ? "—" : delayText(averageDelay)}
              note={`Over the ${fmt(shown.length)} ship${shown.length === 1 ? "" : "s"} predicted`}
            />
          </div>
        )}

        {ships.length === 0 ? (
          <p data-testid="vd-no-ships" className="rounded-xl bg-lightPrimary p-4 text-sm text-gray-500 dark:bg-navy-900 dark:text-gray-300">
            No ship is about to arrive with an ETA for Singapore reported in
            the last 24 hours.
          </p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table data-testid="vd-table" className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                  <th className="px-2 py-3">Ship</th>
                  <th className="px-2 py-3">Reported ETA</th>
                  <th className="px-2 py-3">Expected arrival</th>
                  <th className="px-2 py-3">Delay</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">How it was worked out</th>
                </tr>
              </thead>
              <tbody>
                {ships.map((ship) => {
                  const result = results[ship.mmsi];
                  const done = result && result.status === "done";
                  const r = done ? result.data : null;
                  return (
                    <tr
                      key={ship.mmsi}
                      data-testid="vd-row"
                      className="border-b border-gray-50 align-top last:border-0 dark:border-white/5"
                    >
                      <td className="px-2 py-3">
                        <p className="flex items-center gap-2 font-semibold text-navy-700 dark:text-white">
                          <MdDirectionsBoat className="h-4 w-4 shrink-0 text-brand-500" />
                          {ship.vessel_name || `MMSI ${ship.mmsi}`}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          MMSI {ship.mmsi}
                          {ship.distance_nm !== null ? ` · ${fmt(ship.distance_nm, 1)} nm away` : ""}
                          {ship.speed_knots !== null ? ` · ${fmt(ship.speed_knots, 1)} kn` : ""}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {ship.live_position_at
                            ? `Live position ${sgt(ship.live_position_at)}`
                            : "No live position in the last 30 min"}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-navy-700 dark:text-white">
                        {sgt(ship.reported_eta)}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          reported {sgt(ship.reported_at)}
                        </p>
                      </td>
                      <td className="px-2 py-3" colSpan={!done ? 4 : 1}>
                        {!result && (
                          <button
                            type="button"
                            data-testid="vd-predict"
                            onClick={() => predictOne(ship.mmsi)}
                            className="flex items-center gap-2 rounded-xl bg-lightPrimary px-3 py-2 text-sm font-bold text-brand-500 transition hover:bg-brand-50 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                          >
                            <MdSchedule className="h-4 w-4" />
                            Predict delay
                          </button>
                        )}
                        {result && result.status === "loading" && (
                          <span data-testid="vd-predicting" className="text-sm text-gray-500 dark:text-gray-400">
                            Predicting...
                          </span>
                        )}
                        {result && result.status === "error" && (
                          <div data-testid="vd-predict-error" className="text-sm text-red-600 dark:text-red-300">
                            {result.message}{" "}
                            <button
                              type="button"
                              onClick={() => predictOne(ship.mmsi)}
                              className="font-bold underline"
                            >
                              Try again
                            </button>
                          </div>
                        )}
                        {done && !r.available && (
                          <div data-testid="vd-no-estimate" className="text-sm text-gray-600 dark:text-gray-300">
                            <p className="font-semibold">Cannot be worked out right now.</p>
                            <p className="mt-0.5">{r.reason}</p>
                            <button
                              type="button"
                              onClick={() => predictOne(ship.mmsi)}
                              className="mt-1 text-sm font-bold text-brand-500 underline dark:text-brand-400"
                            >
                              Try again
                            </button>
                          </div>
                        )}
                        {done && r.available && (
                          <span data-testid="vd-expected" className="font-semibold text-navy-700 dark:text-white">
                            {sgt(r.expected_arrival)}
                          </span>
                        )}
                      </td>
                      {done && r.available && (
                        <>
                          <td data-testid="vd-delay" className="px-2 py-3 font-semibold text-navy-700 dark:text-white">
                            {delayText(r.delay_minutes)}
                          </td>
                          <td className="px-2 py-3">
                            <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${RISK_TONES[r.risk] || RISK_TONES["On time"]}`}>
                              {r.risk}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-xs text-gray-600 dark:text-gray-300">
                            <p className="font-semibold text-navy-700 dark:text-white">
                              {r.is_ml ? `ML model: ${r.method}` : "Estimate from live speed and distance"}
                            </p>
                            <p className="mt-0.5">
                              {r.is_ml ? `Main factor: ${r.reason}` : r.reason}
                            </p>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Times are Singapore time (SGT).{" "}
          {leftOut > 0
            ? `${fmt(leftOut)} ship${leftOut === 1 ? " is" : "s are"} already at anchor or at a berth and not listed. `
            : ""}
          Ships that have arrived are left out. Estimates use the straight-line
          distance to the port, so the real route can take a little longer.
        </p>
      </Card>

      {/* ---------------- DATA COLLECTION ---------------- */}

      <Card testId="vd-collection" className="mt-5">
        <CardTitle
          title="Training data for the machine-learning model"
          subtitle="Real ETA reports and arrivals from the live AIS feed for the Port of Singapore area."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            testId="vd-tile-eta"
            label="ETA reports saved"
            value={fmt(collection.eta_reports)}
            note={`${fmt(collection.eta_reports_24h)} in the last 24 h${
              collection.first_eta_report ? ` · since ${sgt(collection.first_eta_report)}` : ""
            }`}
          />
          <Tile
            testId="vd-tile-arrivals"
            label="Arrivals recorded"
            value={fmt(collection.arrivals)}
            note={`${fmt(collection.arrivals_24h)} in the last 24 h`}
          />
          <Tile
            testId="vd-tile-records"
            label="Usable records"
            value={`${fmt(found)} / ${fmt(needed)}`}
            note="Arrivals with an ETA reported before them"
          />
          <Tile
            testId="vd-tile-feed"
            label="Live AIS feed"
            value={collector.connected ? "Connected" : "Not connected"}
            note={
              collector.connected
                ? collector.last_message_at
                  ? `Last message ${sgt(collector.last_message_at)} SGT`
                  : "Receiving"
                : collector.last_error || "Data is only collected while the backend runs."
            }
          />
        </div>
      </Card>

      {/* ---------------- MODEL DETAILS (after training) ---------------- */}

      {model && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card testId="vd-errors">
            <CardTitle
              title="How accurate is the model?"
              subtitle={`Average error in minutes on the newest ${fmt(model.test_arrivals)} arrivals, which the model did not see while learning. Lower is better.`}
            />
            <div className="space-y-3">
              {errorRows.map((row) => (
                <Bar
                  key={row.label}
                  testId="vd-error-bar"
                  label={row.label}
                  value={row.value}
                  max={errorMax}
                  text={`${fmt(row.value, 1)} min`}
                  color={row.color}
                />
              ))}
            </div>
            {!model.xgboost_available && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                XGBoost was not installed when the model was trained, so only
                scikit-learn was compared.
              </p>
            )}
          </Card>

          <Card testId="vd-inputs">
            <CardTitle
              title="What matters most"
              subtitle="How many minutes the average error grows when each input is mixed up between ships. Bigger means the model relies on it more."
            />
            <div className="space-y-3">
              {topInputs.map((input) => (
                <Bar
                  key={input.feature}
                  testId="vd-input-bar"
                  label={input.name}
                  value={Math.max(0, input.importance_minutes)}
                  max={inputMax}
                  text={`${fmt(input.importance_minutes, 1)} min`}
                  color="bg-brand-400"
                />
              ))}
            </div>
            {Array.isArray(model.features_skipped_no_data) &&
              model.features_skipped_no_data.length > 0 && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Not used yet (no data collected for them):{" "}
                  {model.features_skipped_no_data.join(", ")}.
                </p>
              )}
          </Card>
        </div>
      )}

      <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
        Weather and berth availability are not used yet: past weather and
        berth records are not stored, so the model cannot learn from them.
      </p>
    </div>
  );
};

// =========================================================
// THE PAGE (four tabs)
// =========================================================

const DelayPrediction = () => {
  const [activeKey, setActiveKey] = React.useState(PREDICTIONS[0].key);
  // Tabs opened at least once (they then stay loaded).
  const [opened, setOpened] = React.useState({ [PREDICTIONS[0].key]: true });

  const open = (key) => {
    setActiveKey(key);
    setOpened((previous) => (previous[key] ? previous : { ...previous, [key]: true }));
  };
  const active = PREDICTIONS.find((item) => item.key === activeKey) || PREDICTIONS[0];

  return (
    <div className="w-full">
      <div className="mb-6 mt-3 flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-700">
          <MdSchedule className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-navy-700 dark:text-white">
            Delay Prediction
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Machine-learning predictions for the Port of Singapore, learned
            from the port's own collected records.
          </p>
        </div>
      </div>

      <div className="rounded-[20px] bg-white p-5 shadow-sm dark:bg-navy-800 sm:p-6">
        <div role="group" aria-label="Predictions" className="flex flex-wrap gap-2">
          {PREDICTIONS.map((item) => {
            const selected = item.key === active.key;
            return (
              <button
                key={item.key}
                type="button"
                data-testid={`tab-${item.key}`}
                aria-pressed={selected}
                onClick={() => open(item.key)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  selected
                    ? "bg-brand-500 text-white"
                    : "bg-lightPrimary text-gray-600 hover:text-brand-500 dark:bg-navy-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {/* Built tabs stay loaded while another tab is open (only
            hidden), so coming back shows the same data and results
            without loading again. A tab loads the first time it opens. */}
        <div hidden={active.key !== "vessel-delay"} data-testid="panel-vessel-delay">
          <VesselDelay />
        </div>
        {opened["berth-congestion"] && (
          <div hidden={active.key !== "berth-congestion"} data-testid="panel-berth-congestion">
            <BerthCongestion />
          </div>
        )}
        {opened["cargo-throughput"] && (
          <div hidden={active.key !== "cargo-throughput"} data-testid="panel-cargo-throughput">
            <CargoThroughput />
          </div>
        )}
        {opened["equipment-failure"] && (
          <div hidden={active.key !== "equipment-failure"} data-testid="panel-equipment-failure">
            <EquipmentFailure />
          </div>
        )}
        {!BUILT.includes(active.key) && (
          <Card testId={`panel-${active.key}`}>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              {active.title}
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {active.description}
            </p>
            <p className="mt-5 rounded-xl bg-lightPrimary p-4 text-sm text-gray-500 dark:bg-navy-900 dark:text-gray-300">
              This prediction has not been built yet. No figures are shown
              until it is.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DelayPrediction;
"""
Predict Vessel Delay: training data, training and predictions.

What the model learns
---------------------
For every ETA that a ship heading to the Port of Singapore reported
(vessel_eta_snapshots), we look up the first time that ship actually
arrived afterwards (port_call_events, "Arrival", within 72 hours):

    delay (minutes) = actual arrival time - reported ETA

A positive delay means the ship arrived late, a negative one early.

Only what was known at the moment the ETA was reported is used as input
(nothing from the future), so the model can be used the same way for
ships that have not arrived yet:

    hours_to_eta            hours between the report and the ETA
    distance_nm             distance to the port (nautical miles)
    speed_knots             the ship's speed at that moment
    behind_schedule_h       hours it needs at that speed, minus hours left
    stopped_at_report       1 when at anchor / moored at that moment
    draught_m               how deep the ship lies in the water
    ships_stopped_nearby    seagoing ships standing still in port waters
    arrivals_last_24h       arrivals recorded in the 24 hours before
    eta_hour, eta_weekday   Singapore hour and day of the ETA
    report_hour             Singapore hour of the report

Honest checks
-------------
* The newest 20 % of arrivals are kept apart as a test set (split by
  time, the way the model will really be used).
* The model is compared with the ship's own ETA (delay = 0). It is only
  used for predictions when it is clearly more accurate than that (at
  least MIN_IMPROVEMENT_PERCENT better), so a lucky result on a small
  test set does not count.
* Fewer than MIN_RECORDS arrivals: no model is trained at all.

Needs pandas, numpy, scikit-learn and joblib; XGBoost is used too when
installed (pip install pandas numpy scikit-learn xgboost joblib).
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

# =========================================================
# SETTINGS
# =========================================================

MIN_RECORDS = 300           # arrivals needed before a model is trained
LOOKBACK_HOURS = 72         # an ETA counts for an arrival up to 72 h later
MAX_ABS_DELAY_HOURS = 48    # larger "delays" are stale ETAs, not delays
TEST_SHARE = 0.20           # newest 20 % of arrivals = test set
MIN_TEST_ARRIVALS = 20
MIN_IMPROVEMENT_PERCENT = 5.0  # must beat the ships' own ETAs by 5 %+

LATE_MINUTES = 30           # predicted 30+ minutes late = "late"
VERY_LATE_MINUTES = 120

# Reference point for "distance to port": the Singapore Strait off the
# city terminals (Tanjong Pagar / Keppel / Pasir Panjang).
PORT_LAT = 1.2650
PORT_LON = 103.8200

SGT = timezone(timedelta(hours=8))

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_ROOT / "ml_models"
MODEL_FILE = MODEL_DIR / "vessel_delay.joblib"
METRICS_FILE = MODEL_DIR / "vessel_delay_metrics.json"

FEATURES = [
    "hours_to_eta",
    "distance_nm",
    "speed_knots",
    "behind_schedule_h",
    "stopped_at_report",
    "draught_m",
    "ships_stopped_nearby",
    "arrivals_last_24h",
    "eta_hour",
    "eta_weekday",
    "report_hour",
]

FEATURE_NAMES = {
    "hours_to_eta": "Hours left until the reported ETA",
    "distance_nm": "Distance to the port",
    "speed_knots": "Ship speed",
    "behind_schedule_h": "Time needed at current speed vs. time left",
    "stopped_at_report": "Ship stopped when it reported",
    "draught_m": "Draught (how deep the ship lies)",
    "ships_stopped_nearby": "Ships standing still in port waters",
    "arrivals_last_24h": "Arrivals in the previous 24 hours",
    "eta_hour": "Hour of the ETA (Singapore time)",
    "eta_weekday": "Day of the week of the ETA",
    "report_hour": "Hour of the report (Singapore time)",
}

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday", "Sunday"]


class MLPackagesMissing(RuntimeError):
    """pandas / numpy / scikit-learn / joblib are not installed."""


def _ml():
    """Import the ML packages only when needed, with a clear message."""

    try:
        import joblib
        import numpy as np
        import pandas as pd
        from sklearn.ensemble import HistGradientBoostingRegressor
    except ImportError as exc:
        raise MLPackagesMissing(
            "The machine-learning packages are not installed on the "
            "backend. Run: pip install pandas numpy scikit-learn xgboost "
            f"joblib ({exc.name} is missing)."
        ) from None

    return joblib, np, pd, HistGradientBoostingRegressor


# =========================================================
# DATA FROM THE DATABASE
# =========================================================

# Columns read for every ETA report (training and predictions).
_SNAPSHOT_COLUMNS = """
    s.id AS snapshot_id, s.mmsi, s.vessel_name, s.destination,
    s.eta, s.reported_at, s.draught_m, s.speed_knots, s.latitude,
    s.longitude, s.navigation_status, s.ships_stopped_nearby,
    (SELECT count(*) FROM port_call_events r
      WHERE r.event_type = 'Arrival'
        AND r.occurred_at <  s.reported_at
        AND r.occurred_at >= s.reported_at - interval '24 hours'
    ) AS arrivals_last_24h
"""

# The ship had not arrived yet when it reported (no arrival in the
# 24 hours before the report). This leaves out ETAs sent by ships that
# are already in port (for example moving from anchorage to a berth).
_NOT_ALREADY_IN = """
    NOT EXISTS (
        SELECT 1 FROM port_call_events p
         WHERE p.mmsi = s.mmsi
           AND p.event_type = 'Arrival'
           AND p.occurred_at <= s.reported_at
           AND p.occurred_at >  s.reported_at - interval '24 hours'
    )
"""

_SINGAPORE_ARRIVAL = (
    "a.event_type = 'Arrival' "
    "AND upper(coalesce(a.port_unlocode, 'SGSIN')) = 'SGSIN'"
)

TRAINING_SQL = f"""
SELECT {_SNAPSHOT_COLUMNS},
       a.id AS arrival_id,
       a.occurred_at AS arrived_at
  FROM vessel_eta_snapshots s
  JOIN LATERAL (
        SELECT a.id, a.occurred_at
          FROM port_call_events a
         WHERE a.mmsi = s.mmsi
           AND {_SINGAPORE_ARRIVAL}
           AND a.occurred_at >  s.reported_at
           AND a.occurred_at <= s.reported_at + interval '{LOOKBACK_HOURS} hours'
         ORDER BY a.occurred_at
         LIMIT 1
       ) a ON TRUE
 WHERE s.eta IS NOT NULL
   AND abs(extract(epoch FROM (a.occurred_at - s.eta))) <= {MAX_ABS_DELAY_HOURS * 3600}
   AND {_NOT_ALREADY_IN}
"""

# Ships heading to Singapore right now: the newest ETA report of each
# ship from the last 24 hours, ETA between 6 hours ago and 48 hours
# ahead, that has not arrived since.
CURRENT_SQL = f"""
SELECT * FROM (
    SELECT DISTINCT ON (s.mmsi) {_SNAPSHOT_COLUMNS}
      FROM vessel_eta_snapshots s
     WHERE s.reported_at >= now() - interval '24 hours'
       AND s.eta IS NOT NULL
     ORDER BY s.mmsi, s.reported_at DESC
) s
 WHERE s.eta BETWEEN now() - interval '6 hours' AND now() + interval '48 hours'
   AND NOT EXISTS (
        SELECT 1 FROM port_call_events a
         WHERE a.mmsi = s.mmsi
           AND {_SINGAPORE_ARRIVAL}
           AND a.occurred_at > s.reported_at
   )
 ORDER BY s.eta
"""

COUNTS_SQL = f"""
SELECT
    (SELECT count(*) FROM vessel_eta_snapshots) AS eta_reports,
    (SELECT count(*) FROM vessel_eta_snapshots
      WHERE reported_at >= now() - interval '24 hours') AS eta_reports_24h,
    (SELECT count(*) FROM port_call_events a WHERE {_SINGAPORE_ARRIVAL}) AS arrivals,
    (SELECT count(*) FROM port_call_events a WHERE {_SINGAPORE_ARRIVAL}
        AND a.occurred_at >= now() - interval '24 hours') AS arrivals_24h,
    (SELECT min(reported_at) FROM vessel_eta_snapshots) AS first_eta_report,
    (SELECT count(DISTINCT arrival_id) FROM ({TRAINING_SQL}) t) AS usable_arrivals
"""


def _rows(connection, sql: str) -> list[dict[str, Any]]:
    result = connection.execute(text(sql))
    keys = list(result.keys())
    return [dict(zip(keys, row)) for row in result.fetchall()]


def load_training_rows(connection) -> list[dict[str, Any]]:
    return _rows(connection, TRAINING_SQL)


def load_current_rows(connection) -> list[dict[str, Any]]:
    return _rows(connection, CURRENT_SQL)


def load_counts(connection) -> dict[str, Any]:
    rows = _rows(connection, COUNTS_SQL)
    return rows[0] if rows else {}


# =========================================================
# FEATURES
# =========================================================


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def distance_nm(lat: float | None, lon: float | None) -> float | None:
    """Great-circle distance to the port reference point (nautical miles)."""

    if lat is None or lon is None:
        return None
    r_nm = 3440.065
    p1, p2 = math.radians(lat), math.radians(PORT_LAT)
    dp = p2 - p1
    dl = math.radians(PORT_LON - lon)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r_nm * math.asin(math.sqrt(a))


def features_of(row: dict[str, Any]) -> dict[str, float | None]:
    """The model inputs for one ETA report (only facts known at that time)."""

    eta = _utc(row["eta"])
    reported = _utc(row["reported_at"])

    hours_to_eta = (eta - reported).total_seconds() / 3600
    distance = distance_nm(row.get("latitude"), row.get("longitude"))
    speed = row.get("speed_knots")

    behind = None
    if distance is not None and speed is not None and speed >= 0.5:
        behind = distance / speed - hours_to_eta

    status = (row.get("navigation_status") or "").lower()
    stopped = None
    if status:
        stopped = 1.0 if ("anchor" in status or "moored" in status) else 0.0

    eta_sgt = eta.astimezone(SGT)

    return {
        "hours_to_eta": hours_to_eta,
        "distance_nm": distance,
        "speed_knots": speed,
        "behind_schedule_h": behind,
        "stopped_at_report": stopped,
        "draught_m": row.get("draught_m"),
        "ships_stopped_nearby": row.get("ships_stopped_nearby"),
        "arrivals_last_24h": row.get("arrivals_last_24h"),
        "eta_hour": eta_sgt.hour,
        "eta_weekday": eta_sgt.weekday(),
        "report_hour": reported.astimezone(SGT).hour,
    }


def feature_frame(pd, rows: list[dict[str, Any]]):
    frame = pd.DataFrame([features_of(row) for row in rows], columns=FEATURES)
    return frame.astype("float64")


# =========================================================
# TRAINING
# =========================================================


def _xgboost_model():
    try:
        from xgboost import XGBRegressor
    except ImportError:
        return None
    return XGBRegressor(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="reg:absoluteerror",
        random_state=0,
    )


def shuffle_importance(np, model, X_test, y_test, repeats: int = 5) -> dict[str, float]:
    """
    How much each input matters: mix up that one column of the test set
    (so it no longer belongs to its ship) and see how many minutes the
    average error grows. Works the same for every kind of model.
    """

    rng = np.random.default_rng(0)
    truth = y_test.to_numpy()
    base = float(np.mean(np.abs(model.predict(X_test) - truth)))

    result = {}
    for feature in X_test.columns:
        growth = []
        for _ in range(repeats):
            shuffled = X_test.copy()
            shuffled[feature] = rng.permutation(shuffled[feature].to_numpy())
            error = float(np.mean(np.abs(model.predict(shuffled) - truth)))
            growth.append(error - base)
        result[feature] = float(np.mean(growth))
    return result


def train(rows: list[dict[str, Any]], min_records: int = MIN_RECORDS) -> dict[str, Any]:
    """
    Train and compare the models. Returns a report (dict). When the best
    model beats the ships' own ETAs, report["bundle"] holds what to save.
    """

    joblib, np, pd, HGB = _ml()

    arrivals = sorted(
        {(row["arrival_id"], _utc(row["arrived_at"])) for row in rows},
        key=lambda item: item[1],
    )
    report: dict[str, Any] = {
        "records_found": len(arrivals),
        "records_needed": min_records,
        "eta_reports_used": len(rows),
    }

    if len(arrivals) < min_records:
        report["status"] = "not_enough_data"
        return report

    test_count = max(MIN_TEST_ARRIVALS, int(round(len(arrivals) * TEST_SHARE)))
    test_ids = {arrival_id for arrival_id, _ in arrivals[-test_count:]}
    split_time = arrivals[-test_count][1]

    X = feature_frame(pd, rows)

    # Inputs with no value at all in the training arrivals (for example
    # speed and position on the oldest ETA rows) cannot be learned from:
    # leave them out and remember which inputs the model uses.
    is_test_list = [r["arrival_id"] in test_ids for r in rows]
    train_part = X[[not t for t in is_test_list]]
    used = [f for f in FEATURES if train_part[f].notna().any()]
    skipped = [f for f in FEATURES if f not in used]
    X = X[used]

    y = pd.Series(
        [(_utc(r["arrived_at"]) - _utc(r["eta"])).total_seconds() / 60 for r in rows],
        dtype="float64",
    )
    is_test = pd.Series(is_test_list)

    X_train, y_train = X[~is_test], y[~is_test]
    X_test, y_test = X[is_test], y[is_test]

    def mae(pred) -> float:
        return float(np.mean(np.abs(np.asarray(pred) - y_test.to_numpy())))

    baseline_mae = mae(np.zeros(len(y_test)))
    mean_mae = mae(np.full(len(y_test), float(y_train.mean())))

    candidates = {
        "Gradient Boosting (scikit-learn)": HGB(
            loss="absolute_error",
            max_iter=300,
            learning_rate=0.05,
            random_state=0,
        ),
    }
    xgb = _xgboost_model()
    if xgb is not None:
        candidates["XGBoost"] = xgb

    results = []
    fitted = {}
    for name, model in candidates.items():
        model.fit(X_train, y_train)
        fitted[name] = model
        results.append({"model": name, "mae_minutes": round(mae(model.predict(X_test)), 1)})

    best = min(results, key=lambda item: item["mae_minutes"])
    best_model = fitted[best["model"]]

    improvement = (
        (baseline_mae - best["mae_minutes"]) / baseline_mae * 100
        if baseline_mae > 0 else 0.0
    )
    beats_eta = improvement >= MIN_IMPROVEMENT_PERCENT

    importances = sorted(
        (
            {"feature": f, "name": FEATURE_NAMES[f],
             "importance_minutes": round(v, 1)}
            for f, v in shuffle_importance(np, best_model, X_test, y_test).items()
        ),
        key=lambda item: -item["importance_minutes"],
    )

    train_arrivals = len(arrivals) - test_count
    report.update({
        "status": "trained" if beats_eta else "not_better_than_eta",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "train_arrivals": train_arrivals,
        "test_arrivals": test_count,
        "test_from": split_time.isoformat(timespec="seconds"),
        "baseline_mae_minutes": round(baseline_mae, 1),
        "mean_delay_mae_minutes": round(mean_mae, 1),
        "models": results,
        "best_model": best["model"],
        "best_mae_minutes": best["mae_minutes"],
        "improvement_percent": round(improvement, 1),
        "required_improvement_percent": MIN_IMPROVEMENT_PERCENT,
        "average_delay_minutes": round(float(y.mean()), 1),
        "late_share_percent": round(float((y >= LATE_MINUTES).mean() * 100), 1),
        "feature_importance": importances,
        "xgboost_available": xgb is not None,
        "features_used": used,
        "features_skipped_no_data": [FEATURE_NAMES[f] for f in skipped],
    })

    if beats_eta:
        # Final model: the same settings, trained on all arrivals.
        final = candidates[best["model"]]
        final = final.__class__(**final.get_params())
        final.fit(X, y)
        report["bundle"] = {
            "model": final,
            "model_name": best["model"],
            "features": used,
            "medians": {f: (None if math.isnan(v) else float(v))
                        for f, v in X.median().items()},
            "spreads": {f: (None if math.isnan(v) else float(v))
                        for f, v in X.std().items()},
            "importance_order": [item["feature"] for item in importances],
        }

    return report


def save(report: dict[str, Any]) -> None:
    """Save the metrics, and the model when it beat the ships' own ETAs."""

    joblib = _ml()[0]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    bundle = report.pop("bundle", None)
    if bundle is not None:
        joblib.dump(bundle, MODEL_FILE)
    elif MODEL_FILE.exists():
        # A newer check found the model no better than the ETAs: stop using it.
        MODEL_FILE.unlink()

    METRICS_FILE.write_text(json.dumps(report, indent=2), encoding="utf-8")


# =========================================================
# PREDICTIONS
# =========================================================

_cache: dict[str, Any] = {"mtime": None, "bundle": None}


def load_model():
    """The saved model, or None. Reloaded when the file changes."""

    if not MODEL_FILE.exists():
        _cache.update(mtime=None, bundle=None)
        return None

    mtime = MODEL_FILE.stat().st_mtime
    if _cache["mtime"] != mtime:
        joblib = _ml()[0]
        _cache.update(mtime=mtime, bundle=joblib.load(MODEL_FILE))
    return _cache["bundle"]


def load_metrics() -> dict[str, Any] | None:
    try:
        return json.loads(METRICS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _reason(bundle: dict[str, Any], values: dict[str, Any]) -> str:
    """
    A short, plain reason for one prediction: the most important input
    (as measured on the test set) whose value is unusual for this ship.
    """

    medians = bundle.get("medians", {})
    spreads = bundle.get("spreads", {})

    chosen = None
    for feature in bundle.get("importance_order", []):
        value = values.get(feature)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        median, spread = medians.get(feature), spreads.get(feature)
        if median is None or not spread:
            continue
        if abs(value - median) / spread >= 1.0:
            chosen = feature
            break
        if chosen is None:
            chosen = feature

    if chosen is None:
        return "Overall pattern of past arrivals"

    v = values[chosen]
    texts = {
        "behind_schedule_h": (
            f"When it reported, it needed about {abs(v):.1f} h "
            f"{'more' if v > 0 else 'less'} than its ETA allowed at that speed"
        ),
        "distance_nm": f"{v:.1f} nautical miles from the port",
        "speed_knots": f"Moving at {v:.1f} knots",
        "hours_to_eta": f"ETA is {v:.1f} h after the report",
        "stopped_at_report": (
            "Was stopped (anchored or moored) when it reported"
            if v >= 0.5 else "Was under way when it reported"
        ),
        "draught_m": f"Draught {v:.1f} m",
        "ships_stopped_nearby": f"{int(v)} ships standing still in port waters",
        "arrivals_last_24h": f"{int(v)} arrivals in the 24 h before",
        "eta_hour": f"ETA at {int(v):02d}:00 Singapore time",
        "eta_weekday": f"ETA on a {WEEKDAYS[int(v) % 7]}",
        "report_hour": f"Reported at {int(v):02d}:00 Singapore time",
    }
    return texts.get(chosen, FEATURE_NAMES.get(chosen, chosen))


def risk_of(delay_minutes: float) -> str:
    if delay_minutes >= VERY_LATE_MINUTES:
        return "Very late"
    if delay_minutes >= LATE_MINUTES:
        return "Late"
    if delay_minutes <= -LATE_MINUTES:
        return "Early"
    return "On time"


def predict(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Predicted delay for each current ETA report (needs a saved model)."""

    bundle = load_model()
    if bundle is None or not rows:
        return []

    _, np, pd, _ = _ml()
    X = feature_frame(pd, rows)[bundle["features"]]
    delays = bundle["model"].predict(X)

    out = []
    for row, delay, (_, values) in zip(rows, delays, X.iterrows()):
        delay = float(delay)
        eta = _utc(row["eta"])
        out.append({
            "snapshot_id": row["snapshot_id"],
            "predicted_delay_minutes": round(delay),
            "predicted_arrival": (eta + timedelta(minutes=delay)).isoformat(timespec="seconds"),
            "risk": risk_of(delay),
            "main_reason": _reason(bundle, values.to_dict()),
        })
    return out
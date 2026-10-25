"""
Predict Berth Congestion (port crowding) - the machine-learning part.

What is predicted
    How many seagoing ships will be standing still in Singapore port
    waters (at anchorage or at a berth) 6, 12 and 24 hours from now.

Training data
    port_congestion_snapshots: one row per hour while the backend runs,
    counted from the live AISStream feed. A usable record for a time
    ahead (6, 12 or 24 h) is a snapshot that has another snapshot exactly
    that many hours later: the later count is "what really happened".

How it is checked (honestly)
    * The newest 20 % of records are kept apart as the test set (split
      by time, like real use: learn from the past, predict the future).
    * Three simple guesses to beat: "same as now" (the count does not
      change), the trend of the last 6 hours (arrivals - departures), and
      the usual number (the average of the training records).
    * A model is used for a time ahead ONLY when it is at least 5 %
      more accurate than the BEST of these simple guesses. Otherwise that
      time ahead keeps the trend estimate, labelled as not machine learning.

Congestion level
    Low / Normal / High / Very high compared with the port's own collected
    history (below the 25th percentile / up to the 75th / from the 75th /
    from the 90th). Shown only once 48 hourly snapshots exist.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

# =========================================================
# SETTINGS
# =========================================================

HORIZONS = (6, 12, 24)        # hours ahead
MIN_RECORDS = 300             # records needed per time ahead
TEST_SHARE = 0.20             # newest 20 % = test set
MIN_TEST_RECORDS = 24
MIN_IMPROVEMENT_PERCENT = 5.0  # must beat the best simple guess by 5 %+
MIN_LEVEL_SNAPSHOTS = 48       # snapshots needed before levels are shown
TREND_WINDOW_HOURS = 6
MIN_TREND_HOURS = 1.0

SGT = timezone(timedelta(hours=8))

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_ROOT / "ml_models"
MODEL_FILE = MODEL_DIR / "berth_congestion.joblib"
METRICS_FILE = MODEL_DIR / "berth_congestion_metrics.json"

FEATURES = [
    "ships_in_port",
    "at_anchor",
    "at_berth",
    "stopped_other",
    "underway",
    "arrivals_6h",
    "departures_6h",
    "due_6h",
    "due_12h",
    "due_24h",
    "change_6h",
    "hour",
    "weekday",
]

FEATURE_NAMES = {
    "ships_in_port": "Ships in port now",
    "at_anchor": "Ships at anchorage now",
    "at_berth": "Ships at a berth now",
    "stopped_other": "Ships stopped (no anchor/berth status)",
    "underway": "Ships underway in the area",
    "arrivals_6h": "Arrivals in the last 6 h",
    "departures_6h": "Departures in the last 6 h",
    "due_6h": "Ships due by ETA in 6 h",
    "due_12h": "Ships due by ETA in 12 h",
    "due_24h": "Ships due by ETA in 24 h",
    "change_6h": "Change in the last 6 h",
    "hour": "Hour of day (Singapore)",
    "weekday": "Day of the week",
}


class MLPackagesMissing(RuntimeError):
    """pandas / numpy / scikit-learn / joblib are not installed."""


def _ml():
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


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# =========================================================
# DATA FROM THE DATABASE
# =========================================================

SNAPSHOTS_SQL = """
SELECT taken_at, ships_in_port, at_anchor, at_berth, stopped_other,
       underway, arrivals_6h, departures_6h, due_6h, due_12h, due_24h,
       feed_hours
  FROM port_congestion_snapshots
 ORDER BY taken_at
"""

COUNTS_SQL = """
SELECT
    count(*) AS snapshots,
    count(*) FILTER (WHERE taken_at >= now() - interval '24 hours') AS snapshots_24h,
    min(taken_at) AS first_snapshot,
    max(taken_at) AS last_snapshot,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY ships_in_port) AS p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY ships_in_port) AS p75,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY ships_in_port) AS p90,
    """ + ",\n    ".join(
    f"""(SELECT count(*) FROM port_congestion_snapshots a
          JOIN port_congestion_snapshots b
            ON b.taken_at = a.taken_at + interval '{h} hours') AS pairs_{h}h"""
    for h in HORIZONS
) + """
  FROM port_congestion_snapshots
"""

RECENT_SQL = """
SELECT taken_at, ships_in_port, at_anchor, at_berth, stopped_other, underway
  FROM port_congestion_snapshots
 WHERE taken_at >= :since
 ORDER BY taken_at
"""

NEAR_SQL = """
SELECT ships_in_port
  FROM port_congestion_snapshots
 WHERE taken_at BETWEEN :at - interval '20 minutes' AND :at + interval '20 minutes'
 ORDER BY abs(extract(epoch FROM (taken_at - :at)))
 LIMIT 1
"""


def _rows(connection, sql: str, params: dict | None = None) -> list[dict[str, Any]]:
    result = connection.execute(text(sql), params or {})
    keys = list(result.keys())
    return [dict(zip(keys, row)) for row in result.fetchall()]


def load_snapshots(connection) -> list[dict[str, Any]]:
    return _rows(connection, SNAPSHOTS_SQL)


def load_counts(connection) -> dict[str, Any]:
    rows = _rows(connection, COUNTS_SQL)
    return rows[0] if rows else {}


def load_recent(connection, hours: int = 48) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    return _rows(connection, RECENT_SQL, {"since": since})


def count_near(connection, at: datetime) -> int | None:
    rows = _rows(connection, NEAR_SQL, {"at": at})
    return int(rows[0]["ships_in_port"]) if rows else None


# =========================================================
# LEVELS AND FEATURES
# =========================================================


def levels_from(counts: dict[str, Any]) -> dict[str, Any] | None:
    """Thresholds from the collected history, or None (too little data)."""

    if int(counts.get("snapshots") or 0) < MIN_LEVEL_SNAPSHOTS:
        return None
    if counts.get("p25") is None:
        return None
    return {
        "p25": float(counts["p25"]),
        "p75": float(counts["p75"]),
        "p90": float(counts["p90"]),
        "snapshots": int(counts["snapshots"]),
    }


def level_of(ships: float | None, levels: dict[str, Any] | None) -> str | None:
    if ships is None or levels is None:
        return None
    if ships >= levels["p90"]:
        return "Very high"
    if ships >= levels["p75"]:
        return "High"
    if ships < levels["p25"]:
        return "Low"
    return "Normal"


def features_of(row: dict[str, Any], count_6h_before: int | None) -> dict[str, float | None]:
    at = _utc(row["taken_at"]).astimezone(SGT)

    def num(key):
        value = row.get(key)
        return None if value is None else float(value)

    return {
        "ships_in_port": num("ships_in_port"),
        "at_anchor": num("at_anchor"),
        "at_berth": num("at_berth"),
        "stopped_other": num("stopped_other"),
        "underway": num("underway"),
        "arrivals_6h": num("arrivals_6h"),
        "departures_6h": num("departures_6h"),
        "due_6h": num("due_6h"),
        "due_12h": num("due_12h"),
        "due_24h": num("due_24h"),
        "change_6h": (
            None if count_6h_before is None
            else float(row["ships_in_port"]) - float(count_6h_before)
        ),
        "hour": float(at.hour),
        "weekday": float(at.weekday()),
    }


def trend_estimate(now_count: float, arrivals: float | None,
                   departures: float | None, window_hours: float,
                   hours_ahead: int) -> float | None:
    """
    Simple non-ML estimate: the count now plus the recent rate of
    (arrivals - departures) carried forward. Never below zero.
    """

    if arrivals is None or departures is None or window_hours <= 0:
        return None
    rate = (arrivals - departures) / window_hours
    return max(0.0, now_count + rate * hours_ahead)


def training_table(snapshots: list[dict[str, Any]]):
    """
    For each snapshot: its features and the real count 6/12/24 h later
    (None when there was no snapshot at exactly that hour).
    """

    by_time = {_utc(r["taken_at"]): r for r in snapshots}
    table = []
    for row in snapshots:
        t = _utc(row["taken_at"])
        before = by_time.get(t - timedelta(hours=6))
        item = {
            "taken_at": t,
            "features": features_of(
                row, None if before is None else before["ships_in_port"]
            ),
            "targets": {},
        }
        for h in HORIZONS:
            later = by_time.get(t + timedelta(hours=h))
            item["targets"][h] = None if later is None else float(later["ships_in_port"])
        table.append(item)
    return table


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
    """How many ships the average error grows when one input is mixed up."""

    rng = np.random.default_rng(0)
    truth = y_test.to_numpy()
    base = float(np.mean(np.abs(model.predict(X_test) - truth)))
    result = {}
    for feature in X_test.columns:
        growth = []
        for _ in range(repeats):
            shuffled = X_test.copy()
            shuffled[feature] = rng.permutation(shuffled[feature].to_numpy())
            growth.append(float(np.mean(np.abs(model.predict(shuffled) - truth))) - base)
        result[feature] = float(np.mean(growth))
    return result


def _train_one(np, pd, HGB, table, hours: int, min_records: int) -> tuple[dict, dict | None]:
    rows = [r for r in table if r["targets"][hours] is not None]
    info: dict[str, Any] = {
        "hours_ahead": hours,
        "records_found": len(rows),
        "records_needed": min_records,
    }
    if len(rows) < min_records:
        info["status"] = "not_enough_data"
        return info, None

    rows.sort(key=lambda r: r["taken_at"])
    test_count = max(MIN_TEST_RECORDS, int(round(len(rows) * TEST_SHARE)))
    train_rows, test_rows = rows[:-test_count], rows[-test_count:]

    X_all = pd.DataFrame([r["features"] for r in rows], columns=FEATURES).astype("float64")
    y_all = pd.Series([r["targets"][hours] for r in rows], dtype="float64")
    n_train = len(train_rows)

    used = [f for f in FEATURES if X_all.iloc[:n_train][f].notna().any()]
    skipped = [f for f in FEATURES if f not in used]
    X_all = X_all[used]

    X_train, y_train = X_all.iloc[:n_train], y_all.iloc[:n_train]
    X_test, y_test = X_all.iloc[n_train:], y_all.iloc[n_train:]
    truth = y_test.to_numpy()

    def mae(pred) -> float:
        return float(np.mean(np.abs(np.asarray(pred, dtype="float64") - truth)))

    now_counts = np.array([r["features"]["ships_in_port"] for r in test_rows])
    same_mae = mae(now_counts)

    trend = []
    for r in test_rows:
        f = r["features"]
        value = trend_estimate(f["ships_in_port"], f["arrivals_6h"], f["departures_6h"],
                               TREND_WINDOW_HOURS, hours)
        trend.append(f["ships_in_port"] if value is None else value)
    trend_mae = mae(trend)
    average_mae = mae(np.full(len(truth), float(y_train.mean())))

    simple = {
        "Same as now": same_mae,
        "Trend of the last 6 hours": trend_mae,
        "Usual number (average)": average_mae,
    }
    baseline_name = min(simple, key=simple.get)
    baseline_mae = simple[baseline_name]

    candidates = {
        "Gradient Boosting (scikit-learn)": HGB(
            loss="absolute_error", max_iter=300, learning_rate=0.05, random_state=0,
        ),
    }
    xgb = _xgboost_model()
    if xgb is not None:
        candidates["XGBoost"] = xgb

    results, fitted = [], {}
    for name, model in candidates.items():
        model.fit(X_train, y_train)
        fitted[name] = model
        results.append({"model": name, "mae_ships": round(mae(model.predict(X_test)), 2)})

    best = min(results, key=lambda item: item["mae_ships"])
    improvement = (
        (baseline_mae - best["mae_ships"]) / baseline_mae * 100 if baseline_mae > 0 else 0.0
    )
    good = improvement >= MIN_IMPROVEMENT_PERCENT

    importances = sorted(
        (
            {"feature": f, "name": FEATURE_NAMES[f], "importance_ships": round(v, 2)}
            for f, v in shuffle_importance(np, fitted[best["model"]], X_test, y_test).items()
        ),
        key=lambda item: -item["importance_ships"],
    )

    info.update({
        "status": "trained" if good else "not_better_than_baseline",
        "train_records": n_train,
        "test_records": test_count,
        "test_from": test_rows[0]["taken_at"].isoformat(timespec="seconds"),
        "same_as_now_mae_ships": round(same_mae, 2),
        "trend_mae_ships": round(trend_mae, 2),
        "average_mae_ships": round(average_mae, 2),
        "baseline": baseline_name,
        "baseline_mae_ships": round(baseline_mae, 2),
        "models": results,
        "best_model": best["model"],
        "best_mae_ships": best["mae_ships"],
        "improvement_percent": round(improvement, 1),
        "feature_importance": importances,
        "features_skipped_no_data": [FEATURE_NAMES[f] for f in skipped],
    })

    bundle = None
    if good:
        final = candidates[best["model"]]
        final = final.__class__(**final.get_params())
        final.fit(X_all, y_all)
        bundle = {"model": final, "model_name": best["model"], "features": used,
                  "mae_ships": best["mae_ships"]}
    return info, bundle


def train(snapshots: list[dict[str, Any]], min_records: int = MIN_RECORDS) -> dict[str, Any]:
    joblib, np, pd, HGB = _ml()
    table = training_table(snapshots)

    report: dict[str, Any] = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "snapshots": len(snapshots),
        "records_needed": min_records,
        "required_improvement_percent": MIN_IMPROVEMENT_PERCENT,
        "xgboost_available": _xgboost_model() is not None,
        "horizons": [],
    }
    bundles = {}
    for hours in HORIZONS:
        info, bundle = _train_one(np, pd, HGB, table, hours, min_records)
        report["horizons"].append(info)
        if bundle is not None:
            bundles[hours] = bundle

    statuses = {h["status"] for h in report["horizons"]}
    if bundles:
        report["status"] = "trained"
    elif statuses == {"not_enough_data"}:
        report["status"] = "not_enough_data"
    else:
        report["status"] = "not_better_than_baseline"

    if bundles:
        report["bundle"] = {"horizons": bundles}
    return report


def save(report: dict[str, Any]) -> None:
    joblib = _ml()[0]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bundle = report.pop("bundle", None)
    if bundle is not None:
        joblib.dump(bundle, MODEL_FILE)
    elif MODEL_FILE.exists():
        MODEL_FILE.unlink()
    METRICS_FILE.write_text(json.dumps(report, indent=2), encoding="utf-8")


# =========================================================
# PREDICTIONS
# =========================================================

_cache: dict[str, Any] = {"mtime": None, "bundle": None}


def load_model():
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


def predict(row: dict[str, Any], count_6h_before: int | None) -> dict[int, float]:
    """Model predictions {hours ahead: ships} for the horizons that have a model."""

    bundle = load_model()
    if not bundle:
        return {}
    _joblib, _np, pd, _HGB = _ml()
    values = features_of(row, count_6h_before)
    result = {}
    for hours, item in bundle["horizons"].items():
        X = pd.DataFrame([{f: values.get(f) for f in item["features"]}],
                         columns=item["features"]).astype("float64")
        value = float(item["model"].predict(X)[0])
        if not math.isnan(value):
            result[int(hours)] = max(0.0, value)
    return result
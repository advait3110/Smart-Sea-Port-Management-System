"""
Predict Cargo Throughput - the machine-learning part.

Where the figures come from
    The CSV files imported on the Cargo Operations page (MPA and SingStat
    data from data.gov.sg). That page keeps them in the browser; the
    Predict Cargo Throughput tab sends them here. Nothing is read from the
    database and nothing is made up: no files -> "No CSVs uploaded".

What is predicted (each imported series on its own)
    * Monthly series (container throughput, cargo throughput, cargo by
      type, any other monthly port figure): the next 12 months.
    * Yearly series (yearly cargo total and by type, Sea Cargo statistics,
      any other yearly port figure): the next 3 years.

How it is checked (honestly)
    The newest part of each series is kept apart as the test period
    (24 months, or 8 years). From every point of it the method forecasts
    ahead and is compared with what was really published. The ML model
    must be at least 5 % more accurate than the BEST of the simple
    guesses (same as last time, same month last year, recent growth,
    average...). Otherwise the best simple guess is used and labelled as
    not machine learning. Ranges come from the real test errors.

Monthly models: predict each month's growth against the same month one
year earlier, or against the average of the 12 months before, from the
last months (robust linear regression, Gradient Boosting, XGBoost when
installed); the test decides which one, if any, is used. Yearly model: predicts next
year's growth from the last years' growth (robust linear regression).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# =========================================================
# SETTINGS
# =========================================================

MIN_IMPROVEMENT_PERCENT = 5.0
RANGE_LOW, RANGE_HIGH = 0.10, 0.90   # 8 of 10 test forecasts inside the range

# Monthly
HORIZON = 12                 # months ahead
LAGS_NEEDED = 24             # months needed before a month can be used
TEST_MONTHS = 24             # newest months kept apart for testing
MIN_TRAIN_ROWS = 60          # months the model must learn from (5 years)
MIN_MONTHS = LAGS_NEEDED + MIN_TRAIN_ROWS + TEST_MONTHS   # 108 = 9 years

# Yearly
YEAR_HORIZON = 3             # years ahead
YEAR_LAGS = 4                # years needed before a year can be used
TEST_YEARS = 8               # newest years kept apart for testing
MIN_YEAR_TRAIN = 8
MIN_YEARS = YEAR_LAGS + MIN_YEAR_TRAIN + TEST_YEARS        # 20 years

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_ROOT / "ml_models" / "cargo_throughput"

NO_DATA_MESSAGE = "No CSVs uploaded, please upload CSV."

FEATURES = ["g1", "g2", "g3", "g12", "m1", "seasonal_prev", "month"]
FEATURE_NAMES = {
    "g1": "Last month vs a year before",
    "g2": "2 months ago vs a year before",
    "g3": "3 months ago vs a year before",
    "g12": "Last 12 months vs the 12 before",
    "m1": "Last month's change",
    "seasonal_prev": "Last year's change into this month",
    "month": "Calendar month",
}
LINEAR_FEATURES = [f for f in FEATURES if f != "month"]
# Second kind of model: each month against the average of the 12 before.
LEVEL_FEATURES = ["r1", "r2", "r3", "s12", "s11", "g12", "seasonal_prev"]
FEATURE_NAMES.update({
    "r1": "Last month vs the 12-month average",
    "r2": "2 months ago vs the 12-month average",
    "r3": "3 months ago vs the 12-month average",
    "s12": "Same month last year vs the 12-month average",
    "s11": "Next month last year vs the 12-month average",
})

BASELINES = {
    "average_12": "Average of the last 12 months",
    "last_month": "Last month again",
    "same_month_last_year": "Same month last year",
    "same_month_growth": "Same month last year × recent growth",
}
DEFAULT_ESTIMATE = "same_month_growth"

YEAR_FEATURES = ["y1", "y2", "y3", "y3avg"]
YEAR_BASELINES = {
    "last_year": "Last year again",
    "recent_growth": "Last year × average growth of the 3 years before",
    "trend_10": "Straight-line trend of the last 10 years",
}
YEAR_DEFAULT = "recent_growth"

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


class MLPackagesMissing(RuntimeError):
    """pandas / numpy / scikit-learn / joblib are not installed."""


def _ml():
    try:
        import joblib
        import numpy as np
        import pandas as pd
        from sklearn.ensemble import HistGradientBoostingRegressor
        from sklearn.linear_model import HuberRegressor
    except ImportError as exc:
        raise MLPackagesMissing(
            "The machine-learning packages are not installed on the "
            "backend. Run: pip install pandas numpy scikit-learn xgboost "
            f"joblib ({exc.name} is missing)."
        ) from None
    return joblib, np, pd, HistGradientBoostingRegressor, HuberRegressor


def _xgboost_model():
    try:
        from xgboost import XGBRegressor
    except ImportError:
        return None
    return XGBRegressor(
        n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8,
        colsample_bytree=0.9, objective="reg:absoluteerror", random_state=0,
    )


# =========================================================
# PERIODS
# =========================================================


def month_index(period: str) -> int | None:
    """'2024-05' -> a number that goes up by one each month."""

    match = re.fullmatch(r"\s*(\d{4})-(\d{1,2})\s*", str(period))
    if not match:
        return None
    year, month = int(match.group(1)), int(match.group(2))
    if not 1 <= month <= 12 or not 1900 <= year <= 2200:
        return None
    return year * 12 + month - 1


def year_index(period: str) -> int | None:
    match = re.fullmatch(r"\s*(\d{4})\s*", str(period))
    if not match or not 1900 <= int(match.group(1)) <= 2200:
        return None
    return int(match.group(1))


def period_of(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def label_of(index: int) -> str:
    return f"{MONTH_NAMES[index % 12]} {index // 12}"


def to_series(points: list[dict[str, Any]], frequency: str) -> dict[int, float]:
    """[{period, value}] -> {index: value}; bad rows are skipped."""

    parse = month_index if frequency == "monthly" else year_index
    series: dict[int, float] = {}
    for point in points:
        index = parse(point.get("period"))
        try:
            value = float(point.get("value"))
        except (TypeError, ValueError):
            continue
        if index is not None and math.isfinite(value) and value >= 0:
            series[index] = value
    return series


def fingerprint(series: dict[int, float]) -> str:
    """Changes when figures are added, removed or corrected."""

    text = ";".join(f"{k}:{round(v, 4)}" for k, v in sorted(series.items()))
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _ratio(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b <= 0:
        return None
    return a / b - 1.0


def _percentile(np, values: list[float], q: float) -> float | None:
    return float(np.quantile(np.array(values), q)) if len(values) >= 5 else None


# =========================================================
# MONTHLY: FEATURES, SIMPLE GUESSES, MODEL FORECAST
# =========================================================


def features_for(values: dict[int, float], t: int) -> dict[str, float] | None:
    """Inputs for month t from the 24 months before it (None = not enough)."""

    if any(i not in values for i in range(t - LAGS_NEEDED, t)):
        return None
    v = values
    avg12 = sum(v[i] for i in range(t - 12, t)) / 12
    f = {
        "r1": _ratio(v[t - 1], avg12),
        "r2": _ratio(v[t - 2], avg12),
        "r3": _ratio(v[t - 3], avg12),
        "s12": _ratio(v[t - 12], avg12),
        "s11": _ratio(v[t - 11], avg12),
        "g1": _ratio(v[t - 1], v[t - 13]),
        "g2": _ratio(v[t - 2], v[t - 14]),
        "g3": _ratio(v[t - 3], v[t - 15]),
        "g12": _ratio(sum(v[i] for i in range(t - 12, t)),
                      sum(v[i] for i in range(t - 24, t - 12))),
        "m1": _ratio(v[t - 1], v[t - 2]),
        "seasonal_prev": _ratio(v[t - 12], v[t - 13]),
        "month": float(t % 12 + 1),
    }
    return None if any(x is None for x in f.values()) else f


def simple_guess(values: dict[int, float], origin: int, target: int, kind: str) -> float | None:
    """A simple forecast for month target knowing only the months before origin."""

    known = values
    if kind == "average_12":
        months = range(origin - 12, origin)
        if any(i not in known for i in months):
            return None
        return sum(known[i] for i in months) / 12
    if kind == "last_month":
        return known.get(origin - 1)
    if kind == "same_month_last_year":
        return known.get(target - 12) if target - 12 < origin else None
    if kind == "same_month_growth":
        base = known.get(target - 12) if target - 12 < origin else None
        if base is None or any(i not in known for i in range(origin - 24, origin)):
            return None
        growth = _ratio(sum(known[i] for i in range(origin - 12, origin)),
                        sum(known[i] for i in range(origin - 24, origin - 12)))
        return None if growth is None else base * (1 + growth)
    raise ValueError(kind)


def _base(values: dict[int, float], t: int, target: str) -> float:
    """What the model's growth is measured against."""

    if target == "level":
        return sum(values[i] for i in range(t - 12, t)) / 12
    return values[t - 12]


def _forecast_many(pd, model, used, values, origins, steps,
                   target: str = "yoy") -> dict[int, dict[int, float]]:
    """
    Step-by-step forecasts from several origins at once (one model call per
    step). target "yoy": growth vs the same month a year before; "level":
    vs the average of the 12 months before. Result: {origin: {month: value}}.
    """

    knowns = {o: {i: x for i, x in values.items() if i < o} for o in origins}
    out = {o: {} for o in origins}
    alive = list(origins)
    for step in range(steps):
        rows, keep = [], []
        for o in alive:
            t = o + step
            f = features_for(knowns[o], t)
            if f is None:
                continue
            rows.append({k: f[k] for k in used})
            keep.append(o)
        if not rows:
            break
        X = pd.DataFrame(rows, columns=used).astype("float64")
        growth = model.predict(X)
        for o, g in zip(keep, growth):
            t = o + step
            value = max(0.0, _base(knowns[o], t, target) * (1 + float(g)))
            knowns[o][t] = value
            out[o][t] = value
        alive = keep
    return out


# =========================================================
# MONTHLY: TRAIN AND TEST
# =========================================================


def train_monthly(series: dict[int, float]) -> dict[str, Any]:
    joblib, np, pd, HGB, Huber = _ml()
    report: dict[str, Any] = {
        "frequency": "monthly",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "points": len(series),
        "points_needed": MIN_MONTHS,
        "fingerprint": fingerprint(series),
        "required_improvement_percent": MIN_IMPROVEMENT_PERCENT,
        "xgboost_available": _xgboost_model() is not None,
    }
    if len(series) < MIN_MONTHS:
        report["status"] = "not_enough_data"
        return report

    last = max(series)
    test_start = last - TEST_MONTHS + 1
    rows = []
    for t in sorted(series):
        f = features_for(series, t)
        if f is not None and series[t - 12] > 0:
            rows.append((t, f, {
                "yoy": series[t] / series[t - 12] - 1.0,
                "level": series[t] / _base(series, t, "level") - 1.0,
            }))
    train_rows = [r for r in rows if r[0] < test_start]
    if len(train_rows) < MIN_TRAIN_ROWS:
        report.update(status="not_enough_data", reason=(
            f"Only {len(train_rows)} months have the 24 months before them "
            f"without a gap; at least {MIN_TRAIN_ROWS} are needed."))
        return report

    all_inputs = sorted(set(FEATURES) | set(LEVEL_FEATURES))
    X_train = pd.DataFrame([r[1] for r in train_rows], columns=all_inputs).astype("float64")
    y_train = {k: pd.Series([r[2][k] for r in train_rows], dtype="float64") for k in ("yoy", "level")}

    def hgb():
        return HGB(loss="absolute_error", max_iter=300, learning_rate=0.05,
                   max_leaf_nodes=15, min_samples_leaf=10, random_state=0)

    # name -> (model, inputs, what it predicts)
    candidates = {
        "Robust linear regression (scikit-learn)": (Huber(max_iter=2000), LINEAR_FEATURES, "yoy"),
        "Gradient Boosting (scikit-learn)": (hgb(), FEATURES, "yoy"),
        "Robust linear regression, 12-month level (scikit-learn)": (
            Huber(max_iter=2000), LEVEL_FEATURES, "level"),
        "Gradient Boosting, 12-month level (scikit-learn)": (
            hgb(), LEVEL_FEATURES + ["month"], "level"),
    }
    xgb = _xgboost_model()
    if xgb is not None:
        candidates["XGBoost"] = (xgb, FEATURES, "yoy")
    for model, inputs, target in candidates.values():
        model.fit(X_train[inputs], y_train[target])

    origins = list(range(test_start, last + 1))
    preds = {name: _forecast_many(pd, model, inputs, series, origins, HORIZON, target)
             for name, (model, inputs, target) in candidates.items()}

    methods = list(BASELINES) + list(candidates)
    errors = {m: {h: [] for h in range(1, HORIZON + 1)} for m in methods}
    ratios = {m: {h: [] for h in range(1, HORIZON + 1)} for m in methods}
    for origin in origins:
        known = {i: x for i, x in series.items() if i < origin}
        for h in range(1, min(HORIZON, last - origin + 1) + 1):
            target = origin + h - 1
            actual = series.get(target)
            if actual is None or actual <= 0:
                continue
            guesses = {k: simple_guess(known, origin, target, k) for k in BASELINES}
            guesses.update({name: p[origin].get(target) for name, p in preds.items()})
            if any(g is None or g <= 0 for g in guesses.values()):
                continue
            for m, g in guesses.items():
                errors[m][h].append(abs(g - actual) / actual * 100)
                ratios[m][h].append(actual / g)

    def average(m):
        means = [float(np.mean(errors[m][h])) for h in errors[m] if errors[m][h]]
        return float(np.mean(means)) if means else None

    scores = {m: average(m) for m in methods}
    if any(scores[m] is None for m in methods):
        report.update(status="not_enough_data",
                      reason="The test period has gaps, so the forecasts could not be checked.")
        return report

    best_simple = min(BASELINES, key=lambda k: scores[k])
    best_model = min(candidates, key=lambda k: scores[k])
    improvement = (scores[best_simple] - scores[best_model]) / scores[best_simple] * 100
    good = improvement >= MIN_IMPROVEMENT_PERCENT

    def ranges(m):
        out = {}
        for h in range(1, HORIZON + 1):
            lo = _percentile(np, ratios[m][h], RANGE_LOW)
            hi = _percentile(np, ratios[m][h], RANGE_HIGH)
            out[str(h)] = None if lo is None else [round(lo, 4), round(hi, 4)]
        return out

    table = []
    for h in (1, 3, 6, 12):
        row = {"ahead": h, "tests": len(errors[best_model][h])}
        for m in methods:
            row[m] = round(float(np.mean(errors[m][h])), 2) if errors[m][h] else None
        table.append(row)

    report.update({
        "status": "trained" if good else "not_better_than_baseline",
        "train_points": len(train_rows),
        "test_from": period_of(test_start),
        "test_to": period_of(last),
        "average_error_percent": {m: round(scores[m], 2) for m in methods},
        "method_names": {**BASELINES, **{m: m for m in candidates}},
        "best_simple": best_simple,
        "best_model": best_model,
        "improvement_percent": round(improvement, 1),
        "by_ahead": table,
        "ranges": {m: ranges(m) for m in {best_model, best_simple, DEFAULT_ESTIMATE}},
    })

    if good:
        chosen, inputs, target = candidates[best_model]
        X_all = pd.DataFrame([r[1] for r in rows], columns=all_inputs).astype("float64")
        y_all = pd.Series([r[2][target] for r in rows], dtype="float64")
        final = chosen.__class__(**chosen.get_params())
        final.fit(X_all[inputs], y_all)
        report["bundle"] = {"model": final, "model_name": best_model, "features": inputs,
                            "target": target, "fingerprint": report["fingerprint"]}
    return report


def forecast_monthly(series: dict[int, float], report: dict[str, Any],
                     bundle: dict[str, Any] | None) -> dict[str, Any]:
    last = max(series)
    missing = [period_of(i) for i in range(last - LAGS_NEEDED + 1, last + 1) if i not in series]
    if missing:
        return {"available": False, "reason": (
            "The 24 months before the forecast must all be imported. Missing: "
            + ", ".join(missing[:6]) + (" and more." if len(missing) > 6 else "."))}

    origin = last + 1
    if bundle is not None and bundle.get("fingerprint") == fingerprint(series):
        _j, _np, pd, _H, _R = _ml()
        values = _forecast_many(pd, bundle["model"], bundle["features"], series,
                                [origin], HORIZON, bundle.get("target", "yoy"))[origin]
        key, is_ml, name = bundle["model_name"], True, bundle["model_name"]
    else:
        key = report.get("best_simple") if report.get("best_simple") in BASELINES else DEFAULT_ESTIMATE
        if key == "last_month":
            values = {t: series[last] for t in range(origin, origin + HORIZON)}
        else:
            values = {t: simple_guess(series, origin, t, key) for t in range(origin, origin + HORIZON)}
        is_ml, name = False, BASELINES[key]

    ranges = (report.get("ranges") or {}).get(key) or {}
    rows = []
    for h, t in enumerate(range(origin, origin + HORIZON), start=1):
        value = values.get(t)
        if value is None:
            break
        r = ranges.get(str(h))
        before = series.get(t - 12)
        rows.append({
            "period": period_of(t), "label": label_of(t), "ahead": h,
            "expected": round(value, 2),
            "low": round(value * r[0], 2) if r else None,
            "high": round(value * r[1], 2) if r else None,
            "compare": before, "compare_label": "Same month last year",
            "change_percent": round((value / before - 1) * 100, 1) if before else None,
        })
    last12 = sum(series[i] for i in range(last - 11, last + 1))
    next12 = sum(r["expected"] for r in rows) if len(rows) == HORIZON else None
    return {
        "available": True, "is_ml": is_ml, "method": name, "method_key": key,
        "tested": bool(ranges), "based_on_last": period_of(last), "rows": rows,
        "total_next": round(next12, 2) if next12 is not None else None,
        "total_last": round(last12, 2),
        "total_label_next": "Next 12 months", "total_label_last": "Last 12 months",
    }


# =========================================================
# YEARLY
# =========================================================


def _year_features(values: dict[int, float], t: int) -> dict[str, float] | None:
    if any(i not in values for i in range(t - YEAR_LAGS, t)):
        return None
    y1 = _ratio(values[t - 1], values[t - 2])
    y2 = _ratio(values[t - 2], values[t - 3])
    y3 = _ratio(values[t - 3], values[t - 4])
    if None in (y1, y2, y3):
        return None
    return {"y1": y1, "y2": y2, "y3": y3, "y3avg": (y1 + y2 + y3) / 3}


def year_guess(values: dict[int, float], origin: int, target: int, kind: str) -> float | None:
    """Simple forecast for year target knowing only the years before origin."""

    last = origin - 1
    if last not in values:
        return None
    steps = target - last
    if kind == "last_year":
        return values[last]
    if kind == "recent_growth":
        if any(i not in values for i in range(last - 3, last + 1)):
            return None
        growths = [_ratio(values[i], values[i - 1]) for i in range(last - 2, last + 1)]
        if None in growths:
            return None
        return max(0.0, values[last] * (1 + sum(growths) / 3) ** steps)
    if kind == "trend_10":
        years = [i for i in range(last - 9, last + 1) if i in values]
        if len(years) < 5:
            return None
        n = len(years)
        mx = sum(years) / n
        my = sum(values[i] for i in years) / n
        sxx = sum((i - mx) ** 2 for i in years)
        slope = sum((i - mx) * (values[i] - my) for i in years) / sxx if sxx else 0.0
        return max(0.0, my + slope * (target - mx))
    raise ValueError(kind)


def _year_model_forecast(model, values, origin, steps) -> dict[int, float]:
    import pandas as pd

    known = {i: x for i, x in values.items() if i < origin}
    out = {}
    for t in range(origin, origin + steps):
        f = _year_features(known, t)
        if f is None:
            break
        growth = float(model.predict(pd.DataFrame([f], columns=YEAR_FEATURES))[0])
        known[t] = max(0.0, known[t - 1] * (1 + growth))
        out[t] = known[t]
    return out


def train_yearly(series: dict[int, float]) -> dict[str, Any]:
    """Few points: a robust linear model against three simple guesses."""

    report: dict[str, Any] = {
        "frequency": "yearly",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "points": len(series),
        "points_needed": MIN_YEARS,
        "fingerprint": fingerprint(series),
        "required_improvement_percent": MIN_IMPROVEMENT_PERCENT,
    }
    if len(series) < MIN_YEARS:
        report["status"] = "not_enough_data"
        return report

    joblib, np, pd, _HGB, Huber = _ml()
    last = max(series)
    test_start = last - TEST_YEARS + 1
    rows = []
    for t in sorted(series):
        f = _year_features(series, t)
        g = _ratio(series[t], series.get(t - 1)) if f else None
        if f is not None and g is not None:
            rows.append((t, f, g))
    train_rows = [r for r in rows if r[0] < test_start]
    if len(train_rows) < MIN_YEAR_TRAIN:
        report.update(status="not_enough_data", reason=(
            f"Only {len(train_rows)} years have the 4 years before them without a gap; "
            f"at least {MIN_YEAR_TRAIN} are needed."))
        return report

    model = Huber(max_iter=2000)
    model.fit(pd.DataFrame([r[1] for r in train_rows], columns=YEAR_FEATURES),
              [r[2] for r in train_rows])
    model_name = "Robust linear regression (scikit-learn)"

    methods = list(YEAR_BASELINES) + [model_name]
    errors = {m: {h: [] for h in range(1, YEAR_HORIZON + 1)} for m in methods}
    ratios = {m: {h: [] for h in range(1, YEAR_HORIZON + 1)} for m in methods}
    for origin in range(test_start, last + 1):
        known = {i: x for i, x in series.items() if i < origin}
        mf = _year_model_forecast(model, series, origin, YEAR_HORIZON)
        for h in range(1, min(YEAR_HORIZON, last - origin + 1) + 1):
            target = origin + h - 1
            actual = series.get(target)
            if not actual:
                continue
            guesses = {k: year_guess(known, origin, target, k) for k in YEAR_BASELINES}
            guesses[model_name] = mf.get(target)
            if any(g is None or g <= 0 for g in guesses.values()):
                continue
            for m, g in guesses.items():
                errors[m][h].append(abs(g - actual) / actual * 100)
                ratios[m][h].append(actual / g)

    def average(m):
        means = [float(np.mean(errors[m][h])) for h in errors[m] if errors[m][h]]
        return float(np.mean(means)) if means else None

    scores = {m: average(m) for m in methods}
    if any(scores[m] is None for m in methods):
        report.update(status="not_enough_data",
                      reason="The test years have gaps, so the forecasts could not be checked.")
        return report

    best_simple = min(YEAR_BASELINES, key=lambda k: scores[k])
    improvement = (scores[best_simple] - scores[model_name]) / scores[best_simple] * 100
    good = improvement >= MIN_IMPROVEMENT_PERCENT

    def ranges(m):
        out = {}
        for h in range(1, YEAR_HORIZON + 1):
            lo = _percentile(np, ratios[m][h], RANGE_LOW)
            hi = _percentile(np, ratios[m][h], RANGE_HIGH)
            out[str(h)] = None if lo is None else [round(lo, 4), round(hi, 4)]
        return out

    table = []
    for h in range(1, YEAR_HORIZON + 1):
        row = {"ahead": h, "tests": len(errors[model_name][h])}
        for m in methods:
            row[m] = round(float(np.mean(errors[m][h])), 2) if errors[m][h] else None
        table.append(row)

    report.update({
        "status": "trained" if good else "not_better_than_baseline",
        "train_points": len(train_rows),
        "test_from": str(test_start), "test_to": str(last),
        "average_error_percent": {m: round(scores[m], 2) for m in methods},
        "method_names": {**YEAR_BASELINES, model_name: model_name},
        "best_simple": best_simple, "best_model": model_name,
        "improvement_percent": round(improvement, 1),
        "by_ahead": table,
        "ranges": {m: ranges(m) for m in {model_name, best_simple, YEAR_DEFAULT}},
    })
    if good:
        X_all = pd.DataFrame([r[1] for r in rows], columns=YEAR_FEATURES)
        final = Huber(max_iter=2000).fit(X_all, [r[2] for r in rows])
        report["bundle"] = {"model": final, "model_name": model_name,
                            "fingerprint": report["fingerprint"]}
    return report


def forecast_yearly(series: dict[int, float], report: dict[str, Any],
                    bundle: dict[str, Any] | None) -> dict[str, Any]:
    last = max(series)
    origin = last + 1
    if bundle is not None and bundle.get("fingerprint") == fingerprint(series):
        values = _year_model_forecast(bundle["model"], series, origin, YEAR_HORIZON)
        key, is_ml, name = bundle["model_name"], True, bundle["model_name"]
    else:
        key = report.get("best_simple") if report.get("best_simple") in YEAR_BASELINES else YEAR_DEFAULT
        values = {t: year_guess(series, origin, t, key) for t in range(origin, origin + YEAR_HORIZON)}
        if any(v is None for v in values.values()):
            key = "last_year"
            values = {t: series[last] for t in range(origin, origin + YEAR_HORIZON)}
        is_ml, name = False, YEAR_BASELINES[key]

    ranges = (report.get("ranges") or {}).get(key) or {}
    rows = []
    for h, t in enumerate(range(origin, origin + YEAR_HORIZON), start=1):
        value = values.get(t)
        if value is None:
            break
        r = ranges.get(str(h))
        rows.append({
            "period": str(t), "label": str(t), "ahead": h,
            "expected": round(value, 2),
            "low": round(value * r[0], 2) if r else None,
            "high": round(value * r[1], 2) if r else None,
            "compare": series[last], "compare_label": f"{last} (latest)",
            "change_percent": round((value / series[last] - 1) * 100, 1) if series[last] else None,
        })
    return {
        "available": True, "is_ml": is_ml, "method": name, "method_key": key,
        "tested": bool(ranges), "based_on_last": str(last), "rows": rows,
        "total_next": rows[0]["expected"] if rows else None,
        "total_last": series[last],
        "total_label_next": f"{origin} (forecast)", "total_label_last": f"{last} (imported)",
    }


# =========================================================
# SAVED MODELS (one per series, retrained when its figures change)
# =========================================================

_lock = threading.Lock()


def _paths(key: str) -> tuple[Path, Path]:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", key)[:60] or "series"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
    base = MODEL_DIR / f"{safe}_{digest}"
    return base.with_suffix(".joblib"), base.with_suffix(".json")


def _load(key: str):
    model_file, metrics_file = _paths(key)
    try:
        report = json.loads(metrics_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        report = None
    bundle = None
    if model_file.exists():
        try:
            bundle = _ml()[0].load(model_file)
        except Exception:
            bundle = None
    return report, bundle


def ensure_trained(key: str, frequency: str, series: dict[int, float]):
    """
    The saved test results and model of this series, training first when
    the figures are not the ones it was trained on. Returns
    (report, bundle, trained_now).
    """

    current = fingerprint(series)
    report, bundle = _load(key)
    if report and report.get("fingerprint") == current:
        return report, bundle, False
    with _lock:
        report, bundle = _load(key)
        if report and report.get("fingerprint") == current:
            return report, bundle, False
        report = train_monthly(series) if frequency == "monthly" else train_yearly(series)
        bundle = report.pop("bundle", None)
        model_file, metrics_file = _paths(key)
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        if bundle is not None:
            _ml()[0].dump(bundle, model_file)
        elif model_file.exists():
            model_file.unlink()
        metrics_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report, bundle, True


# =========================================================
# ONE IMPORTED SERIES -> WHAT THE PAGE SHOWS
# =========================================================

_REPORT_KEYS = (
    "status", "trained_at", "points", "points_needed", "train_points", "test_from",
    "test_to", "average_error_percent", "method_names", "best_simple", "best_model",
    "improvement_percent", "required_improvement_percent", "by_ahead",
    "xgboost_available", "reason",
)


def analyse(item: dict[str, Any]) -> dict[str, Any]:
    frequency = "monthly" if item.get("frequency") == "monthly" else "yearly"
    series = to_series(item.get("points") or [], frequency)
    key = str(item.get("key") or item.get("name") or "series")
    result: dict[str, Any] = {
        "key": key,
        "name": str(item.get("name") or key),
        "unit": str(item.get("unit") or ""),
        "frequency": frequency,
        "source": str(item.get("source") or ""),
        "points": len(series),
    }
    if not series:
        result.update(state="no_data", message="This series has no figures.")
        return result

    first, last = min(series), max(series)
    fmt = period_of if frequency == "monthly" else str
    span = range(first, last + 1)
    result.update(
        first=fmt(first), last=fmt(last), latest_value=series[last],
        missing=sum(1 for i in span if i not in series),
        points_needed=MIN_MONTHS if frequency == "monthly" else MIN_YEARS,
        history=[
            {"period": fmt(i), "label": label_of(i) if frequency == "monthly" else str(i),
             "value": series.get(i)}
            for i in (range(max(first, last - 47), last + 1) if frequency == "monthly" else span)
        ],
    )

    model_error = None
    report: dict[str, Any] = {}
    bundle = None
    trained_now = False
    try:
        report, bundle, trained_now = ensure_trained(key, frequency, series)
    except MLPackagesMissing as exc:
        model_error = str(exc)
    except Exception as exc:  # never break the page because of one series
        model_error = f"The model could not be trained ({type(exc).__name__})."

    state = report.get("status") or "not_enough_data"
    if state == "trained" and bundle is None:
        state = "not_better_than_baseline"
    result.update(
        state="ready" if state == "trained" else state,
        trained_now=trained_now,
        model_error=model_error,
        model={k: report.get(k) for k in _REPORT_KEYS} if report.get("status") in (
            "trained", "not_better_than_baseline") else None,
    )
    if report.get("reason"):
        result["reason"] = report["reason"]

    try:
        result["forecast"] = (forecast_monthly if frequency == "monthly" else forecast_yearly)(
            series, report, bundle)
    except Exception as exc:
        result["forecast"] = {"available": False,
                              "reason": f"The forecast could not be worked out ({type(exc).__name__})."}
    return result


def analyse_all(items: list[dict[str, Any]]) -> dict[str, Any]:
    if not items:
        return {"state": "no_data", "message": NO_DATA_MESSAGE, "series": []}
    results = [analyse(item) for item in items]
    if all(r["state"] == "no_data" for r in results):
        return {"state": "no_data", "message": NO_DATA_MESSAGE, "series": results}
    return {"state": "ok", "message": None, "series": results}
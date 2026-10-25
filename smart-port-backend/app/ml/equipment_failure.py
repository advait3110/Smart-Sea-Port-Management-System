"""
Predict Equipment Failure.

Where the figures come from
    The Asset & Maintenance page (tables port_assets,
    port_maintenance_jobs, port_asset_events, created by
    app/services/asset_service.py). Port employees enter them by hand.
    Nothing is made up: no assets -> the page says so.

What counts as a breakdown
    * the asset was marked "Out of Service", or
    * a "Repair" job was entered for it (the earlier of the day it was
      entered and its due date), not cancelled.
    Two breakdowns of the same asset within 3 days count once.

Stage 1 - maintenance risk (rules, not machine learning, always shown)
    Points from the records, with the reasons written out:
      out of service now                         +10
      an open job is overdue                     +3, +1 per week late (max +3)
      a job is due within 7 days                 +1
      breakdowns in the last 12 months           +2 each (max +6)
      days since last maintenance > usual gap    +2 (+1 more if 1.5 x)
      no maintenance ever recorded               +1
    High from 6 points, Medium from 3, otherwise Low.

Stage 2 - chance of a breakdown in the next 30 days (machine learning)
    Trained by itself once at least 30 breakdowns are recorded. Each
    asset is looked at every 7 days of its history ("what did we know on
    that day, and did it break down in the 30 days after?"). The newest
    quarter of those days is kept apart as the test. The model is used
    only when it is at least 5 % better (Brier score: average squared
    error of the chance) than the simple guess "usual breakdown rate of
    this kind of equipment".
"""

from __future__ import annotations

import hashlib
import json
import math
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

# =========================================================
# SETTINGS
# =========================================================

PORT_TZ = timezone(timedelta(hours=8))
DUE_SOON_DAYS = 7
SAME_BREAKDOWN_DAYS = 3
WINDOW_DAYS = 30            # "breakdown in the next 30 days"
STEP_DAYS = 7               # one look at each asset every 7 days
MIN_BREAKDOWNS = 30         # breakdowns needed before a model is trained
MIN_TEST_POSITIVES = 5
TEST_SHARE = 0.25
MIN_IMPROVEMENT_PERCENT = 5.0

HIGH_POINTS = 6
MEDIUM_POINTS = 3

CATEGORIES = ["Crane", "Forklift", "Truck", "Generator", "Pump",
              "Weighbridge", "Other Equipment"]

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_ROOT / "ml_models"
MODEL_FILE = MODEL_DIR / "equipment_failure.joblib"
METRICS_FILE = MODEL_DIR / "equipment_failure_metrics.json"

NO_ASSETS_MESSAGE = (
    "No equipment is registered yet. Add the port's equipment on the "
    "Asset & Maintenance page first."
)

FEATURES = ["days_since_maintenance", "maintenance_ratio", "breakdowns_90",
            "breakdowns_365", "days_since_breakdown", "overdue_days",
            "age_days"] + [f"cat_{c}" for c in CATEGORIES]
FEATURE_NAMES = {
    "days_since_maintenance": "Days since the last maintenance",
    "maintenance_ratio": "Days since maintenance ÷ usual gap",
    "breakdowns_90": "Breakdowns in the last 90 days",
    "breakdowns_365": "Breakdowns in the last 12 months",
    "days_since_breakdown": "Days since the last breakdown",
    "overdue_days": "Days an open job is overdue",
    "age_days": "Days since the asset was registered",
    **{f"cat_{c}": f"Category: {c}" for c in CATEGORIES},
}


class TablesMissing(RuntimeError):
    """The Asset & Maintenance tables do not exist yet."""


class MLPackagesMissing(RuntimeError):
    """pandas / numpy / scikit-learn / joblib are not installed."""


def _ml():
    try:
        import joblib
        import numpy as np
        import pandas as pd
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        raise MLPackagesMissing(
            "The machine-learning packages are not installed on the "
            "backend. Run: pip install pandas numpy scikit-learn xgboost "
            f"joblib ({exc.name} is missing)."
        ) from None
    return joblib, np, pd, HistGradientBoostingClassifier, LogisticRegression, make_pipeline, StandardScaler


def _xgboost():
    try:
        from xgboost import XGBClassifier
    except ImportError:
        return None
    return XGBClassifier(n_estimators=200, max_depth=3, learning_rate=0.05,
                         subsample=0.8, eval_metric="logloss", random_state=0)


def port_today() -> date:
    return datetime.now(PORT_TZ).date()


def _day(value: Any) -> date | None:
    """A database date or timestamp as a Singapore date."""

    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(PORT_TZ).date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _fmt(day: date | None) -> str:
    return day.strftime("%d %b %Y") if day else ""


def _days(n: int) -> str:
    return "1 day" if n == 1 else f"{n} days"


# =========================================================
# READ THE ASSET & MAINTENANCE RECORDS
# =========================================================


def load_records(db) -> dict[str, Any]:
    def rows(sql: str) -> list[dict[str, Any]]:
        return [dict(r) for r in db.execute(text(sql)).mappings().all()]

    try:
        assets = rows(
            "SELECT id, asset_prefix, prefix_seq, name, category, location, "
            "status, status_changed_at, last_maintenance_on, created_at "
            "FROM port_assets ORDER BY asset_prefix, prefix_seq"
        )
        jobs = rows(
            "SELECT id, asset_id, job_type, status, due_date, started_at, "
            "completed_on, created_at, updated_at FROM port_maintenance_jobs"
        )
        events = rows(
            "SELECT id, asset_id, job_id, event_type, old_value, new_value, "
            "created_at FROM port_asset_events"
        )
    except Exception as exc:
        message = str(exc)
        if "does not exist" in message or "no such table" in message:
            try:
                db.rollback()
            except Exception:
                pass
            raise TablesMissing() from exc
        raise
    return {"assets": assets, "jobs": jobs, "events": events}


def fingerprint(records: dict[str, Any]) -> str:
    parts = []
    for key in ("assets", "jobs", "events"):
        for row in records[key]:
            parts.append(json.dumps(row, default=str, sort_keys=True))
    return hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest()


# =========================================================
# FACTS PER ASSET
# =========================================================


def _history(records: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """Breakdowns, maintenance days and jobs of every asset."""

    info: dict[int, dict[str, Any]] = {}
    for a in records["assets"]:
        start = _day(a["created_at"])
        typed = _day(a["last_maintenance_on"])
        info[a["id"]] = {
            "asset": a,
            "start": min(d for d in (start, typed) if d) if (start or typed) else None,
            "breakdowns": [],
            "maintenance": [typed] if typed else [],
            "jobs": [],
        }

    cancelled_on: dict[int, date] = {}
    for e in records["events"]:
        if e["event_type"] == "job_cancelled" and e["job_id"] is not None:
            cancelled_on[e["job_id"]] = _day(e["created_at"])

    for e in records["events"]:
        item = info.get(e["asset_id"])
        if item and e["event_type"] == "status" and e["new_value"] == "Out of Service":
            item["breakdowns"].append(_day(e["created_at"]))

    for j in records["jobs"]:
        item = info.get(j["asset_id"])
        if not item:
            continue
        created = _day(j["created_at"])
        due = _day(j["due_date"])
        done = _day(j["completed_on"]) if j["status"] == "Completed" else None
        cancel = None
        if j["status"] == "Cancelled":
            cancel = cancelled_on.get(j["id"]) or _day(j["updated_at"]) or created
        item["jobs"].append({"created": created, "due": due, "done": done,
                             "cancel": cancel, "status": j["status"], "type": j["job_type"]})
        if done:
            item["maintenance"].append(done)
        if j["job_type"] == "Repair" and j["status"] != "Cancelled":
            item["breakdowns"].append(min(d for d in (created, due) if d))
        for d in (created, due):
            if d and (item["start"] is None or d < item["start"]):
                item["start"] = d

    for item in info.values():
        merged: list[date] = []
        for d in sorted(x for x in item["breakdowns"] if x):
            if not merged or (d - merged[-1]).days > SAME_BREAKDOWN_DAYS:
                merged.append(d)
        item["breakdowns"] = merged
        item["maintenance"] = sorted(set(x for x in item["maintenance"] if x))
        if item["start"] is None:
            item["start"] = port_today()

    # The usual gap between two maintenance jobs: the asset's own, else
    # the middle value of its category.
    def median(values):
        values = sorted(values)
        if not values:
            return None
        n = len(values)
        return values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2

    by_category: dict[str, list[float]] = {}
    for item in info.values():
        gaps = [(b - a).days for a, b in zip(item["maintenance"], item["maintenance"][1:]) if (b - a).days > 0]
        item["own_gap"] = median(gaps) if len(gaps) >= 2 else None
        if gaps:
            by_category.setdefault(item["asset"]["category"], []).extend(gaps)
    for item in info.values():
        item["gap"] = item["own_gap"] or median(by_category.get(item["asset"]["category"], []))
    return info


def _features(item: dict[str, Any], d: date) -> dict[str, float]:
    """What was known about the asset on day d."""

    nan = float("nan")
    maint = [m for m in item["maintenance"] if m <= d]
    last_maint = maint[-1] if maint else None
    since_maint = (d - last_maint).days if last_maint else (d - item["start"]).days
    # Only the gaps known on day d (no peeking at later records).
    gaps = sorted((b - a).days for a, b in zip(maint, maint[1:]) if (b - a).days > 0)
    gap = (gaps[len(gaps) // 2] if len(gaps) % 2 else (gaps[len(gaps) // 2 - 1] + gaps[len(gaps) // 2]) / 2) \
        if len(gaps) >= 2 else None
    past = [b for b in item["breakdowns"] if b <= d]
    overdue = 0
    for j in item["jobs"]:
        if j["created"] and j["created"] > d:
            continue
        if j["done"] and j["done"] <= d:
            continue
        if j["cancel"] and j["cancel"] <= d:
            continue
        if j["due"] and j["due"] < d:
            overdue = max(overdue, (d - j["due"]).days)
    f = {
        "days_since_maintenance": float(since_maint),
        "maintenance_ratio": (since_maint / gap) if gap else nan,
        "breakdowns_90": float(sum(1 for b in past if (d - b).days < 90)),
        "breakdowns_365": float(sum(1 for b in past if (d - b).days < 365)),
        "days_since_breakdown": float((d - past[-1]).days) if past else nan,
        "overdue_days": float(overdue),
        "age_days": float((d - item["start"]).days),
    }
    for c in CATEGORIES:
        f[f"cat_{c}"] = 1.0 if item["asset"]["category"] == c else 0.0
    return f


# =========================================================
# STAGE 1: RISK FROM THE RECORDS (rules)
# =========================================================


def _display_status(item: dict[str, Any], today: date) -> str:
    """The same status as the Asset & Maintenance page."""

    if item["asset"]["status"] == "Out of Service":
        return "Out of Service"
    open_jobs = [j for j in item["jobs"] if j["status"] in ("Scheduled", "In Progress")]
    if any(j["status"] == "In Progress" for j in open_jobs):
        return "Maintenance"
    if any(j["due"] and j["due"] < today for j in open_jobs):
        return "Overdue"
    if any(j["status"] == "Scheduled" and j["due"] and j["due"] <= today + timedelta(days=DUE_SOON_DAYS)
           for j in open_jobs):
        return "Maintenance Due"
    return "Operational"


def risk_of(item: dict[str, Any], today: date) -> dict[str, Any]:
    points = 0
    reasons: list[str] = []
    asset = item["asset"]

    if asset["status"] == "Out of Service":
        points += 10
        since = _day(asset["status_changed_at"])
        reasons.append("Out of service" + (f" since {_fmt(since)}" if since else ""))

    open_jobs = [j for j in item["jobs"] if j["status"] in ("Scheduled", "In Progress")]
    late = [j for j in open_jobs if j["due"] and j["due"] < today]
    if late:
        worst = max((today - j["due"]).days for j in late)
        points += 3 + min(3, worst // 7)
        reasons.append(f"Maintenance overdue by {_days(worst)}")
    elif any(j["status"] == "Scheduled" and j["due"] and j["due"] <= today + timedelta(days=DUE_SOON_DAYS)
             for j in open_jobs):
        nxt = min(j["due"] for j in open_jobs if j["status"] == "Scheduled" and j["due"])
        points += 1
        reasons.append(f"Maintenance due {_fmt(nxt)}")

    recent = [b for b in item["breakdowns"] if 0 <= (today - b).days < 365]
    if recent:
        points += min(6, 2 * len(recent))
        reasons.append(f"{len(recent)} breakdown{'s' if len(recent) != 1 else ''} in the last 12 months")

    maint = [m for m in item["maintenance"] if m <= today]
    if maint:
        since = (today - maint[-1]).days
        if item["gap"]:
            ratio = since / item["gap"]
            if ratio > 1:
                points += 2 + (1 if ratio >= 1.5 else 0)
                reasons.append(
                    f"{_days(since)} since the last maintenance (usually every {_days(int(round(item['gap'])))})"
                )
    else:
        points += 1
        reasons.append("No maintenance recorded yet")

    level = "High" if points >= HIGH_POINTS else "Medium" if points >= MEDIUM_POINTS else "Low"
    if not reasons:
        reasons.append("Nothing in the records points to a risk")
    return {"points": points, "level": level, "reasons": reasons}


# =========================================================
# STAGE 2: TRAIN AND TEST THE MODEL
# =========================================================


def training_rows(info: dict[int, dict[str, Any]], today: date) -> list[tuple[date, int, dict, int]]:
    """(day, asset id, features, broke down in the next 30 days?)"""

    rows = []
    last_day = today - timedelta(days=WINDOW_DAYS)
    for asset_id, item in info.items():
        d = item["start"]
        while d <= last_day:
            label = int(any(d < b <= d + timedelta(days=WINDOW_DAYS) for b in item["breakdowns"]))
            rows.append((d, asset_id, _features(item, d), label))
            d += timedelta(days=STEP_DAYS)
    return rows


def train(records: dict[str, Any], today: date | None = None) -> dict[str, Any]:
    today = today or port_today()
    info = _history(records)
    breakdowns = sum(len(i["breakdowns"]) for i in info.values())
    report: dict[str, Any] = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fingerprint": fingerprint(records),
        "breakdowns": breakdowns,
        "breakdowns_needed": MIN_BREAKDOWNS,
        "required_improvement_percent": MIN_IMPROVEMENT_PERCENT,
    }
    if breakdowns < MIN_BREAKDOWNS:
        # Nothing to train: do not load the heavy ML libraries at all.
        report["status"] = "not_enough_data"
        return report

    report["xgboost_available"] = _xgboost() is not None
    joblib, np, pd, HGB, Logistic, make_pipeline, Scaler = _ml()
    rows = training_rows(info, today)
    days = sorted({r[0] for r in rows})
    if len(days) < 8:
        report.update(status="not_enough_data", reason="The records cover too short a time to test a model.")
        return report
    split = days[int(len(days) * (1 - TEST_SHARE))]
    train_rows = [r for r in rows if r[0] < split]
    test_rows = [r for r in rows if r[0] >= split]
    positives_test = sum(r[3] for r in test_rows)
    if positives_test < MIN_TEST_POSITIVES or sum(r[3] for r in train_rows) < MIN_TEST_POSITIVES:
        report.update(status="not_enough_data", reason=(
            f"Only {positives_test} breakdowns fall in the newest part kept for the test; "
            f"at least {MIN_TEST_POSITIVES} are needed there."))
        return report

    def frame(part):
        X = pd.DataFrame([r[2] for r in part], columns=FEATURES).astype("float64")
        return X, np.array([r[3] for r in part])

    X_train, y_train = frame(train_rows)
    X_test, y_test = frame(test_rows)

    def brier(p):
        return float(np.mean((np.asarray(p, dtype="float64") - y_test) ** 2))

    overall = float(y_train.mean())
    by_cat = {}
    for c in CATEGORIES:
        mask = X_train[f"cat_{c}"] == 1
        by_cat[c] = float(y_train[mask].mean()) if mask.sum() >= 20 else overall
    cat_guess = [by_cat[next(c for c in CATEGORIES if r[2][f"cat_{c}"] == 1.0)] for r in test_rows]
    simple = {
        "category_rate": brier(cat_guess),
        "overall_rate": brier(np.full(len(y_test), overall)),
    }
    simple_names = {
        "category_rate": "Usual breakdown rate of this kind of equipment",
        "overall_rate": "Usual breakdown rate of all equipment",
    }

    X_train_lin = X_train.fillna(-1)
    X_test_lin = X_test.fillna(-1)
    candidates = {
        "Logistic regression (scikit-learn)": (
            make_pipeline(Scaler(), Logistic(max_iter=2000)), True),
        "Gradient Boosting (scikit-learn)": (
            HGB(max_iter=200, learning_rate=0.05, min_samples_leaf=20, random_state=0), False),
    }
    xgb = _xgboost()
    if xgb is not None:
        candidates["XGBoost"] = (xgb, False)

    scores, fitted = {}, {}
    for name, (model, linear) in candidates.items():
        model.fit(X_train_lin if linear else X_train, y_train)
        prob = model.predict_proba(X_test_lin if linear else X_test)[:, 1]
        scores[name] = brier(prob)
        fitted[name] = (model, linear)

    best_simple = min(simple, key=simple.get)
    best_model = min(scores, key=scores.get)
    improvement = (simple[best_simple] - scores[best_model]) / simple[best_simple] * 100
    good = improvement >= MIN_IMPROVEMENT_PERCENT

    report.update({
        "status": "trained" if good else "not_better_than_baseline",
        "train_from": days[0].isoformat(), "test_from": split.isoformat(),
        "test_to": days[-1].isoformat(),
        "looks_train": len(train_rows), "looks_test": len(test_rows),
        "breakdowns_in_test": int(positives_test),
        "brier": {**{simple_names[k]: round(v, 4) for k, v in simple.items()},
                  **{k: round(v, 4) for k, v in scores.items()}},
        "best_model": best_model, "best_simple": simple_names[best_simple],
        "improvement_percent": round(improvement, 1),
        "base_rate_percent": round(overall * 100, 1),
    })
    if good:
        model, linear = fitted[best_model]
        X_all, y_all = frame(rows)
        final = model.__class__(**model.get_params()) if not linear else make_pipeline(
            Scaler(), Logistic(max_iter=2000))
        final.fit(X_all.fillna(-1) if linear else X_all, y_all)
        report["bundle"] = {"model": final, "linear": linear, "model_name": best_model,
                            "fingerprint": report["fingerprint"]}
    return report


_lock = threading.Lock()


def _load_saved():
    try:
        report = json.loads(METRICS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        report = None
    bundle = None
    if MODEL_FILE.exists():
        try:
            bundle = _ml()[0].load(MODEL_FILE)
        except MLPackagesMissing:
            raise
        except Exception:
            bundle = None
    return report, bundle


def ensure_trained(records: dict[str, Any]):
    """(report, bundle, trained_now): trains again when the records changed."""

    current = fingerprint(records)
    report, bundle = _load_saved()
    if report and report.get("fingerprint") == current:
        return report, bundle, False
    with _lock:
        report, bundle = _load_saved()
        if report and report.get("fingerprint") == current:
            return report, bundle, False
        report = train(records)
        bundle = report.pop("bundle", None)
        if report["status"] != "not_enough_data" or MODEL_DIR.exists():
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            if bundle is not None:
                _ml()[0].dump(bundle, MODEL_FILE)
            elif MODEL_FILE.exists():
                MODEL_FILE.unlink()
            METRICS_FILE.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report, bundle, True


# =========================================================
# WHAT THE PAGE SHOWS
# =========================================================


def analyse(db) -> dict[str, Any]:
    try:
        records = load_records(db)
    except TablesMissing:
        return {"state": "no_assets", "message": NO_ASSETS_MESSAGE, "assets": []}
    if not records["assets"]:
        return {"state": "no_assets", "message": NO_ASSETS_MESSAGE, "assets": []}

    today = port_today()
    info = _history(records)

    model_error = None
    report: dict[str, Any] = {}
    bundle = None
    trained_now = False
    try:
        report, bundle, trained_now = ensure_trained(records)
    except MLPackagesMissing as exc:
        model_error = str(exc)
        report = {"status": "not_enough_data",
                  "breakdowns": sum(len(i["breakdowns"]) for i in info.values()),
                  "breakdowns_needed": MIN_BREAKDOWNS}

    chances: dict[int, float] = {}
    if bundle is not None and bundle.get("fingerprint") == fingerprint(records):
        _j, _np, pd, *_ = _ml()
        X = pd.DataFrame([_features(info[a["id"]], today) for a in records["assets"]],
                         columns=FEATURES).astype("float64")
        prob = bundle["model"].predict_proba(X.fillna(-1) if bundle["linear"] else X)[:, 1]
        chances = {a["id"]: float(p) for a, p in zip(records["assets"], prob)}

    assets = []
    for a in records["assets"]:
        item = info[a["id"]]
        risk = risk_of(item, today)
        maint = [m for m in item["maintenance"] if m <= today]
        assets.append({
            "id": a["id"],
            "code": f"{a['asset_prefix']}-{int(a['prefix_seq']):03d}",
            "name": a["name"], "category": a["category"], "location": a["location"],
            "status": _display_status(item, today),
            "risk_level": risk["level"], "risk_points": risk["points"], "reasons": risk["reasons"],
            "breakdowns_12m": sum(1 for b in item["breakdowns"] if 0 <= (today - b).days < 365),
            "breakdowns_total": len(item["breakdowns"]),
            "last_maintenance": maint[-1].isoformat() if maint else None,
            "chance_30d": round(chances[a["id"]] * 100, 1) if a["id"] in chances else None,
        })
    order = {"High": 0, "Medium": 1, "Low": 2}
    assets.sort(key=lambda x: (order[x["risk_level"]], -x["risk_points"],
                               -(x["chance_30d"] or 0), x["code"]))

    status = report.get("status", "not_enough_data")
    ml_state = "ready" if (status == "trained" and chances) else status
    return {
        "state": "ok",
        "today": today.isoformat(),
        "assets": assets,
        "counts": {
            "assets": len(assets),
            "high": sum(1 for x in assets if x["risk_level"] == "High"),
            "medium": sum(1 for x in assets if x["risk_level"] == "Medium"),
            "low": sum(1 for x in assets if x["risk_level"] == "Low"),
            "out_of_service": sum(1 for x in assets if x["status"] == "Out of Service"),
            "overdue": sum(1 for x in assets if x["status"] == "Overdue"),
        },
        "ml": {
            "state": ml_state,
            "trained_now": trained_now,
            "model_error": model_error,
            "breakdowns": report.get("breakdowns", 0),
            "breakdowns_needed": report.get("breakdowns_needed", MIN_BREAKDOWNS),
            "window_days": WINDOW_DAYS,
            "reason": report.get("reason"),
            "model": {k: report.get(k) for k in (
                "trained_at", "train_from", "test_from", "test_to", "looks_train", "looks_test",
                "breakdowns_in_test", "brier", "best_model", "best_simple", "improvement_percent",
                "required_improvement_percent", "base_rate_percent", "xgboost_available",
            )} if status in ("trained", "not_better_than_baseline") else None,
        },
        "rules": {"high_points": HIGH_POINTS, "medium_points": MEDIUM_POINTS},
    }
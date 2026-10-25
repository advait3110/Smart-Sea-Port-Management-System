"""
train_berth_congestion.py  -  train the Predict Berth Congestion model.

Run it from the backend folder (or from app\\scripts), with the backend's
Python:

    python app\\scripts\\train_berth_congestion.py

It reads the hourly port snapshots (port_congestion_snapshots) and, for
6, 12 and 24 hours ahead separately:
  * stops with "not enough data" while fewer than 300 records exist
    (a record = a snapshot with another snapshot exactly that many hours
    later);
  * otherwise trains scikit-learn Gradient Boosting and XGBoost, tests
    them on the newest 20 % of records, and compares them with three
    simple guesses: "same as now", the recent trend, and the usual number;
  * uses a model ONLY when it is at least 5 % more accurate than the
    best simple guess. The page picks it up by itself (no restart needed).

It only READS the database. Run it again whenever more data has been
collected (for example once a week).
"""

import os
import sys
from pathlib import Path


def _backend_root() -> Path:
    folder = Path(__file__).resolve().parent
    for _ in range(6):
        if (folder / "app").is_dir() and (
            (folder / ".env").exists() or (folder / "requirements.txt").exists()
        ):
            return folder
        folder = folder.parent
    return Path(__file__).resolve().parents[2]


ROOT = _backend_root()
os.chdir(ROOT)  # the backend reads .env from the folder it starts in
sys.path.insert(0, str(ROOT))


def main() -> int:
    from app.core.database import engine
    from app.ml import berth_congestion as bc

    print("=" * 64)
    print(" PREDICT BERTH CONGESTION - TRAINING")
    print("=" * 64)

    try:
        with engine.connect() as connection:
            snapshots = bc.load_snapshots(connection)
    except Exception as exc:
        print(f" Could not read the database: {type(exc).__name__}: "
              f"{str(exc).splitlines()[0] if str(exc) else ''}")
        return 1

    try:
        report = bc.train(snapshots)
    except bc.MLPackagesMissing as exc:
        print(f" {exc}")
        return 1

    print(f" Hourly port snapshots: {report['snapshots']}")
    if not report["xgboost_available"]:
        print(" (XGBoost is not installed: pip install xgboost)")

    for h in report["horizons"]:
        print()
        print(f" --- {h['hours_ahead']} hours ahead ---")
        print(f" Records: {h['records_found']} (needed: {h['records_needed']})")
        if h["status"] == "not_enough_data":
            print(" NOT TRAINED: not enough data yet.")
            continue
        print(f" Training records: {h['train_records']}, test records (newest): {h['test_records']}")
        print(" Average error on the test records (ships, lower is better):")
        lines = [
            ("Same as now", h["same_as_now_mae_ships"]),
            ("Trend of the last 6 hours", h["trend_mae_ships"]),
            ("Usual number (average)", h["average_mae_ships"]),
        ] + [(item["model"], item["mae_ships"]) for item in h["models"]]
        for label, value in lines:
            print(f"   {label:<36}{value}")
        if h.get("features_skipped_no_data"):
            print(" Inputs left out (no data yet): " + ", ".join(h["features_skipped_no_data"]))
        if h["status"] == "trained":
            print(f" USED: {h['best_model']} is {h['improvement_percent']}% more accurate "
                  f"than the best simple guess ({h['baseline']}).")
        else:
            print(f" NOT USED: only {h['improvement_percent']}% better than the best "
                  f"simple guess ({h['baseline']}); "
                  f"at least {report['required_improvement_percent']}% is required.")

    bc.save(report)
    print()
    if report["status"] == "trained":
        print(f" SAVED: {bc.MODEL_FILE}")
    else:
        print(" No model saved. The page keeps showing the trend estimate,")
        print(" labelled as not machine learning.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
"""
train_vessel_delay.py  -  train the Predict Vessel Delay model.

Run it from the backend folder (or from app\\scripts), with the backend's
Python:

    python app\\scripts\\train_vessel_delay.py

It reads the collected ETA reports and arrivals, and:
  * stops with "not enough data" while fewer than 300 arrivals have an
    ETA reported before them;
  * otherwise trains scikit-learn Gradient Boosting and XGBoost, tests
    them on the newest 20 % of arrivals, and compares them with simply
    trusting the ship's own ETA;
  * saves the best model to ml_models\\vessel_delay.joblib ONLY when it
    is clearly (at least 5 %) more accurate than the ships' own ETAs.
    The Delay Prediction page picks it up by itself (no restart needed).

It only READS the database (it writes nothing there). Run it again
whenever more data has been collected (for example once a week).
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
    from app.ml import vessel_delay as vd

    print("=" * 64)
    print(" PREDICT VESSEL DELAY - TRAINING")
    print("=" * 64)

    try:
        with engine.connect() as connection:
            rows = vd.load_training_rows(connection)
    except Exception as exc:
        print(f" Could not read the database: {type(exc).__name__}: "
              f"{str(exc).splitlines()[0] if str(exc) else ''}")
        return 1

    try:
        report = vd.train(rows)
    except vd.MLPackagesMissing as exc:
        print(f" {exc}")
        return 1

    found, needed = report["records_found"], report["records_needed"]
    print(f" Arrivals with an ETA reported before them: {found} (needed: {needed})")
    print(f" ETA reports used: {report['eta_reports_used']}")

    if report["status"] == "not_enough_data":
        vd.save(report)
        print()
        print(" NOT TRAINED: not enough data yet. Keep the backend running so")
        print(" the AISStream collector can save more ETAs and arrivals, then")
        print(" run this again.")
        return 0

    print(f" Training arrivals: {report['train_arrivals']}, "
          f"test arrivals (newest): {report['test_arrivals']}")
    print()
    print(" Average error on the test arrivals (lower is better):")
    print(f"   Ship's own ETA is right (baseline): {report['baseline_mae_minutes']} min")
    print(f"   Average delay for every ship:       {report['mean_delay_mae_minutes']} min")
    for item in report["models"]:
        print(f"   {item['model']:<36}{item['mae_minutes']} min")
    if not report["xgboost_available"]:
        print("   (XGBoost is not installed: pip install xgboost)")
    if report.get("features_skipped_no_data"):
        print(" Inputs left out (no data yet): "
              + ", ".join(report["features_skipped_no_data"]))
    print()
    print(" Most important inputs:")
    for item in report["feature_importance"][:5]:
        print(f"   {item['name']}: {item['importance_minutes']} min")

    vd.save(report)
    print()
    if report["status"] == "trained":
        print(f" SAVED: {report['best_model']} is {report['improvement_percent']}% "
              "more accurate than the ships' own ETAs.")
        print(f" Model file: {vd.MODEL_FILE}")
    else:
        print(f" NOT SAVED: the best model is {report['improvement_percent']}% better than")
        print(f" the ships' own ETAs; at least {report['required_improvement_percent']}% is required.")
        print(" The page will keep showing the reported ETAs only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
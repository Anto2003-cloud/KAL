"""
KAL Daily / Continuous Pipeline
Orchestrates: intel refresh → feature rebuild (light) → predictions → log

Designed to be called by:
  - cron / systemd timer
  - Grok Automations (scheduled prompt)
  - manual: python -m src.pipeline_daily
"""

from __future__ import annotations

import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# ensure imports
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.data.fetch_intel import MLBIntelligence
from src.models.predict import predict_date, print_predictions
from src.tracking.panel import update_tracking, print_panel
from src.models.retrain import maybe_retrain

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kal.pipeline")

LOG_DIR = Path(__file__).resolve().parents[1] / "data" / "results"
LOG_DIR.mkdir(parents=True, exist_ok=True)


def run_pipeline(
    predict_dates: list[date] | None = None,
    skip_intel: bool = False,
) -> dict:
    started = datetime.now()
    report = {"started": started.isoformat(), "steps": {}}

    # 1. Intelligence refresh
    if not skip_intel:
        logger.info("[1/4] Intelligence refresh ...")
        intel = MLBIntelligence()
        report["steps"]["intel"] = intel.full_refresh()
    else:
        report["steps"]["intel"] = "skipped"

    # 2. Predictions for today + tomorrow
    if predict_dates is None:
        # Hora de Venezuela, no la del servidor (UTC en Railway) — ver
        # mismo fix en kal_api/main.py::today_ve() y src/autonomous.py.
        from datetime import timezone

        today_ve = (datetime.now(timezone.utc) + timedelta(hours=-4)).date()
        predict_dates = [today_ve, today_ve + timedelta(days=1)]

    logger.info("[2/4] Generating predictions ...")
    all_preds = []
    for d in predict_dates:
        try:
            preds = predict_date(d, save=True)
            report["steps"][f"preds_{d.isoformat()}"] = {
                "n": len(preds),
                "high": int((preds["confidence"] == "HIGH").sum()) if not preds.empty else 0,
                "medium": int((preds["confidence"] == "MEDIUM").sum()) if not preds.empty else 0,
                "low": int((preds["confidence"] == "LOW").sum()) if not preds.empty else 0,
            }
            if not preds.empty:
                all_preds.append(preds)
                print_predictions(preds)
        except Exception as e:
            logger.exception("Prediction failed for %s: %s", d, e)
            report["steps"][f"preds_{d.isoformat()}"] = {"error": str(e)}

    # 3. Summary log
    report["finished"] = datetime.now().isoformat()
    report["duration_sec"] = (datetime.now() - started).total_seconds()
    log_path = LOG_DIR / f"pipeline_{started.strftime('%Y%m%d_%H%M%S')}.json"
    import json

    log_path.write_text(json.dumps(report, indent=2, default=str))
    logger.info("[3/3] Updating tracking panel ...")
    try:
        panel = update_tracking()
        print_panel(panel)
        report["steps"]["tracking"] = panel
    except Exception as e:
        logger.exception("Tracking failed: %s", e)
        report["steps"]["tracking"] = {"error": str(e)}

    # Optional retrain gate (does nothing until ≥75 graded)
    try:
        tr = maybe_retrain(force=False)
        report["steps"]["retrain"] = {
            "action": tr.get("action"),
            "reason": tr.get("reason"),
            "n_graded": tr.get("n_graded"),
        }
    except Exception as e:
        logger.warning("Retrain gate error: %s", e)
        report["steps"]["retrain"] = {"error": str(e)}

    logger.info("[4/4] Pipeline finished in %.1fs → %s", report["duration_sec"], log_path.name)
    return report


if __name__ == "__main__":
    run_pipeline()

"""
KAL autonomous cycle — one shot used by 24/7 schedules.

Does in order:
  1. Intel refresh (rosters / IL / transactions / schedule)
  2. Daily pipeline (features adjustments + predictions if games)
  3. Tracking grade + panel
  4. Retrain gate (only promotes if ≥75 graded and better)

Never mutates past predictions.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kal.auto")

PROJECT = Path(__file__).resolve().parents[1]
RESULTS = PROJECT / "data" / "results"
RESULTS.mkdir(parents=True, exist_ok=True)


def run() -> dict:
    report = {"started_at": datetime.now().isoformat(), "steps": {}}
    # 1 intel
    try:
        from src.data.fetch_intel import refresh_intel
        report["steps"]["intel"] = refresh_intel()
    except Exception as e:
        logger.exception("intel")
        report["steps"]["intel"] = {"error": str(e)}
    # 2 pipeline / preds
    try:
        from src.pipeline_daily import run_daily
        report["steps"]["pipeline"] = run_daily()
    except Exception as e:
        logger.exception("pipeline")
        # fallback: predict only
        try:
            from src.models.predict import predict_day, print_predictions
            import pandas as pd
            from datetime import date
            df = predict_day(date.today().isoformat())
            print_predictions(df)
            report["steps"]["pipeline"] = {"fallback": "predict_day", "n": len(df)}
        except Exception as e2:
            report["steps"]["pipeline"] = {"error": str(e), "fallback_error": str(e2)}
    # 3 tracking
    try:
        from src.tracking.panel import update_tracking, print_panel
        panel = update_tracking()
        print_panel(panel)
        report["steps"]["tracking"] = panel
    except Exception as e:
        logger.exception("tracking")
        report["steps"]["tracking"] = {"error": str(e)}
    # 4 retrain gate
    try:
        from src.models.retrain import maybe_retrain
        report["steps"]["retrain"] = maybe_retrain(force=False)
    except Exception as e:
        logger.exception("retrain")
        report["steps"]["retrain"] = {"error": str(e)}

    report["finished_at"] = datetime.now().isoformat()
    out = RESULTS / f"auto_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    # strip huge nested
    slim = {k: v for k, v in report.items()}
    out.write_text(json.dumps(slim, indent=2, default=str)[:50000], encoding="utf-8")
    logger.info("Autonomous cycle done → %s", out.name)
    return report


if __name__ == "__main__":
    r = run()
    print(json.dumps({
        "finished_at": r.get("finished_at"),
        "intel": "ok" if "error" not in str(r.get("steps", {}).get("intel")) else r["steps"]["intel"],
        "pipeline_keys": list((r.get("steps") or {}).get("pipeline") or {}).keys() if isinstance((r.get("steps") or {}).get("pipeline"), dict) else type((r.get("steps") or {}).get("pipeline")).__name__,
        "tracking": (r.get("steps") or {}).get("tracking", {}).get("record") if isinstance((r.get("steps") or {}).get("tracking"), dict) else None,
        "retrain": (r.get("steps") or {}).get("retrain", {}).get("action") if isinstance((r.get("steps") or {}).get("retrain"), dict) else None,
    }, indent=2, default=str))

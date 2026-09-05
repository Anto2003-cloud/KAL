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
        # BUG CRÍTICO ARREGLADO: este import decía 'run_daily', que no
        # existe en NINGÚN lado del código — solo existe 'run_pipeline'.
        # Esto significaba que el pipeline completo (features, park
        # factors, bullpen, intel) fallaba con ImportError en TODAS las
        # corridas desde siempre, cayendo siempre al fallback de abajo
        # (que TAMBIÉN estaba roto — ver el otro fix debajo). Las
        # predicciones que sí aparecían venían de un mecanismo de
        # respaldo aparte en kal_api/main.py (_export_today_json), que
        # solo corre UNA VEZ por día si no hay nada guardado — nunca
        # refrescaba con datos actualizados durante el resto del día.
        from src.pipeline_daily import run_pipeline
        from datetime import timezone, timedelta

        today = (datetime.now(timezone.utc) + timedelta(hours=-4)).date()
        report["steps"]["pipeline"] = run_pipeline(predict_dates=[today, today + timedelta(days=1)])
    except Exception as e:
        logger.exception("pipeline")
        # fallback: predict only
        try:
            # BUG ARREGLADO: 'predict_day' tampoco existe — la función real
            # es 'predict_date'. Y date.today() es hora del servidor (UTC
            # en Railway), no hora de Venezuela.
            from src.models.predict import predict_date, print_predictions
            from datetime import timezone, timedelta

            today = (datetime.now(timezone.utc) + timedelta(hours=-4)).date()
            df = predict_date(today)
            print_predictions(df)
            report["steps"]["pipeline"] = {"fallback": "predict_date", "n": len(df)}
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

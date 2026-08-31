"""
KAL Live API — cerebro autónomo 24/7

Endpoints:
  GET  /health
  GET  /api/preds?date=YYYY-MM-DD
  GET  /api/panel
  GET  /api/status
  POST /api/run/cycle   (cron / secreto)
  POST /api/run/grade

Arranca un loop en background: ciclo mañana / tarde / noche (UTC-5 approx).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# kal_mlb on path
ROOT = Path(__file__).resolve().parents[1]
KAL = ROOT / "kal_mlb"
sys.path.insert(0, str(KAL))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("kal.api")

app = FastAPI(title="KAL MLB Live API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RUN_SECRET = os.environ.get("KAL_RUN_SECRET", "kal-dev-secret")
DATA = KAL / "data"
PRED_DIR = DATA / "predictions"
RESULTS = DATA / "results"
STATE_FILE = RESULTS / "api_state.json"

_state: dict[str, Any] = {
    "live": True,
    "last_cycle_at": None,
    "last_cycle_ok": None,
    "last_error": None,
    "cycles": 0,
}


def _save_state():
    RESULTS.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(_state, indent=2, default=str), encoding="utf-8")


def _load_preds(day: str) -> list[dict]:
    """Read predictions for a date from feather/csv/json if present."""
    PRED_DIR.mkdir(parents=True, exist_ok=True)
    # json export preferred for API
    jp = PRED_DIR / f"preds_{day}.json"
    if jp.exists():
        return json.loads(jp.read_text(encoding="utf-8"))
    csvp = PRED_DIR / f"preds_{day}.csv"
    if csvp.exists():
        try:
            import pandas as pd
            df = pd.read_csv(csvp)
            return df.to_dict(orient="records")
        except Exception as e:
            log.warning("csv read %s", e)
    # feather
    fp = PRED_DIR / f"preds_{day}.feather"
    if fp.exists():
        try:
            import pandas as pd
            df = pd.read_feather(fp)
            return json.loads(df.to_json(orient="records"))
        except Exception as e:
            log.warning("feather read %s", e)
    return []


def _load_panel() -> dict:
    panel_path = RESULTS / "tracking_panel.json"
    if panel_path.exists():
        return json.loads(panel_path.read_text(encoding="utf-8"))
    return {
        "updated_at": None,
        "n_graded": 0,
        "n_pending": 0,
        "hits": 0,
        "misses": 0,
        "accuracy": 0,
        "record": "0-0",
        "units_flat": 0,
        "by_confidence": {},
        "live": True,
        "note": "Aún sin partidos graded en este entorno",
    }


def run_cycle() -> dict:
    """Ejecuta el ciclo autónomo completo (intel → pred → grade → retrain gate)."""
    log.info("=== KAL autonomous cycle start ===")
    report: dict[str, Any] = {"started_at": datetime.now(timezone.utc).isoformat()}
    try:
        # prefer package autonomous
        try:
            from src.autonomous import run as auto_run
            report["result"] = auto_run()
        except Exception as e1:
            log.warning("autonomous.run failed: %s — fallback pipeline", e1)
            from src.pipeline_daily import run_pipeline
            report["result"] = run_pipeline()
        # always try export json for API
        try:
            _export_today_json()
        except Exception as ex:
            report["export_error"] = str(ex)
        _state["last_cycle_at"] = datetime.now(timezone.utc).isoformat()
        _state["last_cycle_ok"] = True
        _state["last_error"] = None
        _state["cycles"] = int(_state.get("cycles") or 0) + 1
        _save_state()
        report["ok"] = True
    except Exception as e:
        log.exception("cycle failed")
        _state["last_cycle_at"] = datetime.now(timezone.utc).isoformat()
        _state["last_cycle_ok"] = False
        _state["last_error"] = str(e)
        _save_state()
        report["ok"] = False
        report["error"] = str(e)
    return report


def _export_today_json():
    """Best-effort: copy latest preds to json for the frontend."""
    day = date.today().isoformat()
    rows = _load_preds(day)
    if rows:
        return
    # try generate
    try:
        from src.models.predict import predict_date
        import pandas as pd
        df = predict_date(date.today())
        if df is None or len(df) == 0:
            return
        PRED_DIR.mkdir(parents=True, exist_ok=True)
        out = PRED_DIR / f"preds_{day}.json"
        out.write_text(df.to_json(orient="records"), encoding="utf-8")
        log.info("exported %s (%s rows)", out.name, len(df))
    except Exception as e:
        log.warning("export today: %s", e)


def _check_secret(x_kal_secret: str | None):
    if x_kal_secret != RUN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid KAL_RUN_SECRET")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "kal-live-api",
        "live": True,
        "time": datetime.now(timezone.utc).isoformat(),
        **{k: _state.get(k) for k in ("last_cycle_at", "last_cycle_ok", "cycles")},
    }


@app.get("/api/status")
def status():
    return {
        "live": True,
        "mode": "autonomous",
        "state": _state,
        "panel": _load_panel(),
        "today_preds": len(_load_preds(date.today().isoformat())),
    }


@app.get("/api/preds")
def preds(date_str: str | None = Query(None, alias="date")):
    day = date_str or date.today().isoformat()
    rows = _load_preds(day)
    return {
        "date": day,
        "count": len(rows),
        "live": True,
        "source": "kal_mlb/data/predictions",
        "predictions": rows,
    }


@app.get("/api/panel")
def panel():
    p = _load_panel()
    p["live"] = True
    return p


@app.post("/api/run/cycle")
def api_run_cycle(x_kal_secret: str | None = Header(None)):
    _check_secret(x_kal_secret)
    return run_cycle()


@app.post("/api/run/grade")
def api_run_grade(x_kal_secret: str | None = Header(None)):
    _check_secret(x_kal_secret)
    try:
        from src.tracking.panel import update_tracking
        panel = update_tracking()
        return {"ok": True, "panel": panel}
    except Exception as e:
        raise HTTPException(500, str(e))


async def _scheduler_loop():
    """
    Ciclo autónomo aproximado (America/Chicago):
      ~13:00 UTC ≈ 08:00 Chicago → morning
      ~22:30 UTC ≈ 17:30 Chicago → evening
      ~04:30 UTC ≈ 23:30 Chicago → night grade
    En free tier: corre cada 3h un cycle ligero.
    """
    await asyncio.sleep(15)  # boot grace
    log.info("Scheduler autónomo activo")
    while True:
        try:
            hour = datetime.now(timezone.utc).hour
            # siempre intenta cycle; el propio pipeline decide si hay juegos
            if hour in (13, 22, 4, 16) or _state.get("cycles", 0) == 0:
                log.info("scheduler trigger hour=%s", hour)
                await asyncio.to_thread(run_cycle)
            else:
                # heartbeat grade cada 3h
                if hour % 3 == 0:
                    await asyncio.to_thread(run_cycle)
        except Exception:
            log.exception("scheduler tick")
        await asyncio.sleep(60 * 60)  # 1h


@app.on_event("startup")
async def startup():
    RESULTS.mkdir(parents=True, exist_ok=True)
    PRED_DIR.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        try:
            _state.update(json.loads(STATE_FILE.read_text(encoding="utf-8")))
        except Exception:
            pass
    asyncio.create_task(_scheduler_loop())
    # primer cycle en background sin bloquear health
    asyncio.create_task(asyncio.to_thread(run_cycle))

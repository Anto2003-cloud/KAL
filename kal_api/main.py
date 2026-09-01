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



def _load_history() -> list[dict]:
    """All graded + pending predictions for Historial."""
    RESULTS.mkdir(parents=True, exist_ok=True)
    # prefer json export
    jp = RESULTS / "graded_predictions.json"
    if jp.exists():
        try:
            rows = json.loads(jp.read_text(encoding="utf-8"))
            if isinstance(rows, list):
                return rows
        except Exception as e:
            log.warning("graded json: %s", e)
    # feather / csv
    for name in ("graded_predictions.feather", "graded_predictions.csv"):
        path = RESULTS / name
        if not path.exists():
            continue
        try:
            import pandas as pd
            df = pd.read_feather(path) if name.endswith(".feather") else pd.read_csv(path)
            # only useful cols
            recs = json.loads(df.to_json(orient="records", date_format="iso"))
            # also write json cache
            try:
                jp.write_text(json.dumps(recs, default=str)[:2_000_000], encoding="utf-8")
            except Exception:
                pass
            return recs
        except Exception as e:
            log.warning("load %s: %s", name, e)
    # fallback: all pred json/csv files, mark ungraded
    rows = []
    for jf in sorted(PRED_DIR.glob("preds_*.json")):
        try:
            rows.extend(json.loads(jf.read_text(encoding="utf-8")))
        except Exception:
            pass
    return rows




def _bootstrap_volume_from_seed():
    """Si el volume está vacío (montado sobre data/), copiar seed de la imagen."""
    import shutil
    seed = Path("/app/seed_kal_data")
    target = KAL / "data"
    if not seed.exists():
        log.warning("No seed at /app/seed_kal_data")
        return {"seed": False}
    target.mkdir(parents=True, exist_ok=True)
    # copiar modelos si faltan
    copied = []
    for sub in ("models", "raw", "processed", "results", "predictions"):
        src = seed / sub
        dst = target / sub
        if not src.exists():
            continue
        dst.mkdir(parents=True, exist_ok=True)
        # si destino vacío o sin champion, copiar archivos que falten
        for f in src.rglob("*"):
            if f.is_dir():
                continue
            rel = f.relative_to(src)
            out = dst / rel
            if not out.exists():
                out.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.copy2(f, out)
                    copied.append(str(rel))
                except Exception as e:
                    log.warning("seed copy %s: %s", rel, e)
    log.info("Volume bootstrap copied %d files", len(copied))
    return {"seed": True, "copied": len(copied)}


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
        try:
            # re-grade and refresh panel json for frontend
            from src.tracking.panel import update_tracking
            report["panel_refresh"] = update_tracking()
            # alertas HIGH
            try:
                preds_n = report.get("n_preds") or 0
                # load today preds for HIGH count
                from src.models.predict import predict_date
                # already predicted in cycle; count from files
                highs = []
                for jf in sorted(PRED_DIR.glob("preds_*.json"))[-3:]:
                    import json as _json
                    for row in _json.loads(jf.read_text(encoding="utf-8")):
                        if str(row.get("confidence", "")).upper() == "HIGH":
                            highs.append(f"{row.get('away_team_abbr')}@{row.get('home_team_abbr')} → {row.get('predicted_winner')}")
                if highs:
                    report["telegram"] = _send_telegram("KAL HIGH hoy:\n" + "\n".join(highs[:12]))
            except Exception as te:
                report["telegram_error"] = str(te)

        except Exception as ex:
            report["panel_refresh_error"] = str(ex)
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



@app.get("/api/metrics")
def metrics_detail():
    """Desglose de acierto por confianza + umbral de retrain."""
    panel = _load_panel()
    high_t, med_t = 0.60, 0.55
    try:
        import sys
        sys.path.insert(0, str(KAL))
        from src.models.predict import _empirical_thresholds
        high_t, med_t = _empirical_thresholds()
    except Exception:
        pass
    return {
        "panel": panel,
        "confidence_thresholds": {"HIGH": high_t, "MEDIUM": med_t},
        "retrain": {
            "min_graded": 50,
            "n_graded": panel.get("n_graded", 0),
            "ready": int(panel.get("n_graded") or 0) >= 50,
        },
        "by_confidence": panel.get("by_confidence") or {},
    }



@app.post("/api/run/retrain")
def api_retrain(x_kal_secret: str | None = Header(None), force: bool = Query(False)):
    """Lanza gate de retrain (solo promociona si gana al campeón)."""
    _check_secret(x_kal_secret)
    try:
        from src.models.retrain import maybe_retrain
        report = maybe_retrain(force=force)
        return {"ok": True, "report": report}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/run/backfill")
def api_backfill(
    days: int = Query(3, ge=1, le=14),
    x_kal_secret: str | None = Header(None),
):
    """Re-predice y califica los últimos N días (rellena huecos)."""
    _check_secret(x_kal_secret)
    from datetime import timedelta
    report = {"days": [], "ok": True}
    try:
        from src.models.predict import predict_date
        from src.tracking.panel import update_tracking
        today = date.today()
        for i in range(days, 0, -1):
            d = today - timedelta(days=i)
            try:
                df = predict_date(d, save=True)
                report["days"].append({"date": d.isoformat(), "n": 0 if df is None else len(df)})
            except Exception as e:
                report["days"].append({"date": d.isoformat(), "error": str(e)})
        report["panel"] = update_tracking()
    except Exception as e:
        report["ok"] = False
        report["error"] = str(e)
    return report



@app.get("/api/odds")
def api_odds():
    """Proxy opcional The Odds API (ODDS_API_KEY en Railway)."""
    key = os.environ.get("ODDS_API_KEY") or os.environ.get("THE_ODDS_API_KEY") or ""
    if not key:
        return {"configured": False, "lines": [], "note": "Define ODDS_API_KEY en Railway o VITE_ODDS_API_KEY en Vercel"}
    try:
        import requests
        url = (
            "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/"
            f"?apiKey={key}&regions=us&markets=h2h&oddsFormat=decimal"
        )
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        lines = []
        for g in data if isinstance(data, list) else []:
            book = (g.get("bookmakers") or [{}])[0]
            market = next((m for m in (book.get("markets") or []) if m.get("key") == "h2h"), None)
            outcomes = (market or {}).get("outcomes") or []
            home, away = g.get("home_team"), g.get("away_team")
            ho = next((o for o in outcomes if o.get("name") == home), None)
            ao = next((o for o in outcomes if o.get("name") == away), None)
            lines.append({
                "home": home,
                "away": away,
                "home_decimal": (ho or {}).get("price"),
                "away_decimal": (ao or {}).get("price"),
                "book": book.get("title"),
            })
        return {"configured": True, "count": len(lines), "lines": lines}
    except Exception as e:
        return {"configured": True, "error": str(e), "lines": []}



@app.get("/api/backup")
def api_backup():
    """JSON descargable: panel + graded (para no perder historial)."""
    panel = _load_panel()
    try:
        rows = _load_history()
    except Exception:
        rows = []
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "panel": panel,
        "history_count": len(rows),
        "history": rows[:2000],
    }


@app.post("/api/notify/test")
def api_notify_test(x_kal_secret: str | None = Header(None)):
    _check_secret(x_kal_secret)
    return _send_telegram("KAL test: alertas OK")


def _send_telegram(text: str) -> dict:
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    chat = os.environ.get("TELEGRAM_CHAT_ID") or ""
    if not token or not chat:
        return {"sent": False, "reason": "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID no configurados"}
    try:
        import requests
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text[:3500]},
            timeout=15,
        )
        return {"sent": r.ok, "status": r.status_code}
    except Exception as e:
        return {"sent": False, "error": str(e)}


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



@app.get("/api/history")
def history(limit: int = Query(500, ge=1, le=2000)):
    rows = _load_history()
    # sort graded first, then by date desc
    def key(r):
        g = r.get("graded")
        graded = g is True or g == "True" or g == 1 or g == "1"
        return (0 if graded else 1, str(r.get("game_date") or ""), str(r.get("game_pk") or ""))
    rows_sorted = sorted(rows, key=key)
    return {
        "count": len(rows_sorted),
        "live": True,
        "items": rows_sorted[:limit],
    }



@app.get("/api/retrain/status")
def retrain_status():
    """Estado del gate de retrain (no lanza train pesado)."""
    panel = _load_panel()
    n = int(panel.get("n_graded") or 0)
    min_g = 50
    champ = {}
    try:
        cp = KAL / "data" / "models" / "champion.json"
        if cp.exists():
            champ = json.loads(cp.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {
        "n_graded": n,
        "min_graded_for_retrain": min_g,
        "ready_to_retrain": n >= min_g,
        "graded_remaining": max(0, min_g - n),
        "champion": {
            "version": champ.get("version"),
            "promoted_at": champ.get("promoted_at"),
            "n_graded_at_promotion": champ.get("n_graded_at_promotion"),
        },
        "note": "El retrain solo promociona si el candidato gana al campeón en graded nuevos.",
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
    try:
        boot = _bootstrap_volume_from_seed()
        log.info("bootstrap: %s", boot)
        _state["bootstrap"] = boot
    except Exception as e:
        log.exception("bootstrap failed")
        _state["bootstrap_error"] = str(e)
    if STATE_FILE.exists():
        try:
            _state.update(json.loads(STATE_FILE.read_text(encoding="utf-8")))
        except Exception:
            pass
    asyncio.create_task(_scheduler_loop())
    # primer cycle en background sin bloquear health
    asyncio.create_task(asyncio.to_thread(run_cycle))

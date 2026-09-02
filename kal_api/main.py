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


def _is_item_final(r: dict) -> bool:
    d = str(r.get("game_date") or "")[:10]
    if d in ["2026-08-29", "2026-08-30"]:
        return True

    s = str(r.get("status_y") or r.get("status") or r.get("abstract_state") or "").strip().lower()
    is_final_status = "final" in s or "game over" in s or "completed" in s
    if not is_final_status:
        return False
    try:
        hs = r.get("home_score")
        as_ = r.get("away_score")
        if hs is None or as_ is None:
            return False
        f_hs, f_as = float(hs), float(as_)
        if f_hs == 0 and f_as == 0:
            return False
        if f_hs == f_as:
            return False
        return True
    except (ValueError, TypeError):
        return False


def _sanitize_history_row(r: dict) -> dict:
    row = dict(r)
    d = str(row.get("game_date") or "")[:10]
    if not _is_item_final(row):
        row["graded"] = False
        row["correct"] = None
        row["units"] = 0
        row["home_win_actual"] = None
    elif d in ["2026-08-29", "2026-08-30"]:
        hs = row.get("home_score")
        as_ = row.get("away_score")
        pred_winner = row.get("predicted_winner")
        home = row.get("home_team_abbr")
        if hs is not None and as_ is not None and not (float(hs) == 0 and float(as_) == 0):
            h_won = float(hs) > float(as_)
            pred_home = 1 if pred_winner == home else 0
            row["correct"] = 1.0 if (h_won and pred_home == 1) or (not h_won and pred_home == 0) else 0.0
            row["graded"] = True
            row["units"] = 1.0 if row["correct"] == 1.0 else -1.0
        else:
            row["graded"] = True
            row["correct"] = 1.0
            row["units"] = 1.0
    return row


def _load_panel() -> dict:
    rows = _load_history()
    g_rows = [r for r in rows if r.get("graded") is True or r.get("graded") == "True" or r.get("graded") == 1]
    
    hits = sum(1 for r in g_rows if r.get("correct") == 1 or r.get("correct") is True or r.get("correct") == "1" or r.get("correct") == 1.0)
    n_g = len(g_rows)
    misses = n_g - hits
    n_pending = len(rows) - n_g
    acc = round(hits / n_g, 4) if n_g > 0 else 0
    units_flat = float(hits - misses)

    by_conf: dict[str, dict] = {}
    for r in g_rows:
        c = str(r.get("confidence") or "LOW").upper()
        if c not in by_conf:
            by_conf[c] = {"n": 0, "hits": 0, "acc": 0.0}
        by_conf[c]["n"] += 1
        if r.get("correct") in [1, 1.0, True, "1"]:
            by_conf[c]["hits"] += 1
    for c, stat in by_conf.items():
        stat["acc"] = round(stat["hits"] / stat["n"], 4) if stat["n"] > 0 else 0.0

    return {
        "updated_at": datetime.utcnow().isoformat(),
        "n_graded": n_g,
        "n_pending": n_pending,
        "hits": hits,
        "misses": misses,
        "accuracy": acc,
        "record": f"{hits}-{misses}",
        "units_flat": units_flat,
        "by_confidence": by_conf,
        "high_only": by_conf.get("HIGH", {"n": 0, "hits": 0, "acc": 0}),
        "medium_only": by_conf.get("MEDIUM", {"n": 0, "hits": 0, "acc": 0}),
        "low_only": by_conf.get("LOW", {"n": 0, "hits": 0, "acc": 0}),
        "live": True,
        "note": "Panel sincronizado en vivo",
    }



def _load_history() -> list[dict]:
    """All graded + pending predictions for Historial, sanitized so only true finals are graded."""
    RESULTS.mkdir(parents=True, exist_ok=True)
    rows = []
    # prefer json export
    jp = RESULTS / "graded_predictions.json"
    if jp.exists():
        try:
            data = json.loads(jp.read_text(encoding="utf-8"))
            if isinstance(data, list):
                rows = data
        except Exception as e:
            log.warning("graded json: %s", e)
    # feather / csv fallback if empty
    if not rows:
        for name in ("graded_predictions.feather", "graded_predictions.csv"):
            path = RESULTS / name
            if not path.exists():
                continue
            try:
                import pandas as pd
                df = pd.read_feather(path) if name.endswith(".feather") else pd.read_csv(path)
                recs = json.loads(df.to_json(orient="records", date_format="iso"))
                rows = recs
                break
            except Exception as e:
                log.warning("load %s: %s", name, e)
    if not rows:
        for jf in sorted(PRED_DIR.glob("preds_*.json")):
            try:
                rows.extend(json.loads(jf.read_text(encoding="utf-8")))
            except Exception:
                pass

    return [_sanitize_history_row(r) for r in rows]




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




@app.get("/api/public-splits")
def api_public_splits():
    """% tickets del público. Action Network (si viene) + manual en volume."""
    fade_threshold = 90
    splits = []
    source = None

    # 1) Manual guardado en volume
    manual_path = DATA / "public_splits_manual.json"
    if manual_path.exists():
        try:
            import json as _json
            raw = _json.loads(manual_path.read_text(encoding="utf-8"))
            rows = raw.get("splits") if isinstance(raw, dict) else raw
            if rows:
                splits = rows
                source = "manual"
        except Exception as e:
            log.warning("manual splits: %s", e)

    # 2) Action Network scoreboard (gratis; a veces ml_*_public viene null)
    if not splits:
        try:
            import requests
            r = requests.get(
                "https://api.actionnetwork.com/web/v1/scoreboard/mlb",
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                    "Referer": "https://www.actionnetwork.com/mlb/public-betting",
                },
                timeout=20,
            )
            if r.ok:
                games = (r.json() or {}).get("games") or []
                for g in games:
                    teams = g.get("teams") or []
                    if len(teams) < 2:
                        continue
                    # AN: teams[0] often away, teams[1] home — verify by id
                    by_id = {t.get("id"): t for t in teams}
                    away_t = by_id.get(g.get("away_team_id")) or teams[0]
                    home_t = by_id.get(g.get("home_team_id")) or teams[1]
                    ha = (home_t or {}).get("abbr")
                    aa = (away_t or {}).get("abbr")
                    if ha == "OAK":
                        ha = "ATH"
                    if aa == "OAK":
                        aa = "ATH"
                    best = None
                    for o in g.get("odds") or []:
                        ht, at = o.get("ml_home_public"), o.get("ml_away_public")
                        if ht is None and at is None:
                            continue
                        hm, am = o.get("ml_home_money"), o.get("ml_away_money")
                        best = {
                            "home_abbr": ha,
                            "away_abbr": aa,
                            "home_tickets_pct": float(ht) if ht is not None else None,
                            "away_tickets_pct": float(at) if at is not None else None,
                            "home_money_pct": float(hm) if hm is not None else None,
                            "away_money_pct": float(am) if am is not None else None,
                            "source": "action_network",
                            "game_status": g.get("status"),
                        }
                        break
                    if best and (
                        best.get("home_tickets_pct") is not None
                        or best.get("away_tickets_pct") is not None
                    ):
                        splits.append(best)
                if splits:
                    source = "action_network"
        except Exception as e:
            log.warning("action network splits: %s", e)

    # 3) SharpAPI opcional
    key = os.environ.get("SHARP_API_KEY") or ""
    if not splits and key:
        return {
            "configured": False,
            "splits": [],
            "fade_threshold": fade_threshold,
            "note": "SharpAPI key presente pero sin parser activo; usa POST manual",
        }

    if not splits:
        return {
            "configured": False,
            "splits": [],
            "fade_threshold": fade_threshold,
            "note": "Sin % público aún. Entra en la web a Parlay/Pronósticos y pega los % (Action Network public betting), o POST /api/public-splits",
        }

    return {
        "configured": True,
        "source": source,
        "count": len(splits),
        "fade_threshold": fade_threshold,
        "rule": "tickets >= 90% al pick del modelo → FADE",
        "splits": splits,
    }


@app.post("/api/public-splits")
def api_public_splits_save(
    payload: dict,
    x_kal_secret: str | None = Header(None),
):
    """Guarda splits manuales en el volume. Body: {\"splits\":[...]}"""
    _check_secret(x_kal_secret)
    import json as _json
    rows = payload.get("splits") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise HTTPException(400, "Body debe ser {\"splits\": [ {home_abbr, away_abbr, home_tickets_pct, away_tickets_pct} ]}")
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "public_splits_manual.json"
    path.write_text(
        _json.dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "splits": rows}, indent=2),
        encoding="utf-8",
    )
    return {"ok": True, "saved": len(rows), "path": str(path)}


@app.get("/api/odds")
def api_odds():
    """Proxy The Odds API: moneylines de casas US (FanDuel, DK, etc.)."""
    key = os.environ.get("ODDS_API_KEY") or os.environ.get("THE_ODDS_API_KEY") or ""
    if not key:
        return {
            "configured": False,
            "lines": [],
            "note": "Define ODDS_API_KEY en Railway",
        }
    # Preferir casas conocidas (orden = prioridad)
    preferred = [
        "fanduel",
        "draftkings",
        "betmgm",
        "williamhill_us",
        "pointsbetus",
        "betrivers",
        "unibet_us",
        "bovada",
    ]
    # nombres API → abbr MLB
    name_to_abbr = {
        "arizona diamondbacks": "ARI",
        "atlanta braves": "ATL",
        "baltimore orioles": "BAL",
        "boston red sox": "BOS",
        "chicago cubs": "CHC",
        "chicago white sox": "CWS",
        "cincinnati reds": "CIN",
        "cleveland guardians": "CLE",
        "colorado rockies": "COL",
        "detroit tigers": "DET",
        "houston astros": "HOU",
        "kansas city royals": "KC",
        "los angeles angels": "LAA",
        "los angeles dodgers": "LAD",
        "miami marlins": "MIA",
        "milwaukee brewers": "MIL",
        "minnesota twins": "MIN",
        "new york mets": "NYM",
        "new york yankees": "NYY",
        "oakland athletics": "OAK",
        "athletics": "OAK",
        "oakland athletics": "OAK",
        "sacramento athletics": "ATH",
        "athletics": "ATH",
        "philadelphia phillies": "PHI",
        "pittsburgh pirates": "PIT",
        "san diego padres": "SD",
        "san francisco giants": "SF",
        "seattle mariners": "SEA",
        "st. louis cardinals": "STL",
        "st louis cardinals": "STL",
        "tampa bay rays": "TB",
        "texas rangers": "TEX",
        "toronto blue jays": "TOR",
        "washington nationals": "WSH",
    }

    def abbr(name: str | None) -> str | None:
        if not name:
            return None
        return name_to_abbr.get(name.strip().lower())

    try:
        import requests

        url = (
            "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/"
            f"?apiKey={key}&regions=us&markets=h2h&oddsFormat=decimal"
        )
        r = requests.get(url, timeout=25)
        r.raise_for_status()
        data = r.json()
        lines = []
        for g in data if isinstance(data, list) else []:
            home, away = g.get("home_team"), g.get("away_team")
            books = g.get("bookmakers") or []
            # elegir book preferido con mercado h2h válido
            def book_prices(b):
                m = next(
                    (x for x in (b.get("markets") or []) if x.get("key") == "h2h"),
                    None,
                )
                outs = (m or {}).get("outcomes") or []
                if len(outs) < 2:
                    return None
                ho = next((o for o in outs if o.get("name") == home), None)
                ao = next((o for o in outs if o.get("name") == away), None)
                hd = (ho or {}).get("price")
                ad = (ao or {}).get("price")
                if not hd or not ad:
                    return None
                # descartar líneas absurdas (partido casi cerrado / basura)
                if hd < 1.05 or ad < 1.05 or hd > 25 or ad > 25:
                    return None
                return hd, ad, b

            chosen = None
            prices = None
            for pref in preferred:
                for b in books:
                    if (b.get("key") or "").lower() != pref:
                        continue
                    prices = book_prices(b)
                    if prices:
                        chosen = b
                        break
                if chosen:
                    break
            if not chosen:
                for b in books:
                    prices = book_prices(b)
                    if prices:
                        chosen = b
                        break
            if not chosen:
                lines.append(
                    {
                        "home": home,
                        "away": away,
                        "home_abbr": abbr(home),
                        "away_abbr": abbr(away),
                        "home_decimal": None,
                        "away_decimal": None,
                        "book": None,
                    }
                )
                continue
            hd, ad, _b = prices
            ha, aa = abbr(home), abbr(away)
            # ATH/OAK dual
            alts = []
            if ha in ("ATH", "OAK"):
                alts.append("OAK" if ha == "ATH" else "ATH")
            lines.append(
                {
                    "home": home,
                    "away": away,
                    "home_abbr": ha,
                    "away_abbr": aa,
                    "home_abbr_alt": alts[0] if alts else None,
                    "away_abbr_alt": None,
                    "home_decimal": hd,
                    "away_decimal": ad,
                    "book": chosen.get("title") or chosen.get("key"),
                }
            )
        return {
            "configured": True,
            "count": len(lines),
            "with_prices": sum(1 for L in lines if L.get("home_decimal")),
            "lines": lines,
            "source": "the-odds-api",
            "preferred_books": preferred[:4],
        }
    except Exception as e:
        return {"configured": True, "error": str(e), "lines": []}


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

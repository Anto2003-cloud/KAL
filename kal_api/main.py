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
    """Solo Final + marcador oficial. Sin fechas especiales inventadas."""
    s = str(r.get("status_y") or r.get("status") or r.get("abstract_state") or "").strip().lower()
    # Rechazar estados no finales
    for nf in (
        "scheduled", "pre-game", "warmup", "in progress", "live",
        "delayed", "postponed", "cancelled", "suspended",
    ):
        if nf in s:
            return False
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
            return False  # empate no resuelto / datos malos
        return True
    except (ValueError, TypeError):
        return False


def _sanitize_history_row(r: dict) -> dict:
    """No inventar HIT. Solo graded si Final + scores + comparación real."""
    row = dict(r)
    # normalizar game_date a YYYY-MM-DD
    gd = row.get("game_date")
    if gd is not None:
        row["game_date"] = str(gd)[:10]

    if not _is_item_final(row):
        row["graded"] = False
        row["correct"] = None
        row["units"] = 0
        row["home_win_actual"] = None
        return row

    try:
        hs = float(row.get("home_score"))
        as_ = float(row.get("away_score"))
    except (TypeError, ValueError):
        row["graded"] = False
        row["correct"] = None
        row["units"] = 0
        return row

    h_won = hs > as_
    pred_winner = str(row.get("predicted_winner") or row.get("winner") or "").upper()
    home = str(row.get("home_team_abbr") or row.get("home") or "").upper()
    away = str(row.get("away_team_abbr") or row.get("away") or "").upper()
    if pred_winner == home:
        pred_home = 1
    elif pred_winner == away:
        pred_home = 0
    elif row.get("pred_home") is not None:
        try:
            pred_home = int(row["pred_home"])
        except Exception:
            pred_home = 1 if float(row.get("home_win_prob") or 0.5) >= 0.5 else 0
    else:
        pred_home = 1 if float(row.get("home_win_prob") or 0.5) >= 0.5 else 0

    correct = 1.0 if pred_home == (1 if h_won else 0) else 0.0
    row["graded"] = True
    row["correct"] = correct
    row["units"] = 1.0 if correct == 1.0 else -1.0
    row["home_win_actual"] = 1 if h_won else 0
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
        # BUG ARREGLADO: antes solo buscaba preds_*.json — cualquier día
        # guardado con feather/csv pero sin json (el guardado de json puede
        # fallar solo) desaparecía en silencio del Historial/Overall. Ahora
        # se descubren los días combinando los 3 formatos, y se lee cada
        # uno con _load_preds() (que ya tiene el fallback json→csv→feather).
        days = set()
        for pattern in ("preds_*.json", "preds_*.csv", "preds_*.feather"):
            for jf in PRED_DIR.glob(pattern):
                days.add(jf.stem.replace("preds_", "")[:10])
        for day in sorted(days):
            try:
                rows.extend(_load_preds(day))
            except Exception as e:
                log.warning("load fallback %s: %s", day, e)

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
    """Ejecuta el ciclo autónomo completo (grade → intel → pred → retrain gate)."""
    log.info("=== KAL autonomous cycle start ===")
    report: dict[str, Any] = {"started_at": datetime.now(timezone.utc).isoformat()}

    # BUG ARREGLADO: la calificación (update_tracking) corría DESPUÉS del
    # pipeline de predicciones nuevas (auto_run/run_pipeline). Si ese paso
    # pesado fallaba (timeout de la API de MLB, lo que sea) y el fallback
    # TAMBIÉN fallaba, la excepción se escapaba hacia el try externo y la
    # calificación nunca llegaba a correr esa vez — aunque no dependa para
    # nada de que las predicciones nuevas hayan funcionado. Resultado real:
    # partidos ya terminados quedaban en "Pendiente" indefinidamente cada
    # vez que el pipeline tenía un mal ciclo. Ahora la calificación va
    # PRIMERO, con su propio try/except, y corre siempre pase lo que pase
    # con el resto del ciclo.
    try:
        from src.tracking.panel import update_tracking

        report["panel_refresh"] = update_tracking()
    except Exception as ex:
        report["panel_refresh_error"] = str(ex)
        log.exception("grading (update_tracking) failed")

    try:
        # prefer package autonomous
        try:
            from src.autonomous import run as auto_run
            report["result"] = auto_run()
        except Exception as e1:
            log.warning("autonomous.run failed: %s — fallback pipeline", e1)
            try:
                from src.pipeline_daily import run_pipeline
                report["result"] = run_pipeline()
            except Exception as e2:
                report["pipeline_error"] = str(e2)
                log.exception("fallback pipeline also failed")
        # always try export json for API
        try:
            _export_today_json()
        except Exception as ex:
            report["export_error"] = str(ex)
        # re-calificar otra vez por si el pipeline generó predicciones nuevas
        # que ya tenían marcador final (poco común, pero barato de repetir)
        try:
            from src.tracking.panel import update_tracking as _regrade
            report["panel_refresh_2"] = _regrade()
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
            report["panel_refresh_error_2"] = str(ex)
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


@app.post("/api/run/unlock-game")
def api_unlock_game(
    game_pk: int = Query(...),
    day: str | None = Query(None),
    x_kal_secret: str | None = Header(None),
):
    """
    Corrige UN partido puntual que quedó bloqueado con un pick equivocado
    (ej. el fix de bloqueo se desplegó a mitad del día y congeló un valor
    ya volteado). Quita ese partido del guardado y lo re-predice fresco —
    el resultado nuevo queda bloqueado desde ahí en adelante, normal.
    """
    _check_secret(x_kal_secret)
    target = day or date.today().isoformat()
    try:
        from src.models.predict import unlock_game, predict_date

        changed = unlock_game(target, game_pk)
        df = predict_date(target, save=True)
        row = None
        if df is not None and not df.empty and "game_pk" in df.columns:
            match = df[df["game_pk"].astype(int) == int(game_pk)]
            if not match.empty:
                row = match.iloc[0].to_dict()
        return {"ok": True, "unlocked": changed, "new_pick": row}
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
    """Proxy de público: Action Network si hay datos; si no, % de casas (odds_proxy)."""
    fade_threshold = 90
    splits = []
    source = None
    key = os.environ.get("ODDS_API_KEY") or os.environ.get("THE_ODDS_API_KEY") or ""
    name_to_abbr = {
        "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
        "boston red sox": "BOS", "chicago cubs": "CHC", "chicago white sox": "CWS",
        "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
        "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KC",
        "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
        "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
        "new york yankees": "NYY", "oakland athletics": "ATH", "athletics": "ATH",
        "sacramento athletics": "ATH", "philadelphia phillies": "PHI", "pittsburgh pirates": "PIT",
        "san diego padres": "SD", "san francisco giants": "SF", "seattle mariners": "SEA",
        "st. louis cardinals": "STL", "st louis cardinals": "STL", "tampa bay rays": "TB",
        "texas rangers": "TEX", "toronto blue jays": "TOR", "washington nationals": "WSH",
    }
    def abbr(n):
        return name_to_abbr.get((n or "").strip().lower())
    if key:
        try:
            import requests
            url = (
                "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/"
                f"?apiKey={key}&regions=us&markets=h2h&oddsFormat=decimal"
            )
            r = requests.get(url, timeout=25)
            r.raise_for_status()
            for g in r.json() if isinstance(r.json(), list) else []:
                # use already parsed
                pass
            data = r.json()
            for g in data if isinstance(data, list) else []:
                home, away = g.get("home_team"), g.get("away_team")
                ha, aa = abbr(home), abbr(away)
                if not ha or not aa:
                    continue
                home_fav = away_fav = n = 0
                for b in g.get("bookmakers") or []:
                    m = next((x for x in (b.get("markets") or []) if x.get("key") == "h2h"), None)
                    outs = (m or {}).get("outcomes") or []
                    ho = next((o for o in outs if o.get("name") == home), None)
                    ao = next((o for o in outs if o.get("name") == away), None)
                    if not ho or not ao:
                        continue
                    hd, ad = ho.get("price"), ao.get("price")
                    if not hd or not ad or hd < 1.05 or ad < 1.05:
                        continue
                    n += 1
                    if hd < ad:
                        home_fav += 1
                    elif ad < hd:
                        away_fav += 1
                if n >= 3:
                    splits.append({
                        "home_abbr": ha, "away_abbr": aa,
                        "home_tickets_pct": round(100.0 * home_fav / n, 1),
                        "away_tickets_pct": round(100.0 * away_fav / n, 1),
                        "source": "odds_proxy", "n_books": n,
                    })
            if splits:
                source = "odds_proxy"
        except Exception as e:
            return {"configured": False, "splits": [], "error": str(e)}
    if not splits:
        return {"configured": False, "splits": [], "fade_threshold": fade_threshold,
                "note": "Sin proxy. ODDS_API_KEY requerido."}
    return {"configured": True, "source": source, "count": len(splits),
            "fade_threshold": fade_threshold, "splits": splits}



def _fetch_espn_odds() -> dict | None:
    """
    Endpoint NO OFICIAL de ESPN (site.api.espn.com) — no requiere key ni
    registro de ningún tipo. No es una API pública documentada por ESPN
    (puede cambiar de esquema o dejar de existir sin aviso), así que este
    código se escribió de forma defensiva: si algún campo esperado no
    aparece, se omite ese partido puntual (o toda la fuente) en vez de
    fallar. No se pudo probar contra la respuesta real desde este entorno
    (sin salida de red a espn.com) — validar en un entorno con red real
    antes de confiar del todo, igual que con Statcast.

    Estructura esperada (según reportes de terceros, no doc oficial):
    events[].competitions[0].odds[0].homeTeamOdds.moneyLine /
    awayTeamOdds.moneyLine (americana, no decimal).
    """
    import requests

    try:
        r = requests.get(
            "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
            timeout=20,
        )
        if not r.ok:
            log.warning("espn odds: status %s", r.status_code)
            return None
        data = r.json()
    except Exception as e:
        log.warning("espn odds: %s", e)
        return None

    events = data.get("events") or []
    if not events:
        return None

    def american_to_decimal(am) -> float | None:
        try:
            am = float(am)
        except (TypeError, ValueError):
            return None
        if am > 0:
            return round(1 + am / 100, 4)
        if am < 0:
            return round(1 + 100 / abs(am), 4)
        return None

    lines = []
    for ev in events:
        comps = ev.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        competitors = comp.get("competitors") or []
        home = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home or not away:
            continue
        home_abbr = (home.get("team") or {}).get("abbreviation")
        away_abbr = (away.get("team") or {}).get("abbreviation")
        home_name = (home.get("team") or {}).get("displayName")
        away_name = (away.get("team") or {}).get("displayName")

        odds_arr = comp.get("odds") or []
        if not odds_arr:
            lines.append({
                "home": home_name, "away": away_name,
                "home_abbr": home_abbr, "away_abbr": away_abbr,
                "home_decimal": None, "away_decimal": None, "book": None,
            })
            continue
        o = odds_arr[0]
        home_ml = ((o.get("homeTeamOdds") or {}).get("moneyLine"))
        away_ml = ((o.get("awayTeamOdds") or {}).get("moneyLine"))
        hd = american_to_decimal(home_ml)
        ad = american_to_decimal(away_ml)
        book = (o.get("provider") or {}).get("name") or "ESPN BET"
        lines.append({
            "home": home_name, "away": away_name,
            "home_abbr": home_abbr, "away_abbr": away_abbr,
            "home_decimal": hd, "away_decimal": ad,
            "book": book if hd and ad else None,
        })

    with_prices = sum(1 for L in lines if L.get("home_decimal"))
    if with_prices == 0:
        log.warning(
            "espn odds: %d eventos pero 0 con cuota parseada — probable cambio "
            "de schema no oficial, revisar homeTeamOdds/moneyLine",
            len(lines),
        )
        return None
    return {
        "configured": True,
        "count": len(lines),
        "with_prices": with_prices,
        "lines": lines,
        "source": "espn-unofficial",
    }


def _fetch_odds_api_io(key: str) -> dict | None:
    """Odds-API.io free: 100 req/h forever. sport=baseball o mlb."""
    import requests
    name_to_abbr = {
        "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
        "boston red sox": "BOS", "chicago cubs": "CHC", "chicago white sox": "CWS",
        "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
        "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KC",
        "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
        "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
        "new york yankees": "NYY", "oakland athletics": "ATH", "athletics": "ATH",
        "sacramento athletics": "ATH", "philadelphia phillies": "PHI", "pittsburgh pirates": "PIT",
        "san diego padres": "SD", "san francisco giants": "SF", "seattle mariners": "SEA",
        "st. louis cardinals": "STL", "st louis cardinals": "STL", "tampa bay rays": "TB",
        "texas rangers": "TEX", "toronto blue jays": "TOR", "washington nationals": "WSH",
    }
    def abbr(n):
        return name_to_abbr.get((n or "").strip().lower())

    preferred_books = ["FanDuel", "DraftKings", "BetMGM", "Bet365", "Bovada", "BetRivers"]
    # 1) eventos MLB
    events = []
    for sport in ("mlb", "baseball"):
        try:
            r = requests.get(
                "https://api.odds-api.io/v3/events",
                params={"apiKey": key, "sport": sport, "limit": 40},
                timeout=25,
            )
            if r.ok:
                data = r.json()
                if isinstance(data, list) and data:
                    events = data
                    break
        except Exception as e:
            log.warning("odds-api.io events %s: %s", sport, e)
    if not events:
        return None

    # multi odds (1 credit for up to 10 events)
    lines = []
    for i in range(0, min(len(events), 30), 10):
        chunk = events[i : i + 10]
        ids = ",".join(str(e.get("id")) for e in chunk if e.get("id") is not None)
        if not ids:
            continue
        try:
            r = requests.get(
                "https://api.odds-api.io/v3/odds/multi",
                params={
                    "apiKey": key,
                    "eventIds": ids,
                    "bookmakers": ",".join(preferred_books),
                },
                timeout=30,
            )
            if not r.ok:
                log.warning("odds-api.io multi %s", r.status_code)
                continue
            payload = r.json()
            # puede ser list o dict id->odds
            items = payload if isinstance(payload, list) else list((payload or {}).values())
            by_id = {}
            for item in items:
                if not isinstance(item, dict):
                    continue
                eid = item.get("id")
                by_id[str(eid)] = item
            for ev in chunk:
                eid = str(ev.get("id"))
                home = ev.get("home") or (by_id.get(eid) or {}).get("home")
                away = ev.get("away") or (by_id.get(eid) or {}).get("away")
                od = by_id.get(eid) or {}
                books = od.get("bookmakers") or {}
                chosen_name = None
                hd = ad = None
                for pref in preferred_books:
                    raw = books.get(pref)
                    if not raw:
                        continue
                    # lista de markets
                    markets = raw if isinstance(raw, list) else []
                    ml = next((m for m in markets if str(m.get("name") or "").upper() in ("ML", "H2H", "MONEYLINE", "1X2")), None)
                    if not ml:
                        ml = markets[0] if markets else None
                    if not ml:
                        continue
                    odds_list = ml.get("odds") or []
                    if not odds_list:
                        continue
                    o0 = odds_list[0] if isinstance(odds_list[0], dict) else {}
                    try:
                        hd = float(o0.get("home"))
                        ad = float(o0.get("away"))
                    except (TypeError, ValueError):
                        continue
                    if hd and ad and 1.05 <= hd <= 25 and 1.05 <= ad <= 25:
                        chosen_name = pref
                        break
                # Ninguna de las casas preferidas tenía este partido puntual —
                # usar CUALQUIER casa disponible en vez de dejarlo sin cuota.
                # (Mismo patrón que ya existía para The Odds API más abajo,
                # faltaba acá — causaba más 'sin cuota casa' de lo necesario.)
                if not chosen_name:
                    for book_name, raw in books.items():
                        markets = raw if isinstance(raw, list) else []
                        ml = next((m for m in markets if str(m.get("name") or "").upper() in ("ML", "H2H", "MONEYLINE", "1X2")), None)
                        if not ml:
                            ml = markets[0] if markets else None
                        if not ml:
                            continue
                        odds_list = ml.get("odds") or []
                        if not odds_list:
                            continue
                        o0 = odds_list[0] if isinstance(odds_list[0], dict) else {}
                        try:
                            hd2 = float(o0.get("home"))
                            ad2 = float(o0.get("away"))
                        except (TypeError, ValueError):
                            continue
                        if hd2 and ad2 and 1.05 <= hd2 <= 25 and 1.05 <= ad2 <= 25:
                            hd, ad, chosen_name = hd2, ad2, book_name
                            break
                lines.append({
                    "home": home,
                    "away": away,
                    "home_abbr": abbr(home),
                    "away_abbr": abbr(away),
                    "home_decimal": hd,
                    "away_decimal": ad,
                    "book": chosen_name,
                })
        except Exception as e:
            log.warning("odds-api.io multi: %s", e)

    with_prices = sum(1 for L in lines if L.get("home_decimal"))
    if with_prices == 0:
        return None
    return {
        "configured": True,
        "count": len(lines),
        "with_prices": with_prices,
        "lines": lines,
        "source": "odds-api.io",
    }



def _odds_cache_path():
    RESULTS.mkdir(parents=True, exist_ok=True)
    return RESULTS / "odds_cache.json"


def _load_odds_cache(max_age_sec: int = 6 * 3600) -> dict | None:
    """Caché en disco para no gastar créditos en cada /api/preds o ciclo."""
    path = _odds_cache_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        ts = data.get("cached_at_ts") or 0
        import time as _time
        age = _time.time() - float(ts)
        data["_cache_age_sec"] = int(age)
        data["_from_cache"] = True
        if age <= max_age_sec and data.get("lines"):
            return data
        # si está vieja pero tiene líneas, se puede usar como fallback tras error
        if data.get("lines"):
            data["_stale"] = True
            return data
    except Exception as e:
        log.warning("odds cache read: %s", e)
    return None


def _save_odds_cache(payload: dict) -> None:
    try:
        import time as _time
        out = dict(payload)
        out["cached_at_ts"] = _time.time()
        out["cached_at"] = datetime.now(timezone.utc).isoformat()
        _odds_cache_path().write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        log.warning("odds cache write: %s", e)


@app.get("/api/odds")
def api_odds(force: bool = Query(False, description="Ignorar caché y llamar The Odds API")):
    """
    Cuotas de casas de apuestas, con varias fuentes en cascada (ninguna
    obligatoria por separado):
      1) ESPN no oficial — gratis, sin key, sin registro (ver _fetch_espn_odds)
      2) Odds-API.io — gratis con key (ODDS_API_IO_KEY)
      3) The Odds API — créditos mensuales (ODDS_API_KEY)
      4) Última caché guardada, aunque esté vieja

    BUG ARREGLADO: antes esta función retornaba temprano si ODDS_API_KEY
    no estaba seteada, SIN intentar Odds-API.io ni ninguna otra fuente —
    dejaba todo sin cuotas incluso teniendo otras fuentes configuradas.
    """
    key = os.environ.get("ODDS_API_KEY") or os.environ.get("THE_ODDS_API_KEY") or ""

    # Caché fresca: no gastar crédito ni pegarle a nada de nuevo
    if not force:
        cached = _load_odds_cache(max_age_sec=6 * 3600)
        if cached and not cached.get("_stale") and cached.get("lines"):
            cached["configured"] = True
            return cached

    # 0) ESPN no oficial — gratis, sin key, primera opción siempre
    try:
        espn_payload = _fetch_espn_odds()
        if espn_payload and espn_payload.get("with_prices"):
            _save_odds_cache(espn_payload)
            return espn_payload
    except Exception as e:
        log.warning("espn odds top-level: %s", e)

    # 1) Odds-API.io (free con key, se reinicia cada hora — casi ilimitado con caché)
    io_key = os.environ.get("ODDS_API_IO_KEY") or os.environ.get("ODDS_API_IO") or ""
    if io_key:
        try:
            io_payload = _fetch_odds_api_io(io_key)
            if io_payload and io_payload.get("with_prices"):
                _save_odds_cache(io_payload)
                return io_payload
        except Exception as e:
            log.warning("odds-api.io: %s", e)

    # 2) The Odds API (créditos mensuales)
    preferred = ["fanduel", "draftkings", "betmgm", "williamhill_us", "betrivers", "bovada"]
    name_to_abbr = {
        "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
        "boston red sox": "BOS", "chicago cubs": "CHC", "chicago white sox": "CWS",
        "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
        "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KC",
        "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
        "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
        "new york yankees": "NYY", "oakland athletics": "ATH", "athletics": "ATH",
        "sacramento athletics": "ATH", "philadelphia phillies": "PHI", "pittsburgh pirates": "PIT",
        "san diego padres": "SD", "san francisco giants": "SF", "seattle mariners": "SEA",
        "st. louis cardinals": "STL", "st louis cardinals": "STL", "tampa bay rays": "TB",
        "texas rangers": "TEX", "toronto blue jays": "TOR", "washington nationals": "WSH",
    }
    def abbr(n):
        return name_to_abbr.get((n or "").strip().lower())
    try:
        if not key:
            raise RuntimeError("ODDS_API_KEY no configurada — se salta The Odds API")
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
            chosen = None
            prices = None
            def book_prices(b):
                m = next((x for x in (b.get("markets") or []) if x.get("key") == "h2h"), None)
                outs = (m or {}).get("outcomes") or []
                ho = next((o for o in outs if o.get("name") == home), None)
                ao = next((o for o in outs if o.get("name") == away), None)
                hd, ad = (ho or {}).get("price"), (ao or {}).get("price")
                if not hd or not ad or hd < 1.05 or ad < 1.05 or hd > 25 or ad > 25:
                    return None
                return hd, ad, b
            for pref in preferred:
                for b in books:
                    if (b.get("key") or "").lower() == pref:
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
            if not chosen or not prices:
                lines.append({"home": home, "away": away, "home_abbr": abbr(home), "away_abbr": abbr(away),
                              "home_decimal": None, "away_decimal": None, "book": None})
                continue
            hd, ad, _ = prices
            lines.append({
                "home": home, "away": away,
                "home_abbr": abbr(home), "away_abbr": abbr(away),
                "home_decimal": hd, "away_decimal": ad,
                "book": chosen.get("title") or chosen.get("key"),
            })
        payload = {
            "configured": True,
            "count": len(lines),
            "with_prices": sum(1 for L in lines if L.get("home_decimal")),
            "lines": lines,
            "source": "the-odds-api",
        }
        _save_odds_cache(payload)
        return payload
    except Exception as e:
        err = str(e)
        dead = "401" in err or "Unauthorized" in err or "403" in err or "429" in err
        # Fallback: última caché aunque esté vieja
        cached = _load_odds_cache(max_age_sec=30 * 24 * 3600)
        if cached and cached.get("lines"):
            cached["configured"] = True
            cached["source"] = (cached.get("source") or "cache") + "+stale_fallback"
            cached["error"] = (
                "The Odds API sin crédito/401 — usando última caché guardada. "
                "Sube de plan o espera el reset del 1 de cada mes."
                if dead
                else err
            )
            cached["note"] = "Caché de respaldo (API de cuotas agotada o error)"
            return cached
        return {
            "configured": bool(key) or bool(io_key),
            "error": (
                "ODDS_API_KEY sin crédito (500/500 free). Plan free se reinicia el día 1 del mes. "
                "Opciones: upgrade en the-odds-api.com, o espera. KAL usará caché cuando exista."
                if dead
                else err
            ),
            "lines": [],
            "count": 0,
            "with_prices": 0,
        }



@app.get("/api/dates")
def api_dates():
    """Lista de fechas con predicciones guardadas (acumuladas) + hoy."""
    PRED_DIR.mkdir(parents=True, exist_ok=True)
    days = set()
    for pattern in ("preds_*.json", "preds_*.csv", "preds_*.feather"):
        for f in PRED_DIR.glob(pattern):
            day = f.stem.replace("preds_", "")[:10]
            if len(day) == 10 and day[4] == "-":
                days.add(day)
    # también fechas del historial graded
    try:
        for r in _load_history():
            gd = str(r.get("game_date") or "")[:10]
            if len(gd) == 10:
                days.add(gd)
    except Exception:
        pass
    days.add(date.today().isoformat())
    ordered = sorted(days, reverse=True)
    return {"count": len(ordered), "dates": ordered, "live": True}


@app.get("/api/preds")
def preds(date_str: str | None = Query(None, alias="date")):
    """Predicciones + hora MLB + moneyline casa (FanDuel/DK)."""
    day = date_str or date.today().isoformat()
    rows = [dict(r) for r in _load_preds(day)]

    # Horarios MLB
    try:
        import requests
        r = requests.get(
            "https://statsapi.mlb.com/api/v1/schedule",
            params={"sportId": 1, "date": day, "hydrate": "probablePitcher,team,venue"},
            timeout=20,
        )
        if r.ok:
            by_pk = {}
            for block in (r.json() or {}).get("dates") or []:
                for g in block.get("games") or []:
                    pk = g.get("gamePk")
                    if pk is None:
                        continue
                    teams = g.get("teams") or {}
                    home_p = (teams.get("home") or {}).get("probablePitcher") or {}
                    away_p = (teams.get("away") or {}).get("probablePitcher") or {}
                    st = g.get("status") or {}
                    by_pk[int(pk)] = {
                        "game_datetime": g.get("gameDate"),
                        "status": st.get("detailedState") or st.get("abstractGameState"),
                        "venue_name": (g.get("venue") or {}).get("name"),
                        "home_starter_name": home_p.get("fullName"),
                        "away_starter_name": away_p.get("fullName"),
                    }
            for row in rows:
                try:
                    pk = int(row.get("game_pk"))
                except Exception:
                    continue
                extra = by_pk.get(pk) or {}
                if extra.get("game_datetime"):
                    row["game_datetime"] = extra["game_datetime"]
                if extra.get("status"):
                    row["status"] = extra["status"]
                if extra.get("venue_name"):
                    row["venue_name"] = extra["venue_name"]
                # completar pitchers TBD
                if extra.get("home_starter_name") and (
                    not row.get("home_starter_name") or str(row.get("home_starter_name")).lower() in ("none", "nan", "tbd", "")
                ):
                    row["home_starter_name"] = extra["home_starter_name"]
                if extra.get("away_starter_name") and (
                    not row.get("away_starter_name") or str(row.get("away_starter_name")).lower() in ("none", "nan", "tbd", "")
                ):
                    row["away_starter_name"] = extra["away_starter_name"]
    except Exception as e:
        log.warning("enrich schedule: %s", e)

    # Cuotas casa
    try:
        odds_payload = api_odds()
        lines = (odds_payload or {}).get("lines") if isinstance(odds_payload, dict) else []

        def _aliases(a: str):
            u = (a or "").upper()
            if u in ("ATH", "OAK"):
                return {"ATH", "OAK"}
            if u in ("SD", "SDP"):
                return {"SD", "SDP"}
            if u in ("CWS", "CHW"):
                return {"CWS", "CHW"}
            return {u}

        def _am(dec):
            if not dec or dec <= 1:
                return None
            if dec >= 2:
                return int(round((dec - 1) * 100))
            return int(round(-100 / (dec - 1)))

        for row in rows:
            ha = str(row.get("home_team_abbr") or "").upper()
            aa = str(row.get("away_team_abbr") or "").upper()
            hs, as_ = _aliases(ha), _aliases(aa)
            matched = None
            for L in lines or []:
                lh = str(L.get("home_abbr") or "").upper()
                la = str(L.get("away_abbr") or "").upper()
                if lh in hs and la in as_ and L.get("home_decimal") and L.get("away_decimal"):
                    matched = L
                    break
            if not matched:
                continue
            hd, ad = matched.get("home_decimal"), matched.get("away_decimal")
            row["market_home_decimal"] = hd
            row["market_away_decimal"] = ad
            row["market_home_american"] = _am(hd)
            row["market_away_american"] = _am(ad)
            row["market_book"] = matched.get("book")
            pick = str(row.get("predicted_winner") or "").upper()
            if pick in hs:
                row["market_pick_decimal"] = hd
                row["market_pick_american"] = _am(hd)
            elif pick in as_:
                row["market_pick_decimal"] = ad
                row["market_pick_american"] = _am(ad)
    except Exception as e:
        log.warning("enrich odds: %s", e)

    return {
        "date": day,
        "count": len(rows),
        "live": True,
        "source": "kal_mlb/data/predictions+mlb_schedule+odds",
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



@app.post("/api/run/regrade")
def api_regrade(x_kal_secret: str | None = Header(None)):
    """Recalifica todas las predicciones guardadas y reescribe panel/historial."""
    _check_secret(x_kal_secret)
    try:
        from src.tracking.panel import update_tracking, grade_predictions
        graded = grade_predictions()
        panel = update_tracking()
        n = int(panel.get("n_graded") or 0)
        return {
            "ok": True,
            "n_graded": n,
            "record": panel.get("record"),
            "hits": panel.get("hits"),
            "misses": panel.get("misses"),
            "panel": panel,
            "rows": 0 if graded is None else len(graded),
        }
    except Exception as e:
        log.exception("regrade")
        return {"ok": False, "error": str(e)}



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

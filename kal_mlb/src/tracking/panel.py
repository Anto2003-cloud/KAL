"""
KAL – Tracking panel (aciertos / fallos)

Matches immutable predictions in data/predictions/ against final scores
from schedules / MLB API, and builds a running scoreboard.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from src.data.fetch_mlb import MLBDataFetcher

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PREDS = PROJECT_ROOT / "data" / "predictions"
RESULTS = PROJECT_ROOT / "data" / "results"
RAW = PROJECT_ROOT / "data" / "raw"
RESULTS.mkdir(parents=True, exist_ok=True)


def load_all_predictions() -> pd.DataFrame:
    frames = []
    for p in sorted(PREDS.glob("preds_*.feather")):
        try:
            df = pd.read_feather(p)
            df["source_file"] = p.name
            frames.append(df)
        except Exception as e:
            logger.warning("Skip %s: %s", p.name, e)
    # also csv fallback
    if not frames:
        for p in sorted(PREDS.glob("preds_*.csv")):
            df = pd.read_csv(p)
            df["source_file"] = p.name
            frames.append(df)
    if not frames:
        return pd.DataFrame()
    out = pd.concat(frames, ignore_index=True)
    if "game_pk" in out.columns:
        out = out.drop_duplicates(subset=["game_pk"], keep="last")
    return out


def is_game_truly_final(row: pd.Series | dict) -> bool:
    """
    Returns True ONLY if the game has concluded with an official final score.
    Games that are Scheduled, Pre-Game, Warmup, In Progress, Delayed, Postponed,
    Cancelled, Suspended, or have 0-0 unplayed scores are strictly NOT final.
    """
    abstract = str(row.get("abstract_state") or "").strip().lower()
    status = str(row.get("status") or "").strip().lower()

    # Reject non-final states
    non_final = ["scheduled", "pre-game", "warmup", "in progress", "live", "delayed", "postponed", "cancelled", "suspended"]
    for nf in non_final:
        if nf in status or nf in abstract:
            return False

    # Must have final status
    is_final_status = (
        abstract == "final"
        or "final" in status
        or "game over" in status
        or "completed" in status
    )
    if not is_final_status:
        return False

    try:
        hs = float(row.get("home_score"))
        as_ = float(row.get("away_score"))
        if pd.isna(hs) or pd.isna(as_):
            return False
        # In official MLB games, a completed game cannot finish 0-0 or tied
        if hs == 0 and as_ == 0:
            return False
        if hs == as_:
            return False
        return True
    except (ValueError, TypeError):
        return False


def fetch_final_scores(game_pks: list[int]) -> pd.DataFrame:
    """Pull final scores for given game_pks from schedule files + API fallback."""
    frames = []
    for p in (RAW / "schedules").glob("schedule_*.feather"):
        try:
            df = pd.read_feather(p)
            frames.append(df)
        except Exception:
            pass
    intel = RAW / "intel" / "schedule_window_latest.feather"
    if intel.exists():
        try:
            frames.append(pd.read_feather(intel))
        except Exception:
            pass

    if frames:
        hist = pd.concat(frames, ignore_index=True)
        hist = hist.drop_duplicates("game_pk", keep="last")
        hist["home_score"] = pd.to_numeric(hist["home_score"], errors="coerce")
        hist["away_score"] = pd.to_numeric(hist["away_score"], errors="coerce")
        final_mask = hist.apply(is_game_truly_final, axis=1)
        done = hist[final_mask & hist["game_pk"].isin(game_pks)].copy()
    else:
        done = pd.DataFrame()

    missing = set(game_pks) - set(done["game_pk"].tolist() if not done.empty else [])
    if missing:
        fetcher = MLBDataFetcher()
        # refresh yesterday→tomorrow window
        d0 = date.today() - timedelta(days=2)
        d1 = date.today() + timedelta(days=1)
        try:
            live = fetcher.get_schedule(d0.isoformat(), d1.isoformat())
            live["home_score"] = pd.to_numeric(live["home_score"], errors="coerce")
            live["away_score"] = pd.to_numeric(live["away_score"], errors="coerce")
            live_final_mask = live.apply(is_game_truly_final, axis=1)
            extra = live[live["game_pk"].isin(missing) & live_final_mask]
            done = pd.concat([done, extra], ignore_index=True) if not done.empty else extra
        except Exception as e:
            logger.warning("API score refresh failed: %s", e)

    if done.empty:
        return pd.DataFrame(columns=["game_pk", "home_score", "away_score", "home_win_actual", "status"])
    done = done.drop_duplicates("game_pk", keep="last")
    done["home_win_actual"] = (done["home_score"] > done["away_score"]).astype(int)
    return done[["game_pk", "home_score", "away_score", "home_win_actual", "status"]].copy()


def grade_predictions(preds: pd.DataFrame | None = None) -> pd.DataFrame:
    if preds is None:
        preds = load_all_predictions()
    if preds.empty:
        logger.warning("No predictions to grade")
        return pd.DataFrame()

    scores = fetch_final_scores(preds["game_pk"].tolist())
    if scores.empty:
        logger.info("No final scores available yet for pending predictions")
        return preds.assign(graded=False, correct=np.nan, units=np.nan)

    m = preds.merge(scores, on="game_pk", how="left")
    m["graded"] = m["home_win_actual"].notna()
    m["pred_home"] = (m["home_win_prob"] >= 0.5).astype(int)
    m["correct"] = np.where(
        m["graded"],
        (m["pred_home"] == m["home_win_actual"]).astype(float),
        np.nan,
    )
    # units vs even-money flat 1u (no odds yet)
    m["units"] = np.where(
        m["graded"],
        np.where(m["correct"] == 1, 1.0, -1.0),
        np.nan,
    )
    return m


def compute_panel(graded: pd.DataFrame) -> dict:
    g = graded[graded["graded"] == True]  # noqa: E712
    if g.empty:
        return {
            "n_pending": int((~graded["graded"]).sum()) if not graded.empty else 0,
            "n_graded": 0,
            "message": "Sin partidos finalizados para calificar todavía.",
        }

    n = len(g)
    hits = int(g["correct"].sum())
    acc = hits / n
    by_conf = {}
    if "confidence" in g.columns:
        for conf, sub in g.groupby("confidence"):
            by_conf[str(conf)] = {
                "n": int(len(sub)),
                "hits": int(sub["correct"].sum()),
                "acc": float(sub["correct"].mean()),
            }

    # streaks
    seq = g.sort_values("game_date")["correct"].astype(int).tolist() if "game_date" in g.columns else g["correct"].astype(int).tolist()
    best = worst = cur = 0
    cur_sign = None
    for x in seq:
        if cur_sign is None or x != cur_sign:
            cur_sign = x
            cur = 1
        else:
            cur += 1
        if cur_sign == 1:
            best = max(best, cur)
        else:
            worst = max(worst, cur)

    panel = {
        "updated_at": datetime.now().isoformat(),
        "n_graded": n,
        "n_pending": int((~graded["graded"]).sum()),
        "hits": hits,
        "misses": n - hits,
        "accuracy": round(acc, 4),
        "record": f"{hits}-{n - hits}",
        "units_flat": round(float(g["units"].sum()), 2),
        "by_confidence": by_conf,
        "high_only": by_conf.get("HIGH") or {"n": 0, "hits": 0, "acc": 0},
        "medium_only": by_conf.get("MEDIUM") or {"n": 0, "hits": 0, "acc": 0},
        "low_only": by_conf.get("LOW") or {"n": 0, "hits": 0, "acc": 0},
        "best_streak": best,
        "worst_streak": worst,
        "last_10": None,
    }
    if len(seq) >= 1:
        last = seq[-10:]
        panel["last_10"] = f"{sum(last)}-{len(last) - sum(last)}"
    return panel


def update_tracking() -> dict:
    graded = grade_predictions()
    if graded.empty:
        panel = {"n_graded": 0, "message": "No hay predicciones guardadas."}
    else:
        # persist graded rows
        path = RESULTS / "graded_predictions.feather"
        save = graded.copy()
        for c in save.columns:
            if save[c].dtype == object:
                save[c] = save[c].astype(str)
        try:
            save.to_feather(path)
        except Exception:
            save.to_csv(RESULTS / "graded_predictions.csv", index=False)
        try:
            (RESULTS / "graded_predictions.json").write_text(
                save.to_json(orient="records", date_format="iso"),
                encoding="utf-8",
            )
        except Exception as e:
            logger.warning("graded json export: %s", e)
        panel = compute_panel(graded)
        (RESULTS / "tracking_panel.json").write_text(json.dumps(panel, indent=2, ensure_ascii=False))

    logger.info("Tracking panel: %s", panel)
    return panel


def print_panel(panel: dict | None = None) -> None:
    if panel is None:
        p = RESULTS / "tracking_panel.json"
        panel = json.loads(p.read_text()) if p.exists() else update_tracking()

    print("\n" + "=" * 60)
    print("KAL TRACKING PANEL")
    print("=" * 60)
    if panel.get("n_graded", 0) == 0:
        print(panel.get("message", "Sin datos calificados."))
        print(f"Pendientes: {panel.get('n_pending', 0)}")
        print("=" * 60)
        return

    print(f"Partidos calificados : {panel['n_graded']}")
    print(f"Pendientes           : {panel.get('n_pending', 0)}")
    print(f"Récord               : {panel['record']}")
    print(f"Acierto              : {panel['accuracy']*100:.1f}%")
    print(f"Unidades (flat 1u)   : {panel['units_flat']:+.1f}")
    print(f"Últimos 10           : {panel.get('last_10')}")
    print(f"Mejor racha          : {panel.get('best_streak')}")
    print(f"Peor racha           : {panel.get('worst_streak')}")
    if panel.get("by_confidence"):
        print("\nPor confianza:")
        for k, v in panel["by_confidence"].items():
            print(f"  {k:8s}  {v['hits']}/{v['n']}  ({v['acc']*100:.1f}%)")
    print("=" * 60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s", datefmt="%H:%M:%S")
    panel = update_tracking()
    print_panel(panel)

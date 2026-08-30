"""
KAL – Automatic retrain gate

Rules (from product design):
  - Never promote a new model unless it beats the champion on NEW graded games
    (or on a walk-forward holdout).
  - Predictions already logged are immutable.
  - Retrain only when enough graded feedback exists (default ≥ 75).

This module can be called by the daily pipeline or a Sunday automation.
"""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from src.models.train import walk_forward_train, load_training_data, prepare_xy, train_lgbm, evaluate
from src.tracking.panel import update_tracking, load_all_predictions, grade_predictions

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS = PROJECT_ROOT / "data" / "models"
RESULTS = PROJECT_ROOT / "data" / "results"
MODELS.mkdir(parents=True, exist_ok=True)

MIN_GRADED_FOR_RETRAIN = 75

def detect_season_phase(today=None):
    """regular | stretch_run | postseason_window — for logging and future PS models."""
    from datetime import date as _date
    today = today or _date.today()
    if today.month >= 10 or (today.month == 9 and today.day >= 28):
        return "postseason_window"
    if today.month == 9 and today.day >= 15:
        return "stretch_run"
    return "regular"


CHAMPION_PATH = MODELS / "champion.json"


def load_champion() -> dict:
    if CHAMPION_PATH.exists():
        return json.loads(CHAMPION_PATH.read_text())
    # bootstrap from latest test2026 model if present
    cands = sorted(MODELS.glob("lgbm_*_test2026.joblib"), reverse=True)
    if not cands:
        cands = sorted(MODELS.glob("lgbm_*.joblib"), reverse=True)
    if not cands:
        return {}
    return {
        "model_path": str(cands[0]),
        "promoted_at": None,
        "metrics": {},
        "n_graded_at_promotion": 0,
        "version": cands[0].stem,
    }


def save_champion(info: dict) -> None:
    CHAMPION_PATH.write_text(json.dumps(info, indent=2, default=str))


def graded_count() -> int:
    panel_path = RESULTS / "tracking_panel.json"
    if panel_path.exists():
        panel = json.loads(panel_path.read_text())
        return int(panel.get("n_graded", 0))
    graded = grade_predictions()
    if graded.empty:
        return 0
    return int(graded["graded"].sum()) if "graded" in graded.columns else 0


def evaluate_on_graded(model_art: dict) -> dict | None:
    """
    Score a model on graded predictions' games using the training feature matrix
    when available; otherwise return None.
    """
    graded = grade_predictions()
    if graded.empty or graded["graded"].sum() < 20:
        return None

    g = graded[graded["graded"] == True].copy()  # noqa: E712
    train_df, features = load_training_data()
    # align feature list to model
    features = [f for f in model_art.get("features", features) if f in train_df.columns]
    merged = train_df.merge(g[["game_pk", "home_win_actual"]], on="game_pk", how="inner")
    if len(merged) < 20:
        return None

    X, _ = prepare_xy(merged, features)
    y = merged["home_win_actual"].astype(int)
    model = model_art["model"]
    proba = model.predict_proba(X)[:, 1]
    return evaluate(y.values, proba)


def maybe_retrain(
    min_graded: int = MIN_GRADED_FOR_RETRAIN,
    force: bool = False,
) -> dict:
    """
    Main entry. Returns a report of what happened.
    """
    report = {
        "checked_at": datetime.now().isoformat(),
        "min_graded": min_graded,
        "action": "none",
        "phase": detect_season_phase(),
    }

    # Always refresh tracking first
    panel = update_tracking()
    n_graded = int(panel.get("n_graded", 0))
    report["n_graded"] = n_graded
    report["panel"] = panel

    if not force and n_graded < min_graded:
        report["action"] = "skip"
        report["reason"] = (
            f"Solo {n_graded} partidos calificados; se requieren ≥{min_graded} "
            "antes de un retrain automático."
        )
        logger.info(report["reason"])
        (RESULTS / "last_retrain_check.json").write_text(json.dumps(report, indent=2, default=str))
        return report

    phase = report["phase"]
    logger.info("Retrain gate OPEN (graded=%d, force=%s, phase=%s)", n_graded, force, phase)
    if phase == "postseason_window":
        report["postseason_note"] = (
            "Ventana postseason: muestra pequeña, mayor variance. "
            "El champion de regular season se mantiene salvo mejora clara en graded."
        )
    elif phase == "stretch_run":
        report["postseason_note"] = (
            "Tramo final de temporada regular: call-ups y rotaciones; "
            "preparar el mismo pipeline para playoffs (Wild Card → WS)."
        )

    # Rebuild features is caller's responsibility for full pipeline;
    # here we retrain walk-forward champion candidate on 2023-2025 → internal val,
    # then compare on graded set.
    try:
        from src.features.build_features import save_training_set

        save_training_set(seasons=[2023, 2024, 2025, 2026], min_team_games=10)
    except Exception as e:
        logger.warning("Feature rebuild failed (continuing with existing matrix): %s", e)

    # Train new candidate (same recipe as train.py)
    candidate = walk_forward_train([2023, 2024, 2025], [2026], calibrate=False)
    cand_path = candidate["model_path"]
    cand_art = joblib.load(cand_path)

    champion = load_champion()
    champ_metrics = None
    if champion.get("model_path") and Path(champion["model_path"]).exists():
        try:
            champ_art = joblib.load(champion["model_path"])
            champ_metrics = evaluate_on_graded(champ_art)
        except Exception as e:
            logger.warning("Champion eval failed: %s", e)

    cand_metrics = evaluate_on_graded(cand_art)
    report["candidate_path"] = cand_path
    report["candidate_walkforward"] = candidate.get("metrics")
    report["candidate_on_graded"] = cand_metrics
    report["champion_on_graded"] = champ_metrics

    promote = False
    reason = ""
    if cand_metrics is None:
        # fall back to walk-forward log-loss improvement vs stored
        prev_ll = (champion.get("metrics") or {}).get("log_loss")
        new_ll = (candidate.get("metrics") or {}).get("log_loss")
        if prev_ll is None or (new_ll is not None and new_ll < prev_ll):
            promote = True
            reason = "Promovido por mejor log-loss walk-forward (graded eval insuficiente)."
        else:
            reason = "No promovido: walk-forward no mejora log-loss."
    else:
        # Require better log-loss OR (better accuracy and not worse log-loss)
        if champ_metrics is None:
            promote = True
            reason = "Primer champion con eval en graded."
        else:
            better_ll = cand_metrics["log_loss"] < champ_metrics["log_loss"] - 1e-4
            better_acc = cand_metrics["accuracy"] > champ_metrics["accuracy"] + 0.005
            not_worse_ll = cand_metrics["log_loss"] <= champ_metrics["log_loss"] + 1e-3
            if better_ll or (better_acc and not_worse_ll):
                promote = True
                reason = "Candidato supera al champion en partidos calificados."
            else:
                reason = "Candidato NO supera al champion; se mantiene el modelo actual."

    report["reason"] = reason
    if promote:
        # archive previous champion
        if champion.get("model_path") and Path(champion["model_path"]).exists():
            archive = MODELS / "archive"
            archive.mkdir(exist_ok=True)
            src = Path(champion["model_path"])
            shutil.copy2(src, archive / f"{src.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.joblib")

        new_champ = {
            "model_path": cand_path,
            "promoted_at": datetime.now().isoformat(),
            "metrics": cand_metrics or candidate.get("metrics"),
            "n_graded_at_promotion": n_graded,
            "version": Path(cand_path).stem,
            "reason": reason,
        }
        save_champion(new_champ)
        # pointer file for predict.py preference
        pointer = MODELS / "champion.joblib"
        if pointer.exists() or pointer.is_symlink():
            pointer.unlink()
        shutil.copy2(cand_path, pointer)
        report["action"] = "promoted"
        report["champion"] = new_champ
        logger.info("NEW CHAMPION: %s (%s)", new_champ["version"], reason)
    else:
        report["action"] = "kept_champion"
        logger.info("Champion retained: %s", reason)

    (RESULTS / "last_retrain_check.json").write_text(json.dumps(report, indent=2, default=str))
    return report


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    import sys

    force = "--force" in sys.argv
    report = maybe_retrain(force=force)
    print(json.dumps({k: v for k, v in report.items() if k != "panel"}, indent=2, default=str))
    print("action:", report.get("action"), "|", report.get("reason"))

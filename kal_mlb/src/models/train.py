"""
KAL MLB Predictor - Model training (LightGBM)
Walk-forward evaluation + save best model.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROCESSED = PROJECT_ROOT / "data" / "processed"
MODELS = PROJECT_ROOT / "data" / "models"
MODELS.mkdir(parents=True, exist_ok=True)


FEATURE_LIST_PATH = PROCESSED / "feature_list.txt"
TRAINING_PATH = PROCESSED / "training_games.feather"


def load_training_data() -> tuple[pd.DataFrame, list[str]]:
    df = pd.read_feather(TRAINING_PATH)
    features = FEATURE_LIST_PATH.read_text().strip().split("\n")
    features = [f for f in features if f in df.columns]
    return df, features


def prepare_xy(
    df: pd.DataFrame,
    features: list[str],
    fill_median: bool = True,
) -> tuple[pd.DataFrame, pd.Series]:
    X = df[features].copy()
    y = df["home_win"].astype(int)

    if fill_median:
        medians = X.median(numeric_only=True)
        X = X.fillna(medians)
        # any remaining (all-NaN cols) → 0
        X = X.fillna(0)

    return X, y


def train_lgbm(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame | None = None,
    y_val: pd.Series | None = None,
    params: dict | None = None,
) -> lgb.LGBMClassifier:
    default_params = {
        "n_estimators": 500,
        "learning_rate": 0.04,
        "num_leaves": 28,
        "max_depth": 5,
        "min_child_samples": 50,
        "subsample": 0.75,
        "colsample_bytree": 0.75,
        "reg_alpha": 0.3,
        "reg_lambda": 0.3,
        "is_unbalance": False,
        "scale_pos_weight": 0.92,  # slight correction for home bias
        "random_state": 42,
        "n_jobs": -1,
        "verbosity": -1,
    }
    if params:
        default_params.update(params)

    model = lgb.LGBMClassifier(**default_params)

    if X_val is not None and y_val is not None:
        try:
            model.fit(
                X_train,
                y_train,
                eval_set=[(X_val, y_val)],
                callbacks=[lgb.early_stopping(50, verbose=False)],
            )
        except TypeError:
            # Newer lightgbm API
            model.fit(X_train, y_train, eval_X=X_val, eval_y=y_val)
    else:
        model.fit(X_train, y_train)
    return model


def evaluate(y_true: np.ndarray, proba: np.ndarray, threshold: float = 0.5) -> dict:
    pred = (proba >= threshold).astype(int)
    metrics = {
        "n": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, pred)),
        "log_loss": float(log_loss(y_true, proba, labels=[0, 1])),
        "brier": float(brier_score_loss(y_true, proba)),
        "auc": float(roc_auc_score(y_true, proba)) if len(np.unique(y_true)) > 1 else None,
        "home_win_rate_actual": float(y_true.mean()),
        "home_win_rate_pred": float(pred.mean()),
    }
    # Confidence buckets
    for lo, hi, name in [
        (0.55, 0.60, "conf_55_60"),
        (0.60, 0.65, "conf_60_65"),
        (0.65, 1.01, "conf_65plus"),
    ]:
        mask = (proba >= lo) & (proba < hi) | ((1 - proba) >= lo) & ((1 - proba) < hi)
        # simpler: max(p, 1-p) in range
        conf = np.maximum(proba, 1 - proba)
        mask = (conf >= lo) & (conf < hi)
        if mask.sum() > 20:
            metrics[f"acc_{name}"] = float(accuracy_score(y_true[mask], pred[mask]))
            metrics[f"n_{name}"] = int(mask.sum())
        else:
            metrics[f"acc_{name}"] = None
            metrics[f"n_{name}"] = int(mask.sum())
    return metrics


def walk_forward_train(
    train_seasons: list[int],
    test_seasons: list[int],
    calibrate: bool = True,
) -> dict:
    """
    Train on train_seasons, evaluate on test_seasons.
    Returns metrics + saves model.
    """
    df, features = load_training_data()
    logger.info("Loaded %d games, %d features", len(df), len(features))

    train_df = df[df["season"].isin(train_seasons)].copy()
    test_df = df[df["season"].isin(test_seasons)].copy()

    logger.info(
        "Train seasons %s → %d games | Test seasons %s → %d games",
        train_seasons,
        len(train_df),
        test_seasons,
        len(test_df),
    )

    X_train, y_train = prepare_xy(train_df, features)
    X_test, y_test = prepare_xy(test_df, features)

    # Internal validation split (last 20% of train chronologically)
    split = int(len(X_train) * 0.8)
    X_tr, y_tr = X_train.iloc[:split], y_train.iloc[:split]
    X_va, y_va = X_train.iloc[split:], y_train.iloc[split:]

    logger.info("Fitting LightGBM ...")
    model = train_lgbm(X_tr, y_tr, X_va, y_va)

    # Skip complex calibration for v0.1 – raw probabilities are already decent
    final_model = model
    proba = model.predict_proba(X_test)[:, 1]

    metrics = evaluate(y_test.values, proba)
    logger.info("=== TEST RESULTS ===")
    for k, v in metrics.items():
        if v is not None:
            logger.info("  %s: %s", k, f"{v:.4f}" if isinstance(v, float) else v)

    imp = pd.DataFrame(
        {
            "feature": features,
            "importance": model.feature_importances_,
        }
    ).sort_values("importance", ascending=False)

    # Save artifacts
    tag = f"lgbm_{min(train_seasons)}-{max(train_seasons)}_test{min(test_seasons)}"
    model_path = MODELS / f"{tag}.joblib"
    joblib.dump(
        {
            "model": final_model,
            "features": features,
            "medians": X_train.median(numeric_only=True).to_dict(),
            "train_seasons": train_seasons,
            "test_seasons": test_seasons,
            "metrics": metrics,
        },
        model_path,
    )
    imp_path = MODELS / f"{tag}_importance.csv"
    imp.to_csv(imp_path, index=False)
    metrics_path = MODELS / f"{tag}_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2))

    logger.info("Saved model → %s", model_path)
    logger.info("Top 10 features:\n%s", imp.head(10).to_string(index=False))

    # Also attach predictions to test set for analysis
    test_out = test_df[
        [
            "game_pk",
            "game_date",
            "season",
            "home_team_abbr",
            "away_team_abbr",
            "home_starter_name",
            "away_starter_name",
            "home_score",
            "away_score",
            "home_win",
        ]
    ].copy()
    test_out["home_win_prob"] = proba
    test_out["pred_home"] = (proba >= 0.5).astype(int)
    test_out["correct"] = (test_out["pred_home"] == test_out["home_win"]).astype(int)
    test_out["confidence"] = np.maximum(proba, 1 - proba)
    preds_path = MODELS / f"{tag}_predictions.feather"
    test_out.to_feather(preds_path)

    return {
        "metrics": metrics,
        "importance": imp,
        "model_path": str(model_path),
        "predictions_path": str(preds_path),
    }


def run_default_pipeline() -> dict:
    """
    Standard walk-forward:
      Train 2023-2024 → Test 2025
      Then Train 2023-2025 → Test 2026 (partial season)
    """
    results = {}

    logger.info("=" * 60)
    logger.info("WALK-FORWARD 1: Train 2023-2024 → Test 2025")
    logger.info("=" * 60)
    results["2025"] = walk_forward_train([2023, 2024], [2025], calibrate=True)

    logger.info("=" * 60)
    logger.info("WALK-FORWARD 2: Train 2023-2025 → Test 2026")
    logger.info("=" * 60)
    results["2026"] = walk_forward_train([2023, 2024, 2025], [2026], calibrate=True)

    return results


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    results = run_default_pipeline()

    print("\n" + "=" * 60)
    print("RESUMEN FINAL KAL v0.1")
    print("=" * 60)
    for season, res in results.items():
        m = res["metrics"]
        print(f"\nTemporada test {season}:")
        print(f"  Partidos        : {m['n']}")
        print(f"  Accuracy        : {m['accuracy']*100:.1f}%")
        print(f"  Log-loss        : {m['log_loss']:.4f}")
        print(f"  Brier           : {m['brier']:.4f}")
        print(f"  AUC             : {m['auc']:.4f}" if m["auc"] else "  AUC: n/a")
        if m.get("acc_conf_55_60") is not None:
            print(f"  Acc conf 55-60% : {m['acc_conf_55_60']*100:.1f}% (n={m['n_conf_55_60']})")
        if m.get("acc_conf_60_65") is not None:
            print(f"  Acc conf 60-65% : {m['acc_conf_60_65']*100:.1f}% (n={m['n_conf_60_65']})")
        if m.get("acc_conf_65plus") is not None:
            print(f"  Acc conf ≥65%   : {m['acc_conf_65plus']*100:.1f}% (n={m['n_conf_65plus']})")

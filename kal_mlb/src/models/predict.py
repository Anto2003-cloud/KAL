"""
KAL MLB Predictor - Daily predictions
Loads the latest trained model and generates predictions + simple explanations.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import uuid4

import joblib
import numpy as np
import pandas as pd

from src.data.fetch_mlb import MLBDataFetcher
from src.features.injuries import attach_injury_features
from src.features.park_bullpen import compute_park_factors, attach_park_features, attach_bullpen_proxy
from src.features.lineups import attach_lineup_features
from src.features.build_features import (
    build_team_season_stats,
    build_starter_rolling,
    load_schedules,
    load_pitching_stats,
    attach_season_stats,
)

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS = PROJECT_ROOT / "data" / "models"
PREDS = PROJECT_ROOT / "data" / "predictions"
PREDS.mkdir(parents=True, exist_ok=True)


def load_best_model(prefer_test: str = "2026") -> dict:
    """Load champion model if present, else latest walk-forward artifact."""
    champion = MODELS / "champion.joblib"
    if champion.exists():
        logger.info("Loading CHAMPION model → %s", champion.name)
        return joblib.load(champion)
    candidates = sorted(MODELS.glob(f"lgbm_*_test{prefer_test}.joblib"), reverse=True)
    if not candidates:
        candidates = sorted(MODELS.glob("lgbm_*.joblib"), reverse=True)
    if not candidates:
        raise FileNotFoundError("No trained model found in data/models/")
    path = candidates[0]
    logger.info("Loading model → %s", path.name)
    return joblib.load(path)


def build_features_for_upcoming(games: pd.DataFrame) -> pd.DataFrame:
    """
    Build the same feature set used in training for games that have not finished yet.
    Uses historical schedules (finished games) to compute rolling team/starter stats.
    """
    # Historical finished games for rolling stats
    hist = load_schedules([2023, 2024, 2025, 2026])
    hist = hist[hist["home_score"].notna()].copy()

    # Combine with upcoming so team history is continuous up to today
    # (upcoming rows have NaN scores → excluded from rolling calculations)
    upcoming = games.copy()
    for col in ["home_score", "away_score"]:
        if col not in upcoming.columns:
            upcoming[col] = np.nan
        upcoming[col] = pd.to_numeric(upcoming[col], errors="coerce")

    hist = hist.copy()
    hist["home_score"] = pd.to_numeric(hist["home_score"], errors="coerce")
    hist["away_score"] = pd.to_numeric(hist["away_score"], errors="coerce")

    combined = pd.concat([hist, upcoming], ignore_index=True)
    combined["game_date"] = pd.to_datetime(combined["game_date"])
    combined["home_score"] = pd.to_numeric(combined["home_score"], errors="coerce")
    combined["away_score"] = pd.to_numeric(combined["away_score"], errors="coerce")
    combined = combined.drop_duplicates(subset=["game_pk"], keep="last")
    combined = combined.sort_values(["game_date", "game_pk"]).reset_index(drop=True)

    team_stats = build_team_season_stats(combined)
    starter_roll = build_starter_rolling(combined)

    # Work only on the upcoming game_pks
    target_pks = set(games["game_pk"].tolist())
    base = combined[combined["game_pk"].isin(target_pks)].copy()

    # Home / away team features
    home_f = team_stats[team_stats["is_home"] == 1][
        [
            "game_pk",
            "team_id",
            "games_played",
            "win_pct_before",
            "run_diff_before",
            "rpg_before",
            "rapg_before",
            "wins_l10",
            "rs_l10",
            "ra_l10",
            "rest_days",
        ]
    ].rename(
        columns={
            "team_id": "home_team_id",
            "games_played": "home_gp",
            "win_pct_before": "home_win_pct",
            "run_diff_before": "home_run_diff",
            "rpg_before": "home_rpg",
            "rapg_before": "home_rapg",
            "wins_l10": "home_wins_l10",
            "rs_l10": "home_rs_l10",
            "ra_l10": "home_ra_l10",
            "rest_days": "home_rest",
        }
    )
    away_f = team_stats[team_stats["is_home"] == 0][
        [
            "game_pk",
            "team_id",
            "games_played",
            "win_pct_before",
            "run_diff_before",
            "rpg_before",
            "rapg_before",
            "wins_l10",
            "rs_l10",
            "ra_l10",
            "rest_days",
        ]
    ].rename(
        columns={
            "team_id": "away_team_id",
            "games_played": "away_gp",
            "win_pct_before": "away_win_pct",
            "run_diff_before": "away_run_diff",
            "rpg_before": "away_rpg",
            "rapg_before": "away_rapg",
            "wins_l10": "away_wins_l10",
            "rs_l10": "away_rs_l10",
            "ra_l10": "away_ra_l10",
            "rest_days": "away_rest",
        }
    )

    base = base.merge(home_f, on=["game_pk", "home_team_id"], how="left")
    base = base.merge(away_f, on=["game_pk", "away_team_id"], how="left")

    home_sp = starter_roll.rename(
        columns={
            "starter_id": "home_starter_id",
            "sp_gs_before": "home_sp_gs",
            "sp_team_rpg_l5": "home_sp_team_rpg_l5",
            "sp_opp_rpg_l5": "home_sp_opp_rpg_l5",
            "sp_qs_rate_l10": "home_sp_qs_l10",
        }
    )
    away_sp = starter_roll.rename(
        columns={
            "starter_id": "away_starter_id",
            "sp_gs_before": "away_sp_gs",
            "sp_team_rpg_l5": "away_sp_team_rpg_l5",
            "sp_opp_rpg_l5": "away_sp_opp_rpg_l5",
            "sp_qs_rate_l10": "away_sp_qs_l10",
        }
    )
    base = base.merge(home_sp, on=["game_pk", "home_starter_id"], how="left")
    base = base.merge(away_sp, on=["game_pk", "away_starter_id"], how="left")

    # Prior-season pitcher stats
    pitching = load_pitching_stats()
    base = attach_season_stats(base, pitching, pd.DataFrame())

    try:
        base = attach_injury_features(base)
    except Exception as e:
        logger.warning("Injury attach failed: %s", e)

    try:
        parks = compute_park_factors()
        base = attach_park_features(base, parks)
        base = attach_bullpen_proxy(base)
    except Exception as e:
        logger.warning("Park/bullpen attach failed: %s", e)

    try:
        from datetime import date as _date
        gd = base["game_date"].iloc[0]
        if hasattr(gd, "date"):
            td = gd.date()
        else:
            td = _date.fromisoformat(str(gd)[:10])
        base = attach_lineup_features(base, td)
    except Exception as e:
        logger.warning("Lineup attach failed: %s", e)

    base["is_day"] = (base.get("day_night", "night") == "day").astype(int)
    base["rest_diff"] = base["home_rest"] - base["away_rest"]
    base["win_pct_diff"] = base["home_win_pct"] - base["away_win_pct"]
    base["run_diff_diff"] = base["home_run_diff"] - base["away_run_diff"]
    base["form_diff"] = base["home_wins_l10"] - base["away_wins_l10"]
    base["rpg_diff"] = base["home_rpg"] - base["away_rpg"]
    base["rapg_diff"] = base["home_rapg"] - base["away_rapg"]

    return base


def confidence_label(prob: float) -> str:
    conf = max(prob, 1 - prob)
    if conf >= 0.62:
        return "HIGH"
    if conf >= 0.55:
        return "MEDIUM"
    return "LOW"


def _fmt_lineup(names) -> str:
    if names is None or (isinstance(names, float) and pd.isna(names)):
        return "pendiente de MLB"
    if isinstance(names, str):
        if names in ("", "nan", "None", "[]"):
            return "pendiente de MLB"
        # may be pipe-joined from feather
        parts = [p for p in names.replace(",", "|").split("|") if p and p != "nan"]
        if not parts:
            return "pendiente de MLB"
        return " → ".join(f"{i+1}. {n.strip()}" for i, n in enumerate(parts[:9]))
    if isinstance(names, (list, tuple)):
        if not names:
            return "pendiente de MLB"
        return " → ".join(f"{i+1}. {n}" for i, n in enumerate(list(names)[:9]))
    return "pendiente de MLB"


def make_explanation(row: pd.Series, home_prob: float) -> str:
    """Rich human-readable explanation: pick, confidence, drivers, lineups, risks."""
    home = row.get("home_team_abbr", "HOME")
    away = row.get("away_team_abbr", "AWAY")
    winner = home if home_prob >= 0.5 else away
    conf = confidence_label(home_prob)
    lines = []

    # Header
    lines.append(
        f"PREDICCIÓN: {winner} | {home} {home_prob*100:.1f}% — {away} {(1-home_prob)*100:.1f}% | Confianza: {conf}"
    )
    if conf == "LOW":
        lines.append("⚠️ No existe una ventaja estadística suficientemente grande; el pick es marginal.")

    # Season phase awareness
    try:
        from src.models.retrain import detect_season_phase
        phase = detect_season_phase()
        if phase == "stretch_run":
            lines.append("📅 Fase: tramo final de temporada regular — rotaciones y call-ups pueden alterar bullpens.")
        elif phase == "postseason_window":
            lines.append("🏆 Fase: ventana de postseason — muestra pequeña, abridores cortos, bullpens de alto leverage; mayor incertidumbre.")
    except Exception:
        pass

    # Starters
    hs = row.get("home_starter_name") or "?"
    as_ = row.get("away_starter_name") or "?"
    lines.append(f"Abridor: {as_} ({away}) vs {hs} ({home})")
    h_era, a_era = row.get("sp_era_prev_home"), row.get("sp_era_prev_away")
    if pd.notna(h_era) or pd.notna(a_era):
        he = f"{h_era:.2f}" if pd.notna(h_era) else "n/d"
        ae = f"{a_era:.2f}" if pd.notna(a_era) else "n/d"
        lines.append(f"  ERA temporada previa: {as_} {ae} | {hs} {he}")

    # Team form
    drivers = []
    wpd = row.get("win_pct_diff") or 0
    if abs(wpd) > 0.04:
        drivers.append(
            f"{'Local' if wpd > 0 else 'Visitante'} con mejor win% temporada ({home} {row.get('home_win_pct', float('nan')):.3f} vs {away} {row.get('away_win_pct', float('nan')):.3f})"
        )
    fd = row.get("form_diff") or 0
    if abs(fd) >= 2:
        drivers.append(f"Forma L10 favorece a {home if fd > 0 else away} (diff {fd:+.0f} W)")
    rdd = row.get("run_diff_diff") or 0
    if abs(rdd) > 25:
        drivers.append(f"Run differential favorece a {home if rdd > 0 else away}")

    h_qs, a_qs = row.get("home_sp_qs_l10"), row.get("away_sp_qs_l10")
    if pd.notna(h_qs) and pd.notna(a_qs) and abs(h_qs - a_qs) > 0.12:
        drivers.append(
            f"Quality-start rate reciente: {hs} {h_qs:.0%} vs {as_} {a_qs:.0%}"
        )

    # Park
    pf = row.get("park_factor")
    if pd.notna(pf) and abs(pf - 1.0) > 0.06:
        tag = "ofensivo" if pf > 1 else "defensivo/pitcher"
        lines.append(f"Parque: factor {pf:.3f} ({tag})")

    # IL
    hb = row.get("home_burden_short") or 0
    ab = row.get("away_burden_short") or 0
    if abs(hb - ab) >= 1.5:
        worse = home if hb > ab else away
        drivers.append(
            f"Más lesiones corto plazo en {worse} (burden {max(hb,ab):.1f} vs {min(hb,ab):.1f})"
        )

    # Bullpen residual
    bp = row.get("bp_residual_diff")
    if pd.notna(bp) and abs(bp) > 0.4:
        drivers.append(
            f"Bullpen proxy: {'local permitiendo de más' if bp > 0 else 'visitante permitiendo de más'} (residual {bp:+.2f})"
        )

    # Lineup OPS
    h_ops = row.get("home_lineup_ops")
    a_ops = row.get("away_lineup_ops")
    lu_status = row.get("lineup_status") or "missing"
    if pd.notna(h_ops) and pd.notna(a_ops):
        drivers.append(f"OPS lineup: {home} {h_ops:.3f} vs {away} {a_ops:.3f}")
        if abs(h_ops - a_ops) >= 0.040:
            drivers.append(
                f"Ventaja ofensiva de lineup → {home if h_ops > a_ops else away}"
            )

    if drivers:
        lines.append("Factores a favor del pick / contexto: " + "; ".join(drivers[:6]))
    else:
        lines.append("Factores: partido muy equilibrado en win%, forma y abridores.")

    # Lineups 1-9
    lines.append(f"Lineup {home} [{lu_status}]: {_fmt_lineup(row.get('home_lineup_names'))}")
    lines.append(f"Lineup {away} [{lu_status}]: {_fmt_lineup(row.get('away_lineup_names'))}")
    if lu_status != "confirmed":
        lines.append("📋 Lineups aún no oficiales; se actualizarán en el refresh de la tarde cuando MLB los publique.")

    # Risks
    risks = []
    if conf == "LOW":
        risks.append("edge estadístico pequeño")
    if (row.get("home_rest") or 3) <= 1 or (row.get("away_rest") or 3) <= 1:
        risks.append("posible fatiga por poco descanso")
    if lu_status != "confirmed":
        risks.append("lineup no confirmado")
    if risks:
        lines.append("Riesgos: " + "; ".join(risks))

    return "\n".join(lines)



def predict_games(
    games: pd.DataFrame,
    model_art: Optional[dict] = None,
) -> pd.DataFrame:
    if model_art is None:
        model_art = load_best_model()

    model = model_art["model"]
    features = model_art["features"]
    medians = model_art.get("medians", {})

    feat_df = build_features_for_upcoming(games)

    # Align columns
    X = feat_df.reindex(columns=features).copy()
    for c in features:
        if c in medians:
            X[c] = X[c].fillna(medians[c])
    X = X.fillna(0)

    proba = model.predict_proba(X)[:, 1]  # P(home win)

    # Post-hoc IL adjustment (model trained mostly without historical IL variance)
    # More short-term injury burden for home → lower home win prob
    if "il_short_diff" in feat_df.columns:
        adj = (-0.012 * feat_df["il_short_diff"].fillna(0).clip(-8, 8)).values
        proba = np.clip(proba + adj, 0.05, 0.95)
        logger.info("Applied IL short-term adjustment (mean abs=%.3f)", float(np.mean(np.abs(adj))))

    if "lineup_ops_diff" in feat_df.columns:
        # ~3% shift per 0.100 OPS difference in lineups
        ladj = (0.30 * feat_df["lineup_ops_diff"].fillna(0).clip(-0.15, 0.15)).values
        proba = np.clip(proba + ladj, 0.05, 0.95)
        logger.info("Applied lineup OPS adjustment (mean abs=%.3f)", float(np.mean(np.abs(ladj))))

    out = feat_df[
        [
            c
            for c in [
                "game_pk",
                "game_date",
                "home_team_abbr",
                "away_team_abbr",
                "home_starter_name",
                "away_starter_name",
                "venue_name",
                "status",
            ]
            if c in feat_df.columns
        ]
    ].copy()
    out["home_win_prob"] = proba
    out["away_win_prob"] = 1 - proba
    out["predicted_winner"] = np.where(
        out["home_win_prob"] >= 0.5, out["home_team_abbr"], out["away_team_abbr"]
    )
    out["confidence"] = [confidence_label(p) for p in proba]
    out["explanation"] = [
        make_explanation(feat_df.iloc[i], proba[i]) for i in range(len(feat_df))
    ]
    out["predicted_at"] = datetime.utcnow().isoformat()
    out["model_version"] = str(model_art.get("train_seasons", "unknown"))
    out["prediction_id"] = [str(uuid4()) for _ in range(len(out))]

    return out.sort_values("game_date").reset_index(drop=True)


def predict_date(target: date | str, save: bool = True) -> pd.DataFrame:
    if isinstance(target, str):
        target = date.fromisoformat(target)

    fetcher = MLBDataFetcher()
    games = fetcher.get_schedule(target.isoformat())
    if games.empty:
        logger.warning("No games found for %s", target)
        return pd.DataFrame()

    # Only games not yet final
    if "status" in games.columns:
        games = games[~games["status"].str.contains("Final", case=False, na=False)]

    logger.info("Predicting %d games for %s", len(games), target)
    preds = predict_games(games)

    if save and not preds.empty:
        path = PREDS / f"preds_{target.isoformat()}.feather"
        preds.to_feather(path)
        # also a readable csv
        csv_path = PREDS / f"preds_{target.isoformat()}.csv"
        preds.drop(columns=["explanation"], errors="ignore").to_csv(csv_path, index=False)
        logger.info("Saved → %s", path)

    return preds


def print_predictions(preds: pd.DataFrame) -> None:
    if preds.empty:
        print("Sin predicciones.")
        return
    print("\n" + "=" * 80)
    print(f"KAL PREDICCIONES – {preds['game_date'].iloc[0]}")
    print("=" * 80)
    for _, r in preds.iterrows():
        conf = r["confidence"]
        emoji = {"HIGH": "🔥", "MEDIUM": "⚡", "LOW": "➖"}.get(conf, "")
        print(
            f"\n{emoji} {r['away_team_abbr']} @ {r['home_team_abbr']}"
            f"  →  {r['predicted_winner']}  "
            f"({r['home_win_prob']*100:.1f}% local / {r['away_win_prob']*100:.1f}% visitante)  "
            f"[{conf}]"
        )
        exp = r.get("explanation") or ""
        for line in str(exp).split("\n"):
            print(f"   {line}")
    print("\n" + "=" * 80)

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    # Predict for 2026-08-30 (tomorrow / current slate)
    target = date(2026, 8, 30)
    preds = predict_date(target, save=True)
    print_predictions(preds)

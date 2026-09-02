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


def _empirical_thresholds() -> tuple[float, float]:
    """Umbrales HIGH/MEDIUM desde graded reales si hay suficientes; si no, defaults calibrados."""
    high_t, med_t = 0.60, 0.55
    try:
        gpath = PROJECT_ROOT / "data" / "results" / "graded_predictions.feather"
        if not gpath.exists():
            gpath = PROJECT_ROOT / "data" / "results" / "graded_predictions.csv"
        if not gpath.exists():
            return high_t, med_t
        g = pd.read_feather(gpath) if str(gpath).endswith(".feather") else pd.read_csv(gpath)
        g = g[g.get("graded", True) == True] if "graded" in g.columns else g
        if len(g) < 30 or "home_win_prob" not in g.columns or "correct" not in g.columns:
            return high_t, med_t
        edge = g["home_win_prob"].clip(0, 1)
        edge = edge.where(edge >= 0.5, 1 - edge)
        # buscar corte donde acc >= 0.58 para HIGH
        for thr in (0.65, 0.62, 0.60, 0.58):
            sub = g[edge >= thr]
            if len(sub) >= 8 and float(sub["correct"].mean()) >= 0.55:
                high_t = thr
                break
        for thr in (0.56, 0.55, 0.53):
            sub = g[edge >= thr]
            if len(sub) >= 10:
                med_t = min(thr, high_t - 0.03)
                break
    except Exception as e:
        logger.debug("empirical thresholds: %s", e)
    return high_t, med_t


def confidence_label(prob: float, high_t: float | None = None, med_t: float | None = None) -> str:
    conf = max(prob, 1 - prob)
    if high_t is None or med_t is None:
        high_t, med_t = _empirical_thresholds()
    if conf >= high_t:
        return "HIGH"
    if conf >= med_t:
        return "MEDIUM"
    return "LOW"


def data_quality_flags(row: pd.Series) -> dict:
    """Qué datos reales vs faltantes para este partido."""
    flags = {}
    # lineups
    for side in ("home", "away"):
        key = f"{side}_lineup_names"
        val = row.get(key)
        missing = val is None or (isinstance(val, float) and pd.isna(val)) or str(val) in ("", "nan", "None", "[]")
        flags[f"lineup_{side}"] = "missing" if missing else "ok"
    for col, name in [
        ("il_short_diff", "il"),
        ("bullpen_era_diff", "bullpen"),
        ("park_factor", "park"),
        ("home_starter_name", "starter_home"),
        ("away_starter_name", "starter_away"),
    ]:
        v = row.get(col)
        if col.endswith("_name"):
            flags[name] = "missing" if not v or str(v) in ("nan", "None", "TBD", "") else "ok"
        else:
            flags[name] = "missing" if v is None or (isinstance(v, float) and pd.isna(v)) else "ok"
    flags["score"] = sum(1 for v in flags.values() if v == "ok")
    flags["max"] = len(flags) - 1  # exclude score
    return flags


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
    """Explicación detallada y honesta: pick, abridores comparados, drivers numéricos, riesgos."""
    home = row.get("home_team_abbr", "HOME")
    away = row.get("away_team_abbr", "AWAY")
    winner = home if home_prob >= 0.5 else away
    loser = away if winner == home else home
    conf = confidence_label(home_prob)
    edge = abs(home_prob - 0.5) * 2  # 0..1
    lines = []

    lines.append(
        f"PREDICCIÓN: {winner} | {home} {home_prob*100:.1f}% — {away} {(1-home_prob)*100:.1f}% | Confianza: {conf}"
    )
    lines.append(
        f"Edge vs 50/50: {abs(home_prob-0.5)*100:.1f} puntos porcentuales "
        f"({'claro' if abs(home_prob-0.5) >= 0.08 else 'moderado' if abs(home_prob-0.5) >= 0.05 else 'mínimo / coin-flip'})."
    )
    if conf == "LOW":
        lines.append(
            "⚠️ No existe una ventaja estadística suficientemente grande; el pick es marginal. "
            "Úsalo solo con stake baja o como tracking, no como apuesta fuerte."
        )

    try:
        from src.models.retrain import detect_season_phase
        phase = detect_season_phase()
        if phase == "stretch_run":
            lines.append("📅 Fase: tramo final de temporada — call-ups y bullpens irregulares aumentan ruido.")
        elif phase == "postseason_window":
            lines.append("🏆 Fase postseason: muestra pequeña y mayor incertidumbre.")
    except Exception:
        pass

    # --- Abridores (comparación explícita) ---
    hs = row.get("home_starter_name") or "TBD"
    as_ = row.get("away_starter_name") or "TBD"
    lines.append(f"Abridor: {as_} ({away}) vs {hs} ({home})")
    h_era, a_era = row.get("sp_era_prev_home"), row.get("sp_era_prev_away")
    he = f"{float(h_era):.2f}" if pd.notna(h_era) else "n/d"
    ae = f"{float(a_era):.2f}" if pd.notna(a_era) else "n/d"
    lines.append(f"  ERA (ref. previa/season): {as_} {ae} | {hs} {he}")

    sp_favors = None  # "home" | "away" | None
    if pd.notna(h_era) and pd.notna(a_era):
        if float(h_era) + 0.25 < float(a_era):
            sp_favors = "home"
            lines.append(
                f"  → Mejor ERA de abridor: {hs} ({home}, {he}) vs {as_} ({away}, {ae}). "
                f"Ventaja de pitcheo inicial para {home}."
            )
        elif float(a_era) + 0.25 < float(h_era):
            sp_favors = "away"
            lines.append(
                f"  → Mejor ERA de abridor: {as_} ({away}, {ae}) vs {hs} ({home}, {he}). "
                f"Ventaja de pitcheo inicial para {away}."
            )
        else:
            lines.append("  → ERAs de abridores similares (sin ventaja clara de SP).")
    elif pd.notna(h_era) or pd.notna(a_era):
        lines.append("  → Solo un abridor tiene ERA disponible; el otro es TBD/n/d (dato incompleto).")
    else:
        lines.append("  → Sin ERA de abridores en el dataset (ambos n/d o TBD).")

    # Si el pick NO coincide con mejor SP, decirlo claro
    if sp_favors == "home" and winner == away:
        lines.append(
            f"  ⚡ IMPORTANTE: el abridor favorece a {home}, pero el pick es {away}. "
            f"El modelo se apoya en otros factores (forma, win%, bullpen, lesiones, parque, lineup), no en el SP."
        )
    elif sp_favors == "away" and winner == home:
        lines.append(
            f"  ⚡ IMPORTANTE: el abridor favorece a {away}, pero el pick es {home}. "
            f"El modelo se apoya en otros factores (forma, win%, bullpen, lesiones, parque, lineup), no en el SP."
        )
    elif sp_favors and ((sp_favors == "home" and winner == home) or (sp_favors == "away" and winner == away)):
        lines.append(f"  ✓ El pick {winner} está alineado con la ventaja de abridor.")

    h_qs, a_qs = row.get("home_sp_qs_l10"), row.get("away_sp_qs_l10")
    if pd.notna(h_qs) and pd.notna(a_qs) and abs(float(h_qs) - float(a_qs)) >= 0.15:
        lines.append(
            f"  Quality starts L10: {hs} {float(h_qs)*100:.0f}% vs {as_} {float(a_qs)*100:.0f}%."
        )

    # --- Drivers de equipo ---
    drivers = []
    wpd = row.get("win_pct_diff") or 0
    try:
        wpd = float(wpd)
    except Exception:
        wpd = 0
    hwp, awp = row.get("home_win_pct"), row.get("away_win_pct")
    if abs(wpd) > 0.03 and pd.notna(hwp) and pd.notna(awp):
        drivers.append(
            f"Win% temporada: {home} {float(hwp):.3f} vs {away} {float(awp):.3f} "
            f"(favorece a {home if wpd > 0 else away})"
        )
    fd = row.get("form_diff") or 0
    try:
        fd = float(fd)
    except Exception:
        fd = 0
    if abs(fd) >= 2:
        drivers.append(f"Forma últimos 10: favorece a {home if fd > 0 else away} (diff {fd:+.0f} W)")
    rdd = row.get("run_diff_diff") or 0
    try:
        rdd = float(rdd)
    except Exception:
        rdd = 0
    if abs(rdd) > 20:
        drivers.append(f"Run differential de temporada favorece a {home if rdd > 0 else away} (diff {rdd:+.0f})")

    # OPS lineups
    hops, aops = row.get("home_lineup_ops"), row.get("away_lineup_ops")
    if pd.notna(hops) and pd.notna(aops) and abs(float(hops) - float(aops)) >= 0.03:
        drivers.append(
            f"OPS lineup: {home} {float(hops):.3f} vs {away} {float(aops):.3f} "
            f"(bateo favorece a {home if float(hops) > float(aops) else away})"
        )

    # Bullpen residual
    for key, label in (
        ("bullpen_residual_home", home),
        ("bullpen_residual_away", away),
    ):
        pass
    hb, ab = row.get("home_bullpen_residual"), row.get("away_bullpen_residual")
    if hb is None:
        hb = row.get("bullpen_residual_home")
    if ab is None:
        ab = row.get("bullpen_residual_away")
    if pd.notna(hb) and pd.notna(ab) and abs(float(hb) - float(ab)) >= 0.4:
        drivers.append(
            f"Bullpen (proxy residual): {home} {float(hb):+.2f} vs {away} {float(ab):+.2f}"
        )

    # IL burden
    hil, ail = row.get("home_il_burden"), row.get("away_il_burden")
    if hil is None:
        hil = row.get("il_burden_home")
    if ail is None:
        ail = row.get("il_burden_away")
    if pd.notna(hil) and pd.notna(ail) and abs(float(hil) - float(ail)) >= 1.5:
        worse = home if float(hil) > float(ail) else away
        drivers.append(
            f"Carga de lesiones (IL): más afectada {worse} "
            f"({home} {float(hil):.1f} vs {away} {float(ail):.1f})"
        )

    # Rest
    hr, ar = row.get("home_rest"), row.get("away_rest")
    if pd.notna(hr) and pd.notna(ar) and abs(float(hr) - float(ar)) >= 1:
        drivers.append(f"Descanso: {home} {float(hr):.0f}d vs {away} {float(ar):.0f}d")

    if drivers:
        lines.append("Factores a favor del pick / contexto:")
        for d in drivers[:8]:
            lines.append(f"  • {d}")
    else:
        lines.append(
            "Factores: no hay un driver dominante en win%, forma, run diff, OPS o bullpen; "
            "el modelo separa poco a los equipos (partido equilibrado)."
        )

    # Park
    pf = row.get("park_factor") or row.get("park_factor_runs")
    vn = row.get("venue_name") or ""
    if pd.notna(pf):
        kind = "ofensivo" if float(pf) > 1.02 else "defensivo" if float(pf) < 0.98 else "neutral"
        lines.append(f"Parque: {vn} factor {float(pf):.3f} ({kind})")
    elif vn:
        lines.append(f"Parque: {vn}")

    # Lineups
    h_lu = str(row.get("home_lineup_status") or row.get("lineup_status_home") or "projected_or_missing")
    a_lu = str(row.get("away_lineup_status") or row.get("lineup_status_away") or "projected_or_missing")
    lines.append(f"Lineup {home} [{h_lu}]")
    lines.append(f"Lineup {away} [{a_lu}]")
    if "confirm" not in h_lu.lower() or "confirm" not in a_lu.lower():
        lines.append("📋 Lineups aún no oficiales; se actualizarán cuando MLB los publique.")

    # Resumen final honesto
    lines.append(
        f"Resumen: pick {winner} con {max(home_prob, 1-home_prob)*100:.1f}% ({conf}). "
        + (
            f"Abridor a favor del pick."
            if (sp_favors == "home" and winner == home) or (sp_favors == "away" and winner == away)
            else (
                f"Abridor NO es el motivo principal del pick."
                if sp_favors
                else "Abridores sin ventaja clara o con datos incompletos."
            )
        )
    )

    risks = []
    if conf == "LOW":
        risks.append("edge estadístico pequeño")
    if (row.get("home_rest") or 3) <= 1 or (row.get("away_rest") or 3) <= 1:
        risks.append("posible fatiga por poco descanso")
    if "confirm" not in str(h_lu).lower() or "confirm" not in str(a_lu).lower():
        risks.append("lineup no confirmado")
    if hs in ("TBD", "?", "nan") or as_ in ("TBD", "?", "nan") or str(hs).lower() == "nan" or str(as_).lower() == "nan":
        risks.append("abridor TBD o dato faltante")
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
    high_t, med_t = _empirical_thresholds()
    logger.info("Confidence thresholds HIGH>=%.2f MEDIUM>=%.2f", high_t, med_t)
    out["confidence"] = [confidence_label(p, high_t, med_t) for p in proba]
    out["explanation"] = [
        make_explanation(feat_df.iloc[i], proba[i]) for i in range(len(feat_df))
    ]
    dq = [data_quality_flags(feat_df.iloc[i]) for i in range(len(feat_df))]
    out["data_quality_score"] = [d.get("score", 0) for d in dq]
    out["data_quality"] = [str(d) for d in dq]
    out["predicted_at"] = datetime.utcnow().isoformat()
    out["model_version"] = str(model_art.get("train_seasons", "unknown"))
    out["prediction_id"] = [str(uuid4()) for _ in range(len(out))]
    try:
        from src.models.retrain import detect_season_phase
        phase = detect_season_phase()
    except Exception:
        phase = "regular"
    out["season_phase"] = phase
    if phase in ("stretch_run", "postseason_window"):
        out["home_win_prob"] = out["home_win_prob"].clip(0.08, 0.92)
        out["away_win_prob"] = 1.0 - out["home_win_prob"]
        out["predicted_winner"] = np.where(
            out["home_win_prob"] >= 0.5, out["home_team_abbr"], out["away_team_abbr"]
        )
        out["confidence"] = [
            confidence_label(float(x), high_t, med_t) for x in out["home_win_prob"]
        ]

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
        try:
            preds.to_feather(path)
        except Exception as e:
            logger.warning("feather save: %s", e)
        csv_path = PREDS / f"preds_{target.isoformat()}.csv"
        preds.drop(columns=["explanation"], errors="ignore").to_csv(csv_path, index=False)
        # JSON for API frontend
        try:
            jpath = PREDS / f"preds_{target.isoformat()}.json"
            jpath.write_text(preds.to_json(orient="records", date_format="iso"), encoding="utf-8")
        except Exception as e:
            logger.warning("json save: %s", e)
        logger.info("Saved → %s (+ csv/json)", path)

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
    target = date.today()
    preds = predict_date(target, save=True)
    print_predictions(preds)

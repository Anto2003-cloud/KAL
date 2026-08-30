"""
KAL MLB Predictor - Feature Engineering

Builds one row per game with pre-game features (no leakage).
Uses:
  - Season-to-date / prior-season pitcher & team stats
  - Rolling form approximations from schedule history
  - Context: home/away, rest, day/night, etc.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

try:
    from .injuries import attach_injury_features, INJURY_FEATURE_COLS
except ImportError:
    from src.features.injuries import attach_injury_features, INJURY_FEATURE_COLS
try:
    from .park_bullpen import compute_park_factors, attach_park_features, attach_bullpen_proxy, PARK_BP_FEATURE_COLS
except ImportError:
    from src.features.park_bullpen import compute_park_factors, attach_park_features, attach_bullpen_proxy, PARK_BP_FEATURE_COLS

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "data" / "raw"
PROCESSED = PROJECT_ROOT / "data" / "processed"
PROCESSED.mkdir(parents=True, exist_ok=True)


def load_schedules(seasons: list[int] | None = None) -> pd.DataFrame:
    seasons = seasons or [2023, 2024, 2025, 2026]
    frames = []
    for s in seasons:
        path = RAW / "schedules" / f"schedule_{s}.feather"
        if not path.exists():
            logger.warning("Missing schedule %s", path)
            continue
        df = pd.read_feather(path)
        df["season"] = s
        frames.append(df)
    if not frames:
        raise FileNotFoundError("No schedule files found")
    full = pd.concat(frames, ignore_index=True)
    full["game_date"] = pd.to_datetime(full["game_date"])
    # Keep only games with final scores for training labels
    return full


def load_pitching_stats(seasons: list[int] | None = None) -> pd.DataFrame:
    seasons = seasons or [2023, 2024, 2025]
    frames = []
    for s in seasons:
        path = RAW / "stats" / f"pitching_bref_{s}.feather"
        if not path.exists():
            continue
        df = pd.read_feather(path)
        df["season"] = s
        # Normalize name / id
        if "mlbID" in df.columns:
            df["player_id"] = pd.to_numeric(df["mlbID"], errors="coerce")
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def load_batting_stats(seasons: list[int] | None = None) -> pd.DataFrame:
    seasons = seasons or [2023, 2024, 2025]
    frames = []
    for s in seasons:
        path = RAW / "stats" / f"batting_bref_{s}.feather"
        if not path.exists():
            continue
        df = pd.read_feather(path)
        df["season"] = s
        if "mlbID" in df.columns:
            df["player_id"] = pd.to_numeric(df["mlbID"], errors="coerce")
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _safe_div(a, b, default=np.nan):
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where((b == 0) | np.isnan(b), default, a / b)
    return out


def build_team_season_stats(sched: pd.DataFrame) -> pd.DataFrame:
    """
    From finished games, compute season-to-date team offensive & pitching aggregates
    that can be joined as *prior* knowledge (shift by 1 game later).
    """
    fin = sched[sched["home_score"].notna()].copy()
    fin["home_score"] = pd.to_numeric(fin["home_score"], errors="coerce")
    fin["away_score"] = pd.to_numeric(fin["away_score"], errors="coerce")
    fin = fin.dropna(subset=["home_score", "away_score"])
    fin["home_win"] = (fin["home_score"] > fin["away_score"]).astype(int)

    # Explode to team-game level
    home = fin[
        [
            "game_pk",
            "game_date",
            "season",
            "home_team_id",
            "home_team_abbr",
            "home_score",
            "away_score",
            "home_win",
            "home_starter_id",
            "home_starter_name",
        ]
    ].rename(
        columns={
            "home_team_id": "team_id",
            "home_team_abbr": "team_abbr",
            "home_score": "runs_scored",
            "away_score": "runs_allowed",
            "home_win": "won",
            "home_starter_id": "starter_id",
            "home_starter_name": "starter_name",
        }
    )
    home["is_home"] = 1

    away = fin[
        [
            "game_pk",
            "game_date",
            "season",
            "away_team_id",
            "away_team_abbr",
            "away_score",
            "home_score",
            "home_win",
            "away_starter_id",
            "away_starter_name",
        ]
    ].rename(
        columns={
            "away_team_id": "team_id",
            "away_team_abbr": "team_abbr",
            "away_score": "runs_scored",
            "home_score": "runs_allowed",
            "away_starter_id": "starter_id",
            "away_starter_name": "starter_name",
        }
    )
    away["won"] = 1 - away["home_win"]
    away = away.drop(columns=["home_win"])
    away["is_home"] = 0

    tg = pd.concat([home, away], ignore_index=True)
    tg = tg.sort_values(["team_id", "game_date", "game_pk"]).reset_index(drop=True)

    # Rolling / expanding features *before* the current game (shift 1)
    g = tg.groupby("team_id", group_keys=False)

    tg["games_played"] = g.cumcount()  # 0-based before current
    tg["wins_before"] = g["won"].cumsum().shift(1).fillna(0)
    tg["losses_before"] = tg["games_played"] - tg["wins_before"]
    tg["win_pct_before"] = _safe_div(tg["wins_before"], tg["games_played"], 0.5)

    tg["rs_before"] = g["runs_scored"].cumsum().shift(1).fillna(0)
    tg["ra_before"] = g["runs_allowed"].cumsum().shift(1).fillna(0)
    tg["run_diff_before"] = tg["rs_before"] - tg["ra_before"]
    tg["rpg_before"] = _safe_div(tg["rs_before"], tg["games_played"], 4.5)
    tg["rapg_before"] = _safe_div(tg["ra_before"], tg["games_played"], 4.5)

    # Last 10 games form
    tg["wins_l10"] = (
        g["won"]
        .rolling(10, min_periods=1)
        .sum()
        .shift(1)
        .reset_index(level=0, drop=True)
        .fillna(0)
    )
    tg["rs_l10"] = (
        g["runs_scored"]
        .rolling(10, min_periods=1)
        .mean()
        .shift(1)
        .reset_index(level=0, drop=True)
    )
    tg["ra_l10"] = (
        g["runs_allowed"]
        .rolling(10, min_periods=1)
        .mean()
        .shift(1)
        .reset_index(level=0, drop=True)
    )

    # Rest days
    tg["prev_date"] = g["game_date"].shift(1)
    tg["rest_days"] = (tg["game_date"] - tg["prev_date"]).dt.days.fillna(5).clip(0, 15)

    return tg


def build_starter_rolling(sched: pd.DataFrame) -> pd.DataFrame:
    """
    Approximate starter recent form from game results when that pitcher started.
    (Limited: we only know final score, not individual pitching line yet.)
    """
    fin = sched[sched["home_score"].notna()].copy()
    fin["home_score"] = pd.to_numeric(fin["home_score"], errors="coerce")
    fin["away_score"] = pd.to_numeric(fin["away_score"], errors="coerce")
    fin = fin.dropna(subset=["home_score", "away_score"])

    rows = []
    for side, opp_side in [("home", "away"), ("away", "home")]:
        tmp = fin[
            [
                "game_pk",
                "game_date",
                "season",
                f"{side}_starter_id",
                f"{side}_starter_name",
                f"{side}_score",
                f"{opp_side}_score",
            ]
        ].copy()
        tmp = tmp.rename(
            columns={
                f"{side}_starter_id": "starter_id",
                f"{side}_starter_name": "starter_name",
                f"{side}_score": "team_runs",
                f"{opp_side}_score": "opp_runs",
            }
        )
        tmp["side"] = side
        rows.append(tmp)

    sp = pd.concat(rows, ignore_index=True)
    sp = sp.dropna(subset=["starter_id"])
    sp["starter_id"] = sp["starter_id"].astype(int)
    sp = sp.sort_values(["starter_id", "game_date", "game_pk"]).reset_index(drop=True)

    g = sp.groupby("starter_id", group_keys=False)
    sp["sp_gs_before"] = g.cumcount()
    sp["sp_team_rpg_l5"] = (
        g["team_runs"]
        .rolling(5, min_periods=1)
        .mean()
        .shift(1)
        .reset_index(level=0, drop=True)
    )
    sp["sp_opp_rpg_l5"] = (
        g["opp_runs"]
        .rolling(5, min_periods=1)
        .mean()
        .shift(1)
        .reset_index(level=0, drop=True)
    )
    # Crude "quality start" proxy: team allowed ≤ 3 runs
    sp["sp_qs_proxy"] = (sp["opp_runs"] <= 3).astype(int)
    sp["sp_qs_rate_l10"] = (
        g["sp_qs_proxy"]
        .rolling(10, min_periods=1)
        .mean()
        .shift(1)
        .reset_index(level=0, drop=True)
    )

    return sp[
        [
            "game_pk",
            "starter_id",
            "sp_gs_before",
            "sp_team_rpg_l5",
            "sp_opp_rpg_l5",
            "sp_qs_rate_l10",
        ]
    ]


def attach_season_stats(
    games: pd.DataFrame,
    pitching: pd.DataFrame,
    batting: pd.DataFrame,
) -> pd.DataFrame:
    """
    Attach prior-season (or same-season if available carefully) aggregate stats
    for the starting pitchers. For simplicity we use the *previous* full season.
    """
    if pitching.empty:
        return games

    # Use previous season stats for each game
    pit = pitching.copy()
    # Keep most relevant columns
    keep = [
        c
        for c in [
            "player_id",
            "season",
            "Name",
            "Age",
            "Tm",
            "W",
            "L",
            "IP",
            "H",
            "ER",
            "BB",
            "SO",
            "HR",
            "ERA",
            "WHIP",
            "SO9",
            "SO/W",
        ]
        if c in pit.columns
    ]
    pit = pit[keep].copy()
    pit = pit.rename(
        columns={
            "ERA": "sp_era_prev",
            "WHIP": "sp_whip_prev",
            "SO9": "sp_so9_prev",
            "SO/W": "sp_kbb_prev",
            "IP": "sp_ip_prev",
            "SO": "sp_so_prev",
            "BB": "sp_bb_prev",
            "HR": "sp_hr_prev",
            "W": "sp_w_prev",
            "L": "sp_l_prev",
            "Age": "sp_age",
        }
    )

    # Home starter ← previous season
    games = games.copy()
    games["prev_season"] = pd.to_numeric(games["season"], errors="coerce") - 1

    home_pit = pit.rename(columns={"player_id": "home_starter_id"})
    games = games.merge(
        home_pit,
        left_on=["home_starter_id", "prev_season"],
        right_on=["home_starter_id", "season"],
        how="left",
        suffixes=("", "_drop"),
    )
    games = games.drop(columns=[c for c in games.columns if c.endswith("_drop")], errors="ignore")

    # Rename home pitcher cols
    for c in list(games.columns):
        if c.startswith("sp_") and not c.endswith("_home") and not c.endswith("_away"):
            games = games.rename(columns={c: c + "_home"})

    away_pit = pit.rename(columns={"player_id": "away_starter_id"})
    # reset season col name collision
    away_pit = away_pit.rename(columns={"season": "pit_season"})
    games = games.merge(
        away_pit,
        left_on=["away_starter_id", "prev_season"],
        right_on=["away_starter_id", "pit_season"],
        how="left",
    )
    for c in [
        "sp_era_prev",
        "sp_whip_prev",
        "sp_so9_prev",
        "sp_kbb_prev",
        "sp_ip_prev",
        "sp_so_prev",
        "sp_bb_prev",
        "sp_hr_prev",
        "sp_w_prev",
        "sp_l_prev",
        "sp_age",
    ]:
        if c in games.columns:
            games = games.rename(columns={c: c + "_away"})

    games = games.drop(columns=["pit_season", "Name", "Tm", "prev_season"], errors="ignore")
    return games


def build_game_features(
    seasons: list[int] | None = None,
    min_team_games: int = 10,
) -> pd.DataFrame:
    """
    Main entry: produce a clean training matrix.
    One row per finished game with pre-game features + label.
    """
    logger.info("Loading schedules ...")
    sched = load_schedules(seasons)
    logger.info("  %d total games", len(sched))

    logger.info("Building team rolling stats ...")
    team_stats = build_team_season_stats(sched)

    logger.info("Building starter rolling proxies ...")
    starter_roll = build_starter_rolling(sched)

    # Base finished games
    games = sched[sched["home_score"].notna()].copy()
    games["home_win"] = (games["home_score"] > games["away_score"]).astype(int)
    games["total_runs"] = games["home_score"] + games["away_score"]

    # Join home team pre-game features
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

    games = games.merge(home_f, on=["game_pk", "home_team_id"], how="left")
    games = games.merge(away_f, on=["game_pk", "away_team_id"], how="left")

    # Starter rolling
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
    games = games.merge(home_sp, on=["game_pk", "home_starter_id"], how="left")
    games = games.merge(away_sp, on=["game_pk", "away_starter_id"], how="left")

    # Prior-season pitcher quality
    logger.info("Attaching prior-season pitcher stats ...")
    pitching = load_pitching_stats()
    games = attach_season_stats(games, pitching, pd.DataFrame())

    # Context features
    games["is_day"] = (games["day_night"] == "day").astype(int)
    games["rest_diff"] = games["home_rest"] - games["away_rest"]
    games["win_pct_diff"] = games["home_win_pct"] - games["away_win_pct"]
    games["run_diff_diff"] = games["home_run_diff"] - games["away_run_diff"]
    games["form_diff"] = games["home_wins_l10"] - games["away_wins_l10"]
    games["rpg_diff"] = games["home_rpg"] - games["away_rpg"]
    games["rapg_diff"] = games["home_rapg"] - games["away_rapg"]

    # Filter early season (too few games played)
    games = games[
        (games["home_gp"] >= min_team_games) & (games["away_gp"] >= min_team_games)
    ].copy()

    # Injury / IL burden: only meaningful for current season live data.
    # Historical seasons → 0 (no archived daily IL snapshots yet).
    try:
        games = attach_injury_features(games)
        inj_cols = [c for c in games.columns if "il_" in c or "burden" in c]
        mask_hist = games["season"] < 2026
        for c in inj_cols:
            games.loc[mask_hist, c] = 0
        logger.info("Injury features attached (zeroed for seasons < 2026)")
    except Exception as e:
        logger.warning("Injury features skipped: %s", e)

    # Park factors + bullpen proxy
    try:
        parks = compute_park_factors()
        games = attach_park_features(games, parks)
        games = attach_bullpen_proxy(games)
        logger.info("Park + bullpen features attached")
    except Exception as e:
        logger.warning("Park/bullpen features skipped: %s", e)

    # Final feature list
    feature_cols = [
        # Team strength
        "home_win_pct",
        "away_win_pct",
        "win_pct_diff",
        "home_run_diff",
        "away_run_diff",
        "run_diff_diff",
        "home_rpg",
        "away_rpg",
        "rpg_diff",
        "home_rapg",
        "away_rapg",
        "rapg_diff",
        # Form
        "home_wins_l10",
        "away_wins_l10",
        "form_diff",
        "home_rs_l10",
        "away_rs_l10",
        "home_ra_l10",
        "away_ra_l10",
        # Rest
        "home_rest",
        "away_rest",
        "rest_diff",
        # Starter proxies
        "home_sp_gs",
        "away_sp_gs",
        "home_sp_opp_rpg_l5",
        "away_sp_opp_rpg_l5",
        "home_sp_qs_l10",
        "away_sp_qs_l10",
        # Prior season pitcher quality
        "sp_era_prev_home",
        "sp_era_prev_away",
        "sp_whip_prev_home",
        "sp_whip_prev_away",
        "sp_so9_prev_home",
        "sp_so9_prev_away",
        "sp_kbb_prev_home",
        "sp_kbb_prev_away",
        "sp_ip_prev_home",
        "sp_ip_prev_away",
        # Context
        "is_day",
        # Injuries / IL
        "home_il_total",
        "away_il_total",
        "home_il_hitters",
        "away_il_hitters",
        "home_il_pitchers",
        "away_il_pitchers",
        "home_il_short",
        "away_il_short",
        "home_burden_hitters",
        "away_burden_hitters",
        "home_burden_pitchers",
        "away_burden_pitchers",
        "home_burden_short",
        "away_burden_short",
        "il_burden_diff",
        "il_short_diff",
        "park_factor",
        "park_home_factor",
        "home_bp_residual",
        "away_bp_residual",
        "bp_residual_diff",
        "home_rapg_park_adj",
        "away_rapg_park_adj",
        "rapg_park_diff",
    ]

    # Keep only columns that exist
    feature_cols = [c for c in feature_cols if c in games.columns]
    meta_cols = [
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
        "total_runs",
    ]
    meta_cols = [c for c in meta_cols if c in games.columns]

    out = games[meta_cols + feature_cols].copy()
    out = out.sort_values(["game_date", "game_pk"]).reset_index(drop=True)

    logger.info(
        "Feature matrix ready: %d games × %d features (seasons %s)",
        len(out),
        len(feature_cols),
        sorted(out["season"].unique().tolist()) if "season" in out.columns else "?",
    )
    return out, feature_cols


def save_training_set(
    seasons: list[int] | None = None,
    min_team_games: int = 10,
) -> Path:
    df, features = build_game_features(seasons=seasons, min_team_games=min_team_games)
    path = PROCESSED / "training_games.feather"
    df.to_feather(path)
    # also save feature list
    feat_path = PROCESSED / "feature_list.txt"
    feat_path.write_text("\n".join(features))
    logger.info("Saved → %s (%.1f KB)", path, path.stat().st_size / 1024)
    logger.info("Features (%d): %s", len(features), features)
    return path


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    path = save_training_set(seasons=[2023, 2024, 2025, 2026], min_team_games=10)
    df = pd.read_feather(path)
    print("\n=== SAMPLE ===")
    print(df.head(3).T)
    print("\n=== LABEL BALANCE ===")
    print(df["home_win"].value_counts(normalize=True))
    print("\n=== MISSING (top) ===")
    print(df.isna().mean().sort_values(ascending=False).head(15))

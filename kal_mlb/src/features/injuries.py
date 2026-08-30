"""
KAL – Injury / IL feature engineering

Uses the latest 40-man roster snapshot (data/raw/intel/rosters_latest.feather)
to estimate each team's current injury burden.

Weights (approximate run impact):
  - Position player on IL: higher weight for everyday lineup spots
  - Pitcher on IL: separates starters-ish (P) from general arm shortage
  - 60-day IL: long-term (often already priced into season stats)
  - 10/15-day IL: more relevant for short-term prediction
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INTEL = PROJECT_ROOT / "data" / "raw" / "intel"

# Relative importance for "missing production"
HITTER_POS_WEIGHT = {
    "C": 1.2,
    "1B": 1.0,
    "2B": 1.1,
    "3B": 1.1,
    "SS": 1.3,
    "LF": 1.0,
    "CF": 1.2,
    "RF": 1.0,
    "DH": 0.9,
    "OF": 1.0,
    "IF": 1.0,
    "PH": 0.3,
    "PR": 0.2,
}
PITCHER_WEIGHT = 1.0
SHORT_TERM_IL = {"Injured 7-Day", "Injured 10-Day", "Injured 15-Day"}
LONG_TERM_IL = {"Injured 60-Day"}


def load_latest_rosters() -> pd.DataFrame:
    path = INTEL / "rosters_latest.feather"
    if not path.exists():
        # fallback to any dated file
        files = sorted(INTEL.glob("rosters_20*.feather"))
        if not files:
            logger.warning("No roster intel found")
            return pd.DataFrame()
        path = files[-1]
    return pd.read_feather(path)


def compute_team_injury_burden(rosters: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    One row per team with injury burden metrics.
    """
    if rosters is None:
        rosters = load_latest_rosters()
    if rosters.empty:
        return pd.DataFrame()

    df = rosters.copy()
    df["is_il"] = df["status"].str.contains("Injured", case=False, na=False)
    df["is_short_il"] = df["status"].isin(SHORT_TERM_IL)
    df["is_long_il"] = df["status"].isin(LONG_TERM_IL)
    df["is_pitcher"] = df["position_type"].eq("Pitcher") | df["position"].eq("P")
    df["is_hitter"] = ~df["is_pitcher"]

    def hitter_w(pos):
        return HITTER_POS_WEIGHT.get(pos, 0.8)

    df["hitter_weight"] = df["position"].map(hitter_w).fillna(0.8)
    df["il_hitter_w"] = np.where(df["is_il"] & df["is_hitter"], df["hitter_weight"], 0.0)
    df["il_pitcher_w"] = np.where(df["is_il"] & df["is_pitcher"], PITCHER_WEIGHT, 0.0)
    df["short_hitter_w"] = np.where(df["is_short_il"] & df["is_hitter"], df["hitter_weight"], 0.0)
    df["short_pitcher_w"] = np.where(df["is_short_il"] & df["is_pitcher"], PITCHER_WEIGHT, 0.0)

    g = df.groupby(["team_id", "team_abbr"], dropna=False)
    out = g.agg(
        il_total=("is_il", "sum"),
        il_hitters=("is_hitter", lambda s: int((s & df.loc[s.index, "is_il"]).sum()) if len(s) else 0),
        il_pitchers=("is_pitcher", lambda s: int((s & df.loc[s.index, "is_il"]).sum()) if len(s) else 0),
        il_short=("is_short_il", "sum"),
        il_long=("is_long_il", "sum"),
        burden_hitters=("il_hitter_w", "sum"),
        burden_pitchers=("il_pitcher_w", "sum"),
        burden_short_hitters=("short_hitter_w", "sum"),
        burden_short_pitchers=("short_pitcher_w", "sum"),
        active_players=("status", lambda s: int((s == "Active").sum())),
    ).reset_index()

    # Cleaner counts without lambda mess
    counts = (
        df.groupby(["team_id", "team_abbr"])
        .apply(
            lambda x: pd.Series(
                {
                    "il_hitters": int((x["is_il"] & x["is_hitter"]).sum()),
                    "il_pitchers": int((x["is_il"] & x["is_pitcher"]).sum()),
                    "il_short_hitters": int((x["is_short_il"] & x["is_hitter"]).sum()),
                    "il_short_pitchers": int((x["is_short_il"] & x["is_pitcher"]).sum()),
                }
            ),
            include_groups=False,
        )
        .reset_index()
    )
    out = out.drop(columns=["il_hitters", "il_pitchers"], errors="ignore")
    out = out.merge(counts, on=["team_id", "team_abbr"], how="left")

    out["burden_total"] = out["burden_hitters"] + out["burden_pitchers"]
    out["burden_short"] = out["burden_short_hitters"] + out["burden_short_pitchers"]

    logger.info(
        "Injury burden: %d teams | avg IL=%.1f | avg short-term=%.1f",
        len(out),
        out["il_total"].mean(),
        out["il_short"].mean(),
    )
    return out


def attach_injury_features(games: pd.DataFrame, burden: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Attach home_* and away_* injury features to a game-level dataframe.
    Expects home_team_id / away_team_id (or abbr).
    """
    if burden is None:
        burden = compute_team_injury_burden()
    if burden.empty:
        logger.warning("No injury burden available – filling zeros")
        for prefix in ("home", "away"):
            games[f"{prefix}_il_total"] = 0
            games[f"{prefix}_il_hitters"] = 0
            games[f"{prefix}_il_pitchers"] = 0
            games[f"{prefix}_il_short"] = 0
            games[f"{prefix}_burden_hitters"] = 0.0
            games[f"{prefix}_burden_pitchers"] = 0.0
            games[f"{prefix}_burden_short"] = 0.0
        games["il_burden_diff"] = 0.0
        games["il_short_diff"] = 0.0
        return games

    feats = [
        "il_total",
        "il_hitters",
        "il_pitchers",
        "il_short",
        "burden_hitters",
        "burden_pitchers",
        "burden_short",
    ]
    key = "team_id" if "home_team_id" in games.columns else "team_abbr"

    home_b = burden[["team_id", "team_abbr"] + feats].copy()
    away_b = burden[["team_id", "team_abbr"] + feats].copy()

    if key == "team_id":
        home_b = home_b.rename(columns={"team_id": "home_team_id", **{f: f"home_{f}" for f in feats}})
        away_b = away_b.rename(columns={"team_id": "away_team_id", **{f: f"away_{f}" for f in feats}})
        games = games.merge(home_b.drop(columns=["team_abbr"], errors="ignore"), on="home_team_id", how="left")
        games = games.merge(away_b.drop(columns=["team_abbr"], errors="ignore"), on="away_team_id", how="left")
    else:
        home_b = home_b.rename(columns={"team_abbr": "home_team_abbr", **{f: f"home_{f}" for f in feats}})
        away_b = away_b.rename(columns={"team_abbr": "away_team_abbr", **{f: f"away_{f}" for f in feats}})
        games = games.merge(home_b.drop(columns=["team_id"], errors="ignore"), on="home_team_abbr", how="left")
        games = games.merge(away_b.drop(columns=["team_id"], errors="ignore"), on="away_team_abbr", how="left")

    for c in [f"home_{f}" for f in feats] + [f"away_{f}" for f in feats]:
        if c in games.columns:
            games[c] = games[c].fillna(0)

    games["il_burden_diff"] = games["home_burden_hitters"] + games["home_burden_pitchers"] - (
        games["away_burden_hitters"] + games["away_burden_pitchers"]
    )
    games["il_short_diff"] = games["home_burden_short"] - games["away_burden_short"]
    # Positive il_burden_diff = home has MORE injuries = disadvantage for home
    return games


INJURY_FEATURE_COLS = [
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
]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    b = compute_team_injury_burden()
    print(b.sort_values("burden_total", ascending=False).head(15).to_string(index=False))

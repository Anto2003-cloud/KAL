"""
KAL – Park factors + simple bullpen proxy

Park factors:
  Computed from our own schedule history (runs scored at each venue).
  PF > 1.0 = hitter-friendly, < 1.0 = pitcher-friendly.

Bullpen proxy (v1 without pitch-level data):
  - Team runs allowed in recent games (already in features) is partly bullpen
  - Extra: residual after accounting for starter quality proxy
  - IL short-term pitchers already capture "bullpen depth shock"
  - Here we add park-adjusted RAPG and a crude bullpen form from last 10 RA
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "data" / "raw"
PROCESSED = PROJECT_ROOT / "data" / "processed"


def compute_park_factors(schedules: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Venue-level park factor from finished games.
    PF = (avg total runs at park) / (league avg total runs)
    Also split for home scoring environment.
    """
    if schedules is None:
        frames = []
        for p in sorted((RAW / "schedules").glob("schedule_*.feather")):
            frames.append(pd.read_feather(p))
        if not frames:
            return pd.DataFrame()
        schedules = pd.concat(frames, ignore_index=True)

    df = schedules.copy()
    df["home_score"] = pd.to_numeric(df["home_score"], errors="coerce")
    df["away_score"] = pd.to_numeric(df["away_score"], errors="coerce")
    df = df.dropna(subset=["home_score", "away_score", "venue_id"])
    df["total_runs"] = df["home_score"] + df["away_score"]

    league_avg = df["total_runs"].mean()
    if league_avg <= 0:
        league_avg = 8.5

    g = df.groupby("venue_id", as_index=False).agg(
        venue_name=("venue_name", "first"),
        n_games=("game_pk", "count"),
        avg_total_runs=("total_runs", "mean"),
        avg_home_runs=("home_score", "mean"),
        avg_away_runs=("away_score", "mean"),
    )
    g["park_factor"] = g["avg_total_runs"] / league_avg
    g["park_home_factor"] = (g["avg_home_runs"] / (league_avg / 2)).clip(0.7, 1.4)
    # Shrink toward 1.0 for small samples
    g["park_factor"] = np.where(
        g["n_games"] < 40,
        0.5 * g["park_factor"] + 0.5 * 1.0,
        g["park_factor"],
    )
    g["park_factor"] = g["park_factor"].clip(0.75, 1.35)

    path = PROCESSED / "park_factors.feather"
    PROCESSED.mkdir(parents=True, exist_ok=True)
    g.to_feather(path)
    logger.info(
        "Park factors: %d venues | mean PF=%.3f | saved %s",
        len(g),
        g["park_factor"].mean(),
        path.name,
    )
    return g


def attach_park_features(games: pd.DataFrame, parks: pd.DataFrame | None = None) -> pd.DataFrame:
    if parks is None:
        path = PROCESSED / "park_factors.feather"
        if path.exists():
            parks = pd.read_feather(path)
        else:
            parks = compute_park_factors()
    if parks.empty or "venue_id" not in games.columns:
        games["park_factor"] = 1.0
        games["park_home_factor"] = 1.0
        return games

    cols = ["venue_id", "park_factor", "park_home_factor"]
    games = games.merge(parks[cols], on="venue_id", how="left")
    games["park_factor"] = games["park_factor"].fillna(1.0)
    games["park_home_factor"] = games["park_home_factor"].fillna(1.0)
    return games


def attach_bullpen_proxy(games: pd.DataFrame) -> pd.DataFrame:
    """
    Crude bullpen form:
      - home/away RA last 10 already exists as home_ra_l10 / away_ra_l10
      - residual vs expected from starter QS proxy
      - park-adjusted RAPG
    """
    for side in ("home", "away"):
        ra = games.get(f"{side}_ra_l10")
        qs = games.get(f"{side}_sp_qs_l10")
        rapg = games.get(f"{side}_rapg")
        if ra is not None and qs is not None:
            # Higher QS rate → expect lower RA; residual = actual - expected
            expected_ra = 5.2 - 1.5 * qs.fillna(0.4)
            games[f"{side}_bp_residual"] = ra.fillna(4.5) - expected_ra
        else:
            games[f"{side}_bp_residual"] = 0.0

        if rapg is not None and "park_factor" in games.columns:
            games[f"{side}_rapg_park_adj"] = rapg.fillna(4.5) / games["park_factor"].replace(0, 1)
        else:
            games[f"{side}_rapg_park_adj"] = games.get(f"{side}_rapg", 4.5)

    games["bp_residual_diff"] = games["home_bp_residual"] - games["away_bp_residual"]
    # Positive = home bullpen allowing more than expected (bad for home)
    games["rapg_park_diff"] = games["home_rapg_park_adj"] - games["away_rapg_park_adj"]
    return games


PARK_BP_FEATURE_COLS = [
    "park_factor",
    "park_home_factor",
    "home_bp_residual",
    "away_bp_residual",
    "bp_residual_diff",
    "home_rapg_park_adj",
    "away_rapg_park_adj",
    "rapg_park_diff",
]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    pf = compute_park_factors()
    print(pf.sort_values("park_factor", ascending=False).head(10).to_string(index=False))
    print("...")
    print(pf.sort_values("park_factor").head(5).to_string(index=False))

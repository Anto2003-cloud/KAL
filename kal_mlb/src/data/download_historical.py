"""
KAL – Download historical MLB data for training.

Priority data (most useful for accurate predictions):
1. Full season schedules + final scores (MLB Stats API)
2. Season-level pitching & batting stats from FanGraphs via pybaseball
   (includes FIP, xFIP, wRC+, Barrel%, etc.)
3. Later: Statcast pitch-level (heavier)

Usage:
    python -m src.data.download_historical --seasons 2021 2022 2023 2024 2025
    python -m src.data.download_historical --seasons 2024 2025 --stats-only
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import yaml

# Project root
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.data.fetch_mlb import MLBDataFetcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kal.download")


def load_config() -> dict:
    cfg_path = ROOT / "config" / "settings.yaml"
    with open(cfg_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def download_season_schedule(fetcher: MLBDataFetcher, season: int, raw_dir: Path) -> Path:
    """
    Download all regular-season games for a season.
    Splits by month to avoid timeouts / large responses.
    """
    out_path = raw_dir / f"schedule_{season}.feather"
    if out_path.exists() and out_path.stat().st_size > 0:
        logger.info("[%d] Schedule already exists → %s (skip)", season, out_path.name)
        return out_path

    # Approximate regular season window
    start = date(season, 3, 20)
    end = date(season, 10, 5)

    all_games = []
    current = start
    while current <= end:
        month_end = min(
            date(current.year, current.month % 12 + 1, 1) - timedelta(days=1)
            if current.month < 12
            else date(current.year, 12, 31),
            end,
        )
        # Better: jump month by month
        try:
            next_month = date(current.year + (1 if current.month == 12 else 0),
                              1 if current.month == 12 else current.month + 1, 1)
            month_end = min(next_month - timedelta(days=1), end)
        except Exception:
            month_end = end

        logger.info("[%d] Fetching %s → %s ...", season, current, month_end)
        try:
            df = fetcher.get_schedule(current, month_end)
            if not df.empty:
                # Keep only regular season + final/completed when possible
                all_games.append(df)
                logger.info("    → %d games", len(df))
            time.sleep(0.6)  # be polite to the API
        except Exception as e:
            logger.warning("    Error on %s–%s: %s", current, month_end, e)

        current = month_end + timedelta(days=1)

    if not all_games:
        logger.error("[%d] No games downloaded", season)
        return out_path

    full = pd.concat(all_games, ignore_index=True)
    # Deduplicate by game_pk
    full = full.drop_duplicates(subset=["game_pk"], keep="last")
    # Prefer regular season
    if "game_type" in full.columns:
        full = full[full["game_type"].isin(["R", "F", "D", "L", "W"]) | full["game_type"].isna()]

    full = full.copy()
    if "game_date" in full.columns:
        full["game_date"] = full["game_date"].astype(str)
    full.to_feather(out_path)
    logger.info("[%d] Saved %d unique games → %s", season, len(full), out_path)
    return out_path


def download_fangraphs_stats(seasons: list[int], raw_dir: Path) -> None:
    """
    Download high-quality season stats from FanGraphs via pybaseball.
    These contain FIP, xFIP, wRC+, Barrel%, HardHit%, etc. – key for accuracy.
    """
    try:
        from pybaseball import batting_stats, pitching_stats
    except ImportError:
        logger.error("pybaseball not installed. Run: pip install pybaseball")
        return

    for season in seasons:
        # Pitching
        pitch_path = raw_dir / f"pitching_fangraphs_{season}.feather"
        if pitch_path.exists() and pitch_path.stat().st_size > 0:
            logger.info("[%d] Pitching FanGraphs already exists (skip)", season)
        else:
            logger.info("[%d] Downloading pitching stats from FanGraphs ...", season)
            try:
                df = pitching_stats(season, season, qual=1)  # all pitchers with ≥1 IP
                df.to_feather(pitch_path)
                logger.info("    → %d pitchers saved", len(df))
            except Exception as e:
                logger.error("    Pitching failed: %s", e)
            time.sleep(1.5)

        # Batting
        bat_path = raw_dir / f"batting_fangraphs_{season}.feather"
        if bat_path.exists() and bat_path.stat().st_size > 0:
            logger.info("[%d] Batting FanGraphs already exists (skip)", season)
        else:
            logger.info("[%d] Downloading batting stats from FanGraphs ...", season)
            try:
                df = batting_stats(season, season, qual=1)
                df.to_feather(bat_path)
                logger.info("    → %d batters saved", len(df))
            except Exception as e:
                logger.error("    Batting failed: %s", e)
            time.sleep(1.5)


def combine_schedules(raw_dir: Path, seasons: list[int]) -> Path:
    """Combine all season schedules into one training-ready file."""
    frames = []
    for s in seasons:
        p = raw_dir / f"schedule_{s}.feather"
        if p.exists() and p.stat().st_size > 0:
            df = pd.read_feather(p)
            df["season"] = s
            frames.append(df)
    if not frames:
        logger.warning("No schedule files to combine")
        return raw_dir / "games_all.feather"

    all_games = pd.concat(frames, ignore_index=True)
    all_games = all_games.drop_duplicates(subset=["game_pk"], keep="last")

    # Keep only games with final scores
    completed = all_games[
        all_games["home_score"].notna() & all_games["away_score"].notna()
    ].copy()
    completed["home_win"] = (completed["home_score"] > completed["away_score"]).astype(int)
    if "game_date" in completed.columns:
        completed["game_date"] = completed["game_date"].astype(str)

    out = raw_dir / "games_all.feather"
    completed.to_feather(out)
    logger.info(
        "Combined %d completed games from seasons %s → %s",
        len(completed),
        seasons,
        out,
    )
    return out


def main():
    parser = argparse.ArgumentParser(description="Download historical MLB data for KAL")
    parser.add_argument(
        "--seasons",
        nargs="+",
        type=int,
        default=[2021, 2022, 2023, 2024, 2025],
        help="Seasons to download (default: 2021-2025)",
    )
    parser.add_argument(
        "--schedule-only",
        action="store_true",
        help="Only download schedules (no FanGraphs stats)",
    )
    parser.add_argument(
        "--stats-only",
        action="store_true",
        help="Only download FanGraphs pitching/batting stats",
    )
    args = parser.parse_args()

    cfg = load_config()
    raw_dir = ROOT / cfg["paths"]["raw"]
    raw_dir.mkdir(parents=True, exist_ok=True)

    seasons = sorted(args.seasons)
    logger.info("Seasons requested: %s", seasons)

    if not args.stats_only:
        fetcher = MLBDataFetcher()
        for season in seasons:
            download_season_schedule(fetcher, season, raw_dir)
        combine_schedules(raw_dir, seasons)

    if not args.schedule_only:
        download_fangraphs_stats(seasons, raw_dir)

    logger.info("Done.")


if __name__ == "__main__":
    main()

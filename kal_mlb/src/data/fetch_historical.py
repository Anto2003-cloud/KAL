"""
KAL MLB Predictor - Historical data downloader

Downloads:
1. Full season schedules + final scores from MLB Stats API (2022-2026)
2. Season-level pitching & batting stats from FanGraphs via pybaseball
3. Saves everything as parquet for fast later use
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import yaml

from .fetch_mlb import MLBDataFetcher

logger = logging.getLogger(__name__)

# Seasons we want for training (modern analytics era + current)
DEFAULT_SEASONS = [2022, 2023, 2024, 2025, 2026]


class HistoricalDataDownloader:
    def __init__(self, config_path: str | Path = "config/settings.yaml"):
        self.fetcher = MLBDataFetcher(config_path)
        self.config = self.fetcher.config
        self.raw_dir = Path(self.config["paths"]["raw"])
        self.raw_dir.mkdir(parents=True, exist_ok=True)

        # subfolders
        self.sched_dir = self.raw_dir / "schedules"
        self.stats_dir = self.raw_dir / "stats"
        self.sched_dir.mkdir(exist_ok=True)
        self.stats_dir.mkdir(exist_ok=True)

    # ------------------------------------------------------------------
    # 1. Full season schedules (MLB Stats API) – most accurate results
    # ------------------------------------------------------------------
    def download_season_schedule(
        self,
        season: int,
        force: bool = False,
        sleep: float = 0.35,
    ) -> pd.DataFrame:
        """
        Download every regular-season game for a full year.
        Uses monthly chunks to avoid huge responses.
        """
        out_path = self.sched_dir / f"schedule_{season}.parquet"
        if out_path.exists() and not force:
            logger.info("Schedule %d already exists → %s", season, out_path)
            return pd.read_parquet(out_path)

        logger.info("Downloading full schedule for season %d ...", season)

        # Approximate regular season window (safe margins)
        start = date(season, 3, 20)
        end = date(season, 10, 5)
        if season == date.today().year:
            end = min(end, date.today() + timedelta(days=2))

        all_games = []
        current = start
        while current <= end:
            chunk_end = min(current + timedelta(days=14), end)  # 2-week chunks
            try:
                df = self.fetcher.get_schedule(
                    current.isoformat(),
                    chunk_end.isoformat(),
                    hydrate="probablePitcher,team,weather",
                )
                if not df.empty:
                    # Keep only regular season + finished or scheduled
                    if "game_type" in df.columns:
                        df = df[df["game_type"].isin(["R", "F", "D", "L", "W", "S"]) | df["game_type"].isna()]
                    all_games.append(df)
                    logger.info(
                        "  %s → %s : %d games",
                        current,
                        chunk_end,
                        len(df),
                    )
            except Exception as e:
                logger.warning("  Failed chunk %s-%s: %s", current, chunk_end, e)

            current = chunk_end + timedelta(days=1)
            time.sleep(sleep)

        if not all_games:
            logger.error("No games downloaded for %d", season)
            return pd.DataFrame()

        full = pd.concat(all_games, ignore_index=True)
        # Deduplicate by game_pk
        full = full.drop_duplicates(subset=["game_pk"], keep="last")
        full = full.sort_values(["game_date", "game_pk"]).reset_index(drop=True)

        full.to_parquet(out_path, index=False)
        logger.info(
            "Saved %d games for %d → %s",
            len(full),
            season,
            out_path,
        )
        return full

    def download_all_schedules(
        self,
        seasons: Optional[list[int]] = None,
        force: bool = False,
    ) -> dict[int, pd.DataFrame]:
        seasons = seasons or DEFAULT_SEASONS
        result = {}
        for s in seasons:
            result[s] = self.download_season_schedule(s, force=force)
        return result

    # ------------------------------------------------------------------
    # 2. FanGraphs advanced stats (pybaseball) – best quality metrics
    # ------------------------------------------------------------------
    def download_fangraphs_pitching(
        self,
        start_season: int = 2022,
        end_season: int = 2026,
        qual: int = 10,
        force: bool = False,
    ) -> pd.DataFrame:
        """Season-level pitching stats from FanGraphs (ERA, FIP, xFIP, K%, etc.)."""
        out_path = self.stats_dir / f"fangraphs_pitching_{start_season}_{end_season}.parquet"
        if out_path.exists() and not force:
            logger.info("FG pitching already exists → %s", out_path)
            return pd.read_parquet(out_path)

        try:
            from pybaseball import pitching_stats, cache

            cache.enable()
        except ImportError:
            logger.error("pybaseball not installed. Run: pip install pybaseball")
            return pd.DataFrame()

        logger.info(
            "Downloading FanGraphs pitching stats %d-%d (qual=%d IP) ...",
            start_season,
            end_season,
            qual,
        )
        df = pitching_stats(start_season, end_season, qual=qual)
        if df is None or df.empty:
            logger.warning("Empty pitching stats returned")
            return pd.DataFrame()

        df.to_parquet(out_path, index=False)
        logger.info("Saved %d pitcher-seasons → %s", len(df), out_path)
        return df

    def download_fangraphs_batting(
        self,
        start_season: int = 2022,
        end_season: int = 2026,
        qual: int = 50,
        force: bool = False,
    ) -> pd.DataFrame:
        """Season-level batting stats from FanGraphs (wRC+, OPS, ISO, barrel%, etc.)."""
        out_path = self.stats_dir / f"fangraphs_batting_{start_season}_{end_season}.parquet"
        if out_path.exists() and not force:
            logger.info("FG batting already exists → %s", out_path)
            return pd.read_parquet(out_path)

        try:
            from pybaseball import batting_stats, cache

            cache.enable()
        except ImportError:
            logger.error("pybaseball not installed")
            return pd.DataFrame()

        logger.info(
            "Downloading FanGraphs batting stats %d-%d (qual=%d PA) ...",
            start_season,
            end_season,
            qual,
        )
        df = batting_stats(start_season, end_season, qual=qual)
        if df is None or df.empty:
            logger.warning("Empty batting stats returned")
            return pd.DataFrame()

        df.to_parquet(out_path, index=False)
        logger.info("Saved %d batter-seasons → %s", len(df), out_path)
        return df

    # ------------------------------------------------------------------
    # 3. Convenience: run everything
    # ------------------------------------------------------------------
    def download_core_historical(
        self,
        seasons: Optional[list[int]] = None,
        force: bool = False,
    ) -> None:
        """Download the most useful historical datasets for training."""
        seasons = seasons or DEFAULT_SEASONS
        logger.info("=" * 60)
        logger.info("KAL – Descargando datos históricos core")
        logger.info("Temporadas: %s", seasons)
        logger.info("=" * 60)

        # 1. Schedules + results
        self.download_all_schedules(seasons, force=force)

        # 2. Advanced stats
        min_s, max_s = min(seasons), max(seasons)
        self.download_fangraphs_pitching(min_s, max_s, force=force)
        self.download_fangraphs_batting(min_s, max_s, force=force)

        logger.info("Descarga core finalizada.")
        self._print_summary()

    def _print_summary(self) -> None:
        print("\n" + "=" * 60)
        print("RESUMEN DE DATOS DESCARGADOS")
        print("=" * 60)
        for p in sorted(self.sched_dir.glob("*.parquet")):
            df = pd.read_parquet(p)
            finished = df["home_score"].notna().sum() if "home_score" in df.columns else 0
            print(f"  {p.name:40s}  {len(df):5d} games  ({finished} finalizados)")
        for p in sorted(self.stats_dir.glob("*.parquet")):
            df = pd.read_parquet(p)
            print(f"  {p.name:40s}  {len(df):5d} filas")
        print("=" * 60)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    downloader = HistoricalDataDownloader()
    # Download 2023-2026 first (faster), then expand if needed
    downloader.download_core_historical(seasons=[2023, 2024, 2025, 2026])

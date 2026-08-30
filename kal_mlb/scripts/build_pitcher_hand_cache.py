#!/usr/bin/env python3
"""
Popula data/raw/pitcher_hands.json con la mano (L/R) de todos los abridores
que aparecen en los schedules descargados.

Necesario correrlo UNA VEZ (y luego cuando aparezcan abridores nuevos) antes
de que build_features.py pueda usar la feature de mano/matchup. Requiere
acceso de red a statsapi.mlb.com — no se puede correr en un sandbox sin
salida a ese dominio.

Uso:
    cd kal_mlb
    python scripts/build_pitcher_hand_cache.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.data.fetch_mlb import MLBDataFetcher  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kal.pitcher_hand_cache")

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "schedules"


def main() -> None:
    starter_ids: set[int] = set()
    for f in sorted(RAW_DIR.glob("schedule_*.feather")):
        df = pd.read_feather(f)
        for col in ("home_starter_id", "away_starter_id"):
            if col in df.columns:
                starter_ids.update(df[col].dropna().astype(int).tolist())

    if not starter_ids:
        logger.warning("No se encontraron starter_id en data/raw/schedules/*.feather")
        return

    logger.info("Consultando mano de %d abridores únicos ...", len(starter_ids))
    fetcher = MLBDataFetcher()
    fetcher.build_pitcher_hand_cache(sorted(starter_ids))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Descarga datos Statcast reales de Baseball Savant y genera
data/processed/team_statcast_rolling.feather para que build_features.py
pueda usar xwOBA/hard-hit%/barrel% como features.

⚠️ Requiere red de verdad a baseballsavant.mlb.com — no se pudo correr ni
verificar contra la API real desde el sandbox donde se escribió este código
(sin salida a ese dominio, confirmado con curl). Correr esto en tu entorno
real y revisar el log: si aparecen warnings de "columna no encontrada",
avisa para que se ajuste el nombre de columna en fetch_statcast.py.

Uso:
    cd kal_mlb
    python scripts/fetch_statcast_data.py --start 2023-03-01 --end 2026-08-30

Por defecto cubre desde el inicio de 2023 (primera temporada de
entrenamiento) hasta hoy. Puede tardar bastante la primera vez — usa
pybaseball.cache si está disponible y cachea por chunks semanales en
data/raw/statcast/, así que correrlo de nuevo solo trae lo nuevo.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.data.fetch_statcast import save_team_rolling_statcast  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kal.fetch_statcast")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2023-03-01")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--window-days", type=int, default=20)
    args = parser.parse_args()

    try:
        import pybaseball

        pybaseball.cache.enable()
    except ImportError:
        logger.error("pybaseball no está instalado: pip install pybaseball --break-system-packages")
        sys.exit(1)

    out_path = save_team_rolling_statcast(args.start, args.end, window_days=args.window_days)
    if out_path is None:
        logger.error(
            "No se generó el archivo de rolling Statcast. Revisar los warnings de arriba "
            "(puede ser un cambio de schema en Baseball Savant, o que el rango de fechas "
            "no tenga partidos)."
        )
        sys.exit(1)
    logger.info("Listo: %s", out_path)


if __name__ == "__main__":
    main()

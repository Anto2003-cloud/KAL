#!/usr/bin/env python3
"""
KAL MLB Predictor - Entry point
Usage:
    python main.py --schedule today
    python main.py --schedule 2026-08-29
    python main.py --standings
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

# Make sure src is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.data.fetch_mlb import MLBDataFetcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kal")


def cmd_schedule(args):
    fetcher = MLBDataFetcher()

    if args.date == "today":
        df = fetcher.get_today_schedule()
        label = "hoy"
    elif args.date == "tomorrow":
        df = fetcher.get_tomorrow_schedule()
        label = "mañana"
    else:
        df = fetcher.get_schedule(args.date)
        label = args.date

    if df.empty:
        logger.warning("No se encontraron partidos para %s", label)
        # fallback: mostrar ±1 día
        d = date.today() if args.date in ("today", "tomorrow") else date.fromisoformat(args.date)
        df = fetcher.get_schedule(d - timedelta(days=1), d + timedelta(days=1))
        logger.info("Mostrando partidos de ayer + hoy + mañana (%d juegos)", len(df))

    cols = [
        "game_date",
        "away_team_abbr",
        "home_team_abbr",
        "away_starter_name",
        "home_starter_name",
        "status",
        "away_score",
        "home_score",
        "venue_name",
    ]
    available = [c for c in cols if c in df.columns]
    print("\n" + "=" * 80)
    print(f"SCHEDULE MLB – {label.upper()}")
    print("=" * 80)
    print(df[available].to_string(index=False))
    print(f"\nTotal partidos: {len(df)}")

    if args.save:
        path = fetcher.save_schedule(df)
        print(f"Guardado en: {path}")


def cmd_standings(args):
    fetcher = MLBDataFetcher()
    df = fetcher.get_standings()
    print("\n" + "=" * 60)
    print("STANDINGS MLB 2026")
    print("=" * 60)
    print(df.sort_values(["division_id", "pct"], ascending=[True, False]).to_string(index=False))


def cmd_teams(args):
    fetcher = MLBDataFetcher()
    df = fetcher.get_teams()
    print(df.to_string(index=False))


def main():
    parser = argparse.ArgumentParser(description="KAL MLB Predictor")
    sub = parser.add_subparsers(dest="command")

    # schedule
    p_sched = sub.add_parser("schedule", help="Ver / guardar schedule")
    p_sched.add_argument(
        "--date",
        default="today",
        help="today | tomorrow | YYYY-MM-DD",
    )
    p_sched.add_argument("--save", action="store_true", help="Guardar parquet")
    p_sched.set_defaults(func=cmd_schedule)

    # standings
    p_stand = sub.add_parser("standings", help="Ver standings")
    p_stand.set_defaults(func=cmd_standings)

    # teams
    p_teams = sub.add_parser("teams", help="Listar equipos")
    p_teams.set_defaults(func=cmd_teams)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    args.func(args)


if __name__ == "__main__":
    main()

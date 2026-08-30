"""
KAL – Official lineups (when posted by MLB)

Sources:
  1. Schedule hydrate=lineups → homePlayers / awayPlayers (pre-game or live)
  2. Boxscore battingOrder (once game starts / final)

Lineup strength score (v1):
  - Prefer season AVG/OBP/SLG from boxscore player seasonStats when available
  - Else look up Baseball-Reference season batting by mlbID
  - Aggregate top-9 mean OPS as lineup_ops
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "data" / "raw"
INTEL = RAW / "intel"
INTEL.mkdir(parents=True, exist_ok=True)

MLB_API = "https://statsapi.mlb.com/api/v1"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "KAL-MLB/0.3", "Accept": "application/json"})


def _get(endpoint: str, params: Optional[dict] = None) -> dict:
    r = SESSION.get(f"{MLB_API}/{endpoint.lstrip('/')}", params=params or {}, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_schedule_with_lineups(target: date | str) -> pd.DataFrame:
    if isinstance(target, date):
        target = target.isoformat()
    data = _get(
        "schedule",
        {
            "sportId": 1,
            "date": target,
            "hydrate": "probablePitcher,lineups,team",
        },
    )
    rows = []
    for block in data.get("dates", []):
        for g in block.get("games", []):
            lu = g.get("lineups") or {}
            home_lu = lu.get("homePlayers") or []
            away_lu = lu.get("awayPlayers") or []
            home_team = g.get("teams", {}).get("home", {}).get("team", {})
            away_team = g.get("teams", {}).get("away", {}).get("team", {})
            rows.append(
                {
                    "game_pk": g.get("gamePk"),
                    "game_date": (g.get("officialDate") or g.get("gameDate") or "")[:10],
                    "status": g.get("status", {}).get("detailedState"),
                    "home_team_id": home_team.get("id"),
                    "home_team_abbr": home_team.get("abbreviation"),
                    "away_team_id": away_team.get("id"),
                    "away_team_abbr": away_team.get("abbreviation"),
                    "home_lineup_ids": [p.get("id") for p in home_lu if p.get("id")],
                    "away_lineup_ids": [p.get("id") for p in away_lu if p.get("id")],
                    "home_lineup_names": [p.get("fullName") for p in home_lu if p.get("fullName")],
                    "away_lineup_names": [p.get("fullName") for p in away_lu if p.get("fullName")],
                    "lineup_status": (
                        "confirmed"
                        if (len(home_lu) >= 8 and len(away_lu) >= 8)
                        else "projected_or_missing"
                    ),
                }
            )
    return pd.DataFrame(rows)


def fetch_boxscore_lineup(game_pk: int) -> dict:
    """Returns battingOrder ids + basic season OPS proxies if present."""
    try:
        bs = _get(f"game/{game_pk}/boxscore")
    except Exception as e:
        logger.warning("boxscore %s failed: %s", game_pk, e)
        return {}

    out = {}
    for side in ("home", "away"):
        team = bs.get("teams", {}).get(side, {})
        order = team.get("battingOrder") or []
        players = team.get("players") or {}
        names, ops_list = [], []
        for pid in order[:9]:
            p = players.get(f"ID{pid}", {})
            person = p.get("person", {})
            names.append(person.get("fullName"))
            bat = p.get("seasonStats", {}).get("batting", {})
            try:
                avg = float(bat.get("avg") or 0)
                obp = float(bat.get("obp") or avg)
                slg = float(bat.get("slg") or avg)
                ops_list.append(obp + slg)
            except Exception:
                pass
        out[f"{side}_lineup_ids"] = list(order[:9])
        out[f"{side}_lineup_names"] = names
        out[f"{side}_lineup_ops"] = float(np.mean(ops_list)) if ops_list else np.nan
    return out


def enrich_lineups_with_boxscore(lineups: pd.DataFrame) -> pd.DataFrame:
    """Fill missing lineups / OPS from boxscore when game has started."""
    if lineups.empty:
        return lineups
    rows = []
    for _, r in lineups.iterrows():
        d = r.to_dict()
        need = d.get("lineup_status") != "confirmed" or not d.get("home_lineup_ids")
        if need or True:  # always try OPS from boxscore when available
            box = fetch_boxscore_lineup(int(d["game_pk"]))
            if box:
                if not d.get("home_lineup_ids") and box.get("home_lineup_ids"):
                    d["home_lineup_ids"] = box["home_lineup_ids"]
                    d["home_lineup_names"] = box.get("home_lineup_names")
                    d["lineup_status"] = "confirmed"
                if not d.get("away_lineup_ids") and box.get("away_lineup_ids"):
                    d["away_lineup_ids"] = box["away_lineup_ids"]
                    d["away_lineup_names"] = box.get("away_lineup_names")
                    d["lineup_status"] = "confirmed"
                d["home_lineup_ops"] = box.get("home_lineup_ops")
                d["away_lineup_ops"] = box.get("away_lineup_ops")
        rows.append(d)
    return pd.DataFrame(rows)


def load_batting_lookup() -> pd.DataFrame:
    """mlbID → OPS from latest BRef season available."""
    frames = []
    for year in (2025, 2024, 2023):
        p = RAW / "stats" / f"batting_bref_{year}.feather"
        if p.exists():
            df = pd.read_feather(p)
            if "mlbID" in df.columns:
                df = df.copy()
                df["player_id"] = pd.to_numeric(df["mlbID"], errors="coerce")
                # OPS if present else OBP+SLG
                if "OPS" in df.columns:
                    df["ops"] = pd.to_numeric(df["OPS"], errors="coerce")
                else:
                    df["ops"] = pd.to_numeric(df.get("OBP"), errors="coerce") + pd.to_numeric(
                        df.get("SLG"), errors="coerce"
                    )
                frames.append(df[["player_id", "ops", "Name"]].dropna(subset=["player_id"]))
                break
    if not frames:
        return pd.DataFrame(columns=["player_id", "ops"])
    return frames[0].drop_duplicates("player_id")


def score_lineup_ids(ids: list, lookup: pd.DataFrame) -> float:
    if not ids or lookup.empty:
        return np.nan
    sub = lookup[lookup["player_id"].isin(ids)]
    if sub.empty:
        return np.nan
    return float(sub["ops"].mean())


def attach_lineup_features(games: pd.DataFrame, target_date: Optional[date] = None) -> pd.DataFrame:
    """
    Merge lineup confirmation + OPS strength onto game rows.
    """
    if games.empty:
        return games

    if target_date is None:
        if "game_date" in games.columns:
            gd = pd.to_datetime(games["game_date"].iloc[0])
            target_date = gd.date() if hasattr(gd, "date") else date.today()
        else:
            target_date = date.today()

    lu = fetch_schedule_with_lineups(target_date)
    if lu.empty:
        games["lineup_status"] = "missing"
        games["home_lineup_ops"] = np.nan
        games["away_lineup_ops"] = np.nan
        games["lineup_ops_diff"] = 0.0
        return games

    lu = enrich_lineups_with_boxscore(lu)
    lookup = load_batting_lookup()

    def fill_ops(row, side):
        val = row.get(f"{side}_lineup_ops")
        if pd.notna(val):
            return val
        return score_lineup_ids(row.get(f"{side}_lineup_ids") or [], lookup)

    lu["home_lineup_ops"] = lu.apply(lambda r: fill_ops(r, "home"), axis=1)
    lu["away_lineup_ops"] = lu.apply(lambda r: fill_ops(r, "away"), axis=1)
    lu["lineup_ops_diff"] = lu["home_lineup_ops"].fillna(0.7) - lu["away_lineup_ops"].fillna(0.7)

    keep = [
        "game_pk",
        "lineup_status",
        "home_lineup_ops",
        "away_lineup_ops",
        "lineup_ops_diff",
        "home_lineup_names",
        "away_lineup_names",
    ]
    keep = [c for c in keep if c in lu.columns]
    games = games.merge(lu[keep], on="game_pk", how="left")
    games["lineup_status"] = games["lineup_status"].fillna("missing")
    games["lineup_ops_diff"] = games["lineup_ops_diff"].fillna(0.0)

    # Persist snapshot
    snap = INTEL / f"lineups_{target_date.isoformat()}.feather"
    # lists → strings for feather
    lu_save = lu.copy()
    for c in ("home_lineup_ids", "away_lineup_ids", "home_lineup_names", "away_lineup_names"):
        if c in lu_save.columns:
            lu_save[c] = lu_save[c].apply(lambda x: "|".join(map(str, x)) if isinstance(x, list) else x)
    try:
        lu_save.to_feather(snap)
        lu_save.to_feather(INTEL / "lineups_latest.feather")
    except Exception as e:
        logger.warning("Could not save lineup snapshot: %s", e)

    n_conf = int((games["lineup_status"] == "confirmed").sum())
    logger.info("Lineups: %d/%d games confirmed for %s", n_conf, len(games), target_date)
    return games


LINEUP_FEATURE_COLS = [
    "home_lineup_ops",
    "away_lineup_ops",
    "lineup_ops_diff",
]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    for d in [date(2026, 8, 29), date(2026, 8, 30)]:
        df = fetch_schedule_with_lineups(d)
        print(d, "games", len(df), "confirmed", (df["lineup_status"] == "confirmed").sum())
        if not df.empty:
            print(df[["away_team_abbr", "home_team_abbr", "lineup_status", "home_lineup_names"]].head(3))

"""
KAL MLB Predictor - Data fetching from official MLB Stats API
Uses python-mlb-statsapi when available, falls back to direct requests.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any, Optional

import pandas as pd
import requests
import yaml

logger = logging.getLogger(__name__)

# Base URL of the official MLB Stats API
MLB_STATS_API = "https://statsapi.mlb.com/api/v1"


class MLBDataFetcher:
    """Fetch schedule, teams, players, stats and game data from MLB Stats API."""

    def __init__(self, config_path: str | Path = "config/settings.yaml"):
        self.config = self._load_config(config_path)
        self.raw_dir = Path(self.config["paths"]["raw"])
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "KAL-MLB-Predictor/0.1 (research)",
                "Accept": "application/json",
            }
        )

    def _load_config(self, path: str | Path) -> dict:
        path = Path(path)
        if not path.exists():
            # fallback relative to this file
            path = Path(__file__).resolve().parents[2] / "config" / "settings.yaml"
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _get(self, endpoint: str, params: Optional[dict] = None) -> dict:
        url = f"{MLB_STATS_API}/{endpoint.lstrip('/')}"
        resp = self.session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Schedule
    # ------------------------------------------------------------------
    def get_schedule(
        self,
        start_date: str | date,
        end_date: Optional[str | date] = None,
        team_id: Optional[int] = None,
        hydrate: str = "probablePitcher,team,weather,officials",
    ) -> pd.DataFrame:
        """
        Download schedule for a date range.
        Returns one row per game with key columns + probable pitchers.
        """
        if isinstance(start_date, date):
            start_date = start_date.isoformat()
        if end_date is None:
            end_date = start_date
        elif isinstance(end_date, date):
            end_date = end_date.isoformat()

        params = {
            "sportId": self.config["mlb"]["sport_id"],
            "startDate": start_date,
            "endDate": end_date,
            "hydrate": hydrate,
        }
        if team_id:
            params["teamId"] = team_id

        data = self._get("schedule", params)
        games = []

        for date_block in data.get("dates", []):
            for g in date_block.get("games", []):
                games.append(self._parse_game(g))

        df = pd.DataFrame(games)
        if not df.empty:
            df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
        return df

    def _parse_game(self, g: dict) -> dict:
        """Normalize a single game object from the schedule endpoint."""
        teams = g.get("teams", {})
        home = teams.get("home", {})
        away = teams.get("away", {})

        home_team = home.get("team", {})
        away_team = away.get("team", {})

        home_prob = home.get("probablePitcher") or {}
        away_prob = away.get("probablePitcher") or {}

        weather = g.get("weather") or {}
        venue = g.get("venue") or {}

        status = g.get("status", {})
        detailed_state = status.get("detailedState", "")

        return {
            "game_pk": g.get("gamePk"),
            "game_date": g.get("gameDate", "")[:10],
            "game_datetime": g.get("gameDate"),
            "status": detailed_state,
            "abstract_state": status.get("abstractGameState"),
            "home_team_id": home_team.get("id"),
            "home_team": home_team.get("name"),
            "home_team_abbr": (
                home_team.get("abbreviation")
                or (home_team.get("teamCode") or "").upper()
                or None
            ),
            "away_team_id": away_team.get("id"),
            "away_team": away_team.get("name"),
            "away_team_abbr": (
                away_team.get("abbreviation")
                or (away_team.get("teamCode") or "").upper()
                or None
            ),
            "home_score": home.get("score"),
            "away_score": away.get("score"),
            "home_starter_id": home_prob.get("id"),
            "home_starter_name": home_prob.get("fullName"),
            "away_starter_id": away_prob.get("id"),
            "away_starter_name": away_prob.get("fullName"),
            "venue_id": venue.get("id"),
            "venue_name": venue.get("name"),
            "day_night": g.get("dayNight"),
            "temperature": weather.get("temp"),
            "wind": weather.get("wind"),
            "condition": weather.get("condition"),
            "season": g.get("season"),
            "series_description": g.get("seriesDescription"),
            "game_type": g.get("gameType"),
        }

    def get_today_schedule(self) -> pd.DataFrame:
        today = date.today().isoformat()
        return self.get_schedule(today)

    def get_tomorrow_schedule(self) -> pd.DataFrame:
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        return self.get_schedule(tomorrow)

    # ------------------------------------------------------------------
    # Teams & Standings
    # ------------------------------------------------------------------
    def get_teams(self, season: Optional[int] = None) -> pd.DataFrame:
        season = season or self.config["project"]["season"]
        data = self._get("teams", {"sportId": 1, "season": season})
        rows = []
        for t in data.get("teams", []):
            rows.append(
                {
                    "team_id": t["id"],
                    "name": t["name"],
                    "abbreviation": t.get("abbreviation"),
                    "team_code": t.get("teamCode"),
                    "league_id": t.get("league", {}).get("id"),
                    "division_id": t.get("division", {}).get("id"),
                    "venue_id": t.get("venue", {}).get("id"),
                    "venue_name": t.get("venue", {}).get("name"),
                }
            )
        return pd.DataFrame(rows)

    def get_standings(self, season: Optional[int] = None) -> pd.DataFrame:
        season = season or self.config["project"]["season"]
        data = self._get(
            "standings",
            {"leagueId": "103,104", "season": season, "standingsTypes": "regularSeason"},
        )
        rows = []
        for record in data.get("records", []):
            division = record.get("division", {})
            for team_rec in record.get("teamRecords", []):
                team = team_rec.get("team", {})
                rows.append(
                    {
                        "team_id": team.get("id"),
                        "team_name": team.get("name"),
                        "division_id": division.get("id"),
                        "wins": team_rec.get("wins"),
                        "losses": team_rec.get("losses"),
                        "pct": team_rec.get("winningPercentage"),
                        "games_back": team_rec.get("gamesBack"),
                        "wild_card_games_back": team_rec.get("wildCardGamesBack"),
                        "run_diff": team_rec.get("runDifferential"),
                        "streak": team_rec.get("streak", {}).get("streakCode"),
                    }
                )
        return pd.DataFrame(rows)

    # ------------------------------------------------------------------
    # Players & Stats
    # ------------------------------------------------------------------
    def get_person(self, person_id: int) -> dict:
        data = self._get(f"people/{person_id}")
        people = data.get("people", [])
        return people[0] if people else {}

    def get_pitcher_hands_bulk(self, person_ids: list[int]) -> dict[int, str]:
        """
        Fetch throwing hand ('L' or 'R') for a list of pitcher IDs.
        Uses the bulk /people?personIds=... endpoint (up to ~100 IDs per call
        is safe in practice; MLB doesn't publish a hard limit but large batches
        can 400 — chunk defensively at 50).
        Returns {person_id: 'L'|'R'}. IDs that fail to resolve are omitted,
        not silently defaulted, so callers can tell the difference between
        "known righty" and "unknown".
        """
        ids = sorted({int(i) for i in person_ids if pd.notna(i)})
        hands: dict[int, str] = {}
        chunk = 50
        for i in range(0, len(ids), chunk):
            batch = ids[i : i + chunk]
            try:
                data = self._get("people", {"personIds": ",".join(str(x) for x in batch)})
            except requests.RequestException as e:
                logger.warning("Fallo consultando mano de %d lanzadores: %s", len(batch), e)
                continue
            for person in data.get("people", []):
                pid = person.get("id")
                code = (person.get("pitchHand") or {}).get("code")
                if pid is not None and code in ("L", "R"):
                    hands[pid] = code
        logger.info("Mano obtenida para %d/%d lanzadores", len(hands), len(ids))
        return hands

    def build_pitcher_hand_cache(
        self, person_ids: list[int], cache_filename: str = "pitcher_hands.json"
    ) -> Path:
        """
        Fetch + merge into a persistent cache file so build_features.py can
        attach handedness without re-hitting the API on every run. Existing
        entries are kept; only unknown IDs are fetched.
        """
        cache_path = self.raw_dir / cache_filename
        existing: dict[str, str] = {}
        if cache_path.exists():
            existing = json.loads(cache_path.read_text(encoding="utf-8"))

        known_ids = {int(k) for k in existing.keys()}
        missing = [pid for pid in person_ids if pd.notna(pid) and int(pid) not in known_ids]
        if missing:
            new_hands = self.get_pitcher_hands_bulk(missing)
            existing.update({str(k): v for k, v in new_hands.items()})
            cache_path.write_text(
                json.dumps(existing, indent=2, sort_keys=True), encoding="utf-8"
            )
            logger.info(
                "Cache de mano de lanzadores actualizado: %d nuevos, %d total → %s",
                len(new_hands),
                len(existing),
                cache_path,
            )
        else:
            logger.info("Cache de mano de lanzadores ya cubre los %d IDs pedidos", len(person_ids))
        return cache_path

    def get_player_stats(
        self,
        person_id: int,
        group: str = "pitching",  # pitching | hitting | fielding
        season: Optional[int] = None,
        stats: str = "season",
    ) -> dict:
        season = season or self.config["project"]["season"]
        params = {
            "stats": stats,
            "group": group,
            "season": season,
            "sportId": 1,
        }
        data = self._get(f"people/{person_id}/stats", params)
        return data

    def get_team_roster(self, team_id: int, season: Optional[int] = None) -> pd.DataFrame:
        season = season or self.config["project"]["season"]
        data = self._get(f"teams/{team_id}/roster", {"season": season, "rosterType": "active"})
        rows = []
        for p in data.get("roster", []):
            person = p.get("person", {})
            rows.append(
                {
                    "player_id": person.get("id"),
                    "full_name": person.get("fullName"),
                    "jersey_number": p.get("jerseyNumber"),
                    "position": p.get("position", {}).get("abbreviation"),
                    "status": p.get("status", {}).get("description"),
                }
            )
        return pd.DataFrame(rows)

    # ------------------------------------------------------------------
    # Game feed (boxscore, linescore, plays) – useful later
    # ------------------------------------------------------------------
    def get_game_feed(self, game_pk: int) -> dict:
        return self._get(f"game/{game_pk}/feed/live")

    def get_boxscore(self, game_pk: int) -> dict:
        return self._get(f"game/{game_pk}/boxscore")

    # ------------------------------------------------------------------
    # Convenience: save to disk
    # ------------------------------------------------------------------
    def save_schedule(self, df: pd.DataFrame, filename: Optional[str] = None) -> Path:
        if filename is None:
            if df.empty:
                filename = f"schedule_{date.today().isoformat()}.feather"
            else:
                dmin = df["game_date"].min()
                dmax = df["game_date"].max()
                filename = f"schedule_{dmin}_to_{dmax}.feather"
        path = self.raw_dir / filename
        df = df.copy()
        if "game_date" in df.columns:
            df["game_date"] = df["game_date"].astype(str)
        df.to_feather(path)
        logger.info("Saved schedule → %s (%d games)", path, len(df))
        return path

    def save_json(self, data: Any, filename: str) -> Path:
        path = self.raw_dir / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        return path


# ------------------------------------------------------------------
# Quick CLI test
# ------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    fetcher = MLBDataFetcher()

    print("=== Teams 2026 ===")
    teams = fetcher.get_teams(2026)
    print(teams.head(10).to_string(index=False))
    print(f"Total teams: {len(teams)}")

    print("\n=== Schedule today ===")
    today = fetcher.get_today_schedule()
    if today.empty:
        print("No games today (or API returned empty). Trying yesterday + tomorrow...")
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        sched = fetcher.get_schedule(yesterday, tomorrow)
    else:
        sched = today

    cols = [
        "game_pk",
        "game_date",
        "away_team_abbr",
        "home_team_abbr",
        "away_starter_name",
        "home_starter_name",
        "status",
        "away_score",
        "home_score",
    ]
    available = [c for c in cols if c in sched.columns]
    print(sched[available].to_string(index=False))
    print(f"\nGames found: {len(sched)}")

    if not sched.empty:
        path = fetcher.save_schedule(sched)
        print(f"Saved to {path}")

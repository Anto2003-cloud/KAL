"""
KAL MLB Intelligence Layer
Continuous collection: rosters, transactions, standings, team depth, news headlines.
Designed to run on a schedule (hourly / daily).
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

from .fetch_mlb import MLBDataFetcher

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "data" / "raw"
INTEL = RAW / "intel"
INTEL.mkdir(parents=True, exist_ok=True)

MLB_API = "https://statsapi.mlb.com/api/v1"


class MLBIntelligence:
    """Collects the live knowledge base KAL needs to stay current."""

    def __init__(self):
        self.fetcher = MLBDataFetcher()
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "KAL-MLB-Intel/0.2", "Accept": "application/json"}
        )

    def _get(self, endpoint: str, params: Optional[dict] = None) -> dict:
        url = f"{MLB_API}/{endpoint.lstrip('/')}"
        r = self.session.get(url, params=params or {}, timeout=30)
        r.raise_for_status()
        return r.json()

    # ------------------------------------------------------------------
    # Rosters (40-man) – all 30 teams
    # ------------------------------------------------------------------
    def download_all_rosters(self, season: int = 2026) -> pd.DataFrame:
        teams = self.fetcher.get_teams(season)
        rows = []
        for _, t in teams.iterrows():
            tid = int(t["team_id"])
            try:
                data = self._get(
                    f"teams/{tid}/roster",
                    {"rosterType": "40Man", "season": season},
                )
                for p in data.get("roster", []):
                    person = p.get("person", {})
                    pos = p.get("position", {})
                    status = p.get("status", {})
                    rows.append(
                        {
                            "team_id": tid,
                            "team_abbr": t.get("abbreviation"),
                            "team_name": t.get("name"),
                            "player_id": person.get("id"),
                            "full_name": person.get("fullName"),
                            "jersey": p.get("jerseyNumber"),
                            "position": pos.get("abbreviation"),
                            "position_type": pos.get("type"),
                            "status_code": status.get("code"),
                            "status": status.get("description"),
                            "as_of": date.today().isoformat(),
                        }
                    )
                time.sleep(0.12)
            except Exception as e:
                logger.warning("Roster fail team %s: %s", tid, e)
        df = pd.DataFrame(rows)
        path = INTEL / f"rosters_{date.today().isoformat()}.feather"
        if not df.empty:
            df.to_feather(path)
            # also keep a "latest" pointer
            df.to_feather(INTEL / "rosters_latest.feather")
        logger.info("Rosters: %d players across %d teams → %s", len(df), df["team_id"].nunique() if not df.empty else 0, path.name)
        return df

    # ------------------------------------------------------------------
    # Transactions (last N days) – injuries, call-ups, trades, DL moves
    # ------------------------------------------------------------------
    def download_transactions(
        self,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> pd.DataFrame:
        end = end or date.today()
        start = start or (end - timedelta(days=14))
        data = self._get(
            "transactions",
            {
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
            },
        )
        rows = []
        for tx in data.get("transactions", []):
            person = tx.get("person", {})
            team = tx.get("toTeam") or tx.get("fromTeam") or {}
            rows.append(
                {
                    "transaction_id": tx.get("id"),
                    "date": (tx.get("date") or "")[:10],
                    "type_code": tx.get("typeCode"),
                    "type_desc": tx.get("typeDesc"),
                    "description": tx.get("description"),
                    "player_id": person.get("id"),
                    "player_name": person.get("fullName"),
                    "team_id": team.get("id"),
                    "team_name": team.get("name"),
                    "effective_date": (tx.get("effectiveDate") or "")[:10],
                }
            )
        df = pd.DataFrame(rows)
        path = INTEL / f"transactions_{start.isoformat()}_to_{end.isoformat()}.feather"
        if not df.empty:
            df.to_feather(path)
            df.to_feather(INTEL / "transactions_latest.feather")
        logger.info("Transactions: %d rows → %s", len(df), path.name)
        return df

    # ------------------------------------------------------------------
    # Standings snapshot
    # ------------------------------------------------------------------
    def download_standings_snapshot(self) -> pd.DataFrame:
        df = self.fetcher.get_standings()
        df["as_of"] = date.today().isoformat()
        path = INTEL / f"standings_{date.today().isoformat()}.feather"
        df.to_feather(path)
        df.to_feather(INTEL / "standings_latest.feather")
        logger.info("Standings snapshot: %d teams", len(df))
        return df

    # ------------------------------------------------------------------
    # Probable pitchers + today's / tomorrow's slate (refresh)
    # ------------------------------------------------------------------
    def refresh_schedule_window(self, days_ahead: int = 3) -> pd.DataFrame:
        start = date.today() - timedelta(days=1)
        end = date.today() + timedelta(days=days_ahead)
        df = self.fetcher.get_schedule(start.isoformat(), end.isoformat())
        path = INTEL / "schedule_window_latest.feather"
        if not df.empty:
            df["game_date"] = df["game_date"].astype(str)
            df.to_feather(path)
        logger.info("Schedule window: %d games (%s → %s)", len(df), start, end)
        return df

    # ------------------------------------------------------------------
    # Simple news / headlines via MLB.com news endpoint if available
    # ------------------------------------------------------------------
    def fetch_mlb_headlines(self, limit: int = 30) -> list[dict]:
        """
        Pull recent MLB news items from the public content API.
        Best-effort; structure may change.
        """
        headlines = []
        try:
            # Public content feed used by mlb.com
            url = "https://www.mlb.com/news"
            # Prefer structured JSON if present
            r = self.session.get(
                "https://www.mlb.com/data-service/content/list",
                params={"contentType": "news", "limit": limit},
                timeout=20,
            )
            if r.status_code == 200:
                data = r.json()
                items = data if isinstance(data, list) else data.get("items", data.get("content", []))
                for it in items[:limit]:
                    headlines.append(
                        {
                            "title": it.get("title") or it.get("headline"),
                            "url": it.get("url") or it.get("slug"),
                            "date": it.get("date") or it.get("published"),
                            "blurb": (it.get("blurb") or it.get("description") or "")[:300],
                        }
                    )
        except Exception as e:
            logger.warning("Headlines fetch limited: %s", e)

        path = INTEL / f"headlines_{date.today().isoformat()}.json"
        path.write_text(json.dumps(headlines, ensure_ascii=False, indent=2, default=str))
        logger.info("Headlines stored: %d", len(headlines))
        return headlines

    # ------------------------------------------------------------------
    # Full intelligence refresh (one shot)
    # ------------------------------------------------------------------
    def full_refresh(self) -> dict:
        logger.info("=" * 60)
        logger.info("KAL INTEL REFRESH – %s", datetime.now().isoformat())
        logger.info("=" * 60)
        out = {}
        out["rosters"] = len(self.download_all_rosters())
        out["transactions"] = len(self.download_transactions())
        out["standings"] = len(self.download_standings_snapshot())
        out["schedule"] = len(self.refresh_schedule_window())
        out["headlines"] = len(self.fetch_mlb_headlines())
        # Index of archived roster snapshots (for future IL time-series)
        hist = sorted(INTEL.glob("rosters_20*.feather"))
        index = [{"file": p.name, "date": p.stem.replace("rosters_", ""), "bytes": p.stat().st_size} for p in hist]
        (INTEL / "roster_history_index.json").write_text(json.dumps(index, indent=2))
        out["roster_snapshots"] = len(index)

        summary_path = INTEL / "last_refresh.json"
        summary_path.write_text(
            json.dumps(
                {"refreshed_at": datetime.now().isoformat(), **out},
                indent=2,
            )
        )
        logger.info("Intel refresh done: %s", out)
        return out


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    intel = MLBIntelligence()
    intel.full_refresh()

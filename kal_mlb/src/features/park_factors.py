"""
Simple park factors (runs) by venue / team home.
Values are approximate relative factors (1.00 = league average).
Sources: historical run environment approximations for modern parks.
"""

from __future__ import annotations

# park_factor_runs: higher = more offense
PARK_FACTORS = {
    # American League
    "NYY": 1.02,
    "BOS": 1.04,
    "TB": 0.97,
    "TOR": 1.01,
    "BAL": 1.03,
    "CWS": 1.00,
    "CLE": 0.98,
    "DET": 0.99,
    "KC": 1.01,
    "MIN": 1.02,
    "HOU": 0.98,
    "SEA": 0.95,
    "TEX": 1.03,
    "ATH": 0.97,  # Sacramento / temporary
    "LAA": 0.99,
    # National League
    "ATL": 1.02,
    "MIA": 0.96,
    "NYM": 0.98,
    "PHI": 1.03,
    "WSH": 1.00,
    "CHC": 1.04,
    "CIN": 1.05,
    "MIL": 1.01,
    "PIT": 0.97,
    "STL": 0.99,
    "ARI": 1.03,
    "AZ": 1.03,
    "COL": 1.25,  # Coors
    "LAD": 0.97,
    "SD": 0.94,   # Petco
    "SF": 0.93,   # Oracle
}

# HR-friendly parks (for later use)
PARK_HR_FACTORS = {
    "COL": 1.35,
    "CIN": 1.15,
    "NYY": 1.10,
    "PHI": 1.12,
    "BOS": 1.05,
    "CHC": 1.08,
    "TEX": 1.10,
    "SD": 0.85,
    "SF": 0.80,
    "SEA": 0.88,
    "MIA": 0.90,
    "PIT": 0.92,
}


def park_factor_for_team(abbr: str | None) -> float:
    if not abbr:
        return 1.0
    return float(PARK_FACTORS.get(str(abbr).upper(), 1.0))


def park_hr_factor_for_team(abbr: str | None) -> float:
    if not abbr:
        return 1.0
    return float(PARK_HR_FACTORS.get(str(abbr).upper(), 1.0))

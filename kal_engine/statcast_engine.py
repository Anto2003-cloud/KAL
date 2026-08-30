"""
KAL MLB - 9-Pillar High-Power Engine

⚠️  ESTE MÓDULO NO ES UN FETCHER DE DATOS REALES.

Es una calculadora de "edge" que toma un dict `match` con ~20 métricas
(Stuff+, xwOBA, barrel%, etc.) y, si no vienen, usa VALORES POR DEFECTO
FIJOS y CONSTANTES (ej. home_sp_stuff_plus=104, away=98 siempre) más unos
coeficientes lineales puestos a mano (*0.005, *0.85, *0.018...) sin
backtesting. No consulta Statcast, Baseball Savant, ni ninguna API — nada
en `kal_mlb/` lo importa ni lo llama (ver grep, cero referencias).

El panel "Modelo (9 Factores)" del frontend (DeepNinePillarsView.tsx) usa
datos de muestra hardcodeados (src/data/ninePillarsData.ts), no la salida
de este archivo ni del modelo LightGBM real entrenado en kal_mlb/.

Antes de "conectar" esto a algo real, hace falta reemplazarlo por un
fetcher genuino que traiga xwOBA/barrel%/hard-hit% reales por equipo y
por rango de fechas — eso ya existe: ver kal_mlb/src/data/fetch_statcast.py
(usa pybaseball contra Baseball Savant) + kal_mlb/scripts/fetch_statcast_data.py
para poblar el cache. Ese fetcher se escribió en un entorno sin salida de
red a Baseball Savant, así que su lógica de agregación se probó con datos
sintéticos pero NO contra la API real — hay que correrlo y verificarlo en
un entorno con red antes de confiar en los números.

Pitcher + Bateadores + Bullpen + Lesiones + Lineup + Statcast + Matchup + Parque + Clima
-> KAL Model -> Winner + Win Probability + Multi-Factor Explainability -> Outcome -> Learning
"""

import math
from typing import Dict, Any, List, Tuple
import numpy as np

PILLAR_NAMES = [
    "pitcher",     # SP Stuff+, Whiff%, K-BB%, FIP
    "batters",     # wRC+, xwOBA, Hard-Hit%, Plate Discipline
    "bullpen",     # Leverage Index xFIP, 48h Fatigue, Closer Availability
    "injuries",    # IL WAR Value Loss (Key starters missing)
    "lineup",      # Confirmed batting order weights (1-4 get 45% PA)
    "statcast",    # Exit Velocity (EV 95+ mph), Barrel%, Launch Angle Spread
    "matchup",     # Handedness splits (vs LHP/RHP) & Pitch Repertoire Match
    "park",        # Elevation, Dimensions, Run/HR Park Factors
    "weather"      # Temp (°F), Wind Speed & Direction, Humidity & Air Density
]

class StatcastPillarExtractor:
    """Extracts high-resolution sabermetric metrics across 9 pillars."""

    @staticmethod
    def extract_full_match_matrix(match: Dict[str, Any]) -> Dict[str, Any]:
        # 1. PITCHER PILLAR (SP Metrics)
        h_stuff = float(match.get("home_sp_stuff_plus", 104))
        a_stuff = float(match.get("away_sp_stuff_plus", 98))
        h_whiff = float(match.get("home_sp_whiff_pct", 28.5))
        a_whiff = float(match.get("away_sp_whiff_pct", 24.2))
        pitcher_edge = ((h_stuff - a_stuff) * 0.005) + ((h_whiff - a_whiff) * 0.012)

        # 2. BATTERS PILLAR (Team Offensive Core)
        h_wrc = float(match.get("home_team_wrc_plus", 112))
        a_wrc = float(match.get("away_team_wrc_plus", 106))
        h_xwoba = float(match.get("home_team_xwoba", 0.335))
        a_xwoba = float(match.get("away_team_xwoba", 0.320))
        batters_edge = ((h_wrc - a_wrc) * 0.004) + ((h_xwoba - a_xwoba) * 0.85)

        # 3. BULLPEN PILLAR (Leverage & Fatigue)
        h_bp_xfip = float(match.get("home_bp_xfip", 3.65))
        a_bp_xfip = float(match.get("away_bp_xfip", 3.90))
        h_bp_fatigue = float(match.get("home_bp_ip_48h", 5.2))
        a_bp_fatigue = float(match.get("away_bp_ip_48h", 8.4))
        bullpen_edge = (a_bp_xfip - h_bp_xfip) * 0.06 + (a_bp_fatigue - h_bp_fatigue) * 0.015

        # 4. INJURIES PILLAR (WAR Lost on IL)
        h_war_lost = float(match.get("home_il_war_loss", 0.8)) # e.g. Starting SS on IL
        a_war_lost = float(match.get("away_il_war_loss", 2.4)) # e.g. Cleanup hitter + setup man on IL
        injuries_edge = (a_war_lost - h_war_lost) * 0.025

        # 5. LINEUP PILLAR (Confirmed Order & Top 4 Weighting)
        h_top4_ops = float(match.get("home_lineup_top4_ops", 0.840))
        a_top4_ops = float(match.get("away_lineup_top4_ops", 0.780))
        lineup_confirmed = bool(match.get("lineup_confirmed", True))
        lineup_edge = (h_top4_ops - a_top4_ops) * 0.15 * (1.0 if lineup_confirmed else 0.7)

        # 6. STATCAST PILLAR (Barrel% & Exit Velocity > 95mph)
        h_barrel = float(match.get("home_barrel_pct", 9.4))
        a_barrel = float(match.get("away_barrel_pct", 7.8))
        h_hard_hit = float(match.get("home_hard_hit_pct", 42.5))
        a_hard_hit = float(match.get("away_hard_hit_pct", 38.2))
        statcast_edge = ((h_barrel - a_barrel) * 0.018) + ((h_hard_hit - a_hard_hit) * 0.004)

        # 7. MATCHUP PILLAR (Handedness vs Pitch Repertoire)
        h_v_hand_woba = float(match.get("home_woba_vs_hand", 0.345))
        a_v_hand_woba = float(match.get("away_woba_vs_hand", 0.315))
        matchup_edge = (h_v_hand_woba - a_v_hand_woba) * 0.70

        # 8. PARK PILLAR (Altitude & Dimensions)
        park_factor = float(match.get("park_run_factor", 1.04))
        park_edge = (park_factor - 1.0) * 0.08

        # 9. WEATHER PILLAR (Wind direction, Temp, Air Density)
        temp_f = float(match.get("temp_f", 76))
        wind_mph = float(match.get("wind_mph", 8))
        wind_dir = match.get("wind_dir", "OUT_TO_LF") # 'OUT_TO_LF', 'IN_FROM_CF', 'CALM'
        wind_impact = (wind_mph * 0.004) if "OUT" in wind_dir else (-(wind_mph * 0.004) if "IN" in wind_dir else 0.0)
        temp_impact = (temp_f - 70.0) * 0.001
        weather_edge = wind_impact + temp_impact

        # Vector summary
        vector = [
            pitcher_edge, batters_edge, bullpen_edge, injuries_edge,
            lineup_edge, statcast_edge, matchup_edge, park_edge, weather_edge
        ]

        return {
            "vector": np.array(vector, dtype=np.float32),
            "pillars_breakdown": {
                "pitcher": {"edge": pitcher_edge, "favors": "HOME" if pitcher_edge > 0 else "AWAY", "desc": f"Stuff+ ({h_stuff} vs {a_stuff}) & Whiff ({h_whiff}% vs {a_whiff}%)"},
                "batters": {"edge": batters_edge, "favors": "HOME" if batters_edge > 0 else "AWAY", "desc": f"wRC+ ({h_wrc} vs {a_wrc}) & xwOBA"},
                "bullpen": {"edge": bullpen_edge, "favors": "HOME" if bullpen_edge > 0 else "AWAY", "desc": f"xFIP Bullpen ({h_bp_xfip} vs {a_bp_xfip}) y fatiga 48h"},
                "injuries": {"edge": injuries_edge, "favors": "HOME" if injuries_edge > 0 else "AWAY", "desc": f"Impacto IL WAR perdido ({h_war_lost} vs {a_war_lost})"},
                "lineup": {"edge": lineup_edge, "favors": "HOME" if lineup_edge > 0 else "AWAY", "desc": f"Top 1-4 OPS ({h_top4_ops} vs {a_top4_ops})"},
                "statcast": {"edge": statcast_edge, "favors": "HOME" if statcast_edge > 0 else "AWAY", "desc": f"Barrel% ({h_barrel}% vs {a_barrel}%) y Hard-Hit%"},
                "matchup": {"edge": matchup_edge, "favors": "HOME" if matchup_edge > 0 else "AWAY", "desc": f"wOBA vs Mano del Abridor ({h_v_hand_woba} vs {a_v_hand_woba})"},
                "park": {"edge": park_edge, "favors": "HOME", "desc": f"Factor de Estadio {park_factor:.2f}"},
                "weather": {"edge": weather_edge, "favors": "HOME" if weather_edge > 0 else "NEUTRAL", "desc": f"{temp_f}°F, Viento {wind_mph}mph ({wind_dir})"}
            }
        }

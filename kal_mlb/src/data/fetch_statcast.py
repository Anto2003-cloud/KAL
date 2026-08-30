"""
KAL MLB - Fetcher REAL de datos Statcast (Baseball Savant), vía pybaseball.

Este es el reemplazo real de kal_engine/statcast_engine.py (que era una
fórmula con constantes fijas, no un fetcher). Trae datos pitch-by-pitch
reales de Baseball Savant y los agrega a nivel equipo/día para poder
calcular rolling windows (ej. "últimos 20 días") sin fugarse al futuro.

⚠️ AVISO IMPORTANTE — no verificado contra datos reales:
Este código se escribió en un entorno sin salida de red a
baseballsavant.mlb.com (confirmado con curl → 403), así que no se pudo
ejecutar contra la API real ni confirmar que los nombres de columna que
pybaseball devuelve hoy coincidan exactamente con los que se usan acá.
La lógica de agregación SÍ se probó con datos sintéticos que imitan el
schema documentado públicamente de Statcast (game_date, batter, pitcher,
events, launch_speed, launch_angle, launch_speed_angle,
estimated_woba_using_speedangle, home_team, away_team, inning_topbot).

Antes de confiar en esto, correr en un entorno con red real:
    python scripts/fetch_statcast_data.py --start 2026-04-01 --end 2026-04-08
y revisar el log de columnas encontradas / faltantes que imprime
attach_team_batted_ball_metrics() — está escrito para degradar (loggear y
omitir la métrica) en vez de fallar si algún nombre de columna cambió.

Métricas que trae:
  - hard_hit_pct: % de bolas bateadas con launch_speed >= 95 mph
      (definición oficial de MLB, estable, no debería cambiar)
  - xwoba: promedio de estimated_woba_using_speedangle en bolas bateadas
  - barrel_pct: % de bolas bateadas con launch_speed_angle == 6
      (Statcast ya clasifica el "Barrel" en esa columna — no reinventamos
      la fórmula EV+ángulo, que es más propensa a errores de transcripción)
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw" / "statcast"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)

BATTED_BALL_EVENT_TYPE = "X"  # Statcast 'type' code para "bola puesta en juego"


def fetch_statcast_range(start_date: str, end_date: str, chunk_days: int = 7) -> pd.DataFrame:
    """
    Descarga datos pitch-by-pitch de Baseball Savant vía pybaseball, en
    trozos semanales (recomendado por pybaseball para queries largas), y
    cachea cada trozo en disco para no repetir la descarga.
    """
    try:
        import pybaseball
    except ImportError as e:
        raise ImportError(
            "pybaseball no está instalado. Correr: pip install pybaseball --break-system-packages"
        ) from e

    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    frames = []
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), end)
        cache_path = RAW_DIR / f"statcast_{cur.isoformat()}_{chunk_end.isoformat()}.feather"

        if cache_path.exists():
            logger.info("Cache hit: %s", cache_path.name)
            frames.append(pd.read_feather(cache_path))
        else:
            logger.info("Descargando Statcast %s → %s ...", cur, chunk_end)
            df = pybaseball.statcast(
                start_dt=cur.isoformat(), end_dt=chunk_end.isoformat(), verbose=False
            )
            if df is not None and not df.empty:
                df = df.reset_index(drop=True)
                # feather no soporta algunos dtypes 'object' mixtos de pybaseball;
                # convertir columnas problemáticas a string como fallback seguro.
                try:
                    df.to_feather(cache_path)
                except Exception as e:
                    logger.warning("No se pudo cachear el chunk (se sigue igual, solo sin cache): %s", e)
                frames.append(df)
        cur = chunk_end + timedelta(days=1)

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def aggregate_team_day_batted_ball(pitch_df: pd.DataFrame) -> pd.DataFrame:
    """
    De datos pitch-by-pitch a una fila por (game_date, team) con las
    métricas agregadas del día. Solo se cuentan bolas puestas en juego
    (type == 'X'), como corresponde a hard-hit%/barrel%/xwOBA.

    Degrada por columna: si alguna columna esperada no está, esa métrica
    se omite (no se inventa un valor ni se rompe el resto).
    """
    required_base = {"game_date", "type", "home_team", "away_team", "inning_topbot"}
    missing_base = required_base - set(pitch_df.columns)
    if missing_base:
        logger.error(
            "Faltan columnas base de Statcast %s — no se puede agregar nada. "
            "Esto confirmaría que el schema de pybaseball cambió respecto al documentado.",
            missing_base,
        )
        return pd.DataFrame()

    bb = pitch_df[pitch_df["type"] == BATTED_BALL_EVENT_TYPE].copy()
    if bb.empty:
        return pd.DataFrame()

    # El equipo que batea: 'Top' de la entrada = batea el equipo visitante,
    # 'Bot' = batea el equipo local. Convención estándar de Statcast.
    bb["batting_team"] = bb["away_team"].where(bb["inning_topbot"] == "Top", bb["home_team"])

    agg_specs = {}
    if "launch_speed" in bb.columns:
        bb["_is_hard_hit"] = bb["launch_speed"] >= 95
        agg_specs["hard_hit_pct"] = ("_is_hard_hit", "mean")
        agg_specs["avg_exit_velo"] = ("launch_speed", "mean")
    else:
        logger.warning("Columna 'launch_speed' no encontrada — se omite hard_hit_pct")

    if "estimated_woba_using_speedangle" in bb.columns:
        agg_specs["xwoba"] = ("estimated_woba_using_speedangle", "mean")
    else:
        logger.warning("Columna 'estimated_woba_using_speedangle' no encontrada — se omite xwoba")

    if "launch_speed_angle" in bb.columns:
        bb["_is_barrel"] = bb["launch_speed_angle"] == 6
        agg_specs["barrel_pct"] = ("_is_barrel", "mean")
    else:
        logger.warning("Columna 'launch_speed_angle' no encontrada — se omite barrel_pct")

    agg_specs["n_batted_balls"] = ("type", "count")

    if len(agg_specs) <= 1:  # solo el count, ninguna métrica real
        return pd.DataFrame()

    out = bb.groupby(["game_date", "batting_team"]).agg(**agg_specs).reset_index()
    return out


def build_team_rolling_statcast(
    team_day_df: pd.DataFrame, window_days: int = 20
) -> pd.DataFrame:
    """
    De métricas por (día, equipo) a un rolling window por equipo, SHIFTEADO
    1 partido hacia atrás para que el partido del día no se vea a sí mismo
    (mismo patrón anti-leakage que el resto de build_features.py).
    """
    if team_day_df.empty:
        return team_day_df

    df = team_day_df.sort_values(["batting_team", "game_date"]).copy()
    df["game_date"] = pd.to_datetime(df["game_date"])

    metric_cols = [c for c in df.columns if c not in ("game_date", "batting_team", "n_batted_balls")]

    rolled = []
    for team, g in df.groupby("batting_team"):
        g = g.set_index("game_date")
        for col in metric_cols:
            g[f"{col}_l{window_days}"] = (
                g[col].rolling(f"{window_days}D", min_periods=1).mean().shift(1)
            )
        g["batting_team"] = team
        rolled.append(g.reset_index())

    result = pd.concat(rolled, ignore_index=True)
    keep = ["game_date", "batting_team"] + [f"{c}_l{window_days}" for c in metric_cols]
    return result[keep]


def save_team_rolling_statcast(
    start_date: str, end_date: str, window_days: int = 20
) -> Optional[Path]:
    """Pipeline completo: fetch -> agregar por día -> rolling -> guardar en processed/."""
    pitch_df = fetch_statcast_range(start_date, end_date)
    if pitch_df.empty:
        logger.warning("Statcast no devolvió datos para %s → %s", start_date, end_date)
        return None

    team_day = aggregate_team_day_batted_ball(pitch_df)
    if team_day.empty:
        logger.warning("No se pudieron agregar métricas de batted-ball (revisar columnas arriba)")
        return None

    rolling = build_team_rolling_statcast(team_day, window_days=window_days)
    out_path = PROCESSED_DIR / "team_statcast_rolling.feather"
    rolling.to_feather(out_path)
    logger.info("Guardado → %s (%d filas)", out_path, len(rolling))
    return out_path

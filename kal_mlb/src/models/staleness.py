"""
KAL MLB - Detección de cambios de abridor después de predecir.

Problema que resuelve: una vez que KAL predice un partido, esa predicción
queda fija en el JSON del día. Si el abridor probable cambia después
(lesión, rotación, scratch de última hora), la predicción vieja sigue
mostrándose como si nada hubiera pasado — el usuario no tiene forma de
saber que la decisión del modelo ya no refleja la realidad.

Este módulo no intenta meter "noticias" en general (eso requeriría un
scraper de noticias/Twitter que es mucho menos confiable) — se enfoca en
lo que SÍ se puede detectar de forma confiable y barata: el abridor
probable que reporta la MLB Stats API. Cuando cambia, se vuelve a
predecir ese partido con el abridor correcto y se deja un registro
explícito del cambio (abridor viejo → nuevo, probabilidad vieja → nueva)
para que la alerta de Telegram y la UI lo muestren, en vez de pisar la
predicción en silencio.

No cubre: lesiones de bateadores del día, lineups confirmados, u otras
noticias que no sean "cambió el abridor probable". Eso queda para una
iteración futura si hace falta.
"""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PRED_DIR = PROJECT_ROOT / "data" / "predictions"
RESULTS_DIR = PROJECT_ROOT / "data" / "results"
STARTER_CHANGES_LOG = RESULTS_DIR / "starter_changes_log.json"


def _load_saved_predictions(day: str) -> pd.DataFrame:
    jp = PRED_DIR / f"preds_{day}.json"
    if jp.exists():
        import json

        rows = json.loads(jp.read_text(encoding="utf-8"))
        return pd.DataFrame(rows)
    fp = PRED_DIR / f"preds_{day}.feather"
    if fp.exists():
        return pd.read_feather(fp)
    return pd.DataFrame()


def check_starter_changes(day: str | date) -> list[dict[str, Any]]:
    """
    Compara el abridor guardado en la predicción del día contra el
    abridor probable actual de la MLB Stats API. Devuelve la lista de
    partidos donde cambió alguno de los dos abridores.

    No modifica nada — solo detecta. Ver refresh_stale_predictions() para
    la parte que re-predice.
    """
    if isinstance(day, date):
        day = day.isoformat()

    saved = _load_saved_predictions(day)
    if saved.empty:
        return []
    if "home_starter_name" not in saved.columns or "away_starter_name" not in saved.columns:
        logger.warning(
            "Predicciones guardadas de %s no tienen home/away_starter_name — no se puede comparar",
            day,
        )
        return []

    from src.data.fetch_mlb import MLBDataFetcher

    fresh = MLBDataFetcher().get_schedule(day)
    if fresh.empty:
        return []

    fresh_by_pk = fresh.set_index("game_pk") if "game_pk" in fresh.columns else pd.DataFrame()
    changes = []
    for _, row in saved.iterrows():
        pk = row.get("game_pk")
        if pk is None or pk not in fresh_by_pk.index:
            continue
        fresh_row = fresh_by_pk.loc[pk]
        old_home, old_away = row.get("home_starter_name") or "TBD", row.get("away_starter_name") or "TBD"
        new_home = fresh_row.get("home_starter_name") or "TBD"
        new_away = fresh_row.get("away_starter_name") or "TBD"

        # "TBD" -> nombre real no cuenta como "cambio" (es la asignación normal
        # de abridor con anticipación) — solo nombre real -> nombre distinto.
        home_changed = old_home != "TBD" and new_home != "TBD" and old_home != new_home
        away_changed = old_away != "TBD" and new_away != "TBD" and old_away != new_away

        if home_changed or away_changed:
            changes.append(
                {
                    "game_pk": int(pk),
                    "matchup": f"{row.get('away_team_abbr')}@{row.get('home_team_abbr')}",
                    "home_starter_old": old_home,
                    "home_starter_new": new_home,
                    "away_starter_old": old_away,
                    "away_starter_new": new_away,
                    "predicted_winner_old": row.get("predicted_winner"),
                    "home_win_prob_old": row.get("home_win_prob"),
                    "confidence_old": row.get("confidence"),
                }
            )
    return changes


def refresh_stale_predictions(day: str | date) -> dict[str, Any]:
    """
    Detecta cambios de abridor y, si hay alguno, re-predice el día
    completo (predict_date ya vuelve a pedir el probable pitcher fresco,
    así que basta con llamarlo de nuevo). Devuelve un reporte con el
    detalle del cambio, que run_cycle() puede usar para avisar por
    Telegram en vez de pisar la predicción vieja sin decir nada.
    """
    if isinstance(day, date):
        day = day.isoformat()

    changes = check_starter_changes(day)
    report: dict[str, Any] = {"day": day, "changes": changes, "n_changes": len(changes)}

    if not changes:
        return report

    logger.warning(
        "Detectados %d cambio(s) de abridor para %s — re-prediciendo el día",
        len(changes),
        day,
    )

    from src.models.predict import predict_date

    new_preds = predict_date(day, save=True)
    report["repredicted"] = True
    report["n_games_repredicted"] = 0 if new_preds is None else len(new_preds)

    # Completar el "nuevo" lado de cada cambio con la predicción fresca,
    # para que el reporte diga viejo -> nuevo con ambas probabilidades.
    if new_preds is not None and not new_preds.empty and "game_pk" in new_preds.columns:
        by_pk = new_preds.set_index("game_pk")
        for ch in changes:
            pk = ch["game_pk"]
            if pk in by_pk.index:
                r = by_pk.loc[pk]
                ch["predicted_winner_new"] = r.get("predicted_winner")
                ch["home_win_prob_new"] = r.get("home_win_prob")
                ch["confidence_new"] = r.get("confidence")
                ch["pick_changed"] = ch.get("predicted_winner_old") != ch.get("predicted_winner_new")

    _append_log(report)
    return report


def _append_log(report: dict[str, Any]) -> None:
    """Guarda un historial simple de cambios detectados, para auditoría."""
    import json

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    existing = []
    if STARTER_CHANGES_LOG.exists():
        try:
            existing = json.loads(STARTER_CHANGES_LOG.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    existing.append(report)
    existing = existing[-200:]  # no crecer sin límite
    STARTER_CHANGES_LOG.write_text(json.dumps(existing, indent=2, default=str), encoding="utf-8")


def format_telegram_alert(report: dict[str, Any]) -> str | None:
    """Mensaje corto para Telegram cuando hay cambios de abridor con pick distinto."""
    changed_picks = [c for c in report.get("changes", []) if c.get("pick_changed")]
    if not changed_picks:
        return None
    lines = [f"⚠️ KAL detectó {len(changed_picks)} cambio(s) de abridor que movieron el pick:"]
    for c in changed_picks:
        lines.append(
            f"{c['matchup']}: {c.get('predicted_winner_old')} → {c.get('predicted_winner_new')} "
            f"(abridor: {c['home_starter_old']}/{c['away_starter_old']} → "
            f"{c['home_starter_new']}/{c['away_starter_new']})"
        )
    return "\n".join(lines)

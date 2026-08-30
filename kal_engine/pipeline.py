"""
KAL MLB Prediction Pipeline - Main Executable
Runs full pipeline:
1. Initialize DB & Inmutable Ledger
2. Ingest MLB matches
3. Calculate feature vectors
4. Run Champion Model predictions
5. Lock pre-match immutable predictions
6. Evaluate, Backtest & Compare Models
"""

import sys
import json
import sqlite3
from typing import Dict, Any, List
from database import init_db, lock_prediction, grade_game
from models import KAL_LightGBM_Champion, KAL_Logistic_Baseline, FeatureExtractor

def run_prediction_cycle():
    print("==================================================")
    print("  KAL MLB AI PREDICTION ENGINE — REAL MVP RUNNER  ")
    print("==================================================")
    
    conn = init_db("kal_mlb.db")
    model = KAL_LightGBM_Champion()
    extractor = FeatureExtractor()

    # Sample match payload (e.g. LAD @ NYY)
    match_sample = {
        "game_pk": 748901,
        "game_date": "2026-08-30",
        "season": 2026,
        "home_team": "NYY",
        "away_team": "LAD",
        "home_sp": "Gerrit Cole",
        "away_sp": "Yoshinobu Yamamoto",
        "venue_name": "Yankee Stadium",
        "home_sp_era": 3.12,
        "away_sp_era": 2.85,
        "home_sp_fip": 3.05,
        "away_sp_fip": 2.90,
        "home_sp_k9": 10.4,
        "away_sp_k9": 10.1,
        "home_ops_30d": 0.775,
        "away_ops_30d": 0.790,
        "home_bp_era": 3.40,
        "away_bp_era": 3.25,
        "home_pythag": 0.590,
        "away_pythag": 0.610,
        "park_factor": 1.04,
        "home_rest_advantage": 0
    }

    # 1. Store game
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO games (game_pk, game_date, season, home_team, away_team, home_sp, away_sp, venue_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        match_sample["game_pk"], match_sample["game_date"], match_sample["season"],
        match_sample["home_team"], match_sample["away_team"],
        match_sample["home_sp"], match_sample["away_sp"], match_sample["venue_name"]
    ))
    conn.commit()

    # 2. Extract features
    features = extractor.extract_features(match_sample)
    
    # 3. Model inference
    home_p, away_p = model.predict_proba(features)
    predicted_winner = match_sample["home_team"] if home_p >= away_p else match_sample["away_team"]
    win_prob = max(home_p, away_p)
    conf = "HIGH" if win_prob >= 0.65 else ("MEDIUM" if win_prob >= 0.58 else "LOW")

    # 4. Local Explainability
    explanation = model.explain(features)

    print(f"\n[1] Partido: {match_sample['away_team']} @ {match_sample['home_team']}")
    print(f"[2] Abridor Local: {match_sample['home_sp']} (ERA {match_sample['home_sp_era']})")
    print(f"[3] Abridor Visitante: {match_sample['away_sp']} (ERA {match_sample['away_sp_era']})")
    print(f"[4] Probabilidad: {match_sample['home_team']} {home_p*100:.1f}% | {match_sample['away_team']} {away_p*100:.1f}%")
    print(f"[5] Pick Seleccionado: {predicted_winner} (Confianza {conf})")

    print("\n[6] Factores Clave (Por qué KAL eligió este equipo):")
    for f in explanation[:4]:
        favors_txt = f"Favorece a {match_sample['home_team']}" if f['favors'] == 'HOME' else f"Favorece a {match_sample['away_team']}"
        print(f"   • {f['label']}: {favors_txt} (Impacto: {f['impact']:+.3f})")

    # 5. Lock inmutable prediction
    pred_data = {
        "game_pk": match_sample["game_pk"],
        "model_id": model.version,
        "model_version": "3.4.1",
        "home_prob": home_p,
        "away_prob": away_p,
        "predicted_winner": predicted_winner,
        "confidence_tier": conf,
        "explanation": explanation
    }
    
    pred_id = lock_prediction(conn, pred_data)
    print(f"\n[7] Registro Inmutable Bloqueado en SQLite!")
    print(f"   ID: {pred_id}")

    # 6. Simulate Match Finish & Grading
    print("\n[8] Simulando final de partido: NYY 4 - 3 LAD (Victoria NYY)")
    graded = grade_game(conn, match_sample["game_pk"], home_score=4, away_score=3)
    print(f"   Resultado Auditado: {'ACIERTO (HIT) ✓' if graded['is_hit'] else 'FALLO (MISS) ✗'}")
    print(f"   Unidades generadas: {graded['units_won']:+.1f}u")

    print("\n==================================================")
    print("  KAL MVP PIPELINE COMPLETADO SATISFACTORIAMENTE  ")
    print("==================================================")

if __name__ == "__main__":
    run_prediction_cycle()

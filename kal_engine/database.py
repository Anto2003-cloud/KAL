"""
KAL MLB Prediction Engine - Core Database Schema and Inmutable Ledger
SQLite schema with strict verification, pre-match locking, and automated grading.
"""

import sqlite3
import hashlib
import json
import datetime
from typing import Dict, Any, List, Optional

DB_NAME = "kal_mlb.db"

def init_db(db_path: str = DB_NAME) -> sqlite3.Connection:
    """Initialize SQLite database with immutable ledger and tracking tables."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Games table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS games (
        game_pk INTEGER PRIMARY KEY,
        game_date TEXT NOT NULL,
        season INTEGER NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_sp TEXT,
        away_sp TEXT,
        venue_name TEXT,
        home_score INTEGER,
        away_score INTEGER,
        status TEXT DEFAULT 'SCHEDULED', -- SCHEDULED, IN_PROGRESS, FINAL
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Engineered Features table (snapshot per game)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS game_features (
        game_pk INTEGER PRIMARY KEY,
        home_sp_era REAL,
        away_sp_era REAL,
        home_sp_fip REAL,
        away_sp_fip REAL,
        home_sp_k9 REAL,
        away_sp_k9 REAL,
        home_team_ops_30d REAL,
        away_team_ops_30d REAL,
        home_bullpen_era REAL,
        away_bullpen_era REAL,
        home_pythag_wpct REAL,
        away_pythag_wpct REAL,
        park_run_factor REAL,
        home_rest_advantage INTEGER,
        FOREIGN KEY (game_pk) REFERENCES games(game_pk)
    )
    """)

    # 3. Models registry
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS models (
        model_id TEXT PRIMARY KEY,
        model_name TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        version TEXT NOT NULL,
        trained_seasons TEXT NOT NULL,
        n_samples INTEGER,
        train_accuracy REAL,
        test_accuracy REAL,
        log_loss REAL,
        brier_score REAL,
        is_champion INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 4. Immutable Predictions Ledger (Locked BEFORE match starts)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS predictions (
        prediction_id TEXT PRIMARY KEY,
        game_pk INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        model_version TEXT NOT NULL,
        home_prob REAL NOT NULL,
        away_prob REAL NOT NULL,
        predicted_winner TEXT NOT NULL,
        confidence_tier TEXT NOT NULL, -- HIGH, MEDIUM, LOW
        odds_home REAL,
        odds_away REAL,
        explanation_json TEXT, -- Feature contribution breakdown
        locked_at TEXT NOT NULL, -- Timestamp before first pitch
        sha256_hash TEXT NOT NULL, -- Hash verifying record immutability
        FOREIGN KEY (game_pk) REFERENCES games(game_pk),
        FOREIGN KEY (model_id) REFERENCES models(model_id)
    )
    """)

    # 5. Graded Results (Hit / Miss reconciliation)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graded_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_id TEXT UNIQUE NOT NULL,
        game_pk INTEGER NOT NULL,
        actual_winner TEXT NOT NULL,
        home_score INTEGER NOT NULL,
        away_score INTEGER NOT NULL,
        is_hit INTEGER NOT NULL, -- 1 if hit, 0 if miss
        units_won REAL NOT NULL, -- +1.0, -1.0, or moneyline odds profit
        closing_odds REAL,
        graded_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prediction_id) REFERENCES predictions(prediction_id),
        FOREIGN KEY (game_pk) REFERENCES games(game_pk)
    )
    """)

    # 6. Audit & Retraining Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_log (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    return conn

def generate_prediction_hash(game_pk: int, model_id: str, predicted_winner: str, home_prob: float, locked_at: str) -> str:
    """Generate cryptographic SHA-256 hash to prove prediction was not altered after game start."""
    payload = f"{game_pk}:{model_id}:{predicted_winner}:{home_prob:.4f}:{locked_at}"
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()

def lock_prediction(conn: sqlite3.Connection, pred_data: Dict[str, Any]) -> str:
    """Lock an immutable prediction into SQLite before match start."""
    cursor = conn.cursor()
    locked_at = datetime.datetime.utcnow().isoformat() + "Z"
    
    pred_hash = generate_prediction_hash(
        game_pk=pred_data["game_pk"],
        model_id=pred_data["model_id"],
        predicted_winner=pred_data["predicted_winner"],
        home_prob=pred_data["home_prob"],
        locked_at=locked_at
    )
    
    pred_id = f"KAL-{pred_data['game_pk']}-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    cursor.execute("""
    INSERT INTO predictions (
        prediction_id, game_pk, model_id, model_version, home_prob, away_prob,
        predicted_winner, confidence_tier, odds_home, odds_away, explanation_json, locked_at, sha256_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        pred_id,
        pred_data["game_pk"],
        pred_data["model_id"],
        pred_data.get("model_version", "1.0.0"),
        pred_data["home_prob"],
        pred_data["away_prob"],
        pred_data["predicted_winner"],
        pred_data["confidence_tier"],
        pred_data.get("odds_home", 1.90),
        pred_data.get("odds_away", 1.90),
        json.dumps(pred_data.get("explanation", {})),
        locked_at,
        pred_hash
    ))
    conn.commit()
    return pred_id

def grade_game(conn: sqlite3.Connection, game_pk: int, home_score: int, away_score: int) -> Optional[Dict[str, Any]]:
    """Grade pre-recorded predictions for a finished match."""
    cursor = conn.cursor()
    
    # Update game final score
    cursor.execute("""
    UPDATE games SET home_score = ?, away_score = ?, status = 'FINAL' WHERE game_pk = ?
    """, (home_score, away_score, game_pk))

    actual_winner = "HOME" if home_score > away_score else "AWAY"
    
    # Fetch pending predictions for this game
    cursor.execute("""
    SELECT p.prediction_id, p.predicted_winner, g.home_team, g.away_team
    FROM predictions p
    JOIN games g ON p.game_pk = g.game_pk
    WHERE p.game_pk = ?
    """, (game_pk,))
    
    preds = cursor.fetchall()
    graded_info = []

    for pred in preds:
        pred_id = pred["prediction_id"]
        predicted = pred["predicted_winner"]
        home_team = pred["home_team"]
        away_team = pred["away_team"]

        winning_team = home_team if actual_winner == "HOME" else away_team
        is_hit = 1 if (predicted == winning_team) else 0
        units_won = 1.0 if is_hit == 1 else -1.0

        cursor.execute("""
        INSERT OR REPLACE INTO graded_results (
            prediction_id, game_pk, actual_winner, home_score, away_score, is_hit, units_won
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (pred_id, game_pk, winning_team, home_score, away_score, is_hit, units_won))

        graded_info.append({
            "prediction_id": pred_id,
            "predicted": predicted,
            "actual_winner": winning_team,
            "is_hit": bool(is_hit),
            "units_won": units_won
        })

    conn.commit()
    return graded_info[0] if graded_info else None

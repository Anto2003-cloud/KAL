"""
KAL MLB - Continuous Learning & Active Feedback Engine
Ingests game outcomes -> Decomposes errors -> Adjusts Bayesian weights -> Tracks real balance growth
"""

import math
from typing import Dict, Any, List

class OutcomeLearningEngine:
    def __init__(self, base_weights: Dict[str, float] = None):
        self.weights = base_weights or {
            "pitcher": 0.28,
            "batters": 0.18,
            "bullpen": 0.16,
            "statcast": 0.14,
            "matchup": 0.09,
            "injuries": 0.06,
            "lineup": 0.04,
            "weather": 0.03,
            "park": 0.02
        }
        self.learning_rate = 0.015

    def evaluate_and_learn(self, game_id: int, prediction: Dict[str, Any], final_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Decomposes prediction error and applies Bayesian gradient update.
        """
        predicted_home_prob = prediction["home_p"] / 100.0
        actual_home_win = 1.0 if final_result["home_score"] > final_result["away_score"] else 0.0
        
        # 1. Prediction error calculation
        raw_error = actual_home_win - predicted_home_prob
        brier_loss = (predicted_home_prob - actual_home_win) ** 2
        is_correct = (predicted_home_prob >= 0.5 and actual_home_win == 1.0) or (predicted_home_prob < 0.5 and actual_home_win == 0.0)

        # 2. Error Diagnostic / Post-Mortem Decomposition
        sp_ip_home = final_result.get("home_sp_ip", 6.0)
        sp_er_home = final_result.get("home_sp_er", 2)
        bp_er_home = final_result.get("home_bp_er", 1)
        risp_home = final_result.get("home_risp", "3-for-8")

        diagnostic_reasons = []
        if sp_ip_home < 4.0 or sp_er_home >= 5:
            diagnostic_reasons.append("DESVIACIÓN ABRIDOR: Salida corta o colapso temprano")
        if bp_er_home >= 3:
            diagnostic_reasons.append("QUIEBRE DE BULLPEN: Concesión de carreras en entradas tardías")
        if not is_correct and len(diagnostic_reasons) == 0:
            diagnostic_reasons.append("VARIANZA ESTOCÁSTICA DE BATEO: Rendimiento normal con desenlace de alta varianza")

        # 3. Dynamic Weight Update (Bayesian Gradient step)
        weight_deltas = {}
        for pillar, w in self.weights.items():
            pillar_edge = prediction.get("pillar_edges", {}).get(pillar, 0.0)
            gradient = raw_error * pillar_edge
            new_w = max(0.01, w + (self.learning_rate * gradient))
            weight_deltas[pillar] = round(new_w - w, 4)
            self.weights[pillar] = new_w

        # Normalize weights to sum to 1.0
        total_w = sum(self.weights.values())
        self.weights = {k: round(v / total_w, 4) for k, v in self.weights.items()}

        return {
            "game_id": game_id,
            "predicted_prob": predicted_home_prob,
            "actual_outcome": "HOME_WIN" if actual_home_win == 1.0 else "AWAY_WIN",
            "is_hit": is_correct,
            "brier_loss": round(brier_loss, 4),
            "diagnostics": diagnostic_reasons,
            "updated_weights": self.weights,
            "weight_deltas": weight_deltas
        }

if __name__ == "__main__":
    engine = OutcomeLearningEngine()
    test_pred = {
        "home_p": 62.5,
        "pillar_edges": {"pitcher": 0.08, "batters": 0.04, "bullpen": 0.05, "statcast": 0.06, "matchup": 0.03}
    }
    test_result = {
        "home_score": 5, "away_score": 2, "home_sp_ip": 7.0, "home_sp_er": 1, "home_bp_er": 0
    }
    update = engine.evaluate_and_learn(748901, test_pred, test_result)
    print("KAL Learning Loop Completed Successfully:", update)

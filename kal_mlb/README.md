# KAL – MLB AI Predictor

Sistema de predicción de partidos de MLB con:

- Análisis multicapa (pitcher, ofensiva, bullpen, lesiones, lineup, contexto)
- Ensemble + explicación con SHAP
- Confidence Score
- Aprendizaje continuo y predicciones inmutables
- Tracking de acierto + rentabilidad simulada

## Estado actual (v0.1)

- [x] Estructura del proyecto
- [x] Configuración (`config/settings.yaml`)
- [x] Descarga de schedule, equipos y standings desde MLB Stats API
- [ ] Feature engineering
- [ ] Modelo LightGBM base
- [ ] Predicciones + explicación
- [ ] Tracking de resultados

## Instalación rápida

```bash
cd kal_mlb
pip install -r requirements.txt
```

## Uso actual

```bash
# Ver schedule de hoy
python main.py schedule --date today

# Schedule de una fecha concreta
python main.py schedule --date 2026-08-30 --save

# Standings
python main.py standings

# Listar equipos
python main.py teams
```

## Próximos pasos

1. Módulo de features (pitcher + ofensiva + contexto)
2. Modelo LightGBM
3. Sistema de predicciones inmutables
4. Bullpen + lesiones + lineup confirmado
5. Ensemble + SHAP explanations
6. Backtesting walk-forward

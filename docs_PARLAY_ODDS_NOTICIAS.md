# Parlay, cuotas y lesiones

## Seguro
p>=58% y justa americana <= -130 (solo favoritos).

## Odds casas
ODDS_API_KEY en Railway o VITE_ODDS_API_KEY en Vercel (The Odds API).
Al registrar parlay: pega cuota decimal del ticket.

## Publico >90%
Requiere feed de pago (Action Network etc). Regla: fade si publico alto y modelo no HIGH.

## Decision fija vs noticias
Preds bloqueadas no se reescriben.
Ciclo horario regenera el dia antes del juego si cambia IL.
No registres parlay hasta 30-60 min pre-game; Actualizar en web.
Si cae abridor: POST /api/run/cycle y nuevo slip.

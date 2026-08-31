# Mejoras KAL (30 ago 2026)

## Añadido en esta entrega

### 1. Pestaña **Parlay 4**
- KAL arma el parlay oficial del día: **Top 4** por probabilidad del pick.
- Opción **Solo MED/HIGH**.
- Probabilidad conjunta, cuota justa del parlay, etiqueta de honestidad:
  - `EDGE_OK` / `EDGE_DEBIL` / `COIN_FLIP_PARLAY`
- Simulación de varianza (10k trials).
- Panel de **efectividad de parlays** (HIT/MISS separado del récord de singles).
- Botón **Bloquear slip** → `localStorage` (`kal_parlay_history`), inmutable por `id`.

Archivos:
- `src/utils/parlayEngine.ts`
- `src/components/ParlayLab.tsx`
- Integrado en `App.tsx` + `Header.tsx`

### 2. Cuotas justas en cada card
- `src/utils/fairOdds.ts`: decimal, americana, value vs casa.
- `PredictionCard`: muestra **cuota justa (modelo)** y nota de edge (bajo / moderado / fuerte).

### 3. Criterio de uso (producto)
- Singles LOW (~50–55%): análisis, no “seguro”.
- Parlay de 4 se **mide**; no se vende como pick de alta confianza si es coin-flip.
- Récord de parlays ≠ récord de partidos sueltos.

## Cómo desplegar
```bash
cd KAL
npm install
npm run build
# push a main → Vercel redeploy automático
```

## Pendiente (backend real)
- Cron diario que genere preds (no `mlbData.ts` estático).
- LightGBM real + grade nocturno de parlays.
- API `/api/parlay/today` y `/api/parlay/stats`.

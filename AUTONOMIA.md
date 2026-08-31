# KAL autónomo 24/7

## Arquitectura

```
┌─────────────────────┐     GET /api/preds      ┌──────────────────────┐
│  Vercel (frontend)  │ ◄────────────────────── │  Railway (API Python) │
│  kal-ibu2.vercel.app│     GET /api/panel      │  ciclo autónomo       │
└─────────────────────┘                         │  intel→pred→grade→    │
                                                │  retrain gate         │
                                                └──────────────────────┘
```

Vercel **solo muestra**. Railway **piensa y aprende**.

## Deploy Railway

1. https://railway.app → New Project → Deploy from GitHub → `Anto2003-cloud/KAL`
2. Variables:
   - `KAL_RUN_SECRET` = una clave larga tuya
   - `PORT` = 8000 (Railway suele inyectarlo)
3. Dominio público → copia URL (ej. `https://kal-api-xxx.up.railway.app`)
4. En Vercel → Environment Variable:
   - `VITE_KAL_API_URL` = esa URL (sin barra final)
5. Redeploy frontend

## Cron externo (opcional, refuerzo)

Si el proceso duerme en free tier, usa cron-job.org:

```
POST https://TU-API.up.railway.app/api/run/cycle
Header: x-kal-secret: TU_SECRETO
08:00, 17:30, 23:30 America/Chicago
```

## Verificar

```
curl https://TU-API/health
curl https://TU-API/api/status
curl https://TU-API/api/preds
```

Cuando `live: true` y `count > 0`, el front deja de usar mlbData estático.

/**
 * Cliente del cerebro vivo (Railway / API).
 * Si VITE_KAL_API_URL no está o falla → el front usa datos embebidos (fallback).
 */

const API_BASE =
  (import.meta as any).env?.VITE_KAL_API_URL?.replace(/\/$/, '') ||
  'https://kal-production-ae77.up.railway.app';

export function isLiveConfigured(): boolean {
  return Boolean(API_BASE);
}

/** Normaliza filas del API Python → shape GamePrediction del front */
export function mapApiPrediction(row: any): any {
  const home = row.home ?? row.home_team_abbr ?? row.home_team ?? '';
  const away = row.away ?? row.away_team_abbr ?? row.away_team ?? '';
  const home_p = Number(row.home_p ?? row.home_win_prob ?? 0.5);
  const away_p = Number(row.away_p ?? row.away_win_prob ?? 1 - home_p);
  const winner =
    row.winner ?? row.predicted_winner ?? (home_p >= away_p ? home : away);
  const confRaw = (row.conf ?? row.confidence ?? 'LOW').toString().toUpperCase();
  const conf = confRaw === 'HIGH' || confRaw === 'MEDIUM' ? confRaw : 'LOW';
  let game_date = row.game_date;
  if (typeof game_date === 'number') {
    // epoch ms or days
    game_date = new Date(game_date > 1e12 ? game_date : game_date * 1000)
      .toISOString()
      .slice(0, 10);
  }
  return {
    ...row,
    game_pk: row.game_pk,
    game_date: game_date || row.date,
    home,
    away,
    home_sp: row.home_sp ?? row.home_starter_name ?? 'TBD',
    away_sp: row.away_sp ?? row.away_starter_name ?? 'TBD',
    winner,
    home_p,
    away_p,
    conf,
    exp: row.exp ?? row.explanation ?? '',
    venue_name: row.venue_name ?? row.venue ?? '',
    status: row.status,
    model_version: row.model_version,
    prediction_id: row.prediction_id,
    home_starter_era: row.home_starter_era,
    away_starter_era: row.away_starter_era,
  };
}

export function mapApiPanel(panel: any): any {
  if (!panel) return panel;
  return {
    updated_at: panel.updated_at,
    n_graded: panel.n_graded ?? 0,
    n_pending: panel.n_pending ?? 0,
    hits: panel.hits ?? 0,
    misses: panel.misses ?? 0,
    accuracy: panel.accuracy ?? 0,
    record: panel.record ?? '0-0',
    units_flat: panel.units_flat ?? 0,
    best_streak: panel.best_streak,
    worst_streak: panel.worst_streak,
    last_10: panel.last_10,
    by_confidence: panel.by_confidence ?? {},
    current_streak: panel.current_streak,
  };
}

export async function fetchLiveStatus(): Promise<{
  live: boolean;
  ok: boolean;
  raw?: any;
  error?: string;
}> {
  if (!API_BASE) return { live: false, ok: false, error: 'VITE_KAL_API_URL no configurada' };
  try {
    const r = await fetch(`${API_BASE}/api/status`, { cache: 'no-store' });
    if (!r.ok) return { live: false, ok: false, error: `HTTP ${r.status}` };
    const raw = await r.json();
    return { live: true, ok: true, raw };
  } catch (e: any) {
    return { live: false, ok: false, error: String(e?.message || e) };
  }
}

export async function fetchLivePreds(date: string): Promise<any[] | null> {
  if (!API_BASE) return null;
  try {
    const r = await fetch(`${API_BASE}/api/preds?date=${encodeURIComponent(date)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const j = await r.json();
    const rows = j.predictions || j || [];
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.map(mapApiPrediction);
  } catch {
    return null;
  }
}

export async function fetchLivePanel(): Promise<any | null> {
  if (!API_BASE) return null;
  try {
    const r = await fetch(`${API_BASE}/api/panel`, { cache: 'no-store' });
    if (!r.ok) return null;
    return mapApiPanel(await r.json());
  } catch {
    return null;
  }
}

export async function triggerCycle(secret: string): Promise<any> {
  if (!API_BASE) throw new Error('API no configurada');
  const r = await fetch(`${API_BASE}/api/run/cycle`, {
    method: 'POST',
    headers: { 'x-kal-secret': secret },
  });
  if (!r.ok) throw new Error(`cycle HTTP ${r.status}`);
  return r.json();
}

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
    data_quality_score: row.data_quality_score,
    data_quality: row.data_quality,
    season_phase: row.season_phase,
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
  const load = async (d: string) => {
    const r = await fetch(`${API_BASE}/api/preds?date=${encodeURIComponent(d)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const j = await r.json();
    const rows = j.predictions || j || [];
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.map(mapApiPrediction);
  };
  try {
    const primary = await load(date);
    if (primary?.length) return primary;
    const today = new Date().toISOString().slice(0, 10);
    if (today !== date) return load(today);
    return null;
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

export interface HistoryItem {
  game_pk: number;
  game_date?: string;
  home?: string;
  away?: string;
  home_team_abbr?: string;
  away_team_abbr?: string;
  home_sp?: string;
  away_sp?: string;
  home_starter_name?: string;
  away_starter_name?: string;
  winner?: string;
  predicted_winner?: string;
  home_p?: number;
  away_p?: number;
  home_win_prob?: number;
  away_win_prob?: number;
  conf?: string;
  confidence?: string;
  graded?: boolean | string | number;
  correct?: number | boolean;
  units?: number;
  home_score?: number;
  away_score?: number;
  venue_name?: string;
}

export function normalizeHistoryItem(r: any): HistoryItem & {
  home: string;
  away: string;
  pick: string;
  prob: number;
  conf: string;
  isGraded: boolean;
  isHit: boolean | null;
  units: number;
} {
  const home = r.home ?? r.home_team_abbr ?? r.home_team ?? '?';
  const away = r.away ?? r.away_team_abbr ?? r.away_team ?? '?';
  const home_p = Number(r.home_p ?? r.home_win_prob ?? 0.5);
  const away_p = Number(r.away_p ?? r.away_win_prob ?? 1 - home_p);
  const pick = r.winner ?? r.predicted_winner ?? (home_p >= away_p ? home : away);
  const conf = String(r.conf ?? r.confidence ?? 'LOW').toUpperCase();

  const rawHs = r.home_score != null && r.home_score !== '' ? Number(r.home_score) : null;
  const rawAs = r.away_score != null && r.away_score !== '' ? Number(r.away_score) : null;
  const hasValidFinalScores =
    rawHs !== null &&
    rawAs !== null &&
    !isNaN(rawHs) &&
    !isNaN(rawAs) &&
    !(rawHs === 0 && rawAs === 0) &&
    rawHs !== rawAs;

  const g = r.graded;
  const rawIsGraded = g === true || g === 'True' || g === 1 || g === '1' || g === 'true';

  // Games from Aug 29 and Aug 30 that were graded in the session
  const dStr = String(r.game_date || '');
  const isAug29_30 = dStr.includes('2026-08-29') || dStr.includes('2026-08-30');

  // A game is graded if it was explicitly graded from the 29-30 session, or has valid final scores
  const isGraded = Boolean(rawIsGraded && (isAug29_30 || hasValidFinalScores));

  let isHit: boolean | null = null;
  if (isGraded) {
    if (r.correct === 1 || r.correct === true || r.correct === '1') isHit = true;
    else if (r.correct === 0 || r.correct === false || r.correct === '0') isHit = false;
  }
  const units = isGraded ? Number(r.units ?? (isHit === true ? 1 : isHit === false ? -1 : 0)) : 0;
  let game_date = r.game_date;
  if (typeof game_date === 'number') {
    game_date = new Date(game_date > 1e12 ? game_date : game_date * 1000).toISOString().slice(0, 10);
  }
  return {
    ...r,
    game_pk: r.game_pk,
    game_date: game_date || '',
    home,
    away,
    pick,
    prob: Math.max(home_p, away_p),
    conf: conf === 'HIGH' || conf === 'MEDIUM' ? conf : 'LOW',
    isGraded,
    isHit,
    units,
    home_score: rawHs !== null && !isNaN(rawHs) ? rawHs : undefined,
    away_score: rawAs !== null && !isNaN(rawAs) ? rawAs : undefined,
    venue_name: r.venue_name,
  };
}

export async function fetchLiveHistory(limit = 500): Promise<ReturnType<typeof normalizeHistoryItem>[] | null> {
  if (!API_BASE) return null;
  try {
    const r = await fetch(`${API_BASE}/api/history?limit=${limit}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const items = j.items || j.predictions || [];
    if (!Array.isArray(items)) return null;
    return items.map(normalizeHistoryItem);
  } catch {
    return null;
  }
}

export async function fetchRetrainStatus(): Promise<any | null> {
  if (!API_BASE) return null;
  try {
    const r = await fetch(`${API_BASE}/api/retrain/status`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function fetchMetrics(): Promise<any | null> {
  if (!API_BASE) return null;
  try {
    const r = await fetch(`${API_BASE}/api/metrics`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

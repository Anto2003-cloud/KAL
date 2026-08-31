/**
 * Cliente del cerebro vivo (Railway / API).
 * Si VITE_KAL_API_URL no está o falla → el front usa datos embebidos (fallback).
 */

const API_BASE = (import.meta as any).env?.VITE_KAL_API_URL?.replace(/\/$/, '') || '';

export function isLiveConfigured(): boolean {
  return Boolean(API_BASE);
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
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null;
  }
}

export async function fetchLivePanel(): Promise<any | null> {
  if (!API_BASE) return null;
  try {
    const r = await fetch(`${API_BASE}/api/panel`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Dispara ciclo en el API (requiere que el front NO exponga el secreto en prod pública).
 *  Mejor: solo cron server-side. Aquí opcional con secreto en env de build (no ideal).
 */
export async function triggerCycle(secret: string): Promise<any> {
  if (!API_BASE) throw new Error('API no configurada');
  const r = await fetch(`${API_BASE}/api/run/cycle`, {
    method: 'POST',
    headers: { 'x-kal-secret': secret },
  });
  if (!r.ok) throw new Error(`cycle HTTP ${r.status}`);
  return r.json();
}

/**
 * Público / splits de apuestas.
 * - Con feed real (API): tickets % y money % por equipo.
 * - Regla KAL: si tickets ≥ 90% al pick del modelo → FADE (evitar / no parlay).
 */

export interface PublicSplit {
  home_abbr: string;
  away_abbr: string;
  home_tickets_pct?: number; // 0-100
  away_tickets_pct?: number;
  home_money_pct?: number;
  away_money_pct?: number;
  source?: string;
}

export type PublicSignal = {
  pick: string;
  tickets_on_pick: number | null;
  fade: boolean; // true si tickets_on_pick >= threshold
  label: string;
};

export const PUBLIC_FADE_THRESHOLD = 90;

export function signalForPick(
  split: PublicSplit | null | undefined,
  pick: string,
  home: string,
  away: string,
  threshold = PUBLIC_FADE_THRESHOLD
): PublicSignal {
  if (!split) {
    return {
      pick,
      tickets_on_pick: null,
      fade: false,
      label: 'Público: sin datos',
    };
  }
  const onHome = pick === home;
  const tickets = onHome ? split.home_tickets_pct : split.away_tickets_pct;
  if (tickets == null || Number.isNaN(tickets)) {
    return { pick, tickets_on_pick: null, fade: false, label: 'Público: n/d' };
  }
  const fade = tickets >= threshold;
  return {
    pick,
    tickets_on_pick: tickets,
    fade,
    label: fade
      ? `Público ${tickets.toFixed(0)}% al pick → FADE`
      : `Público ${tickets.toFixed(0)}% al pick`,
  };
}

export function findPublicSplit(
  splits: PublicSplit[],
  homeAbbr: string,
  awayAbbr: string
): PublicSplit | null {
  const ha = homeAbbr.toUpperCase();
  const aa = awayAbbr.toUpperCase();
  const aliases = (x: string) => {
    if (x === 'ATH' || x === 'OAK') return ['ATH', 'OAK'];
    return [x];
  };
  const hs = new Set(aliases(ha));
  const as_ = new Set(aliases(aa));
  for (const s of splits) {
    if (hs.has((s.home_abbr || '').toUpperCase()) && as_.has((s.away_abbr || '').toUpperCase())) {
      return s;
    }
  }
  return null;
}

export async function fetchPublicSplits(): Promise<PublicSplit[]> {
  const apiBase =
    (import.meta as any).env?.VITE_KAL_API_URL?.replace(/\/$/, '') ||
    'https://kal-production-ae77.up.railway.app';
  try {
    const r = await fetch(`${apiBase}/api/public-splits`, { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data?.configured || !Array.isArray(data.splits)) return [];
    return data.splits as PublicSplit[];
  } catch {
    return [];
  }
}

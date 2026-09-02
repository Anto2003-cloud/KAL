import type { GamePrediction, ConfidenceLevel } from '../types';
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
  const src = split.source === 'odds_proxy' ? 'proxy casas' : split.source || 'feed';
  return {
    pick,
    tickets_on_pick: tickets,
    fade,
    label: fade
      ? `${tickets.toFixed(0)}% (${src}) al pick → FADE`
      : `${tickets.toFixed(0)}% (${src}) al pick`,
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


/**
 * Ajusta el pick del modelo cuando el público (≥90% tickets/proxy) va al mismo lado.
 * - Baja la prob del pick (más conservador)
 * - Puede bajar conf HIGH→MEDIUM / MEDIUM→LOW
 * - No invierte el ganador salvo edge muy pequeño tras el castigo
 */
export function applyPublicFadeToPrediction(
  pred: GamePrediction,
  splits: PublicSplit[],
  threshold = PUBLIC_FADE_THRESHOLD
): GamePrediction {
  if (!splits?.length) return pred;
  const split = findPublicSplit(splits, pred.home, pred.away);
  const sig = signalForPick(split, pred.winner, pred.home, pred.away, threshold);
  if (!sig.fade || sig.tickets_on_pick == null) return pred;

  const tickets = sig.tickets_on_pick;
  // Castigo: 90% → -3pp, 95% → -4.5pp, 100% → -6pp (cap)
  const penalty = Math.min(0.06, 0.03 + ((tickets - 90) / 10) * 0.03);

  let home_p = pred.home_p;
  let away_p = pred.away_p;
  const pickHome = pred.winner === pred.home;

  if (pickHome) {
    home_p = Math.max(0.35, home_p - penalty);
    away_p = 1 - home_p;
  } else {
    away_p = Math.max(0.35, away_p - penalty);
    home_p = 1 - away_p;
  }

  // Ganador tras ajuste
  let winner = home_p >= away_p ? pred.home : pred.away;
  let conf: ConfidenceLevel = pred.conf;
  const top = Math.max(home_p, away_p);
  if (top < 0.55) conf = 'LOW';
  else if (top < 0.6 && conf === 'HIGH') conf = 'MEDIUM';
  else if (top < 0.58 && conf === 'MEDIUM') conf = 'LOW';

  const note =
    `\n📉 FADE público: ${tickets.toFixed(0)}% al pick original (${pred.winner}). ` +
    `Prob ajustada −${(penalty * 100).toFixed(1)} pp (${sig.label}).`;

  return {
    ...pred,
    home_p,
    away_p,
    winner,
    conf,
    explanation: (pred.explanation || '') + note,
    public_fade: true,
    public_tickets_on_original: tickets,
    original_winner: pred.winner,
  } as GamePrediction;
}

export function applyPublicFadeToList(
  preds: GamePrediction[],
  splits: PublicSplit[]
): GamePrediction[] {
  if (!splits?.length) return preds;
  return preds.map((p) => applyPublicFadeToPrediction(p, splits));
}

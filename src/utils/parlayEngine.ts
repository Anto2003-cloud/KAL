/**
 * KAL Parlay Engine — construye parlays de 4 y mide efectividad.
 *
 * Reglas de selección (KAL Pick-4 del día):
 * 1. Ordena partidos por probabilidad del lado elegido (max(home_p, away_p)).
 * 2. Toma los 4 con mayor p (desempate: HIGH > MEDIUM > LOW, luego game_pk).
 * 3. Probabilidad combinada = producto de las 4 probs (independencia aproximada).
 * 4. El slip se “bloquea” con fecha; al graduar los 4 juegos se marca HIT/MISS.
 */

import type { GamePrediction, ConfidenceLevel } from '../types';

export interface ParlayLeg {
  game_pk: number;
  game_date: string;
  pick: string;
  opponent: string;
  matchup: string;
  leg_prob: number;
  conf: ConfidenceLevel;
  home: string;
  away: string;
}

export interface KalParlaySlip {
  id: string;
  date: string;
  strategy: 'TOP4_PROB' | 'TOP4_HIGH_ONLY' | 'USER';
  legs: ParlayLeg[];
  combined_prob: number;
  fair_decimal_odds: number;
  /** Cuota americana aproximada del parlay “justo” */
  fair_american: string;
  conf_mix: { HIGH: number; MEDIUM: number; LOW: number };
  honesty_label: 'EDGE_OK' | 'EDGE_DEBIL' | 'COIN_FLIP_PARLAY';
  honesty_note: string;
  /** Resultado cuando los 4 están graded */
  status: 'OPEN' | 'HIT' | 'MISS' | 'VOID';
  legs_hit?: number;
  graded_at?: string;
  units_risked?: number;
  units_won?: number;
}

export interface ParlayTrackStats {
  n_slips: number;
  n_graded: number;
  hits: number;
  misses: number;
  hit_rate: number;
  /** Promedio de combined_prob de los slips graded (calibración) */
  avg_implied_prob: number;
  units_flat: number;
  /** Brier-like: (hit - p)^2 promedio */
  avg_brier: number;
  last_10: string;
}

const confRank = (c: ConfidenceLevel) => (c === 'HIGH' ? 3 : c === 'MEDIUM' ? 2 : 1);

function legProb(g: GamePrediction): number {
  return Math.max(g.home_p, g.away_p);
}

function toLeg(g: GamePrediction): ParlayLeg {
  const pickHome = g.home_p >= g.away_p;
  const pick = pickHome ? g.home : g.away;
  const opponent = pickHome ? g.away : g.home;
  return {
    game_pk: g.game_pk,
    game_date: g.game_date || '',
    pick,
    opponent,
    matchup: `${g.away} @ ${g.home}`,
    leg_prob: legProb(g),
    conf: g.conf,
    home: g.home,
    away: g.away,
  };
}

export function combinedProb(legs: ParlayLeg[]): number {
  if (!legs.length) return 0;
  return legs.reduce((p, l) => p * l.leg_prob, 1);
}

export function fairAmerican(decimalOdds: number): string {
  if (decimalOdds >= 2) return `+${Math.round((decimalOdds - 1) * 100)}`;
  return `${Math.round(-100 / (decimalOdds - 1))}`;
}

export function honestyFor(p: number, legs: ParlayLeg[]): {
  label: KalParlaySlip['honesty_label'];
  note: string;
} {
  const lows = legs.filter((l) => l.conf === 'LOW').length;
  if (p >= 0.12 && lows <= 1) {
    return {
      label: 'EDGE_OK',
      note: 'Parlay con probabilidad conjunta decente; aún así alta varianza.',
    };
  }
  if (p >= 0.06) {
    return {
      label: 'EDGE_DEBIL',
      note: 'Probabilidad conjunta baja. Válido para tracking, stake chico si apuestas.',
    };
  }
  return {
    label: 'COIN_FLIP_PARLAY',
    note:
      'Varios picks ~50%. Este parlay es casi lotería. KAL lo publica para medir efectividad, no como “seguro”.',
  };
}

/**
 * Parlay oficial del día: los 4 picks con mayor probabilidad individual.
 */
export function buildKalPick4(
  games: GamePrediction[],
  date: string,
  strategy: KalParlaySlip['strategy'] = 'TOP4_PROB'
): KalParlaySlip | null {
  let pool = [...games];
  if (strategy === 'TOP4_HIGH_ONLY') {
    pool = pool.filter((g) => g.conf === 'HIGH' || g.conf === 'MEDIUM');
  }
  if (pool.length < 4) return null;

  pool.sort((a, b) => {
    const dp = legProb(b) - legProb(a);
    if (Math.abs(dp) > 1e-9) return dp;
    const dc = confRank(b.conf) - confRank(a.conf);
    if (dc) return dc;
    return a.game_pk - b.game_pk;
  });

  const legs = pool.slice(0, 4).map(toLeg);
  const p = combinedProb(legs);
  const dec = p > 0 ? 1 / p : 99;
  const conf_mix = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  legs.forEach((l) => {
    conf_mix[l.conf] += 1;
  });
  const { label, note } = honestyFor(p, legs);

  return {
    id: `P4-${date}-${strategy}`,
    date,
    strategy,
    legs,
    combined_prob: p,
    fair_decimal_odds: dec,
    fair_american: fairAmerican(dec),
    conf_mix,
    honesty_label: label,
    honesty_note: note,
    status: 'OPEN',
    units_risked: 1,
  };
}

/**
 * Gradúa un slip cuando conoces el ganador real de cada game_pk.
 * results: map game_pk -> equipo ganador (abbr)
 */
export function gradeParlay(
  slip: KalParlaySlip,
  results: Record<number, string>
): KalParlaySlip {
  let hits = 0;
  let known = 0;
  for (const leg of slip.legs) {
    const w = results[leg.game_pk];
    if (!w) continue;
    known += 1;
    if (w === leg.pick) hits += 1;
  }
  if (known < 4) {
    return { ...slip, legs_hit: hits, status: 'OPEN' };
  }
  const isHit = hits === 4;
  const risk = slip.units_risked ?? 1;
  const payout = isHit ? risk * slip.fair_decimal_odds : 0;
  const units_won = isHit ? payout - risk : -risk;
  return {
    ...slip,
    legs_hit: hits,
    status: isHit ? 'HIT' : 'MISS',
    graded_at: new Date().toISOString(),
    units_won,
  };
}

export function computeParlayStats(slips: KalParlaySlip[]): ParlayTrackStats {
  const graded = slips.filter((s) => s.status === 'HIT' || s.status === 'MISS');
  const hits = graded.filter((s) => s.status === 'HIT').length;
  const misses = graded.length - hits;
  const avg_implied =
    graded.length === 0
      ? 0
      : graded.reduce((a, s) => a + s.combined_prob, 0) / graded.length;
  const units_flat = graded.reduce((a, s) => a + (s.units_won ?? 0), 0);
  const avg_brier =
    graded.length === 0
      ? 0
      : graded.reduce((a, s) => {
          const y = s.status === 'HIT' ? 1 : 0;
          return a + (y - s.combined_prob) ** 2;
        }, 0) / graded.length;
  const last = graded.slice(-10);
  const last_10 = last.map((s) => (s.status === 'HIT' ? 'W' : 'L')).join('') || '—';

  return {
    n_slips: slips.length,
    n_graded: graded.length,
    hits,
    misses,
    hit_rate: graded.length ? hits / graded.length : 0,
    avg_implied_prob: avg_implied,
    units_flat,
    avg_brier,
    last_10,
  };
}

/** Simulación de varianza: n trials Bernoulli(p) */
export function simulateParlayVariance(
  p: number,
  trials = 10000
): { hits: number; hit_rate: number; longest_drought: number } {
  let hits = 0;
  let drought = 0;
  let maxDrought = 0;
  for (let i = 0; i < trials; i++) {
    if (Math.random() < p) {
      hits += 1;
      drought = 0;
    } else {
      drought += 1;
      if (drought > maxDrought) maxDrought = drought;
    }
  }
  return {
    hits,
    hit_rate: hits / trials,
    longest_drought: maxDrought,
  };
}

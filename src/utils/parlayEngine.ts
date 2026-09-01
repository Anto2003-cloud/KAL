/**
 * KAL Parlay Engine — Pick-4, anti-longshot, bankroll y registro de jugadas.
 */

import type { GamePrediction, ConfidenceLevel } from '../types';
import { fairAmerican, fairDecimal } from './fairOdds';

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
  /** Cuota justa del modelo (americana) */
  fair_american: string;
  fair_decimal: number;
}

export interface KalParlaySlip {
  id: string;
  date: string;
  strategy: 'TOP4_SAFE' | 'TOP4_PROB' | 'TOP4_HIGH_ONLY' | 'USER';
  legs: ParlayLeg[];
  combined_prob: number;
  fair_decimal_odds: number;
  fair_american: string;
  conf_mix: { HIGH: number; MEDIUM: number; LOW: number };
  honesty_label: 'EDGE_OK' | 'EDGE_DEBIL' | 'COIN_FLIP_PARLAY';
  honesty_note: string;
  status: 'OPEN' | 'HIT' | 'MISS' | 'VOID';
  legs_hit?: number;
  graded_at?: string;
  units_risked?: number;
  units_won?: number;
  /** Filtro anti-longshot aplicado */
  min_leg_prob: number;
  max_fair_american: number;
}

/** Registro personal de si jugaste el parlay y cuánto */
export interface ParlayPlayLog {
  id: string;
  slip_id: string;
  date: string;
  played: boolean;
  stake: number; // dinero real o unidades
  currency: 'USD' | 'U';
  /** Cuota combinada que te dio la casa (decimal), opcional */
  book_decimal?: number;
  /** Resultado si ya se conoce */
  result?: 'HIT' | 'MISS' | 'PENDING' | 'SKIPPED';
  profit?: number; // stake * (decimal-1) si HIT, -stake si MISS
  note?: string;
  created_at: string;
}

export interface BankrollState {
  starting: number;
  current: number;
  currency: 'USD' | 'U';
  month_key: string; // YYYY-MM
  month_start_balance: number;
  max_stake_pct: number; // tope general (en plan 10/20 se ignora para el cálculo)
  target_month_profit_pct: number; // ej 0.10 = +10% al mes
  /** Plan del usuario: 10% normal, 20% día después de MISS (más seguro) */
  staking_plan: 'FLAT_PCT' | 'PLAN_10_20';
  /** Último resultado de una jugada real (para activar recuperación) */
  last_played_result?: 'HIT' | 'MISS' | 'SKIPPED' | null;
  recovery_active?: boolean;
}

export interface ParlayTrackStats {
  n_slips: number;
  n_graded: number;
  hits: number;
  misses: number;
  hit_rate: number;
  avg_implied_prob: number;
  units_flat: number;
  avg_brier: number;
  last_10: string;
}

const confRank = (c: ConfidenceLevel) => (c === 'HIGH' ? 3 : c === 'MEDIUM' ? 2 : 1);

function legProb(g: GamePrediction): number {
  return Math.max(g.home_p, g.away_p);
}

/** Americana justa numérica (negativo = favorito) */
function fairAmericanNum(p: number): number {
  if (p >= 0.5) return -Math.round((100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function toLeg(g: GamePrediction): ParlayLeg {
  const pickHome = g.home_p >= g.away_p;
  const pick = pickHome ? g.home : g.away;
  const opponent = pickHome ? g.away : g.home;
  const p = legProb(g);
  return {
    game_pk: g.game_pk,
    game_date: g.game_date || '',
    pick,
    opponent,
    matchup: `${g.away} @ ${g.home}`,
    leg_prob: p,
    conf: g.conf,
    home: g.home,
    away: g.away,
    fair_american: fairAmerican(p),
    fair_decimal: fairDecimal(p),
  };
}

export function combinedProb(legs: ParlayLeg[]): number {
  if (!legs.length) return 0;
  return legs.reduce((p, l) => p * l.leg_prob, 1);
}

export function fairAmericanFromDecimal(decimalOdds: number): string {
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
      note: 'Parlay con probabilidad conjunta decente; aún alta varianza.',
    };
  }
  if (p >= 0.06) {
    return {
      label: 'EDGE_DEBIL',
      note: 'Probabilidad conjunta baja. Stake chico si juegas.',
    };
  }
  return {
    label: 'COIN_FLIP_PARLAY',
    note: 'Varias piernas ~50%. Alta varianza — solo para tracking o stake mínimo.',
  };
}

/**
 * Anti-longshot:
 * - min_leg_prob default 0.53 (no perros largos del modelo)
 * - max_fair_american default +110 (si la justa es más positiva, se descarta)
 */
export function buildKalPick4(
  games: GamePrediction[],
  date: string,
  strategy: KalParlaySlip['strategy'] = 'TOP4_SAFE',
  opts?: { min_leg_prob?: number; max_fair_american?: number }
): KalParlaySlip | null {
  const minP = opts?.min_leg_prob ?? (strategy === 'TOP4_SAFE' ? 0.53 : 0.5);
  const maxAm = opts?.max_fair_american ?? 110; // +110 máximo como “largo”

  let pool = [...games];
  if (strategy === 'TOP4_HIGH_ONLY') {
    pool = pool.filter((g) => g.conf === 'HIGH' || g.conf === 'MEDIUM');
  }

  pool = pool.filter((g) => {
    const p = legProb(g);
    if (p < minP) return false;
    const am = fairAmericanNum(p);
    // underdog with american > maxAm rejected
    if (am > maxAm) return false;
    return true;
  });

  if (pool.length < 4) {
    // relax once: allow minP - 0.02
    pool = [...games].filter((g) => {
      const p = legProb(g);
      if (p < minP - 0.02) return false;
      const am = fairAmericanNum(p);
      return am <= maxAm + 20;
    });
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
    fair_american: fairAmericanFromDecimal(dec),
    conf_mix,
    honesty_label: label,
    honesty_note: note,
    status: 'OPEN',
    units_risked: 1,
    min_leg_prob: minP,
    max_fair_american: maxAm,
  };
}

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
  return { hits, hit_rate: hits / trials, longest_drought: maxDrought };
}

/** Stake sugerido: min(max_pct * bank, bank * kelly_frac muy conservador) */
export function suggestStake(
  bank: number,
  combinedProb: number,
  bookDecimal: number | undefined,
  maxPct: number
): number {
  const cap = bank * maxPct;
  if (!bookDecimal || bookDecimal <= 1 || combinedProb <= 0) {
    return Math.max(0, Math.round(cap * 100) / 100);
  }
  // Kelly fraccional 1/4
  const b = bookDecimal - 1;
  const q = 1 - combinedProb;
  const kelly = (combinedProb * b - q) / b;
  const frac = Math.max(0, kelly * 0.25);
  const stake = Math.min(cap, bank * frac);
  return Math.max(0, Math.round(stake * 100) / 100);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function defaultBankroll(): BankrollState {
  const mk = monthKey();
  return {
    starting: 100,
    current: 100,
    currency: 'USD',
    month_key: mk,
    month_start_balance: 100,
    max_stake_pct: 0.1,
    target_month_profit_pct: 0.1,
    staking_plan: 'PLAN_10_20',
    last_played_result: null,
    recovery_active: false,
  };
}

export type PlayAdvice = 'JUGAR' | 'PRECAUCION' | 'NO_JUGAR';

export type StakePlanDecision = {
  mode: 'BASE_10' | 'RECOVERY_20' | 'BLOCKED';
  pct: number;
  stake: number;
  reason: string;
  force_safe_strategy: boolean;
  /** Recomendación explícita de KAL */
  play_advice: PlayAdvice;
  play_advice_title: string;
  play_advice_detail: string;
};

/**
 * Plan del usuario + recomendación JUGAR / PRECAUCIÓN / NO JUGAR.
 */
export function stakeForUserPlan(
  bank: BankrollState,
  honesty: 'EDGE_OK' | 'EDGE_DEBIL' | 'COIN_FLIP_PARLAY',
  combinedProb?: number
): StakePlanDecision {
  const recovery = Boolean(bank.recovery_active);
  const p = combinedProb ?? 0;

  // --- Reglas de NO JUGAR (prioridad) ---
  if (honesty === 'COIN_FLIP_PARLAY') {
    return {
      mode: recovery ? 'BLOCKED' : 'BASE_10',
      pct: 0,
      stake: 0,
      reason: recovery
        ? 'Recuperación activa pero el slip es COIN_FLIP.'
        : 'Slip tipo moneda al aire.',
      force_safe_strategy: true,
      play_advice: 'NO_JUGAR',
      play_advice_title: 'KAL recomienda: NO JUGAR',
      play_advice_detail:
        'La probabilidad conjunta es demasiado baja (varias piernas ~50%). Un parlay así no es edge, es varianza. Mejor registrar «No jugué» y conservar bankroll.',
    };
  }

  if (p > 0 && p < 0.05) {
    return {
      mode: recovery ? 'BLOCKED' : 'BASE_10',
      pct: 0,
      stake: 0,
      reason: 'Probabilidad conjunta < 5%.',
      force_safe_strategy: true,
      play_advice: 'NO_JUGAR',
      play_advice_title: 'KAL recomienda: NO JUGAR',
      play_advice_detail:
        'Menos de 5% de probabilidad conjunta. Aunque el plan diga 10% o 20%, KAL te recomienda pasar el día.',
    };
  }

  if (recovery) {
    if (honesty === 'EDGE_DEBIL') {
      return {
        mode: 'BLOCKED',
        pct: 0,
        stake: 0,
        reason: 'Recuperación 20% con edge débil: no forzar.',
        force_safe_strategy: true,
        play_advice: 'NO_JUGAR',
        play_advice_title: 'KAL recomienda: NO JUGAR (recuperación)',
        play_advice_detail:
          'Venía de un MISS y hoy el slip no es sólido (EDGE DÉBIL). Subir al 20% aquí es peor. Espera un día EDGE_OK o juega solo singles HIGH.',
      };
    }
    const pct = 0.2;
    const stake = Math.round(bank.current * pct * 100) / 100;
    return {
      mode: 'RECOVERY_20',
      pct,
      stake,
      reason:
        'MISS reciente → hoy 20% en parlay MÁS SEGURO (EDGE_OK). Si aciertas, vuelves a 10%.',
      force_safe_strategy: true,
      play_advice: honesty === 'EDGE_OK' ? 'JUGAR' : 'PRECAUCION',
      play_advice_title:
        honesty === 'EDGE_OK'
          ? 'KAL recomienda: JUGAR (recuperación 20%)'
          : 'KAL recomienda: PRECAUCIÓN',
      play_advice_detail:
        honesty === 'EDGE_OK'
          ? 'Slip aceptable para tu plan de recuperación. Stake 20% del bank. Al marcar HIT vuelves a 10%.'
          : 'Recuperación con slip no ideal. Si juegas, asume alta varianza.',
    };
  }

  // Base 10%
  const pct = 0.1;
  const stake = Math.round(bank.current * pct * 100) / 100;
  if (honesty === 'EDGE_DEBIL') {
    return {
      mode: 'BASE_10',
      pct: 0,
      stake: 0,
      reason: 'Edge débil en día normal.',
      force_safe_strategy: false,
      play_advice: 'NO_JUGAR',
      play_advice_title: 'KAL recomienda: NO JUGAR',
      play_advice_detail:
        'Hoy el parlay es EDGE DÉBIL. Con tu plan del 10% no compensa forzar. Pasa o usa solo un single HIGH en Pronósticos.',
    };
  }
  return {
    mode: 'BASE_10',
    pct,
    stake,
    reason: 'Plan base: 10% del bank. Slip con EDGE_OK.',
    force_safe_strategy: false,
    play_advice: 'JUGAR',
    play_advice_title: 'KAL recomienda: JUGAR (10%)',
    play_advice_detail:
      'Parlay dentro de lo razonable para tu plan. Stake 10% del bank. Si pierdes, mañana modo recuperación 20% solo si el slip es bueno.',
  };
}

export function computePlayProfit(
  played: boolean,
  stake: number,
  result: ParlayPlayLog['result'],
  bookDecimal?: number,
  fairDecimal?: number
): number {
  if (!played || result === 'SKIPPED' || result === 'PENDING' || !result) return 0;
  if (result === 'MISS') return -stake;
  if (result === 'HIT') {
    const dec = bookDecimal && bookDecimal > 1 ? bookDecimal : fairDecimal || 2;
    return stake * (dec - 1);
  }
  return 0;
}

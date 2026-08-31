import React, { useMemo, useState } from 'react';
import type { GamePrediction } from '../types';
import {
  buildKalPick4,
  computeParlayStats,
  simulateParlayVariance,
  type KalParlaySlip,
} from '../utils/parlayEngine';

interface Props {
  games: GamePrediction[];
  date: string;
  /** Historial de slips ya graded (localStorage / API) */
  history?: KalParlaySlip[];
  onLockSlip?: (slip: KalParlaySlip) => void;
}

const honestyColor = {
  EDGE_OK: 'text-emerald-400',
  EDGE_DEBIL: 'text-amber-400',
  COIN_FLIP_PARLAY: 'text-rose-400',
} as const;

export function ParlayLab({ games, date, history = [], onLockSlip }: Props) {
  const [strategy, setStrategy] = useState<'TOP4_PROB' | 'TOP4_HIGH_ONLY'>('TOP4_PROB');

  const slip = useMemo(
    () => buildKalPick4(games, date, strategy),
    [games, date, strategy]
  );

  const stats = useMemo(() => computeParlayStats(history), [history]);

  const sim = useMemo(() => {
    if (!slip) return null;
    return simulateParlayVariance(slip.combined_prob, 10000);
  }, [slip]);

  if (!slip) {
    return (
      <div className="p-8 rounded-2xl border border-white/[0.06] bg-[#18181b] text-center">
        <p className="text-sm text-neutral-300">
          No hay al menos 4 partidos para armar el Parlay KAL de 4.
        </p>
        {strategy === 'TOP4_HIGH_ONLY' && (
          <button
            type="button"
            className="mt-3 text-xs text-sky-400 underline"
            onClick={() => setStrategy('TOP4_PROB')}
          >
            Usar los 4 con mayor probabilidad (incluye LOW)
          </button>
        )}
      </div>
    );
  }

  const pPct = (slip.combined_prob * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Parlay KAL · 4 piernas</h2>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">
            KAL elige los 4 picks del día con mayor probabilidad individual, calcula la
            probabilidad conjunta y registra la efectividad real cuando cierran los 4 juegos.
            No es una “garantía”: es un experimento medible.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStrategy('TOP4_PROB')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              strategy === 'TOP4_PROB'
                ? 'bg-white text-black'
                : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
            }`}
          >
            Top 4 por prob
          </button>
          <button
            type="button"
            onClick={() => setStrategy('TOP4_HIGH_ONLY')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              strategy === 'TOP4_HIGH_ONLY'
                ? 'bg-white text-black'
                : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
            }`}
          >
            Solo MED/HIGH
          </button>
        </div>
      </div>

      {/* Slip del día */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#12141a] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-neutral-400">
            Slip <span className="text-neutral-200 font-mono">{slip.id}</span> · {date}
          </div>
          <div className={`text-xs font-semibold ${honestyColor[slip.honesty_label]}`}>
            {slip.honesty_label.replace(/_/g, ' ')}
          </div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {slip.legs.map((leg, i) => (
            <div
              key={leg.game_pk}
              className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-neutral-500 font-mono text-xs w-4">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {leg.pick}{' '}
                    <span className="text-neutral-500 font-normal">vs {leg.opponent}</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">{leg.matchup}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-white">{(leg.leg_prob * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-neutral-500">{leg.conf}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-4 bg-black/30 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Prob. conjunta
            </div>
            <div className="text-xl font-bold text-white">{pPct}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Cuota justa
            </div>
            <div className="text-xl font-bold text-white">{slip.fair_american}</div>
            <div className="text-[10px] text-neutral-500">
              {slip.fair_decimal_odds.toFixed(2)}x
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Mix conf</div>
            <div className="text-sm text-neutral-300">
              H{slip.conf_mix.HIGH} · M{slip.conf_mix.MEDIUM} · L{slip.conf_mix.LOW}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Stake demo</div>
            <div className="text-sm text-neutral-300">1u → paga ~{slip.fair_decimal_odds.toFixed(1)}u</div>
          </div>
        </div>

        <p className="px-4 py-3 text-xs text-neutral-400 border-t border-white/[0.06]">
          {slip.honesty_note}
        </p>

        {onLockSlip && (
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => onLockSlip(slip)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-neutral-200"
            >
              Bloquear slip del día (inmutable)
            </button>
          </div>
        )}
      </div>

      {/* Varianza */}
      {sim && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Varianza (simulación 10k)</h3>
          <p className="text-xs text-neutral-400 mb-3">
            Si este parlay tuviera siempre p = {pPct}%, en 10.000 repeticiones…
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-lg font-bold text-white">
                {(sim.hit_rate * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-neutral-500">hit rate sim</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-lg font-bold text-white">{sim.hits}</div>
              <div className="text-[10px] text-neutral-500">hits / 10k</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-lg font-bold text-white">{sim.longest_drought}</div>
              <div className="text-[10px] text-neutral-500">peor racha de misses</div>
            </div>
          </div>
        </div>
      )}

      {/* Efectividad histórica de parlays KAL */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Efectividad Parlay-4 KAL</h3>
        <p className="text-[11px] text-neutral-500 mb-4">
          Solo slips bloqueados y graded (los 4 juegos finalizados). Separado del récord de
          partidos sueltos.
        </p>
        {stats.n_graded === 0 ? (
          <p className="text-xs text-neutral-400">
            Aún no hay parlays calificados. Cuando cierren los 4 del slip, aquí verás HIT rate
            real vs prob. promedio implicada.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-neutral-500">Récord parlay</div>
              <div className="text-lg font-bold text-white">
                {stats.hits}-{stats.misses}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500">Hit rate</div>
              <div className="text-lg font-bold text-white">
                {(stats.hit_rate * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500">p media implicada</div>
              <div className="text-lg font-bold text-white">
                {(stats.avg_implied_prob * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500">Unidades (1u)</div>
              <div className="text-lg font-bold text-white">
                {stats.units_flat >= 0 ? '+' : ''}
                {stats.units_flat.toFixed(1)}u
              </div>
            </div>
            <div className="col-span-2 sm:col-span-4 text-xs text-neutral-500">
              Últimos 10: <span className="font-mono text-neutral-300">{stats.last_10}</span>
              {' · '}
              Brier medio: {stats.avg_brier.toFixed(3)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ParlayLab;

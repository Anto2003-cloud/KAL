import React, { useEffect, useMemo, useState } from 'react';
import type { GamePrediction } from '../types';
import {
  buildKalPick4,
  computeParlayStats,
  simulateParlayVariance,
  suggestStake,
  defaultBankroll,
  monthKey,
  computePlayProfit,
  stakeForUserPlan,
  type KalParlaySlip,
  type ParlayPlayLog,
  type BankrollState,
} from '../utils/parlayEngine';

const LS_BANK = 'kal_parlay_bank';
const LS_PLAYS = 'kal_parlay_plays';
const LS_SLIPS = 'kal_parlay_history';

interface Props {
  games: GamePrediction[];
  date: string;
  history?: KalParlaySlip[];
  onLockSlip?: (slip: KalParlaySlip) => void;
}

const honestyColor = {
  EDGE_OK: 'text-emerald-400',
  EDGE_DEBIL: 'text-amber-400',
  COIN_FLIP_PARLAY: 'text-rose-400',
} as const;

function loadBank(): BankrollState {
  try {
    const raw = localStorage.getItem(LS_BANK);
    if (!raw) return defaultBankroll();
    const b = JSON.parse(raw) as BankrollState;
    const mk = monthKey();
    if (b.month_key !== mk) {
      return {
        ...b,
        month_key: mk,
        month_start_balance: b.current,
      };
    }
    return b;
  } catch {
    return defaultBankroll();
  }
}

function loadPlays(): ParlayPlayLog[] {
  try {
    return JSON.parse(localStorage.getItem(LS_PLAYS) || '[]');
  } catch {
    return [];
  }
}

export function ParlayLab({ games, date, history = [], onLockSlip }: Props) {
  const [strategy, setStrategy] = useState<'TOP4_SAFE' | 'TOP4_PROB' | 'TOP4_HIGH_ONLY'>(
    'TOP4_SAFE'
  );
  const [bank, setBank] = useState<BankrollState>(() => loadBank());
  const [plays, setPlays] = useState<ParlayPlayLog[]>(() => loadPlays());
  const [stakeInput, setStakeInput] = useState('');
  const [bookOdds, setBookOdds] = useState('');
  const [playedToday, setPlayedToday] = useState<boolean | null>(null);

  // Plan 10/20: en recuperación forzar estrategia segura
  const effectiveStrategy =
    bank.recovery_active && strategy !== 'TOP4_SAFE' ? 'TOP4_SAFE' : strategy;

  const slip = useMemo(
    () =>
      buildKalPick4(games, date, effectiveStrategy, {
        min_leg_prob: effectiveStrategy === 'TOP4_SAFE' ? 0.53 : 0.5,
        max_fair_american: 110,
      }),
    [games, date, effectiveStrategy]
  );

  const planDecision = useMemo(() => {
    if (!slip) {
      return stakeForUserPlan(bank, 'COIN_FLIP_PARLAY', 0);
    }
    return stakeForUserPlan(bank, slip.honesty_label, slip.combined_prob);
  }, [bank, slip]);

  const stats = useMemo(() => computeParlayStats(history), [history]);

  const sim = useMemo(() => {
    if (!slip) return null;
    return simulateParlayVariance(slip.combined_prob, 10000);
  }, [slip]);

  const monthPlays = useMemo(
    () => plays.filter((p) => p.date.startsWith(bank.month_key)),
    [plays, bank.month_key]
  );

  const monthProfit = useMemo(
    () => monthPlays.reduce((s, p) => s + (p.profit ?? 0), 0),
    [monthPlays]
  );

  const monthTarget = bank.month_start_balance * bank.target_month_profit_pct;
  const monthOnTrack = monthProfit >= 0;

  useEffect(() => {
    localStorage.setItem(LS_BANK, JSON.stringify(bank));
  }, [bank]);

  useEffect(() => {
    localStorage.setItem(LS_PLAYS, JSON.stringify(plays));
  }, [plays]);

  useEffect(() => {
    if (!slip) return;
    const existing = plays.find((p) => p.slip_id === slip.id);
    if (existing) {
      setPlayedToday(existing.played);
      setStakeInput(String(existing.stake || ''));
      setBookOdds(existing.book_decimal ? String(existing.book_decimal) : '');
    } else {
      setPlayedToday(null);
      if (bank.staking_plan === 'PLAN_10_20') {
        const d = stakeForUserPlan(bank, slip.honesty_label, slip.combined_prob);
        setStakeInput(d.stake ? String(d.stake) : '');
      } else {
        const sug = suggestStake(
          bank.current,
          slip.combined_prob,
          undefined,
          bank.max_stake_pct
        );
        setStakeInput(sug ? String(sug) : '');
      }
      setBookOdds('');
    }
  }, [slip?.id]);

  const suggested =
    bank.staking_plan === 'PLAN_10_20'
      ? planDecision.stake
      : slip
        ? suggestStake(
            bank.current,
            slip.combined_prob,
            bookOdds ? parseFloat(bookOdds) : undefined,
            bank.max_stake_pct
          )
        : 0;

  const savePlay = (played: boolean) => {
    if (!slip) return;
    if (played && (planDecision.play_advice === 'NO_JUGAR' || planDecision.mode === 'BLOCKED')) {
      alert(
        planDecision.play_advice_title +
          '\n\n' +
          planDecision.play_advice_detail +
          '\n\nKAL te recomienda registrar «No jugué».'
      );
      return;
    }
    const stake =
      bank.staking_plan === 'PLAN_10_20'
        ? planDecision.stake || parseFloat(stakeInput) || 0
        : parseFloat(stakeInput) || 0;
    const book = bookOdds ? parseFloat(bookOdds) : undefined;
    const log: ParlayPlayLog = {
      id: `play-${slip.id}`,
      slip_id: slip.id,
      date: slip.date,
      played,
      stake: played ? stake : 0,
      currency: bank.currency,
      book_decimal: book,
      result: played ? 'PENDING' : 'SKIPPED',
      profit: 0,
      created_at: new Date().toISOString(),
      note:
        bank.staking_plan === 'PLAN_10_20'
          ? `plan=${planDecision.mode} pct=${(planDecision.pct * 100).toFixed(0)}%`
          : undefined,
    };
    setPlays((prev) => {
      const next = [...prev.filter((p) => p.slip_id !== slip.id), log];
      return next;
    });
    setPlayedToday(played);
    if (!played) {
      // Skip no activa recuperación
      setBank((b) => ({ ...b, last_played_result: 'SKIPPED' }));
    }
    if (onLockSlip) onLockSlip(slip);
  };

  const settlePlay = (slipId: string, result: 'HIT' | 'MISS') => {
    setPlays((prev) => {
      const next = prev.map((p) => {
        if (p.slip_id !== slipId || !p.played) return p;
        const profit = computePlayProfit(
          true,
          p.stake,
          result,
          p.book_decimal,
          history.find((h) => h.id === slipId)?.fair_decimal_odds || slip?.fair_decimal_odds
        );
        return { ...p, result, profit };
      });
      const settledProfit = next
        .filter((p) => p.result === 'HIT' || p.result === 'MISS')
        .reduce((s, p) => s + (p.profit ?? 0), 0);
      setBank((b) => ({
        ...b,
        current: Math.round((b.starting + settledProfit) * 100) / 100,
        last_played_result: result,
        // Plan 10/20: MISS → mañana 20%; HIT → vuelve a 10%
        recovery_active: result === 'MISS',
      }));
      return next;
    });
  };

  if (!slip) {
    return (
      <div className="p-8 rounded-2xl border border-white/[0.06] bg-[#18181b] text-center space-y-3">
        <p className="text-sm text-neutral-300">
          No hay 4 piernas que pasen el filtro anti-longshot (prob ≥53% y cuota justa ≤ +110).
        </p>
        <p className="text-xs text-neutral-500">
          KAL evita equipos muy largos. Prueba estrategia “Top 4 por prob” o espera cartelera con más favoritos.
        </p>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-full bg-white text-black font-semibold"
          onClick={() => setStrategy('TOP4_PROB')}
        >
          Relajar a Top 4 por prob
        </button>
      </div>
    );
  }

  const pPct = (slip.combined_prob * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Parlay KAL · plan 10/20 + bankroll</h2>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">
            Tu plan: <strong className="text-neutral-300">10% del bank</strong>; si pierdes, al día siguiente{' '}
            <strong className="text-neutral-300">20% en parlay más seguro</strong>; si ganas, vuelves a 10%.
            Cuota ref. = justa del modelo; pega la de tu casa al registrar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['TOP4_SAFE', 'Seguro (≥53%)'],
              ['TOP4_PROB', 'Top 4 prob'],
              ['TOP4_HIGH_ONLY', 'Solo MED/HIGH'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStrategy(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                strategy === id
                  ? 'bg-white text-black'
                  : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bankroll */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#12141a] p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">Bankroll</div>
          <div className="text-lg font-bold text-white">
            {bank.current.toFixed(2)} {bank.currency}
          </div>
          <input
            type="number"
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs"
            value={bank.starting}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              setBank((b) => ({
                ...b,
                starting: v,
                current: v + monthProfit,
                month_start_balance: v,
              }));
            }}
            title="Bankroll inicial"
          />
          <div className="text-[9px] text-neutral-600">Inicial (editable)</div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">P&L del mes</div>
          <div className={`text-lg font-bold ${monthProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {monthProfit >= 0 ? '+' : ''}
            {monthProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-neutral-500">
            Meta +{(bank.target_month_profit_pct * 100).toFixed(0)}% ≈ +{monthTarget.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">Estado mes</div>
          <div className={`text-sm font-semibold mt-1 ${monthOnTrack ? 'text-emerald-400' : 'text-amber-400'}`}>
            {monthOnTrack ? 'En positivo / camino' : 'En rojo — revisar estrategia'}
          </div>
          {!monthOnTrack && (
            <div className="text-[10px] text-neutral-500 mt-1">
              Baja stake, solo TOP4_SAFE, o para si honesty = COIN_FLIP
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 uppercase">
            {bank.staking_plan === 'PLAN_10_20' ? 'Stake del plan' : 'Máx stake'}
          </div>
          {bank.staking_plan === 'PLAN_10_20' ? (
            <>
              <div className="text-lg font-bold text-white">
                {planDecision.mode === 'RECOVERY_20'
                  ? '20%'
                  : planDecision.mode === 'BLOCKED' || planDecision.play_advice === 'NO_JUGAR'
                    ? '—'
                    : '10%'}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {planDecision.play_advice === 'NO_JUGAR'
                  ? 'Hoy: no jugar (plan en pausa)'
                  : planDecision.mode === 'RECOVERY_20'
                    ? `Recuperación · ${planDecision.stake} ${bank.currency}`
                    : `Base · ${planDecision.stake} ${bank.currency}`}
              </div>
              <div className="text-[9px] text-neutral-600 mt-1">Plan fijo 10% / 20% (no usa el slider 5%)</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-white">
                {(bank.max_stake_pct * 100).toFixed(0)}%
              </div>
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={bank.max_stake_pct * 100}
                onChange={(e) =>
                  setBank((b) => ({ ...b, max_stake_pct: parseFloat(e.target.value) / 100 }))
                }
                className="w-full mt-1"
              />
            </>
          )}
        </div>
      </div>


      {/* Recomendación KAL + plan 10/20 */}
      {bank.staking_plan === 'PLAN_10_20' && (
        <div
          className={`rounded-2xl border p-4 text-xs space-y-2 ${
            planDecision.play_advice === 'NO_JUGAR'
              ? 'border-rose-500/40 bg-rose-500/10'
              : planDecision.play_advice === 'PRECAUCION'
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10'
          }`}
        >
          <div
            className={`text-base font-bold tracking-tight ${
              planDecision.play_advice === 'NO_JUGAR'
                ? 'text-rose-300'
                : planDecision.play_advice === 'PRECAUCION'
                  ? 'text-amber-200'
                  : 'text-emerald-300'
            }`}
          >
            {planDecision.play_advice_title}
          </div>
          <p className="text-neutral-200 leading-relaxed">{planDecision.play_advice_detail}</p>
          <div className="flex flex-wrap gap-3 text-[11px] text-neutral-400 pt-1 border-t border-white/10">
            <span>Plan: 10% → MISS → 20% seguro → HIT → 10%</span>
            <span>
              Modo: <strong className="text-neutral-200">{planDecision.mode}</strong>
            </span>
            {planDecision.play_advice !== 'NO_JUGAR' && (
              <span>
                Stake: <strong className="text-neutral-200">{planDecision.stake}</strong> (
                {(planDecision.pct * 100).toFixed(0)}%)
              </span>
            )}
            {bank.recovery_active && <span className="text-amber-300">Recuperación activa</span>}
          </div>
          {planDecision.play_advice === 'NO_JUGAR' && (
            <p className="text-rose-200/90 font-medium">
              Usa el botón «No jugué». El botón «Sí, lo jugué» está bloqueado mientras KAL diga NO JUGAR.
            </p>
          )}
        </div>
      )}

      {/* Slip */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#12141a] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-neutral-400">
            Slip <span className="text-neutral-200 font-mono">{slip.id}</span>
            <span className="text-neutral-600"> · anti-longshot p≥{slip.min_leg_prob} · justa≤+{slip.max_fair_american}</span>
          </div>
          <div className={`text-xs font-semibold ${honestyColor[slip.honesty_label]}`}>
            {slip.honesty_label.replace(/_/g, ' ')}
          </div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {slip.legs.map((leg, i) => (
            <div key={leg.game_pk} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-neutral-500 font-mono text-xs w-4">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {leg.pick} <span className="text-neutral-500 font-normal">vs {leg.opponent}</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {leg.matchup} · justa {leg.fair_american} ({leg.fair_decimal.toFixed(2)}x)
                  </div>
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
            <div className="text-[10px] uppercase text-neutral-500">Prob. conjunta</div>
            <div className="text-xl font-bold text-white">{pPct}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Cuota justa ref.</div>
            <div className="text-xl font-bold text-white">{slip.fair_american}</div>
            <div className="text-[10px] text-neutral-500">{slip.fair_decimal_odds.toFixed(2)}x modelo</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Stake sugerido</div>
            <div className="text-xl font-bold text-white">{suggested}</div>
            <div className="text-[10px] text-neutral-500">
              {bank.staking_plan === 'PLAN_10_20'
                ? planDecision.play_advice === 'NO_JUGAR'
                  ? 'bloqueado hoy'
                  : `${(planDecision.pct * 100).toFixed(0)}% del bank (plan)`
                : `≤${(bank.max_stake_pct * 100).toFixed(0)}% bank`}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Mix conf</div>
            <div className="text-sm text-neutral-300">
              H{slip.conf_mix.HIGH} · M{slip.conf_mix.MEDIUM} · L{slip.conf_mix.LOW}
            </div>
          </div>
        </div>
        <p className="px-4 py-3 text-xs text-neutral-400 border-t border-white/[0.06]">{slip.honesty_note}</p>
      </div>

      {/* Registrar jugada — dinero real */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Registro de tu apuesta (P&amp;L real)</h3>
        <p className="text-[11px] text-neutral-400">
          Pon <strong className="text-neutral-300">cuánto metiste</strong> y la <strong className="text-neutral-300">cuota decimal de tu casa</strong>
          (o cuánto te pagan en total si gana). Así KAL calcula exactamente cuánto ganaste o perdiste.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-neutral-400">
            1. ¿Cuánto le metiste? ({bank.currency})
            <input
              type="number"
              min={0}
              step="0.01"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              placeholder={`Ej. ${suggested || 10}`}
            />
            <span className="text-[10px] text-neutral-600">El dinero que apostaste en la casa</span>
          </label>
          <label className="text-xs text-neutral-400">
            2. Cuota decimal de la casa (lo que paga el parlay)
            <input
              type="number"
              min={1.01}
              step="0.01"
              value={bookOdds}
              onChange={(e) => setBookOdds(e.target.value)}
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              placeholder={`Ej. 8.50 — modelo sugiere ~${slip.fair_decimal_odds.toFixed(2)}`}
            />
            <span className="text-[10px] text-neutral-600">
              En el ticket: si apuestas 1 y te devuelven 8.50 en total, la cuota es 8.50
            </span>
          </label>
        </div>
        {/* Preview P&L */}
        {(() => {
          const st = parseFloat(stakeInput) || 0;
          const dec = parseFloat(bookOdds) || slip.fair_decimal_odds;
          const winProfit = st > 0 && dec > 1 ? st * (dec - 1) : 0;
          const totalReturn = st > 0 && dec > 1 ? st * dec : 0;
          return (
            <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-neutral-500">Si GANA (HIT)</div>
                <div className="text-emerald-400 font-semibold">
                  +{winProfit.toFixed(2)} {bank.currency}{' '}
                  <span className="text-neutral-500 font-normal">(te devuelven {totalReturn.toFixed(2)})</span>
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Si PIERDE (MISS)</div>
                <div className="text-rose-400 font-semibold">
                  −{st.toFixed(2)} {bank.currency}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Cuota usada</div>
                <div className="text-white font-mono">
                  {dec.toFixed(2)}x {bookOdds ? '(tu casa)' : '(ref. modelo)'}
                </div>
              </div>
            </div>
          );
        })()}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => savePlay(true)}
            disabled={planDecision.play_advice === 'NO_JUGAR'}
            className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-xl text-xs font-semibold ${
              planDecision.play_advice === 'NO_JUGAR'
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                : 'bg-white text-black'
            }`}
          >
            {planDecision.play_advice === 'NO_JUGAR' ? 'Sí (bloqueado por KAL)' : 'Sí, lo jugué — guardar'}
          </button>
          <button
            type="button"
            onClick={() => savePlay(false)}
            className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-xl text-xs font-semibold border ${
              planDecision.play_advice === 'NO_JUGAR'
                ? 'bg-rose-500 text-white border-rose-400'
                : 'bg-white/10 text-neutral-200 border-white/10'
            }`}
          >
            No jugué
          </button>
        </div>
        {playedToday === true && (
          <div className="space-y-2">
            <p className="text-xs text-emerald-300">
              Guardado. Cuando terminen los 4 juegos, marca el resultado para actualizar tu bankroll:
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                onClick={() => settlePlay(slip.id, 'HIT')}
              >
                Gané el parlay (HIT)
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30"
                onClick={() => settlePlay(slip.id, 'MISS')}
              >
                Perdí el parlay (MISS)
              </button>
            </div>
          </div>
        )}
        {playedToday === false && (
          <span className="text-xs text-neutral-500">Registrado: no jugado (0 en el P&amp;L).</span>
        )}
      </div>

      {/* Efectividad KAL slips */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Efectividad recomendaciones Parlay-4 KAL</h3>
        <p className="text-[11px] text-neutral-500 mb-3">
          Slips oficiales bloqueados (modelo). Separado de tu bankroll personal.
        </p>
        {stats.n_graded === 0 ? (
          <p className="text-xs text-neutral-400">
            Aún sin parlays calificados. Al bloquear el slip, KAL auto-califica cuando el historial del API tenga ganadores de los 4 juegos (o marca HIT/MISS a mano).
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-neutral-500">Récord</div>
              <div className="text-lg font-bold text-white">
                {stats.hits}-{stats.misses}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500">Hit rate</div>
              <div className="text-lg font-bold text-white">{(stats.hit_rate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500">p media</div>
              <div className="text-lg font-bold text-white">
                {(stats.avg_implied_prob * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-neutral-500">u modelo</div>
              <div className="text-lg font-bold text-white">
                {stats.units_flat >= 0 ? '+' : ''}
                {stats.units_flat.toFixed(1)}u
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mis jugadas del mes */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Mis jugadas ({bank.month_key})</h3>
        {monthPlays.length === 0 ? (
          <p className="text-xs text-neutral-500">Ninguna registrada este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-neutral-500 border-b border-white/10">
                <tr>
                  <th className="py-2">Fecha</th>
                  <th>¿Jugó?</th>
                  <th>Metí</th>
                  <th>Cuota casa</th>
                  <th>Resultado</th>
                  <th className="text-right">Gané / Perdí</th>
                </tr>
              </thead>
              <tbody className="text-neutral-300">
                {monthPlays.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.04]">
                    <td className="py-2">{p.date}</td>
                    <td>{p.played ? 'Sí' : 'No'}</td>
                    <td>{p.played ? p.stake : '—'}</td>
                    <td>{p.played && p.book_decimal ? p.book_decimal.toFixed(2) : '—'}</td>
                    <td>{p.result || '—'}</td>
                    <td className={`text-right ${(p.profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {p.played ? `${(p.profit ?? 0) >= 0 ? '+' : ''}${(p.profit ?? 0).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sim && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4 text-xs text-neutral-400">
          Varianza (10k): hit rate sim {(sim.hit_rate * 100).toFixed(1)}% · peor racha misses {sim.longest_drought}
        </div>
      )}
    </div>
  );
}

export default ParlayLab;

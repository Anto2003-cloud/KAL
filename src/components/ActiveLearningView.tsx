import React, { useState } from 'react';
import {
  TrendingUp,
  Brain,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  BarChart3,
  DollarSign,
  Activity,
  Award,
  Sparkles,
  RotateCw
} from 'lucide-react';
import {
  BANKROLL_STATS_DATA,
  BANKROLL_TIMELINE_DATA,
  POST_MORTEM_SAMPLES
} from '../data/ninePillarsData';

export const ActiveLearningView: React.FC = () => {
  const [selectedDiagnosticIdx, setSelectedDiagnosticIdx] = useState<number>(0);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationSuccess, setCalibrationSuccess] = useState<boolean>(false);

  const activePostMortem = POST_MORTEM_SAMPLES[selectedDiagnosticIdx];

  const handleTriggerLearningStep = () => {
    setIsCalibrating(true);
    setTimeout(() => {
      setIsCalibrating(false);
      setCalibrationSuccess(true);
      setTimeout(() => setCalibrationSuccess(false), 3000);
    }, 700);
  };

  return (
    <div className="space-y-4">

      {/* Honest disclaimer: bankroll/ROI/post-mortem numbers below are illustrative, not real tracked results */}
      <div className="bg-white/[0.04] border border-white/[0.1] rounded-2xl px-4 py-3 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
        <p className="text-xs text-neutral-400 leading-relaxed">
          <span className="text-neutral-200 font-semibold">Modo demostrativo:</span> el balance, ROI, Kelly, Sharpe y los diagnósticos post-mortem de esta vista son datos de ejemplo, no un registro real de apuestas o resultados. El botón "Ejecutar bucle bayesiano" tampoco recalibra el modelo real — es una simulación visual. El tracking real y verificado (5-0, datos genuinos) está en la pestaña de Métricas.
        </p>
      </div>

      {/* Header Banner: Continuous Learning Loop */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
              <Brain className="w-3.5 h-3.5" />
              BUCLE DE APRENDIZAJE ACTIVO & BALANCE VERIFICADO
            </div>
            <h2 className="text-base font-black tracking-tight font-mono text-neutral-100">
              Resultado Inmutable → Diagnóstico Post-Mortem → Gradiente Bayesiano → Bankroll Auditado
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-3xl leading-relaxed">
              Cada resultado final califica los 9 pilares con la función de pérdida Brier. Si ocurre una desviación imprevista, KAL recalibra los pesos con gradiente bayesiano (η = 0.015).
            </p>
          </div>

          <button
            onClick={handleTriggerLearningStep}
            disabled={isCalibrating}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-xs flex items-center gap-2 shadow-xs transition-all shrink-0"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isCalibrating ? 'animate-spin' : ''}`} />
            <span>{isCalibrating ? 'RECALIBRANDO PESOS...' : 'EJECUTAR BUCLE BAYESIANO'}</span>
          </button>
        </div>

        {calibrationSuccess && (
          <div className="mt-3 p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2 font-mono">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span><strong>Ajuste Bayesiano Aplicado:</strong> Pesos de Abridor (+0.015) y Bullpen sincronizados con la última jornada.</span>
          </div>
        )}
      </div>

      {/* 4 Financial & Statistical Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Units Profit Card */}
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Balance Neto (Flat)</span>
            <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400">
            +{BANKROLL_STATS_DATA.profit_units_flat} <span className="text-xs font-sans text-emerald-300 font-bold">unidades</span>
          </div>
          <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-0.5">
            <span>ROI Plano: <strong className="text-emerald-400">+{BANKROLL_STATS_DATA.roi_flat_pct}%</strong></span>
            <span>Kelly: <strong className="text-neutral-300">+{BANKROLL_STATS_DATA.profit_units_kelly}u</strong></span>
          </div>
        </div>

        {/* Win Rate & Record */}
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Efectividad Auditada</span>
            <div className="p-1 rounded-lg bg-white/[0.06] text-neutral-300 border border-white/[0.1]">
              <Award className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            {BANKROLL_STATS_DATA.win_rate}%
          </div>
          <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-0.5">
            <span>Récord: <strong className="text-white">{BANKROLL_STATS_DATA.won_bets}W - {BANKROLL_STATS_DATA.lost_bets}L</strong></span>
            <span>Total: <strong>{BANKROLL_STATS_DATA.total_games_graded} juegos</strong></span>
          </div>
        </div>

        {/* Sharpe Ratio & Profit Factor */}
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Ratio Sharpe / Factor</span>
            <div className="p-1 rounded-lg bg-white/[0.06] text-neutral-300 border border-white/[0.1]">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">
            {BANKROLL_STATS_DATA.sharpe_ratio} <span className="text-xs font-sans text-white font-semibold">(Óptimo)</span>
          </div>
          <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-0.5">
            <span>Profit Factor: <strong className="text-white">{BANKROLL_STATS_DATA.profit_factor}</strong></span>
            <span>Max DD: <strong className="text-amber-400">-{BANKROLL_STATS_DATA.max_drawdown_pct}%</strong></span>
          </div>
        </div>

        {/* Statistical Significance p-value */}
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Rigor Estadístico</span>
            <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400">
            p = {BANKROLL_STATS_DATA.p_value_significance}
          </div>
          <div className="text-[10px] text-emerald-300/90 flex items-center gap-1 pt-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Ventaja Real Comprobada (p &lt; 0.01)</span>
          </div>
        </div>

      </div>

      {/* Main Grid: Bankroll Polymarket Curve (7 Cols) + Post-Mortem Diagnostics (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start font-mono">
        
        {/* Left: Cumulative Bankroll Timeline Curve (7 Cols) */}
        <div className="lg:col-span-7 bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Ledger Acumulado (+34.8 Unidades)
              </h3>
              <p className="text-[10px] text-neutral-500">Curva de crecimiento con drawdown máximo -4.2%</p>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              +6.4% ROI
            </span>
          </div>

          {/* Polymarket-style Ledger Table */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-6 gap-2 text-center text-[9px] text-neutral-500 uppercase pb-1 border-b border-white/[0.04]">
              <span>Juego</span>
              <span>Fecha</span>
              <span>Partido</span>
              <span>Pick</span>
              <span>Res</span>
              <span>Acumulado</span>
            </div>

            <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1 text-xs">
              {BANKROLL_TIMELINE_DATA.map((pt) => {
                const isWin = pt.result === 'W';
                return (
                  <div
                    key={pt.game_num}
                    className="grid grid-cols-6 gap-2 items-center p-2 rounded-xl bg-neutral-950 border border-white/[0.04] hover:border-white/10 transition-all text-center text-[10px]"
                  >
                    <span className="text-neutral-500">#{pt.game_num}</span>
                    <span className="text-neutral-400">{pt.date.slice(5)}</span>
                    <span className="text-neutral-200 font-bold truncate">{pt.matchup}</span>
                    <span className="text-neutral-300 truncate">{pt.pick}</span>
                    <span className={`font-bold px-1.5 py-0.2 rounded text-[9px] ${
                      isWin ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {pt.result}
                    </span>
                    <span className={`font-bold ${
                      pt.cumulative_units >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      +{pt.cumulative_units}u
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Post-Mortem Diagnostics & Bayesian Learning (5 Cols) */}
        <div className="lg:col-span-5 bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Diagnóstico Post-Mortem</h3>
            </div>
            <span className="text-[9px] text-neutral-500">Aprendizaje Activo</span>
          </div>

          {/* Diagnostic Selector Tabs */}
          <div className="flex gap-1 bg-neutral-950 p-1 rounded-xl border border-white/[0.06]">
            {POST_MORTEM_SAMPLES.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedDiagnosticIdx(idx)}
                className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                  selectedDiagnosticIdx === idx
                    ? 'bg-neutral-800 text-white border border-white/10 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {sample.is_hit ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-rose-400" />}
                <span>Caso {idx + 1}</span>
              </button>
            ))}
          </div>

          {/* Active Post-Mortem Details */}
          <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-[11px]">Marcador: {activePostMortem.away_score} - {activePostMortem.home_score}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                  activePostMortem.is_hit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {activePostMortem.is_hit ? 'ACIERTO (+0.85u)' : 'FALLO (-1.00u)'}
                </span>
              </div>
              <span className="text-[9px] text-neutral-500">Brier: {activePostMortem.brier_loss}</span>
            </div>

            <div className="text-xs text-neutral-300 font-sans">
              <span className="text-[9px] font-mono font-bold uppercase text-neutral-500 block mb-0.5">Causa Raíz Identificada</span>
              <div className="font-bold text-white font-mono text-[11px]">{activePostMortem.primary_driver}</div>
              <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                {activePostMortem.diagnostic_summary}
              </p>
            </div>

            {/* Bayesian Weight Recalibration Step */}
            <div className="pt-2 border-t border-white/[0.06] space-y-1 font-mono">
              <span className="text-[9px] font-bold uppercase text-emerald-400 block">
                Ajuste Dinámico de Pesos (Gradiente Bayesiano)
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[9px]">
                {Object.entries(activePostMortem.bayesian_weight_shift).map(([pillar, shift]) => (
                  <div key={pillar} className="p-1 bg-neutral-900 rounded border border-white/[0.04]">
                    <div className="text-neutral-500 uppercase text-[8px]">{pillar}</div>
                    <div className={`font-bold ${shift && shift > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {shift && shift > 0 ? `+${shift}` : shift}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};

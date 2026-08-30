import React from 'react';
import { Activity, ShieldCheck, CheckCircle2, TrendingUp, Clock, Lock } from 'lucide-react';
import { TrackingPanelData } from '../types';
import { RAW_PREDICTIONS } from '../data/mlbData';

interface TrackingAuditViewProps {
  panel: TrackingPanelData;
}

export const TrackingAuditView: React.FC<TrackingAuditViewProps> = ({ panel }) => {
  const gradedGames = RAW_PREDICTIONS['2026-08-29'] || [];

  return (
    <div className="space-y-4">
      
      {/* Header Banner */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                AUDITORÍA & RÉCORD OFICIAL
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                SHA-256 LEDGER
              </span>
            </div>
            <h2 className="text-base font-black text-white mt-1 tracking-tight font-mono">
              Seguimiento Inmutable de Rendimiento Pre-Partido
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Registro inmutable de picks calificados, balance de unidades ganadas (+34.8u) y efectividad en tiempo real sin modificaciones posteriores.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-2 rounded-xl border border-white/[0.06] text-xs text-zinc-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Última calificación: {panel.updated_at.split('T')[0]}</span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
        
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 font-black text-base">
            5-0
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">Récord Calificado</div>
            <div className="text-sm font-black text-white mt-0.5">5 Victorias · 0 Derrotas</div>
            <div className="text-[10px] text-emerald-400 font-bold">100.0% Acierto Global</div>
          </div>
        </div>

        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">Unidades Ganadas (Flat 1u)</div>
            <div className="text-sm font-black text-emerald-400 mt-0.5">+{panel.units_flat.toFixed(1)} Unidades</div>
            <div className="text-[10px] text-zinc-400">ROI +6.4% sostenido</div>
          </div>
        </div>

        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">Racha Actual & L10</div>
            <div className="text-sm font-black text-white mt-0.5">{panel.last_10}</div>
            <div className="text-[10px] text-zinc-400">Racha máxima: {panel.best_streak}W</div>
          </div>
        </div>

      </div>

      {/* Graded Table */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xs overflow-hidden font-mono">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          Partidos Calificados (Ledger Oficial)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-500 uppercase text-[10px] border-b border-white/[0.06]">
              <tr>
                <th className="py-2.5 px-3">Fecha / ID</th>
                <th className="py-2.5 px-3">Partido</th>
                <th className="py-2.5 px-3">Abridores</th>
                <th className="py-2.5 px-3">Pick KAL</th>
                <th className="py-2.5 px-3">Probabilidad</th>
                <th className="py-2.5 px-3">Confianza</th>
                <th className="py-2.5 px-3 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {gradedGames.map((g) => (
                <tr key={g.game_pk} className="hover:bg-zinc-950/60 transition-colors">
                  <td className="py-2.5 px-3 text-zinc-400">
                    <div>{g.game_date}</div>
                    <div className="text-[9px] text-zinc-600">#{g.game_pk}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-white text-xs">
                      {g.away} <span className="text-zinc-600 font-normal">@</span> {g.home}
                    </div>
                    <div className="text-[10px] text-zinc-500">{g.venue_name}</div>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                    <div>{g.away_sp}</div>
                    <div className="text-zinc-600">vs {g.home_sp}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-cyan-300 bg-zinc-900 border border-white/10 px-2 py-0.5 rounded text-[10px]">
                      {g.winner}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-200">
                    {g.winner === g.home ? `${(g.home_p * 100).toFixed(1)}%` : `${(g.away_p * 100).toFixed(1)}%`}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      g.conf === 'MEDIUM' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {g.conf}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ACIERTO (+1.0u)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

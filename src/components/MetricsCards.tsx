import React from 'react';
import { TrackingPanelData, ChampionModel } from '../types';

interface MetricsCardsProps {
  panel: TrackingPanelData;
  champion: ChampionModel;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ panel, champion }) => {
  const hits = panel.hits ?? 0;
  const misses = panel.misses ?? 0;
  const graded = panel.n_graded ?? hits + misses;
  const acc = panel.accuracy != null ? panel.accuracy : graded > 0 ? hits / graded : 0;
  const record =
    panel.record && panel.record !== '0-0'
      ? panel.record.replace('-', ' - ')
      : `${hits} - ${misses}`;
  const units = panel.units_flat ?? 0;
  const highAcc = panel.by_confidence?.HIGH?.acc;
  const strongPct =
    highAcc != null
      ? (highAcc * 100).toFixed(0)
      : champion?.metrics?.acc_conf_65plus != null
        ? (champion.metrics.acc_conf_65plus * 100).toFixed(0)
        : '—';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Récord Verificado</span>
        <div className="mt-2">
          <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {record}
          </div>
          <span
            className={`text-xs font-medium mt-0.5 block ${
              acc >= 0.55 ? 'text-emerald-400' : 'text-neutral-400'
            }`}
          >
            {graded > 0 ? `${(acc * 100).toFixed(1)}% efectividad · ${graded} graded` : 'Sin graded aún'}
          </span>
        </div>
      </div>

      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Ganancia Acumulada</span>
        <div className="mt-2">
          <div
            className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
              units >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {units >= 0 ? '+' : ''}
            {units.toFixed(1)}u
          </div>
          <span className="text-xs text-neutral-400 mt-0.5 block">
            {panel.n_pending != null ? `${panel.n_pending} pendientes` : 'flat 1u'}
          </span>
        </div>
      </div>

      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Picks Fuertes (&gt;65%)</span>
        <div className="mt-2">
          <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {strongPct}%
          </div>
          <span className="text-xs text-neutral-400 mt-0.5 block">
            {panel.by_confidence?.HIGH
              ? `HIGH ${panel.by_confidence.HIGH.hits}/${panel.by_confidence.HIGH.n}`
              : 'Acierto histórico'}
          </span>
        </div>
      </div>

      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Modelo Activo</span>
        <div className="mt-2">
          <div className="text-xl sm:text-2xl font-semibold tracking-tight text-white truncate">
            LightGBM
          </div>
          <span className="text-xs text-neutral-400 mt-0.5 block">
            Panel en vivo · {graded} calificados
          </span>
        </div>
      </div>

      <p className="col-span-full text-[10px] text-neutral-600 mt-1 sm:col-span-4">
        Récord = partidos graded del API (Railway). Parlays en la pestaña Parlay 4.
      </p>
    </div>
  );
};

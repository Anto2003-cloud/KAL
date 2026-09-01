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

  const high = panel.by_confidence?.HIGH || (panel as any).high_only;
  const med = panel.by_confidence?.MEDIUM || (panel as any).medium_only;
  const low = panel.by_confidence?.LOW || (panel as any).low_only;

  const highLabel =
    high && high.n
      ? `${high.hits}-${high.n - high.hits} (${((high.acc || 0) * 100).toFixed(0)}%)`
      : 'Sin HIGH aún';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-neutral-400">Overall (todos)</span>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{record}</div>
            <span className={`text-xs font-medium mt-0.5 block ${acc >= 0.55 ? 'text-emerald-400' : 'text-neutral-400'}`}>
              {graded > 0 ? `${(acc * 100).toFixed(1)}% · ${graded} graded` : 'Sin graded'}
            </span>
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-neutral-400">Solo HIGH</span>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-semibold tracking-tight text-white">{highLabel}</div>
            <span className="text-xs text-neutral-500 mt-0.5 block">
              MED {med?.n ? `${med.hits}/${med.n}` : '—'} · LOW {low?.n ? `${low.hits}/${low.n}` : '—'}
            </span>
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-neutral-400">Unidades (flat 1u)</span>
          <div className="mt-2">
            <div className={`text-2xl sm:text-3xl font-semibold tracking-tight ${units >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {units >= 0 ? '+' : ''}
              {units.toFixed(1)}u
            </div>
            <span className="text-xs text-neutral-500 mt-0.5 block">
              {panel.n_pending != null ? `${panel.n_pending} pendientes` : 'simulación'}
            </span>
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-neutral-400">Modelo</span>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-semibold tracking-tight text-white truncate">LightGBM</div>
            <span className="text-xs text-neutral-500 mt-0.5 block">
              Panel vivo · {graded} calificados
            </span>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-neutral-600">
        Overall ≠ solo HIGH. Parlay 4 se mide aparte en su pestaña.
        {panel.updated_at ? ` · Actualizado ${String(panel.updated_at).slice(0, 19)}` : ''}
      </p>
    </div>
  );
};

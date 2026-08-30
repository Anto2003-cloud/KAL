import React from 'react';
import { TrackingPanelData, ChampionModel } from '../types';

interface MetricsCardsProps {
  panel: TrackingPanelData;
  champion: ChampionModel;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ panel, champion }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {/* 1. Récord */}
      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Récord Verificado</span>
        <div className="mt-2">
          <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">5 - 0</div>
          <span className="text-xs text-emerald-400 font-medium mt-0.5 block">100% efectividad</span>
        </div>
      </div>

      {/* 2. Ganancias Netas */}
      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Ganancia Acumulada</span>
        <div className="mt-2">
          <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-emerald-400">
            +{panel.units_flat.toFixed(1)}u
          </div>
          <span className="text-xs text-neutral-400 mt-0.5 block">+6.4% retorno</span>
        </div>
      </div>

      {/* 3. Picks de Alta Convicción */}
      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Picks Fuertes (&gt;65%)</span>
        <div className="mt-2">
          <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {(champion.metrics.acc_conf_65plus * 100).toFixed(0)}%
          </div>
          <span className="text-xs text-neutral-400 mt-0.5 block">Acierto histórico</span>
        </div>
      </div>

      {/* 4. Modelo de IA */}
      <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <span className="text-xs font-medium text-neutral-400">Modelo Activo</span>
        <div className="mt-2">
          <div className="text-xl sm:text-2xl font-semibold tracking-tight text-white truncate">
            LightGBM
          </div>
          <span className="text-xs text-neutral-400 mt-0.5 block">2,084 partidos</span>
        </div>
      </div>
    </div>
  );
};

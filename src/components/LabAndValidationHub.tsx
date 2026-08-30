import React, { useState } from 'react';
import {
  Trophy,
  Cpu,
  BarChart3,
  Layers,
  Sliders,
  Sparkles,
  Info
} from 'lucide-react';
import { ChampionModel } from '../types';
import { ChampionPanel } from './ChampionPanel';
import { ModelTrainerLab } from './ModelTrainerLab';
import { FeatureImportanceView } from './FeatureImportanceView';
import { DatasetSplitsView } from './DatasetSplitsView';

interface LabAndValidationHubProps {
  champion: ChampionModel;
}

export const LabAndValidationHub: React.FC<LabAndValidationHubProps> = ({ champion }) => {
  const [activeSubTab, setActiveSubTab] = useState<'champion' | 'trainer' | 'features' | 'splits'>('champion');

  return (
    <div className="space-y-4 font-mono">
      
      {/* Subnavigation Bar */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-white/[0.06] text-xs">
          
          <button
            onClick={() => setActiveSubTab('champion')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'champion'
                ? 'bg-zinc-800 text-yellow-300 shadow-xs border border-yellow-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <span>1. Modelo Campeón</span>
          </button>

          <button
            onClick={() => setActiveSubTab('trainer')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'trainer'
                ? 'bg-zinc-800 text-cyan-300 shadow-xs border border-cyan-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>2. Entrenar y Comparar</span>
          </button>

          <button
            onClick={() => setActiveSubTab('features')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'features'
                ? 'bg-zinc-800 text-purple-300 shadow-xs border border-purple-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
            <span>3. 24 Variables Explicadas</span>
          </button>

          <button
            onClick={() => setActiveSubTab('splits')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'splits'
                ? 'bg-zinc-800 text-blue-300 shadow-xs border border-blue-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>4. Validación 2024-2026</span>
          </button>

        </div>

        <div className="text-[11px] text-zinc-400 px-3 py-1 bg-zinc-950 rounded-xl border border-white/[0.06] flex items-center gap-2 self-start md:self-center font-sans">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Área científica para evaluar el algoritmo y sus métricas.</span>
        </div>
      </div>

      {/* Render Selected View */}
      {activeSubTab === 'champion' && <ChampionPanel champion={champion} />}
      {activeSubTab === 'trainer' && <ModelTrainerLab />}
      {activeSubTab === 'features' && <FeatureImportanceView />}
      {activeSubTab === 'splits' && <DatasetSplitsView />}

    </div>
  );
};

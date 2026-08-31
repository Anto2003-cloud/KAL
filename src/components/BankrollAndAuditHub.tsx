import React, { useState } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Brain,
  History,
  Activity
} from 'lucide-react';
import { TrackingPanelData } from '../types';
import { ActiveLearningView } from './ActiveLearningView';
import { TrackingAuditView } from './TrackingAuditView';
import { TabIntro } from './TabIntro';

interface BankrollAndAuditHubProps {
  panel: TrackingPanelData;
}

export const BankrollAndAuditHub: React.FC<BankrollAndAuditHubProps> = ({ panel }) => {
  const [subTab, setSubTab] = useState<'balance' | 'ledger'>('balance');

  return (
    <div className="space-y-4 font-mono">
      <TabIntro
        title="Historial — ¿qué es esto?"
        bullets={[
          "Aquí se guardan los partidos que ya terminaron y si KAL acertó o falló (HIT / MISS).",
          "El 'ledger' es el registro: predicción bloqueada antes del juego + resultado real.",
          "Balance de unidades: simulación de +1u por acierto a cuota justa (no es dinero de una casa real).",
          "Mientras el sistema no esté en vivo, el récord puede ser una muestra de prueba (ej. 5-0), no tu temporada completa.",
        ]}
        warning="Si ves 5-0 y +34.8u: es demo/muestra pequeña. No significa que el modelo vaya 100% en vivo."
      />

      {/* Subnavigation Bar */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-neutral-950 rounded-xl border border-white/[0.06] text-xs">
          <button
            onClick={() => setSubTab('balance')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              subTab === 'balance'
                ? 'bg-neutral-800 text-emerald-300 shadow-xs border border-emerald-500/30'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>1. Balance (simulado)</span>
          </button>

          <button
            onClick={() => setSubTab('ledger')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              subTab === 'ledger'
                ? 'bg-neutral-800 text-white shadow-xs border border-white/[0.14]'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-300" />
            <span>2. Partidos Calificados (Ledger SHA-256)</span>
          </button>
        </div>

        <div className="text-[11px] text-neutral-400 px-3 py-1 bg-neutral-950 rounded-xl border border-white/[0.06] flex items-center gap-2 self-start sm:self-center">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Récord panel: <strong>{panel.record}</strong> · {panel.n_graded} graded · muestra</span>
        </div>
      </div>

      {/* Render Subtab Content */}
      {subTab === 'balance' && <ActiveLearningView />}
      {subTab === 'ledger' && <TrackingAuditView panel={panel} />}

    </div>
  );
};

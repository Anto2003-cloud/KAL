import React, { useState } from 'react';
import { TrackingPanelData } from '../types';
import { TrackingAuditView } from './TrackingAuditView';
import { TabIntro } from './TabIntro';

interface BankrollAndAuditHubProps {
  panel: TrackingPanelData;
}

export const BankrollAndAuditHub: React.FC<BankrollAndAuditHubProps> = ({ panel }) => {
  const [tab, setTab] = useState<'ledger' | 'about'>('ledger');

  return (
    <div className="space-y-6">
      <TabIntro
        title="Historial"
        subtitle="Partidos que KAL ya predijo y se calificaron con el resultado real. Es el feedback con el que el modelo mide si acierta."
        bullets={[
          `Récord ${panel.record || '—'}`,
          `${panel.n_graded ?? 0} graded`,
          `${panel.n_pending ?? 0} pendientes`,
        ]}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => setTab('ledger')}
          className={`px-3 py-1.5 rounded-full text-xs ${
            tab === 'ledger'
              ? 'bg-white text-black font-semibold'
              : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
          }`}
        >
          Ledger (HIT / MISS)
        </button>
        <button
          type="button"
          onClick={() => setTab('about')}
          className={`px-3 py-1.5 rounded-full text-xs ${
            tab === 'about'
              ? 'bg-white text-black font-semibold'
              : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
          }`}
        >
          ¿Para qué sirve?
        </button>
      </div>

      {tab === 'ledger' && <TrackingAuditView panel={panel} />}

      {tab === 'about' && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-5 space-y-3 text-xs text-neutral-400 leading-relaxed max-w-2xl">
          <p>
            Cada predicción se <strong className="text-neutral-200">bloquea antes del partido</strong>. Cuando hay
            marcador, el API marca HIT o MISS. Eso alimenta el récord y, más adelante, el retrain.
          </p>
          <p>
            Las <strong className="text-neutral-200">unidades</strong> son simulación flat (±1u), no el dinero de tu
            Parlay Lab. Tu bankroll real de parlays está en la pestaña Parlay 4.
          </p>
          <p className="text-neutral-600">
            Si el récord parece “bajo” (ej. solo 19 graded), es porque aún hay poca muestra en el volume — no porque
            la web esté rota.
          </p>
        </div>
      )}
    </div>
  );
};

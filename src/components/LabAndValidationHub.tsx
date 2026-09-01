import React, { useState } from 'react';
import { ChampionModel } from '../types';
import { ChampionPanel } from './ChampionPanel';
import { FeatureImportanceView } from './FeatureImportanceView';
import { LearningStatusPanel } from './LearningStatusPanel';
import { TabIntro } from './TabIntro';

interface LabAndValidationHubProps {
  champion: ChampionModel;
}

type Sub = 'learn' | 'champion' | 'features';

export const LabAndValidationHub: React.FC<LabAndValidationHubProps> = ({ champion }) => {
  const [tab, setTab] = useState<Sub>('learn');

  const tabs: { id: Sub; label: string }[] = [
    { id: 'learn', label: 'Cómo aprende' },
    { id: 'champion', label: 'Modelo activo' },
    { id: 'features', label: 'Qué variables usa' },
  ];

  return (
    <div className="space-y-6">
      <TabIntro
        title="Laboratorio"
        subtitle="Aquí no se apuesta. Ves si el modelo puede mejorar, qué versión está activa y qué señales mira. El dinero se gestiona en Pronósticos y Parlay 4."
        bullets={['Graded → feedback', 'Retrain solo si gana al campeón', 'Umbrales HIGH reales']}
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
              tab === t.id
                ? 'bg-white text-black font-semibold'
                : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'learn' && (
        <div className="space-y-4">
          <LearningStatusPanel />
          <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Ciclo de mejora</h3>
            <ol className="space-y-3 text-xs text-neutral-400">
              <li className="flex gap-3">
                <span className="text-neutral-600 font-mono w-5">1</span>
                <span>
                  <strong className="text-neutral-200">Predice</strong> el día (API Railway) y guarda el slip
                  inmutable.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-neutral-600 font-mono w-5">2</span>
                <span>
                  <strong className="text-neutral-200">Califica</strong> con el marcador real → HIT / MISS en
                  Historial.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-neutral-600 font-mono w-5">3</span>
                <span>
                  Ajusta <strong className="text-neutral-200">umbrales HIGH/MEDIUM</strong> según acierto real.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-neutral-600 font-mono w-5">4</span>
                <span>
                  Con suficientes graded, intenta <strong className="text-neutral-200">retrain</strong>; solo
                  promociona si el candidato es mejor que el campeón.
                </span>
              </li>
            </ol>
            <p className="text-[11px] text-neutral-600 border-t border-white/[0.04] pt-3">
              Mientras graded &lt; 50, el aprendizaje es sobre todo calibración y acumular historial — no un modelo
              nuevo cada noche.
            </p>
          </div>
        </div>
      )}

      {tab === 'champion' && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4 overflow-hidden">
          <ChampionPanel champion={champion} />
        </div>
      )}

      {tab === 'features' && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4 overflow-hidden">
          <FeatureImportanceView />
        </div>
      )}
    </div>
  );
};

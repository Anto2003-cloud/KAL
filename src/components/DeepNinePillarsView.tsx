import React, { useMemo, useState } from 'react';
import { SAMPLE_NINE_PILLARS_GAMES } from '../data/ninePillarsData';
import { PillarCategory } from '../types';
import { TabIntro } from './TabIntro';

const PILLAR_ORDER: PillarCategory[] = [
  'pitcher',
  'batters',
  'bullpen',
  'injuries',
  'lineup',
  'statcast',
  'matchup',
  'park',
  'weather',
];

const PILLAR_WHY: Record<string, string> = {
  pitcher: 'Calidad del abridor (ERA, FIP, K)',
  batters: 'Forma ofensiva reciente',
  bullpen: 'Relevo y fatiga',
  injuries: 'Bajas en IL',
  lineup: 'Orden de bateo',
  statcast: 'Contacto de calidad (EV, barrel)',
  matchup: 'Mano vs pitcheo',
  park: 'Estadio',
  weather: 'Clima',
};

export const DeepNinePillarsView: React.FC = () => {
  const games = useMemo(() => Object.entries(SAMPLE_NINE_PILLARS_GAMES), []);
  const [selectedPk, setSelectedPk] = useState(games[0]?.[0] || '');
  const selected = SAMPLE_NINE_PILLARS_GAMES[Number(selectedPk)] || games[0]?.[1];

  if (!selected) {
    return (
      <div className="text-sm text-neutral-500 p-8 text-center">
        Sin datos de pilares de ejemplo. Los % reales salen de Pronósticos (API).
      </div>
    );
  }

  const pillars = PILLAR_ORDER.map((k) => selected.pillars[k]).filter(Boolean);

  return (
    <div className="space-y-6">
      <TabIntro
        title="Cómo decide KAL (9 factores)"
        subtitle="Cada partido se descompone en factores. No es una apuesta aparte: explica el % que ves en Pronósticos. Ejemplo ilustrativo; el modelo vivo usa features similares en Railway."
        bullets={[
          'Abridor ~28%',
          'Ofensiva ~18%',
          'Bullpen ~16%',
          'Statcast ~14%',
          'Resto: matchup, park, IL, lineup, clima',
        ]}
      />

      {/* Game picker — minimal chips */}
      <div className="flex flex-wrap gap-2">
        {games.map(([pk, g]) => (
          <button
            key={pk}
            type="button"
            onClick={() => setSelectedPk(pk)}
            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
              String(selectedPk) === String(pk)
                ? 'bg-white text-black font-semibold'
                : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {g.matchup}
          </button>
        ))}
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-neutral-500">{selected.date}</div>
          <div className="text-lg font-semibold text-white mt-0.5">{selected.matchup}</div>
          <div className="text-xs text-neutral-400 mt-1">
            Pick ejemplo: <span className="text-white font-medium">{selected.winner}</span> ·{' '}
            {selected.prob}% · {selected.conf}
          </div>
        </div>
        <div className="text-[11px] text-neutral-500 max-w-xs leading-relaxed">
          Los bordes verdes/rojos indican qué lado empuja cada factor (local vs visitante).
        </div>
      </div>

      {/* Pillars grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {pillars.map((pillar) => {
          const favorsHome = pillar.favors === 'HOME';
          const favorsAway = pillar.favors === 'AWAY';
          return (
            <div
              key={pillar.category}
              className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4 space-y-3 hover:border-white/[0.1] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-white">{pillar.name}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {PILLAR_WHY[pillar.category] || ''} · peso {pillar.weight_pct}%
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                    favorsHome
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : favorsAway
                        ? 'bg-sky-500/10 text-sky-400'
                        : 'bg-white/[0.04] text-neutral-500'
                  }`}
                >
                  {favorsHome ? 'Local' : favorsAway ? 'Visita' : 'Neutro'}
                </span>
              </div>
              <div className="space-y-1.5 text-[11px] text-neutral-400">
                <div>
                  <span className="text-neutral-600">Casa · </span>
                  {pillar.home_metric_display}
                </div>
                <div>
                  <span className="text-neutral-600">Visita · </span>
                  {pillar.away_metric_display}
                </div>
              </div>
              {pillar.insight && (
                <p className="text-[11px] text-neutral-500 leading-relaxed border-t border-white/[0.04] pt-2">
                  {pillar.insight}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-neutral-600 text-center">
        Para aprender de aciertos reales usa Historial (graded) y Laboratorio (retrain). Esta vista es el mapa de
        factores.
      </p>
    </div>
  );
};

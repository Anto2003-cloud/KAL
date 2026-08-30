import React from 'react';
import { X } from 'lucide-react';
import { GamePrediction } from '../types';
import { TEAMS_META } from '../data/mlbData';
import { TeamLogo } from './TeamLogo';

interface GameDetailModalProps {
  prediction: GamePrediction | null;
  onClose: () => void;
}

export const GameDetailModal: React.FC<GameDetailModalProps> = ({ prediction, onClose }) => {
  if (!prediction) return null;

  const p = prediction;
  const homeMeta = TEAMS_META[p.home] || { name: p.home, city: p.home, primaryColor: '#000000' };
  const awayMeta = TEAMS_META[p.away] || { name: p.away, city: p.away, primaryColor: '#000000' };
  const isHomeWinner = p.winner === p.home;
  const winnerProb = isHomeWinner ? p.home_p : p.away_p;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#18181b] border border-white/[0.1] rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col text-neutral-100 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#18181b]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <TeamLogo abbr={p.away} size="sm" />
            <span className="text-sm font-medium text-neutral-400">@</span>
            <TeamLogo abbr={p.home} size="sm" />
            <h2 className="text-lg font-semibold text-white tracking-tight ml-1">
              {awayMeta.name} vs {homeMeta.name}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main Outcome Card */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TeamLogo abbr={p.winner} size="lg" />
              <div>
                <span className="text-xs text-neutral-400 block">Proyección del Modelo</span>
                <div className="text-lg font-semibold text-white mt-0.5">
                  {isHomeWinner ? homeMeta.name : awayMeta.name}
                </div>
                <span className="text-xs text-neutral-400 mt-0.5 block">
                  {(winnerProb * 100).toFixed(1)}% probabilidad estimada
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-neutral-400 block">Alineación</span>
              <span className="text-xs font-medium text-emerald-400 mt-1 block">
                {p.lineup_confirmed ? 'Confirmada' : 'Proyectada'}
              </span>
            </div>
          </div>

          {/* Key factors */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Factores Clave
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                <span className="text-neutral-400 block text-[11px]">Abridores (28% peso)</span>
                <span className="text-white font-medium mt-1 block">{p.home_sp} vs {p.away_sp}</span>
              </div>

              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                <span className="text-neutral-400 block text-[11px]">Bullpen (16% peso)</span>
                <span className="text-white font-medium mt-1 block">Relevistas disponibles</span>
              </div>

              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                <span className="text-neutral-400 block text-[11px]">Statcast (14% peso)</span>
                <span className="text-white font-medium mt-1 block">Calidad de contacto y velocidad</span>
              </div>

              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                <span className="text-neutral-400 block text-[11px]">Estadio y Clima (5% peso)</span>
                <span className="text-white font-medium mt-1 block">{p.venue_name}</span>
              </div>
            </div>
          </div>

          {/* Plain explanation */}
          <div className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl text-xs text-neutral-400 leading-relaxed">
            El modelo proyecta una ventaja para <strong className="text-white">{isHomeWinner ? homeMeta.name : awayMeta.name}</strong> basada principalmente en el rendimiento del abridor en sus últimas aperturas y la profundidad del bullpen.
          </div>
        </div>
      </div>
    </div>
  );
};

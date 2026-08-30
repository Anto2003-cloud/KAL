import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { QuickStartGuide } from './components/QuickStartGuide';
import { PredictionCard } from './components/PredictionCard';
import { GameDetailModal } from './components/GameDetailModal';
import { DeepNinePillarsView } from './components/DeepNinePillarsView';
import { BankrollAndAuditHub } from './components/BankrollAndAuditHub';
import { LabAndValidationHub } from './components/LabAndValidationHub';
import {
  RAW_PREDICTIONS,
  TRACKING_PANEL,
  CHAMPION_MODEL,
  INTEL_SUMMARY,
  TEAMS_META,
} from './data/mlbData';
import { GamePrediction } from './types';
import { Search } from 'lucide-react';

export default function App() {
  const [activeDate, setActiveDate] = useState<string>('2026-08-30');
  const [activeTab, setActiveTab] = useState<'preds' | 'pillars' | 'history' | 'lab'>('preds');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('ALL');
  const [selectedPrediction, setSelectedPrediction] = useState<GamePrediction | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [pipelineToast, setPipelineToast] = useState<string | null>(null);

  const availableDates = Object.keys(RAW_PREDICTIONS).sort().reverse();
  const currentPredictions = RAW_PREDICTIONS[activeDate] || [];

  // Filtered predictions
  const filteredPredictions = useMemo(() => {
    return currentPredictions.filter((game) => {
      if (selectedConfidence !== 'ALL' && game.conf !== selectedConfidence) {
        return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const homeMeta = TEAMS_META[game.home];
        const awayMeta = TEAMS_META[game.away];

        const matchHome =
          game.home.toLowerCase().includes(term) ||
          (homeMeta && homeMeta.name.toLowerCase().includes(term)) ||
          (homeMeta && homeMeta.city.toLowerCase().includes(term));

        const matchAway =
          game.away.toLowerCase().includes(term) ||
          (awayMeta && awayMeta.name.toLowerCase().includes(term)) ||
          (awayMeta && awayMeta.city.toLowerCase().includes(term));

        const matchPitcher =
          game.home_sp.toLowerCase().includes(term) ||
          game.away_sp.toLowerCase().includes(term);

        if (!matchHome && !matchAway && !matchPitcher) {
          return false;
        }
      }

      return true;
    });
  }, [currentPredictions, selectedConfidence, searchTerm]);

  const handleRunPipeline = () => {
    setIsRunningPipeline(true);
    setTimeout(() => {
      setIsRunningPipeline(false);
      setPipelineToast('Datos y pronósticos actualizados');
      setTimeout(() => setPipelineToast(null), 3000);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-neutral-100 flex flex-col font-sans selection:bg-white selection:text-black">
      {/* Header */}
      <Header
        activeDate={activeDate}
        availableDates={availableDates}
        onDateChange={setActiveDate}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        intel={INTEL_SUMMARY}
        onRunPipeline={handleRunPipeline}
        isRunningPipeline={isRunningPipeline}
      />

      {/* Main Content */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 space-y-6">
        {/* Toast notification */}
        {pipelineToast && (
          <div className="p-3 bg-white text-black font-medium text-xs rounded-xl flex items-center justify-between shadow-lg">
            <span>{pipelineToast}</span>
            <button onClick={() => setPipelineToast(null)} className="text-neutral-500 hover:text-black font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Global Key Metrics */}
        <MetricsCards panel={TRACKING_PANEL} champion={CHAMPION_MODEL} />

        {/* Quick info bar */}
        <QuickStartGuide />

        {/* PRONÓSTICOS TAB */}
        {activeTab === 'preds' && (
          <div className="space-y-4">
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { id: 'ALL', label: 'Todos los partidos' },
                  { id: 'HIGH', label: 'Alta probabilidad (65%+)' },
                  { id: 'MEDIUM', label: 'Moderada' },
                ].map((conf) => (
                  <button
                    key={conf.id}
                    onClick={() => setSelectedConfidence(conf.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      selectedConfidence === conf.id
                        ? 'bg-white text-black font-semibold'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.06]'
                    }`}
                  >
                    {conf.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Buscar equipo o pitcher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-60 bg-white/[0.04] border border-white/[0.06] rounded-full pl-8 pr-4 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>

            {/* Grid of Predictions */}
            {filteredPredictions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPredictions.map((pred) => (
                  <PredictionCard
                    key={pred.game_pk}
                    prediction={pred}
                    onSelect={setSelectedPrediction}
                  />
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-[#18181b] border border-white/[0.06] rounded-2xl">
                <p className="text-sm font-medium text-neutral-300">No hay partidos con los filtros actuales</p>
                <p className="text-xs text-neutral-500 mt-1">Prueba seleccionando &quot;Todos los partidos&quot;.</p>
              </div>
            )}
          </div>
        )}

        {/* FACTORES TAB */}
        {activeTab === 'pillars' && <DeepNinePillarsView />}

        {/* HISTORIAL TAB */}
        {activeTab === 'history' && <BankrollAndAuditHub panel={TRACKING_PANEL} />}

        {/* LAB TAB */}
        {activeTab === 'lab' && <LabAndValidationHub champion={CHAMPION_MODEL} />}
      </main>

      {/* Detail Modal */}
      <GameDetailModal
        prediction={selectedPrediction}
        onClose={() => setSelectedPrediction(null)}
      />

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 text-xs text-neutral-500 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-300">KAL Predictor</span>
            <span>·</span>
            <span>Modelado y Análisis MLB</span>
          </div>
          <span className="text-[11px] text-neutral-600">Registro pre-partido verificado</span>
        </div>
      </footer>
    </div>
  );
}

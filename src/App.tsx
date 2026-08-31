import React, { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { QuickStartGuide } from './components/QuickStartGuide';
import { PredictionCard } from './components/PredictionCard';
import { GameDetailModal } from './components/GameDetailModal';
import { DeepNinePillarsView } from './components/DeepNinePillarsView';
import { BankrollAndAuditHub } from './components/BankrollAndAuditHub';
import { LabAndValidationHub } from './components/LabAndValidationHub';
import { ParlayLab } from './components/ParlayLab';
import type { KalParlaySlip } from './utils/parlayEngine';
import { fetchLivePreds, fetchLivePanel, fetchLiveStatus, isLiveConfigured } from './data/liveApi';
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
  const [activeDate, setActiveDate] = useState<string>('2026-08-31');
  const [activeTab, setActiveTab] = useState<'preds' | 'pillars' | 'history' | 'lab' | 'parlay'>('preds');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('HIGH');
  const [selectedPrediction, setSelectedPrediction] = useState<GamePrediction | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [pipelineToast, setPipelineToast] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [liveNote, setLiveNote] = useState<string>('Comprobando API…');
  const [livePreds, setLivePreds] = useState<GamePrediction[] | null>(null);
  const [livePanel, setLivePanel] = useState<typeof TRACKING_PANEL | null>(null);

  // Cargar cerebro vivo si VITE_KAL_API_URL está definida
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isLiveConfigured()) {
        setLiveMode(false);
        setLiveNote('Sin VITE_KAL_API_URL — datos embebidos (no autónomo aún)');
        return;
      }
      const st = await fetchLiveStatus();
      if (cancelled) return;
      if (!st.ok) {
        setLiveMode(false);
        setLiveNote(`API no reachable: ${st.error || 'error'} — fallback embebido`);
        return;
      }
      setLiveMode(true);
      setLiveNote('Conectado al cerebro vivo (API)');
      const [preds, panel] = await Promise.all([
        fetchLivePreds(activeDate),
        fetchLivePanel(),
      ]);
      if (cancelled) return;
      if (preds && preds.length) {
        // map loose API rows → GamePrediction shape best-effort
        setLivePreds(preds as GamePrediction[]);
      }
      if (panel) setLivePanel(panel as any);
    })();
    return () => { cancelled = true; };
  }, [activeDate]);

    const [parlayHistory, setParlayHistory] = useState<KalParlaySlip[]>(() => {
    try {
      const raw = localStorage.getItem('kal_parlay_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const lockParlaySlip = (slip: KalParlaySlip) => {
    setParlayHistory((prev) => {
      const next = [...prev.filter((s) => s.id !== slip.id), slip];
      try {
        localStorage.setItem('kal_parlay_history', JSON.stringify(next));
      } catch {}
      return next;
    });
    setPipelineToast('Parlay de 4 bloqueado (inmutable)');
    setTimeout(() => setPipelineToast(null), 3000);
  };

  const availableDates = Array.from(
    new Set([
      ...(livePreds?.length ? [activeDate] : []),
      ...Object.keys(RAW_PREDICTIONS),
      '2026-08-31',
      '2026-08-30',
    ])
  ).sort().reverse();
  const currentPredictions = (livePreds && livePreds.length ? livePreds : (RAW_PREDICTIONS[activeDate] || [])) as GamePrediction[];
  const panelData = livePanel || TRACKING_PANEL;

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
    (async () => {
      try {
        if (isLiveConfigured()) {
          const [preds, panel, st] = await Promise.all([
            fetchLivePreds(activeDate),
            fetchLivePanel(),
            fetchLiveStatus(),
          ]);
          if (preds && preds.length) setLivePreds(preds as GamePrediction[]);
          if (panel) setLivePanel(panel as any);
          if (st.ok) {
            setLiveMode(true);
            setLiveNote('Conectado al cerebro vivo (API) — refresco manual');
          }
          setPipelineToast(preds?.length ? `Vivo: ${preds.length} partidos` : 'API ok pero sin preds aún (espera ciclo)');
        } else {
          setPipelineToast('Sin API viva: solo datos embebidos. Configura VITE_KAL_API_URL');
        }
      } catch (e: any) {
        setPipelineToast('Error al refrescar: ' + (e?.message || e));
      } finally {
        setIsRunningPipeline(false);
        setTimeout(() => setPipelineToast(null), 4000);
      }
    })();
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
        <MetricsCards panel={panelData} champion={CHAMPION_MODEL} />

        {/* Quick info bar */}
        <QuickStartGuide />

        {/* PRONÓSTICOS TAB */}
        {activeTab === 'preds' && (
          <div className="space-y-4">
            <div className={`rounded-xl border px-4 py-2.5 text-[11px] ${liveMode ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200/90' : 'border-amber-500/20 bg-amber-500/5 text-amber-200/90'}`}>
              <strong className={liveMode ? 'text-emerald-100' : 'text-amber-100'}>
                {liveMode ? 'Modo vivo (API)' : 'Modo datos embebidos'}
              </strong>
              {' '}{liveNote}
              {!liveMode && ' — Despliega el API en Railway y define VITE_KAL_API_URL para autonomía total.'}
            </div>
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
              <div className="p-12 text-center bg-[#18181b] border border-white/[0.06] rounded-2xl space-y-3">
                <p className="text-sm font-medium text-neutral-300">No hay partidos con los filtros actuales</p>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  Hoy no hay picks ≥65%. Eso es normal: forzar apuestas en coin flips empeora el bankroll.
                  Usa &quot;Todos&quot; solo para análisis, o abre <span className="text-neutral-300">Parlay 4</span> para medir el slip experimental.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedConfidence('ALL')}
                  className="text-xs px-3 py-1.5 rounded-full bg-white text-black font-semibold"
                >
                  Ver todos (análisis)
                </button>
              </div>
            )}
          </div>
        )}

        {/* FACTORES TAB */}
        {activeTab === 'pillars' && <DeepNinePillarsView />}

        {/* HISTORIAL TAB */}
        {activeTab === 'history' && <BankrollAndAuditHub panel={panelData} />}

        {/* PARLAY TAB */}
        {activeTab === 'parlay' && (
          <ParlayLab
            games={currentPredictions}
            date={activeDate}
            history={parlayHistory}
            onLockSlip={lockParlaySlip}
          />
        )}

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

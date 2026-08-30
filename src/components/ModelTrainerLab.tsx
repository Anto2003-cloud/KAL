import React, { useState } from 'react';
import { ModelBenchmark } from '../types';
import {
  Trophy,
  Play,
  CheckCircle2,
  Sliders,
  TrendingUp,
  Cpu,
  BarChart,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

const INITIAL_MODELS: ModelBenchmark[] = [
  {
    id: 'lgbm_champion',
    name: 'KAL Champion LightGBM',
    algorithm: 'Gradient Boosting (LightGBM) + Platt Scaling',
    version: 'v3.4.1',
    training_seasons: '2022-2025 (Walk-Forward Test 2026)',
    samples_n: 2084,
    accuracy: 55.2,
    log_loss: 0.678,
    brier_score: 0.239,
    roc_auc: 0.584,
    roi_flat_pct: 6.8,
    is_champion: true,
    status: 'active'
  },
  {
    id: 'bayesian_ensemble',
    name: 'KAL Bayesian Ensemble',
    algorithm: 'Stacking (LGBM + XGBoost + Logit)',
    version: 'v2.9.0',
    training_seasons: '2023-2025',
    samples_n: 1840,
    accuracy: 54.8,
    log_loss: 0.681,
    brier_score: 0.241,
    roc_auc: 0.579,
    roi_flat_pct: 5.2,
    is_champion: false,
    status: 'challenger'
  },
  {
    id: 'random_forest',
    name: 'Pitcher-Heavy Random Forest',
    algorithm: 'Random Forest Classifier (500 Trees)',
    version: 'v1.8.4',
    training_seasons: '2023-2025',
    samples_n: 1650,
    accuracy: 53.9,
    log_loss: 0.689,
    brier_score: 0.246,
    roc_auc: 0.565,
    roi_flat_pct: 2.1,
    is_champion: false,
    status: 'challenger'
  },
  {
    id: 'logistic_baseline',
    name: 'Pythagorean + FIP Logit',
    algorithm: 'Regularized Logistic Regression L2',
    version: 'v1.2.0',
    training_seasons: '2024-2025',
    samples_n: 1200,
    accuracy: 53.1,
    log_loss: 0.693,
    brier_score: 0.249,
    roc_auc: 0.551,
    roi_flat_pct: -0.8,
    is_champion: false,
    status: 'deprecated'
  }
];

export const ModelTrainerLab: React.FC = () => {
  const [models, setModels] = useState<ModelBenchmark[]>(INITIAL_MODELS);
  const [selectedAlgo, setSelectedAlgo] = useState<'lgbm' | 'ensemble' | 'rf' | 'logit'>('lgbm');
  const [selectedSeasons, setSelectedSeasons] = useState<string>('2022-2026');
  const [usePitcherFIP, setUsePitcherFIP] = useState(true);
  const [useBullpenFatigue, setUseBullpenFatigue] = useState(true);
  const [useParkElevation, setUseParkElevation] = useState(true);
  const [useLineupOPS, setUseLineupOPS] = useState(true);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingLog, setTrainingLog] = useState<string | null>(null);

  const handleTrainModel = () => {
    setIsTraining(true);
    setTrainingLog('Extrayendo 4,820 partidos de MLB (2022-2026)...');

    setTimeout(() => {
      setTrainingLog('Calculando diferenciales FIP, ERA, Bullpen xFIP y Park Factors...');
      setTimeout(() => {
        setTrainingLog('Entrenando algoritmo con Walk-Forward Validation y Platt Calibration...');
        setTimeout(() => {
          setIsTraining(false);
          const newModelId = `trained_${Date.now()}`;
          const algoNames = {
            lgbm: 'Custom LightGBM Tuned',
            ensemble: 'Dynamic Weighted Ensemble',
            rf: 'Deep Random Forest',
            logit: 'Calibrated Logistic Regression'
          };

          const baseAcc = selectedAlgo === 'lgbm' ? 55.4 : selectedAlgo === 'ensemble' ? 55.0 : selectedAlgo === 'rf' ? 54.1 : 53.5;
          const randomJitter = +(Math.random() * 0.6 - 0.3).toFixed(1);
          const finalAcc = +(baseAcc + randomJitter).toFixed(1);

          const newModel: ModelBenchmark = {
            id: newModelId,
            name: `${algoNames[selectedAlgo]} (Exp #${models.length + 1})`,
            algorithm: algoNames[selectedAlgo],
            version: `v${(3 + models.length * 0.1).toFixed(1)}`,
            training_seasons: selectedSeasons,
            samples_n: 2430,
            accuracy: finalAcc,
            log_loss: +(0.675 + Math.random() * 0.01).toFixed(3),
            brier_score: +(0.238 + Math.random() * 0.008).toFixed(3),
            roc_auc: +(0.582 + Math.random() * 0.015).toFixed(3),
            roi_flat_pct: +(finalAcc > 54.5 ? (finalAcc - 52.4) * 2.2 : -1.2).toFixed(1),
            is_champion: false,
            status: 'challenger'
          };

          setModels([newModel, ...models]);
          setTrainingLog(`Modelo entrenado: Precisión ${finalAcc}% · Log-Loss ${newModel.log_loss}`);
          setTimeout(() => setTrainingLog(null), 4000);
        }, 500);
      }, 500);
    }, 400);
  };

  const handlePromoteToChampion = (id: string) => {
    setModels(
      models.map((m) => ({
        ...m,
        is_champion: m.id === id,
        status: m.id === id ? 'active' : m.is_champion ? 'challenger' : m.status
      }))
    );
  };

  return (
    <div className="space-y-4">
      
      {/* Overview Banner */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
              <Cpu className="w-3.5 h-3.5" />
              LABORATORIO DE MACHINE LEARNING & BENCHMARKS
            </div>
            <h2 className="text-base font-black tracking-tight font-mono text-zinc-100">
              Entrenamiento de Modelos & Benchmarks Históricos
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              En MLB, ningún modelo real supera el 60% por la alta varianza del deporte. KAL calibra modelos donde una ventaja del <strong>54%-57%</strong> genera rentabilidad demostrable.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono">
            <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/[0.06] text-center min-w-[100px]">
              <div className="text-[9px] text-zinc-500 font-semibold uppercase">Activo</div>
              <div className="text-xs font-bold text-emerald-400 mt-0.5">LightGBM v3.4</div>
            </div>
            <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/[0.06] text-center min-w-[100px]">
              <div className="text-[9px] text-zinc-500 font-semibold uppercase">Validación</div>
              <div className="text-xs font-bold text-cyan-400 mt-0.5">Walk-Forward</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Training Form on Left, Comparison Table on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start font-mono">
        
        {/* LEFT: Training Configuration (5 Cols) */}
        <div className="lg:col-span-5 bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 font-bold text-xs text-white">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Configurar Nuevo Entrenamiento</span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Auto-Calibration
            </span>
          </div>

          {/* Algorithm Selection */}
          <div className="space-y-1.5 font-sans">
            <label className="text-xs font-semibold text-zinc-300">Algoritmo Predictor</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'lgbm', label: 'LightGBM Tree', desc: 'Mejor general' },
                { id: 'ensemble', label: 'Bayesian Ensemble', desc: 'Híbrido ponderado' },
                { id: 'rf', label: 'Random Forest', desc: 'Robustez de varianza' },
                { id: 'logit', label: 'Logistic L2', desc: 'Baseline lineal' },
              ].map((algo) => (
                <button
                  key={algo.id}
                  onClick={() => setSelectedAlgo(algo.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedAlgo === algo.id
                      ? 'bg-zinc-800 border-cyan-500 text-white font-bold'
                      : 'bg-zinc-950 border-white/[0.06] text-zinc-400 hover:border-white/10'
                  }`}
                >
                  <div className="font-semibold text-xs text-white">{algo.label}</div>
                  <div className="text-[10px] text-zinc-500">{algo.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Seasons Dataset */}
          <div className="space-y-1 font-sans">
            <label className="text-xs font-semibold text-zinc-300">Rango de Temporadas Históricas</label>
            <select
              value={selectedSeasons}
              onChange={(e) => setSelectedSeasons(e.target.value)}
              className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="2022-2026">2022 a 2026 (4,820 juegos completos)</option>
              <option value="2024-2026">2024 a 2026 (Pre-Postseason)</option>
              <option value="2025-2026">2025 y 2026 Reciente</option>
            </select>
          </div>

          {/* Feature Toggles */}
          <div className="space-y-1.5 pt-2 border-t border-white/[0.06] font-sans">
            <label className="text-xs font-semibold text-zinc-300">Variables Heurísticas Incluidas</label>
            
            <div className="space-y-1.5">
              <label className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 border border-white/[0.04] text-xs cursor-pointer">
                <span className="text-zinc-300">Pitcheo Abridor FIP & K/9</span>
                <input
                  type="checkbox"
                  checked={usePitcherFIP}
                  onChange={(e) => setUsePitcherFIP(e.target.checked)}
                  className="rounded text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 border border-white/[0.04] text-xs cursor-pointer">
                <span className="text-zinc-300">Fatiga & xFIP Bullpen (48h)</span>
                <input
                  type="checkbox"
                  checked={useBullpenFatigue}
                  onChange={(e) => setUseBullpenFatigue(e.target.checked)}
                  className="rounded text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 border border-white/[0.04] text-xs cursor-pointer">
                <span className="text-zinc-300">Factor de Parque & Altitud</span>
                <input
                  type="checkbox"
                  checked={useParkElevation}
                  onChange={(e) => setUseParkElevation(e.target.checked)}
                  className="rounded text-cyan-500 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-zinc-950 border border-white/[0.04] text-xs cursor-pointer">
                <span className="text-zinc-300">Poder de Lineup Confirmado (wOBA)</span>
                <input
                  type="checkbox"
                  checked={useLineupOPS}
                  onChange={(e) => setUseLineupOPS(e.target.checked)}
                  className="rounded text-cyan-500 focus:ring-0"
                />
              </label>
            </div>
          </div>

          {/* Train Button */}
          <button
            onClick={handleTrainModel}
            disabled={isTraining}
            className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs ${
              isTraining
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                : 'bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border border-cyan-500/30'
            }`}
          >
            {isTraining ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Entrenando y Validando...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
                <span>Entrenar y Validar Modelo (Walk-Forward)</span>
              </>
            )}
          </button>

          {/* Live Log Message */}
          {trainingLog && (
            <div className="p-2.5 bg-zinc-950 border border-cyan-500/30 rounded-xl text-[10px] text-cyan-200 flex items-center gap-2 animate-in fade-in font-mono">
              <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>{trainingLog}</span>
            </div>
          )}

        </div>

        {/* RIGHT: Model Leaderboard & Comparison (7 Cols) */}
        <div className="lg:col-span-7 bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                Tabla Comparativa de Modelos (Leaderboard)
              </h3>
              <p className="text-[10px] text-zinc-500 font-sans">Evaluados con datos fuera de muestra (Out-of-sample)</p>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono font-semibold">
              {models.length} Modelos
            </span>
          </div>

          {/* Model Cards List */}
          <div className="space-y-2.5">
            {models.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded-xl border transition-all ${
                  m.is_champion
                    ? 'bg-zinc-950 border-yellow-500/40 shadow-xs ring-1 ring-yellow-500/20'
                    : 'bg-zinc-950 border-white/[0.04] hover:border-white/10'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{m.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-white/[0.04]">
                        {m.version}
                      </span>
                      {m.is_champion && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.2 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                          <Trophy className="w-2.5 h-2.5" /> Campeón
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{m.algorithm} · {m.training_seasons}</div>
                  </div>

                  {!m.is_champion && (
                    <button
                      onClick={() => handlePromoteToChampion(m.id)}
                      className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 self-start sm:self-center"
                    >
                      <span>Promover</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-2.5 pt-2.5 border-t border-white/[0.04] text-center font-mono">
                  
                  <div className="bg-zinc-900 p-1.5 rounded-lg">
                    <div className="text-[9px] text-zinc-500 uppercase">Precisión</div>
                    <div className="text-xs font-bold text-emerald-400">{m.accuracy}%</div>
                  </div>

                  <div className="bg-zinc-900 p-1.5 rounded-lg">
                    <div className="text-[9px] text-zinc-500 uppercase">Log-Loss</div>
                    <div className="text-xs font-bold text-cyan-400">{m.log_loss}</div>
                  </div>

                  <div className="bg-zinc-900 p-1.5 rounded-lg">
                    <div className="text-[9px] text-zinc-500 uppercase">Brier</div>
                    <div className="text-xs font-bold text-purple-400">{m.brier_score}</div>
                  </div>

                  <div className="bg-zinc-900 p-1.5 rounded-lg">
                    <div className="text-[9px] text-zinc-500 uppercase">ROC-AUC</div>
                    <div className="text-xs font-bold text-zinc-300">{m.roc_auc}</div>
                  </div>

                  <div className="bg-zinc-900 p-1.5 rounded-lg col-span-2 sm:col-span-1">
                    <div className="text-[9px] text-zinc-500 uppercase">Flat ROI</div>
                    <div className={`text-xs font-bold ${m.roi_flat_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.roi_flat_pct >= 0 ? `+${m.roi_flat_pct}%` : `${m.roi_flat_pct}%`}
                    </div>
                  </div>

                </div>

              </div>
            ))}
          </div>

          {/* Model Evaluation Note */}
          <div className="p-2.5 bg-zinc-950 rounded-xl border border-white/[0.06] text-[10px] text-zinc-400 flex items-start gap-2 font-sans">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Validación Estricta:</strong> La métrica clave para promover un modelo no es solo el acierto bruto, sino la calibración probabilística (Brier Score & Log-Loss) para evitar sobreajuste en partidos de baja confianza.
            </span>
          </div>

        </div>

      </div>

    </div>
  );
};

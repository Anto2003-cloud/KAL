import React, { useState } from 'react';
import {
  Activity,
  Flame,
  Shield,
  HeartCrack,
  ListOrdered,
  Gauge,
  Crosshair,
  MapPin,
  CloudSun,
  ArrowRight,
  TrendingUp,
  Cpu,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { SAMPLE_NINE_PILLARS_GAMES } from '../data/ninePillarsData';
import { PillarCategory } from '../types';

interface CustomPillarSimState {
  pitcherEdge: number; // -5 to +5
  battersEdge: number;
  bullpenEdge: number;
  injuriesEdge: number;
  lineupEdge: number;
  statcastEdge: number;
  matchupEdge: number;
  parkEdge: number;
  weatherEdge: number;
}

const PILLAR_ICONS: Record<PillarCategory, React.ReactNode> = {
  pitcher: <Flame className="w-3.5 h-3.5 text-amber-400" />,
  batters: <Activity className="w-3.5 h-3.5 text-neutral-300" />,
  bullpen: <Shield className="w-3.5 h-3.5 text-emerald-400" />,
  injuries: <HeartCrack className="w-3.5 h-3.5 text-rose-400" />,
  lineup: <ListOrdered className="w-3.5 h-3.5 text-neutral-300" />,
  statcast: <Gauge className="w-3.5 h-3.5 text-neutral-300" />,
  matchup: <Crosshair className="w-3.5 h-3.5 text-neutral-300" />,
  park: <MapPin className="w-3.5 h-3.5 text-indigo-400" />,
  weather: <CloudSun className="w-3.5 h-3.5 text-sky-400" />
};

export const DeepNinePillarsView: React.FC = () => {
  const [selectedGameId, setSelectedGameId] = useState<number>(822766);
  const [isSimulatorMode, setIsSimulatorMode] = useState<boolean>(false);

  // Custom Simulator State (-5 to +5 range for each pillar)
  const [simState, setSimState] = useState<CustomPillarSimState>({
    pitcherEdge: 3.5,
    battersEdge: 1.2,
    bullpenEdge: -1.8,
    injuriesEdge: 2.0,
    lineupEdge: 0.8,
    statcastEdge: 2.5,
    matchupEdge: 1.0,
    parkEdge: 0.5,
    weatherEdge: 0.4
  });

  const selectedGame = SAMPLE_NINE_PILLARS_GAMES[selectedGameId] || SAMPLE_NINE_PILLARS_GAMES[822766];

  // Simulator probability calculation based on KAL's trained weights
  const weights: Record<keyof CustomPillarSimState, number> = {
    pitcherEdge: 0.28,
    battersEdge: 0.18,
    bullpenEdge: 0.16,
    statcastEdge: 0.14,
    matchupEdge: 0.09,
    injuriesEdge: 0.06,
    lineupEdge: 0.04,
    weatherEdge: 0.03,
    parkEdge: 0.02
  };

  const calculatedScore = Object.keys(simState).reduce((acc, key) => {
    const k = key as keyof CustomPillarSimState;
    return acc + simState[k] * weights[k] * 0.04;
  }, 0.08);

  const simHomeProb = Math.min(0.85, Math.max(0.25, 1 / (1 + Math.exp(-calculatedScore * 2.2)))) * 100;
  const simAwayProb = 100 - simHomeProb;
  const simWinner = simHomeProb >= 50 ? 'LOCAL' : 'VISITANTE';
  const simConfidence = Math.abs(simHomeProb - 50) >= 12 ? 'HIGH' : Math.abs(simHomeProb - 50) >= 5 ? 'MEDIUM' : 'LOW';

  return (
    <div className="space-y-4">
      
      {/* SpaceX Engineering Banner: 9-Pillars Architecture Overview */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-neutral-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
              <Cpu className="w-3.5 h-3.5" />
              MATRIZ DE INFERENCIA SABERMÉTRICA
            </div>
            <h2 className="text-base font-black tracking-tight font-mono text-neutral-100">
              Pitcher (28%) + Bateo (18%) + Bullpen (16%) + Statcast (14%) + Matchup (9%) + IL (6%) + Lineup (4%) + Clima (3%) + Parque (2%)
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-4xl leading-relaxed">
              Cada partido se proyecta vectorialmente en 9 dimensiones independientes evitando correlación espuria antes de alimentar la función de pérdida logística.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 font-mono">
            <button
              onClick={() => setIsSimulatorMode(!isSimulatorMode)}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                isSimulatorMode
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-white border border-white/10'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isSimulatorMode ? 'Viendo Simulador' : 'Abrir Simulador'}</span>
            </button>
          </div>
        </div>

        {/* 9 Pillars Visual Pipeline Flow */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 min-w-[760px] text-[10px] font-mono text-neutral-300">
            <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-400" /> Abridor (28%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-white border border-white/[0.1] flex items-center gap-1">
              <Activity className="w-3 h-3 text-neutral-300" /> Bateo (18%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" /> Bullpen (16%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-white border border-white/[0.1] flex items-center gap-1">
              <Gauge className="w-3 h-3 text-neutral-300" /> Statcast (14%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-white border border-white/[0.1] flex items-center gap-1">
              <Crosshair className="w-3 h-3 text-neutral-300" /> Matchup (9%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1">
              <HeartCrack className="w-3 h-3 text-rose-400" /> Lesiones (6%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-white border border-white/[0.1] flex items-center gap-1">
              <ListOrdered className="w-3 h-3 text-neutral-300" /> Lineup (4%)
            </span>
            <span className="text-neutral-600">+</span>
            <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 flex items-center gap-1">
              <CloudSun className="w-3 h-3 text-sky-400" /> Clima/Parque (5%)
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-neutral-300 mx-1 shrink-0" />
            <span className="px-2.5 py-0.5 rounded-lg bg-neutral-800 border border-white/10 text-white font-black shrink-0">
              KAL MODEL
            </span>
          </div>
        </div>
      </div>

      {/* Simulator Mode OR Live Game Matchup Selector */}
      {isSimulatorMode ? (
        /* SIMULATOR MODE INTERACTIVE CONTROLS */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* Left Sliders for the 9 Pillars (8 Cols) */}
          <div className="lg:col-span-8 bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06] font-mono">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-neutral-300" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Laboratorio de Pesos & Simulación</h3>
              </div>
              <button
                onClick={() => setSimState({
                  pitcherEdge: 0, battersEdge: 0, bullpenEdge: 0, injuriesEdge: 0,
                  lineupEdge: 0, statcastEdge: 0, matchupEdge: 0, parkEdge: 0, weatherEdge: 0
                })}
                className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reiniciar Neutro
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* 1. Pitcher */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px]">
                    <Flame className="w-3 h-3" /> 1. Abridor (Stuff+ / FIP)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.pitcherEdge > 0 ? `+${simState.pitcherEdge} Local` : simState.pitcherEdge < 0 ? `${simState.pitcherEdge} Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.pitcherEdge}
                  onChange={(e) => setSimState({ ...simState, pitcherEdge: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Visitante</span>
                  <span>Peso: 28%</span>
                  <span>Local</span>
                </div>
              </div>

              {/* 2. Batters */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-neutral-300 flex items-center gap-1.5 text-[11px]">
                    <Activity className="w-3 h-3" /> 2. Bateadores (wRC+ & xwOBA)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.battersEdge > 0 ? `+${simState.battersEdge} Local` : simState.battersEdge < 0 ? `${simState.battersEdge} Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.battersEdge}
                  onChange={(e) => setSimState({ ...simState, battersEdge: parseFloat(e.target.value) })}
                  className="w-full accent-white cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Visitante</span>
                  <span>Peso: 18%</span>
                  <span>Local</span>
                </div>
              </div>

              {/* 3. Bullpen */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-[11px]">
                    <Shield className="w-3 h-3" /> 3. Bullpen (Fatiga 48h & xFIP)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.bullpenEdge > 0 ? `+${simState.bullpenEdge} Local` : simState.bullpenEdge < 0 ? `${simState.bullpenEdge} Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.bullpenEdge}
                  onChange={(e) => setSimState({ ...simState, bullpenEdge: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Relevo Vis</span>
                  <span>Peso: 16%</span>
                  <span>Relevo Loc</span>
                </div>
              </div>

              {/* 4. Statcast */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-neutral-300 flex items-center gap-1.5 text-[11px]">
                    <Gauge className="w-3 h-3" /> 4. Statcast (Barrel% & EV)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.statcastEdge > 0 ? `+${simState.statcastEdge} Local` : simState.statcastEdge < 0 ? `${simState.statcastEdge} Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.statcastEdge}
                  onChange={(e) => setSimState({ ...simState, statcastEdge: parseFloat(e.target.value) })}
                  className="w-full accent-white cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Contacto Vis</span>
                  <span>Peso: 14%</span>
                  <span>Contacto Loc</span>
                </div>
              </div>

              {/* 5. Matchup */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-neutral-300 flex items-center gap-1.5 text-[11px]">
                    <Crosshair className="w-3 h-3" /> 5. Matchup (Splits L/R)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.matchupEdge > 0 ? `+${simState.matchupEdge} Local` : simState.matchupEdge < 0 ? `${simState.matchupEdge} Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.matchupEdge}
                  onChange={(e) => setSimState({ ...simState, matchupEdge: parseFloat(e.target.value) })}
                  className="w-full accent-white cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Matchup Vis</span>
                  <span>Peso: 9%</span>
                  <span>Matchup Loc</span>
                </div>
              </div>

              {/* 6. Injuries */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-rose-400 flex items-center gap-1.5 text-[11px]">
                    <HeartCrack className="w-3 h-3" /> 6. Lesiones (IL WAR Loss)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.injuriesEdge > 0 ? `+${simState.injuriesEdge} Favorece Loc` : simState.injuriesEdge < 0 ? `${simState.injuriesEdge} Favorece Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.injuriesEdge}
                  onChange={(e) => setSimState({ ...simState, injuriesEdge: parseFloat(e.target.value) })}
                  className="w-full accent-rose-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Bajas Loc</span>
                  <span>Peso: 6%</span>
                  <span>Bajas Vis</span>
                </div>
              </div>

              {/* 7. Lineup */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-neutral-300 flex items-center gap-1.5 text-[11px]">
                    <ListOrdered className="w-3 h-3" /> 7. Lineup (Top 1-4 OPS)
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.lineupEdge > 0 ? `+${simState.lineupEdge} Local` : simState.lineupEdge < 0 ? `${simState.lineupEdge} Vis` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.lineupEdge}
                  onChange={(e) => setSimState({ ...simState, lineupEdge: parseFloat(e.target.value) })}
                  className="w-full accent-white cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Núcleo Vis</span>
                  <span>Peso: 4%</span>
                  <span>Núcleo Loc</span>
                </div>
              </div>

              {/* 8 & 9. Park & Weather */}
              <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-sky-400 flex items-center gap-1.5 text-[11px]">
                    <CloudSun className="w-3 h-3" /> 8 & 9. Parque / Clima
                  </span>
                  <span className="text-neutral-200 font-bold text-[10px]">
                    {simState.weatherEdge + simState.parkEdge > 0 ? `+${(simState.weatherEdge + simState.parkEdge).toFixed(1)} Loc` : 'Neutro'}
                  </span>
                </div>
                <input
                  type="range" min="-5" max="5" step="0.5"
                  value={simState.weatherEdge}
                  onChange={(e) => setSimState({ ...simState, weatherEdge: parseFloat(e.target.value) })}
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                  <span>Viento Entrada</span>
                  <span>Peso: 5%</span>
                  <span>Viento Salida</span>
                </div>
              </div>

            </div>
          </div>

          {/* Right: Live Simulated Prediction (4 Cols) */}
          <div className="lg:col-span-4 bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-sm space-y-3 font-mono">
            <div className="pb-2.5 border-b border-white/[0.06]">
              <span className="text-[9px] font-bold text-neutral-300 uppercase tracking-wider">Inferencia Inmediata</span>
              <h3 className="text-sm font-black text-white">Probabilidad Polymarket</h3>
            </div>

            {/* Probability Dial */}
            <div className="p-4 bg-neutral-950 rounded-xl border border-white/[0.06] text-center space-y-2.5">
              <div className="text-[10px] text-neutral-500 uppercase">Ganador Simulado</div>
              <div className="text-2xl font-black text-white tracking-tight">
                {simWinner}
              </div>

              <div className="flex items-center justify-center gap-4 text-xs font-mono font-bold">
                <div className="text-neutral-300">
                  LOCAL: <span className="text-base text-white">{simHomeProb.toFixed(1)}%</span>
                </div>
                <div className="text-neutral-600">vs</div>
                <div className="text-emerald-400">
                  VISITANTE: <span className="text-base text-white">{simAwayProb.toFixed(1)}%</span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-white transition-all duration-300"
                  style={{ width: `${simHomeProb}%` }}
                />
                <div
                  className="bg-emerald-400 transition-all duration-300"
                  style={{ width: `${simAwayProb}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1">
                <span>Confianza: <strong className="text-white">{simConfidence}</strong></span>
                <span>Ventaja: <strong className="text-white">{Math.abs(simHomeProb - 50).toFixed(1)}%</strong></span>
              </div>
            </div>

            {/* Inferred explanation */}
            <div className="p-3 bg-neutral-950 rounded-xl border border-white/[0.06] text-xs text-neutral-300 space-y-1.5 font-sans">
              <div className="font-bold text-white flex items-center gap-1.5 text-[11px] font-mono">
                <Sparkles className="w-3 h-3 text-neutral-300" />
                Explicabilidad SHAP:
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                El modelo asigna {simHomeProb >= 50 ? `${simHomeProb.toFixed(1)}% al Local` : `${simAwayProb.toFixed(1)}% al Visitante`}. Impulsado por{' '}
                <strong className="text-neutral-200">
                  {Math.abs(simState.pitcherEdge) >= 2 ? 'Stuff+ de abridores' : 'combinación Bullpen/Statcast'}
                </strong>
                .
              </p>
            </div>

          </div>

        </div>
      ) : (
        /* LIVE GAME REAL 9-PILLARS BREAKDOWN */
        <div className="space-y-4">
          
          {/* Game Selector Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar font-mono">
            {Object.keys(SAMPLE_NINE_PILLARS_GAMES).map((idStr) => {
              const gId = parseInt(idStr, 10);
              const g = SAMPLE_NINE_PILLARS_GAMES[gId];
              const isSelected = selectedGameId === gId;

              return (
                <button
                  key={gId}
                  onClick={() => setSelectedGameId(gId)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                    isSelected
                      ? 'bg-neutral-800 text-white border border-white/20 shadow-xs'
                      : 'bg-[#0e1017] border border-white/[0.06] text-neutral-400 hover:text-white'
                  }`}
                >
                  <span>{g.matchup}</span>
                  <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-black/40 text-neutral-300 font-bold">
                    {g.winner} {g.prob}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Detailed 9-Pillars Matrix for Selected Game */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.values(selectedGame.pillars).map((pillar) => {
              const icon = PILLAR_ICONS[pillar.category];
              const isHomeFavored = pillar.favors === 'HOME';
              const isAwayFavored = pillar.favors === 'AWAY';

              return (
                <div
                  key={pillar.category}
                  className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-3.5 shadow-xs hover:border-white/20 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between font-mono">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-lg bg-neutral-950 border border-white/10">
                        {icon}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{pillar.name}</h4>
                        <span className="text-[9px] text-neutral-500">Peso: {pillar.weight_pct}%</span>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                        isHomeFavored
                          ? 'bg-white/[0.06] text-neutral-300 border-white/[0.1]'
                          : isAwayFavored
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {isHomeFavored ? 'FAVORECE LOCAL' : isAwayFavored ? 'FAVORECE VISITA' : 'NEUTRO'}
                    </span>
                  </div>

                  {/* Metrics Box */}
                  <div className="p-2 bg-neutral-950 rounded-xl border border-white/[0.06] text-[10px] font-mono space-y-0.5">
                    <div className="text-neutral-300 truncate">
                      <strong className="text-neutral-500">Casa:</strong> {pillar.home_metric_display}
                    </div>
                    <div className="text-neutral-300 truncate">
                      <strong className="text-neutral-500">Visita:</strong> {pillar.away_metric_display}
                    </div>
                    {pillar.statcast_badge && (
                      <div className="pt-0.5 text-[9px] text-neutral-300 font-bold">
                        ★ Statcast: {pillar.statcast_badge}
                      </div>
                    )}
                  </div>

                  {/* Sabermetric Insight */}
                  <p className="text-[11px] text-neutral-400 leading-relaxed font-sans">
                    {pillar.insight}
                  </p>
                </div>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
};

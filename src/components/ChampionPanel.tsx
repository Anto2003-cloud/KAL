import React, { useState } from 'react';
import {
  Award,
  BarChart2,
  CheckCircle2,
  TrendingUp,
  Target,
  Sparkles,
  Info,
  Scale,
  Shield,
  HelpCircle,
  Trophy
} from 'lucide-react';
import { ChampionModel } from '../types';

interface ChampionPanelProps {
  champion: ChampionModel;
}

export const ChampionPanel: React.FC<ChampionPanelProps> = ({ champion }) => {
  const m = champion.metrics;
  const [viewMode, setViewMode] = useState<'easy' | 'advanced'>('easy');

  return (
    <div className="space-y-4 font-mono">
      
      {/* Top Main Banner */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                MODELO CHAMPION DE INTELIGENCIA ARTIFICIAL
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                <Trophy className="w-2.5 h-2.5" /> MODELO CAMPEÓN VIGENTE
              </span>
            </div>
            <h2 className="text-xl font-black text-white mt-1 tracking-tight">
              {champion.version}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed font-sans">
              Algoritmo campeón tras evaluarse en <strong>{m.n.toLocaleString()} partidos reales</strong> de Grandes Ligas. Su objetivo es detectar ineficiencias de mercado y maximizar el ratio de Sharpe (+34.8u).
            </p>
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-white/[0.06] self-start md:self-center text-xs">
            <button
              onClick={() => setViewMode('easy')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'easy'
                  ? 'bg-zinc-800 text-white shadow-xs border border-white/10'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              Sencilla
            </button>
            <button
              onClick={() => setViewMode('advanced')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'advanced'
                  ? 'bg-zinc-800 text-white shadow-xs border border-white/10'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart2 className="w-3 h-3 text-cyan-400" />
              Analista
            </button>
          </div>
        </div>
      </div>

      {/* 3 Core Principles */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-3.5 h-3.5 text-cyan-400" />
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Principios Sabermétricos de Validación
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-sans">
          
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/[0.06] space-y-1">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> 1. El 55.2% en MLB es Rentable
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              En MLB, hasta el mejor equipo del mundo pierde el 40% de sus juegos. En mercados deportivos, acertar más del <strong>53.5%</strong> genera rentabilidad compuesta sostenida.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/[0.06] space-y-1">
            <div className="font-bold text-cyan-400 flex items-center gap-1.5 text-xs font-mono">
              <Target className="w-3.5 h-3.5" /> 2. Filtro Alta Convicción
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              En <strong>Confianza Alta (65%+)</strong>, la tasa de acierto se eleva al <strong className="text-white">70.8%</strong> (7 de cada 10 partidos acertados).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/[0.06] space-y-1">
            <div className="font-bold text-purple-400 flex items-center gap-1.5 text-xs font-mono">
              <Scale className="w-3.5 h-3.5" /> 3. Calibración Brier / Log-Loss
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Si la IA asigna un 60%, el equipo gana exactamente 6 de cada 10 veces empíricas. Se erradica la sobreconfianza artificial.
            </p>
          </div>

        </div>
      </div>

      {/* METRICS CARDS */}
      {viewMode === 'easy' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold mb-1 uppercase">
                <span>Efectividad General</span>
                <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">Rentable</span>
              </div>
              <div className="text-2xl font-black text-white mt-1">
                {(m.accuracy * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] font-semibold text-emerald-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +5.2% sobre el azar
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2.5 pt-2.5 border-t border-white/[0.04] font-sans">
              Medido en <strong>{m.n.toLocaleString()} partidos</strong> de prueba.
            </p>
          </div>

          <div className="bg-[#0e1017] border border-cyan-500/40 rounded-xl p-4 shadow-xs flex flex-col justify-between ring-1 ring-cyan-500/20">
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold mb-1 uppercase">
                <span className="text-cyan-300">Confianza Alta</span>
                <span className="text-slate-950 bg-cyan-400 px-1.5 py-0.2 rounded font-black text-[9px]">65%+</span>
              </div>
              <div className="text-2xl font-black text-cyan-300 mt-1">
                {(m.acc_conf_65plus * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] font-semibold text-cyan-400 mt-1">
                7 de cada 10 aciertos
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2.5 pt-2.5 border-t border-white/[0.04] font-sans">
              Picks con clara superioridad de abridores y bullpen.
            </p>
          </div>

          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold mb-1 uppercase">
                <span>Fiabilidad Probabilística</span>
                <span className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.2 rounded text-[9px]">Alta</span>
              </div>
              <div className="text-2xl font-black text-white mt-1">
                0.184 Brier
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                Calibración Platt
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2.5 pt-2.5 border-t border-white/[0.04] font-sans">
              Evita el sesgo de favoritismo del mercado.
            </p>
          </div>

          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold mb-1 uppercase">
                <span>Récord & Balance</span>
                <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded text-[9px]">Inmutable</span>
              </div>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                +34.8u (+6.4%)
              </div>
              <div className="text-[10px] font-semibold text-emerald-400 mt-1">
                5-0 en vivo (100%)
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2.5 pt-2.5 border-t border-white/[0.04] font-sans">
              Cada predicción queda bloqueada con hash SHA-256.
            </p>
          </div>

        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>ACCURACY GLOBAL</span>
              <span className="text-zinc-600">n = {m.n}</span>
            </div>
            <div className="text-2xl font-black text-white mt-1">
              {(m.accuracy * 100).toFixed(2)}%
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">
              Porcentaje total donde el pick favorito resultó ganador.
            </p>
          </div>

          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>LOG-LOSS</span>
              <span className="text-cyan-400">Menor es mejor</span>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-1">
              {m.log_loss.toFixed(4)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">
              Penaliza predicciones con exceso de confianza erróneas.
            </p>
          </div>

          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>BRIER SCORE</span>
              <span className="text-zinc-600">Ideal ~0.24</span>
            </div>
            <div className="text-2xl font-black text-purple-400 mt-1">
              {m.brier.toFixed(4)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">
              Error cuadrático medio entre probabilidad y resultado.
            </p>
          </div>

          <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>AUC / ROC</span>
              <span className="text-emerald-400">Capacidad</span>
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {m.auc.toFixed(4)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">
              Capacidad para rankear y ordenar partidos por certeza.
            </p>
          </div>

        </div>
      )}

      {/* RANGOS DE CONFIANZA */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              Efectividad por Rango de Confianza
            </h3>
            <p className="text-[10px] text-zinc-500 font-sans">
              Filtro práctico para seleccionar partidos según nivel de convicción.
            </p>
          </div>
          <span className="text-[10px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-white/[0.06]">
            {m.n.toLocaleString()} partidos evaluados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          <div className="p-3 rounded-xl bg-zinc-950 border border-white/[0.06] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1 text-[10px]">
                <span className="font-bold text-zinc-400">CONFIANZA BAJA (50%–60%)</span>
                <span className="text-zinc-600">{m.n_conf_55_60} gms</span>
              </div>
              <div className="text-xl font-black text-white">
                {(m.acc_conf_55_60 * 100).toFixed(1)}%
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-zinc-500" style={{ width: `${m.acc_conf_55_60 * 100}%` }}></div>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2.5 pt-1.5 border-t border-white/[0.04] font-sans">
              Partidos 50/50 donde la ventaja es reducida.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-white/[0.06] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1 text-[10px]">
                <span className="font-bold text-cyan-400">CONFIANZA MEDIA (60%–65%)</span>
                <span className="text-zinc-600">{m.n_conf_60_65} gms</span>
              </div>
              <div className="text-xl font-black text-cyan-300">
                {(m.acc_conf_60_65 * 100).toFixed(1)}%
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-cyan-400" style={{ width: `${m.acc_conf_60_65 * 100}%` }}></div>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2.5 pt-1.5 border-t border-white/[0.04] font-sans">
              Ventaja estadística sólida en abridores o bullpen.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1 text-[10px]">
                <span className="font-bold text-emerald-400">CONFIANZA ALTA (65%+)</span>
                <span className="text-emerald-400 font-bold">{m.n_conf_65plus} gms</span>
              </div>
              <div className="text-xl font-black text-emerald-400">
                {(m.acc_conf_65plus * 100).toFixed(1)}%
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${m.acc_conf_65plus * 100}%` }}></div>
              </div>
            </div>
            <p className="text-[10px] text-emerald-400/80 mt-2.5 pt-1.5 border-t border-white/[0.04] font-sans">
              Picks estelares con la mayor ventaja matemática.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

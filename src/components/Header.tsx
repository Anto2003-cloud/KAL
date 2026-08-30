import React from 'react';
import { IntelData } from '../types';

interface HeaderProps {
  activeDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
  activeTab: 'preds' | 'pillars' | 'history' | 'lab';
  onTabChange: (tab: 'preds' | 'pillars' | 'history' | 'lab') => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  intel: IntelData;
  onRunPipeline: () => void;
  isRunningPipeline: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeDate,
  availableDates,
  onDateChange,
  activeTab,
  onTabChange,
  onRunPipeline,
  isRunningPipeline,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#090a0f]/80 backdrop-blur-2xl border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs">
              K
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white">
                KAL Predictor
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-medium">
                MLB
              </span>
            </div>
          </div>

          {/* Navigation Segments */}
          <nav className="hidden md:flex items-center bg-white/[0.04] p-1 rounded-full border border-white/[0.06]">
            {[
              { id: 'preds', label: 'Pronósticos' },
              { id: 'pillars', label: 'Modelo (9 Factores)' },
              { id: 'history', label: 'Historial' },
              { id: 'lab', label: 'Laboratorio' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-black shadow-sm font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {activeTab === 'preds' && (
              <select
                value={activeDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 text-xs font-medium rounded-full px-3 py-1.5 focus:outline-none cursor-pointer transition-colors"
              >
                {availableDates.map((d) => (
                  <option key={d} value={d} className="bg-[#18181b] text-white">
                    {d === '2026-08-30' ? `Hoy (${d})` : d}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={onRunPipeline}
              disabled={isRunningPipeline}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isRunningPipeline
                  ? 'bg-neutral-800 text-neutral-500'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1]'
              }`}
            >
              {isRunningPipeline ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden overflow-x-auto pb-3 gap-1.5 scrollbar-none">
          {[
            { id: 'preds', label: 'Pronósticos' },
            { id: 'pillars', label: 'Modelo' },
            { id: 'history', label: 'Historial' },
            { id: 'lab', label: 'Laboratorio' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as any)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-black font-semibold'
                  : 'bg-white/[0.04] text-neutral-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

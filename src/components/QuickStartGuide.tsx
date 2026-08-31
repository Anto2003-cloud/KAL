import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const QuickStartGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-[#18181b] border border-white/[0.06] rounded-2xl overflow-hidden transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span className="text-xs font-medium text-neutral-200">
            ¿Cómo funciona KAL? (Reglas de uso)
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-3 border-t border-white/[0.04] pt-4 text-xs text-neutral-400 leading-relaxed">
          <p>
            <span className="text-neutral-200 font-medium">1. Singles primero.</span>{' '}
            Prioriza picks HIGH (≥65%). LOW (~50–55%) es análisis, no stake fuerte.
          </p>
          <p>
            <span className="text-neutral-200 font-medium">2. Cuota justa.</span>{' '}
            Cada card muestra la americana/decimal del modelo. Solo hay value si la casa paga más que esa justa.
          </p>
          <p>
            <span className="text-neutral-200 font-medium">3. Parlay 4 = experimento.</span>{' '}
            KAL arma un slip de 4 y mide efectividad. Si sale COIN_FLIP_PARLAY, la probabilidad conjunta es baja (~7–12%); stake chico o no jugar.
          </p>
          <p className="text-neutral-500">
            El récord de partidos sueltos y el de parlays se trackean por separado. Nunca se reescribe una predicción bloqueada.
          </p>
        </div>
      )}
    </div>
  );
};

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
            ¿Cómo funciona KAL? (Explicación en 3 puntos)
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span>{isOpen ? 'Ocultar' : 'Ver guía'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-2 border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-white font-medium block">1. Pronósticos Diarios</span>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              El modelo calcula la probabilidad de victoria para cada partido de la jornada considerando 9 variables clave.
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-white font-medium block">2. Factores de Decisión</span>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Evalúa abridores (28%), bateo (18%), relevistas (16%) y métricas avanzadas de Statcast (14%).
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-white font-medium block">3. Transparencia Total</span>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Cada pronóstico queda sellado antes de empezar el partido con registro inmutable en el historial.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

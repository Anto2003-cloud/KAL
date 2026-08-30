import React from 'react';
import {
  Calendar,
  Cpu,
  TrendingUp,
  FlaskConical,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface WorkflowStepperProps {
  activeTab: 'preds' | 'pillars' | 'history' | 'lab';
  onTabChange: (tab: 'preds' | 'pillars' | 'history' | 'lab') => void;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ activeTab, onTabChange }) => {
  const steps: {
    id: 'preds' | 'pillars' | 'history' | 'lab';
    num: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: 'preds',
      num: '1',
      title: 'Pronósticos de Hoy',
      description: '14 Partidos con ganador proyectado',
      icon: <Calendar className="w-4 h-4 text-neutral-300" />,
      badge: '14 Juegos'
    },
    {
      id: 'pillars',
      num: '2',
      title: 'Cómo Decide la IA',
      description: '9 Factores y simulador en vivo',
      icon: <Cpu className="w-4 h-4 text-neutral-300" />,
      badge: 'Explicado'
    },
    {
      id: 'history',
      num: '3',
      title: 'Historial & Ganancias',
      description: 'Récord 5-0 y +34.8 unidades ganadas',
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
      badge: '+34.8u'
    },
    {
      id: 'lab',
      num: '4',
      title: 'Laboratorio de Modelos',
      description: 'Comparador de algoritmos y métricas',
      icon: <FlaskConical className="w-4 h-4 text-neutral-300" />,
      badge: 'Avanzado'
    },
  ];

  return (
    <div className="bg-[#10131c] border border-white/[0.08] rounded-2xl p-2 shadow-lg font-sans">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {steps.map((step) => {
          const isActive = activeTab === step.id;

          return (
            <button
              key={step.id}
              onClick={() => onTabChange(step.id)}
              className={`p-3 rounded-xl border text-left transition-all duration-200 relative flex flex-col justify-between ${
                isActive
                  ? 'bg-neutral-800/90 border-white/50 shadow-md ring-1 ring-white/[0.08]'
                  : 'bg-[#090b11]/70 border-white/[0.04] hover:border-white/15 hover:bg-neutral-900/60'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-lg text-xs font-bold font-mono flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-white text-black font-black shadow-xs'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {step.num}
                  </div>
                  <span className={`text-xs font-bold tracking-tight ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                    {step.title}
                  </span>
                </div>

                {step.badge && (
                  <span
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-white/[0.1] text-white border border-white/[0.14]'
                        : 'bg-neutral-900 text-neutral-500 border border-white/[0.04]'
                    }`}
                  >
                    {step.badge}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-neutral-400 font-normal leading-relaxed pl-8">
                {step.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

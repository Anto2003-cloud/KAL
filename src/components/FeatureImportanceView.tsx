import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  Shield,
  User,
  MapPin,
  Users,
  Search,
  HelpCircle,
  TrendingUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { FEATURE_IMPORTANCES } from '../data/mlbData';

const FEATURE_EXPLANATIONS: Record<string, {
  what: string;
  why: string;
  example: string;
}> = {
  'away_win_pct': {
    what: 'Porcentaje de victorias del equipo visitante en toda la temporada.',
    why: 'Es el termómetro principal de calidad sostenida de un equipo cuando juega fuera de casa.',
    example: 'Equipos visitantes con win% > .560 ganan el 58% de sus partidos frente a locales por debajo de .450.'
  },
  'home_run_diff': {
    what: 'Diferencial total de carreras del equipo local (Carreras Anotadas menos Carreras Recibidas).',
    why: 'Es mucho más confiable que el récord de victorias/derrotas para medir el verdadero nivel competitivo (Teorema Pitagórico).',
    example: 'Un equipo local con +70 de diferencial gana 6 de cada 10 veces frente a rivales en negativo.'
  },
  'home_rapg': {
    what: 'Promedio de carreras permitidas por juego del equipo local.',
    why: 'Mide la solidez defensiva general y del cuerpo de lanzadores en su propio estadio.',
    example: 'Permitir menos de 3.8 carreras por juego en casa aumenta la probabilidad de victoria en +14%.'
  },
  'rpg_diff': {
    what: 'Diferencia neta en carreras anotadas por juego entre ambos rivales.',
    why: 'Compara la potencia de fuego ofensiva de ambas alineaciones en igualdad de condiciones.',
    example: 'Si un equipo anota 5.2 carreras/juego y su rival 3.9, la IA otorga una ventaja directa.'
  },
  'away_rpg': {
    what: 'Promedio de carreras anotadas por juego del equipo visitante.',
    why: 'Demuestra si la ofensiva visitante es capaz de producir carreras fuera de su estadio habitual.',
    example: 'Ofensivas visitantes con >4.8 carreras/juego neutralizan la ventaja de localía del rival.'
  },
  'run_diff_diff': {
    what: 'Brecha neta de diferencial de carreras entre ambos equipos.',
    why: 'Permite identificar desigualdades marcadas (ej. equipo élite contendiente vs equipo en reconstrucción).',
    example: 'Una brecha de +100 carreras inclina la probabilidad de victoria por encima del 65%.'
  },
  'away_run_diff': {
    what: 'Diferencial total de carreras acumulado por el equipo visitante.',
    why: 'Confirma si el visitante es un equipo genuinamente ganador o si sus victorias han sido por suerte en juegos de 1 carrera.',
    example: 'Visitantes con diferencial positivo tienen una probabilidad de dar la sorpresa un 35% mayor.'
  },
  'away_sp_opp_rpg_l5': {
    what: 'Nivel ofensivo de los últimos 5 rivales que enfrentó el abridor visitante.',
    why: 'Ajusta las estadísticas del pitcher según la dificultad real de los bateadores a los que se midió recientemente.',
    example: 'Un abridor con ERA 3.00 pero que enfrentó ofensivas débiles recibe un ajuste a la baja.'
  },
  'home_sp_gs': {
    what: 'Cantidad de aperturas iniciadas por el lanzador abridor local en la temporada.',
    why: 'Diferencia a abridores estables y consolidados de novatos o relevistas que hacen aperturas de emergencia (openers).',
    example: 'Más de 20 aperturas otorgan una muestra estadística altamente confiable.'
  },
  'park_home_factor': {
    what: 'Factor de estadio específico para el equipo local.',
    why: 'Cada parque de MLB tiene dimensiones y altitud distintas (ej. Coors Field en Colorado produce +30% más carreras).',
    example: 'En parques con factor > 1.100 se favorecen los equipos con bateadores de poder y líneas bajas de pitcheo.'
  },
  'park_factor': {
    what: 'Factor de carreras global del estadio donde se juega el partido.',
    why: 'Afecta directamente el rendimiento esperado de ambos lanzadores y la probabilidad de un juego de muchas carreras.',
    example: 'Un abridor con ERA alto en un estadio favorable a pitchers rinde significativamente mejor.'
  },
  'away_rapg_park_adj': {
    what: 'Carreras permitidas por el visitante ajustadas por la dificultad del estadio.',
    why: 'Elimina las distorsiones creadas por jugar en estadios muy fáciles o difíciles para batear.',
    example: 'Un pitcher de Boston que lanza en Fenway Park se evalúa con su valor real normalizado.'
  },
  'sp_kbb_prev_home': {
    what: 'Relación de ponches por cada base por bola (K/BB) del abridor local.',
    why: 'Es el indicador más puro del dominio y control de un lanzador, independiente de la suerte o la defensa.',
    example: 'Un ratio K/BB superior a 4.0 indica un as de rotación con control quirúrgico.'
  },
  'away_sp_gs': {
    what: 'Cantidad de aperturas del abridor visitante en la temporada.',
    why: 'Garantiza la estabilidad de la rotación y la fiabilidad de las proyecciones del abridor rival.',
    example: 'Menos de 3 aperturas activa alertas de incertidumbre en el cálculo del modelo.'
  },
  'away_rs_l10': {
    what: 'Carreras anotadas por el visitante en sus últimos 10 juegos.',
    why: 'Captura el momento dulce o la racha fría reciente de los maderos del equipo.',
    example: 'Un equipo en racha con >6.0 carreras/juego en los últimos 10 partidos llega con ventaja de ritmo.'
  },
  'home_sp_opp_rpg_l5': {
    what: 'Nivel ofensivo de los rivales recientes del abridor local.',
    why: 'Calibra la efectividad del abridor local contra la calidad de las alineaciones enfrentadas.',
    example: 'Permite evitar trampas estadísticas de lanzadores inflados por calendarios sencillos.'
  },
  'sp_so9_prev_away': {
    what: 'Ponches por cada 9 entradas (K/9) del lanzador visitante.',
    why: 'Los ponches evitan que la pelota entre en juego y reducen drásticamente los errores defensivos.',
    example: 'Abridores con más de 9.5 K/9 tienen un 22% más de probabilidades de salir de situaciones de peligro.'
  },
  'bp_residual_diff': {
    what: 'Diferencia en el rendimiento y frescura de los cuerpos de relevistas (Bullpen).',
    why: 'En el béisbol moderno, los relevistas lanzan más del 40% de los innings de cada juego.',
    example: 'Tener un bullpen de élite descansado asegura ventajas ajustadas de 1 o 2 carreras en los innings finales.'
  },
  'win_pct_diff': {
    what: 'Diferencia directa en porcentaje de victorias entre local y visitante.',
    why: 'Establece la jerarquía general entre ambas franquicias en la tabla de posiciones.',
    example: 'Un diferencial de >.150 en win% coloca al equipo superior como favorito claro.'
  },
  'rapg_diff': {
    what: 'Diferencia en efectividad y carreras permitidas entre ambos staffs de pitcheo.',
    why: 'Compara directamente la capacidad de ambos equipos para evitar carreras rivales.',
    example: 'El equipo con mejor prevención de carreras gana más del 61% de los duelos directos.'
  },
  'sp_kbb_prev_away': {
    what: 'Control y relación K/BB del lanzador abridor visitante.',
    why: 'Los abridores que no regalan boletos obligan al rival a batear para anotar.',
    example: 'Un K/BB < 2.0 indica peligro constante de descontrol y entradas con muchas carreras en contra.'
  },
  'home_bp_residual': {
    what: 'Eficiencia y calidad residual del bullpen del equipo local.',
    why: 'Garantiza que el cerrador y los preparadores puedan asegurar la victoria en la 8va y 9na entrada.',
    example: 'Un bullpen local confiable transforma el 92% de las ventajas tras la 7ma entrada en victorias oficiales.'
  },
  'lineup_ops_diff': {
    what: 'Ventaja en OPS (Porcentaje de embasado + slugging) de la alineación titular del 1 al 9.',
    why: 'Mide la fuerza ofensiva real de los bateadores que estarán en el terreno hoy.',
    example: 'Una ventaja de +.060 en OPS de alineación equivale aproximadamente a +1.2 carreras proyectadas por juego.'
  },
  'form_diff': {
    what: 'Diferencia en victorias durante los últimos 10 partidos disputados.',
    why: 'Detecta inercias ganadoras, rachas positivas y bajones anímicos temporales.',
    example: 'Un equipo con racha 8-2 frente a uno con 2-8 tiene un impulso favorable estadísticamente probado.'
  }
};

export const FeatureImportanceView: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [expandedFeature, setExpandedFeature] = useState<string | null>('away_win_pct');

  const categories = [
    { id: 'all', label: 'Todas (24 Factores)', icon: Layers, count: 24 },
    { id: 'team', label: 'Equipo', icon: Shield, count: 8, share: '38%' },
    { id: 'pitcher', label: 'Pitcheo Abridor', icon: User, count: 9, share: '32%' },
    { id: 'park', label: 'Estadio y Parque', icon: MapPin, count: 3, share: '14%' },
    { id: 'bullpen', label: 'Bullpen', icon: Sparkles, count: 2, share: '10%' },
    { id: 'lineup', label: 'Alineación & OPS', icon: Users, count: 2, share: '6%' },
  ];

  const maxImportance = Math.max(...FEATURE_IMPORTANCES.map(f => f.importance));

  const filteredFeatures = FEATURE_IMPORTANCES.filter(f => {
    const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory;
    const matchesSearch = searchFilter.trim() === '' ||
      f.label_es.toLowerCase().includes(searchFilter.toLowerCase()) ||
      f.feature.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'team': return 'bg-white/[0.06] text-neutral-300 border-white/[0.1]';
      case 'pitcher': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'bullpen': return 'bg-white/[0.06] text-neutral-300 border-white/[0.1]';
      case 'park': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'lineup': return 'bg-white/[0.06] text-neutral-300 border-white/[0.1]';
      default: return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  return (
    <div className="space-y-4 font-mono">
      
      {/* Title Header */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                VARIABLES & ARQUITECTURA DE FEATURES
              </span>
              <span className="text-[9px] font-bold text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded-full border border-white/[0.06]">
                24 FACTORES STATCAST / SABERMETRICS
              </span>
            </div>
            <h2 className="text-base font-black text-white mt-1 tracking-tight">
              Ponderación e Importancia de Factores Predictivos
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed font-sans">
              Antes del inicio de cada partido, el modelo procesa 24 variables pre-partido. Aquí se muestra el peso Gain/Split asignado por los árboles Gradient Boosting.
            </p>
          </div>
        </div>
      </div>

      {/* 5 Pillars */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 shadow-xs">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-neutral-300" />
          5 Categorías de Variables
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          
          <div
            onClick={() => setSelectedCategory('team')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              selectedCategory === 'team'
                ? 'bg-neutral-800 border-white shadow-xs'
                : 'bg-neutral-950 border-white/[0.06] hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <Shield className="w-3.5 h-3.5 text-neutral-300" />
              <span className="text-[10px] font-bold text-neutral-300">38% PESO</span>
            </div>
            <div className="font-bold text-white text-xs">Rendimiento Equipo</div>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-sans">Diferencial de carreras y win%.</p>
          </div>

          <div
            onClick={() => setSelectedCategory('pitcher')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              selectedCategory === 'pitcher'
                ? 'bg-neutral-800 border-white shadow-xs'
                : 'bg-neutral-950 border-white/[0.06] hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400">32% PESO</span>
            </div>
            <div className="font-bold text-white text-xs">Pitcheo Abridor</div>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-sans">ERA, K/9 y control K/BB.</p>
          </div>

          <div
            onClick={() => setSelectedCategory('park')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              selectedCategory === 'park'
                ? 'bg-neutral-800 border-white shadow-xs'
                : 'bg-neutral-950 border-white/[0.06] hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-amber-400">14% PESO</span>
            </div>
            <div className="font-bold text-white text-xs">Estadio y Parque</div>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-sans">Altitud, dimensiones y clima.</p>
          </div>

          <div
            onClick={() => setSelectedCategory('bullpen')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              selectedCategory === 'bullpen'
                ? 'bg-neutral-800 border-white shadow-xs'
                : 'bg-neutral-950 border-white/[0.06] hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
              <span className="text-[10px] font-bold text-neutral-300">10% PESO</span>
            </div>
            <div className="font-bold text-white text-xs">Bullpen & Relevo</div>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-sans">Cierre de juegos (7ma a 9na).</p>
          </div>

          <div
            onClick={() => setSelectedCategory('lineup')}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              selectedCategory === 'lineup'
                ? 'bg-neutral-800 border-white shadow-xs'
                : 'bg-neutral-950 border-white/[0.06] hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <Users className="w-3.5 h-3.5 text-neutral-300" />
              <span className="text-[10px] font-bold text-neutral-300">6% PESO</span>
            </div>
            <div className="font-bold text-white text-xs">Alineación & OPS</div>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-sans">Poder real de los 9 titulares.</p>
          </div>

        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-3.5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          
          <div className="flex flex-wrap gap-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-neutral-800 text-white shadow-xs border border-white/10'
                    : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar variable..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-neutral-950 border border-white/[0.08] rounded-lg pl-8 pr-3 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-white font-mono"
            />
          </div>

        </div>
      </div>

      {/* Variables List */}
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Ranking de Variables Explicadas
            </h3>
            <p className="text-[10px] text-neutral-500 font-sans">
              Haz clic en cualquier variable para ver su definición y su impacto en el modelo.
            </p>
          </div>
          <span className="text-[10px] text-neutral-500">
            {filteredFeatures.length} variables
          </span>
        </div>

        <div className="space-y-2">
          {filteredFeatures.map((item, idx) => {
            const pct = (item.importance / maxImportance) * 100;
            const isExpanded = expandedFeature === item.feature;
            const explanation = FEATURE_EXPLANATIONS[item.feature] || {
              what: 'Métrica estadística calculada para evaluar el rendimiento histórico de este factor.',
              why: 'Aporta información para afinar el porcentaje de probabilidad del ganador.',
              example: 'Valores superiores favorecen al equipo con mejor récord en esta categoría.'
            };

            return (
              <div
                key={item.feature}
                onClick={() => setExpandedFeature(isExpanded ? null : item.feature)}
                className={`rounded-xl border transition-all cursor-pointer ${
                  isExpanded
                    ? 'bg-neutral-950 border-white/[0.14] shadow-xs'
                    : 'bg-neutral-950 border-white/[0.04] hover:border-white/10'
                }`}
              >
                <div className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded bg-neutral-900 flex items-center justify-center text-[10px] font-bold text-neutral-400 shrink-0 border border-white/[0.04]">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {item.label_es}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5 font-sans">
                          {explanation.what}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${getCategoryBadge(item.category)}`}>
                        {item.category.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold text-white bg-neutral-900 border border-white/10 px-2 py-0.2 rounded">
                        {item.importance}
                      </span>
                      <button className="text-neutral-500 p-0.5">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-neutral-300" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                  </div>

                  <div className="h-1 bg-neutral-900 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/[0.06] bg-neutral-950 text-xs space-y-2 animate-in fade-in duration-150 font-sans">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5">
                      <div className="p-2.5 bg-neutral-900 rounded-lg border border-white/[0.04]">
                        <div className="font-bold text-white flex items-center gap-1 mb-1 text-xs">
                          <HelpCircle className="w-3 h-3 text-neutral-300" /> Impacto en KAL:
                        </div>
                        <p className="text-neutral-400 text-[11px] leading-relaxed">
                          {explanation.why}
                        </p>
                      </div>

                      <div className="p-2.5 bg-neutral-900 rounded-lg border border-white/[0.04]">
                        <div className="font-bold text-emerald-400 flex items-center gap-1 mb-1 text-xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Caso Real:
                        </div>
                        <p className="text-neutral-400 text-[11px] leading-relaxed">
                          {explanation.example}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

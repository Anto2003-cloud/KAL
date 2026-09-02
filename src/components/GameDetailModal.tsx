import React, { useMemo } from 'react';
import { X, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, ShieldAlert, Database, Info } from 'lucide-react';
import { GamePrediction, FactorBreakdown, PillarDetail } from '../types';
import { TEAMS_META } from '../data/mlbData';
import { TeamLogo } from './TeamLogo';

interface GameDetailModalProps {
  prediction: GamePrediction | null;
  onClose: () => void;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '' || String(v) === 'nan' || String(v) === 'NaN') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (v: unknown, digits = 2) => {
  const n = num(v);
  return n === null ? 'No disponible' : n.toFixed(digits);
};

const pct = (v: unknown, digits = 1) => {
  const n = num(v);
  if (n === null) return 'No disponible';
  return `${(n * 100).toFixed(digits)}%`;
};

const sideName = (p: GamePrediction, side: 'home' | 'away') => {
  const abbr = side === 'home' ? p.home : p.away;
  return TEAMS_META[abbr]?.name || abbr;
};

const directionLabel = (favors: string | undefined, home: string, away: string) => {
  if (favors === 'HOME') return home;
  if (favors === 'AWAY') return away;
  return 'Neutral';
};

const splitExplanation = (exp?: string) => {
  const lines = String(exp || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    factors: lines.find((x) => x.startsWith('Factores a favor')) || '',
    risks: lines.find((x) => x.startsWith('Riesgos:')) || '',
    lineup: lines.filter((x) => x.startsWith('Lineup ')),
    park: lines.find((x) => x.startsWith('Parque:')) || '',
    phase: lines.find((x) => x.startsWith('📅') || x.startsWith('🏆')) || '',
  };
};

const Metric = ({ label, home, away, homeName, awayName, lowerIsBetter = false }: {
  label: string;
  home: unknown;
  away: unknown;
  homeName: string;
  awayName: string;
  lowerIsBetter?: boolean;
}) => {
  const h = num(home);
  const a = num(away);
  const available = h !== null && a !== null;
  let winner: 'home' | 'away' | 'neutral' = 'neutral';
  if (available && h !== a) {
    winner = lowerIsBetter ? (h < a ? 'home' : 'away') : (h > a ? 'home' : 'away');
  }
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">{label}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
        <div className={`min-w-0 ${winner === 'away' ? 'text-neutral-500' : 'text-white'}`}>
          <div className="truncate text-[10px] text-neutral-500">{awayName}</div>
          <div className="font-semibold">{fmt(away)}</div>
        </div>
        <div className="text-neutral-700">vs</div>
        <div className={`min-w-0 text-right ${winner === 'home' ? 'text-white' : 'text-neutral-500'}`}>
          <div className="truncate text-[10px] text-neutral-500">{homeName}</div>
          <div className="font-semibold">{fmt(home)}</div>
        </div>
      </div>
      <div className="mt-2 text-[10px]">
        {!available ? <span className="text-neutral-600">Dato no disponible para esta predicción</span> :
          winner === 'neutral' ? <span className="text-neutral-500">Empate estadístico</span> :
            <span className="text-emerald-400">Ventaja: {winner === 'home' ? homeName : awayName}</span>}
      </div>
    </div>
  );
};

const PillarCard = ({ pillar, home, away }: { pillar: PillarDetail; home: string; away: string }) => {
  const color = pillar.favors === 'HOME' ? 'text-emerald-400' : pillar.favors === 'AWAY' ? 'text-amber-400' : 'text-neutral-500';
  const Icon = pillar.favors === 'NEUTRAL' ? Info : pillar.favors === 'HOME' ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">{pillar.name}</div>
          <div className="text-[10px] text-neutral-600 mt-0.5">Peso {pillar.weight_pct}%</div>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-semibold ${color}`}>
          <Icon className="w-3 h-3" /> {directionLabel(pillar.favors, home, away)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-lg bg-black/20 p-2"><div className="text-[9px] text-neutral-600">{away}</div><div className="text-[11px] text-neutral-300 mt-0.5">{pillar.away_metric_display}</div></div>
        <div className="rounded-lg bg-black/20 p-2"><div className="text-[9px] text-neutral-600">{home}</div><div className="text-[11px] text-neutral-300 mt-0.5">{pillar.home_metric_display}</div></div>
      </div>
      {pillar.insight && <div className="mt-2.5 text-[10px] leading-relaxed text-neutral-400">{pillar.insight}</div>}
    </div>
  );
};

export const GameDetailModal: React.FC<GameDetailModalProps> = ({ prediction, onClose }) => {
  if (!prediction) return null;

  const p = prediction;
  const homeMeta = TEAMS_META[p.home] || { name: p.home, city: p.home, primaryColor: '#000000' };
  const awayMeta = TEAMS_META[p.away] || { name: p.away, city: p.away, primaryColor: '#000000' };
  const isHomeWinner = p.winner === p.home;
  const winnerProb = isHomeWinner ? p.home_p : p.away_p;
  const opponentProb = 1 - winnerProb;
  const edge = Math.abs(winnerProb - opponentProb);
  const parsed = useMemo(() => splitExplanation(p.exp), [p.exp]);

  const factors = (p.explanation_breakdown || []) as FactorBreakdown[];
  const positiveFactors = factors.filter((f) => f.favors === (isHomeWinner ? 'HOME' : 'AWAY')).slice(0, 8);
  const opposingFactors = factors.filter((f) => f.favors !== 'NEUTRAL' && f.favors !== (isHomeWinner ? 'HOME' : 'AWAY')).slice(0, 6);
  const pillars = p.nine_pillars ? Object.values(p.nine_pillars) : [];
  const quality = num(p.data_quality_score);
  const risks = p.risks?.length ? p.risks : parsed.risks ? [parsed.risks.replace(/^Riesgos:\s*/i, '')] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#18181b] border border-white/[0.1] rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col text-neutral-100 font-sans" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 sm:p-6 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#18181b]/95 backdrop-blur-md z-20">
          <div className="flex items-center gap-3 min-w-0">
            <TeamLogo abbr={p.away} size="sm" />
            <span className="text-sm font-medium text-neutral-500">@</span>
            <TeamLogo abbr={p.home} size="sm" />
            <div className="min-w-0 ml-1"><h2 className="text-lg font-semibold text-white tracking-tight truncate">{awayMeta.name} vs {homeMeta.name}</h2><div className="text-[10px] text-neutral-500 mt-0.5">Análisis pre-game · {p.model_version || 'modelo activo'}</div></div>
          </div>
          <button onClick={onClose} className="w-9 h-9 shrink-0 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-neutral-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Decision */}
          <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4"><TeamLogo abbr={p.winner} size="lg" /><div><span className="text-[10px] uppercase tracking-wider text-neutral-500">Selección de KAL</span><div className="text-2xl font-semibold text-white mt-1">{isHomeWinner ? homeMeta.name : awayMeta.name}</div><div className="text-xs text-neutral-400 mt-1">{(winnerProb * 100).toFixed(1)}% vs {(opponentProb * 100).toFixed(1)}% · edge {edge * 100 >= 0 ? (edge * 100).toFixed(1) : '0.0'} pp</div></div></div>
              <div className="flex gap-2 flex-wrap sm:justify-end"><span className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${p.conf === 'HIGH' ? 'bg-emerald-500/15 text-emerald-400' : p.conf === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.06] text-neutral-400'}`}>{p.conf}</span>{quality !== null && <span className="px-3 py-1.5 rounded-full bg-white/[0.05] text-[10px] text-neutral-400">Datos {quality.toFixed(0)}/{num((p.data_quality as any)?.max) ?? 0}</span>}</div>
            </div>
            {p.conf === 'LOW' && <div className="mt-4 flex gap-2 rounded-xl bg-amber-500/[0.07] border border-amber-500/10 p-3 text-[11px] text-amber-200/80"><AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" /><span>La ventaja es pequeña. Esta pantalla muestra las razones y también los factores que contradicen la selección; una probabilidad no equivale a certeza.</span></div>}
          </div>

          {/* Why this pick */}
          <section>
            <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">Por qué KAL elige {isHomeWinner ? homeMeta.name : awayMeta.name}</h3></div>
            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.035] p-4 sm:p-5">
              {positiveFactors.length ? <div className="space-y-2">{positiveFactors.map((f, i) => <div key={`${f.feature}-${i}`} className="flex items-start gap-3 text-[11px]"><span className="text-emerald-400 font-bold">+{i + 1}</span><div><span className="text-white font-medium">{f.label}</span><span className="text-neutral-500"> · {f.description}</span></div></div>)}</div> : parsed.factors ? <div className="text-[11px] text-neutral-300 leading-relaxed">{parsed.factors.replace(/^Factores a favor del pick \/ contexto:\s*/i, '')}</div> : <div className="text-[11px] text-neutral-500">No hay desglose de contribuciones disponible para esta predicción. KAL no debe inventar una razón que no esté respaldada por sus datos.</div>}
            </div>
          </section>

          {/* Starter comparison */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">Abridores · comparación real</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.05]"><div className="text-[10px] text-neutral-500 uppercase tracking-wider">Visitante · {p.away_sp}</div><div className="text-xs text-white mt-2">ERA {fmt(p.away_starter_era)} · FIP {fmt(p.away_starter_fip)} · K/9 {fmt(p.away_starter_k9)}</div></div>
              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.05]"><div className="text-[10px] text-neutral-500 uppercase tracking-wider">Local · {p.home_sp}</div><div className="text-xs text-white mt-2">ERA {fmt(p.home_starter_era)} · FIP {fmt(p.home_starter_fip)} · K/9 {fmt(p.home_starter_k9)}</div></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Metric label="ERA temporada previa" away={p.away_starter_era} home={p.home_starter_era} awayName={awayMeta.name} homeName={homeMeta.name} lowerIsBetter />
              <Metric label="FIP temporada previa" away={p.away_starter_fip} home={p.home_starter_fip} awayName={awayMeta.name} homeName={homeMeta.name} lowerIsBetter />
              <Metric label="K/9" away={p.away_starter_k9} home={p.home_starter_k9} awayName={awayMeta.name} homeName={homeMeta.name} />
              <Metric label="WHIP" away={(p as any).away_starter_whip} home={(p as any).home_starter_whip} awayName={awayMeta.name} homeName={homeMeta.name} lowerIsBetter />
            </div>
            <div className="mt-3 text-[10px] text-neutral-600 flex gap-2"><Database className="w-3 h-3" /> Si una métrica aparece como no disponible, KAL no la utiliza para justificar la elección.</div>
          </section>

          {/* Offensive / bullpen / context */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">Equipo, ataque y bullpen</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Metric label="OPS últimos 30 días" away={p.away_ops_30d} home={p.home_ops_30d} awayName={awayMeta.name} homeName={homeMeta.name} />
              <Metric label="ERA bullpen" away={p.away_bullpen_era} home={p.home_bullpen_era} awayName={awayMeta.name} homeName={homeMeta.name} lowerIsBetter />
              <Metric label="Win% temporada" away={(p as any).away_win_pct} home={(p as any).home_win_pct} awayName={awayMeta.name} homeName={homeMeta.name} />
              <Metric label="Run differential" away={(p as any).away_run_diff} home={(p as any).home_run_diff} awayName={awayMeta.name} homeName={homeMeta.name} />
            </div>
          </section>

          {/* Contradicting factors / risks */}
          <section>
            <div className="flex items-center gap-2 mb-3"><ShieldAlert className="w-4 h-4 text-amber-400" /><h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">Lo que podría hacer fallar la elección</h3></div>
            <div className="rounded-2xl border border-amber-500/10 bg-amber-500/[0.025] p-4">
              {opposingFactors.length ? <div className="space-y-2">{opposingFactors.map((f, i) => <div key={`${f.feature}-${i}`} className="text-[11px] text-neutral-400"><span className="text-amber-400 font-semibold">−</span> <span className="text-neutral-200">{f.label}</span> · {f.description}</div>)}</div> : risks.length ? <div className="space-y-2">{risks.map((r, i) => <div key={i} className="text-[11px] text-neutral-400"><span className="text-amber-400">⚠</span> {r}</div>)}</div> : <div className="text-[11px] text-neutral-500">No se registraron riesgos adicionales en esta predicción.</div>}
            </div>
          </section>

          {/* Nine pillars if available */}
          {pillars.length > 0 && <section><h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">9 pilares de KAL</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{pillars.map((pillar, i) => <PillarCard key={`${pillar.category}-${i}`} pillar={pillar} home={homeMeta.name} away={awayMeta.name} />)}</div></section>}

          {/* Existing explanation + lineups */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">Contexto pre-game</h3>
            <div className="grid grid-cols-1 gap-2">
              {parsed.park && <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-[11px] text-neutral-400">{parsed.park}</div>}
              {parsed.phase && <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-[11px] text-neutral-400">{parsed.phase}</div>}
              {parsed.lineup.map((l, i) => <div key={i} className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-[11px] text-neutral-400">{l}</div>)}
              {!parsed.park && !parsed.phase && !parsed.lineup.length && <div className="text-[11px] text-neutral-600">Sin contexto adicional registrado.</div>}
            </div>
          </section>

          {/* Data quality */}
          <div className="rounded-xl border border-white/[0.05] bg-black/20 p-3.5 flex items-start gap-3"><Database className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" /><div className="text-[10px] text-neutral-500 leading-relaxed"><span className="text-neutral-300 font-medium">Calidad de datos:</span> KAL debe distinguir entre datos confirmados, proyectados y ausentes. Los datos faltantes no se presentan como evidencia positiva. {p.home_lineup_status || p.away_lineup_status ? `Lineups: ${p.home_lineup_status || 'n/d'} / ${p.away_lineup_status || 'n/d'}.` : ''}</div></div>
        </div>
      </div>
    </div>
  );
};

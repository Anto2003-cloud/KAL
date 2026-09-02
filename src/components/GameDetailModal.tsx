import React from 'react';
import { X } from 'lucide-react';
import { GamePrediction } from '../types';
import { TEAMS_META } from '../data/mlbData';
import { TeamLogo } from './TeamLogo';

interface GameDetailModalProps {
  prediction: GamePrediction | null;
  onClose: () => void;
}

/** Parsea el texto de explicación del API en bloques legibles. */
function parseExplanation(exp: string) {
  const lines = (exp || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const risks: string[] = [];
  const factors: string[] = [];
  const lineups: string[] = [];
  const other: string[] = [];
  let header = '';
  let starters = '';
  let era = '';
  let park = '';
  for (const line of lines) {
    if (line.startsWith('PREDICCIÓN:')) header = line;
    else if (line.startsWith('Abridor:')) starters = line.replace(/^Abridor:\s*/, '');
    else if (line.includes('ERA')) era = line.replace(/^\s*/, '');
    else if (line.startsWith('Parque:') || line.toLowerCase().includes('park factor')) park = line;
    else if (line.startsWith('⚠️') || line.toLowerCase().includes('ventaja estadística'))
      risks.push(line);
    else if (line.startsWith('Riesgos:')) risks.push(line.replace(/^Riesgos:\s*/, ''));
    else if (line.startsWith('Lineup') || line.startsWith('📋')) lineups.push(line);
    else if (line.startsWith('Factores'))
      factors.push(line.replace(/^Factores[^:]*:\s*/i, ''));
    else if (line.startsWith('•') || line.startsWith('→') || line.startsWith('✓') || line.startsWith('⚡') || line.includes('IMPORTANTE') || line.includes('Edge vs') || line.includes('Resumen:'))
      factors.push(line.replace(/^•\s*/, ''));
    else if (line.includes('win%') || line.includes('Forma') || line.includes('OPS') || line.includes('Bullpen') || line.includes('lesiones') || line.includes('Quality starts'))
      factors.push(line);
    else if (line.startsWith('📉')) factors.push(line);
    else other.push(line);
  }
  return { header, starters, era, park, risks, factors, lineups, other };
}

export const GameDetailModal: React.FC<GameDetailModalProps> = ({ prediction, onClose }) => {
  if (!prediction) return null;

  const p = prediction;
  const homeMeta = TEAMS_META[p.home] || { name: p.home, city: p.home };
  const awayMeta = TEAMS_META[p.away] || { name: p.away, city: p.away };
  const isHomeWinner = p.winner === p.home;
  const winnerProb = isHomeWinner ? p.home_p : p.away_p;
  const loserProb = isHomeWinner ? p.away_p : p.home_p;
  const winnerMeta = isHomeWinner ? homeMeta : awayMeta;
  const loserMeta = isHomeWinner ? awayMeta : homeMeta;
  const blocks = parseExplanation(p.explanation || (p as any).exp || '');
  const dq = (p as any).data_quality_score;
  const conf = p.conf;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-[#18181b] border border-white/[0.1] rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl flex flex-col text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#18181b]/95 z-10">
          <div className="flex items-center gap-3">
            <TeamLogo abbr={p.away} size="sm" />
            <span className="text-sm text-neutral-400">@</span>
            <TeamLogo abbr={p.home} size="sm" />
            <h2 className="text-lg font-semibold text-white ml-1">
              {awayMeta.name} @ {homeMeta.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-neutral-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Pick */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <TeamLogo abbr={p.winner} size="lg" />
              <div>
                <span className="text-[11px] text-neutral-400 block">Pick del modelo</span>
                <div className="text-xl font-semibold text-white">{winnerMeta.name}</div>
                <div className="text-sm text-neutral-300">
                  {(winnerProb * 100).toFixed(1)}% vs {(loserProb * 100).toFixed(1)}% {loserMeta.name}
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  conf === 'HIGH'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : conf === 'MEDIUM'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-neutral-500/20 text-neutral-400'
                }`}
              >
                {conf}
              </span>
              {dq != null && (
                <div className="text-[10px] text-neutral-500">Calidad datos {dq}/7</div>
              )}
            </div>
          </div>

          {conf === 'LOW' && (
            <div className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              Pick marginal (LOW). No hay ventaja grande; úsalo con poca stake o pasa.
            </div>
          )}

          {/* Abridores — datos reales del API */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              Abridores (dato del modelo)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="text-[10px] text-neutral-500">{awayMeta.name} (visitante)</div>
                <div className="font-medium text-white">{p.away_sp || '—'}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="text-[10px] text-neutral-500">{homeMeta.name} (local)</div>
                <div className="font-medium text-white">{p.home_sp || '—'}</div>
              </div>
            </div>
            {blocks.starters && (
              <p className="text-xs text-neutral-400 mt-2">{blocks.starters}</p>
            )}
            {blocks.era && <p className="text-xs text-neutral-300 mt-1 font-mono">{blocks.era}</p>}
            <p className="text-[10px] text-neutral-600 mt-2">
              Si el ERA del abridor del pick es peor, el modelo se apoyó en otros factores (forma, bullpen,
              lesiones, parque, lineup). Revisa el bloque de abajo.
            </p>
          </div>

          {blocks.park && (
            <div className="text-xs text-neutral-300">
              <span className="text-neutral-500">Parque: </span>
              {blocks.park}
            </div>
          )}

          {/* Factores reales */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              Por qué este pick
            </h3>
            {blocks.factors.length ? (
              <ul className="space-y-1.5 text-sm text-neutral-200">
                {blocks.factors.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={f.includes('IMPORTANTE') || f.includes('⚡') ? 'text-amber-400' : 'text-emerald-500'}>•</span>
                    <span className={f.includes('IMPORTANTE') || f.includes('⚡') ? 'text-amber-200 font-medium' : ''}>{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400">
                Partido muy equilibrado: el modelo no encontró un factor dominante (win%, forma y abridores
                similares).
              </p>
            )}
            {blocks.other.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-neutral-400">
                {blocks.other.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Lineups */}
          {blocks.lineups.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                Lineups
              </h3>
              <ul className="text-xs text-neutral-300 space-y-1">
                {blocks.lineups.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Riesgos */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              Riesgos / honestidad
            </h3>
            {blocks.risks.length ? (
              <ul className="space-y-1 text-xs text-rose-300/90">
                {blocks.risks.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-neutral-500">Sin riesgos extra listados por el modelo.</p>
            )}
          </div>

          {/* Full raw for power users */}
          <details className="text-[11px] text-neutral-500">
            <summary className="cursor-pointer text-neutral-400">Ver explicación completa del API</summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-neutral-400 bg-black/30 p-3 rounded-xl max-h-48 overflow-y-auto">
              {p.explanation || (p as any).exp || '—'}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
};

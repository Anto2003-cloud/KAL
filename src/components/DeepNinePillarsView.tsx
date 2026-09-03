import React, { useMemo, useState, useEffect } from 'react';
import { SAMPLE_NINE_PILLARS_GAMES } from '../data/ninePillarsData';
import { PillarCategory } from '../types';
import { TabIntro } from './TabIntro';
import { fetchLivePreds } from '../data/liveApi';
import { todayVE, formatDateTimeVE } from '../utils/timeVE';
import { TeamLogo } from './TeamLogo';

const PILLAR_ORDER: PillarCategory[] = [
  'pitcher', 'batters', 'bullpen', 'injuries', 'lineup', 'statcast', 'matchup', 'park', 'weather',
];

const PILLAR_WHY: Record<string, string> = {
  pitcher: 'Calidad del abridor (ERA, FIP, K)',
  batters: 'Forma ofensiva reciente',
  bullpen: 'Relevo y fatiga',
  injuries: 'Bajas en IL',
  lineup: 'Orden de bateo',
  statcast: 'Contacto de calidad (EV, barrel)',
  matchup: 'Mano vs pitcheo',
  park: 'Estadio',
  weather: 'Clima',
};

type LiveRow = {
  game_pk: number;
  home: string;
  away: string;
  winner: string;
  home_p: number;
  away_p: number;
  conf: string;
  home_sp: string;
  away_sp: string;
  venue_name?: string;
  game_datetime?: string;
  explanation?: string;
  market_pick_american?: number;
  market_book?: string;
};

export const DeepNinePillarsView: React.FC = () => {
  const sampleGames = useMemo(() => Object.entries(SAMPLE_NINE_PILLARS_GAMES), []);
  const [selectedPk] = useState(sampleGames[0]?.[0] || '');
  const selected = SAMPLE_NINE_PILLARS_GAMES[Number(selectedPk)] || sampleGames[0]?.[1];
  const [live, setLive] = useState<LiveRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchLivePreds(todayVE());
        if (cancelled || !rows) return;
        setLive(
          rows.map((r: any) => ({
            game_pk: r.game_pk,
            home: r.home,
            away: r.away,
            winner: r.winner,
            home_p: r.home_p,
            away_p: r.away_p,
            conf: r.conf,
            home_sp: r.home_sp || r.home_starter_name || 'TBD',
            away_sp: r.away_sp || r.away_starter_name || 'TBD',
            venue_name: r.venue_name,
            game_datetime: r.game_datetime,
            explanation: r.exp || r.explanation,
            market_pick_american: r.market_pick_american,
            market_book: r.market_book,
          }))
        );
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const pillars = selected
    ? PILLAR_ORDER.map((k) => selected.pillars[k]).filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-neutral-400">
        <strong className="text-neutral-200">Factores</strong> = metodología + partidos de hoy (abridores, cuota, explicación del API).
        Lesiones/bullpen detallados mejoran cuando Railway rellena IL y lineups.
      </div>

      <TabIntro
        title="Cómo decide KAL (9 factores)"
        subtitle="Pesos orientativos. El % de cada partido sale del modelo en Pronósticos."
        bullets={['Abridor ~28%', 'Ofensiva ~18%', 'Bullpen ~16%', 'Resto: lesiones, lineup, parque, clima…']}
      />

      <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05] flex justify-between">
          <span className="text-xs font-semibold text-neutral-200">Partidos de hoy (vivo)</span>
          <span className="text-[10px] text-neutral-500">{live.length ? `${live.length} juegos` : 'Cargando…'}</span>
        </div>
        {live.length === 0 ? (
          <p className="p-4 text-xs text-neutral-500">Sin predicciones vivas. Revisa Modo vivo en Pronósticos.</p>
        ) : (
          <ul className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
            {live.map((g) => (
              <li key={g.game_pk} className="px-4 py-3 text-xs">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <TeamLogo abbr={g.away} size="sm" />
                  <span className="text-neutral-400">@</span>
                  <TeamLogo abbr={g.home} size="sm" />
                  <span className="text-white font-medium ml-1">{g.away} @ {g.home}</span>
                  <span className="ml-auto text-neutral-300">
                    Pick {g.winner} {(Math.max(g.home_p, g.away_p) * 100).toFixed(0)}% · {g.conf}
                  </span>
                </div>
                <div className="text-neutral-500">
                  {formatDateTimeVE(g.game_datetime)} · {g.away_sp} vs {g.home_sp}
                  {g.venue_name ? ` · ${g.venue_name}` : ''}
                  {g.market_pick_american != null
                    ? ` · cuota ${g.market_pick_american > 0 ? '+' : ''}${g.market_pick_american}${g.market_book ? ` ${g.market_book}` : ''}`
                    : ''}
                </div>
                {g.explanation && (
                  <p className="mt-1.5 text-neutral-400 line-clamp-3 whitespace-pre-line">{g.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4 space-y-3">
          <div className="text-xs text-neutral-400">Pesos ilustrativos (metodología)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pillars.map((p: any) => (
              <div key={p.category || p.name} className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
                <div className="text-[11px] text-neutral-500">{PILLAR_WHY[p.category] || p.name}</div>
                <div className="text-sm text-white mt-0.5">{p.name || p.category}</div>
                {p.weight != null && (
                  <div className="text-[10px] text-neutral-500 mt-1">~{(Number(p.weight) * 100).toFixed(0)}%</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

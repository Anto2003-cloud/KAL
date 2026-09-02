import React from 'react';
import { GamePrediction } from '../types';
import { TEAMS_META } from '../data/mlbData';
import { TeamLogo } from './TeamLogo';
import { generatePitcherVsTeamStats } from '../utils/pitcherVsOpponentHelper';
import { ChevronRight } from 'lucide-react';
import { valueForPick, type MarketLine } from '../utils/marketOdds';
import { decimalToAmerican } from '../utils/fairOdds';

interface PredictionCardProps {
  prediction: GamePrediction;
  onSelect: (prediction: GamePrediction) => void;
  marketLine?: MarketLine | null;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction, onSelect, marketLine }) => {
  const p = prediction;
  const homeMeta = TEAMS_META[p.home] || { name: p.home, city: p.home, primaryColor: '#000000' };
  const awayMeta = TEAMS_META[p.away] || { name: p.away, city: p.away, primaryColor: '#000000' };

  const isHomeWinner = p.winner === p.home;
  const winnerProb = isHomeWinner ? p.home_p : p.away_p;
  const isHighConfidence = p.conf === 'HIGH' || winnerProb >= 0.65;
  const edgeNote =
    winnerProb < 0.55
      ? 'Edge bajo · coin flip'
      : winnerProb < 0.60
        ? 'Edge moderado'
        : 'Edge fuerte';

  const dqScore = typeof (p as any).data_quality_score === 'number' ? (p as any).data_quality_score : null;
  const value = valueForPick(p.winner, p.home, p.away, p.home_p, p.away_p, marketLine || null);
  const dqLabel =
    dqScore == null
      ? null
      : dqScore >= 5
        ? 'Datos OK'
        : dqScore >= 3
          ? 'Datos parciales'
          : 'Datos incompletos';

  // Pitcher vs Opponent Team Analysis
  const awayPitcherVsHome = generatePitcherVsTeamStats(p.away_sp, p.home, false);
  const homePitcherVsAway = generatePitcherVsTeamStats(p.home_sp, p.away, true);

  return (
    <div
      onClick={() => onSelect(p)}
      className="group relative bg-[#18181b] hover:bg-[#202024] rounded-2xl p-5 transition-all duration-300 cursor-pointer border border-white/[0.06] hover:border-white/[0.14] flex flex-col justify-between"
    >
      <div>
        {/* Top bar: Time & Venue */}
        <div className="flex items-center justify-between text-xs text-neutral-400 mb-4 pb-3 border-b border-white/[0.04]">
          <span className="font-medium text-neutral-300">{p.game_time || '19:05 ET'}</span>
          <span className="truncate max-w-[170px] text-[11px] text-neutral-500">{p.venue_name}</span>
        </div>

        {/* Teams Matchup */}
        <div className="space-y-2.5">
          {/* Away Team */}
          <div
            className={`flex items-center justify-between p-3 rounded-xl transition-all ${
              !isHomeWinner
                ? 'bg-white/[0.06] text-white font-semibold'
                : 'text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <TeamLogo abbr={p.away} size="md" />
              <div className="min-w-0">
                <div className="text-sm truncate flex items-center gap-2">
                  <span className={!isHomeWinner ? 'text-white font-semibold' : 'text-neutral-300'}>
                    {awayMeta.name}
                  </span>
                  {!isHomeWinner && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white text-black shrink-0">
                      Pick
                    </span>
                  )}
                </div>
                {/* Pitcher + H2H against opponent */}
                <div className="text-[11px] text-neutral-400 truncate mt-0.5 flex items-center gap-1.5">
                  <span className="text-neutral-300 font-medium">{p.away_sp}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-neutral-400">{awayPitcherVsHome.era.toFixed(2)} ERA vs {p.home}</span>
                </div>
              </div>
            </div>

            <div className="text-right pl-3 shrink-0">
              <span className={`text-base font-semibold ${!isHomeWinner ? 'text-white' : 'text-neutral-500'}`}>
                {(p.away_p * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Home Team */}
          <div
            className={`flex items-center justify-between p-3 rounded-xl transition-all ${
              isHomeWinner
                ? 'bg-white/[0.06] text-white font-semibold'
                : 'text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <TeamLogo abbr={p.home} size="md" />
              <div className="min-w-0">
                <div className="text-sm truncate flex items-center gap-2">
                  <span className={isHomeWinner ? 'text-white font-semibold' : 'text-neutral-300'}>
                    {homeMeta.name}
                  </span>
                  {isHomeWinner && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white text-black shrink-0">
                      Pick
                    </span>
                  )}
                </div>
                {/* Pitcher + H2H against opponent */}
                <div className="text-[11px] text-neutral-400 truncate mt-0.5 flex items-center gap-1.5">
                  <span className="text-neutral-300 font-medium">{p.home_sp}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-neutral-400">{homePitcherVsAway.era.toFixed(2)} ERA vs {p.away}</span>
                </div>
              </div>
            </div>

            <div className="text-right pl-3 shrink-0">
              <span className={`text-base font-semibold ${isHomeWinner ? 'text-white' : 'text-neutral-500'}`}>
                {(p.home_p * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Minimal Progress Bar */}
        <div className="mt-4 pt-1">
          <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-500 ${!isHomeWinner ? 'bg-white' : 'bg-neutral-700'}`}
              style={{ width: `${p.away_p * 100}%` }}
            />
            <div
              className={`h-full transition-all duration-500 ${isHomeWinner ? 'bg-white' : 'bg-neutral-700'}`}
              style={{ width: `${p.home_p * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer: cuota casa + confidence */}
      <div className="mt-4 pt-3 border-t border-white/[0.04] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] text-neutral-500">Cuota casa (moneyline)</span>
          <span className="font-mono text-[11px] text-neutral-200">
            {value.market_decimal
              ? `${decimalToAmerican(value.market_decimal)}${marketLine?.book ? ` · ${marketLine.book}` : ''}`
              : '— sin línea de casa'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] text-neutral-500">Value vs casa</span>
          <span className={`text-[11px] font-medium ${value.has_value ? 'text-emerald-400' : 'text-neutral-400'}`}>
            {value.market_decimal ? value.label : 'Esperando cuota de casa'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {isHighConfidence ? (
              <span className="text-[11px] text-emerald-400 font-medium">Alta probabilidad</span>
            ) : (
              <span className={`text-[11px] font-medium ${winnerProb < 0.55 ? 'text-rose-400/90' : 'text-amber-400/90'}`}>
                {edgeNote}
              </span>
            )}
            <span className="text-[10px] text-neutral-600">{p.conf}</span>
            {dqLabel && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  dqScore! >= 5
                    ? 'text-emerald-400/90 bg-emerald-500/10'
                    : dqScore! >= 3
                      ? 'text-amber-400/90 bg-amber-500/10'
                      : 'text-rose-400/90 bg-rose-500/10'
                }`}
              >
                {dqLabel}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-neutral-400 group-hover:text-white flex items-center gap-1 transition-colors">
            Detalles
            <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
          </span>
        </div>
      </div>
    </div>
  );
};

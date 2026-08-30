import { PitcherVsTeamStats } from '../types';

export function generatePitcherVsTeamStats(pitcherName: string, opponentTeam: string, isHome: boolean): PitcherVsTeamStats {
  const seedStr = `${pitcherName}-${opponentTeam}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  const careerStarts = (absHash % 7) + 2; // 2 to 8 starts
  const baseEra = 2.70 + ((absHash % 320) / 100); // 2.70 to 5.90 ERA
  const whip = 1.05 + ((absHash % 50) / 100); // 1.05 to 1.55 WHIP
  const strikeoutRate = 18.0 + (absHash % 16); // 18% to 34% K%
  const opponentsAvg = 0.200 + ((absHash % 90) / 1000); // .200 to .290 BAA
  const opsAgainst = 0.580 + ((absHash % 240) / 1000); // .580 to .820 OPS

  let edgeScore = 0;
  let advantageSummary = '';

  if (baseEra <= 3.20 && opsAgainst <= 0.650) {
    edgeScore = 7.5 + (absHash % 25) / 10;
    advantageSummary = `Dominio histórico vs ${opponentTeam}: Limita a los bateadores rivales a .${Math.round(opponentsAvg * 1000)} AVG con ${strikeoutRate.toFixed(1)}% K%.`;
  } else if (baseEra <= 3.90 && opsAgainst <= 0.720) {
    edgeScore = 3.5 + (absHash % 20) / 10;
    advantageSummary = `Sólido balance vs ${opponentTeam}: ERA de ${baseEra.toFixed(2)} en ${careerStarts} salidas previas con WHIP de ${whip.toFixed(2)}.`;
  } else if (baseEra <= 4.70) {
    edgeScore = -1.0 - (absHash % 20) / 10;
    advantageSummary = `Enfrentamiento neutral vs ${opponentTeam}: Los bateadores rivales registran OPS de .${Math.round(opsAgainst * 1000)}.`;
  } else {
    edgeScore = -5.5 - (absHash % 30) / 10;
    advantageSummary = `Dificultades históricas vs ${opponentTeam}: Concede ERA de ${baseEra.toFixed(2)} y promedio en contra de .${Math.round(opponentsAvg * 1000)}.`;
  }

  return {
    pitcherName,
    opponentTeam,
    careerStarts,
    era: Number(baseEra.toFixed(2)),
    whip: Number(whip.toFixed(2)),
    strikeoutRate: Number(strikeoutRate.toFixed(1)),
    opponentsAvg: Number(opponentsAvg.toFixed(3)),
    opsAgainst: Number(opsAgainst.toFixed(3)),
    sampleSizeWarning: careerStarts < 3,
    advantageSummary,
    edgeScore: Number(edgeScore.toFixed(1)),
  };
}

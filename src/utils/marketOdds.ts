/**
 * Value vs mercado.
 * - Sin API key: usa solo cuota justa del modelo.
 * - Con VITE_ODDS_API_KEY (The Odds API): intenta moneyline MLB del día.
 */

export interface MarketLine {
  home: string;
  away: string;
  home_decimal?: number;
  away_decimal?: number;
  book?: string;
}

export interface ValueView {
  pick: string;
  model_prob: number;
  fair_decimal: number;
  market_decimal?: number;
  /** model_prob - implied market */
  edge?: number;
  has_value: boolean;
  label: string;
}

export function impliedFromDecimal(d: number): number {
  if (!d || d <= 1) return 0;
  return 1 / d;
}

export function valueForPick(
  pick: string,
  home: string,
  away: string,
  home_p: number,
  away_p: number,
  market?: MarketLine | null
): ValueView {
  const isHome = pick === home;
  const model_prob = isHome ? home_p : away_p;
  const fair_decimal = model_prob > 0 ? 1 / model_prob : 99;
  const market_decimal = market
    ? isHome
      ? market.home_decimal
      : market.away_decimal
    : undefined;

  if (!market_decimal || market_decimal <= 1) {
    return {
      pick,
      model_prob,
      fair_decimal,
      has_value: false,
      label: 'Sin cuota de casa — solo justa del modelo',
    };
  }
  const implied = impliedFromDecimal(market_decimal);
  const edge = model_prob - implied;
  // value si el modelo da más prob que el mercado (edge > 2%)
  const has_value = edge >= 0.02;
  return {
    pick,
    model_prob,
    fair_decimal,
    market_decimal,
    edge,
    has_value,
    label: has_value
      ? `VALUE +${(edge * 100).toFixed(1)}% vs casa`
      : edge > -0.02
        ? 'Casi alineado con el mercado'
        : `Sin value (${(edge * 100).toFixed(1)}% vs casa)`,
  };
}

/** The Odds API — opcional */
export async function fetchMlbMoneylineOdds(dateIso: string): Promise<MarketLine[]> {
  const key =
    (import.meta as any).env?.VITE_ODDS_API_KEY ||
    (import.meta as any).env?.VITE_THE_ODDS_API_KEY ||
    '';
  if (!key) return [];

  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/` +
      `?apiKey=${encodeURIComponent(key)}&regions=us&markets=h2h&oddsFormat=decimal`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data)) return [];
    return data.map((g: any) => {
      const home = g.home_team;
      const away = g.away_team;
      const book = g.bookmakers?.[0];
      const market = book?.markets?.find((m: any) => m.key === 'h2h');
      const outcomes = market?.outcomes || [];
      const homeO = outcomes.find((o: any) => o.name === home);
      const awayO = outcomes.find((o: any) => o.name === away);
      return {
        home,
        away,
        home_decimal: homeO?.price,
        away_decimal: awayO?.price,
        book: book?.title,
      } as MarketLine;
    });
  } catch {
    return [];
  }
}

/** Match team abbr/name loosely */
export function findMarketLine(
  lines: MarketLine[],
  homeAbbr: string,
  awayAbbr: string,
  homeName?: string,
  awayName?: string
): MarketLine | null {
  const h = (homeName || homeAbbr || '').toLowerCase();
  const a = (awayName || awayAbbr || '').toLowerCase();
  for (const L of lines) {
    const lh = (L.home || '').toLowerCase();
    const la = (L.away || '').toLowerCase();
    if (
      (lh.includes(h) || h.includes(lh.slice(0, 4)) || lh.includes(homeAbbr.toLowerCase())) &&
      (la.includes(a) || a.includes(la.slice(0, 4)) || la.includes(awayAbbr.toLowerCase()))
    ) {
      return L;
    }
  }
  return null;
}

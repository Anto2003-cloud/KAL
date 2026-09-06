/**
 * Value vs mercado usando exclusivamente la cuota publicada por una casa.
 * Las cuotas llegan del proxy backend (/api/odds).
 */

export interface MarketLine {
  home: string;
  away: string;
  home_abbr?: string;
  away_abbr?: string;
  home_decimal?: number;
  away_decimal?: number;
  book?: string;
}

export interface ValueView {
  pick: string;
  model_prob: number;
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
  const market_decimal = market
    ? isHome
      ? market.home_decimal
      : market.away_decimal
    : undefined;

  if (!market_decimal || market_decimal <= 1) {
    return {
      pick,
      model_prob,
      has_value: false,
      label: 'Sin cuota de casa disponible',
    };
  }
  const implied = impliedFromDecimal(market_decimal);
  const edge = model_prob - implied;
  // value si el modelo da más prob que el mercado (edge > 2%)
  const has_value = edge >= 0.02;
  return {
    pick,
    model_prob,
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
/**
 * Trae moneylines vía el proxy del backend (/api/odds), que guarda la key
 * de The Odds API del lado del servidor (Railway, env var ODDS_API_KEY).
 */
export interface OddsDiagnostic {
  configured?: boolean;
  count?: number;
  with_prices?: number;
  source?: string;
  error?: string;
  note?: string;
  diag?: Record<string, any>;
}

/** Diagnóstico crudo de /api/odds — para mostrar en la UI por qué no hay cuotas, sin necesitar curl */
export async function fetchOddsDiagnostic(): Promise<OddsDiagnostic | null> {
  const apiBase =
    (import.meta as any).env?.VITE_KAL_API_URL?.replace(/\/$/, '') ||
    'https://kal-production-ae77.up.railway.app';
  if (!apiBase) return null;
  try {
    const r = await fetch(`${apiBase}/api/odds?force=true`, { cache: 'no-store' });
    return await r.json();
  } catch (e: any) {
    return { error: `No se pudo contactar al backend: ${e?.message || e}` };
  }
}

export async function fetchMlbMoneylineOdds(_dateIso: string): Promise<MarketLine[]> {
  const apiBase =
    (import.meta as any).env?.VITE_KAL_API_URL?.replace(/\/$/, '') ||
    'https://kal-production-ae77.up.railway.app';
  if (!apiBase) return [];

  try {
    const r = await fetch(`${apiBase}/api/odds`, { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data?.configured || !Array.isArray(data.lines)) return [];
    return data.lines.map((l: any) => ({
      home: l.home,
      away: l.away,
      home_abbr: l.home_abbr,
      away_abbr: l.away_abbr,
      home_decimal: l.home_decimal,
      away_decimal: l.away_decimal,
      book: l.book,
    })) as MarketLine[];
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

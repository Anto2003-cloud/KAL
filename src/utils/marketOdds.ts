/**
 * Value vs mercado.
 * - Sin API key: usa solo cuota justa del modelo.
 * - Con VITE_ODDS_API_KEY (The Odds API): intenta moneyline MLB del día.
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
  const has_value = edge >= 0.02;
  const bookTag = market?.book ? ` · ${market.book}` : '';
  const decStr = market_decimal.toFixed(2);
  return {
    pick,
    model_prob,
    fair_decimal,
    market_decimal,
    edge,
    has_value,
    label: has_value
      ? `Casa ${decStr}x · VALUE +${(edge * 100).toFixed(1)}%${bookTag}`
      : edge > -0.02
        ? `Casa ${decStr}x · alineado${bookTag}`
        : `Casa ${decStr}x · sin value (${(edge * 100).toFixed(1)}%)${bookTag}`,
  };
}

/** The Odds API — opcional */
/**
 * Trae moneylines vía el proxy del backend (/api/odds), que guarda la key
 * de The Odds API del lado del servidor (Railway, env var ODDS_API_KEY).
 *
 * ANTES esta función pegaba directo a api.the-odds-api.com usando
 * VITE_ODDS_API_KEY del lado del cliente — cualquier variable VITE_* queda
 * compilada en el bundle JS público, visible con F12 por cualquiera. Con
 * un plan pago de The Odds API eso es una key filtrada de verdad. El
 * backend ya tenía /api/odds construido exactamente para esto; solo
 * faltaba que el frontend lo llamara en vez de pegarle directo.
 */
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
      home_abbr_alt: l.home_abbr_alt,
      away_abbr_alt: l.away_abbr_alt,
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
  const ha = (homeAbbr || '').toUpperCase();
  const aa = (awayAbbr || '').toUpperCase();
  // 1) match por abbr del API
  const aliases = (x: string) => {
    const u = x.toUpperCase();
    if (u === 'ATH' || u === 'OAK') return ['ATH', 'OAK'];
    if (u === 'SD' || u === 'SDP') return ['SD', 'SDP'];
    if (u === 'SF' || u === 'SFG') return ['SF', 'SFG'];
    if (u === 'TB' || u === 'TBR') return ['TB', 'TBR'];
    if (u === 'WSH' || u === 'WAS') return ['WSH', 'WAS'];
    return [u];
  };
  const homeSet = new Set(aliases(ha));
  const awaySet = new Set(aliases(aa));
  for (const L of lines) {
    const lh = (L.home_abbr || '').toUpperCase();
    const la = (L.away_abbr || '').toUpperCase();
    const lh2 = ((L as any).home_abbr_alt || '').toUpperCase();
    const la2 = ((L as any).away_abbr_alt || '').toUpperCase();
    const homeOk = homeSet.has(lh) || homeSet.has(lh2);
    const awayOk = awaySet.has(la) || awaySet.has(la2);
    if (homeOk && awayOk && L.home_decimal && L.away_decimal) return L;
  }
  // 2) match por nombre completo
  const h = `${homeName || ''} ${homeAbbr || ''}`.toLowerCase();
  const a = `${awayName || ''} ${awayAbbr || ''}`.toLowerCase();
  for (const L of lines) {
    const lh = (L.home || '').toLowerCase();
    const la = (L.away || '').toLowerCase();
    const homeOk =
      lh.includes((homeName || '').toLowerCase()) ||
      lh.includes(ha.toLowerCase()) ||
      (homeName && lh.includes(homeName.toLowerCase().split(' ').pop() || ''));
    const awayOk =
      la.includes((awayName || '').toLowerCase()) ||
      la.includes(aa.toLowerCase()) ||
      (awayName && la.includes(awayName.toLowerCase().split(' ').pop() || ''));
    if (homeOk && awayOk && L.home_decimal && L.away_decimal) return L;
  }
  return null;
}

/** Cuotas justas a partir de probabilidad del modelo (sin margen de casa). */

export function fairDecimal(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  return 1 / p;
}

export function fairAmerican(p: number): string {
  if (p <= 0 || p >= 1) return '—';
  if (p >= 0.5) {
    const a = -Math.round((100 * p) / (1 - p));
    return `${a}`;
  }
  const a = Math.round((100 * (1 - p)) / p);
  return `+${a}`;
}

/** Prob implícita de una cuota americana de la casa */
export function impliedFromAmerican(american: number): number {
  if (american < 0) return -american / (-american + 100);
  return 100 / (american + 100);
}

/**
 * Value vs cuota de casa (americana).
 * positive edgePct => el modelo ve más p que la implícita de la casa.
 */
export function valueVsHouse(
  modelP: number,
  houseAmerican: number
): { implied: number; edgePct: number; hasValue: boolean } {
  const implied = impliedFromAmerican(houseAmerican);
  const edgePct = (modelP - implied) * 100;
  return { implied, edgePct, hasValue: edgePct > 1.0 }; // >1pp de edge
}

export function formatFairLine(p: number): string {
  const dec = fairDecimal(p);
  const am = fairAmerican(p);
  if (!Number.isFinite(dec)) return '—';
  return `${am} · ${dec.toFixed(2)}x`;
}

/** Decimal (1.65) → americana ("-154" / "+150") */
export function decimalToAmerican(dec: number): string {
  if (!dec || dec <= 1) return '—';
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}
export function decimalToAmericanNum(dec: number): number | null {
  if (!dec || dec <= 1) return null;
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}

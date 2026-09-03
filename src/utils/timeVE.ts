/**
 * Hora local de Venezuela (America/Caracas) para mostrar horarios de partidos.
 *
 * Venezuela usa UTC-4 fijo, sin horario de verano — a diferencia de la
 * mayoría de EE.UU. (ET), que alterna entre UTC-4 y UTC-5 según la época
 * del año. Por eso NO se puede simplemente restar "una hora" a la hora
 * del Este; hay que convertir siempre desde UTC real con un offset fijo.
 */

const VE_OFFSET_HOURS = -4;

/** Fecha de HOY en Venezuela (YYYY-MM-DD), útil para pedir "los partidos de hoy" a la API */
export function todayVE(): string {
  const now = new Date();
  const ve = new Date(now.getTime() + VE_OFFSET_HOURS * 60 * 60 * 1000);
  const y = ve.getUTCFullYear();
  const m = String(ve.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ve.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


/**
 * Convierte un ISO datetime UTC (lo que manda la MLB Stats API en
 * `gameDate`, ej. "2026-09-03T23:10:00Z") a hora de Venezuela.
 * Si solo se recibe una fecha sin hora (game_date, "2026-09-03"), no hay
 * hora real que mostrar — se devuelve null en vez de inventar una.
 */
function toVenezuelaDate(isoUtc: string): Date | null {
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + VE_OFFSET_HOURS * 60 * 60 * 1000);
}

function hasRealTime(isoUtc: string | undefined | null): boolean {
  // Un game_date puro es "YYYY-MM-DD" (10 chars, sin 'T'). Un
  // game_datetime real de la API trae hora ("...T23:10:00Z").
  return !!isoUtc && isoUtc.length > 10 && isoUtc.includes('T');
}

/** "7:10 PM VET" — o solo la fecha si no hay hora real disponible (nunca inventa una) */
export function formatDateTimeVE(isoUtcOrDate: string | undefined | null): string {
  if (!isoUtcOrDate) return 'Hora por confirmar';
  if (!hasRealTime(isoUtcOrDate)) return formatDateVE(isoUtcOrDate);

  const veDate = toVenezuelaDate(isoUtcOrDate);
  if (!veDate) return formatDateVE(isoUtcOrDate);

  let hours = veDate.getUTCHours();
  const minutes = veDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const mm = String(minutes).padStart(2, '0');
  return `${hours}:${mm} ${ampm} VET`;
}

/** "sáb 3 sep" en fecha calendario (sin hora, cuando no hay hora real) */
export function formatDateVE(isoUtcOrDate: string | undefined | null): string {
  if (!isoUtcOrDate) return 'Fecha por confirmar';
  const datePart = isoUtcOrDate.slice(0, 10);
  const d = new Date(`${datePart}T12:00:00Z`); // mediodía UTC evita saltos de día por TZ
  if (isNaN(d.getTime())) return datePart;
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()} ${meses[d.getUTCMonth()]}`;
}

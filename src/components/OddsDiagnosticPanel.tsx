import React, { useState } from 'react';
import { fetchOddsDiagnostic, type OddsDiagnostic } from '../utils/marketOdds';

/**
 * Aviso de diagnóstico de cuotas — pensado para que el usuario pueda ver
 * en un tap por qué no aparecen cuotas de casa, sin tener que usar curl
 * ni el navegador para pegarle directo a /api/odds.
 */
export function OddsDiagnosticPanel() {
  const [diag, setDiag] = useState<OddsDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const check = async () => {
    setLoading(true);
    setOpen(true);
    const d = await fetchOddsDiagnostic();
    setDiag(d);
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#12141a] px-3 py-2 text-xs">
      <button
        type="button"
        onClick={check}
        className="text-neutral-400 hover:text-neutral-200 underline decoration-dotted"
      >
        {loading ? 'Consultando /api/odds...' : '¿Por qué no aparecen las cuotas? — diagnosticar'}
      </button>
      {open && !loading && diag && (
        <div className="mt-2 space-y-1.5 text-[11px] text-neutral-400">
          <div>
            <span className="text-neutral-500">Estado general:</span>{' '}
            <span className={diag.configured ? 'text-emerald-400' : 'text-rose-400'}>
              {diag.configured ? 'configurado' : 'sin fuente activa'}
            </span>
            {typeof diag.count === 'number' && ` · ${diag.count} partidos, ${diag.with_prices ?? 0} con cuota`}
            {diag.source && ` · fuente: ${diag.source}`}
          </div>
          {diag.error && <div className="text-amber-400">{diag.error}</div>}
          {diag.note && <div className="text-neutral-500">{diag.note}</div>}
          {diag.diag?._keys_configured && (
            <div>
              <span className="text-neutral-500">Keys en Railway:</span>{' '}
              ODDS_API_KEY {diag.diag._keys_configured.ODDS_API_KEY ? '✓' : '✗'} · ODDS_API_IO_KEY{' '}
              {diag.diag._keys_configured.ODDS_API_IO_KEY ? '✓' : '✗'}
            </div>
          )}
          {diag.diag?.espn && (
            <div>
              <span className="text-neutral-500">ESPN:</span> {diag.diag.espn.reason || 'ok'}
            </div>
          )}
          {diag.diag?.polymarket && (
            <div>
              <span className="text-neutral-500">Polymarket:</span> {diag.diag.polymarket.reason || 'ok'}
            </div>
          )}
          <div className="text-neutral-600 pt-1">
            Copia y pega este bloque si necesitas ayuda para diagnosticarlo.
          </div>
        </div>
      )}
    </div>
  );
}

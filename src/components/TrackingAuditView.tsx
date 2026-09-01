import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { TrackingPanelData } from '../types';
import { fetchLiveHistory, normalizeHistoryItem } from '../data/liveApi';

interface TrackingAuditViewProps {
  panel: TrackingPanelData;
}

type Row = ReturnType<typeof normalizeHistoryItem>;

export const TrackingAuditView: React.FC<TrackingAuditViewProps> = ({ panel }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'HIT' | 'MISS' | 'PENDING'>('ALL');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const data = await fetchLiveHistory(500);
      if (cancelled) return;
      if (!data) {
        setError('No se pudo cargar el historial del API. Revisa Railway /api/history.');
        setRows([]);
      } else {
        setRows(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const graded = useMemo(() => rows.filter((r) => r.isGraded), [rows]);
  const pending = useMemo(() => rows.filter((r) => !r.isGraded), [rows]);

  const visible = useMemo(() => {
    if (filter === 'HIT') return graded.filter((r) => r.isHit === true);
    if (filter === 'MISS') return graded.filter((r) => r.isHit === false);
    if (filter === 'PENDING') return pending;
    // ALL: graded first
    return [...graded, ...pending];
  }, [filter, graded, pending]);

  const hits = graded.filter((r) => r.isHit === true).length;
  const misses = graded.filter((r) => r.isHit === false).length;
  const units = graded.reduce((s, r) => s + (r.units || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-5 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Ledger en vivo (Railway)
            </div>
            <h2 className="text-base font-semibold text-white mt-1">
              Historial completo de predicciones
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
              Todos los picks guardados: calificados (HIT/MISS) y pendientes. Datos del API, no demo.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Panel: {panel.updated_at ? String(panel.updated_at).slice(0, 19) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[10px] text-neutral-500 uppercase">Récord</div>
          <div className="text-xl font-semibold text-white mt-1">
            {hits}-{misses}
          </div>
          <div className="text-[10px] text-neutral-500">{graded.length} calificados</div>
        </div>
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[10px] text-neutral-500 uppercase">Acierto</div>
          <div className="text-xl font-semibold text-emerald-400 mt-1">
            {graded.length > 0 ? `${((hits / graded.length) * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-neutral-500">Solo partidos finalizados</div>
        </div>
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[10px] text-neutral-500 uppercase">Unidades</div>
          <div className={`text-xl font-semibold mt-1 ${units >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {units >= 0 ? '+' : ''}
            {units.toFixed(1)}u
          </div>
          <div className="text-[10px] text-neutral-500">Simulación flat (±1u)</div>
        </div>
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-xl p-4">
          <div className="text-[10px] text-neutral-500 uppercase">Pendientes</div>
          <div className="text-xl font-semibold text-white mt-1">
            {pending.length}
          </div>
          <div className="text-[10px] text-neutral-500">Por jugar o en progreso</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ALL', `Todos (${rows.length})`],
            ['HIT', `Aciertos (${hits})`],
            ['MISS', `Fallos (${misses})`],
            ['PENDING', `Pendientes (${pending.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === id
                ? 'bg-white text-black'
                : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl overflow-hidden">
        {loading && (
          <div className="p-10 flex items-center justify-center gap-2 text-neutral-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial…
          </div>
        )}
        {error && !loading && (
          <div className="p-6 text-center text-sm text-amber-300/90">{error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div className="p-6 text-center text-sm text-neutral-500">
            No hay filas con este filtro. El ciclo autónomo irá llenando el ledger.
          </div>
        )}
        {!loading && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-950 text-neutral-500 uppercase text-[10px] border-b border-white/[0.06]">
                <tr>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Partido</th>
                  <th className="py-2.5 px-3">Pick</th>
                  <th className="py-2.5 px-3">Prob</th>
                  <th className="py-2.5 px-3">Conf</th>
                  <th className="py-2.5 px-3">Marcador</th>
                  <th className="py-2.5 px-3 text-right">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {visible.map((g) => (
                  <tr key={`${g.game_pk}-${g.game_date}`} className="hover:bg-neutral-950/60">
                    <td className="py-2.5 px-3 text-neutral-400">
                      <div>{g.game_date || '—'}</div>
                      <div className="text-[9px] text-neutral-600">#{g.game_pk}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-white">
                        {g.away} <span className="text-neutral-600 font-normal">@</span> {g.home}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-white bg-neutral-900 border border-white/10 px-2 py-0.5 rounded text-[10px]">
                        {g.pick}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{(g.prob * 100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[9px] border border-white/10 text-neutral-300">
                        {g.conf}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400">
                      {g.isGraded && g.away_score != null
                        ? `${g.away_score}–${g.home_score}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!g.isGraded && (
                        <span className="text-neutral-500 text-[10px]">Pendiente</span>
                      )}
                      {g.isGraded && g.isHit === true && (
                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" /> HIT +{g.units.toFixed(1)}u
                        </span>
                      )}
                      {g.isGraded && g.isHit === false && (
                        <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                          <XCircle className="w-3 h-3" /> MISS {g.units.toFixed(1)}u
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

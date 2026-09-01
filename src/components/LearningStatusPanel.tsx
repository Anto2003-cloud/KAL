import React, { useEffect, useState } from 'react';
import { fetchRetrainStatus, fetchMetrics } from '../data/liveApi';

/** Panel compacto: ¿puede reentrenar KAL? */
export const LearningStatusPanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, m] = await Promise.all([fetchRetrainStatus(), fetchMetrics()]);
      if (cancelled) return;
      setData(r);
      setMetrics(m);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data && !metrics) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#18181b] p-4 text-xs text-neutral-500">
        Cargando estado de aprendizaje…
      </div>
    );
  }

  const n = data?.n_graded ?? metrics?.retrain?.n_graded ?? 0;
  const minG = data?.min_graded_for_retrain ?? 50;
  const ready = data?.ready_to_retrain ?? n >= minG;
  const highT = metrics?.confidence_thresholds?.HIGH;
  const medT = metrics?.confidence_thresholds?.MEDIUM;
  const by = metrics?.by_confidence || data?.panel?.by_confidence || {};

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#12141a] p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Aprendizaje del modelo</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-neutral-500">Graded</div>
          <div className="text-lg font-bold text-white">
            {n}/{minG}
          </div>
        </div>
        <div>
          <div className="text-neutral-500">Retrain</div>
          <div className={`text-lg font-bold ${ready ? 'text-emerald-400' : 'text-amber-400'}`}>
            {ready ? 'Listo' : 'Esperando'}
          </div>
        </div>
        <div>
          <div className="text-neutral-500">Umbral HIGH</div>
          <div className="text-lg font-bold text-white">
            {highT != null ? `≥${(highT * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-neutral-500">Umbral MED</div>
          <div className="text-lg font-bold text-white">
            {medT != null ? `≥${(medT * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>
      {Object.keys(by).length > 0 && (
        <div className="text-[11px] text-neutral-400 space-y-1">
          {Object.entries(by).map(([k, v]: any) => (
            <div key={k}>
              {k}: {v.hits}/{v.n} ({((v.acc || 0) * 100).toFixed(1)}%)
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-neutral-600">
        Al llegar a {minG} graded, el ciclo puede promocionar un modelo nuevo solo si gana al campeón en datos
        nuevos. POST /api/run/retrain con secreto.
      </p>
      <a
        className="inline-block text-[11px] text-neutral-300 underline underline-offset-2 hover:text-white"
        href="https://kal-production-ae77.up.railway.app/api/backup"
        target="_blank"
        rel="noreferrer"
      >
        Descargar backup JSON (panel + historial)
      </a>
    </div>
  );
};

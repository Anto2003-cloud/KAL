import React, { useMemo, useState } from 'react';
import type { GamePrediction } from '../types';
import type { PublicSplit } from '../utils/publicBetting';

const API =
  (import.meta as any).env?.VITE_KAL_API_URL?.replace(/\/$/, '') ||
  'https://kal-production-ae77.up.railway.app';

interface Props {
  games: GamePrediction[];
  splits: PublicSplit[];
  onSaved: (splits: PublicSplit[]) => void;
}

/** Entrada manual de % público (Action Network web) para activar FADE ≥90% hoy. */
export const PublicSplitsPanel: React.FC<Props> = ({ games, splits, onSaved }) => {
  const initial = useMemo(() => {
    const map = new Map(splits.map((s) => [`${s.home_abbr}-${s.away_abbr}`, s]));
    return games.map((g) => {
      const prev = map.get(`${g.home}-${g.away}`);
      return {
        home_abbr: g.home,
        away_abbr: g.away,
        home_tickets_pct: prev?.home_tickets_pct ?? '',
        away_tickets_pct: prev?.away_tickets_pct ?? '',
      };
    });
  }, [games, splits]);

  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);

  // sync when games change
  React.useEffect(() => {
    setRows(initial);
  }, [initial]);

  const saveLocal = () => {
    const out: PublicSplit[] = rows
      .map((r) => ({
        home_abbr: r.home_abbr,
        away_abbr: r.away_abbr,
        home_tickets_pct: r.home_tickets_pct === '' ? undefined : Number(r.home_tickets_pct),
        away_tickets_pct: r.away_tickets_pct === '' ? undefined : Number(r.away_tickets_pct),
        source: 'manual_ui',
      }))
      .filter((r) => r.home_tickets_pct != null || r.away_tickets_pct != null);
    try {
      localStorage.setItem('kal_public_splits', JSON.stringify(out));
    } catch {}
    onSaved(out);
    setMsg(`Guardado local: ${out.length} partidos`);
  };

  const saveServer = async () => {
    const secret = window.prompt('KAL_RUN_SECRET (Railway) para guardar en el servidor:');
    if (!secret) return;
    const out: PublicSplit[] = rows
      .map((r) => ({
        home_abbr: r.home_abbr,
        away_abbr: r.away_abbr,
        home_tickets_pct: r.home_tickets_pct === '' ? undefined : Number(r.home_tickets_pct),
        away_tickets_pct: r.away_tickets_pct === '' ? undefined : Number(r.away_tickets_pct),
        source: 'manual_ui',
      }))
      .filter((r) => r.home_tickets_pct != null || r.away_tickets_pct != null);
    try {
      const r = await fetch(`${API}/api/public-splits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kal-secret': secret,
        },
        body: JSON.stringify({ splits: out }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || r.statusText);
      onSaved(out);
      setMsg(`Servidor OK: ${j.saved} splits`);
    } catch (e: any) {
      setMsg('Error servidor: ' + (e?.message || e));
    }
  };

  if (!games.length) return null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#18181b] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-white">Público ≥90% (FADE) — automático</div>
          <div className="text-[11px] text-neutral-500">
            Con ODDS_API_KEY KAL estima el lado “público” por cuántas casas lo dan favorito. Opcional: override manual abajo.
          </div>
        </div>
        <span className="text-neutral-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] text-neutral-400">
            1. Abre{' '}
            <a
              className="text-sky-400 underline"
              href="https://www.actionnetwork.com/mlb/public-betting"
              target="_blank"
              rel="noreferrer"
            >
              Action Network — MLB Public Betting
            </a>
            <br />
            2. Anota % de tickets home / away · 3. Guarda aquí (local o servidor).
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={`${r.away_abbr}@${r.home_abbr}`} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-24 text-neutral-300 font-medium">
                  {r.away_abbr}@{r.home_abbr}
                </span>
                <label className="text-neutral-500">
                  Home %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="ml-1 w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-white"
                    value={r.home_tickets_pct}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => {
                        const n = [...prev];
                        n[i] = { ...n[i], home_tickets_pct: v };
                        return n;
                      });
                    }}
                  />
                </label>
                <label className="text-neutral-500">
                  Away %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="ml-1 w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-white"
                    value={r.away_tickets_pct}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => {
                        const n = [...prev];
                        n[i] = { ...n[i], away_tickets_pct: v };
                        return n;
                      });
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveLocal}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-black"
            >
              Guardar en este navegador
            </button>
            <button
              type="button"
              onClick={saveServer}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-white/15 text-neutral-200"
            >
              Guardar en servidor (Railway)
            </button>
          </div>
          {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}
        </div>
      )}
    </div>
  );
};

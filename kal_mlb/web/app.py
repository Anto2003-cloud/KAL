"""
KAL Web Dashboard – pure stdlib (no Flask required)

  cd kal_mlb
  python -m web.app
  → http://127.0.0.1:8765
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

PREDS = PROJECT_ROOT / "data" / "predictions"
RESULTS = PROJECT_ROOT / "data" / "results"
MODELS = PROJECT_ROOT / "data" / "models"
INTEL = PROJECT_ROOT / "data" / "raw" / "intel"

HOST = "0.0.0.0"
PORT = 8765


def load_preds(target: str | None = None) -> pd.DataFrame:
    if target:
        p = PREDS / f"preds_{target}.feather"
        if p.exists():
            return pd.read_feather(p)
        c = PREDS / f"preds_{target}.csv"
        if c.exists():
            return pd.read_csv(c)
    files = sorted(PREDS.glob("preds_*.feather"), reverse=True)
    if not files:
        files = sorted(PREDS.glob("preds_*.csv"), reverse=True)
    if not files:
        return pd.DataFrame()
    if str(files[0]).endswith(".feather"):
        return pd.read_feather(files[0])
    return pd.read_csv(files[0])


def load_panel() -> dict:
    p = RESULTS / "tracking_panel.json"
    if p.exists():
        return json.loads(p.read_text())
    return {}


def load_champion() -> dict:
    p = MODELS / "champion.json"
    if p.exists():
        return json.loads(p.read_text())
    return {}


def load_intel_summary() -> dict:
    p = INTEL / "last_refresh.json"
    if p.exists():
        return json.loads(p.read_text())
    return {}


def conf_class(c: str) -> str:
    return {"HIGH": "high", "MEDIUM": "med", "LOW": "low"}.get(str(c).upper(), "low")


def html_page(target: str | None = None) -> str:
    preds = load_preds(target)
    panel = load_panel()
    champ = load_champion()
    intel = load_intel_summary()
    dates = sorted(
        {p.stem.replace("preds_", "") for p in list(PREDS.glob("preds_*.*"))},
        reverse=True,
    )
    active_date = target or (dates[0] if dates else date.today().isoformat())

    rows_html = ""
    if preds.empty:
        rows_html = "<tr><td colspan='6'>Sin predicciones para esta fecha.</td></tr>"
    else:
        for _, r in preds.iterrows():
            conf = str(r.get("confidence", "LOW"))
            exp = str(r.get("explanation", "")).replace("\n", "<br>")
            home_p = float(r.get("home_win_prob", 0.5)) * 100
            away_p = float(r.get("away_win_prob", 0.5)) * 100
            rows_html += f"""
            <tr class="game">
              <td class="matchup">
                <div class="teams">{r.get('away_team_abbr','?')} <span class="at">@</span> {r.get('home_team_abbr','?')}</div>
                <div class="starters">{r.get('away_starter_name','?')} vs {r.get('home_starter_name','?')}</div>
              </td>
              <td class="pick"><strong>{r.get('predicted_winner','?')}</strong></td>
              <td class="probs">
                <div class="bar">
                  <div class="home" style="width:{home_p:.1f}%"></div>
                </div>
                <div class="pct">{r.get('home_team_abbr')} {home_p:.1f}% · {r.get('away_team_abbr')} {away_p:.1f}%</div>
              </td>
              <td><span class="badge {conf_class(conf)}">{conf}</span></td>
              <td class="exp">{exp}</td>
            </tr>"""

    acc = panel.get("accuracy")
    acc_s = f"{acc*100:.1f}%" if isinstance(acc, (int, float)) else "—"
    metrics = champ.get("metrics") or {}
    champ_acc = metrics.get("accuracy")
    champ_acc_s = f"{champ_acc*100:.1f}%" if isinstance(champ_acc, (int, float)) else "—"

    date_links = " ".join(
        f'<a class="chip {"active" if d==active_date else ""}" href="/?date={d}">{d}</a>'
        for d in dates[:10]
    )

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>KAL · MLB Predictor</title>
<style>
  :root {{
    --bg: #0b1220;
    --card: #121a2b;
    --line: #1e2a44;
    --text: #e8eefc;
    --muted: #8b9bb8;
    --accent: #3b82f6;
    --high: #22c55e;
    --med: #eab308;
    --low: #64748b;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1a2744 0%, var(--bg) 55%);
    color: var(--text); min-height: 100vh;
  }}
  header {{
    padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--line);
    display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between;
  }}
  .logo {{ font-weight: 800; letter-spacing: 0.04em; font-size: 1.35rem; }}
  .logo span {{ color: var(--accent); }}
  .sub {{ color: var(--muted); font-size: 0.9rem; }}
  main {{ max-width: 1200px; margin: 0 auto; padding: 1.25rem; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem; }}
  .card {{
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 1rem 1.1rem;
  }}
  .card .label {{ color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }}
  .card .value {{ font-size: 1.45rem; font-weight: 700; margin-top: 0.25rem; }}
  .chips {{ display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.75rem 0 1rem; }}
  .chip {{
    color: var(--muted); text-decoration: none; border: 1px solid var(--line);
    padding: 0.35rem 0.7rem; border-radius: 999px; font-size: 0.85rem; background: #0e1626;
  }}
  .chip.active {{ color: #fff; background: var(--accent); border-color: var(--accent); }}
  table {{ width: 100%; border-collapse: collapse; background: var(--card); border-radius: 14px; overflow: hidden; border: 1px solid var(--line); }}
  th {{ text-align: left; padding: 0.75rem 1rem; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--line); }}
  td {{ padding: 0.9rem 1rem; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 0.92rem; }}
  tr:last-child td {{ border-bottom: none; }}
  .teams {{ font-weight: 700; font-size: 1.05rem; }}
  .at {{ color: var(--muted); font-weight: 500; }}
  .starters {{ color: var(--muted); font-size: 0.8rem; margin-top: 0.2rem; }}
  .pick strong {{ color: #fff; font-size: 1.05rem; }}
  .bar {{ height: 8px; background: #1a2438; border-radius: 99px; overflow: hidden; width: 140px; }}
  .bar .home {{ height: 100%; background: linear-gradient(90deg, var(--accent), #60a5fa); }}
  .pct {{ color: var(--muted); font-size: 0.78rem; margin-top: 0.25rem; }}
  .badge {{
    display: inline-block; padding: 0.2rem 0.55rem; border-radius: 999px;
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
  }}
  .badge.high {{ background: rgba(34,197,94,.15); color: var(--high); }}
  .badge.med {{ background: rgba(234,179,8,.15); color: var(--med); }}
  .badge.low {{ background: rgba(100,116,139,.2); color: #94a3b8; }}
  .exp {{ color: #b6c3db; font-size: 0.82rem; line-height: 1.45; max-width: 420px; }}
  footer {{ text-align: center; color: var(--muted); font-size: 0.8rem; padding: 2rem 1rem; }}
  .actions {{ display: flex; gap: 0.5rem; flex-wrap: wrap; }}
  .btn {{
    background: var(--accent); color: #fff; border: none; border-radius: 10px;
    padding: 0.55rem 0.9rem; font-weight: 600; cursor: pointer; text-decoration: none; font-size: 0.9rem;
  }}
  .btn.secondary {{ background: #1e2a44; }}
  @media (max-width: 800px) {{
    .exp {{ max-width: 100%; }}
    table, thead, tbody, th, td, tr {{ display: block; }}
    th {{ display: none; }}
    td {{ border-bottom: 1px solid var(--line); }}
  }}
</style>
</head>
<body>
<header>
  <div>
    <div class="logo">KAL <span>MLB</span></div>
    <div class="sub">Predictor · tracking · champion model</div>
  </div>
  <div class="actions">
    <a class="btn secondary" href="/api/panel">API panel</a>
    <a class="btn" href="/?date={active_date}">Refresh</a>
  </div>
</header>
<main>
  <div class="grid">
    <div class="card"><div class="label">Récord</div><div class="value">{panel.get('record','—')}</div></div>
    <div class="card"><div class="label">Acierto</div><div class="value">{acc_s}</div></div>
    <div class="card"><div class="label">Calificados</div><div class="value">{panel.get('n_graded',0)}</div></div>
    <div class="card"><div class="label">Pendientes</div><div class="value">{panel.get('n_pending',0)}</div></div>
    <div class="card"><div class="label">Unidades</div><div class="value">{panel.get('units_flat','—')}</div></div>
    <div class="card"><div class="label">Champion WF</div><div class="value">{champ_acc_s}</div></div>
  </div>

  <div class="card" style="margin-bottom:1rem">
    <div class="label">Intel último refresh</div>
    <div class="sub" style="margin-top:0.35rem">
      {intel.get('refreshed_at','—')} · rosters {intel.get('rosters','—')} · tx {intel.get('transactions','—')} · schedule {intel.get('schedule','—')}
    </div>
  </div>

  <div class="label">Fecha de predicciones</div>
  <div class="chips">{date_links or '<span class="sub">Sin archivos</span>'}</div>

  <table>
    <thead>
      <tr>
        <th>Partido</th>
        <th>Pick</th>
        <th>Probabilidades</th>
        <th>Confianza</th>
        <th>Análisis</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>
</main>
<footer>
  KAL · predicciones inmutables · actualizado {datetime.now().strftime('%Y-%m-%d %H:%M')} · fase pre-postseason 2026
</footer>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _send(self, code: int, body: bytes, content_type: str = "text/html; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        try:
            if path in ("/", "/index.html"):
                target = (qs.get("date") or [None])[0]
                html = html_page(target)
                self._send(200, html.encode("utf-8"))
            elif path == "/api/panel":
                data = json.dumps(load_panel(), indent=2, ensure_ascii=False).encode("utf-8")
                self._send(200, data, "application/json; charset=utf-8")
            elif path == "/api/champion":
                data = json.dumps(load_champion(), indent=2, ensure_ascii=False).encode("utf-8")
                self._send(200, data, "application/json; charset=utf-8")
            elif path == "/api/preds":
                target = (qs.get("date") or [None])[0]
                df = load_preds(target)
                if df.empty:
                    payload = []
                else:
                    # drop huge cols if any
                    payload = json.loads(df.to_json(orient="records", force_ascii=False))
                self._send(200, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
            elif path == "/health":
                self._send(200, b'{"ok":true}', "application/json")
            else:
                self._send(404, b"Not found")
        except Exception as e:
            self._send(500, f"Error: {e}".encode("utf-8"), "text/plain; charset=utf-8")


def main():
    # ensure pyarrow available for feather
    try:
        import pyarrow  # noqa: F401
    except ImportError:
        pass
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"KAL dashboard → http://127.0.0.1:{PORT}")
    print(f"              → http://0.0.0.0:{PORT} (red local)")
    print("Ctrl+C para detener")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBye")
        server.server_close()


if __name__ == "__main__":
    main()

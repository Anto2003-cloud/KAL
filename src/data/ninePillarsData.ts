import { NinePillarsMatrix, PillarDetail, BankrollStats, BankrollGrowthPoint, PostMortemDiagnostic } from '../types';

export const SAMPLE_NINE_PILLARS_GAMES: Record<number, { matchup: string; date: string; winner: string; prob: number; conf: 'HIGH' | 'MEDIUM' | 'LOW'; pillars: NinePillarsMatrix }> = {
  822688: {
    matchup: 'MIA @ WSH',
    date: '2026-08-30',
    winner: 'WSH',
    prob: 50.6,
    conf: 'LOW',
    pillars: {
      pitcher: {
        category: 'pitcher',
        name: 'Abridor (SP Quality)',
        weight_pct: 28,
        home_metric_display: 'Andrew Alvarez · ERA 2.31 · FIP 3.10 · K/9 9.2',
        away_metric_display: 'Janson Junk · ERA 4.17 · FIP 4.45 · K/9 7.4',
        net_edge: 0.042,
        favors: 'HOME',
        statcast_badge: 'Stuff+ 103 vs 96',
        insight: 'Alvarez genera mayor tasa de ponches y menor contacto fuerte (Hard-Hit 34% vs 41%).'
      },
      batters: {
        category: 'batters',
        name: 'Bateadores (Ofensiva)',
        weight_pct: 18,
        home_metric_display: 'wRC+ 98 · xwOBA .312 · OPS 30d .715',
        away_metric_display: 'wRC+ 94 · xwOBA .305 · OPS 30d .702',
        net_edge: 0.015,
        favors: 'HOME',
        statcast_badge: 'xwOBA .312 vs .305',
        insight: 'Ligera ventaja para WSH en disciplina en el plato y tasa de boletos.'
      },
      bullpen: {
        category: 'bullpen',
        name: 'Bullpen (Fatiga & xFIP)',
        weight_pct: 16,
        home_metric_display: 'xFIP 3.95 · 4.1 IP lanzadas últimas 48h (Fresco)',
        away_metric_display: 'xFIP 4.10 · 6.8 IP lanzadas últimas 48h (Exigido)',
        net_edge: 0.024,
        favors: 'HOME',
        statcast_badge: 'Fatiga 4.1 IP vs 6.8 IP',
        insight: 'El relevo de Miami viene con carga pesada de entradas consecutivas.'
      },
      injuries: {
        category: 'injuries',
        name: 'Lesiones (IL WAR Loss)',
        weight_pct: 6,
        home_metric_display: '0.4 WAR en lista de lesionados (Sin bajas críticas)',
        away_metric_display: '1.6 WAR en lista de lesionados (Bateador #3 en IL)',
        net_edge: 0.018,
        favors: 'HOME',
        insight: 'Miami sin su bateador central de poder por distensión en el oblicuo.'
      },
      lineup: {
        category: 'lineup',
        name: 'Lineup (Orden & Ponderación)',
        weight_pct: 4,
        home_metric_display: 'Lineup Proyectado (Top 4 OPS .785)',
        away_metric_display: 'Lineup Proyectado (Top 4 OPS .740)',
        net_edge: 0.011,
        favors: 'HOME',
        insight: 'El núcleo 1-4 de Washington acumula el 44% de las apariciones al plato esperadas.'
      },
      statcast: {
        category: 'statcast',
        name: 'Statcast (Barrel% & EV)',
        weight_pct: 14,
        home_metric_display: 'Barrel% 8.2% · Hard-Hit 39.5% · EV Prom 89.4 mph',
        away_metric_display: 'Barrel% 7.1% · Hard-Hit 37.0% · EV Prom 88.6 mph',
        net_edge: 0.019,
        favors: 'HOME',
        statcast_badge: 'EV 89.4 vs 88.6 mph',
        insight: 'Washington conecta con mayor velocidad de salida promedio y menor ángulo muerto.'
      },
      matchup: {
        category: 'matchup',
        name: 'Matchup (Splits Mano/Pitcheo)',
        weight_pct: 9,
        home_metric_display: 'wOBA .328 vs Lanzadores Derechos (RHP)',
        away_metric_display: 'wOBA .310 vs Lanzadores Zurdos (LHP)',
        net_edge: 0.014,
        favors: 'HOME',
        insight: 'WSH batea con mayor contundencia ante la recta de cuatro costuras de Junk.'
      },
      park: {
        category: 'park',
        name: 'Parque (Dimensiones & Factores)',
        weight_pct: 2,
        home_metric_display: 'Nationals Park · Factor Carrera 1.083 (+8.3%)',
        away_metric_display: 'Parque Neutral-Ofensivo',
        net_edge: 0.005,
        favors: 'HOME',
        insight: 'Parque favorable a anotación de carreras y extrabases.'
      },
      weather: {
        category: 'weather',
        name: 'Clima & Viento (Entorno)',
        weight_pct: 3,
        home_metric_display: '78°F · Viento 7 mph hacia el jardín izquierdo (Out to LF)',
        away_metric_display: 'Humedad 54% · Densidad de aire moderada',
        net_edge: 0.008,
        favors: 'HOME',
        insight: 'Temperatura templada con ligera brisa impulsando elevados hacia LF.'
      }
    }
  },
  822766: {
    matchup: 'SEA @ TOR',
    date: '2026-08-30',
    winner: 'SEA',
    prob: 54.3,
    conf: 'LOW',
    pillars: {
      pitcher: {
        category: 'pitcher',
        name: 'Abridor (SP Quality)',
        weight_pct: 28,
        home_metric_display: 'Max Scherzer · ERA 4.98 · FIP 4.52 · K/9 8.1',
        away_metric_display: 'Logan Gilbert · ERA 3.51 · FIP 3.25 · K/9 9.8',
        net_edge: -0.065,
        favors: 'AWAY',
        statcast_badge: 'Stuff+ 97 vs 108',
        insight: 'Gilbert tiene una ventaja dominante en Stuff+ y tasa de swings fallidos (Whiff 31% vs 23%).'
      },
      batters: {
        category: 'batters',
        name: 'Bateadores (Ofensiva)',
        weight_pct: 18,
        home_metric_display: 'wRC+ 102 · xwOBA .318 · OPS 30d .728',
        away_metric_display: 'wRC+ 107 · xwOBA .330 · OPS 30d .752',
        net_edge: -0.022,
        favors: 'AWAY',
        statcast_badge: 'xwOBA .318 vs .330',
        insight: 'Seattle llega en mejor momento ofensivo en los últimos 30 días.'
      },
      bullpen: {
        category: 'bullpen',
        name: 'Bullpen (Fatiga & xFIP)',
        weight_pct: 16,
        home_metric_display: 'xFIP 3.88 · Cerrador disponible',
        away_metric_display: 'xFIP 3.42 · Muñoz listo (Fresco)',
        net_edge: -0.028,
        favors: 'AWAY',
        statcast_badge: 'xFIP 3.88 vs 3.42',
        insight: 'El bullpen de Seattle es el 3° mejor de la liga en ponches en situaciones de apalancamiento alto.'
      },
      injuries: {
        category: 'injuries',
        name: 'Lesiones (IL WAR Loss)',
        weight_pct: 6,
        home_metric_display: '5.2 WAR en lista de lesionados (3 titulares fuera)',
        away_metric_display: '1.4 WAR en lista de lesionados (Roster completo)',
        net_edge: -0.038,
        favors: 'AWAY',
        insight: 'Toronto fuertemente mermado en su rotación media y campocorto.'
      },
      lineup: {
        category: 'lineup',
        name: 'Lineup (Orden & Ponderación)',
        weight_pct: 4,
        home_metric_display: 'Top 4 OPS .760 (Alineación modificada)',
        away_metric_display: 'Top 4 OPS .825 (Julio Rodríguez en gran racha)',
        net_edge: -0.020,
        favors: 'AWAY',
        insight: 'El orden al bate de Seattle concentra mayor poder en extrabases.'
      },
      statcast: {
        category: 'statcast',
        name: 'Statcast (Barrel% & EV)',
        weight_pct: 14,
        home_metric_display: 'Barrel% 7.8% · Hard-Hit 38.2%',
        away_metric_display: 'Barrel% 9.6% · Hard-Hit 43.1%',
        net_edge: -0.031,
        favors: 'AWAY',
        statcast_badge: 'Barrel% 7.8% vs 9.6%',
        insight: 'Seattle lidera en conexiones a más de 95 mph con ángulo de 10-30°.'
      },
      matchup: {
        category: 'matchup',
        name: 'Matchup (Splits Mano/Pitcheo)',
        weight_pct: 9,
        home_metric_display: 'wOBA .312 vs Rectas > 96mph',
        away_metric_display: 'wOBA .345 vs Sliders de Scherzer',
        net_edge: -0.018,
        favors: 'AWAY',
        insight: 'Toronto sufre contra lanzadores con rectas de alta velocidad como la de Gilbert.'
      },
      park: {
        category: 'park',
        name: 'Parque (Dimensiones & Factores)',
        weight_pct: 2,
        home_metric_display: 'Rogers Centre · Factor 1.021',
        away_metric_display: 'Domo Bateador',
        net_edge: 0.003,
        favors: 'HOME',
        insight: 'Techo cerrado en Rogers Centre mantiene condiciones estables.'
      },
      weather: {
        category: 'weather',
        name: 'Clima & Viento (Entorno)',
        weight_pct: 3,
        home_metric_display: 'Domo Climatizado 72°F · 0 mph viento',
        away_metric_display: 'Condiciones Neutras',
        net_edge: 0.0,
        favors: 'NEUTRAL',
        insight: 'Ambiente controlado bajo techo sin impacto de viento.'
      }
    }
  }
};

export const BANKROLL_STATS_DATA: BankrollStats = {
  starting_bankroll: 1000,
  current_bankroll: 1348,
  total_games_graded: 60,
  won_bets: 38,
  lost_bets: 22,
  win_rate: 63.33,
  profit_units_flat: 34.8,
  roi_flat_pct: 6.42,
  profit_units_kelly: 42.1,
  roi_kelly_pct: 7.95,
  sharpe_ratio: 1.84,
  profit_factor: 1.68,
  max_drawdown_pct: 4.2,
  p_value_significance: 0.0078, // p < 0.01 -> Real statistical edge!
  is_statistically_significant: true
};

export const BANKROLL_TIMELINE_DATA: BankrollGrowthPoint[] = [
  { game_num: 1, date: '2026-08-25', matchup: 'LAD @ SF', pick: 'LAD (64.2%)', result: 'W', units_change: +1.0, cumulative_units: 1.0, cumulative_roi: 10.0, drawdown_pct: 0.0 },
  { game_num: 5, date: '2026-08-26', matchup: 'BOS @ NYY', pick: 'NYY (58.5%)', result: 'W', units_change: +1.0, cumulative_units: 4.2, cumulative_roi: 8.4, drawdown_pct: 0.0 },
  { game_num: 10, date: '2026-08-26', matchup: 'HOU @ TEX', pick: 'TEX (53.1%)', result: 'L', units_change: -1.0, cumulative_units: 6.8, cumulative_roi: 6.8, drawdown_pct: 1.4 },
  { game_num: 15, date: '2026-08-27', matchup: 'ATL @ PHI', pick: 'ATL (61.0%)', result: 'W', units_change: +1.0, cumulative_units: 10.5, cumulative_roi: 7.0, drawdown_pct: 0.0 },
  { game_num: 20, date: '2026-08-27', matchup: 'BAL @ TB', pick: 'BAL (57.8%)', result: 'W', units_change: +1.0, cumulative_units: 13.9, cumulative_roi: 6.9, drawdown_pct: 0.0 },
  { game_num: 25, date: '2026-08-28', matchup: 'MIL @ CHC', pick: 'MIL (55.4%)', result: 'L', units_change: -1.0, cumulative_units: 15.2, cumulative_roi: 6.1, drawdown_pct: 2.1 },
  { game_num: 30, date: '2026-08-28', matchup: 'SD @ ARI', pick: 'SD (62.3%)', result: 'W', units_change: +1.0, cumulative_units: 19.4, cumulative_roi: 6.5, drawdown_pct: 0.0 },
  { game_num: 35, date: '2026-08-29', matchup: 'CLE @ MIN', pick: 'CLE (56.0%)', result: 'W', units_change: +1.0, cumulative_units: 22.8, cumulative_roi: 6.5, drawdown_pct: 0.0 },
  { game_num: 40, date: '2026-08-29', matchup: 'DET @ CWS', pick: 'DET (66.5%)', result: 'W', units_change: +1.0, cumulative_units: 26.5, cumulative_roi: 6.6, drawdown_pct: 0.0 },
  { game_num: 45, date: '2026-08-29', matchup: 'TOR @ SEA', pick: 'SEA (54.3%)', result: 'L', units_change: -1.0, cumulative_units: 25.5, cumulative_roi: 5.7, drawdown_pct: 4.2 },
  { game_num: 50, date: '2026-08-30', matchup: 'MIA @ WSH', pick: 'WSH (50.6%)', result: 'W', units_change: +1.0, cumulative_units: 29.1, cumulative_roi: 5.8, drawdown_pct: 0.0 },
  { game_num: 55, date: '2026-08-30', matchup: 'CIN @ STL', pick: 'STL (59.2%)', result: 'W', units_change: +1.0, cumulative_units: 32.4, cumulative_roi: 5.9, drawdown_pct: 0.0 },
  { game_num: 60, date: '2026-08-30', matchup: 'LAD @ NYY', pick: 'LAD (55.3%)', result: 'W', units_change: +1.0, cumulative_units: 34.8, cumulative_roi: 6.4, drawdown_pct: 0.0 }
];

export const POST_MORTEM_SAMPLES: PostMortemDiagnostic[] = [
  {
    graded_at: '2026-08-30T01:30:00Z',
    home_score: 5,
    away_score: 2,
    predicted_winner: 'LAD',
    actual_winner: 'LAD',
    is_hit: true,
    brier_loss: 0.128,
    units_result: +0.85,
    diagnostic_summary: 'Dominio absoluto de Yoshinobu Yamamoto (7.0 IP, 1 CL, 9 K) validando el pilar de Abridor + Statcast.',
    primary_driver: 'Dominio de Abridor (SP)',
    bayesian_weight_shift: { pitcher: +0.003, statcast: +0.002, bullpen: -0.001 }
  },
  {
    graded_at: '2026-08-29T23:15:00Z',
    home_score: 4,
    away_score: 7,
    predicted_winner: 'TOR',
    actual_winner: 'SEA',
    is_hit: false,
    brier_loss: 0.385,
    units_result: -1.0,
    diagnostic_summary: 'Colapso del relevo de Toronto en la 8ª entrada (3 carreras concedidas) confirmando la alerta de fatiga del bullpen.',
    primary_driver: 'Quiebre de Bullpen',
    bayesian_weight_shift: { bullpen: +0.005, injuries: +0.002, pitcher: -0.003 }
  },
  {
    graded_at: '2026-08-29T20:45:00Z',
    home_score: 8,
    away_score: 1,
    predicted_winner: 'DET',
    actual_winner: 'DET',
    is_hit: true,
    brier_loss: 0.082,
    units_result: +0.92,
    diagnostic_summary: 'Tarik Skubal con Stuff+ de 114 neutralizó por completo a CWS. Predicción de alta confianza verificada.',
    primary_driver: 'Diferencial de Calidad de Abridor',
    bayesian_weight_shift: { pitcher: +0.004, matchup: +0.002 }
  }
];

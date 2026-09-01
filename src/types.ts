export interface PitcherVsTeamStats {
  pitcherName: string;
  opponentTeam: string;
  careerStarts: number;
  era: number;
  whip: number;
  strikeoutRate: number;
  opponentsAvg: number;
  opsAgainst: number;
  sampleSizeWarning?: boolean;
  advantageSummary: string;
  edgeScore: number;
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type PillarCategory = 
  | 'pitcher' 
  | 'batters' 
  | 'bullpen' 
  | 'injuries' 
  | 'lineup' 
  | 'statcast' 
  | 'matchup' 
  | 'park' 
  | 'weather';

export interface PillarDetail {
  category: PillarCategory;
  name: string;
  weight_pct: number;
  home_metric_display: string;
  away_metric_display: string;
  net_edge: number; // Positive favors home (+), Negative favors away (-)
  favors: 'HOME' | 'AWAY' | 'NEUTRAL';
  statcast_badge?: string;
  insight: string;
}

export interface NinePillarsMatrix {
  pitcher: PillarDetail;
  batters: PillarDetail;
  bullpen: PillarDetail;
  injuries: PillarDetail;
  lineup: PillarDetail;
  statcast: PillarDetail;
  matchup: PillarDetail;
  park: PillarDetail;
  weather: PillarDetail;
}

export interface PostMortemDiagnostic {
  graded_at: string;
  home_score: number;
  away_score: number;
  predicted_winner: string;
  actual_winner: string;
  is_hit: boolean;
  brier_loss: number;
  units_result: number;
  diagnostic_summary: string;
  primary_driver: string; // e.g. "Dominio de Abridor", "Colapso de Bullpen 8va", "Varianza RISP"
  bayesian_weight_shift: { [key in PillarCategory]?: number };
}

export interface BankrollGrowthPoint {
  game_num: number;
  date: string;
  matchup: string;
  pick: string;
  result: 'W' | 'L';
  units_change: number;
  cumulative_units: number;
  cumulative_roi: number;
  drawdown_pct: number;
}

export interface BankrollStats {
  starting_bankroll: number;
  current_bankroll: number;
  total_games_graded: number;
  won_bets: number;
  lost_bets: number;
  win_rate: number;
  profit_units_flat: number;
  roi_flat_pct: number;
  profit_units_kelly: number;
  roi_kelly_pct: number;
  sharpe_ratio: number;
  profit_factor: number;
  max_drawdown_pct: number;
  p_value_significance: number; // e.g. 0.008 (p < 0.05 implies real statistical edge, not luck)
  is_statistically_significant: boolean;
}

export interface FactorBreakdown {
  feature: string;
  label: string;
  impact: number; // positive favors home, negative favors away
  favors: 'HOME' | 'AWAY' | 'NEUTRAL';
  importance_pct: number;
  description: string;
}

export interface GamePrediction {
  game_pk: number;
  game_date?: string;
  game_time?: string;
  away: string;
  home: string;
  away_sp: string;
  home_sp: string;
  winner: string;
  home_p: number;
  away_p: number;
  conf: ConfidenceLevel;
  exp: string;
  venue_name?: string;
  status?: string; // 'SCHEDULED' | 'LOCKED' | 'FINAL'
  prediction_id?: string;
  model_version?: string;
  home_starter_era?: string | number;
  away_starter_era?: string | number;
  home_starter_fip?: string | number;
  away_starter_fip?: string | number;
  home_starter_k9?: string | number;
  away_starter_k9?: string | number;
  home_ops_30d?: number;
  away_ops_30d?: number;
  home_bullpen_era?: number;
  away_bullpen_era?: number;
  park_factor?: number;
  home_lineup_status?: 'confirmed' | 'projected' | 'missing';
  away_lineup_status?: 'confirmed' | 'projected' | 'missing';
  home_lineup?: string[];
  away_lineup?: string[];
  key_factors?: string[];
  risks?: string[];
  explanation_breakdown?: FactorBreakdown[];
  nine_pillars?: NinePillarsMatrix;
  post_mortem?: PostMortemDiagnostic;
  actual_result?: {
    home_score: number;
    away_score: number;
    winner: string;
    is_hit: boolean;
    graded_at: string;
    units_won: number;
  };
  sha256_hash?: string;
  locked_at?: string;
  data_quality_score?: number;
  data_quality?: string | Record<string, string | number>;
  season_phase?: string;
}


export interface ModelBenchmark {
  id: string;
  name: string;
  algorithm: string;
  version: string;
  training_seasons: string;
  samples_n: number;
  accuracy: number;
  log_loss: number;
  brier_score: number;
  roc_auc: number;
  roi_flat_pct: number;
  is_champion: boolean;
  status: 'active' | 'challenger' | 'deprecated';
}

export interface TrackingPanelData {
  updated_at: string;
  n_graded: number;
  n_pending: number;
  hits: number;
  misses: number;
  accuracy: number;
  record: string;
  units_flat: number;
  current_streak?: string;
  best_streak: number;
  worst_streak: number;
  last_10: string;
  by_confidence: {
    LOW?: { n: number; hits: number; acc: number; units?: number };
    MEDIUM?: { n: number; hits: number; acc: number; units?: number };
    HIGH?: { n: number; hits: number; acc: number; units?: number };
  };
}

export interface ChampionMetrics {
  n: number;
  accuracy: number;
  log_loss: number;
  brier: number;
  auc: number;
  home_win_rate_actual: number;
  home_win_rate_pred: number;
  acc_conf_55_60: number;
  n_conf_55_60: number;
  acc_conf_60_65: number;
  n_conf_60_65: number;
  acc_conf_65plus: number;
  n_conf_65plus: number;
}

export interface ChampionModel {
  version: string;
  model_path?: string;
  promoted_at: string;
  phase?: string;
  metrics: ChampionMetrics;
}

export interface IntelData {
  refreshed_at: string;
  rosters: number;
  transactions: number;
  standings: number;
  schedule: number;
  headlines?: number;
  roster_snapshots?: number;
}

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
  label_es: string;
  category: 'team' | 'pitcher' | 'bullpen' | 'park' | 'lineup';
}

export interface TeamMeta {
  abbr: string;
  name: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  league: 'AL' | 'NL';
  division: 'East' | 'Central' | 'West';
}

export type SentimentLabel = 'positive' | 'negative' | 'neutral'

export interface Signal {
  doc_id: string
  source: 'news' | 'twitter'
  published_at: string
  tickers: string[]
  scope: 'company' | 'market'
  sentiment_score: number
  sentiment_label: SentimentLabel
  event_type: string
  event_confidence: number
  impact_score: number
  evidence: string[]
  text?: string
  method: { sentiment: string; event: string }
}

export interface Params {
  decay: number
  tilt: number
  market_gamma: number
  alpha: number
  max_turnover: number
  min_weight: number
  max_weight: number
  cost_bps: number
}

export const DEFAULT_PARAMS: Params = {
  decay: 0.8,
  tilt: 0.8,
  market_gamma: 0.6,
  alpha: 0.5,
  max_turnover: 0.1,
  min_weight: 0.02,
  max_weight: 0.15,
  cost_bps: 5,
}

export interface DayRecord {
  date: string
  weights: Record<string, number>
  scores: Record<string, number>
  market_score: number
  turnover: number
  cost_pct: number
  movers: { ticker: string; delta: number }[]
}
export interface PerfPoint {
  date: string
  portfolio: number
  equal_weight: number
}
export interface Metrics {
  total_return_pct: number
  vol_ann_pct: number
  sharpe: number | null
  max_drawdown_pct: number
}
export interface RebalanceResult {
  params: Params
  price_source: 'yahoo' | 'synthetic-fallback'
  tickers: string[]
  history: DayRecord[]
  performance: PerfPoint[]
  metrics: {
    portfolio: Metrics
    equal_weight: Metrics
    active_return_pct: number
    avg_daily_turnover_pct: number
    total_cost_pct: number
    information_coefficient: number | null
    ic_pairs: number
  }
  latest: { ticker: string; weight: number }[]
  notes: string[]
}

export interface Health {
  status: string
  store: string
  signals: number
  dailyRows: number
}

async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(body?.details?.join('; ') ?? body?.error ?? `HTTP ${r.status}`)
  }
  return r.json() as Promise<T>
}

export const getJson = <T,>(path: string, signal?: AbortSignal) => fetch(path, { signal }).then((r) => parse<T>(r))

export const analyzeText = (text: string) =>
  fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then((r) => parse<Signal>(r))

// ---- Module B (stress testing) ----
export interface StressShock {
  equity_pct: number
  rate_bps: number
  credit_spread_bps: number
}
export interface StressEventInfo {
  event_type: string
  impact_score: number
  tickers: string[]
  sentiment_score?: number
  doc_id?: string
  text?: string
  published_at?: string
}
export interface PositionResult {
  position_id: string
  instrument: string
  asset_type: string
  sector: string
  issuer_or_ticker: string
  exposure: number
  before: number
  after: number
  delta: number
  delta_pct: number
}
export interface Bucket {
  name: string
  before: number
  after: number
  delta: number
  delta_pct: number
}
export interface StressResult {
  event: StressEventInfo
  triggered: boolean
  scale: number
  scope: 'market-wide' | 'issuer-specific'
  shocks: StressShock
  portfolio: { before: number; after: number; delta: number; delta_pct: number }
  by_asset_type: Bucket[]
  by_sector: Bucket[]
  top_losers: PositionResult[]
  positions: PositionResult[]
}
export interface TriggerRow extends StressEventInfo {
  scope: string
  portfolio_delta_usd_m: number
  portfolio_delta_pct: number
}
export const EVENT_TYPES = ['Geopolitical', 'Macroeconomic', 'Credit Event', 'Regulatory', 'Earnings', 'Merger/Acquisition', 'Product Launch'] as const

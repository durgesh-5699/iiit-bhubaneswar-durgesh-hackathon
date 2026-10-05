import { Position, Shock, ShockConfig } from "./portfolio";

export interface StressEvent {
  event_type: string;
  impact_score: number;
  tickers: string[]; // empty = market-wide event
  sentiment_score?: number;
  doc_id?: string;
  text?: string;
  published_at?: string;
}

/** Share of the shock felt by positions in the same sector as the affected company (contagion). */
export const SPILLOVER = 0.3;
const r2 = (n: number) => Math.round(n * 100) / 100;
const NO_SHOCK: Shock = { equity_pct: 0, rate_bps: 0, credit_spread_bps: 0 };

/**
 * A stress test fires for severe AND adverse events. Impact is a severity score, so a high-impact rating UPGRADE
 * (positive sentiment) must not stress the book. Set adverseOnly=false to ignore direction.
 */
export function isTrigger(e: Pick<StressEvent, "impact_score" | "sentiment_score" | "event_type">, cfg: ShockConfig, adverseOnly = true, above = cfg.trigger.min_impact): boolean {
  if (e.event_type === "Other" || !cfg.event_shocks[e.event_type]) return false;
  return e.impact_score > above && (!adverseOnly || (e.sentiment_score ?? -1) < 0);
}

/** How much of the shock a position feels: market-wide events hit everything; company events hit the issuer fully, its sector partially. */
export function exposureFactor(p: Position, e: StressEvent, sectorOf: (ticker: string) => string | undefined): number {
  if (!e.tickers.length) return 1;
  if (e.tickers.includes(p.issuer_or_ticker)) return 1;
  const sectors = new Set(e.tickers.map(sectorOf));
  return sectors.has(p.sector) ? SPILLOVER : 0;
}

/**
 * Simplified, transparent revaluation (USD millions). All shocks are adverse magnitudes at impact 10, scaled by impact/10:
 *  equity      dMV = MV * equity% * beta
 *  gov bond    dMV = -MV * duration * rate
 *  corp bond   dMV = -MV * duration * (rate + spread)
 *  loan        dMV = -MV * duration * (rate + spread)  -  MV * LGD * spread * 0.5   (extra expected credit loss)
 *  derivative  dMV = +DV01 * rate                       (positive DV01 = pay-fixed: gains when rates rise)
 */
export function revalue(p: Position, s: Shock, scale: number, f: number): number {
  const rate = s.rate_bps / 1e4, spread = s.credit_spread_bps / 1e4, mv = p.market_value_usd_m;
  let d = 0;
  switch (p.asset_type) {
    case "Equity": d = mv * (s.equity_pct / 100) * p.equity_beta; break;
    case "Government Bond": d = -mv * p.duration_yrs * rate; break;
    case "Corporate Bond": d = -mv * p.duration_yrs * (rate + spread); break;
    case "Loan": d = -mv * p.duration_yrs * (rate + spread) - mv * p.lgd * spread * 0.5; break;
    case "Derivative": d = (p.dv01_usd_k / 1000) * s.rate_bps; break;
  }
  return d * scale * f;
}

export interface PositionResult {
  position_id: string; instrument: string; asset_type: string; sector: string; issuer_or_ticker: string;
  exposure: number; before: number; after: number; delta: number; delta_pct: number;
}
export interface Bucket { name: string; before: number; after: number; delta: number; delta_pct: number }
export interface StressResult {
  event: StressEvent;
  triggered: boolean;
  scale: number;
  scope: "market-wide" | "issuer-specific";
  shocks: Shock; // after scaling
  portfolio: { before: number; after: number; delta: number; delta_pct: number };
  by_asset_type: Bucket[];
  by_sector: Bucket[];
  top_losers: PositionResult[];
  positions: PositionResult[];
}

const bucket = (name: string, rows: PositionResult[]): Bucket => {
  const before = rows.reduce((a, x) => a + x.before, 0), after = rows.reduce((a, x) => a + x.after, 0);
  return { name, before: r2(before), after: r2(after), delta: r2(after - before), delta_pct: before ? r2(((after - before) / Math.abs(before)) * 100) : 0 };
};
const group = (rows: PositionResult[], key: (r: PositionResult) => string): Bucket[] =>
  [...new Set(rows.map(key))].map((k) => bucket(k, rows.filter((r) => key(r) === k))).sort((a, b) => a.delta - b.delta);

export function runStress(portfolio: Position[], cfg: ShockConfig, event: StressEvent, sectorOf: (t: string) => string | undefined, adverseOnly = true): StressResult {
  const base = cfg.event_shocks[event.event_type] ?? NO_SHOCK;
  const scale = Math.min(10, Math.max(0, event.impact_score)) / 10;
  const positions: PositionResult[] = portfolio.map((p) => {
    const f = exposureFactor(p, event, sectorOf);
    const d = revalue(p, base, scale, f);
    const before = p.market_value_usd_m;
    return { position_id: p.position_id, instrument: p.instrument, asset_type: p.asset_type, sector: p.sector, issuer_or_ticker: p.issuer_or_ticker,
      exposure: f, before: r2(before), after: r2(before + d), delta: r2(d), delta_pct: before ? r2((d / Math.abs(before)) * 100) : 0 };
  });
  const total = bucket("Portfolio", positions);
  return {
    event, triggered: isTrigger(event, cfg, adverseOnly), scale,
    scope: event.tickers.length ? "issuer-specific" : "market-wide",
    shocks: { equity_pct: r2(base.equity_pct * scale), rate_bps: r2(base.rate_bps * scale), credit_spread_bps: r2(base.credit_spread_bps * scale) },
    portfolio: { before: total.before, after: total.after, delta: total.delta, delta_pct: total.delta_pct },
    by_asset_type: group(positions, (r) => r.asset_type),
    by_sector: group(positions, (r) => r.sector),
    top_losers: [...positions].sort((a, b) => a.delta - b.delta).slice(0, 5).filter((x) => x.delta < 0),
    positions,
  };
}

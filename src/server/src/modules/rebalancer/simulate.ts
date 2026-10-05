import { DailySentiment } from "../../aggregation/aggregate";
import { Stock } from "../../types";
import { PriceData } from "./prices";
import { applyCaps, stepToward, sum, targetWeights, turnoverOf } from "./weights";

export interface RebalancerParams {
  decay: number; // daily memory of past sentiment (0.8 ~ 3-day half-life)
  tilt: number; // how aggressively score moves weights
  market_gamma: number; // market-wide sentiment rotates between high- and low-beta names
  alpha: number; // fraction of the gap to target closed per day
  max_turnover: number; // max one-way turnover per day
  min_weight: number;
  max_weight: number;
  cost_bps: number; // transaction cost per unit of one-way turnover
}
export const DEFAULT_PARAMS: RebalancerParams = { decay: 0.8, tilt: 0.8, market_gamma: 0.6, alpha: 0.5, max_turnover: 0.1, min_weight: 0.02, max_weight: 0.15, cost_bps: 5 };

export function validateParams(p: RebalancerParams, n: number): string | null {
  if (p.min_weight * n > 1 + 1e-9) return `min_weight too high: ${n} stocks x ${p.min_weight} exceeds 100%`;
  if (p.max_weight * n < 1 - 1e-9) return `max_weight too low: ${n} stocks x ${p.max_weight} is below 100%`;
  if (p.min_weight > p.max_weight) return "min_weight must be <= max_weight";
  return null;
}

export interface DayRecord {
  date: string;
  weights: Record<string, number>;
  scores: Record<string, number>; // decayed sentiment conviction per stock (+ market rotation)
  market_score: number;
  turnover: number;
  cost_pct: number;
  movers: { ticker: string; delta: number }[]; // biggest weight changes vs. start of day
}
export interface PerfPoint { date: string; portfolio: number; equal_weight: number }
export interface Metrics { total_return_pct: number; vol_ann_pct: number; sharpe: number | null; max_drawdown_pct: number }
export interface RebalanceResult {
  params: RebalancerParams;
  price_source: PriceData["source"];
  tickers: string[];
  history: DayRecord[];
  performance: PerfPoint[];
  metrics: { portfolio: Metrics; equal_weight: Metrics; active_return_pct: number; avg_daily_turnover_pct: number; total_cost_pct: number; information_coefficient: number | null; ic_pairs: number };
  latest: { ticker: string; weight: number }[];
  notes: string[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const nextDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

/** Evidence-scaled sentiment shock: more (and more credible) documents -> shock closer to the raw sentiment. */
export function shockOf(row: DailySentiment): number {
  const evidence = row.n_news + 0.4 * row.n_tweets;
  return row.sentiment * (1 - Math.pow(0.5, evidence));
}

function metricsOf(values: number[]): Metrics {
  const rets = values.slice(1).map((v, i) => v / values[i] - 1);
  const mean = rets.length ? sum(rets) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(sum(rets.map((r) => (r - mean) ** 2)) / (rets.length - 1)) : 0;
  let peak = values[0], mdd = 0;
  for (const v of values) { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
  return {
    total_return_pct: r2((values[values.length - 1] / values[0] - 1) * 100),
    vol_ann_pct: r2(sd * Math.sqrt(252) * 100),
    sharpe: sd > 0 ? r2((mean / sd) * Math.sqrt(252)) : null, // rf = 0, tiny sample: indicative only
    max_drawdown_pct: r2(mdd * 100),
  };
}

function pearson(x: number[], y: number[]): number | null {
  if (x.length < 10) return null;
  const mx = sum(x) / x.length, my = sum(y) / y.length;
  const sxy = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
  const sxx = sum(x.map((v) => (v - mx) ** 2)), syy = sum(y.map((v) => (v - my) ** 2));
  return sxx > 0 && syy > 0 ? r2(sxy / Math.sqrt(sxx * syy)) : null;
}

/**
 * Module A: tactical sentiment-driven rebalancing of an equal-weight mock index.
 * Each calendar day: decay old conviction, add today's sentiment shock. On trading days: target = tilt(equal weight, conviction),
 * capped; trade part of the way (alpha) with a turnover cap. Weights set at day t's close earn the return t -> t+1 (no look-ahead).
 */
export function runRebalancer(input: { params: RebalancerParams; stocks: Stock[]; daily: DailySentiment[]; prices: PriceData }): RebalanceResult {
  const { params: p, stocks, daily, prices } = input;
  const tickers = stocks.map((s) => s.ticker).filter((t) => prices.tickers.includes(t));
  const n = tickers.length;
  const err = validateParams(p, n);
  if (err) throw new RangeError(err);

  const beta = tickers.map((t) => stocks.find((s) => s.ticker === t)!.beta);
  const base = new Array<number>(n).fill(1 / n);
  const byDate = new Map<string, Map<string, DailySentiment>>();
  for (const d of daily) {
    if (!byDate.has(d.date)) byDate.set(d.date, new Map());
    byDate.get(d.date)!.set(d.ticker, d);
  }
  const dates = prices.dates;
  const firstSent = [...byDate.keys()].sort()[0] ?? dates[0];
  const startIdx = dates.findIndex((d) => d >= firstSent);
  if (startIdx < 0) throw new RangeError("No overlap between sentiment dates and price dates");
  const idxOf = new Map(dates.map((d, i) => [d, i]));
  const lastDate = dates[dates.length - 1];

  let c = new Array<number>(n).fill(0);
  let m = 0;
  let holdings: number[] | null = null;
  let pv = 100, ev = 100;
  let prevScores: number[] | null = null;
  const history: DayRecord[] = [];
  const performance: PerfPoint[] = [];
  const icX: number[] = [], icY: number[] = [];
  let costSum = 0, turnSum = 0, trades = 0;

  for (let day = firstSent; day <= lastDate; day = nextDay(day)) {
    const rows = byDate.get(day);
    c = c.map((v, i) => p.decay * v + (rows?.has(tickers[i]) ? shockOf(rows.get(tickers[i])!) : 0));
    m = p.decay * m + (rows?.has("MARKET") ? shockOf(rows.get("MARKET")!) : 0);

    const k = idxOf.get(day);
    if (k === undefined || k < startIdx) continue; // not a trading day

    // 1) realize the return of yesterday's weights, let holdings drift
    let current = base;
    let cost = 0;
    if (holdings) {
      const rets = tickers.map((t) => prices.close[t][k] / prices.close[t][k - 1] - 1);
      const rp = sum(holdings.map((h, i) => h * rets[i]));
      pv *= 1 + rp;
      ev *= 1 + sum(rets) / n;
      current = holdings.map((h, i) => (h * (1 + rets[i])) / (1 + rp));
      if (prevScores) rets.forEach((r, i) => { icX.push(prevScores![i]); icY.push(r); });
    }

    // 2) new target from conviction (+ market-wide rotation by beta) and trade toward it
    const scores = c.map((v, i) => v + p.market_gamma * m * (beta[i] - 1));
    const target = targetWeights(scores, base, p.tilt, p.min_weight, p.max_weight);
    const next = stepToward(current, target, p.alpha, p.max_turnover, p.min_weight, p.max_weight);
    const turnover = turnoverOf(current, next);
    if (holdings) { cost = (turnover * p.cost_bps) / 10000; pv *= 1 - cost; costSum += cost; turnSum += turnover; trades++; }

    holdings = next;
    prevScores = scores;
    history.push({
      date: day,
      weights: Object.fromEntries(tickers.map((t, i) => [t, r4(next[i])])),
      scores: Object.fromEntries(tickers.map((t, i) => [t, r2(scores[i])])),
      market_score: r2(m),
      turnover: r4(turnover),
      cost_pct: r4(cost * 100),
      movers: tickers.map((t, i) => ({ ticker: t, delta: r4(next[i] - current[i]) })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3),
    });
    performance.push({ date: day, portfolio: r2(pv), equal_weight: r2(ev) });
  }

  const last = history[history.length - 1];
  const mp = metricsOf(performance.map((x) => x.portfolio)), me = metricsOf(performance.map((x) => x.equal_weight));
  return {
    params: p, price_source: prices.source, tickers, history, performance,
    metrics: {
      portfolio: mp, equal_weight: me, active_return_pct: r2(mp.total_return_pct - me.total_return_pct),
      avg_daily_turnover_pct: r2(trades ? (turnSum / trades) * 100 : 0), total_cost_pct: r2(costSum * 100),
      information_coefficient: pearson(icX, icY), ic_pairs: icX.length,
    },
    latest: tickers.map((t) => ({ ticker: t, weight: last.weights[t] })).sort((a, b) => b.weight - a.weight),
    notes: [
      "Benchmark: equal-weight index rebalanced daily, no costs. Strategy pays cost_bps on turnover.",
      "Weights decided at day t's close earn the t -> t+1 return (no look-ahead).",
      prices.source === "synthetic-fallback"
        ? "Prices are SYNTHETIC fallback data (run `npm run fetch:prices` for real Yahoo prices)."
        : "Prices are real daily closes from Yahoo Finance; sentiment is from synthetic news/tweets, so performance is a pipeline demo, not evidence of alpha.",
    ],
  };
}

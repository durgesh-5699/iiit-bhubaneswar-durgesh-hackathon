import test from "node:test";
import assert from "node:assert/strict";
import { applyCaps, stepToward, sum, targetWeights, turnoverOf } from "./weights";
import { DEFAULT_PARAMS, runRebalancer, shockOf, validateParams } from "./simulate";
import { PriceData } from "./prices";
import { DailySentiment } from "../../aggregation/aggregate";
import { Stock } from "../../types";

const close = (a: number[], b: number[], eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < eps);

test("applyCaps: sums to 1 and respects bounds even for extreme inputs", () => {
  const w = applyCaps([100, 1, 1, 1, 1, 1, 1, 1, 0.0001, 0.0001], 0.02, 0.3);
  assert.ok(Math.abs(sum(w) - 1) < 1e-9);
  for (const x of w) assert.ok(x >= 0.02 - 1e-9 && x <= 0.3 + 1e-9);
});

test("targetWeights: positive sentiment raises weight, negative lowers it, zero keeps equal", () => {
  const base = [0.25, 0.25, 0.25, 0.25];
  const w = targetWeights([1, -1, 0, 0], base, 0.8, 0.02, 0.5);
  assert.ok(w[0] > 0.25 && w[1] < 0.25);
  assert.ok(close(targetWeights([0, 0, 0, 0], base, 0.8, 0.02, 0.5), base));
});

test("stepToward: respects the turnover cap and keeps weights summing to 1", () => {
  const cur = [0.25, 0.25, 0.25, 0.25], tgt = [0.7, 0.1, 0.1, 0.1];
  const nxt = stepToward(cur, tgt, 1, 0.1, 0.02, 0.8);
  assert.ok(turnoverOf(cur, nxt) <= 0.1 + 1e-9);
  assert.ok(Math.abs(sum(nxt) - 1) < 1e-9);
});

test("shockOf: more evidence -> stronger shock, sign preserved", () => {
  const row = (n_news: number, s: number): DailySentiment => ({ ticker: "X", date: "d", sentiment: s, n_news, n_tweets: 0, avg_impact: 1, max_impact: 1 });
  assert.ok(shockOf(row(3, 0.8)) > shockOf(row(1, 0.8)));
  assert.ok(shockOf(row(1, -0.5)) < 0);
});

test("validateParams rejects infeasible caps", () => {
  assert.ok(validateParams({ ...DEFAULT_PARAMS, min_weight: 0.2 }, 15));
  assert.ok(validateParams({ ...DEFAULT_PARAMS, max_weight: 0.05 }, 15));
  assert.equal(validateParams(DEFAULT_PARAMS, 15), null);
});

// ---- end-to-end on a tiny hand-made market ----
const stocks: Stock[] = ["AAA", "BBB", "CCC", "DDD"].map((t) => ({ ticker: t, name: t, aliases: [], sector: "x", beta: 1 }));
const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"];
const flat = (): PriceData => ({ source: "synthetic-fallback", dates, tickers: stocks.map((s) => s.ticker),
  close: Object.fromEntries(stocks.map((s, j) => [s.ticker, dates.map((_, k) => 100 * (1 + 0.01 * (j - 1.5)) ** k)])) });
const row = (ticker: string, date: string, sentiment: number): DailySentiment => ({ ticker, date, sentiment, n_news: 2, n_tweets: 0, avg_impact: 5, max_impact: 5 });

test("rebalancer: positive-news stock gains weight, negative-news stock loses weight, weights always valid", () => {
  const daily = [row("AAA", "2026-09-01", 0.9), row("BBB", "2026-09-01", -0.9)];
  const params = { ...DEFAULT_PARAMS, max_weight: 0.6 }; // 4 stocks need max_weight >= 25%
  const res = runRebalancer({ params, stocks, daily, prices: flat() });
  const last = res.history[res.history.length - 1].weights;
  assert.ok(last.AAA > 0.25 && last.BBB < 0.25);
  for (const h of res.history) {
    const w = Object.values(h.weights);
    assert.ok(Math.abs(sum(w) - 1) < 1e-3);
    for (const x of w) assert.ok(x >= params.min_weight - 1e-3 && x <= params.max_weight + 1e-3);
  }
  assert.equal(res.performance[0].portfolio, 100);
});

test("rebalancer: with no tilt and no costs it reproduces the equal-weight benchmark exactly", () => {
  const params = { ...DEFAULT_PARAMS, tilt: 0, market_gamma: 0, alpha: 1, max_turnover: 1, cost_bps: 0, max_weight: 1 };
  const res = runRebalancer({ params, stocks, daily: [row("AAA", "2026-09-01", 0.9)], prices: flat() });
  for (const p of res.performance) assert.ok(Math.abs(p.portfolio - p.equal_weight) < 0.02, `${p.date}: ${p.portfolio} vs ${p.equal_weight}`);
});

test("rebalancer: turnover never exceeds the cap", () => {
  const daily = stocks.map((s, i) => row(s.ticker, "2026-09-01", i % 2 ? -1 : 1));
  const res = runRebalancer({ params: { ...DEFAULT_PARAMS, max_turnover: 0.05, max_weight: 0.6 }, stocks, daily, prices: flat() });
  for (const h of res.history) assert.ok(h.turnover <= 0.05 + 0.01);
});

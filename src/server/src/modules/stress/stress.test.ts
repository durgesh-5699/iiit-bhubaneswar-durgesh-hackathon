import test from "node:test";
import assert from "node:assert/strict";
import { exposureFactor, isTrigger, revalue, runStress, SPILLOVER } from "./engine";
import type { Position, ShockConfig } from "./portfolio";

const pos = (o: Partial<Position>): Position => ({ position_id: "P", asset_type: "Equity", instrument: "x", issuer_or_ticker: "AAA", sector: "Tech", currency: "USD",
  market_value_usd_m: 100, duration_yrs: 0, rating: "A", pd: 0, lgd: 0, equity_beta: 1, dv01_usd_k: 0, ...o });
const cfg: ShockConfig = { trigger: { min_impact: 7 }, event_shocks: {
  Macroeconomic: { equity_pct: -10, rate_bps: 200, credit_spread_bps: 75 },
  Geopolitical: { equity_pct: -15, rate_bps: -50, credit_spread_bps: 150 },
} };
const sectorOf = (t: string) => ({ AAA: "Tech", BBB: "Energy" } as Record<string, string>)[t];

test("equity: -10% shock x beta 1.5 at impact 10 loses 15%", () => {
  const d = revalue(pos({ equity_beta: 1.5 }), { equity_pct: -10, rate_bps: 0, credit_spread_bps: 0 }, 1, 1);
  assert.ok(Math.abs(d - -15) < 1e-9);
});

test("government bond: duration 5, +200bp loses 10%; falling rates gain", () => {
  const gov = pos({ asset_type: "Government Bond", duration_yrs: 5 });
  assert.ok(Math.abs(revalue(gov, { equity_pct: 0, rate_bps: 200, credit_spread_bps: 0 }, 1, 1) - -10) < 1e-9);
  assert.ok(revalue(gov, { equity_pct: 0, rate_bps: -50, credit_spread_bps: 0 }, 1, 1) > 0);
});

test("pay-fixed swap (positive DV01) GAINS when rates rise; receive-fixed loses", () => {
  const payer = pos({ asset_type: "Derivative", dv01_usd_k: 200 });
  const receiver = pos({ asset_type: "Derivative", dv01_usd_k: -200 });
  const s = { equity_pct: 0, rate_bps: 100, credit_spread_bps: 0 };
  assert.ok(Math.abs(revalue(payer, s, 1, 1) - 20) < 1e-9);
  assert.ok(Math.abs(revalue(receiver, s, 1, 1) - -20) < 1e-9);
});

test("loan loses rate+spread duration effect plus extra credit loss", () => {
  const loan = pos({ asset_type: "Loan", duration_yrs: 3, lgd: 0.5 });
  const d = revalue(loan, { equity_pct: 0, rate_bps: 0, credit_spread_bps: 100 }, 1, 1);
  assert.ok(Math.abs(d - (-100 * 3 * 0.01 - 100 * 0.5 * 0.01 * 0.5)) < 1e-9); // -3.0 - 0.25
});

test("shock scales linearly with impact / 10", () => {
  const p = pos({});
  const full = runStress([p], cfg, { event_type: "Geopolitical", impact_score: 10, tickers: [] }, sectorOf);
  const half = runStress([p], cfg, { event_type: "Geopolitical", impact_score: 5, tickers: [] }, sectorOf);
  assert.ok(Math.abs(half.portfolio.delta * 2 - full.portfolio.delta) < 0.02);
});

test("exposure: market-wide hits all; company event hits issuer fully, same sector partially, others not at all", () => {
  const e = { event_type: "Macroeconomic", impact_score: 9, tickers: ["AAA"] };
  assert.equal(exposureFactor(pos({ issuer_or_ticker: "AAA" }), e, sectorOf), 1);
  assert.equal(exposureFactor(pos({ issuer_or_ticker: "ZZZ", sector: "Tech" }), e, sectorOf), SPILLOVER);
  assert.equal(exposureFactor(pos({ issuer_or_ticker: "BBB", sector: "Energy" }), e, sectorOf), 0);
  assert.equal(exposureFactor(pos({ issuer_or_ticker: "BBB", sector: "Energy" }), { ...e, tickers: [] }, sectorOf), 1);
});

test("trigger: needs impact > 7 AND adverse sentiment; unknown event types never trigger", () => {
  assert.equal(isTrigger({ event_type: "Geopolitical", impact_score: 8, sentiment_score: -0.8 }, cfg), true);
  assert.equal(isTrigger({ event_type: "Geopolitical", impact_score: 7, sentiment_score: -0.8 }, cfg), false);
  assert.equal(isTrigger({ event_type: "Geopolitical", impact_score: 9, sentiment_score: 0.8 }, cfg), false); // favourable
  assert.equal(isTrigger({ event_type: "Geopolitical", impact_score: 9, sentiment_score: 0.8 }, cfg, false), true);
  assert.equal(isTrigger({ event_type: "Other", impact_score: 10, sentiment_score: -1 }, cfg), false);
});

test("portfolio totals equal the sum of positions and of every grouping", () => {
  const book = [pos({}), pos({ position_id: "Q", asset_type: "Government Bond", duration_yrs: 7, sector: "Sovereign" }), pos({ position_id: "R", asset_type: "Derivative", dv01_usd_k: 20, sector: "Rates" })];
  const r = runStress(book, cfg, { event_type: "Macroeconomic", impact_score: 9, tickers: [], sentiment_score: -0.8 }, sectorOf);
  const sum = (xs: { delta: number }[]) => xs.reduce((a, x) => a + x.delta, 0);
  assert.ok(Math.abs(sum(r.positions) - r.portfolio.delta) < 0.02);
  assert.ok(Math.abs(sum(r.by_asset_type) - r.portfolio.delta) < 0.02);
  assert.ok(Math.abs(sum(r.by_sector) - r.portfolio.delta) < 0.02);
  assert.equal(r.triggered, true);
  assert.ok(r.portfolio.after < r.portfolio.before);
});

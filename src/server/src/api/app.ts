import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";
import { cleanText } from "../ingestion/clean";
import { EntityLinker } from "../ingestion/entityLinker";
import { loadStocks } from "../ingestion/loaders";
import { analyze, EngineOptions } from "../nlp/engine";
import { DEFAULT_PARAMS, runRebalancer, validateParams } from "../modules/rebalancer/simulate";
import { loadPrices, PriceData } from "../modules/rebalancer/prices";
import { isTrigger, runStress } from "../modules/stress/engine";
import type { StressEvent } from "../modules/stress/engine";
import { loadPortfolio, loadShockConfig } from "../modules/stress/portfolio";
import { Store } from "../store/store";
import { Doc } from "../types";
import type { Signal } from "../nlp/signal";

const SignalQuery = z.object({
  ticker: z.string().toUpperCase().optional(),
  event_type: z.string().optional(),
  source: z.enum(["news", "twitter"]).optional(),
  scope: z.enum(["company", "market"]).optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  min_impact: z.coerce.number().min(1).max(10).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
const RangeQuery = z.object({ from: z.string().optional(), to: z.string().optional() });
const RebalanceQuery = z.object({
  decay: z.coerce.number().min(0).max(0.98).optional(),
  tilt: z.coerce.number().min(0).max(3).optional(),
  market_gamma: z.coerce.number().min(0).max(2).optional(),
  alpha: z.coerce.number().min(0.05).max(1).optional(),
  max_turnover: z.coerce.number().min(0.01).max(1).optional(),
  min_weight: z.coerce.number().min(0).max(0.2).optional(),
  max_weight: z.coerce.number().min(0.05).max(1).optional(),
  cost_bps: z.coerce.number().min(0).max(100).optional(),
});
const TriggerQuery = z.object({
  above: z.coerce.number().min(0).max(9.99).optional(),
  adverse_only: z.enum(["true", "false"]).default("true"),
});
const ScenarioQuery = z.object({
  event_type: z.enum(["Geopolitical", "Macroeconomic", "Credit Event", "Merger/Acquisition", "Product Launch", "Earnings", "Regulatory"]),
  impact: z.coerce.number().min(1).max(10),
  ticker: z.string().toUpperCase().optional(),
});
const AnalyzeBody = z.object({ text: z.string().trim().min(3).max(2000), source: z.enum(["news", "twitter"]).default("news") });

export function createApp(store: Store, engine: EngineOptions = {}) {
  const stocks = loadStocks();
  const linker = new EntityLinker(stocks);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (_req, res) => res.json({ status: "ok", store: store.name, ...(await store.counts()) }));
  app.get("/api/universe", (_req, res) => res.json({ count: stocks.length, data: stocks }));

  app.get("/api/signals", async (req, res) => {
    const data = await store.signals(SignalQuery.parse(req.query));
    res.json({ count: data.length, data });
  });
  app.get("/api/signals/:docId", async (req, res) => {
    const s = await store.signal(String(req.params.docId));
    s ? res.json(s) : res.status(404).json({ error: "signal not found" });
  });

  app.get("/api/sentiment/latest", async (_req, res) => { const data = await store.latest(); res.json({ count: data.length, data }); });
  app.get("/api/sentiment/:ticker", async (req, res) => {
    const { from, to } = RangeQuery.parse(req.query);
    const ticker = String(req.params.ticker).toUpperCase();
    const data = await store.series(ticker, from, to);
    res.json({ ticker, count: data.length, data });
  });

  app.get("/api/events", async (req, res) => {
    const q = SignalQuery.parse({ ...req.query, min_impact: req.query.min_impact ?? 8 });
    const data = (await store.signals(q)).filter((s) => s.event_type !== "Other");
    res.json({ count: data.length, min_impact: q.min_impact, data });
  });

  let prices: PriceData | null = null;
  app.get("/api/rebalance", async (req, res) => {
    const q = RebalanceQuery.parse(req.query);
    const params = { ...DEFAULT_PARAMS, ...Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) };
    prices ??= loadPrices(stocks.map((s) => s.ticker));
    const bad = validateParams(params, prices.tickers.length);
    if (bad) return res.status(400).json({ error: "invalid parameters", details: [bad] });
    const daily = (await Promise.all([...prices.tickers, "MARKET"].map((t) => store.series(t)))).flat();
    res.json(runRebalancer({ params, stocks, daily, prices }));
  });

  const portfolio = loadPortfolio();
  const shockCfg = loadShockConfig();
  const sectorByTicker = new Map(stocks.map((x) => [x.ticker, x.sector]));
  const sectorOf = (t: string) => sectorByTicker.get(t);
  const asEvent = (s: Signal): StressEvent => ({ event_type: s.event_type, impact_score: s.impact_score, tickers: s.tickers, sentiment_score: s.sentiment_score, doc_id: s.doc_id, text: s.text, published_at: s.published_at });

  app.get("/api/stress/portfolio", (_req, res) => {
    const r = runStress(portfolio, shockCfg, { event_type: "none", impact_score: 0, tickers: [] }, sectorOf);
    res.json({ positions: portfolio, total_usd_m: r.portfolio.before, by_asset_type: r.by_asset_type, by_sector: r.by_sector, trigger_above: shockCfg.trigger.min_impact });
  });

  app.get("/api/stress/triggers", async (req, res) => {
    const q = TriggerQuery.parse(req.query);
    const above = q.above ?? shockCfg.trigger.min_impact;
    const adverse = q.adverse_only === "true";
    const candidates = await store.signals({ min_impact: Math.floor(above) + 1, limit: 500 });
    const data = candidates.filter((s) => isTrigger(s, shockCfg, adverse, above)).map((s) => {
      const r = runStress(portfolio, shockCfg, asEvent(s), sectorOf, adverse);
      return { ...asEvent(s), scope: r.scope, portfolio_delta_usd_m: r.portfolio.delta, portfolio_delta_pct: r.portfolio.delta_pct };
    }).sort((a, b) => a.portfolio_delta_usd_m - b.portfolio_delta_usd_m);
    res.json({ count: data.length, above, adverse_only: adverse, data });
  });

  app.get("/api/stress/run", async (req, res) => {
    const docId = z.object({ doc_id: z.string().min(1) }).parse(req.query).doc_id;
    const s = await store.signal(docId);
    if (!s) return res.status(404).json({ error: "signal not found" });
    res.json(runStress(portfolio, shockCfg, asEvent(s), sectorOf));
  });

  app.get("/api/stress/scenario", (req, res) => {
    const q = ScenarioQuery.parse(req.query);
    if (q.ticker && !sectorByTicker.has(q.ticker)) return res.status(400).json({ error: "invalid request", details: [`ticker: ${q.ticker} is not in the index universe`] });
    res.json(runStress(portfolio, shockCfg, { event_type: q.event_type, impact_score: q.impact, tickers: q.ticker ? [q.ticker] : [], sentiment_score: -1 }, sectorOf));
  });

  app.post("/api/analyze", async (req, res) => {
    const { text, source } = AnalyzeBody.parse(req.body);
    const clean = cleanText(text);
    const tickers = linker.link(clean);
    const doc: Doc = { id: `LIVE-${Date.now()}`, source, origin: "api", published_at: new Date().toISOString(), title: null, text: clean, engagement: 0,
      tickers, scope: tickers.length ? "company" : "market" };
    const [signal] = await analyze([doc], engine);
    res.json(signal);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: "invalid request", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });
  return app;
}

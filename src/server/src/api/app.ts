import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";
import { cleanText } from "../ingestion/clean";
import { EntityLinker } from "../ingestion/entityLinker";
import { loadStocks } from "../ingestion/loaders";
import { analyze, EngineOptions } from "../nlp/engine";
import { Store } from "../store/store";
import { Doc } from "../types";

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
const AnalyzeBody = z.object({ text: z.string().trim().min(3).max(2000), source: z.enum(["news", "twitter"]).default("news") });

/** Builds the Express app. Endpoints are the "structured signals for downstream applications" the case study asks for. */
export function createApp(store: Store, engine: EngineOptions = {}) {
  const stocks = loadStocks();
  const linker = new EntityLinker(stocks);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (_req, res) => res.json({ status: "ok", store: store.name, ...(await store.counts()) }));
  app.get("/api/universe", (_req, res) => res.json({ count: stocks.length, data: stocks }));

  // Raw per-document signals, filterable. e.g. /api/signals?ticker=AAPL&min_impact=6
  app.get("/api/signals", async (req, res) => {
    const data = await store.signals(SignalQuery.parse(req.query));
    res.json({ count: data.length, data });
  });
  app.get("/api/signals/:docId", async (req, res) => {
    const s = await store.signal(String(req.params.docId));
    s ? res.json(s) : res.status(404).json({ error: "signal not found" });
  });

  // Module A feed: latest sentiment per ticker, and the daily series for one ticker (ticker=MARKET for market-wide news)
  app.get("/api/sentiment/latest", async (_req, res) => { const data = await store.latest(); res.json({ count: data.length, data }); });
  app.get("/api/sentiment/:ticker", async (req, res) => {
    const { from, to } = RangeQuery.parse(req.query);
    const ticker = String(req.params.ticker).toUpperCase();
    const data = await store.series(ticker, from, to);
    res.json({ ticker, count: data.length, data });
  });

  // Module B feed: high-impact events. min_impact is inclusive; default 8 means "impact score > 7".
  app.get("/api/events", async (req, res) => {
    const q = SignalQuery.parse({ ...req.query, min_impact: req.query.min_impact ?? 8 });
    const data = (await store.signals(q)).filter((s) => s.event_type !== "Other");
    res.json({ count: data.length, min_impact: q.min_impact, data });
  });

  // Real-time scoring of any text (used by the live demo box in the dashboard)
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

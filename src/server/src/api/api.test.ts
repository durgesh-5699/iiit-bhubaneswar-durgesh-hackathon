import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "./app";
import { FileStore } from "../store/fileStore";
import { buildAll } from "../pipeline/build";
import { aggregateDaily, weightOf } from "../aggregation/aggregate";
import { Signal } from "../nlp/signal";
import { Doc } from "../types";

let server: Server;
let base = "";

before(async () => {
  await buildAll(); // rules-only, offline, ~1s
  const store = await FileStore.open();
  server = createApp(store).listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => { server.close(); });

const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: (await r.json()) as any }; };

test("GET /health", async () => {
  const { status, body } = await get("/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.ok(body.signals > 100);
});

test("GET /api/signals filters by ticker and min_impact", async () => {
  const { body } = await get("/api/signals?ticker=aapl&min_impact=5");
  assert.ok(body.count > 0);
  for (const s of body.data) { assert.ok(s.tickers.includes("AAPL")); assert.ok(s.impact_score >= 5); }
});

test("GET /api/signals rejects bad params with 400", async () => {
  assert.equal((await get("/api/signals?min_impact=99")).status, 400);
  assert.equal((await get("/api/signals?source=email")).status, 400);
});

test("GET /api/sentiment/:ticker returns a date-sorted series in range", async () => {
  const { body } = await get("/api/sentiment/AAPL");
  assert.ok(body.count > 3);
  const dates = body.data.map((d: any) => d.date);
  assert.deepEqual(dates, [...dates].sort());
  for (const d of body.data) assert.ok(d.sentiment >= -1 && d.sentiment <= 1);
});

test("GET /api/sentiment/latest has one row per ticker", async () => {
  const { body } = await get("/api/sentiment/latest");
  const t = body.data.map((d: any) => d.ticker);
  assert.equal(new Set(t).size, t.length);
});

test("GET /api/events returns only high-impact classified events (> 7)", async () => {
  const { body } = await get("/api/events");
  assert.ok(body.count > 0);
  for (const s of body.data) { assert.ok(s.impact_score > 7); assert.notEqual(s.event_type, "Other"); }
});

test("POST /api/analyze scores arbitrary text in real time", async () => {
  const r = await fetch(base + "/api/analyze", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Regulators open antitrust probe into Apple" }) });
  const s: any = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(s.tickers, ["AAPL"]);
  assert.equal(s.event_type, "Regulatory");
  assert.equal(s.sentiment_label, "negative");
  const bad = await fetch(base + "/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "" }) });
  assert.equal(bad.status, 400);
});

test("aggregation: news outweighs tweets, viral tweets weigh slightly more", () => {
  assert.ok(weightOf({ source: "news" }) > weightOf({ source: "twitter" }));
  assert.ok(weightOf({ source: "twitter" }, 1000) > weightOf({ source: "twitter" }, 0));
  const mk = (id: string, source: Signal["source"], score: number): Signal => ({ doc_id: id, source, published_at: "2026-09-01T10:00:00Z", tickers: ["AAPL"], scope: "company",
    sentiment_score: score, sentiment_label: "neutral", event_type: "Earnings", event_confidence: 1, impact_score: 5, evidence: [], method: { sentiment: "x", event: "x" } });
  const docs = [] as Doc[];
  const [row] = aggregateDaily([mk("a", "news", 0.8), mk("b", "twitter", -0.8)], docs);
  assert.ok(row.sentiment > 0, "weighted mean should lean to the news item");
  assert.equal(row.n_news, 1); assert.equal(row.n_tweets, 1);
});

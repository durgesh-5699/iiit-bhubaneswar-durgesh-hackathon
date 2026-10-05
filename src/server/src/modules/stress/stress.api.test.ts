import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../../api/app";
import { FileStore } from "../../store/fileStore";
import { buildAll } from "../../pipeline/build";

let server: Server;
let base = "";
before(async () => {
  await buildAll();
  server = createApp(await FileStore.open()).listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => { server.close(); });
const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: (await r.json()) as any }; };

test("GET /api/stress/portfolio lists the 30-position book with totals", async () => {
  const { body } = await get("/api/stress/portfolio");
  assert.equal(body.positions.length, 30);
  assert.ok(body.total_usd_m > 500);
  const types = body.by_asset_type.map((b: any) => b.name).sort();
  assert.deepEqual(types, ["Corporate Bond", "Derivative", "Equity", "Government Bond", "Loan"]);
});

test("GET /api/stress/triggers returns only adverse events with impact > 7, worst first", async () => {
  const { body } = await get("/api/stress/triggers");
  assert.ok(body.count > 0);
  for (const e of body.data) { assert.ok(e.impact_score > 7); assert.ok(e.sentiment_score < 0); }
  const d = body.data.map((e: any) => e.portfolio_delta_usd_m);
  assert.deepEqual(d, [...d].sort((a: number, b: number) => a - b));
  const all = await get("/api/stress/triggers?adverse_only=false");
  assert.ok(all.body.count >= body.count);
});

test("GET /api/stress/run gives before/after for a detected event; 404 for unknown", async () => {
  const { body: t } = await get("/api/stress/triggers");
  const { status, body } = await get(`/api/stress/run?doc_id=${t.data[0].doc_id}`);
  assert.equal(status, 200);
  assert.equal(body.triggered, true);
  assert.ok(Math.abs(body.portfolio.before + body.portfolio.delta - body.portfolio.after) < 0.02);
  assert.equal((await get("/api/stress/run?doc_id=NOPE")).status, 404);
});

test("GET /api/stress/scenario: what-if works, scales with impact, validates input", async () => {
  const lo = (await get("/api/stress/scenario?event_type=Macroeconomic&impact=4")).body;
  const hi = (await get("/api/stress/scenario?event_type=Macroeconomic&impact=9")).body;
  assert.equal(hi.scope, "market-wide");
  assert.ok(Math.abs(hi.portfolio.delta) > Math.abs(lo.portfolio.delta));
  const co = (await get("/api/stress/scenario?event_type=Credit%20Event&impact=9&ticker=jpm")).body;
  assert.equal(co.scope, "issuer-specific");
  assert.ok(co.positions.some((p: any) => p.issuer_or_ticker === "JPM" && p.delta < 0));
  assert.equal((await get("/api/stress/scenario?event_type=Nonsense&impact=5")).status, 400);
  assert.equal((await get("/api/stress/scenario?event_type=Regulatory&impact=5&ticker=ZZZ")).status, 400);
});

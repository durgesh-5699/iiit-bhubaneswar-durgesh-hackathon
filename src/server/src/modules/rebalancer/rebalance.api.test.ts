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

test("GET /api/rebalance returns valid weights, performance and metrics", async () => {
  const { status, body } = await get("/api/rebalance");
  assert.equal(status, 200);
  assert.ok(body.history.length > 10);
  for (const h of body.history) {
    const w = Object.values(h.weights) as number[];
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 2e-3);
    for (const x of w) assert.ok(x >= body.params.min_weight - 1e-3 && x <= body.params.max_weight + 1e-3);
  }
  assert.equal(body.performance[0].portfolio, 100);
  assert.ok(body.latest.length === body.tickers.length);
  assert.ok(["yahoo", "synthetic-fallback"].includes(body.price_source));
});

test("GET /api/rebalance honours overrides and rejects bad params", async () => {
  const { body } = await get("/api/rebalance?tilt=1.5&max_turnover=0.05");
  assert.equal(body.params.tilt, 1.5);
  for (const h of body.history) assert.ok(h.turnover <= 0.05 + 0.01);
  assert.equal((await get("/api/rebalance?tilt=99")).status, 400);
  assert.equal((await get("/api/rebalance?min_weight=0.2")).status, 400); // 15 x 20% > 100%
});

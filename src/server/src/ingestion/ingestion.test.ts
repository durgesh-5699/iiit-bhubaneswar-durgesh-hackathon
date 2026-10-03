import test from "node:test";
import assert from "node:assert/strict";
import { EntityLinker } from "./entityLinker";
import { dedupe } from "./dedupe";
import { cleanText } from "./clean";
import { loadStocks } from "./loaders";
import { Doc } from "../types";

const linker = new EntityLinker(loadStocks());
const doc = (id: string, text: string, iso: string, source: Doc["source"] = "news"): Doc => ({
  id, source, origin: "x", published_at: iso, title: null, text, engagement: 0, tickers: [], scope: "market",
});

test("links cashtags and names/aliases", () => {
  assert.deepEqual(linker.link("$AAPL jumps after launch"), ["AAPL"]);
  assert.deepEqual(linker.link("Johnson & Johnson wins approval"), ["JNJ"]);
  assert.deepEqual(linker.link("J&J wins approval"), ["JNJ"]);
  assert.deepEqual(linker.link("Apple and Microsoft rally"), ["AAPL", "MSFT"]);
  assert.deepEqual(linker.link("Meta Platforms fined"), ["META"]);
});

test("does not link common words or bare tickers", () => {
  assert.deepEqual(linker.link("I baked an apple pie"), []);
  assert.deepEqual(linker.link("GS and KO are short tickers"), []);
  assert.deepEqual(linker.link("Oil spikes as tensions rise"), []);
});

test("cleanText strips urls, mentions, html and hashtag symbols", () => {
  assert.equal(cleanText("<b>Hi</b> @bob see https://x.co/a #stocks &amp; more"), "Hi see stocks & more");
});

test("dedupe drops near-identical news within 24h, keeps the earliest", () => {
  const a = doc("A", "Fed signals further rate hikes as inflation stays high. Investors reacted cautiously.", "2026-09-01T10:00:00Z");
  const b = doc("B", "Fed signals further rate hikes as inflation stays high. Investors reacted cautiously.", "2026-09-01T10:30:00Z");
  const { kept, removed } = dedupe([b, a]);
  assert.deepEqual(kept.map((d) => d.id), ["A"]);
  assert.equal(removed[0].duplicate_of, "A");
});

test("dedupe keeps same story after the window and different stories", () => {
  const a = doc("A", "Fed signals further rate hikes as inflation stays high.", "2026-09-01T10:00:00Z");
  const late = doc("L", "Fed signals further rate hikes as inflation stays high.", "2026-09-03T10:00:00Z");
  const other = doc("O", "Ceasefire agreement eases tensions and markets rally.", "2026-09-01T10:05:00Z");
  assert.equal(dedupe([a, late, other]).kept.length, 3);
});

import test from "node:test";
import assert from "node:assert/strict";
import { ruleSentiment } from "./sentiment";
import { ruleEvent } from "./events";
import { impactScore } from "./impact";
import { analyze } from "./engine";
import { Doc } from "../types";

const doc = (id: string, text: string, scope: Doc["scope"] = "company"): Doc => ({
  id, source: "news", origin: "x", published_at: "2026-09-01T00:00:00Z", title: null, text, engagement: 0, tickers: scope === "company" ? ["AAPL"] : [], scope,
});

test("sentiment: positive, negative, neutral", () => {
  assert.ok(ruleSentiment("Company beats estimates and raises guidance").score > 0.6);
  assert.ok(ruleSentiment("Company misses estimates and cuts annual outlook").score < -0.6);
  assert.equal(ruleSentiment("Company to report results on Tuesday").score, 0);
});

test("sentiment: negation flips polarity", () => {
  assert.ok(ruleSentiment("results were not great").score < 0);
});

test("sentiment: score is always within [-1, 1]", () => {
  const s = ruleSentiment("collapse default plunge bankrupt crash fraud war sanctions escalation recession");
  assert.ok(s.score >= -1 && s.score <= 1);
});

test("events: classifies each major class", () => {
  assert.equal(ruleEvent("Regulators open antitrust probe into Apple", "company").type, "Regulatory");
  assert.equal(ruleEvent("Fed signals more rate hikes as inflation stays high", "market").type, "Macroeconomic");
  assert.equal(ruleEvent("New sanctions announced as conflict widens", "market").type, "Geopolitical");
  assert.equal(ruleEvent("Rating agency downgrades issuer over rising debt", "company").type, "Credit Event");
  assert.equal(ruleEvent("Apple agrees to acquire rival in merger", "company").type, "Merger/Acquisition");
  assert.equal(ruleEvent("Apple unveils new product lineup", "company").type, "Product Launch");
  assert.equal(ruleEvent("nothing of interest here", "company").type, "Other");
});

test("impact: bounded 1-10, neutral is low, severe geopolitical is high", () => {
  assert.ok(impactScore("Geopolitical", -0.8, 1) >= 8);
  assert.ok(impactScore("Product Launch", 0.02, 0) <= 2);
  for (const e of ["Geopolitical", "Other", "Earnings"] as const) {
    const v = impactScore(e, -1, 2);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 10);
  }
});

test("engine: emits the full structured signal", async () => {
  const [s] = await analyze([doc("D1", "Fed signals more rate hikes as inflation stays stubbornly high", "market")]);
  assert.equal(s.event_type, "Macroeconomic");
  assert.equal(s.sentiment_label, "negative");
  assert.ok(s.impact_score >= 1 && s.impact_score <= 10);
  assert.ok(s.evidence.length > 0);
});

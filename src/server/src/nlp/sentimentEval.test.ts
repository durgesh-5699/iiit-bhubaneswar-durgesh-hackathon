import test from "node:test";
import assert from "node:assert/strict";
import { parseLabeled, sample, summarize } from "./sentimentEval";

test("parses Kaggle-style CSV without header (label,text) incl. quotes and commas", () => {
  const rows = parseLabeled('neutral,"Sales were EUR 5 mn, up from 4 mn."\npositive,Profit rose sharply\nnegative,"Shares fell"', "all-data.csv");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { text: "Sales were EUR 5 mn, up from 4 mn.", label: "neutral" });
});

test("parses CSV with a header in either column order", () => {
  assert.equal(parseLabeled("Sentence,Sentiment\nProfit rose,positive\nLoss widened,negative", "x.csv").length, 2);
  assert.equal(parseLabeled("Sentiment,Sentence\npositive,Profit rose", "x.csv")[0].label, "positive");
});

test("parses original PhraseBank txt (sentence@label)", () => {
  const rows = parseLabeled("Profit rose@positive\nEmail me @ noon@neutral\nbad line", "Sentences_AllAgree.txt");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].text, "Email me @ noon");
});

test("sample is deterministic and size-limited", () => {
  const xs = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(sample(xs, 10), sample(xs, 10));
  assert.equal(sample(xs, 10).length, 10);
});

test("summarize: perfect predictions give 100% accuracy and macro-F1 1", () => {
  const s = summarize(["positive", "negative", "neutral"], [0.9, -0.9, 0]);
  assert.equal(s.accuracyPct, 100);
  assert.equal(s.macroF1, 1);
  const wrong = summarize(["positive", "negative"], [-0.9, -0.9]);
  assert.equal(wrong.accuracyPct, 50);
  assert.equal(wrong.confusion.positive.negative, 1);
});

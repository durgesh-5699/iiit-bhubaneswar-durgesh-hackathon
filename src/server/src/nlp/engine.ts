import { Doc } from "../types";
import { ruleEvent } from "./events";
import { impactScore } from "./impact";
import { ruleSentiment } from "./sentiment";
import { labelOf, Signal } from "./signal";

export interface EngineOptions {
  finbert?: boolean; // blend FinBERT into sentiment (needs model download)
  zeroShot?: boolean; // use zero-shot model when rule-based event confidence is low
  finbertWeight?: number; // 0..1 share of FinBERT in the blended sentiment (default 0.5)
  lowConfidence?: number; // rule event confidence below this triggers zero-shot (default 0.55)
}

/** The AI/NLP Risk Engine: Doc[] -> Signal[]  (sentiment score, event class, impact score). */
export async function analyze(docs: Doc[], opts: EngineOptions = {}): Promise<Signal[]> {
  const wf = opts.finbertWeight ?? 0.5;
  const low = opts.lowConfidence ?? 0.55;
  type Models = typeof import("./models.js");
  let models: Models | null = null;
  if (opts.finbert || opts.zeroShot) {
    const m: Models = await import("./models.js");
    await m.loadModels({ sentiment: !!opts.finbert, zeroShot: !!opts.zeroShot });
    models = m;
  }

  const out: Signal[] = [];
  for (const d of docs) {
    const rs = ruleSentiment(d.text);
    let score = rs.score;
    let sentMethod = "lexicon-v1";
    if (opts.finbert && models) {
      const fs = await models.finbertSentiment(d.text);
      score = Math.round((wf * fs + (1 - wf) * rs.score) * 100) / 100;
      sentMethod = `finbert*${wf}+lexicon-v1*${1 - wf}`;
    }

    const ev = ruleEvent(d.text, d.scope);
    let type = ev.type, conf = ev.confidence, evMethod = "keyword-rules-v1";
    if (opts.zeroShot && models && ev.confidence < low) {
      const zs = await models.zeroShotEvent(d.text);
      if (zs.score > 0.35) { type = zs.type; conf = Math.round(zs.score * 100) / 100; evMethod = "zero-shot-nli"; }
    }

    out.push({
      doc_id: d.id, source: d.source, published_at: d.published_at, tickers: d.tickers, scope: d.scope,
      sentiment_score: score, sentiment_label: labelOf(score),
      event_type: type, event_confidence: conf,
      impact_score: impactScore(type, score, rs.intensity),
      evidence: [...rs.terms.slice(0, 4), ...ev.terms.slice(0, 3).map((t) => `event:${t}`)],
      text: d.text,
      method: { sentiment: sentMethod, event: evMethod },
    });
  }
  return out;
}

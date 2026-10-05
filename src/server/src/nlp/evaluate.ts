import { Doc } from "../types";
import { labelOf, Signal } from "./signal";

export interface EvalReport {
  n: number;
  sentiment: { labelAccuracyPct: number; maeVsGold?: number; baselineAlwaysNeutralPct: number };
  event: { accuracyPct: number; baselineMajorityPct: number; perClassRecallPct: Record<string, number>; topConfusions: string[] };
  impact?: { mae: number; within1Pct: number };
}
const pct = (n: number, d: number) => Math.round((n / Math.max(1, d)) * 1000) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Compares signals with the ground-truth labels carried in doc.gold. Gold is never seen by the engine. */
export function evaluate(docs: Doc[], signals: Signal[], opts: { numeric: boolean }): EvalReport {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const rows = signals.map((s) => ({ s, g: byId.get(s.doc_id)?.gold })).filter((x) => x.g?.event && x.g.sentiment !== undefined);
  const n = rows.length;

  const sentOk = rows.filter((x) => x.s.sentiment_label === labelOf(x.g!.sentiment!)).length;
  const neutralBase = rows.filter((x) => labelOf(x.g!.sentiment!) === "neutral").length;

  const evOk = rows.filter((x) => x.s.event_type === x.g!.event).length;
  const classCount: Record<string, number> = {};
  const classHit: Record<string, number> = {};
  const conf: Record<string, number> = {};
  for (const { s, g } of rows) {
    classCount[g!.event!] = (classCount[g!.event!] ?? 0) + 1;
    if (s.event_type === g!.event) classHit[g!.event!] = (classHit[g!.event!] ?? 0) + 1;
    else conf[`${g!.event} -> ${s.event_type}`] = (conf[`${g!.event} -> ${s.event_type}`] ?? 0) + 1;
  }
  const majority = Math.max(...Object.values(classCount));

  const report: EvalReport = {
    n,
    sentiment: { labelAccuracyPct: pct(sentOk, n), baselineAlwaysNeutralPct: pct(neutralBase, n) },
    event: {
      accuracyPct: pct(evOk, n), baselineMajorityPct: pct(majority, n),
      perClassRecallPct: Object.fromEntries(Object.keys(classCount).map((c) => [c, pct(classHit[c] ?? 0, classCount[c])])),
      topConfusions: Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`),
    },
  };
  if (opts.numeric) {
    report.sentiment.maeVsGold = r2(rows.reduce((a, x) => a + Math.abs(x.s.sentiment_score - x.g!.sentiment!), 0) / n);
    const ir = rows.filter((x) => x.g!.impact !== undefined);
    report.impact = {
      mae: r2(ir.reduce((a, x) => a + Math.abs(x.s.impact_score - x.g!.impact!), 0) / ir.length),
      within1Pct: pct(ir.filter((x) => Math.abs(x.s.impact_score - x.g!.impact!) <= 1).length, ir.length),
    };
  }
  return report;
}

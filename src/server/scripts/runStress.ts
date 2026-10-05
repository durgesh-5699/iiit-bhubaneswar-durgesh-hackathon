import { loadStocks } from "../src/ingestion/loaders";
import { isTrigger, runStress } from "../src/modules/stress/engine";
import { loadPortfolio, loadShockConfig } from "../src/modules/stress/portfolio";
import { FileStore } from "../src/store/fileStore";

/** npm run module-b -> runs the stress test for every triggering event and prints the before/after summary */
async function main() {
  const portfolio = loadPortfolio(), cfg = loadShockConfig();
  const sector = new Map(loadStocks().map((s) => [s.ticker, s.sector]));
  const store = await FileStore.open();
  const signals = await store.signals({ min_impact: Math.floor(cfg.trigger.min_impact) + 1, limit: 500 });
  const hits = signals.filter((s) => isTrigger(s, cfg));
  console.log(`${hits.length} triggering events (impact > ${cfg.trigger.min_impact}, adverse) out of ${signals.length} high-impact signals\n`);
  const rows = hits.map((s) => {
    const r = runStress(portfolio, cfg, { event_type: s.event_type, impact_score: s.impact_score, tickers: s.tickers, sentiment_score: s.sentiment_score, doc_id: s.doc_id }, (t) => sector.get(t));
    return { doc: s.doc_id, event: s.event_type, impact: s.impact_score, scope: r.scope, before: r.portfolio.before, after: r.portfolio.after, delta_pct: r.portfolio.delta_pct };
  }).sort((a, b) => a.delta_pct - b.delta_pct);
  console.table(rows.slice(0, 10));
}
main().catch((e) => { console.error(e); process.exit(1); });

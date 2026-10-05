import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, PROCESSED_DIR } from "../src/config";
import { runIngestion } from "../src/ingestion/pipeline";
import { EntityLinker } from "../src/ingestion/entityLinker";
import { loadStocks } from "../src/ingestion/loaders";
import { analyze } from "../src/nlp/engine";
import { evaluate } from "../src/nlp/evaluate";
import { Doc } from "../src/types";

async function main() {
  const useModels = process.argv.includes("--models");
  const opts = { finbert: useModels, zeroShot: useModels };

  const { docs } = await runIngestion();
  const signals = await analyze(docs, opts);
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROCESSED_DIR, "signals.json"), JSON.stringify(signals, null, 2));

  const synthetic = evaluate(docs, signals, { numeric: true });

  const linker = new EntityLinker(loadStocks());
  const realistic: Doc[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "eval_realistic.json"), "utf-8")).map((r: any) => {
    const tickers = linker.link(r.text);
    return { id: r.id, source: r.source, origin: "eval", published_at: "2026-09-15T00:00:00Z", title: null, text: r.text, engagement: 0, tickers,
      scope: tickers.length ? "company" : "market", gold: { event: r.gold_event, sentiment: r.gold_sentiment } } as Doc;
  });
  const realSignals = await analyze(realistic, opts);
  const real = evaluate(realistic, realSignals, { numeric: false });

  const report = { engine: useModels ? "hybrid (FinBERT + zero-shot + rules)" : "rules only", synthetic, realisticHeldOut: real };
  fs.writeFileSync(path.join(PROCESSED_DIR, "nlp_report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nSample signals:");
  for (const s of signals.slice(0, 3)) console.log(JSON.stringify(s));
}
main();

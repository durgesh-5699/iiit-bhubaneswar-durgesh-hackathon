import fs from "node:fs";
import path from "node:path";
import { PROCESSED_DIR } from "../config";
import { aggregateDaily } from "../aggregation/aggregate";
import { runIngestion } from "../ingestion/pipeline";
import { analyze, EngineOptions } from "../nlp/engine";

/** Full offline pipeline: ingest -> NLP engine -> aggregate. Writes everything under data/processed/. */
export async function buildAll(opts: EngineOptions = {}) {
  const { docs, stats } = await runIngestion();
  const signals = await analyze(docs, opts);
  const daily = aggregateDaily(signals, docs);
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROCESSED_DIR, "signals.json"), JSON.stringify(signals, null, 2));
  fs.writeFileSync(path.join(PROCESSED_DIR, "daily_sentiment.json"), JSON.stringify(daily, null, 2));
  return { docs, signals, daily, stats };
}

export const processedFilesExist = () =>
  ["signals.json", "daily_sentiment.json"].every((f) => fs.existsSync(path.join(PROCESSED_DIR, f)));

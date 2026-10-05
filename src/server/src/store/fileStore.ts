import fs from "node:fs";
import path from "node:path";
import { PROCESSED_DIR } from "../config";
import { DailySentiment } from "../aggregation/aggregate";
import { Signal } from "../nlp/signal";
import { buildAll, processedFilesExist } from "../pipeline/build";
import { filterSignals, SignalFilter, Store } from "./store";

const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(PROCESSED_DIR, f), "utf-8"));

/** Default store: reads data/processed/*.json (auto-builds them on first start, so `npm start` just works). */
export class FileStore implements Store {
  readonly name = "file";
  private constructor(private all: Signal[], private daily: DailySentiment[]) {}

  static async open(): Promise<FileStore> {
    if (!processedFilesExist()) {
      console.log("[store] processed data not found -> running pipeline once...");
      await buildAll();
    }
    return new FileStore(read<Signal[]>("signals.json"), read<DailySentiment[]>("daily_sentiment.json"));
  }

  async signals(f: SignalFilter) { return filterSignals(this.all, f); }
  async signal(id: string) { return this.all.find((s) => s.doc_id === id) ?? null; }
  async series(ticker: string, from?: string, to?: string) {
    return this.daily.filter((d) => d.ticker === ticker && (!from || d.date >= from.slice(0, 10)) && (!to || d.date <= to.slice(0, 10)));
  }
  async latest() {
    const last = new Map<string, DailySentiment>();
    for (const d of this.daily) last.set(d.ticker, d); // daily is sorted by date asc
    return [...last.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }
  async counts() { return { signals: this.all.length, dailyRows: this.daily.length }; }
}

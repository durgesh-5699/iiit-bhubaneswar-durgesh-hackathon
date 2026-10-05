import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../../config";

export interface PriceData {
  source: "yahoo" | "synthetic-fallback";
  dates: string[]; // trading days present for every kept ticker, ascending
  tickers: string[];
  close: Record<string, number[]>; // aligned with `dates`
}

/** Loads data/prices.csv (Yahoo, from `npm run fetch:prices`) or falls back to data/prices_fallback.csv (synthetic). */
export function loadPrices(universe: string[]): PriceData {
  const real = path.join(DATA_DIR, "prices.csv");
  const file = fs.existsSync(real) ? real : path.join(DATA_DIR, "prices_fallback.csv");
  const source: PriceData["source"] = file === real ? "yahoo" : "synthetic-fallback";

  const byTicker = new Map<string, Map<string, number>>();
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/).slice(1)) {
    const [date, ticker, close] = line.split(",");
    const px = Number(close);
    if (!date || !ticker || !Number.isFinite(px)) continue;
    if (!byTicker.has(ticker)) byTicker.set(ticker, new Map());
    byTicker.get(ticker)!.set(date, px);
  }
  const tickers = universe.filter((t) => (byTicker.get(t)?.size ?? 0) >= 5);
  if (!tickers.length) throw new Error(`No usable prices in ${path.basename(file)}`);
  const dates = [...byTicker.get(tickers[0])!.keys()].filter((d) => tickers.every((t) => byTicker.get(t)!.has(d))).sort();
  const close: Record<string, number[]> = {};
  for (const t of tickers) close[t] = dates.map((d) => byTicker.get(t)!.get(d)!);
  return { source, dates, tickers, close };
}

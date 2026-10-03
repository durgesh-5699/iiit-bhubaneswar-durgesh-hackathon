
import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";

const DATA_DIR = path.resolve(process.cwd(), "../../data");
const tickers: { ticker: string }[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tickers.json"), "utf-8"));
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function main() {
  const rows: string[] = ["date,ticker,close"];
  let ok = 0;
  for (const { ticker } of tickers) {
    try {
      const res = await yahooFinance.chart(ticker, { period1: "2026-08-25", period2: "2026-10-01", interval: "1d" });
      for (const q of res.quotes) {
        if (q.close == null) continue;
        rows.push(`${q.date.toISOString().slice(0, 10)},${ticker},${q.close.toFixed(2)}`);
      }
      ok++;
      console.log(`✔ ${ticker}: ${res.quotes.length} days`);
    } catch (e) {
      console.error(`✖ ${ticker}:`, (e as Error).message);
    }
  }
  if (ok === 0) {
    console.error("No prices downloaded. Using data/prices_fallback.csv (synthetic) instead.");
    process.exit(1);
  }
  fs.writeFileSync(path.join(DATA_DIR, "prices.csv"), rows.join("\n") + "\n");
  console.log(`Saved ${rows.length - 1} rows for ${ok}/${tickers.length} tickers -> data/prices.csv`);
}
main();

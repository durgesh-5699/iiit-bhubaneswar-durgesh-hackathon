import fs from "node:fs";
import path from "node:path";
import { PROCESSED_DIR } from "../src/config";
import { loadStocks } from "../src/ingestion/loaders";
import { DEFAULT_PARAMS, runRebalancer } from "../src/modules/rebalancer/simulate";
import { loadPrices } from "../src/modules/rebalancer/prices";
import { FileStore } from "../src/store/fileStore";

async function main() {
  const stocks = loadStocks();
  const prices = loadPrices(stocks.map((s) => s.ticker));
  const store = await FileStore.open();
  const daily = (await Promise.all([...prices.tickers, "MARKET"].map((t) => store.series(t)))).flat();
  const res = runRebalancer({ params: DEFAULT_PARAMS, stocks, daily, prices });
  fs.writeFileSync(path.join(PROCESSED_DIR, "rebalance_result.json"), JSON.stringify(res, null, 2));

  console.log(`Prices: ${res.price_source} | ${res.history.length} trading days | ${res.tickers.length} stocks`);
  console.log("Metrics:", JSON.stringify(res.metrics, null, 2));
  console.log("Latest weights:", res.latest.map((x) => `${x.ticker} ${(x.weight * 100).toFixed(1)}%`).join(", "));
  console.log("Notes:\n - " + res.notes.join("\n - "));
}
main().catch((e) => { console.error(e); process.exit(1); });

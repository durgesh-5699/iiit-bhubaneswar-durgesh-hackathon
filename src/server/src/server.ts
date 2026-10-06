import "dotenv/config";
import { createApp } from "./api/app";
import { analyze } from "./nlp/engine";
import type { EngineOptions } from "./nlp/engine";
import { FileStore } from "./store/fileStore";
import { MongoStore } from "./store/mongoStore";
import { Store } from "./store/store";

async function main() {
  const uri = process.env.MONGODB_URI;
  const store: Store = uri ? await MongoStore.connect(uri) : await FileStore.open();
  let engine: EngineOptions = { finbert: false, zeroShot: false };
  if (process.env.USE_MODELS === "1") {
    try {
      console.log("[models] loading FinBERT + zero-shot (first run downloads them)...");
      await analyze([{ id: "warmup", source: "news", origin: "warmup", published_at: new Date().toISOString(), title: null, text: "Warm-up headline about quarterly earnings",
        engagement: 0, tickers: [], scope: "market" }], { finbert: true, zeroShot: true });
      engine = { finbert: true, zeroShot: true };
      console.log("[models] ready");
    } catch (e) {
      console.warn(`[models] unavailable, falling back to rules-only: ${(e as Error).message}`);
    }
  }
  const app = createApp(store, engine);
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`Risk Engine API on http://localhost:${port} (store: ${store.name}, models: ${engine.finbert ? "on" : "off"})`));
}
main().catch((e) => { console.error(e); process.exit(1); });

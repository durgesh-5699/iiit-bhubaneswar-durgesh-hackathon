import "dotenv/config";
import { createApp } from "./api/app";
import { FileStore } from "./store/fileStore";
import { MongoStore } from "./store/mongoStore";
import { Store } from "./store/store";

async function main() {
  const uri = process.env.MONGODB_URI;
  const store: Store = uri ? await MongoStore.connect(uri) : await FileStore.open();
  const useModels = process.env.USE_MODELS === "1";
  const app = createApp(store, { finbert: useModels, zeroShot: useModels });
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`Risk Engine API on http://localhost:${port} (store: ${store.name}, models: ${useModels ? "on" : "off"})`));
}
main().catch((e) => { console.error(e); process.exit(1); });

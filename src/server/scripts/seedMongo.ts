import "dotenv/config";
import mongoose from "mongoose";
import { buildAll } from "../src/pipeline/build";
import { MongoStore } from "../src/store/mongoStore";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI in src/server/.env first");
  const { signals, daily } = await buildAll();
  await mongoose.connect(uri);
  await MongoStore.seed(signals, daily);
  console.log(`Seeded MongoDB: ${signals.length} signals, ${daily.length} daily rows`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

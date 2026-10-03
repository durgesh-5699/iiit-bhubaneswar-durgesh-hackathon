import { runIngestion } from "../src/ingestion/pipeline";
import "dotenv/config";

runIngestion({ live: process.argv.includes("--live") }).then(({ stats, removed }) => {
  console.log("Ingestion complete -> data/processed/docs.json");
  console.log(JSON.stringify(stats, null, 2));
  if (removed.length) console.log("Removed:", removed.map((r) => `${r.id}→${r.duplicate_of} (${r.similarity})`).join(", "));
});

import "dotenv/config";
import { buildAll } from "../src/pipeline/build";

buildAll({ finbert: process.argv.includes("--models"), zeroShot: process.argv.includes("--models") }).then(({ docs, signals, daily }) => {
  console.log(`docs: ${docs.length} | signals: ${signals.length} | daily rows: ${daily.length}`);
  console.log(`high-impact events (impact >= 8): ${signals.filter((s) => s.impact_score >= 8 && s.event_type !== "Other").length}`);
});

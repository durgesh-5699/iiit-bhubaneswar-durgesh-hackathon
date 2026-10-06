import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, PROCESSED_DIR } from "../src/config";
import { ruleSentiment } from "../src/nlp/sentiment";
import { labelOf, SentimentLabel } from "../src/nlp/signal";
import { LABELS, Labeled, parseLabeled, sample, summarize } from "../src/nlp/sentimentEval";


const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const has = (k: string) => process.argv.includes(k);

function load(): Labeled[] {
  if (has("--dev")) {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "eval_realistic.json"), "utf-8")) as { text: string; gold_sentiment: number }[];
    return raw.map((r) => ({ text: r.text, label: labelOf(r.gold_sentiment) }));
  }
  const file = arg("--file") ?? path.join(DATA_DIR, "external", "financial_phrasebank.csv");
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}\nDownload "Sentiment Analysis for Financial News" (Kaggle, file all-data.csv) and save it there, or pass --file <path>.`);
    process.exit(1);
  }
  const buf = fs.readFileSync(file);
  let text = buf.toString("utf8");
  if (text.includes("\uFFFD")) text = buf.toString("latin1"); // Kaggle file is ISO-8859-1
  return parseLabeled(text, file);
}

async function main() {
  let items = load();
  const total = items.length;
  const limit = Number(arg("--limit") ?? (has("--dev") ? 9999 : 1000));
  items = sample(items, limit);
  console.log(`Sentences: ${items.length} (of ${total}) | gold mix: ${LABELS.map((l) => `${l} ${items.filter((x) => x.label === l).length}`).join(", ")}`);

  const lex = items.map((x) => ruleSentiment(x.text));
  const modes: Record<string, number[]> = { lexicon: lex.map((x) => x.score) };

  let fin: number[] | null = null;
  if (!has("--no-models")) {
    const models = await import("../src/nlp/models.js");
    await models.loadModels({ sentiment: true, zeroShot: false });
    fin = [];
    for (let i = 0; i < items.length; i++) {
      fin.push(await models.finbertSentiment(items[i].text));
      if ((i + 1) % 100 === 0) console.log(`  FinBERT ${i + 1}/${items.length}`);
    }
    modes.finbert = fin;
    modes.blend = lex.map((x, i) => Math.round((0.5 * fin![i] + 0.5 * x.score) * 100) / 100);
    modes.gated = lex.map((x, i) => (x.terms.length ? x.score : fin![i]));
  }

  const gold = items.map((x) => x.label);
  const report: Record<string, unknown> = {};
  console.log("\nmode      accuracy  macroF1  recall pos/neg/neu");
  for (const [name, scores] of Object.entries(modes)) {
    const s = summarize(gold, scores);
    report[name] = s;
    console.log(`${name.padEnd(9)} ${String(s.accuracyPct + "%").padEnd(9)} ${String(s.macroF1).padEnd(8)} ${s.recallPct.positive}/${s.recallPct.negative}/${s.recallPct.neutral}`);
  }
  console.log(`always-neutral baseline: ${summarize(gold, gold.map(() => 0)).accuracyPct}%`);
  for (const name of Object.keys(modes)) {
    const c = (report[name] as ReturnType<typeof summarize>).confusion;
    console.log(`\n${name}: rows = gold, cols = predicted (pos, neg, neu)`);
    for (const g of LABELS) console.log(`  ${g.padEnd(9)} ${LABELS.map((p) => String(c[g][p]).padStart(5)).join(" ")}`);
  }

  if (has("--dev") && fin) {
    console.log("\nItems where lexicon and FinBERT labels differ (gold | lexicon | finbert | blend):");
    items.forEach((x, i) => {
      const L = labelOf(modes.lexicon[i]), F = labelOf(fin![i]);
      if (L !== F) console.log(`  [${x.label.slice(0, 3)}] lex ${modes.lexicon[i].toFixed(2)} ${L.slice(0, 3)} | fin ${fin![i].toFixed(2)} ${F.slice(0, 3)} | blend ${modes.blend[i].toFixed(2)}  "${x.text.slice(0, 85)}"`);
    });
  }
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROCESSED_DIR, has("--dev") ? "sentiment_eval_dev.json" : "sentiment_eval_real.json"), JSON.stringify({ n: items.length, modes: report }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });

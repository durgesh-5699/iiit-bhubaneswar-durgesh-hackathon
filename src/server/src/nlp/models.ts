/**
 * Optional transformer models running locally in Node via transformers.js (ONNX). First run downloads the weights (~100-250MB)
 * and caches them. Loaded lazily with dynamic import(), because the package is ESM-only.
 */
import { EventType } from "./signal";

const SENTIMENT_MODEL = "Xenova/finbert"; // ProsusAI/finbert (financial sentiment), quantized ONNX
const ZEROSHOT_MODEL = "Xenova/nli-deberta-v3-xsmall"; // small NLI model for zero-shot event classification

const EVENT_LABELS: [string, EventType][] = [
  ["geopolitical conflict, war, sanctions or tariffs", "Geopolitical"],
  ["macroeconomic news about inflation, interest rates, jobs or central banks", "Macroeconomic"],
  ["credit rating change, debt or bond market stress", "Credit Event"],
  ["merger or acquisition", "Merger/Acquisition"],
  ["new product launch", "Product Launch"],
  ["company earnings results", "Earnings"],
  ["regulatory or legal action", "Regulatory"],
];

let sentPipe: any = null;
let zsPipe: any = null;

export async function loadModels(opts: { sentiment: boolean; zeroShot: boolean }) {
  const { pipeline } = await import("@huggingface/transformers");
  if (opts.sentiment && !sentPipe) sentPipe = await pipeline("text-classification", SENTIMENT_MODEL, { dtype: "q8" });
  if (opts.zeroShot && !zsPipe) zsPipe = await pipeline("zero-shot-classification", ZEROSHOT_MODEL, { dtype: "q8" });
}

/** FinBERT score = P(positive) - P(negative), in [-1, 1]. */
export async function finbertSentiment(text: string): Promise<number> {
  const out: { label: string; score: number }[] = await sentPipe(text, { top_k: null });
  const p = (l: string) => out.find((x) => x.label.toLowerCase() === l)?.score ?? 0;
  return Math.round((p("positive") - p("negative")) * 100) / 100;
}

export async function zeroShotEvent(text: string): Promise<{ type: EventType; score: number }> {
  const res: { labels: string[]; scores: number[] } = await zsPipe(text, EVENT_LABELS.map((x) => x[0]));
  const idx = EVENT_LABELS.findIndex((x) => x[0] === res.labels[0]);
  return { type: EVENT_LABELS[idx][1], score: res.scores[0] };
}

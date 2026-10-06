import { labelOf, SentimentLabel } from "./signal";
import { parse } from "csv-parse/sync";

export const LABELS: SentimentLabel[] = ["positive", "negative", "neutral"];
export interface Labeled { text: string; label: SentimentLabel }
const isLabel = (s: string | undefined): s is SentimentLabel => !!s && (LABELS as string[]).includes(s);

/**
 * Reads a labelled sentiment file. Handles the common Financial PhraseBank layouts:
 *  - CSV "label,text" with no header (Kaggle all-data.csv)   - CSV with a header, either column order
 *  - TXT lines "sentence@label" (original PhraseBank release)
 * `raw` is already decoded text; the caller decodes utf8 / latin1.
 */
export function parseLabeled(raw: string, filename: string): Labeled[] {
  const out: Labeled[] = [];
  if (filename.toLowerCase().endsWith(".txt")) {
    for (const line of raw.split(/\r?\n/)) {
      const i = line.lastIndexOf("@");
      if (i < 0) continue;
      const label = line.slice(i + 1).trim().toLowerCase();
      if (isLabel(label)) out.push({ text: line.slice(0, i).trim(), label });
    }
    return out;
  }
  const rows = parse(raw, { relax_quotes: true, relax_column_count: true, skip_empty_lines: true, skip_records_with_error: true }) as string[][];
  for (const r of rows) {
    const a = r[0]?.trim().toLowerCase(), b = r[1]?.trim().toLowerCase();
    if (isLabel(a) && r[1]) out.push({ text: r[1].trim(), label: a });
    else if (isLabel(b) && r[0]) out.push({ text: r[0].trim(), label: b }); // header rows are skipped: neither column is a label
  }
  return out;
}

/** Deterministic sample (seeded Fisher-Yates) so every run and every mode sees the same sentences. */
export function sample<T>(items: T[], n: number, seed = 7): T[] {
  const a = [...items];
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export interface Summary {
  n: number;
  accuracyPct: number;
  macroF1: number;
  recallPct: Record<SentimentLabel, number>;
  confusion: Record<SentimentLabel, Record<SentimentLabel, number>>; // confusion[gold][predicted]
}
const r1 = (x: number) => Math.round(x * 10) / 10;

export function summarize(gold: SentimentLabel[], scores: number[]): Summary {
  const pred = scores.map(labelOf);
  const confusion = Object.fromEntries(LABELS.map((g) => [g, Object.fromEntries(LABELS.map((p) => [p, 0]))])) as Summary["confusion"];
  gold.forEach((g, i) => { confusion[g][pred[i]]++; });
  const f1s: number[] = [];
  const recallPct = {} as Summary["recallPct"];
  for (const c of LABELS) {
    const tp = confusion[c][c];
    const fn = LABELS.reduce((a, p) => a + confusion[c][p], 0) - tp;
    const fp = LABELS.reduce((a, g) => a + confusion[g][c], 0) - tp;
    const prec = tp + fp ? tp / (tp + fp) : 0, rec = tp + fn ? tp / (tp + fn) : 0;
    f1s.push(prec + rec ? (2 * prec * rec) / (prec + rec) : 0);
    recallPct[c] = r1(rec * 100);
  }
  const correct = LABELS.reduce((a, c) => a + confusion[c][c], 0);
  return { n: gold.length, accuracyPct: r1((correct / Math.max(1, gold.length)) * 100), macroF1: Math.round((f1s.reduce((a, b) => a + b, 0) / 3) * 100) / 100, recallPct, confusion };
}

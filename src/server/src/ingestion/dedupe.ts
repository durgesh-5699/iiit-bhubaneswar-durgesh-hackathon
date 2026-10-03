import { Doc, SourceType } from "../types";

export interface DedupeConfig {
  windowMs: number; // only compare with docs published within this window
  threshold: number; // Jaccard similarity (word bigrams) above which a doc is a duplicate
}

const HOUR = 3600_000;
export const DEFAULT_DEDUPE: Record<SourceType, DedupeConfig> = {
  news: { windowMs: 24 * HOUR, threshold: 0.8 }, // syndicated copies of the same story
  twitter: { windowMs: 1 * HOUR, threshold: 0.9 }, // copy-paste / bot spam
};

const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9$\s]/g, " ").replace(/\s+/g, " ").trim();

function shingles(text: string): Set<string> {
  const w = normalize(text).split(" ").filter(Boolean);
  if (w.length < 3) return new Set(w);
  const s = new Set<string>();
  for (let i = 0; i < w.length - 1; i++) s.add(`${w[i]} ${w[i + 1]}`);
  return s;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface RemovedDoc {
  id: string;
  duplicate_of: string;
  similarity: number;
}

/** Keeps the earliest copy, drops later near-identical ones (compared within the same source only). */
export function dedupe(docs: Doc[], cfg: Record<SourceType, DedupeConfig> = DEFAULT_DEDUPE) {
  const sorted = [...docs].sort((a, b) => a.published_at.localeCompare(b.published_at));
  const keptBySource: Record<SourceType, { doc: Doc; sh: Set<string>; t: number }[]> = { news: [], twitter: [] };
  const kept: Doc[] = [];
  const removed: RemovedDoc[] = [];

  for (const doc of sorted) {
    const { windowMs, threshold } = cfg[doc.source];
    const t = Date.parse(doc.published_at);
    const sh = shingles(doc.text);
    const pool = keptBySource[doc.source];
    let dupOf: { id: string; sim: number } | null = null;
    for (let i = pool.length - 1; i >= 0 && t - pool[i].t <= windowMs; i--) {
      const sim = jaccard(sh, pool[i].sh);
      if (sim >= threshold) { dupOf = { id: pool[i].doc.id, sim }; break; }
    }
    if (dupOf) removed.push({ id: doc.id, duplicate_of: dupOf.id, similarity: Math.round(dupOf.sim * 100) / 100 });
    else { pool.push({ doc, sh, t }); kept.push(doc); }
  }
  return { kept, removed };
}

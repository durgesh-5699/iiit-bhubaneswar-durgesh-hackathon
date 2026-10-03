import fs from "node:fs";
import path from "node:path";
import { PROCESSED_DIR } from "../config";
import { Doc, RawNews } from "../types";
import { dedupe, RemovedDoc } from "./dedupe";
import { EntityLinker } from "./entityLinker";
import { fetchLiveNews, loadRawNews, loadRawTweets, loadStocks, newsToDoc, tweetToDoc } from "./loaders";

export interface IngestionStats {
  loaded: { news: number; twitter: number };
  removedDuplicates: number;
  finalDocs: number;
  companyScope: number;
  marketScope: number;
  entityLinking: { docsEvaluated: number; exactMatchPct: number; precisionPct: number; recallPct: number };
  dedupeEval: { goldDuplicates: number; caught: number; falseRemovals: number };
}

const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((n / d) * 1000) / 10);

export async function runIngestion(opts: { live?: boolean } = {}) {
  const stocks = loadStocks();
  const linker = new EntityLinker(stocks);

  let rawNews: RawNews[] = loadRawNews();
  if (opts.live) {
    const key = process.env.NEWSAPI_KEY;
    if (!key) console.warn("[live news] NEWSAPI_KEY not set, using sample data only");
    else rawNews = rawNews.concat(await fetchLiveNews(key, stocks));
  }
  const rawTweets = loadRawTweets();

  // 1) normalize both sources into one schema  2) link entities
  const docs: Doc[] = [...rawNews.map(newsToDoc), ...rawTweets.map(tweetToDoc)].map((d) => {
    const tickers = linker.link(d.text);
    return { ...d, tickers, scope: tickers.length ? "company" : "market" };
  });

  // 3) de-duplicate (syndicated news, copy-paste tweets)
  const { kept, removed } = dedupe(docs);
  kept.sort((a, b) => a.published_at.localeCompare(b.published_at));

  // ---- evaluation vs synthetic ground truth ----
  let tp = 0, fp = 0, fn = 0, exact = 0, evaluated = 0;
  for (const d of docs) {
    if (!d.gold?.tickers) continue;
    evaluated++;
    const g = new Set(d.gold.tickers), p = new Set(d.tickers);
    const inter = [...p].filter((x) => g.has(x)).length;
    tp += inter; fp += p.size - inter; fn += g.size - inter;
    if (g.size === p.size && inter === g.size) exact++;
  }
  const goldDup = docs.filter((d) => d.gold?.duplicate_of);
  const removedIds = new Set(removed.map((r: RemovedDoc) => r.id));
  const caught = goldDup.filter((d) => removedIds.has(d.id)).length;

  const stats: IngestionStats = {
    loaded: { news: rawNews.length, twitter: rawTweets.length },
    removedDuplicates: removed.length,
    finalDocs: kept.length,
    companyScope: kept.filter((d) => d.scope === "company").length,
    marketScope: kept.filter((d) => d.scope === "market").length,
    entityLinking: { docsEvaluated: evaluated, exactMatchPct: pct(exact, evaluated), precisionPct: pct(tp, tp + fp), recallPct: pct(tp, tp + fn) },
    dedupeEval: { goldDuplicates: goldDup.length, caught, falseRemovals: removed.length - caught },
  };

  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROCESSED_DIR, "docs.json"), JSON.stringify(kept, null, 2));
  fs.writeFileSync(path.join(PROCESSED_DIR, "ingestion_report.json"), JSON.stringify({ stats, removed }, null, 2));
  return { docs: kept, removed, stats };
}

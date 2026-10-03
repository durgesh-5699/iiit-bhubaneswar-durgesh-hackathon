import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../config";
import { Doc, RawNews, RawTweet, Stock } from "../types";
import { cleanText, joinTitleBody } from "./clean";

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));

export const loadStocks = (): Stock[] => readJson<Stock[]>("tickers.json");
export const loadRawNews = (): RawNews[] => readJson<RawNews[]>("news_sample.json");
export const loadRawTweets = (): RawTweet[] => readJson<RawTweet[]>("tweets_sample.json");

// ---- adapters: source-specific shape -> common Doc (tickers/scope are filled later by the linker) ----
export function newsToDoc(r: RawNews): Doc {
  return {
    id: r.id, source: "news", origin: r.publisher, published_at: new Date(r.published_at).toISOString(),
    title: cleanText(r.headline), text: joinTitleBody(r.headline, r.body), engagement: 0, tickers: [], scope: "market",
    gold: { event: r.gold_event, sentiment: r.gold_sentiment, impact: r.gold_impact, tickers: r.tickers, duplicate_of: r.gold_duplicate_of },
  };
}

export function tweetToDoc(r: RawTweet): Doc {
  return {
    id: r.id, source: "twitter", origin: r.user, published_at: new Date(r.created_at).toISOString(),
    title: null, text: cleanText(r.text), engagement: (r.likes ?? 0) + (r.retweets ?? 0), tickers: [], scope: "market",
    gold: { event: r.gold_event, sentiment: r.gold_sentiment, impact: r.gold_impact, tickers: r.tickers },
  };
}

// ---- optional live source: NewsAPI (free developer key). Network failures never break the pipeline. ----
export async function fetchLiveNews(apiKey: string, stocks: Stock[]): Promise<RawNews[]> {
  const queries = [
    stocks.map((s) => `"${s.name}"`).join(" OR "),
    "inflation OR \"Federal Reserve\" OR sanctions OR \"interest rates\" OR recession OR tariffs",
  ];
  const out: RawNews[] = [];
  for (const q of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=50&apiKey=${apiKey}`;
      const res = await fetch(url);
      const json: any = await res.json();
      if (json.status !== "ok") throw new Error(json.message ?? `HTTP ${res.status}`);
      for (const a of json.articles ?? []) {
        if (!a.title || a.title === "[Removed]") continue;
        out.push({
          id: `NA-${crypto.createHash("sha1").update(a.url ?? a.title).digest("hex").slice(0, 10)}`,
          source: "news", publisher: a.source?.name ?? "NewsAPI", published_at: a.publishedAt,
          headline: a.title, body: a.description ?? "",
        });
      }
    } catch (e) {
      console.warn(`[live news] skipped a query: ${(e as Error).message}`);
    }
  }
  return out;
}

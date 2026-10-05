import { Doc } from "../types";
import { Signal } from "../nlp/signal";

/** One row of the time series consumed by Module A (rebalancer). ticker = "MARKET" for market-wide (untagged) news. */
export interface DailySentiment {
  ticker: string;
  date: string; // YYYY-MM-DD (UTC)
  sentiment: number; // credibility-weighted mean, -1..1
  n_news: number;
  n_tweets: number;
  avg_impact: number;
  max_impact: number;
}

/** ASSUMPTION: a news article is more credible than a tweet; viral tweets count a bit more (log-scaled). */
export const SOURCE_WEIGHT = { news: 1.0, twitter: 0.4 } as const;
export const weightOf = (s: Pick<Signal, "source">, engagement = 0) =>
  SOURCE_WEIGHT[s.source] * (1 + 0.15 * Math.log10(1 + Math.max(0, engagement)));

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function aggregateDaily(signals: Signal[], docs: Doc[]): DailySentiment[] {
  const engagement = new Map(docs.map((d) => [d.id, d.engagement]));
  type Acc = { wSum: number; sSum: number; news: number; tw: number; impSum: number; impMax: number; n: number };
  const acc = new Map<string, Acc & { ticker: string; date: string }>();

  for (const s of signals) {
    const date = s.published_at.slice(0, 10);
    const keys = s.tickers.length ? s.tickers : ["MARKET"];
    const w = weightOf(s, engagement.get(s.doc_id) ?? 0);
    for (const ticker of keys) {
      const k = `${ticker}|${date}`;
      const a = acc.get(k) ?? { ticker, date, wSum: 0, sSum: 0, news: 0, tw: 0, impSum: 0, impMax: 0, n: 0 };
      a.wSum += w; a.sSum += w * s.sentiment_score;
      if (s.source === "news") a.news++; else a.tw++;
      a.impSum += s.impact_score; a.impMax = Math.max(a.impMax, s.impact_score); a.n++;
      acc.set(k, a);
    }
  }
  return [...acc.values()]
    .map((a) => ({ ticker: a.ticker, date: a.date, sentiment: r3(a.sSum / a.wSum), n_news: a.news, n_tweets: a.tw, avg_impact: r3(a.impSum / a.n), max_impact: a.impMax }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.ticker.localeCompare(y.ticker));
}

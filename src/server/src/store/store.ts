import { DailySentiment } from "../aggregation/aggregate";
import { Signal } from "../nlp/signal";

export interface SignalFilter {
  ticker?: string;
  event_type?: string;
  source?: "news" | "twitter";
  scope?: "company" | "market";
  sentiment?: "positive" | "negative" | "neutral";
  min_impact?: number; // inclusive
  from?: string; // ISO date or datetime
  to?: string;
  limit: number;
}

/** Data access used by the API. Two implementations: FileStore (default, zero setup) and MongoStore. */
export interface Store {
  readonly name: string;
  signals(f: SignalFilter): Promise<Signal[]>;
  signal(docId: string): Promise<Signal | null>;
  series(ticker: string, from?: string, to?: string): Promise<DailySentiment[]>;
  latest(): Promise<DailySentiment[]>; // most recent day per ticker
  counts(): Promise<{ signals: number; dailyRows: number }>;
}

/** Shared in-memory filter logic (newest first). */
export function filterSignals(all: Signal[], f: SignalFilter): Signal[] {
  const from = f.from ? Date.parse(f.from) : -Infinity;
  const to = f.to ? Date.parse(f.to) : Infinity;
  return all
    .filter((s) => (!f.ticker || s.tickers.includes(f.ticker)) && (!f.event_type || s.event_type === f.event_type) && (!f.source || s.source === f.source) &&
      (!f.scope || s.scope === f.scope) && (!f.sentiment || s.sentiment_label === f.sentiment) && (f.min_impact === undefined || s.impact_score >= f.min_impact) &&
      Date.parse(s.published_at) >= from && Date.parse(s.published_at) <= to)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, f.limit);
}

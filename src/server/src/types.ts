export type SourceType = "news" | "twitter";

export interface Stock {
  ticker: string;
  name: string;
  aliases: string[];
  sector: string;
  beta: number;
}

/** Raw shapes of the two input sources (as in data/*.json). gold_* fields exist only in our synthetic sample. */
export interface RawNews {
  id: string;
  source: "news";
  publisher: string;
  published_at: string;
  headline: string;
  body?: string;
  tickers?: string[];
  gold_event?: string;
  gold_sentiment?: number;
  gold_impact?: number;
  gold_duplicate_of?: string;
}
export interface RawTweet {
  id: string;
  source: "twitter";
  user: string;
  created_at: string;
  text: string;
  likes?: number;
  retweets?: number;
  tickers?: string[];
  gold_event?: string;
  gold_sentiment?: number;
  gold_impact?: number;
}

/** Ground truth, used ONLY for evaluation. Never read by the NLP engine. */
export interface Gold {
  event?: string;
  sentiment?: number;
  impact?: number;
  tickers?: string[];
  duplicate_of?: string;
}

/** Common schema every source is normalized into. This is the input of the NLP engine. */
export interface Doc {
  id: string;
  source: SourceType;
  origin: string; // publisher name or twitter handle
  published_at: string; // ISO-8601 UTC
  title: string | null;
  text: string; // cleaned text the NLP engine reads
  engagement: number; // likes + retweets (0 for news)
  tickers: string[]; // detected by entity linker
  scope: "company" | "market";
  gold?: Gold;
}

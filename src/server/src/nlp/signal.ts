import { SourceType } from "../types";

export const EVENT_TYPES = [
  "Geopolitical", "Macroeconomic", "Credit Event", "Merger/Acquisition", "Product Launch", "Earnings", "Regulatory",
] as const;
export type EventType = (typeof EVENT_TYPES)[number] | "Other";
export type SentimentLabel = "positive" | "negative" | "neutral";

/** The structured risk signal the engine emits for every document (the engine's public contract). */
export interface Signal {
  doc_id: string;
  source: SourceType;
  published_at: string;
  tickers: string[];
  scope: "company" | "market";
  sentiment_score: number; // -1.0 .. 1.0
  sentiment_label: SentimentLabel;
  event_type: EventType;
  event_confidence: number; // 0 .. 1
  impact_score: number; // 1 .. 10 (integer)
  evidence: string[]; // matched terms, for explainability
  text?: string; // cleaned source text, shown in the dashboard
  method: { sentiment: string; event: string };
}

export const labelOf = (score: number): SentimentLabel => (score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral");

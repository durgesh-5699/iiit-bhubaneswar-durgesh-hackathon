import { EventType } from "./signal";

/** Typical market severity per event class (1-10 scale) before adjusting for how strong the news is. */
export const BASE_SEVERITY: Record<EventType, number> = {
  Geopolitical: 8, Macroeconomic: 6, "Credit Event": 7, "Merger/Acquisition": 6, "Product Launch": 4, Earnings: 5, Regulatory: 6, Other: 3,
};

/** Impact = class severity, adjusted by sentiment strength and intensity words. Near-neutral news is low impact. */
export function impactScore(event: EventType, sentiment: number, intensity: number): number {
  const base = BASE_SEVERITY[event];
  const m = Math.abs(sentiment);
  if (m < 0.15) return Math.max(1, Math.round(base * 0.3));
  const v = base + 2 * (m - 0.65) + 0.5 * intensity;
  return Math.min(10, Math.max(1, Math.round(v)));
}

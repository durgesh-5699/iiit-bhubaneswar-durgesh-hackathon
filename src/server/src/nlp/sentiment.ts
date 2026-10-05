import { INTENSIFIERS, NEGATORS, PHRASES, WORDS } from "./lexicon";

export interface SentimentResult { score: number; terms: string[]; intensity: number }

/** Rule/lexicon sentiment: phrases first (masked), then words with simple negation. Returns -1..1. */
export function ruleSentiment(text: string): SentimentResult {
  let t = text;
  let sum = 0;
  const terms: string[] = [];

  const apply = (rules: typeof PHRASES, negatable: boolean) => {
    for (const rule of rules) {
      rule.re.lastIndex = 0;
      // rules contain no capture groups, so the callback args are (match, offset, fullString)
      t = t.replace(rule.re, (m: string, offset: number, full: string) => {
        let w = rule.w;
        if (negatable && NEGATORS.test(full.slice(Math.max(0, offset - 30), offset))) w = -0.7 * w;
        sum += w;
        terms.push(`${m.trim().toLowerCase()} (${w > 0 ? "+" : ""}${w.toFixed(1)})`);
        return " ".repeat(m.length);
      });
    }
  };
  apply(PHRASES, false);
  apply(WORDS, true);

  const intensity = Math.min(2, (text.match(INTENSIFIERS) ?? []).length);
  return { score: Math.round(Math.tanh(0.7 * sum) * 100) / 100, terms, intensity };
}

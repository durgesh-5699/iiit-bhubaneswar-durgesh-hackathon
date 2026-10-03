import { Stock } from "../types";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");

/**
 * Links free text to tickers in the mock index.
 *  - cashtags ($AAPL) are matched exactly
 *  - company names / aliases are matched case-sensitively with word boundaries
 *    (so "Apple" matches but "apple pie" does not; bare tickers like "GS" or "KO" are ignored on purpose)
 */
export class EntityLinker {
  private readonly tickers: Set<string>;
  private readonly patterns: { ticker: string; re: RegExp }[];

  constructor(stocks: Stock[]) {
    this.tickers = new Set(stocks.map((s) => s.ticker));
    this.patterns = stocks.map((s) => {
      const alts = [s.name, ...s.aliases].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
      return { ticker: s.ticker, re: new RegExp(`(?<![\\w$])(?:${alts})(?!\\w)`) };
    });
  }

  link(text: string): string[] {
    const found = new Set<string>();
    for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) if (this.tickers.has(m[1])) found.add(m[1]);
    for (const { ticker, re } of this.patterns) if (re.test(text)) found.add(ticker);
    return [...found].sort();
  }
}


import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "../../data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const write = (f: string, data: unknown) =>
  fs.writeFileSync(path.join(DATA_DIR, f), typeof data === "string" ? data : JSON.stringify(data, null, 2));

type Stock = { ticker: string; name: string; aliases: string[]; sector: string; beta: number };
const STOCKS: Stock[] = [
  { ticker: "AAPL", name: "Apple", aliases: ["Apple Inc", "iPhone maker"], sector: "Technology", beta: 1.2 },
  { ticker: "MSFT", name: "Microsoft", aliases: ["Microsoft Corp"], sector: "Technology", beta: 0.9 },
  { ticker: "GOOGL", name: "Alphabet", aliases: ["Google", "Alphabet Inc"], sector: "Technology", beta: 1.05 },
  { ticker: "AMZN", name: "Amazon", aliases: ["Amazon.com", "AWS parent"], sector: "Consumer Discretionary", beta: 1.15 },
  { ticker: "NVDA", name: "Nvidia", aliases: ["Nvidia Corp"], sector: "Technology", beta: 1.7 },
  { ticker: "META", name: "Meta Platforms", aliases: ["Meta", "Facebook parent"], sector: "Communication Services", beta: 1.3 },
  { ticker: "TSLA", name: "Tesla", aliases: ["Tesla Inc"], sector: "Consumer Discretionary", beta: 2.0 },
  { ticker: "JPM", name: "JPMorgan Chase", aliases: ["JPMorgan", "JP Morgan"], sector: "Financials", beta: 1.1 },
  { ticker: "BAC", name: "Bank of America", aliases: ["BofA"], sector: "Financials", beta: 1.3 },
  { ticker: "GS", name: "Goldman Sachs", aliases: ["Goldman"], sector: "Financials", beta: 1.35 },
  { ticker: "XOM", name: "Exxon Mobil", aliases: ["Exxon", "ExxonMobil"], sector: "Energy", beta: 0.95 },
  { ticker: "JNJ", name: "Johnson & Johnson", aliases: ["J&J"], sector: "Healthcare", beta: 0.55 },
  { ticker: "PFE", name: "Pfizer", aliases: ["Pfizer Inc"], sector: "Healthcare", beta: 0.6 },
  { ticker: "WMT", name: "Walmart", aliases: ["Walmart Inc"], sector: "Consumer Staples", beta: 0.5 },
  { ticker: "KO", name: "Coca-Cola", aliases: ["Coca Cola", "Coke"], sector: "Consumer Staples", beta: 0.6 },
];
write("tickers.json", STOCKS);

type EventType = "Geopolitical" | "Macroeconomic" | "Credit Event" | "Merger/Acquisition" | "Product Launch" | "Earnings" | "Regulatory";
type Pol = "pos" | "neg" | "neu";
const BASE_IMPACT: Record<EventType, number> = {
  Geopolitical: 8, Macroeconomic: 6, "Credit Event": 7, "Merger/Acquisition": 6, "Product Launch": 4, Earnings: 5, Regulatory: 6,
};
const COMPANY_EVENTS: EventType[] = ["Earnings", "Product Launch", "Merger/Acquisition", "Credit Event", "Regulatory"];

const NEWS_CO: Record<string, Record<Pol, string[]>> = {
  Earnings: {
    pos: ["{co} beats quarterly earnings estimates and raises full-year guidance", "{co} posts record revenue as customer demand stays strong", "{co} profit surges past analyst forecasts on margin expansion"],
    neg: ["{co} misses profit estimates and cuts annual outlook", "{co} shares slide after weak quarterly revenue and soft guidance", "{co} reports sharp earnings decline as costs climb"],
    neu: ["{co} reports quarterly results broadly in line with expectations", "{co} to release quarterly earnings after the market close on Thursday"],
  },
  "Product Launch": {
    pos: ["{co} unveils new product lineup, early orders exceed expectations", "{co} launches next-generation platform to strong reviews", "{co} debuts flagship service, analysts see new revenue stream"],
    neg: ["{co} delays flagship launch amid supply chain problems", "{co} recalls newly launched product after safety complaints", "{co} product rollout draws weak demand and poor reviews"],
    neu: ["{co} announces product event scheduled for next month", "{co} teases upcoming launch without sharing details"],
  },
  "Merger/Acquisition": {
    pos: ["{co} agrees to acquire a rival in a multi-billion dollar deal", "{co} announces strategic acquisition expected to boost earnings", "{co} completes merger, projects significant cost synergies"],
    neg: ["{co} abandons takeover bid after regulatory pushback", "{co} faces shareholder backlash over expensive acquisition", "{co} takeover talks collapse, shares drop"],
    neu: ["{co} reportedly exploring strategic acquisitions, sources say", "{co} confirms preliminary merger discussions without terms"],
  },
  "Credit Event": {
    pos: ["{co} upgraded by rating agency on stronger balance sheet", "{co} refinances debt at lower rates, improving liquidity outlook"],
    neg: ["Rating agency places {co} on negative watch over rising leverage", "{co} downgraded as debt load and interest costs climb", "{co} faces covenant concerns after weaker cash flow", "Credit spreads on {co} bonds widen sharply on default worries"],
    neu: ["{co} to hold investor call on debt refinancing plans", "{co} files prospectus for new bond offering"],
  },
  Regulatory: {
    pos: ["{co} wins regulatory approval, clearing path for expansion", "{co} cleared of wrongdoing as regulators close investigation"],
    neg: ["Regulators open antitrust probe into {co}", "{co} hit with multi-billion dollar fine over compliance failures", "New rules threaten {co}'s core business model"],
    neu: ["{co} says it is cooperating with regulators on routine review", "Lawmakers to hold hearing on {co} industry practices"],
  },
};

const NEWS_MKT: Record<"Geopolitical" | "Macroeconomic", Record<Pol, string[]>> = {
  Geopolitical: {
    neg: ["Escalating tensions in the Middle East push oil sharply higher and rattle equity markets", "New sanctions announced as regional conflict widens, global risk appetite weakens", "Trade war fears resurface after fresh tariff threats between major economies", "Cross-border military escalation sparks flight to safe-haven assets", "Shipping disruptions in a key maritime corridor raise supply chain concerns"],
    pos: ["Ceasefire agreement eases geopolitical tensions, global markets rally", "Diplomatic breakthrough lifts equities as trade tensions fade"],
    neu: ["World leaders to meet next week to discuss regional security"],
  },
  Macroeconomic: {
    neg: ["Fed signals further rate hikes as inflation stays stubbornly high", "Surprise jump in unemployment raises recession fears", "Core inflation comes in hotter than expected, bond yields surge", "GDP contracts for a second straight quarter, growth worries deepen"],
    pos: ["Inflation cools more than expected, boosting rate-cut hopes", "Jobs report beats forecasts, easing recession worries", "Central bank signals pause in rate hikes, markets cheer"],
    neu: ["Central bank policy meeting scheduled for next week", "Markets await key inflation data due on Wednesday"],
  },
};
const BODY: Record<Pol, string[]> = {
  pos: ["Analysts said the development could support the shares in the near term.", "Investors welcomed the news, with trading volumes rising.", "Several brokerages reiterated bullish views following the announcement."],
  neg: ["Analysts warned the development could weigh on the shares in the near term.", "Investors reacted cautiously, with selling pressure building.", "Several brokerages flagged downside risks following the announcement."],
  neu: ["Analysts said the impact on valuation remains unclear for now.", "Market reaction was muted as investors awaited further details."],
};
const PUBLISHERS = ["Synthetic Financial Wire", "Market Pulse (synthetic)", "Global Markets Daily (synthetic)"];


const TW_CO: Record<string, Record<Pol, string[]>> = {
  Earnings: { pos: ["{t} crushed earnings 📈 guidance raised, bullish", "{t} numbers are insane, adding to my position 🚀"], neg: ["{t} earnings miss + guidance cut. ouch 📉", "dumping {t}, this quarter was awful"], neu: ["{t} reports earnings after the bell today", "waiting on {t} results, no position yet"] },
  "Product Launch": { pos: ["new {t} launch looks amazing, orders flying 🔥", "{t} just dropped something huge, bullish"], neg: ["{t} product delayed again... disappointing", "{t} launch is a flop imo, bearish"], neu: ["{t} event next month, anyone going?", "heard {t} has something coming up"] },
  "Merger/Acquisition": { pos: ["{t} buying a rival?! smart move, bullish", "{t} deal is accretive, love it 💪"], neg: ["{t} deal collapsed after regulators pushed back, bearish", "overpaying for that acquisition, {t} is a sell for me"], neu: ["rumors that {t} is eyeing acquisitions, let's see", "{t} confirms talks, no terms yet"] },
  "Credit Event": { pos: ["{t} credit rating upgraded, balance sheet looking healthy 💪", "{t} refinanced at lower rates, solid"], neg: ["{t} downgraded, debt load worrying me, selling", "{t} bond spreads blowing out ⚠️ stay careful"], neu: ["{t} bond offering coming this week", "{t} debt call tomorrow"] },
  Regulatory: { pos: ["{t} wins approval, path is clear ✅", "{t} cleared by regulators, great news"], neg: ["antitrust probe on {t}, this could get ugly ⚠️", "{t} fined again... regulators not letting go"], neu: ["{t} says it's cooperating with regulators", "hearing on {t} industry tomorrow"] },
};
const TW_MKT: Record<"Geopolitical" | "Macroeconomic", Record<Pol, string[]>> = {
  Geopolitical: { neg: ["Oil spiking, markets bleeding. geopolitics is scary rn #markets", "sanctions + escalation = risk off. staying in cash 😬", "tensions rising again, de-risking my portfolio"], pos: ["ceasefire news! markets ripping 🚀 #stocks"], neu: ["leaders meeting next week, watching headlines"] },
  Macroeconomic: { neg: ["inflation hot again, Fed not done hiking 😬 #macro", "unemployment ticking up, recession vibes 📉"], pos: ["CPI cooler than expected! rate cut hopes alive 📈", "jobs report beat, soft landing is real? #macro"], neu: ["CPI data tomorrow, who's ready? #macro"] },
};
const TAGS = ["#stocks", "#investing", "#trading", "#markets", "#finance", ""];


const START = Date.parse("2026-09-01T00:00:00Z");
const END = Date.parse("2026-09-30T23:59:00Z");
const randTime = () => new Date(START + rand() * (END - START));
function pol(event: EventType): Pol {
  const r = rand();
  if (event === "Credit Event") return r < 0.6 ? "neg" : r < 0.8 ? "pos" : "neu";
  if (event === "Geopolitical") return r < 0.7 ? "neg" : r < 0.85 ? "pos" : "neu";
  return r < 0.4 ? "neg" : r < 0.8 ? "pos" : "neu";
}
function gold(event: EventType, p: Pol) {
  const sentiment = p === "pos" ? between(0.45, 0.9) : p === "neg" ? -between(0.45, 0.9) : between(-0.12, 0.12);
  const impact = p === "neu" ? Math.max(1, Math.round(BASE_IMPACT[event] * 0.3)) : clamp(BASE_IMPACT[event] + Math.round(between(-1, 1.4)), 1, 10);
  return { gold_event: event, gold_sentiment: r2(sentiment), gold_impact: impact };
}

type News = Record<string, unknown> & { id: string; published_at: string };
const news: News[] = [];
let nid = 1;
for (let i = 0; i < 90; i++) {
  const market = i % 3 === 2; // ~1/3 market-level
  const when = randTime().toISOString();
  if (market) {
    const event = (rand() < 0.45 ? "Geopolitical" : "Macroeconomic") as "Geopolitical" | "Macroeconomic";
    const p = pol(event);
    news.push({ id: `N${String(nid++).padStart(3, "0")}`, source: "news", publisher: pick(PUBLISHERS), published_at: when,
      headline: pick(NEWS_MKT[event][p]), body: pick(BODY[p]), tickers: [], ...gold(event, p) });
  } else {
    const event = pick(COMPANY_EVENTS);
    const s = pick(STOCKS);
    const p = pol(event);
    news.push({ id: `N${String(nid++).padStart(3, "0")}`, source: "news", publisher: pick(PUBLISHERS), published_at: when,
      headline: pick(NEWS_CO[event][p]).replace("{co}", s.name), body: pick(BODY[p]), tickers: [s.ticker], ...gold(event, p) });
  }
}

for (const src of news.slice(0, 40).filter((_, i) => i % 10 === 0)) {
  news.push({ ...src, id: `N${String(nid++).padStart(3, "0")}`, publisher: pick(PUBLISHERS),
    published_at: new Date(Date.parse(src.published_at) + 1000 * 60 * Math.round(between(3, 40))).toISOString(), gold_duplicate_of: src.id });
}
news.sort((a, b) => a.published_at.localeCompare(b.published_at));
write("news_sample.json", news);


const tweets: Record<string, unknown>[] = [];
let tid = 1;
for (let i = 0; i < 120; i++) {
  const market = i % 6 === 5; // ~1/6 market-level
  const when = randTime().toISOString();
  const base = { id: `T${String(tid++).padStart(3, "0")}`, source: "twitter", user: `@trader_${Math.floor(between(100, 9999))}`,
    created_at: when, likes: Math.floor(between(0, 800)), retweets: Math.floor(between(0, 200)) };
  const tag = pick(TAGS);
  if (market) {
    const event = (rand() < 0.5 ? "Geopolitical" : "Macroeconomic") as "Geopolitical" | "Macroeconomic";
    const p = pol(event);
    tweets.push({ ...base, text: `${pick(TW_MKT[event][p])} ${tag}`.trim(), tickers: [], ...gold(event, p) });
  } else {
    const event = pick(COMPANY_EVENTS);
    const s = pick(STOCKS);
    const p = pol(event);
    const ref = rand() < 0.8 ? `$${s.ticker}` : s.name; // 20% mention by name -> tests entity linking
    tweets.push({ ...base, text: `${pick(TW_CO[event][p]).replace("{t}", ref)} ${tag}`.trim(), tickers: [s.ticker], ...gold(event, p) });
  }
}
tweets.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
write("tweets_sample.json", tweets);


const RATING_PD: Record<string, number> = { AAA: 0.0005, AA: 0.002, A: 0.005, BBB: 0.015, BB: 0.04 };
type Pos = Record<string, unknown>;
const portfolio: Pos[] = [];
let pid = 1;
const add = (p: Pos) => portfolio.push({ position_id: `P${String(pid++).padStart(3, "0")}`, ...p });
const sectors = ["Industrials", "Energy", "Technology", "Healthcare", "Consumer Staples", "Financials", "Real Estate", "Utilities"];
const borrowers = ["Meridian Steel Ltd", "Northwind Energy Corp", "Altair Software Inc", "Brightpath Health", "Harvest Foods Co", "Citadel Capital Partners", "Skyline Properties", "Evergreen Power Utilities"];
borrowers.forEach((b, i) => {
  const rating = pick(["A", "BBB", "BBB", "BB"]);
  add({ asset_type: "Loan", instrument: `Term loan - ${b}`, issuer_or_ticker: b, sector: sectors[i], currency: "USD",
    market_value_usd_m: r2(between(25, 120)), duration_yrs: r2(between(2, 5)), rating, pd: RATING_PD[rating], lgd: 0.45, equity_beta: 0, dv01_usd_k: 0 });
});
["JPM", "BAC", "GS", "XOM", "AAPL", "MSFT", "JNJ", "WMT"].forEach((t) => {
  const s = STOCKS.find((x) => x.ticker === t)!;
  const rating = pick(["AA", "A", "A", "BBB"]);
  add({ asset_type: "Corporate Bond", instrument: `${s.name} ${r2(between(3, 5.5))}% ${2029 + Math.floor(rand() * 6)}`, issuer_or_ticker: t, sector: s.sector,
    currency: "USD", market_value_usd_m: r2(between(30, 90)), duration_yrs: r2(between(3, 9)), rating, pd: RATING_PD[rating], lgd: 0.4, equity_beta: 0, dv01_usd_k: 0 });
});
[2, 5, 10, 30].forEach((y) =>
  add({ asset_type: "Government Bond", instrument: `US Treasury ${y}Y`, issuer_or_ticker: "UST", sector: "Sovereign", currency: "USD",
    market_value_usd_m: r2(between(40, 150)), duration_yrs: r2(y * 0.9), rating: "AAA", pd: RATING_PD.AAA, lgd: 0, equity_beta: 0, dv01_usd_k: 0 }));
["NVDA", "TSLA", "META", "GOOGL", "AMZN", "PFE"].forEach((t) => {
  const s = STOCKS.find((x) => x.ticker === t)!;
  add({ asset_type: "Equity", instrument: `${s.name} common stock`, issuer_or_ticker: t, sector: s.sector, currency: "USD",
    market_value_usd_m: r2(between(15, 70)), duration_yrs: 0, rating: "NR", pd: 0, lgd: 0, equity_beta: s.beta, dv01_usd_k: 0 });
});
[
  { instrument: "Interest rate swap - pay fixed 5Y", dv01: 180, mv: 4.2 },
  { instrument: "Interest rate swap - pay fixed 10Y", dv01: 320, mv: 6.8 },
  { instrument: "Interest rate swap - receive fixed 3Y", dv01: -140, mv: -2.1 },
  { instrument: "Interest rate cap 2Y", dv01: 60, mv: 1.5 },
].forEach((d) =>
  add({ asset_type: "Derivative", instrument: d.instrument, issuer_or_ticker: "OTC", sector: "Rates", currency: "USD",
    market_value_usd_m: d.mv, duration_yrs: 0, rating: "A", pd: RATING_PD.A, lgd: 0.4, equity_beta: 0, dv01_usd_k: d.dv01 }));
write("portfolio.json", portfolio);


write("shocks.json", {
  _description: "Shocks at impact=10. Applied scaled by impact/10. Triggered only when impact_score > trigger.min_impact.",
  trigger: { min_impact: 7 },
  scaling: "shock = base_shock * (impact_score / 10)",
  valuation_model: {
    equity: "MV * (equity_pct/100) * beta",
    bond_and_loan: "MV * -(duration) * (rate_bps + credit_spread_bps)/10000  (government bonds: rate only)",
    loan_credit_loss: "extra expected loss = MV * lgd * (credit_spread_bps/10000) * 0.5",
    derivative: "-dv01_usd_k/1000 * rate_bps (USD m); positive DV01 = pay-fixed",
  },
  event_shocks: {
    Geopolitical: { equity_pct: -15, rate_bps: -50, credit_spread_bps: 150 },
    Macroeconomic: { equity_pct: -10, rate_bps: 200, credit_spread_bps: 75 },
    "Credit Event": { equity_pct: -8, rate_bps: 0, credit_spread_bps: 200 },
    Regulatory: { equity_pct: -6, rate_bps: 0, credit_spread_bps: 40 },
    Earnings: { equity_pct: -5, rate_bps: 0, credit_spread_bps: 20 },
    "Merger/Acquisition": { equity_pct: -2, rate_bps: 0, credit_spread_bps: 10 },
    "Product Launch": { equity_pct: -1, rate_bps: 0, credit_spread_bps: 0 },
  },
});


const startPx: Record<string, number> = { AAPL: 230, MSFT: 440, GOOGL: 175, AMZN: 195, NVDA: 130, META: 560, TSLA: 250, JPM: 215, BAC: 42, GS: 520, XOM: 115, JNJ: 160, PFE: 28, WMT: 70, KO: 66 };
const days: string[] = [];
for (let d = Date.parse("2026-08-25T00:00:00Z"); d <= Date.parse("2026-09-30T00:00:00Z"); d += 86400000) {
  const dt = new Date(d); const wd = dt.getUTCDay(); const iso = dt.toISOString().slice(0, 10);
  if (wd !== 0 && wd !== 6 && iso !== "2026-09-07") days.push(iso); // skip weekends + US Labor Day
}
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
let csv = "date,ticker,close\n";
for (const s of STOCKS) {
  let px = startPx[s.ticker];
  for (const day of days) { px *= 1 + gauss() * 0.014 * Math.max(0.6, s.beta); csv += `${day},${s.ticker},${px.toFixed(2)}\n`; }
}
write("prices_fallback.csv", csv);


const dist = (arr: Record<string, unknown>[]) => arr.reduce<Record<string, number>>((m, x) => ((m[String(x.gold_event)] = (m[String(x.gold_event)] || 0) + 1), m), {});
console.log(`tickers: ${STOCKS.length} | news: ${news.length} | tweets: ${tweets.length} | portfolio positions: ${portfolio.length} | price rows: ${csv.split("\n").length - 2}`);
console.log("news events:", dist(news));
console.log("tweet events:", dist(tweets));

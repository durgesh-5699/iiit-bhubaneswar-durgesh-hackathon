import { EVENT_TYPES, EventType } from "./signal";

interface ERule { re: RegExp; w: number }
const e = (p: string, w: number, flags = "i"): ERule => ({ re: new RegExp(p, flags), w });

const RULES: Record<(typeof EVENT_TYPES)[number], ERule[]> = {
  Earnings: [e("\\bearnings\\b", 2), e("\\bquarter(?:ly)?\\b", 1.5), e("\\brevenues?\\b", 1.5), e("\\bprofits?\\b", 1.5), e("\\bguidance\\b", 2),
    e("\\boutlook\\b", 1), e("\\bforecasts?\\b", 0.8), e("\\bresults\\b", 1), e("\\bmargins?\\b", 1), e("\\bEPS\\b", 2, ""), e("\\bsales\\b", 0.8), e("\\bdeliver(?:y|ies)\\b", 1)],
  "Product Launch": [e("\\blaunch(?:es|ed|ing)?\\b", 2), e("\\bunveil(?:s|ed)?\\b", 2), e("\\bdebut(?:s|ed)?\\b", 2), e("\\broll(?:ing)? ?out\\b", 1.5),
    e("\\bproducts?\\b", 1), e("\\b(?:lineup|flagship|keynote|smart glasses|chip family|developer conference)\\b", 1.5), e("\\bnew (?:iphone|chip|model|platform|service)\\b", 1.5),
    e("\\bteases?\\b", 1), e("\\brecalls?\\b", 1.5), e("\\borders\\b", 0.8)],
  "Merger/Acquisition": [e("\\bacquir\\w+", 2.5), e("\\bacquisitions?\\b", 2.5), e("\\b(?:merger|merge[sd]?)\\b", 2.5), e("\\btakeover\\b", 2.5), e("\\bbuyout\\b", 2.5),
    e("\\b(?:to buy|buys|buying|bought)\\b", 1.5), e("\\bdeal\\b", 1.2), e("\\bbid\\b", 1), e("\\btalks\\b", 0.8), e("\\b(?:synerg(?:y|ies)|accretive)\\b", 1.5), e("\\bstake\\b", 0.8),
    e("for \\$\\d+(?:\\.\\d+)? ?(?:billion|million)", 1)],
  "Credit Event": [e("\\bratings?\\b", 2), e("\\brated\\b", 1.5), e("\\b(?:downgrade[sd]?|upgrade[sd]?)\\b", 1.5), e("\\bdebt\\b", 2), e("\\bbonds?\\b", 1.5), e("\\bspreads?\\b", 2),
    e("\\bcredit\\b", 2), e("\\bleverage\\b", 1.5), e("\\bcovenant\\b", 2.5), e("\\bdefault\\b", 2.5), e("\\brefinanc\\w+", 2.5), e("negative watch|outlook to negative", 2.5),
    e("\\bprospectus\\b", 2), e("\\b(?:moody'?s|fitch|agency)\\b", 2), e("\\bliquidity\\b", 1), e("funding costs", 1.5), e("\\bborrowing\\b", 1)],
  Regulatory: [e("\\bregulat\\w+", 2), e("\\bantitrust\\b", 2.5), e("\\bprobe\\b", 2), e("\\binvestigation\\b", 1.5), e("\\b(?:fined|fines)\\b|\\bfine of\\b", 2), e("\\b(?:approval|approved)\\b", 1.5),
    e("\\bFDA\\b", 2.5, ""), e("\\bcompliance\\b", 2), e("\\b(?:lawmakers|congress|senate|hearing)\\b", 1.5), e("\\bSEC\\b", 1.5, ""), e("\\blawsuit\\b", 1.5), e("\\bscrutiny\\b", 1.5),
    e("green light", 1.5), e("\\bcleared\\b", 1)],
  Macroeconomic: [e("\\binflation\\b", 2.5), e("\\bCPI\\b", 2.5, ""), e("\\bFed\\b", 2.5, ""), e("federal reserve", 2.5), e("central bank", 2.5), e("\\brate (?:hikes?|cuts?)\\b|interest rates?", 2),
    e("\\brates\\b", 0.8), e("\\bunemployment\\b", 2.5), e("jobs report|\\bpayrolls\\b|\\bjobless\\b", 2.5), e("\\bGDP\\b", 2.5, ""), e("\\brecession\\b", 2.5), e("\\byields?\\b", 1.5),
    e("consumer prices", 2.5), e("\\beconom(?:y|ic|ies)\\b", 1.5), e("\\bpivot\\b", 1)],
  Geopolitical: [e("\\btensions?\\b", 2), e("\\bsanctions?\\b", 2.5), e("\\bconflict\\b", 2), e("\\bceasefire\\b", 3), e("\\bmilitary\\b", 2), e("\\bwar\\b", 2), e("\\bgeopolit\\w+", 3),
    e("\\btariffs?\\b", 2), e("trade war", 3), e("trade deal", 2.5), e("\\bdiplomatic\\b", 2.5), e("\\bpeace\\b", 2), e("\\bescalat\\w+", 1.5), e("\\b(?:attacks?|strikes?)\\b", 1), e("\\bblockade\\b", 2.5),
    e("\\bnaval\\b", 2), e("\\bborder\\b", 1.5), e("middle east", 2.5), e("\\boil\\b", 1), e("\\bshipping\\b", 1.5), e("\\bmaritime\\b", 1.5), e("\\bdrone\\b", 2), e("\\bclashes\\b", 2), e("\\bsummit\\b", 1)],
};

const COMPANY_TYPES: EventType[] = ["Earnings", "Product Launch", "Merger/Acquisition", "Credit Event", "Regulatory"];
const MARKET_TYPES: EventType[] = ["Macroeconomic", "Geopolitical"];

export interface EventResult { type: EventType; confidence: number; terms: string[]; scores: Record<string, number> }

export function ruleEvent(text: string, scope: "company" | "market"): EventResult {
  const scores: Record<string, number> = {};
  const hits: Record<string, string[]> = {};
  for (const type of EVENT_TYPES) {
    let s = 0;
    for (const rule of RULES[type]) {
      const m = text.match(rule.re);
      if (m) { s += rule.w; (hits[type] ??= []).push(m[0].toLowerCase()); }
    }
    // scope prior: company-tagged text favours company events, untagged text favours market-wide ones
    if (s > 0) s += (scope === "company" ? COMPANY_TYPES : MARKET_TYPES).includes(type) ? 0.5 : 0;
    scores[type] = s;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, top] = ranked[0];
  const second = ranked[1][1];
  if (top <= 0) return { type: "Other", confidence: 0, terms: [], scores };
  return { type: topType as EventType, confidence: Math.round((top / (top + second + 1)) * 100) / 100, terms: hits[topType] ?? [], scores };
}

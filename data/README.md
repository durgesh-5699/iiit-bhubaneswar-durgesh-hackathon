# Data used by the prototype

| File | What | Source |
|---|---|---|
| `tickers.json` | 15 S&P 100 large caps (mock index universe) with aliases, sector, beta | Hand-curated (public company names) |
| `news_sample.json` | 94 news items (incl. 4 syndicated duplicates) | **Synthetic** (generated, seed 2026) |
| `tweets_sample.json` | 120 tweets | **Synthetic** (generated, seed 2026) |
| `portfolio.json` | 30-position synthetic wholesale banking book (loans, bonds, equities, derivatives) | **Synthetic** |
| `shocks.json` | Event-type to shock mapping for stress tests (impact > 7 triggers) | Assumptions (simplified model) |
| `prices.csv` | Daily closes, 15 tickers | Yahoo Finance via `yahoo-finance2` (`npm run fetch:prices`) |
| `prices_fallback.csv` | Random-walk prices used only if Yahoo is unreachable | **Synthetic** |

`gold_event`, `gold_sentiment`, `gold_impact` are the generator's ground-truth labels, used ONLY to evaluate the NLP engine (accuracy/MAE), never as engine input.
Regenerate everything: `cd src/server && npm run gen:data`.
No S&P Global / Crisil / proprietary data is used.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../../config";

export type AssetType = "Loan" | "Corporate Bond" | "Government Bond" | "Equity" | "Derivative";
export interface Position {
  position_id: string;
  asset_type: AssetType;
  instrument: string;
  issuer_or_ticker: string;
  sector: string;
  currency: string;
  market_value_usd_m: number;
  duration_yrs: number;
  rating: string;
  pd: number;
  lgd: number;
  equity_beta: number;
  dv01_usd_k: number; // derivatives: USD thousand per bp; positive = pay-fixed (gains when rates rise)
}
export interface Shock { equity_pct: number; rate_bps: number; credit_spread_bps: number }
export interface ShockConfig {
  trigger: { min_impact: number }; // an event triggers a stress test when impact_score > min_impact
  event_shocks: Record<string, Shock>; // shock sizes at impact = 10; scaled by impact / 10
}

export const loadPortfolio = (): Position[] => JSON.parse(fs.readFileSync(path.join(DATA_DIR, "portfolio.json"), "utf-8"));
export const loadShockConfig = (): ShockConfig => JSON.parse(fs.readFileSync(path.join(DATA_DIR, "shocks.json"), "utf-8"));

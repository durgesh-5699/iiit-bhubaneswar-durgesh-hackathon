import mongoose, { Schema } from "mongoose";
import { DailySentiment } from "../aggregation/aggregate";
import { Signal } from "../nlp/signal";
import { SignalFilter, Store } from "./store";

const signalSchema = new Schema(
  { doc_id: { type: String, unique: true }, source: String, published_at: String, tickers: [String], scope: String, sentiment_score: Number, sentiment_label: String,
    event_type: String, event_confidence: Number, impact_score: Number, evidence: [String], method: Object },
  { versionKey: false });
signalSchema.index({ tickers: 1, published_at: -1 });
signalSchema.index({ impact_score: -1 });

const dailySchema = new Schema(
  { ticker: String, date: String, sentiment: Number, n_news: Number, n_tweets: Number, avg_impact: Number, max_impact: Number },
  { versionKey: false });
dailySchema.index({ ticker: 1, date: 1 }, { unique: true });

const SignalModel = mongoose.models.Signal ?? mongoose.model("Signal", signalSchema);
const DailyModel = mongoose.models.DailySentiment ?? mongoose.model("DailySentiment", dailySchema);

const clean = <T>(x: any): T => { const { _id, ...rest } = x; return rest as T; };

/** Optional store backed by MongoDB (set MONGODB_URI). Fill it with `npm run seed:mongo`. */
export class MongoStore implements Store {
  readonly name = "mongodb";
  static async connect(uri: string) { await mongoose.connect(uri); return new MongoStore(); }

  async signals(f: SignalFilter) {
    const q: Record<string, any> = {};
    if (f.ticker) q.tickers = f.ticker;
    if (f.event_type) q.event_type = f.event_type;
    if (f.source) q.source = f.source;
    if (f.scope) q.scope = f.scope;
    if (f.sentiment) q.sentiment_label = f.sentiment;
    if (f.min_impact !== undefined) q.impact_score = { $gte: f.min_impact };
    if (f.from || f.to) q.published_at = { ...(f.from && { $gte: new Date(f.from).toISOString() }), ...(f.to && { $lte: new Date(f.to).toISOString() }) };
    return (await SignalModel.find(q).sort({ published_at: -1 }).limit(f.limit).lean()).map((x) => clean<Signal>(x));
  }
  async signal(id: string) { const x = await SignalModel.findOne({ doc_id: id }).lean(); return x ? clean<Signal>(x) : null; }
  async series(ticker: string, from?: string, to?: string) {
    const q: Record<string, any> = { ticker };
    if (from || to) q.date = { ...(from && { $gte: from.slice(0, 10) }), ...(to && { $lte: to.slice(0, 10) }) };
    return (await DailyModel.find(q).sort({ date: 1 }).lean()).map((x) => clean<DailySentiment>(x));
  }
  async latest() {
    const rows = await DailyModel.aggregate([{ $sort: { date: 1 } }, { $group: { _id: "$ticker", doc: { $last: "$$ROOT" } } }, { $replaceRoot: { newRoot: "$doc" } }, { $sort: { ticker: 1 } }]);
    return rows.map((x) => clean<DailySentiment>(x));
  }
  async counts() { return { signals: await SignalModel.countDocuments(), dailyRows: await DailyModel.countDocuments() }; }

  /** Replace collections with fresh data (used by the seed script). */
  static async seed(signals: Signal[], daily: DailySentiment[]) {
    await SignalModel.deleteMany({}); await DailyModel.deleteMany({});
    await SignalModel.insertMany(signals); await DailyModel.insertMany(daily);
  }
}

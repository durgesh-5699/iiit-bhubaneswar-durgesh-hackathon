import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { DEFAULT_PARAMS, getJson } from '../api'
import type { Params, RebalanceResult } from '../api'
import { PALETTE, TIP, pct, scoreColor, shortDate, signed } from '../format'

const CONTROLS: { key: keyof Params; label: string; min: number; max: number; step: number; help: string; fmt?: (v: number) => string }[] = [
  { key: 'tilt', label: 'Tilt strength', min: 0, max: 3, step: 0.1, help: 'How strongly sentiment moves weights (0 = equal weight)' },
  { key: 'decay', label: 'Sentiment memory', min: 0, max: 0.95, step: 0.05, help: 'Daily carry-over of past sentiment' },
  { key: 'alpha', label: 'Trade speed', min: 0.1, max: 1, step: 0.05, help: 'Share of the gap to target closed per day' },
  { key: 'max_turnover', label: 'Max daily turnover', min: 0.01, max: 0.5, step: 0.01, help: 'One-way turnover cap per day', fmt: (v) => pct(v, 0) },
  { key: 'max_weight', label: 'Max weight / stock', min: 0.08, max: 0.4, step: 0.01, help: 'Concentration cap', fmt: (v) => pct(v, 0) },
  { key: 'market_gamma', label: 'Market rotation', min: 0, max: 2, step: 0.1, help: 'Market-wide sentiment shifts weight between high- and low-beta stocks' },
  { key: 'cost_bps', label: 'Cost (bps)', min: 0, max: 50, step: 1, help: 'Transaction cost per unit of turnover' },
]

function useRebalance(params: Params) {
  const [data, setData] = useState<RebalanceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
      getJson<RebalanceResult>(`/api/rebalance?${qs}`, ctl.signal)
        .then((r) => { setData(r); setError(null) })
        .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
        .finally(() => setLoading(false))
    }, 250) // debounce slider drags
    return () => { clearTimeout(t); ctl.abort() }
  }, [params])

  return { data, error, loading }
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="kpi">
      <span className="muted">{label}</span>
      <strong className={tone}>{value}</strong>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  )
}

export default function RebalancerPanel() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)
  const { data, error, loading } = useRebalance(params)
  const [picked, setPicked] = useState<number | null>(null)

  const hist = data?.history ?? []
  const idx = picked === null ? hist.length - 1 : Math.min(picked, hist.length - 1)
  const day = hist[idx]

  const areaData = useMemo(
    () => hist.map((h) => {
      const total = Object.values(h.weights).reduce((a, b) => a + b, 0) || 1
      return { date: shortDate(h.date), ...Object.fromEntries(Object.entries(h.weights).map(([t, w]) => [t, +((w / total) * 100).toFixed(2)])) }
    }),
    [hist],
  )
  const perfData = useMemo(() => (data?.performance ?? []).map((p) => ({ ...p, date: shortDate(p.date) })), [data])
  const dayBars = useMemo(() => {
    if (!day || !data) return []
    return data.tickers.map((t) => ({ ticker: t, weight: +(day.weights[t] * 100).toFixed(2), score: day.scores[t] })).sort((a, b) => b.weight - a.weight)
  }, [day, data])

  const equal = data ? 100 / data.tickers.length : 0
  const m = data?.metrics

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Module A · Tactical index rebalancer</h2>
          <button className="ghost" onClick={() => setParams(DEFAULT_PARAMS)}>Reset parameters</button>
        </div>
        <p className="muted">
          A mock index of {data?.tickers.length ?? 15} large caps starts equal-weighted. Positive sentiment raises a stock&apos;s weight, negative lowers it,
          subject to weight caps and a daily turnover limit.
        </p>
        <div className="controls">
          {CONTROLS.map((c) => (
            <label key={c.key} title={c.help}>
              <span>{c.label}<b>{c.fmt ? c.fmt(params[c.key]) : params[c.key]}</b></span>
              <input type="range" min={c.min} max={c.max} step={c.step} value={params[c.key]}
                onChange={(e) => setParams({ ...params, [c.key]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {data && m && (
        <>
          <div className="kpis" style={{ opacity: loading ? 0.6 : 1 }}>
            <Kpi label="Strategy return" value={`${signed(m.portfolio.total_return_pct)}%`} sub={`vol ${m.portfolio.vol_ann_pct}% · maxDD ${m.portfolio.max_drawdown_pct}%`} tone={m.portfolio.total_return_pct >= 0 ? 'pos' : 'neg'} />
            <Kpi label="Equal-weight benchmark" value={`${signed(m.equal_weight.total_return_pct)}%`} sub={`vol ${m.equal_weight.vol_ann_pct}% · maxDD ${m.equal_weight.max_drawdown_pct}%`} />
            <Kpi label="Active return" value={`${signed(m.active_return_pct)}%`} tone={m.active_return_pct >= 0 ? 'pos' : 'neg'} />
            <Kpi label="Avg daily turnover" value={`${m.avg_daily_turnover_pct}%`} sub={`costs ${m.total_cost_pct}% total`} />
            <Kpi label="Signal IC" value={m.information_coefficient === null ? 'n/a' : String(m.information_coefficient)} sub={`${m.ic_pairs} stock-days`} />
          </div>

          <section className="card">
            <h2>Index weights over time</h2>
            <p className="muted">Stacked share of each stock in the index (each day sums to 100%).</p>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={areaData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis domain={[0, 100]} allowDataOverflow tickFormatter={(v) => `${Math.round(Number(v))}%`} fontSize={12} />
                <Tooltip {...TIP} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                {data.tickers.map((t, i) => (
                  <Area key={t} type="monotone" dataKey={t} stackId="w" stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.75} />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <div className="grid2">
            <section className="card">
              <h2>Strategy vs equal-weight (start = 100)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={perfData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis domain={['auto', 'auto']} fontSize={12} />
                  <Tooltip {...TIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="portfolio" name="Sentiment strategy" stroke="#4f46e5" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="equal_weight" name="Equal weight" stroke="#94a3b8" dot={false} strokeWidth={2} strokeDasharray="5 4" />
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Weights on {day?.date}</h2>
                <span className="muted small">turnover {day ? pct(day.turnover) : ''}</span>
              </div>
              <input className="scrub" type="range" min={0} max={Math.max(0, hist.length - 1)} value={idx} onChange={(e) => setPicked(Number(e.target.value))} />
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dayBars} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="ticker" fontSize={10} interval={0} angle={-45} textAnchor="end" height={52} />
                  <YAxis unit="%" fontSize={12} />
                  <Tooltip {...TIP} formatter={(v) => `${Number(v).toFixed(2)}%`} />
                  <ReferenceLine y={equal} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'equal weight', fontSize: 11, position: 'insideTopRight' }} />
                  <Bar dataKey="weight" name="Weight">
                    {dayBars.map((b) => <Cell key={b.ticker} fill={b.weight >= equal ? 'var(--pos)' : 'var(--neg)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="muted small">
                Biggest moves: {day?.movers.map((x) => `${x.ticker} ${x.delta >= 0 ? '+' : ''}${(x.delta * 100).toFixed(2)}pp`).join(' · ') || '—'}
              </p>
            </section>
          </div>

          <section className="card">
            <h2>What drives the weights: sentiment conviction heatmap</h2>
            <p className="muted">Decayed sentiment score per stock per day (green = positive, red = negative), including market-wide rotation by beta.</p>
            <div className="scroll">
              <div className="heat" style={{ gridTemplateColumns: `64px repeat(${hist.length}, minmax(26px, 1fr))` }}>
                <span />
                {hist.map((h, i) => <span key={h.date} className={`hd ${i === idx ? 'sel' : ''}`}>{shortDate(h.date).slice(3)}</span>)}
                {data.tickers.map((t) => (
                  <HeatRow key={t} ticker={t} cells={hist.map((h) => h.scores[t])} selected={idx} />
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Latest recommended weights</h2>
            <div className="bars">
              {data.latest.map((x) => (
                <div key={x.ticker} className="bar-row">
                  <b>{x.ticker}</b>
                  <div className="track"><div style={{ width: `${(x.weight / (params.max_weight || 0.15)) * 100}%`, background: x.weight * 100 >= equal ? 'var(--pos)' : 'var(--neg)' }} /></div>
                  <span>{pct(x.weight)}</span>
                  <span className="muted small">{signed((x.weight * 100) - equal, 1)}pp vs equal</span>
                </div>
              ))}
            </div>
          </section>

          <p className="muted small note">
            {data.notes.map((n) => <span key={n}>{n} </span>)}
          </p>
        </>
      )}
      {!data && !error && <p className="muted">Loading…</p>}
    </div>
  )
}

function HeatRow({ ticker, cells, selected }: { ticker: string; cells: number[]; selected: number }) {
  return (
    <>
      <span className="ht">{ticker}</span>
      {cells.map((s, i) => (
        <span key={i} className={`hc ${i === selected ? 'sel' : ''}`} style={{ background: scoreColor(s) }} title={`${ticker}: ${signed(s)}`} />
      ))}
    </>
  )
}

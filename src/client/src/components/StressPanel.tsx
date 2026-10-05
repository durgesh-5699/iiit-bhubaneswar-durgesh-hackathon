import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EVENT_TYPES, getJson } from '../api'
import type { StressResult, TriggerRow } from '../api'
import { signed, timeLabel } from '../format'

interface UniverseRow { ticker: string; name: string }
type Mode = 'events' | 'scenario'
const usd = (n: number, d = 1) => `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}m`

function useResult(url: string | null) {
  const [data, setData] = useState<StressResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!url) return
    const ctl = new AbortController()
    getJson<StressResult>(url, ctl.signal)
      .then((r) => { setData(r); setError(null) })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => ctl.abort()
  }, [url])
  return { data, error }
}

export default function StressPanel() {
  const [mode, setMode] = useState<Mode>('events')
  const [triggers, setTriggers] = useState<TriggerRow[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [eventType, setEventType] = useState<string>('Geopolitical')
  const [impact, setImpact] = useState(9)
  const [ticker, setTicker] = useState('')
  const [universe, setUniverse] = useState<UniverseRow[]>([])
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => {
    getJson<{ data: TriggerRow[] }>('/api/stress/triggers')
      .then((r) => { setTriggers(r.data); setPicked((p) => p ?? r.data[0]?.doc_id ?? null) })
      .catch((e: Error) => setListError(e.message))
    getJson<{ data: UniverseRow[] }>('/api/universe').then((r) => setUniverse(r.data)).catch(() => undefined)
  }, [])

  const url = mode === 'events'
    ? (picked ? `/api/stress/run?doc_id=${encodeURIComponent(picked)}` : null)
    : `/api/stress/scenario?event_type=${encodeURIComponent(eventType)}&impact=${impact}${ticker ? `&ticker=${ticker}` : ''}`
  const { data, error } = useResult(url)

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Module B · Strategic portfolio stress test</h2>
          <div className="seg">
            <button className={mode === 'events' ? 'active' : ''} onClick={() => setMode('events')}>Detected events</button>
            <button className={mode === 'scenario' ? 'active' : ''} onClick={() => setMode('scenario')}>What-if scenario</button>
          </div>
        </div>
        <p className="muted">
          A synthetic wholesale-banking book (loans, bonds, equities, rate derivatives) is revalued when the NLP engine flags a severe adverse event
          (impact &gt; 7). Shock sizes scale with the impact score.
        </p>

        {mode === 'events' && (
          <>
            {listError && <p className="error">{listError}</p>}
            <div className="scroll tall">
              <table>
                <thead><tr><th>Time (UTC)</th><th>Event</th><th>Impact</th><th>Scope</th><th>Portfolio Δ</th><th>Headline</th></tr></thead>
                <tbody>
                  {triggers.map((t) => (
                    <tr key={t.doc_id} className={`pick ${t.doc_id === picked ? 'sel' : ''}`} onClick={() => setPicked(t.doc_id ?? null)}>
                      <td className="nowrap">{t.published_at ? timeLabel(t.published_at) : ''}</td>
                      <td><span className="pill">{t.event_type}</span></td>
                      <td><span className="badge high">{t.impact_score}</span></td>
                      <td>{t.scope === 'issuer-specific' ? t.tickers.join(', ') : 'market-wide'}</td>
                      <td className="negative nowrap">{signed(t.portfolio_delta_pct)}% · {usd(t.portfolio_delta_usd_m)}</td>
                      <td className="text">{t.text}</td>
                    </tr>
                  ))}
                  {!triggers.length && !listError && <tr><td colSpan={6} className="muted">No triggering events found.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {mode === 'scenario' && (
          <div className="controls">
            <label><span>Event type</span>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label><span>Impact score<b>{impact}</b></span>
              <input type="range" min={1} max={10} step={1} value={impact} onChange={(e) => setImpact(Number(e.target.value))} />
            </label>
            <label><span>Affected company (optional)</span>
              <select value={ticker} onChange={(e) => setTicker(e.target.value)}>
                <option value="">None (market-wide)</option>
                {universe.map((u) => <option key={u.ticker} value={u.ticker}>{u.ticker} · {u.name}</option>)}
              </select>
            </label>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {data && <Result r={data} />}
    </div>
  )
}

function Result({ r }: { r: StressResult }) {
  const p = r.portfolio
  const beforeAfter = [{ name: 'Before', value: p.before }, { name: 'After', value: p.after }]
  const sorted = [...r.positions].sort((a, b) => a.delta - b.delta)
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>{r.event.event_type} · impact {r.event.impact_score}/10 · {r.scope}{r.event.tickers.length ? ` (${r.event.tickers.join(', ')})` : ''}</h2>
          {r.triggered ? <span className="pill warn">stress test triggered</span> : <span className="pill">below trigger / not adverse (simulation only)</span>}
        </div>
        {r.event.text && <p className="muted">“{r.event.text}”</p>}
        <div className="chips">
          <span className="pill">Equities {signed(r.shocks.equity_pct, 1)}% × beta</span>
          <span className="pill">Rates {signed(r.shocks.rate_bps, 0)} bp</span>
          <span className="pill">Credit spreads {signed(r.shocks.credit_spread_bps, 0)} bp</span>
          <span className="pill">severity scale {(r.scale * 100).toFixed(0)}%</span>
        </div>
      </section>

      <div className="kpis">
        <div className="kpi"><span className="muted">Portfolio before</span><strong>{usd(p.before)}</strong></div>
        <div className="kpi"><span className="muted">Portfolio after</span><strong>{usd(p.after)}</strong></div>
        <div className="kpi"><span className="muted">Impact</span><strong className={p.delta < 0 ? 'neg' : 'pos'}>{signed(p.delta, 1)}m ({signed(p.delta_pct)}%)</strong></div>
        <div className="kpi"><span className="muted">Worst position</span><strong className="neg">{r.top_losers[0] ? `${r.top_losers[0].delta_pct}%` : '—'}</strong><span className="muted small">{r.top_losers[0]?.instrument}</span></div>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Portfolio value, before vs after</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={beforeAfter} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" />
              <YAxis unit="m" fontSize={12} />
              <Tooltip formatter={(v) => usd(Number(v))} />
              <Bar dataKey="value" label={{ position: 'top', fontSize: 12, formatter: (v: unknown) => usd(Number(v), 0) }}>
                <Cell fill="#64748b" />
                <Cell fill={p.delta < 0 ? 'var(--neg)' : 'var(--pos)'} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="card">
          <h2>Impact by asset class (USD m)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={r.by_asset_type} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="name" fontSize={12} width={110} />
              <Tooltip formatter={(v) => usd(Number(v))} />
              <Bar dataKey="delta" name="Change">
                {r.by_asset_type.map((b) => <Cell key={b.name} fill={b.delta < 0 ? 'var(--neg)' : 'var(--pos)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="muted small">Positive bars are hedges: pay-fixed swaps gain when rates rise.</p>
        </section>
      </div>

      <section className="card">
        <h2>Before vs after by asset class</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={r.by_asset_type} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis unit="m" fontSize={12} />
            <Tooltip formatter={(v) => usd(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="before" name="Before" fill="#94a3b8" />
            <Bar dataKey="after" name="After" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h2>Position-level impact</h2>
        <div className="scroll tall">
          <table>
            <thead><tr><th>Instrument</th><th>Type</th><th>Sector</th><th>Exposure</th><th>Before</th><th>After</th><th>Δ</th></tr></thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.position_id}>
                  <td>{x.instrument}</td><td>{x.asset_type}</td><td>{x.sector}</td>
                  <td>{x.exposure === 1 ? 'full' : x.exposure === 0 ? '—' : `${(x.exposure * 100).toFixed(0)}% spillover`}</td>
                  <td>{usd(x.before)}</td><td>{usd(x.after)}</td>
                  <td className={x.delta < 0 ? 'negative' : x.delta > 0 ? 'positive' : 'neutral'}>{signed(x.delta, 2)} ({signed(x.delta_pct, 1)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted small note">
        Simplified model for the hackathon: duration-based bond/loan repricing, beta-scaled equity shocks, DV01-based swaps, no convexity, no netting or collateral.
        Shock sizes are assumptions (data/shocks.json), not calibrated to history.
      </p>
    </>
  )
}

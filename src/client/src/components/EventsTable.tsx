import { useEffect, useState } from 'react'
import { getJson } from '../api'
import type { Signal } from '../api'
import { signed, timeLabel } from '../format'

export default function EventsTable() {
  const [minImpact, setMinImpact] = useState(8)
  const [rows, setRows] = useState<Signal[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    getJson<{ data: Signal[] }>(`/api/events?min_impact=${minImpact}&limit=12`, ctl.signal)
      .then((r) => { setRows(r.data); setError(null) })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message) })
    return () => ctl.abort()
  }, [minImpact])

  return (
    <section className="card">
      <div className="card-head">
        <h2>High-impact event feed</h2>
        <label className="inline">
          min impact
          <select value={minImpact} onChange={(e) => setMinImpact(Number(e.target.value))}>
            {[6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">Adverse events scoring above 7 trigger Module B stress tests; favourable ones (positive sentiment) do not.</p>
      {error && <p className="error">{error}</p>}
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Time (UTC)</th><th>Event</th><th>Entities</th><th>Sentiment</th><th>Impact</th><th>Text</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.doc_id}>
                <td className="nowrap">{timeLabel(r.published_at)}</td>
                <td><span className="pill">{r.event_type}</span></td>
                <td>{r.tickers.join(', ') || 'market'}</td>
                <td className={r.sentiment_label}>{signed(r.sentiment_score)}</td>
                <td><span className={`badge ${r.impact_score > 7 ? 'high' : ''}`}>{r.impact_score}</span></td>
                <td className="text">{r.text ?? r.evidence.slice(0, 3).join(' · ')}</td>
              </tr>
            ))}
            {!rows.length && !error && <tr><td colSpan={6} className="muted">No events at this threshold.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { analyzeText } from '../api'
import type { Signal } from '../api'
import { signed } from '../format'

const SAMPLES = [
  'Fed signals more rate hikes as inflation stays stubbornly high',
  'Apple beats earnings estimates and raises full-year guidance',
  'Escalating tensions in the Middle East push oil sharply higher and rattle equity markets',
  'Regulators open antitrust probe into Google',
  'JPMorgan downgraded by rating agency over rising debt',
  'Ceasefire agreement eases tensions, global markets rally',
]

export default function AnalyzerCard() {
  const [text, setText] = useState(SAMPLES[0])
  const [result, setResult] = useState<Signal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(t = text) {
    setBusy(true)
    setError(null)
    try {
      setResult(await analyzeText(t))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const s = result?.sentiment_score ?? 0
  return (
    <section className="card">
      <h2>Live signal analyzer</h2>
      <p className="muted">Paste any headline or tweet. The engine returns the same structured signal the downstream modules consume.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} />
      <div className="chips">
        {SAMPLES.map((x) => (
          <button key={x} className="chip" onClick={() => { setText(x); void run(x) }}>
            {x.length > 38 ? x.slice(0, 38) + '…' : x}
          </button>
        ))}
      </div>
      <button className="primary" disabled={busy || text.trim().length < 3} onClick={() => void run()}>
        {busy ? 'Analyzing…' : 'Analyze'}
      </button>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="result">
          <div className="row">
            <span className="label">Sentiment</span>
            <div className="gauge" aria-label={`sentiment ${s}`}>
              <div className="gauge-mid" />
              <div
                className="gauge-fill"
                style={{
                  left: s >= 0 ? '50%' : `${50 + s * 50}%`,
                  width: `${Math.abs(s) * 50}%`,
                  background: s >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              />
            </div>
            <strong className={result.sentiment_label}>{signed(s)} · {result.sentiment_label}</strong>
          </div>
          <div className="row">
            <span className="label">Event</span>
            <span className="pill">{result.event_type}</span>
            <span className="muted">confidence {(result.event_confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="row">
            <span className="label">Impact</span>
            <div className="meter">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={i < result.impact_score ? (result.impact_score > 7 ? 'on high' : 'on') : ''} />
              ))}
            </div>
            <strong>{result.impact_score}/10</strong>
            {result.impact_score > 7 && (result.sentiment_score < 0
              ? <span className="pill warn">stress-test trigger</span>
              : <span className="pill">high impact but favourable: no stress test</span>)}
          </div>
          <div className="row">
            <span className="label">Entities</span>
            {result.tickers.length ? result.tickers.map((t) => <span key={t} className="pill">{t}</span>) : <span className="muted">market-wide</span>}
          </div>
          <div className="row">
            <span className="label">Evidence</span>
            <span className="muted">{result.evidence.join(' · ') || '—'}</span>
          </div>
        </div>
      )}
    </section>
  )
}
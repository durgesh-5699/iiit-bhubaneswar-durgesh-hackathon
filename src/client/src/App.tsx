import { useEffect, useState } from 'react'
import { getJson } from './api'
import type { Health } from './api'
import AnalyzerCard from './components/AnalyzerCard'
import EventsTable from './components/EventsTable'
import RebalancerPanel from './components/RebalancerPanel'
import './App.css'

type Tab = 'signals' | 'rebalancer'

export default function App() {
  const [tab, setTab] = useState<Tab>('signals')
  const [health, setHealth] = useState<Health | null>(null)
  const [down, setDown] = useState(false)

  useEffect(() => {
    getJson<Health>('/health').then((h) => { setHealth(h); setDown(false) }).catch(() => setDown(true))
  }, [])

  return (
    <div className="app">
      <header>
        <div>
          <h1>AI/NLP Risk Engine</h1>
          <p className="muted">Unstructured news and tweets → sentiment, event class, impact → portfolio actions</p>
        </div>
        <span className={`status ${down ? 'bad' : 'ok'}`}>
          {down ? 'API offline (run npm run dev in src/server)' : health ? `API ok · ${health.signals} signals · ${health.store} store` : 'connecting…'}
        </span>
      </header>
      <nav>
        <button className={tab === 'signals' ? 'active' : ''} onClick={() => setTab('signals')}>Signals</button>
        <button className={tab === 'rebalancer' ? 'active' : ''} onClick={() => setTab('rebalancer')}>Module A · Rebalancer</button>
      </nav>
      <main>
        {tab === 'signals' && (
          <div className="stack">
            <AnalyzerCard />
            <EventsTable />
          </div>
        )}
        {tab === 'rebalancer' && <RebalancerPanel />}
      </main>
    </div>
  )
}

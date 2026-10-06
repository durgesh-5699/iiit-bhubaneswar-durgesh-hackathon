import type { CSSProperties } from 'react'

export const PALETTE = [
  '#4f46e5', '#0ea5e9', '#14b8a6', '#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444',
  '#ec4899', '#a855f7', '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#64748b',
]

export const shortDate = (d: string) => d.slice(5) // 2026-09-14 -> 09-14
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`
export const signed = (x: number, digits = 2) => `${x > 0 ? '+' : ''}${x.toFixed(digits)}`

/** score (-1.5..1.5) -> background colour for the heatmap */
export function scoreColor(s: number): string {
  const a = Math.min(1, Math.abs(s) / 1.2) * 0.85
  return s >= 0 ? `rgba(22,163,74,${a})` : `rgba(220,38,38,${a})`
}

export const timeLabel = (iso: string) => iso.slice(5, 16).replace('T', ' ')

/** Recharts tooltip style that follows the app theme (default is a white box that is unreadable in dark mode). */
export const TIP: { contentStyle: CSSProperties; labelStyle: CSSProperties; itemStyle: CSSProperties; cursor: { fill: string } } = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
  itemStyle: { color: 'var(--text)' },
  cursor: { fill: 'rgba(148,163,184,0.15)' },
}

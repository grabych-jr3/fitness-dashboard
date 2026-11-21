import { Glass } from '../glass'
import { fmt, fmtDelta } from '../lib/format.ts'

/**
 * Metric card with change since the previous InBody scan.
 * `good` says which direction is good for the bulk: 'up', 'down' or 'neutral'.
 */
export default function StatCard({
  label,
  value,
  unit,
  delta,
  digits = 1,
  good = 'neutral',
}: {
  label: string
  value: number | null | undefined
  unit: string
  delta?: number | null
  digits?: number
  good?: 'up' | 'down' | 'neutral'
}) {
  const d = fmtDelta(delta, digits)
  let tone = ''
  if (d && delta && good !== 'neutral' && Math.abs(delta) >= 10 ** -digits / 2) {
    tone = (delta > 0) === (good === 'up') ? 'stat-good' : 'stat-bad'
  }
  return (
    <Glass padded interactive className="stat">
      <div className="lg-label">{label}</div>
      <div className="stat-value">
        <span className="lg-big">{fmt(value, digits)}</span>
        <span className="lg-muted stat-unit">{unit}</span>
      </div>
      <div className={'stat-delta ' + tone}>{d ? `${d} ${unit}` : 'перший замір'}</div>
    </Glass>
  )
}

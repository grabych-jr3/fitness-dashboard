import { useState } from 'react'
import TrendChart, { type Series } from '../charts/TrendChart.tsx'
import type { InbodyScan, Segments } from '../data/types.ts'
import { Glass, Segmented } from '../glass'
import { fmtDelta } from '../lib/format.ts'

type Part = 'arms' | 'legs' | 'trunk'
type Metric = 'lean' | 'fat'

const PARTS: Record<Part, { key: keyof Segments; label: string }[]> = {
  arms: [
    { key: 'la', label: 'Ліва рука' },
    { key: 'ra', label: 'Права рука' },
  ],
  legs: [
    { key: 'll', label: 'Ліва нога' },
    { key: 'rl', label: 'Права нога' },
  ],
  trunk: [{ key: 'tr', label: 'Тулуб' }],
}

/** Change of one segment between the first and the latest scan that has it. */
export function segmentChange(scans: readonly InbodyScan[], metric: Metric, key: keyof Segments): number | null {
  const vals = scans.map((s) => s[metric][key]).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
  return vals.length > 1 ? vals[vals.length - 1] - vals[0] : null
}

/** Lean mass / fat of arms, legs and trunk across all InBody scans (from the printout's segmental tables). */
export default function SegmentTrends({ scans }: { scans: InbodyScan[] }) {
  const [part, setPart] = useState<Part>('arms')
  const [metric, setMetric] = useState<Metric>('lean')
  const withData = scans.filter((s) => PARTS[part].some((p) => s[metric][p.key] !== null && s[metric][p.key] !== undefined))
  const digits = metric === 'lean' ? 2 : 1
  const series: Series[] = PARTS[part].map((p, i) => ({
    label: p.label,
    values: withData.map((s) => s[metric][p.key] ?? null),
    color: i === 0 ? 'accent' : 'accent2',
    unit: 'кг',
    digits,
  }))

  return (
    <Glass padded>
      <h2 className="lg-h2">Сегменти в динаміці</h2>
      <div className="lg-stack seg-trend-controls">
        <Segmented
          label="Частина тіла"
          value={part}
          onChange={setPart}
          options={[
            { value: 'arms', label: 'Руки' },
            { value: 'legs', label: 'Ноги' },
            { value: 'trunk', label: 'Тулуб' },
          ]}
        />
        <Segmented
          label="Показник"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'lean', label: 'Суха маса' },
            { value: 'fat', label: 'Жир' },
          ]}
        />
      </div>
      {withData.length === 0 ? (
        <p className="lg-muted">У замірах немає цих даних.</p>
      ) : (
        <>
          <TrendChart
            key={part + metric}
            label={`${metric === 'lean' ? 'Суха маса' : 'Жир'}: ${PARTS[part].map((p) => p.label).join(', ')}`}
            dates={withData.map((s) => s.date)}
            series={series}
            legend={series.length > 1}
            height={200}
          />
          <div className="seg-trend-summary">
            {PARTS[part].map((p) => {
              const d = segmentChange(withData, metric, p.key)
              const good = d === null || Math.abs(d) < 10 ** -digits / 2 ? '' : (d > 0) === (metric === 'lean') ? 'stat-good' : 'stat-bad'
              return (
                <span key={p.key}>
                  {p.label}: <b className={good}>{d === null ? 'потрібно ≥2 заміри' : `${fmtDelta(d, digits)} кг`}</b>
                </span>
              )
            })}
          </div>
          <p className="lg-muted chart-note">
            {metric === 'lean' ? 'Суха маса — м’язи, вода і кістки сегмента з таблиці «Segmental Lean».' : 'Жирова маса сегмента з таблиці «Segmental Fat».'} Зміна — від першого до останнього заміру.
          </p>
        </>
      )}
    </Glass>
  )
}

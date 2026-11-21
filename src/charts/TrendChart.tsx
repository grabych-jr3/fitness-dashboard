import { useState, type PointerEvent } from 'react'
import { fmtDate } from '../lib/format.ts'
import { dayNumber, domainOf, fmtTick, linear } from './scale.ts'
import { useWidth } from './useWidth.ts'
import './charts.css'

export type SeriesColor = 'accent' | 'accent2' | 'pink' | 'orange' | 'ok'
export type Series = { label: string; values: (number | null)[]; color?: SeriesColor; unit?: string; digits?: number }

const COLOR: Record<SeriesColor, string> = {
  accent: 'var(--accent)',
  accent2: 'var(--accent-2)',
  pink: '#ff375f',
  orange: '#ff9f0a',
  ok: 'var(--ok)',
}

/**
 * Line chart over dates, drawn as SVG (no canvas: on iPhone, canvas charts inside
 * blurred glass cards sometimes stayed blank). Points are joined straight, placed
 * proportionally in time, with an optional dashed goal line and a second axis.
 */
export default function TrendChart({
  dates,
  series,
  goal,
  height = 220,
  legend = false,
  label,
  dualAxis = false,
}: {
  dates: string[]
  series: Series[]
  goal?: { value: number; label: string }
  height?: number
  legend?: boolean
  label: string
  /** Second series on its own right-hand axis (e.g. muscle vs fat, different scales). */
  dualAxis?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const left = series.filter((_, i) => !(dualAxis && i === 1))
  const right = dualAxis && series[1] ? [series[1]] : []
  const nums = (ss: Series[]) => ss.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)))
  const dl = domainOf(nums(left), { extra: goal ? [goal.value] : [] })
  const dr = right.length ? domainOf(nums(right)) : null

  const W = Math.max(width, 200)
  const padL = 34
  const padR = dr ? 34 : 12
  const padT = 10
  const padB = 24
  const days = dates.map(dayNumber)
  const x0 = days[0] ?? 0
  const x1 = days[days.length - 1] ?? 1
  const single = dates.length <= 1
  const x = (i: number) => (single ? padL + (W - padL - padR) / 2 : linear(x0, x1, padL + 6, W - padR - 6)(days[i]))
  const yl = linear(dl.min, dl.max, height - padB, padT)
  const yr = dr ? linear(dr.min, dr.max, height - padB, padT) : yl

  // x labels: first, last and a middle one when there's room
  const xLabels = single ? [0] : dates.length > 2 && W > 300 ? [0, Math.round((dates.length - 1) / 2), dates.length - 1] : [0, dates.length - 1]

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = 0
    for (let i = 1; i < dates.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    setHover(dates.length ? best : null)
  }

  return (
    <div className="svg-chart" ref={ref} style={{ height: height + (legend ? 24 : 0) }}>
      {legend && (
        <div className="svg-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: COLOR[s.color ?? 'accent'] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {width > 0 && (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          {dl.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={yl(t)} y2={yl(t)} className="svg-grid" />
              <text x={padL - 6} y={yl(t)} className="svg-tick" textAnchor="end" dominantBaseline="middle" style={dualAxis ? { fill: COLOR[series[0]?.color ?? 'accent'] } : undefined}>
                {fmtTick(t)}
              </text>
            </g>
          ))}
          {dr?.ticks.map((t) => (
            <text key={'r' + t} x={W - padR + 6} y={yr(t)} className="svg-tick" dominantBaseline="middle" style={{ fill: COLOR[series[1]?.color ?? 'accent2'] }}>
              {fmtTick(t)}
            </text>
          ))}
          {xLabels.map((i) => (
            <text key={'x' + i} x={x(i)} y={height - 6} className="svg-tick" textAnchor={single ? 'middle' : i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}>
              {fmtDate(dates[i])}
            </text>
          ))}
          {goal && (
            <>
              <line x1={padL} x2={W - padR} y1={yl(goal.value)} y2={yl(goal.value)} className="svg-goal" />
              <text x={W - padR} y={yl(goal.value) - 5} className="svg-tick" textAnchor="end">
                {goal.label} {fmtTick(goal.value)}
              </text>
            </>
          )}
          {series.map((s, si) => {
            const y = dualAxis && si === 1 ? yr : yl
            const pts = s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : ([x(i), y(v)] as const))).filter((p): p is readonly [number, number] => p !== null)
            const color = COLOR[s.color ?? 'accent']
            return (
              <g key={s.label}>
                {pts.length > 1 && <path d={'M' + pts.map((p) => p.join(',')).join('L')} className="svg-line" style={{ stroke: color }} pathLength={1} />}
                {pts.map(([px, py], i) => (
                  <circle key={i} cx={px} cy={py} r={single ? 5 : 3.5} className="svg-dot" style={{ fill: color }} />
                ))}
              </g>
            )
          })}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} className="svg-cursor" />}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div className="svg-tip" style={{ left: Math.min(Math.max(x(hover) - 70, 0), W - 140), top: legend ? 24 : 0 }}>
          <b>{fmtDate(dates[hover], 'full')}</b>
          {series.map((s) => {
            const v = s.values[hover]
            return v === null || v === undefined ? null : (
              <span key={s.label}>
                <i style={{ background: COLOR[s.color ?? 'accent'] }} />
                {s.label}: {v.toFixed(s.digits ?? 1)}
                {s.unit ? ` ${s.unit}` : ''}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

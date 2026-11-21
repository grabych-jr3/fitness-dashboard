import { useState, type PointerEvent } from 'react'
import { domainOf, fmtTick, linear } from './scale.ts'
import { useWidth } from './useWidth.ts'
import './charts.css'

/** Simple SVG bar chart (weekly volume). */
export default function BarChart({
  labels,
  values,
  label,
  tip,
  height = 200,
}: {
  labels: string[]
  values: number[]
  label: string
  tip: (i: number) => { title: string; lines: string[] }
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const d = domainOf(values, { includeZero: true })
  const W = Math.max(width, 200)
  const padL = 34
  const padR = 8
  const padT = 10
  const padB = 24
  const band = (W - padL - padR) / Math.max(1, values.length)
  const bw = Math.min(28, band * 0.62)
  const y = linear(d.min, d.max, height - padB, padT)
  const every = Math.ceil(values.length / Math.max(1, Math.floor((W - padL) / 52)))

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.floor((px - padL) / band)
    setHover(i >= 0 && i < values.length ? i : null)
  }
  const t = hover !== null ? tip(hover) : null

  return (
    <div className="svg-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          {d.ticks.map((tk) => (
            <g key={tk}>
              <line x1={padL} x2={W - padR} y1={y(tk)} y2={y(tk)} className="svg-grid" />
              <text x={padL - 6} y={y(tk)} className="svg-tick" textAnchor="end" dominantBaseline="middle">
                {fmtTick(tk)}
              </text>
            </g>
          ))}
          {values.map((v, i) => {
            const cx = padL + band * i + band / 2
            const top = y(Math.max(v, 0))
            return (
              <g key={i}>
                {v > 0 && (
                  <rect
                    x={cx - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(0, y(0) - top)}
                    rx={6}
                    className={'svg-bar' + (hover !== null && hover !== i ? ' is-dim' : '')}
                    style={{ fill: 'var(--accent)', animationDelay: `${i * 0.03}s` }}
                  />
                )}
                {i % every === 0 && (
                  <text x={cx} y={height - 6} className="svg-tick" textAnchor="middle">
                    {labels[i]}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {t && hover !== null && (
        <div className="svg-tip" style={{ left: Math.min(Math.max(padL + band * hover + band / 2 - 70, 0), W - 140), top: 0 }}>
          <b>{t.title}</b>
          {t.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}

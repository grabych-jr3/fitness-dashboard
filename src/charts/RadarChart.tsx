import { useWidth } from './useWidth.ts'
import './charts.css'

/** SVG radar: values per axis against a dashed reference ring (e.g. weekly set target). */
export default function RadarChart({ axes, values, reference, max, label, height = 280 }: { axes: string[]; values: number[]; reference: number; max: number; label: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const W = Math.max(width, 200)
  const cx = W / 2
  const cy = height / 2
  const R = Math.min(W / 2 - 56, height / 2 - 26)
  const n = axes.length
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    const r = (Math.max(0, v) / (max || 1)) * R
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  }
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ')
  const rings = [0.25, 0.5, 0.75, 1].map((k) => k * max)

  return (
    <div className="svg-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
          {rings.map((r) => (
            <polygon key={r} points={poly(axes.map(() => r))} className="svg-grid" fill="none" />
          ))}
          {axes.map((_, i) => {
            const [x, y] = pt(i, max)
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="svg-grid" />
          })}
          <polygon points={poly(axes.map(() => reference))} fill="none" className="svg-goal" />
          <polygon points={poly(values)} className="svg-radar-area" style={{ fill: 'color-mix(in srgb, var(--accent) 25%, transparent)', stroke: 'var(--accent)', strokeWidth: 2 }} />
          {values.map((v, i) => {
            const [x, y] = pt(i, v)
            return <circle key={i} cx={x} cy={y} r={3} className="svg-dot" style={{ fill: 'var(--accent)' }} />
          })}
          {axes.map((a, i) => {
            const [x, y] = pt(i, max * 1.16)
            return (
              <text key={a} x={x} y={y} className="svg-tick svg-axis-label" textAnchor={Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end'} dominantBaseline="middle">
                {a}
              </text>
            )
          })}
        </svg>
      )}
    </div>
  )
}

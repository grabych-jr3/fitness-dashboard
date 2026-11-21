/** Small, dependency-free helpers for the SVG charts. */

/** "Nice" round tick values covering [min, max] (about `count` of them). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = start; v <= end + step / 2; v += step) out.push(Number(v.toFixed(10)))
  return out
}

/** Value domain with a little headroom, snapped to nice ticks. */
export function domainOf(values: number[], opts: { includeZero?: boolean; extra?: number[] } = {}): { min: number; max: number; ticks: number[] } {
  const all = [...values, ...(opts.extra ?? [])].filter(Number.isFinite)
  if (all.length === 0) return { min: 0, max: 1, ticks: [0, 1] }
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (opts.includeZero) lo = Math.min(0, lo)
  const pad = (hi - lo) * 0.08
  if (!opts.includeZero) lo -= pad
  hi += pad
  const ticks = niceTicks(lo, hi, 4)
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks }
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))

/** Epoch days from an ISO date (UTC), for time-proportional x positions. */
export const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000

export function fmtTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${Number((v / 1000).toFixed(1))}т`
  return String(Number(v.toFixed(2)))
}

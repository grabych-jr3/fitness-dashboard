const nf = new Map<number, Intl.NumberFormat>()

/** Number with a fixed number of decimals and a dot separator (matches the InBody printout). */
export function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  let f = nf.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
    nf.set(digits, f)
  }
  return f.format(v)
}

/** Signed change, e.g. "+0.6" / "−1.2"; null when there is nothing to compare. */
export function fmtDelta(v: number | null | undefined, digits = 1): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const rounded = Number(v.toFixed(digits))
  if (rounded === 0) return '±0'
  return (rounded > 0 ? '+' : '−') + fmt(Math.abs(rounded), digits)
}

const months = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд']

/** '2026-11-01' → '1 лист' (short) or '01.11.2026' (full). */
export function fmtDate(iso: string | undefined, style: 'short' | 'full' = 'short'): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  if (style === 'full') return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
  return `${d} ${months[m - 1]}`
}

export function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  return a - b
}

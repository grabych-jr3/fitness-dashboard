import type { IsoDate } from './types'

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local calendar date as `YYYY-MM-DD`. */
export function toIsoDate(d: Date = new Date()): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses `YYYY-MM-DD` as a local date (midnight). */
export function fromIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return toIsoDate(fromIsoDate(s)) === s
}

export function addDays(s: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(s)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

/** Monday..Sunday week containing `date` (inclusive bounds). */
export function weekRange(date: IsoDate = toIsoDate()): { from: IsoDate; to: IsoDate } {
  const dow = (fromIsoDate(date).getDay() + 6) % 7 // 0 = Monday
  const from = addDays(date, -dow)
  return { from, to: addDays(from, 6) }
}

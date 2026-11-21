/** Training habits: calendar heatmap, weekly streaks, durations, favourite days, reminders. Pure. */
import { addDays, fromIsoDate, toIsoDate, weekRange } from '../data/dates.ts'
import type { InbodyScan, IsoDate, Template, Workout } from '../data/types.ts'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const
export const WEEKDAYS_FULL = ['понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота', 'неділя'] as const

/** 0 = Monday … 6 = Sunday */
export const weekday = (d: IsoDate) => (fromIsoDate(d).getDay() + 6) % 7

const finished = (ws: readonly Workout[]) => ws.filter((w) => w.finishedAt !== undefined)

/** Workouts shorter than this or longer than this are left out of durations (a forgotten open workout). */
export const MIN_MINUTES = 5
export const MAX_MINUTES = 240

export function durationMinutes(w: Workout): number | null {
  if (w.finishedAt === undefined) return null
  const m = (w.finishedAt - w.startedAt) / 60000
  return m >= MIN_MINUTES && m <= MAX_MINUTES ? m : null
}

export interface HeatDay {
  date: IsoDate
  count: number
  future: boolean
}

/** Columns of weeks (Monday first), the last one containing `today`. */
export function heatmap(workouts: readonly Workout[], today: IsoDate, weeks: number): HeatDay[][] {
  const counts = new Map<IsoDate, number>()
  for (const w of finished(workouts)) counts.set(w.date, (counts.get(w.date) ?? 0) + 1)
  const lastMonday = weekRange(today).from
  const cols: HeatDay[][] = []
  for (let c = weeks - 1; c >= 0; c--) {
    const monday = addDays(lastMonday, -7 * c)
    cols.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i)
      return { date, count: counts.get(date) ?? 0, future: date > today }
    }))
  }
  return cols
}

/**
 * Weeks in a row with at least `target` workouts. The current week only adds to
 * the streak once the target is met; until then it doesn't break it either.
 */
export function weekStreak(workouts: readonly Workout[], today: IsoDate, target: number): { current: number; best: number; thisWeek: number } {
  const perWeek = new Map<IsoDate, number>()
  for (const w of finished(workouts)) {
    const k = weekRange(w.date).from
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1)
  }
  const thisMonday = weekRange(today).from
  const thisWeek = perWeek.get(thisMonday) ?? 0
  const ok = (monday: IsoDate) => (perWeek.get(monday) ?? 0) >= target

  let current = ok(thisMonday) ? 1 : 0
  for (let m = addDays(thisMonday, -7); ok(m); m = addDays(m, -7)) current++

  let best = 0
  const mondays = [...perWeek.keys()].sort()
  if (mondays.length) {
    let run = 0
    for (let m = mondays[0]; m <= thisMonday; m = addDays(m, 7)) {
      run = ok(m) ? run + 1 : 0
      best = Math.max(best, run)
    }
  }
  return { current, best: Math.max(best, current), thisWeek }
}

export interface PeriodStats {
  count: number
  /** average minutes over workouts with a sensible duration; null if none */
  avgMinutes: number | null
  totalMinutes: number
  /** workouts per weekday, Monday first */
  byWeekday: number[]
  /** the most frequent weekdays (ties included), empty when no workouts */
  topDays: number[]
  /** workouts per week over the period */
  perWeek: number
}

export function periodStats(workouts: readonly Workout[], from: IsoDate, to: IsoDate): PeriodStats {
  const inRange = finished(workouts).filter((w) => w.date >= from && w.date <= to)
  const mins = inRange.map(durationMinutes).filter((m): m is number => m !== null)
  const byWeekday = Array(7).fill(0)
  for (const w of inRange) byWeekday[weekday(w.date)]++
  const max = Math.max(...byWeekday)
  const days = Math.max(1, (fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86400000 + 1)
  return {
    count: inRange.length,
    avgMinutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    totalMinutes: mins.reduce((a, b) => a + b, 0),
    byWeekday,
    topDays: max > 0 ? byWeekday.flatMap((n, i) => (n === max ? [i] : [])) : [],
    perWeek: inRange.length / (days / 7),
  }
}

export type PeriodKind = 'month' | '3m' | 'year' | 'all'

/** Bounds of a period ending today; `monthOffset` moves the calendar month back (0 = this month). */
export function periodBounds(kind: PeriodKind, today: IsoDate, monthOffset = 0, firstDate?: IsoDate): { from: IsoDate; to: IsoDate } {
  const d = fromIsoDate(today)
  if (kind === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth() - monthOffset, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    const to = toIsoDate(end)
    return { from: toIsoDate(start), to: to > today ? today : to }
  }
  if (kind === '3m') return { from: toIsoDate(new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1)), to: today }
  if (kind === 'year') return { from: toIsoDate(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate() + 1)), to: today }
  return { from: firstDate && firstDate < today ? firstDate : today, to: today }
}

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень']
export function monthTitle(today: IsoDate, monthOffset: number): string {
  const d = fromIsoDate(today)
  const m = new Date(d.getFullYear(), d.getMonth() - monthOffset, 1)
  return `${MONTHS[m.getMonth()]} ${m.getFullYear()}`
}

export function fmtMinutes(m: number): string {
  const r = Math.round(m)
  return r >= 60 ? `${Math.floor(r / 60)} год ${r % 60 ? `${r % 60} хв` : ''}`.trim() : `${r} хв`
}

/** Next template in the A → B → C rotation after the last finished template workout. */
export function nextTemplate(templates: readonly Template[], workouts: readonly Workout[]): Template | undefined {
  const ordered = [...templates].sort((a, b) => a.order - b.order)
  if (ordered.length === 0) return undefined
  const last = finished(workouts)
    .filter((w) => w.templateId !== undefined && ordered.some((t) => t.id === w.templateId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
    .at(-1)
  if (!last) return ordered[0]
  const i = ordered.findIndex((t) => t.id === last.templateId)
  return ordered[(i + 1) % ordered.length]
}

/** Today is a planned training day and nothing was trained yet. */
export function isTrainingDayPending(trainingDays: readonly number[] | undefined, workouts: readonly Workout[], today: IsoDate): boolean {
  if (!trainingDays?.includes(weekday(today))) return false
  return !workouts.some((w) => w.date === today)
}

export const monthKey = (d: IsoDate) => d.slice(0, 7)

/**
 * InBody reminder: shown at the first workout of a month (no workout finished yet
 * this month), unless there's already a scan this month or it was dismissed.
 */
export function needsInbodyReminder(workouts: readonly Workout[], scans: readonly Pick<InbodyScan, 'date'>[], today: IsoDate, dismissedMonth?: string): boolean {
  const month = monthKey(today)
  if (dismissedMonth === month) return false
  if (scans.some((s) => monthKey(s.date) === month)) return false
  return !finished(workouts).some((w) => monthKey(w.date) === month)
}

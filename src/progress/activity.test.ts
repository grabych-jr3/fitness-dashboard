import { describe, expect, it } from 'vitest'
import type { Template, Workout } from '../data/types.ts'
import { durationMinutes, fmtMinutes, heatmap, isTrainingDayPending, needsInbodyReminder, nextTemplate, periodBounds, periodStats, weekStreak, weekday } from './activity.ts'

let id = 1
const W = (date: string, minutes = 60, templateId?: number, open = false): Workout => {
  const startedAt = new Date(date + 'T18:00:00').getTime() + id
  return { id: id++, date, templateId, startedAt, finishedAt: open ? undefined : startedAt + minutes * 60000 }
}

describe('activity', () => {
  it('weekday is Monday-first', () => {
    expect(weekday('2026-11-16')).toBe(0)
    expect(weekday('2026-11-22')).toBe(6)
  })
  it('durations skip forgotten workouts', () => {
    expect(durationMinutes(W('2026-11-01', 70))).toBe(70)
    expect(durationMinutes(W('2026-11-01', 600))).toBeNull()
    expect(durationMinutes(W('2026-11-01', 2))).toBeNull()
    expect(durationMinutes(W('2026-11-01', 60, undefined, true))).toBeNull()
  })
  it('heatmap ends with the current week', () => {
    const cols = heatmap([W('2026-11-17'), W('2026-11-17'), W('2026-11-03')], '2026-11-21', 4)
    expect(cols).toHaveLength(4)
    expect(cols[3][0].date).toBe('2026-11-16')
    expect(cols[3][1].count).toBe(2)
    expect(cols[3][6].future).toBe(true)
    expect(cols[1][1]).toMatchObject({ date: '2026-11-03', count: 1 })
  })
  it('week streak: the current week counts once the target is met', () => {
    const ws = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-17'].map((d) => W(d))
    expect(weekStreak(ws, '2026-11-21', 3)).toEqual({ current: 2, best: 2, thisWeek: 1 })
    expect(weekStreak([...ws, W('2026-11-19'), W('2026-11-20')], '2026-11-21', 3).current).toBe(3)
    expect(weekStreak(ws, '2026-11-30', 3).current).toBe(0)
  })
  it('period stats', () => {
    const ws = [W('2026-11-02', 60), W('2026-11-04', 80), W('2026-11-09', 70), W('2026-10-30', 50), W('2026-11-05', 900)]
    const s = periodStats(ws, '2026-11-01', '2026-11-30')
    expect(s.count).toBe(4)
    expect(s.avgMinutes).toBe(70)
    expect(s.byWeekday).toEqual([2, 0, 1, 1, 0, 0, 0])
    expect(s.topDays).toEqual([0])
  })
  it('period bounds', () => {
    expect(periodBounds('month', '2026-11-21')).toEqual({ from: '2026-11-01', to: '2026-11-21' })
    expect(periodBounds('month', '2026-11-21', 1)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodBounds('month', '2026-01-10', 1)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodBounds('3m', '2026-11-21').from).toBe('2026-08-22')
    expect(periodBounds('all', '2026-11-21', 0, '2026-06-17').from).toBe('2026-06-17')
  })
  it('next template rotates A → B → C → A', () => {
    const t = (tid: number, order: number) => ({ id: tid, name: String(tid), items: [], order }) as Template
    const ts = [t(10, 0), t(11, 1), t(12, 2)]
    expect(nextTemplate(ts, [])?.id).toBe(10)
    expect(nextTemplate(ts, [W('2026-11-17', 60, 10)])?.id).toBe(11)
    expect(nextTemplate(ts, [W('2026-11-17', 60, 10), W('2026-11-19', 60, 12)])?.id).toBe(10)
  })
  it('training day pending', () => {
    expect(isTrainingDayPending([0, 2, 4], [], '2026-11-16')).toBe(true)
    expect(isTrainingDayPending([0, 2, 4], [W('2026-11-16')], '2026-11-16')).toBe(false)
    expect(isTrainingDayPending([0, 2, 4], [], '2026-11-17')).toBe(false)
    expect(isTrainingDayPending(undefined, [], '2026-11-16')).toBe(false)
  })
  it('InBody reminder at the first workout of the month', () => {
    expect(needsInbodyReminder([W('2026-10-30')], [], '2026-11-02')).toBe(true)
    expect(needsInbodyReminder([W('2026-11-02')], [], '2026-11-04')).toBe(false)
    expect(needsInbodyReminder([W('2026-11-02', 60, undefined, true)], [], '2026-11-02')).toBe(true)
    expect(needsInbodyReminder([], [{ date: '2026-11-01' }], '2026-11-02')).toBe(false)
    expect(needsInbodyReminder([], [], '2026-11-02', '2026-11')).toBe(false)
  })
  it('fmtMinutes', () => {
    expect(fmtMinutes(45)).toBe('45 хв')
    expect(fmtMinutes(75)).toBe('1 год 15 хв')
    expect(fmtMinutes(120)).toBe('2 год')
  })
})

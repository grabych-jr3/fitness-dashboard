import { describe, expect, it } from 'vitest'
import { effectiveTop, fmtSession, isPlateau, readyForWeight, recommend, repsAt, type Session } from './progression.ts'

const S = (date: string, weight: number, reps: number[], pain = false): Session => ({ date, sets: reps.map((r, i) => ({ weight, reps: r, pain: pain && i === 0 })) })
const range = { repMin: 8, repMax: 12 }

describe('recommend', () => {
  it('first time', () => {
    const r = recommend([], range, 2.5, 3)
    expect(r.action).toBe('first')
    expect(r.reps).toEqual([8, 8, 8])
  })
  it('adds weight when every set is at the top', () => {
    const r = recommend([S('2026-11-01', 60, [12, 12, 12])], range)
    expect(r).toMatchObject({ action: 'up-weight', weight: 62.5, reps: [10, 10, 10] })
  })
  it('forgives one missing rep on the last set', () => {
    expect(recommend([S('2026-11-01', 60, [12, 12, 11])], range).action).toBe('up-weight')
    expect(recommend([S('2026-11-01', 60, [12, 11, 12])], range).action).toBe('up-reps')
    expect(recommend([S('2026-11-01', 60, [12, 12, 10])], range).action).toBe('up-reps')
  })
  it('adds a rep where short of the top', () => {
    const r = recommend([S('2026-11-01', 60, [12, 11, 9])], range)
    expect(r).toMatchObject({ action: 'up-reps', weight: 60, reps: [12, 12, 10] })
  })
  it('ignores lighter warm-up sets', () => {
    const s: Session = { date: '2026-11-01', sets: [{ weight: 40, reps: 10 }, ...S('', 60, [12, 12, 12]).sets] }
    expect(recommend([s], range, 2.5, 3).action).toBe('up-weight')
  })
  it('holds below the range, deloads after twice', () => {
    expect(recommend([S('2026-11-01', 60, [9, 7, 6])], range).action).toBe('hold')
    const r = recommend([S('2026-10-28', 60, [8, 7, 6]), S('2026-11-01', 60, [9, 7, 6])], range)
    expect(r).toMatchObject({ action: 'deload', weight: 55 })
  })
  it('never adds weight after pain', () => {
    const r = recommend([S('2026-11-01', 60, [12, 12, 12], true)], range)
    expect(r.action).toBe('pain')
    expect(r.weight).toBe(60)
  })
  it('big step on a light weight: first go above the range', () => {
    expect(effectiveTop(range, 10, 2.5)).toBe(14)
    expect(recommend([S('2026-11-01', 10, [12, 12, 12])], range).action).toBe('up-reps')
    expect(recommend([S('2026-11-01', 10, [14, 14, 14])], range).action).toBe('up-weight')
  })
  it('bodyweight: only reps', () => {
    const r = recommend([S('2026-11-01', 0, [15, 15])], range)
    expect(r).toMatchObject({ action: 'up-reps', reps: [16, 16] })
  })
  it('uses the template set count', () => {
    expect(recommend([S('2026-11-01', 60, [10, 10])], range, 2.5, 4).reps).toEqual([11, 11, 11, 11])
  })
})

it('repsAt: same estimated 1RM, clamped to the range', () => {
  expect(repsAt(60, 12, 62.5, range)).toBe(10)
  expect(repsAt(20, 15, 25, { repMin: 10, repMax: 15 })).toBe(10)
  expect(repsAt(100, 12, 101, range)).toBe(11)
})

describe('isPlateau', () => {
  it('three sessions at the same weight without a rep more', () => {
    const h = [S('1', 60, [10, 9, 8]), S('2', 60, [10, 9, 8]), S('3', 60, [9, 9, 8]), S('4', 60, [10, 9, 8])]
    expect(isPlateau(h)).toBe(true)
    expect(recommend(h, range).plateau).toBe(true)
  })
  it('any extra rep breaks it', () => {
    expect(isPlateau([S('1', 60, [10, 9, 8]), S('2', 60, [10, 9, 8]), S('3', 60, [10, 9, 9]), S('4', 60, [10, 9, 8])])).toBe(false)
  })
  it('a weight change restarts the count', () => {
    expect(isPlateau([S('1', 57.5, [12, 12, 12]), S('2', 60, [8, 8, 8]), S('3', 60, [8, 8, 8]), S('4', 60, [8, 8, 8])])).toBe(false)
  })
  it('needs enough sessions', () => {
    expect(isPlateau([S('1', 60, [8]), S('2', 60, [8]), S('3', 60, [8])])).toBe(false)
  })
})

it('readyForWeight and fmtSession', () => {
  expect(readyForWeight([{ weight: 1, reps: 12 }], 12)).toBe(true)
  expect(readyForWeight([{ weight: 1, reps: 11 }], 12)).toBe(false)
  expect(fmtSession(S('1', 62.5, [8, 8, 7]))).toBe('62.5 × 8/8/7')
})

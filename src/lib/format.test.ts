import { describe, expect, it } from 'vitest'
import { diff, fmt, fmtDate, fmtDelta } from './format.ts'

describe('format', () => {
  it('formats numbers with fixed decimals', () => {
    expect(fmt(77.4)).toBe('77.4')
    expect(fmt(1921, 0)).toBe('1921')
    expect(fmt(null)).toBe('—')
  })

  it('formats signed deltas', () => {
    expect(fmtDelta(0.64)).toBe('+0.6')
    expect(fmtDelta(-1.25)).toBe('−1.3')
    expect(fmtDelta(0.01)).toBe('±0')
    expect(fmtDelta(null)).toBeNull()
  })

  it('formats dates', () => {
    expect(fmtDate('2026-11-01')).toBe('1 лист')
    expect(fmtDate('2026-11-01', 'full')).toBe('01.11.2026')
  })

  it('diffs only defined values', () => {
    expect(diff(78, 77.4)).toBeCloseTo(0.6)
    expect(diff(78, null)).toBeNull()
  })
})

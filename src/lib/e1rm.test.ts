import { describe, expect, it } from 'vitest'
import { e1rm } from './e1rm.ts'

describe('e1rm', () => {
  it('uses the Epley formula', () => {
    expect(e1rm(100, 10)).toBe(133.3)
    expect(e1rm(60, 8)).toBe(76)
  })

  it('returns the weight itself for a single rep', () => {
    expect(e1rm(120, 1)).toBe(120)
  })

  it('returns 0 for invalid input', () => {
    expect(e1rm(0, 5)).toBe(0)
    expect(e1rm(50, 0)).toBe(0)
    expect(e1rm(Number.NaN, 5)).toBe(0)
  })
})

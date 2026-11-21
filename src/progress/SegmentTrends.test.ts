import { describe, expect, it } from 'vitest'
import type { InbodyScan } from '../data/types.ts'
import { segmentChange } from './SegmentTrends.tsx'

const scan = (date: string, la: number | null, laFat: number | null): InbodyScan => ({
  date,
  weight: 77,
  muscle: 41,
  fatKg: 5,
  pbf: 7,
  lean: { ra: null, la, tr: null, rl: null, ll: null },
  fat: { ra: null, la: laFat, tr: null, rl: null, ll: null },
  createdAt: 0,
})

describe('segmentChange', () => {
  it('is the change from the first to the last scan that has the value', () => {
    const s = [scan('2026-06-17', 4.5, 0.2), scan('2026-09-01', null, null), scan('2026-11-01', 4.77, 0.1)]
    expect(segmentChange(s, 'lean', 'la')).toBeCloseTo(0.27)
    expect(segmentChange(s, 'fat', 'la')).toBeCloseTo(-0.1)
  })
  it('needs two values', () => {
    expect(segmentChange([scan('2026-11-01', 4.77, 0.1)], 'lean', 'la')).toBeNull()
  })
})

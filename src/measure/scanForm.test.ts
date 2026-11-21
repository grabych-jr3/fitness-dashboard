import { describe, expect, it } from 'vitest'
import { parseInbodyText } from '../ocr/parse.ts'
import { emptyValues, toScan, valuesFromParsed } from './scanForm.ts'
import receipt from '../ocr/__fixtures__/inbody-2026-11-01.txt?raw'

describe('scan form', () => {
  it('turns the parsed receipt into a valid scan', () => {
    const res = toScan(valuesFromParsed(parseInbodyText(receipt), '2026-01-01'))
    expect('scan' in res).toBe(true)
    if (!('scan' in res)) return
    expect(res.scan).toMatchObject({ date: '2026-11-01', weight: 77.4, muscle: 41.4, fatKg: 5.6, pbf: 7.2, bmr: 1921, fitnessScore: 79 })
    expect(res.scan.lean).toEqual({ ra: 4.61, la: 4.77, tr: 34.5, rl: 11.91, ll: 11.92 })
    expect(res.scan.fat).toEqual({ ra: 0.1, la: 0.1, tr: 2.1, rl: 1.1, ll: 1.1 })
  })

  it('requires the main fields and rejects non-numbers', () => {
    const v = emptyValues('2026-11-21')
    v.weight = '77,4'
    v.bmr = 'abc'
    const res = toScan(v)
    expect('errors' in res && res.errors).toMatchObject({ muscle: "Обов'язкове поле", bmr: 'Не число' })
    expect('errors' in res && res.errors.weight).toBeUndefined()
  })
})

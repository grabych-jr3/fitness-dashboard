import { describe, expect, it } from 'vitest'
import CLEAN from './__fixtures__/inbody-2026-11-01.txt?raw'
import NOISY_CHARS from './__fixtures__/inbody-noisy-chars.txt?raw'
import NOISY_DECIMALS from './__fixtures__/inbody-noisy-decimals.txt?raw'
import NOISY_LAYOUT from './__fixtures__/inbody-noisy-layout.txt?raw'
import { editDistance, parseInbodyText, parseNumericToken } from './parse'

const EXPECTED = {
  date: '2026-11-01',
  weight: 77.4,
  muscle: 41.4,
  fatKg: 5.6,
  tbw: 52.8,
  ffm: 71.8,
  bmi: 21.0,
  pbf: 7.2,
  whr: 0.89,
  visceral: 1,
  bmr: 1921,
  fitnessScore: 79,
  lean: { ra: 4.61, la: 4.77, tr: 34.5, rl: 11.91, ll: 11.92 },
  fat: { ra: 0.1, la: 0.1, tr: 2.1, rl: 1.1, ll: 1.1 },
}

/** Every value field of a scan, without issues/confidence. */
const values = (s: ReturnType<typeof parseInbodyText>) => {
  const { issues: _i, confidence: _c, ...rest } = s
  return rest
}

describe('parseInbodyText: clean receipt (01.11.2026)', () => {
  const scan = parseInbodyText(CLEAN)

  it('reads every field exactly', () => {
    expect(values(scan)).toEqual(EXPECTED)
  })

  it('has no issues and full confidence', () => {
    expect(scan.issues).toEqual([])
    expect(scan.confidence).toBe(1)
  })

  it('takes body-composition values, not the header or Muscle-Fat Control', () => {
    expect(scan.weight).toBe(77.4) // not 192.0 from "Height"
    expect(scan.muscle).toBe(41.4) // not 0.0 from control
    expect(scan.fatKg).toBe(5.6) // not 3.7 from control
  })

  it('takes segmental fat mass (kg), not PBF %', () => {
    expect(scan.fat.tr).toBe(2.1)
    expect(scan.fat.rl).toBe(1.1)
  })

  it('works with CRLF line endings', () => {
    expect(values(parseInbodyText(CLEAN.replace(/\n/g, '\r\n')))).toEqual(EXPECTED)
  })
})

describe('parseInbodyText: noisy OCR variants', () => {
  it('fixes look-alike characters (O/0, l/I/1, S/5, B/8, comma)', () => {
    const scan = parseInbodyText(NOISY_CHARS)
    expect(values(scan)).toEqual(EXPECTED)
    expect(scan.issues).toEqual([])
  })

  it('restores missing decimal points from plausible ranges and flags them', () => {
    const scan = parseInbodyText(NOISY_DECIMALS)
    expect(values(scan)).toEqual(EXPECTED)
    const flagged = scan.issues.map((i) => i.field).sort()
    expect(flagged).toEqual(['bmi', 'fat.tr', 'lean.ll', 'lean.ra', 'lean.tr', 'pbf', 'weight', 'whr'].sort())
    expect(scan.issues.every((i) => i.message.includes('прочитано нечітко'))).toBe(true)
    expect(scan.confidence).toBeGreaterThan(0.8)
    expect(scan.confidence).toBeLessThan(1)
  })

  it('survives lost headings, merged words and stray characters', () => {
    const scan = parseInbodyText(NOISY_LAYOUT)
    expect(values(scan)).toEqual(EXPECTED)
    expect(scan.issues).toEqual([])
  })
})

describe('parseInbodyText: sanity checks', () => {
  const replaceLine = (from: string, to: string) => {
    expect(CLEAN).toContain(from)
    return CLEAN.replace(from, to)
  }

  it('flags fat + ffm != weight and pbf mismatch without changing values', () => {
    const scan = parseInbodyText(replaceLine('Fat 5.6 kg', 'Fat 8.6 kg'))
    expect(scan.fatKg).toBe(8.6)
    expect(scan.weight).toBe(77.4)
    const fields = scan.issues.map((i) => i.field)
    expect(fields).toContain('ffm')
    expect(fields).toContain('pbf')
    expect(fields.filter((f) => f === 'fatKg')).toHaveLength(2)
    expect(scan.confidence).toBeLessThan(1)
  })

  it('cross-checks BMI against header height and weight', () => {
    const scan = parseInbodyText(replaceLine('BMI 21.0 kg/m2', 'BMI 21.6 kg/m2'))
    expect(scan.bmi).toBe(21.6)
    expect(scan.issues).toEqual([{ field: 'bmi', message: expect.stringContaining('21') }])
  })

  it('flags a value outside the plausible range and keeps it', () => {
    const scan = parseInbodyText(replaceLine('Muscle 41.4 kg', 'Muscle 141.4 kg'))
    expect(scan.muscle).toBe(141.4)
    expect(scan.issues).toContainEqual({
      field: 'muscle',
      message: expect.stringContaining('поза правдоподібним діапазоном'),
    })
  })

  it('flags missing required fields', () => {
    const scan = parseInbodyText(replaceLine('PBF 7.2 % (10.0~20.0)\n', ''))
    expect(scan.pbf).toBeNull()
    expect(scan.issues).toContainEqual({ field: 'pbf', message: expect.stringContaining("обов'язкове поле") })
  })

  it('falls back to the header weight when the body-composition line is lost', () => {
    const scan = parseInbodyText(replaceLine('Weight 77.4 kg (68.9~93.3)\n', ''))
    expect(scan.weight).toBe(77.4)
  })

  it('does not guess a segmental fat value when only one number is left', () => {
    const scan = parseInbodyText(replaceLine('Trunk 5.3 2.1 Under', 'Trunk 5.3 Under'))
    expect(scan.fat.tr).toBeNull()
    expect(scan.issues.map((i) => i.field)).toContain('fat.tr')
  })

  it('returns an empty scan with low confidence for unrelated text', () => {
    const scan = parseInbodyText('hello world\n12 34')
    expect(scan.weight).toBeNull()
    expect(scan.date).toBeNull()
    expect(scan.confidence).toBeLessThan(0.1)
    expect(scan.issues.map((i) => i.field)).toEqual(expect.arrayContaining(['date', 'weight', 'muscle', 'fatKg', 'pbf']))
  })

  it('rejects impossible dates', () => {
    expect(parseInbodyText('InBody170 13/45/26 10:56').date).toBeNull()
    expect(parseInbodyText('InBody170 02/29/25 10:56').date).toBeNull()
    expect(parseInbodyText('InBody170 02/29/28 10:56').date).toBe('2028-02-29')
  })
})

describe('helpers', () => {
  it('editDistance', () => {
    expect(editDistance('weight', 'weight')).toBe(0)
    expect(editDistance('weight', 'height')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })

  it('parseNumericToken fixes OCR confusions', () => {
    expect(parseNumericToken('4l.4')?.value).toBe(41.4)
    expect(parseNumericToken('S.6')?.value).toBe(5.6)
    expect(parseNumericToken('O.89')?.value).toBe(0.89)
    expect(parseNumericToken('77,4')?.value).toBe(77.4)
    expect(parseNumericToken('1B.2')?.value).toBe(18.2)
    expect(parseNumericToken('77.4kg')?.value).toBe(77.4)
    expect(parseNumericToken("'52.8'")?.value).toBe(52.8)
    expect(parseNumericToken('774')).toMatchObject({ value: 774, hadSep: false })
    expect(parseNumericToken('Over')).toBeNull()
    expect(parseNumericToken('level')).toBeNull()
    expect(parseNumericToken('l')).toMatchObject({ value: 1, strict: false })
  })
})

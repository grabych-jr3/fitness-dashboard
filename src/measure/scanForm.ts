import type { InbodyScan, Segments } from '../data/types.ts'
import type { ParsedScan } from '../ocr/types.ts'

export type FieldDef = { key: string; label: string; unit: string; required?: boolean }

export const MAIN_FIELDS: FieldDef[] = [
  { key: 'weight', label: 'Вага', unit: 'кг', required: true },
  { key: 'muscle', label: "Скелетні м'язи", unit: 'кг', required: true },
  { key: 'fatKg', label: 'Жирова маса', unit: 'кг', required: true },
  { key: 'pbf', label: 'Відсоток жиру', unit: '%', required: true },
  { key: 'tbw', label: 'Вода (TBW)', unit: 'л' },
  { key: 'ffm', label: 'Безжирова маса', unit: 'кг' },
  { key: 'bmi', label: 'ІМТ (BMI)', unit: '' },
  { key: 'whr', label: 'Талія/стегна', unit: '' },
  { key: 'visceral', label: 'Вісцеральний жир', unit: 'рів.' },
  { key: 'bmr', label: 'Базовий обмін', unit: 'ккал' },
  { key: 'fitnessScore', label: 'Fitness Score', unit: 'б.' },
]

const SEG: { k: keyof Segments; label: string }[] = [
  { k: 'ra', label: 'Права рука' },
  { k: 'la', label: 'Ліва рука' },
  { k: 'tr', label: 'Тулуб' },
  { k: 'rl', label: 'Права нога' },
  { k: 'll', label: 'Ліва нога' },
]
export const LEAN_FIELDS: FieldDef[] = SEG.map((s) => ({ key: `lean.${s.k}`, label: s.label, unit: 'кг' }))
export const FAT_FIELDS: FieldDef[] = SEG.map((s) => ({ key: `fat.${s.k}`, label: s.label, unit: 'кг' }))
const ALL = [...MAIN_FIELDS, ...LEAN_FIELDS, ...FAT_FIELDS]

export type FormValues = Record<string, string> & { date: string }

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

export function valuesFromParsed(p: ParsedScan, fallbackDate: string): FormValues {
  const out: FormValues = { date: p.date ?? fallbackDate }
  for (const f of MAIN_FIELDS) out[f.key] = str(p[f.key as keyof ParsedScan] as number | null)
  for (const s of SEG) {
    out[`lean.${s.k}`] = str(p.lean[s.k])
    out[`fat.${s.k}`] = str(p.fat[s.k])
  }
  return out
}

export function valuesFromScan(s: InbodyScan): FormValues {
  const out: FormValues = { date: s.date }
  for (const f of MAIN_FIELDS) out[f.key] = str(s[f.key as keyof InbodyScan] as number | undefined)
  for (const g of SEG) {
    out[`lean.${g.k}`] = str(s.lean[g.k])
    out[`fat.${g.k}`] = str(s.fat[g.k])
  }
  return out
}

export function emptyValues(date: string): FormValues {
  const out: FormValues = { date }
  for (const f of ALL) out[f.key] = ''
  return out
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Validates the form; returns field errors (Ukrainian) or a scan ready to save. */
export function toScan(v: FormValues): { errors: Record<string, string> } | { scan: Omit<InbodyScan, 'id' | 'createdAt'> } {
  const errors: Record<string, string> = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errors.date = 'Вкажи дату'
  for (const f of ALL) {
    const n = num(v[f.key])
    if (Number.isNaN(n)) errors[f.key] = 'Не число'
    else if (n === null && f.required) errors[f.key] = "Обов'язкове поле"
    else if (n !== null && n < 0) errors[f.key] = 'Не може бути від’ємним'
  }
  if (Object.keys(errors).length) return { errors }
  const seg = (prefix: 'lean' | 'fat'): Segments => ({
    ra: num(v[`${prefix}.ra`]),
    la: num(v[`${prefix}.la`]),
    tr: num(v[`${prefix}.tr`]),
    rl: num(v[`${prefix}.rl`]),
    ll: num(v[`${prefix}.ll`]),
  })
  const opt = (k: string) => num(v[k]) ?? undefined
  return {
    scan: {
      date: v.date,
      weight: num(v.weight)!,
      muscle: num(v.muscle)!,
      fatKg: num(v.fatKg)!,
      pbf: num(v.pbf)!,
      tbw: opt('tbw'),
      ffm: opt('ffm'),
      bmi: opt('bmi'),
      whr: opt('whr'),
      visceral: opt('visceral'),
      bmr: opt('bmr'),
      fitnessScore: opt('fitnessScore'),
      lean: seg('lean'),
      fat: seg('fat'),
    },
  }
}

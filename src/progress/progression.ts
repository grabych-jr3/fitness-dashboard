/**
 * Double progression: work inside a rep range (e.g. 8–12). When every working set
 * reaches the top of the range, add weight and start again from the bottom;
 * until then keep the weight and add reps. Pure functions, no database access.
 */

export interface SessionSet {
  weight: number
  reps: number
  pain?: boolean
}

/** One past workout of an exercise: done sets in order. */
export interface Session {
  date: string
  sets: SessionSet[]
}

export interface RepRange {
  repMin: number
  repMax: number
}

export type Action = 'first' | 'up-weight' | 'up-reps' | 'hold' | 'pain' | 'deload'

export interface Recommendation {
  action: Action
  /** target weight for every working set, kg */
  weight: number
  /** target reps per set */
  reps: number[]
  /** three sessions in a row at the same weight without a single extra rep */
  plateau: boolean
  /** the session this is based on */
  last?: Session
  /** short explanation in Ukrainian */
  reason: string
}

export const DEFAULT_RANGE: RepRange = { repMin: 8, repMax: 12 }
export const DEFAULT_STEP = 2.5
/** A weight step bigger than this share of the working weight is a big jump (light isolation work). */
const BIG_JUMP = 0.1
/** With a big jump, first go this many reps above the range. */
const EXTRA_REPS = 2
/** Sessions without progress that count as a plateau. */
export const PLATEAU_SESSIONS = 3

const round = (v: number) => Math.round(v * 100) / 100

/** Working sets: the sets at the session's top weight (lighter ones are warm-ups or back-offs). */
export function workingSets(s: Session): SessionSet[] {
  const top = Math.max(0, ...s.sets.map((x) => x.weight))
  return s.sets.filter((x) => x.weight === top)
}

export function topWeight(s: Session): number {
  return Math.max(0, ...s.sets.map((x) => x.weight))
}

const avgReps = (s: Session) => {
  const w = workingSets(s)
  return w.length ? w.reduce((a, x) => a + x.reps, 0) / w.length : 0
}

/** Top of the range for this weight: light weights with a big step first go a little above the range. */
export function effectiveTop(range: RepRange, weight: number, step: number): number {
  return weight > 0 && step / weight > BIG_JUMP ? range.repMax + EXTRA_REPS : range.repMax
}

/**
 * Ready for more weight: every working set at the top, or all but the last one,
 * which is short by a single rep (fatigue on the last set shouldn't hold you back).
 */
export function readyForWeight(sets: readonly SessionSet[], top: number): boolean {
  if (sets.length === 0) return false
  const head = sets.slice(0, -1)
  const last = sets[sets.length - 1]
  return head.every((s) => s.reps >= top) && last.reps >= (sets.length > 1 ? top - 1 : top)
}

/**
 * Plateau: the last PLATEAU_SESSIONS sessions were at the same weight as the one
 * before them and none of them beat the best average reps reached at that weight.
 */
export function isPlateau(history: readonly Session[]): boolean {
  if (history.length < PLATEAU_SESSIONS + 1) return false
  const recent = history.slice(-PLATEAU_SESSIONS)
  const weight = topWeight(history[history.length - 1])
  const run = []
  for (let i = history.length - 1; i >= 0 && topWeight(history[i]) === weight; i--) run.unshift(history[i])
  if (run.length < PLATEAU_SESSIONS + 1) return false
  const before = run.slice(0, run.length - PLATEAU_SESSIONS)
  const best = Math.max(...before.map(avgReps))
  return recent.every((s) => avgReps(s) <= best + 1e-9)
}

/**
 * Reps you can expect at a heavier weight, from the same estimated 1RM
 * (Epley: weight × (1 + reps / 30)), kept inside the range below the top.
 */
export function repsAt(weight: number, reps: number, next: number, range: RepRange): number {
  const oneRm = weight * (1 + reps / 30)
  const est = Math.floor(30 * (oneRm / next - 1) + 1e-9)
  return Math.max(range.repMin, Math.min(range.repMax - 1, est))
}

function deloadWeight(weight: number, step: number): number {
  const target = weight * 0.9
  const snapped = step > 0 ? Math.round(target / step) * step : target
  return round(Math.max(0, Math.min(snapped, weight - (step > 0 ? step : 0))))
}

/**
 * What to do next time for one exercise.
 * @param history finished sessions of this exercise, oldest first
 * @param targetSets how many sets are planned (template), defaults to last time
 */
export function recommend(history: readonly Session[], range: RepRange = DEFAULT_RANGE, step = DEFAULT_STEP, targetSets?: number): Recommendation {
  const last = [...history].reverse().find((s) => s.sets.length > 0)
  if (!last) {
    const n = targetSets ?? 3
    return { action: 'first', weight: 0, reps: Array(n).fill(range.repMin), plateau: false, reason: 'Перший раз: підбери вагу, з якою виходить ' + `${range.repMin}–${range.repMax} повторів.` }
  }
  const valid = history.filter((s) => s.sets.length > 0)
  const work = workingSets(last)
  const weight = topWeight(last)
  const n = targetSets ?? work.length
  const top = effectiveTop(range, weight, step)
  const plateau = isPlateau(valid)
  const at = (i: number) => work[Math.min(i, work.length - 1)]?.reps ?? range.repMin
  const base = { last, plateau }

  if (last.sets.some((s) => s.pain)) {
    return { ...base, action: 'pain', weight, reps: Array.from({ length: n }, (_, i) => Math.min(at(i), top)), reason: 'Минулого разу був біль ⚡ — вагу не піднімаємо. Якщо болить знову, зменш вагу або заміни вправу.' }
  }

  if (weight > 0 && readyForWeight(work, top)) {
    const next = round(weight + step)
    const reps = Array.from({ length: n }, (_, i) => repsAt(weight, at(i), next, range))
    return { ...base, action: 'up-weight', weight: next, reps, plateau: false, reason: `Усі підходи на верхній межі — додай ${round(step)} кг. Повторів вийде менше, це нормально: далі знову нарощуй до ${range.repMax}.` }
  }

  if (work.some((s) => s.reps < range.repMin)) {
    const prev = valid.length > 1 ? valid[valid.length - 2] : undefined
    const failedTwice = prev !== undefined && topWeight(prev) === weight && workingSets(prev).some((s) => s.reps < range.repMin)
    if (failedTwice && weight > 0) {
      const w = deloadWeight(weight, step)
      return { ...base, action: 'deload', weight: w, reps: Array(n).fill(range.repMin), reason: `Двічі поспіль нижче ${range.repMin} повторів — скинь вагу до ${w} кг і нарощуй знову.` }
    }
    return { ...base, action: 'hold', weight, reps: Array.from({ length: n }, (_, i) => Math.max(at(i), range.repMin)), reason: `Минулого разу менше ${range.repMin} повторів — та сама вага, спробуй добрати до ${range.repMin}.` }
  }

  const reps = Array.from({ length: n }, (_, i) => (weight === 0 ? at(i) + 1 : Math.min(at(i) + (at(i) < top ? 1 : 0), top)))
  const why = weight === 0 ? 'Вправа з власною вагою — додавай повтори.' : top > range.repMax ? `Крок ваги великий для цієї ваги — спершу дійди до ${top} повторів.` : `Та сама вага, +1 повтор там, де не дотягнув до ${top}.`
  return { ...base, action: 'up-reps', weight, reps, reason: why }
}

export const ACTION_LABEL: Record<Action, string> = {
  first: 'перший раз',
  'up-weight': '↑ вага',
  'up-reps': '↑ повтори',
  hold: 'тримати',
  pain: 'тримати ⚡',
  deload: '−10%',
}

/** What to try when stuck, from the simplest. */
export const PLATEAU_TIPS = [
  'Перевір сон і їжу — і дай вправі ще одне тренування.',
  'Скинь вагу на ~10% і знову нарощуй повтори.',
  'Зміни діапазон повторів, наприклад з 8–12 на 12–15.',
  'Заміни вправу на схожу в редакторі шаблонів.',
]

/** "60 × 12/11/10" — weight and reps of the working sets of a session. */
export function fmtSession(s: Session): string {
  const w = workingSets(s)
  const kg = topWeight(s)
  return `${kg % 1 ? kg : kg.toFixed(0)} × ${w.map((x) => x.reps).join('/')}`
}

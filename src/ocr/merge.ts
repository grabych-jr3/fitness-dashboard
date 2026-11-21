import type { ParseIssue, ParsedScan, ScalarField, SegmentKey } from './types.ts'

const SCALARS: ScalarField[] = ['weight', 'muscle', 'fatKg', 'tbw', 'ffm', 'bmi', 'pbf', 'whr', 'visceral', 'bmr', 'fitnessScore']
const SEGS: SegmentKey[] = ['ra', 'la', 'tr', 'rl', 'll']

type Getter = { key: string; get: (p: ParsedScan) => number | string | null; set: (p: ParsedScan, v: number | string | null) => void }

const FIELDS: Getter[] = [
  { key: 'date', get: (p) => p.date, set: (p, v) => (p.date = v as string | null) },
  ...SCALARS.map((f) => ({ key: f, get: (p: ParsedScan) => p[f], set: (p: ParsedScan, v: number | string | null) => (p[f] = v as number | null) })),
  ...SEGS.flatMap((s) => [
    { key: `lean.${s}`, get: (p: ParsedScan) => p.lean[s], set: (p: ParsedScan, v: number | string | null) => (p.lean[s] = v as number | null) },
    { key: `fat.${s}`, get: (p: ParsedScan) => p.fat[s], set: (p: ParsedScan, v: number | string | null) => (p.fat[s] = v as number | null) },
  ]),
]

/**
 * Combines several OCR passes of the same receipt field by field: a value with
 * fewer doubts wins; on a tie, the value most passes agree on, then the first pass.
 * The issues of the chosen value come along with it.
 */
export function mergeParsed(passes: readonly ParsedScan[]): ParsedScan {
  if (passes.length === 0) throw new Error('mergeParsed: no passes')
  if (passes.length === 1) return passes[0]

  const out: ParsedScan = structuredClone(passes[0])
  out.issues = []
  let chosenFromAgreement = 0

  for (const f of FIELDS) {
    const candidates = passes
      .map((p, i) => ({ i, v: f.get(p), issues: p.issues.filter((x) => x.field === f.key) }))
      .filter((c) => c.v !== null)
    if (candidates.length === 0) {
      f.set(out, null)
      // keep the "missing" message from the first pass
      out.issues.push(...passes[0].issues.filter((x) => x.field === f.key))
      continue
    }
    const votes = (v: unknown) => candidates.filter((c) => c.v === v).length
    candidates.sort((a, b) => a.issues.length - b.issues.length || votes(b.v) - votes(a.v) || a.i - b.i)
    const best = candidates[0]
    if (votes(best.v) > 1) chosenFromAgreement++
    f.set(out, best.v)
    // Two passes agreeing on a value that one of them had to restore is good evidence: drop that doubt.
    const doubts: ParseIssue[] = votes(best.v) > 1 && candidates.some((c) => c.v === best.v && c.issues.length === 0) ? [] : best.issues
    out.issues.push(...doubts)
  }

  // Left and right limbs are close in size: if one side disagrees a lot, take another
  // pass's equally-doubted value for that side when it fits the other side better.
  for (const prefix of ['lean', 'fat'] as const) {
    for (const [a, b] of [['ra', 'la'], ['rl', 'll']] as const) {
      const va = out[prefix][a]
      const vb = out[prefix][b]
      if (va === null || vb === null || Math.abs(va - vb) <= 0.3 * Math.max(va, vb)) continue
      for (const [side, other] of [[a, vb], [b, va]] as const) {
        const key = `${prefix}.${side}`
        const doubts = out.issues.filter((x) => x.field === key).length
        const alt = passes
          .map((p) => ({ v: p[prefix][side], issues: p.issues.filter((x) => x.field === key) }))
          .filter((c) => c.v !== null && c.issues.length <= doubts && Math.abs(c.v - other) < Math.abs(out[prefix][side]! - other))
          .sort((x, y) => Math.abs(x.v! - other) - Math.abs(y.v! - other))[0]
        if (alt) {
          out[prefix][side] = alt.v
          out.issues = [...out.issues.filter((x) => x.field !== key), ...alt.issues]
        }
      }
    }
  }

  // A doubt about a lost decimal point is settled when independent cross-checks agree.
  const confirmed = new Set<string>()
  const near = (a: number | null, b: number | null, tol: number) => a !== null && b !== null && Math.abs(a - b) <= tol
  if (out.fatKg !== null && out.ffm !== null && near(out.fatKg + out.ffm, out.weight, 0.6)) ['weight', 'fatKg', 'ffm'].forEach((f) => confirmed.add(f))
  if (out.fatKg !== null && out.weight && near((out.fatKg / out.weight) * 100, out.pbf, 1)) ['pbf', 'fatKg', 'weight'].forEach((f) => confirmed.add(f))
  if (out.ffm !== null && near(out.ffm * 0.73, out.tbw, 2.5)) confirmed.add('tbw')
  out.issues = out.issues.filter((x) => !(confirmed.has(x.field) && x.message.includes('нечітко')))

  const found = FIELDS.filter((f) => f.get(out) !== null).length / FIELDS.length
  const clean = 1 - new Set(out.issues.map((i) => i.field)).size / FIELDS.length
  out.confidence = Math.max(0, Math.min(1, Number(((found + clean) / 2 + 0.02 * Math.min(chosenFromAgreement, 5) / 5).toFixed(2))))
  return out
}

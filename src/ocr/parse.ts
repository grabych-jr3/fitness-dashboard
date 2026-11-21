import type { ParsedScan, ParseIssue, ScalarField, SegmentKey, Segments } from './types'

/*
 * Parser for the OCR text of an InBody 170 thermal receipt (English labels).
 *
 * The receipt is a list of "Label value unit (low~high)" lines grouped into
 * sections. OCR on faint thermal paper confuses letters and digits, drops
 * decimal points and inserts stray characters, so the parser:
 *  - matches labels fuzzily (normalised edit distance after folding
 *    look-alike characters),
 *  - fixes look-alike characters inside numeric tokens (O→0, l/I→1, S→5, B→8…),
 *  - restores a missing decimal point using each field's plausible range,
 *  - tracks sections, because the two segmental blocks share row labels and
 *    "Muscle"/"Fat" also appear in "Muscle - Fat Control".
 * Sanity checks only add issues; they never change values.
 */

// ---------------------------------------------------------------------------
// Field specifications

interface FieldSpec {
  min: number
  max: number
  /** Decimals InBody prints for this field. */
  decimals: number
  /** Ukrainian name for messages. */
  name: string
}

const SCALAR_SPECS: Record<ScalarField, FieldSpec> = {
  weight: { min: 30, max: 250, decimals: 1, name: 'Вага' },
  muscle: { min: 10, max: 80, decimals: 1, name: "М'язова маса" },
  fatKg: { min: 1, max: 100, decimals: 1, name: 'Жирова маса' },
  tbw: { min: 20, max: 80, decimals: 1, name: 'Вода (TBW)' },
  ffm: { min: 20, max: 120, decimals: 1, name: 'Безжирова маса (FFM)' },
  bmi: { min: 12, max: 50, decimals: 1, name: 'ІМТ (BMI)' },
  pbf: { min: 2, max: 60, decimals: 1, name: 'Відсоток жиру (PBF)' },
  whr: { min: 0.5, max: 1.3, decimals: 2, name: 'Талія/стегна (WHR)' },
  visceral: { min: 1, max: 20, decimals: 0, name: 'Вісцеральний жир' },
  bmr: { min: 800, max: 4000, decimals: 0, name: 'Базовий метаболізм (BMR)' },
  fitnessScore: { min: 0, max: 100, decimals: 0, name: 'Fitness Score' },
}

const SEGMENT_KEYS: SegmentKey[] = ['ra', 'la', 'tr', 'rl', 'll']

const SEGMENT_NAMES: Record<SegmentKey, string> = {
  ra: 'права рука',
  la: 'ліва рука',
  tr: 'тулуб',
  rl: 'права нога',
  ll: 'ліва нога',
}

const LEAN_SPECS: Record<SegmentKey, FieldSpec> = {
  ra: { min: 1, max: 10, decimals: 2, name: `Сегментна м'язова маса: ${SEGMENT_NAMES.ra}` },
  la: { min: 1, max: 10, decimals: 2, name: `Сегментна м'язова маса: ${SEGMENT_NAMES.la}` },
  tr: { min: 15, max: 60, decimals: 1, name: `Сегментна м'язова маса: ${SEGMENT_NAMES.tr}` },
  rl: { min: 5, max: 20, decimals: 2, name: `Сегментна м'язова маса: ${SEGMENT_NAMES.rl}` },
  ll: { min: 5, max: 20, decimals: 2, name: `Сегментна м'язова маса: ${SEGMENT_NAMES.ll}` },
}

const FAT_SPECS: Record<SegmentKey, FieldSpec> = Object.fromEntries(
  SEGMENT_KEYS.map((k) => [k, { min: 0, max: 20, decimals: 1, name: `Сегментний жир: ${SEGMENT_NAMES[k]}` }]),
) as Record<SegmentKey, FieldSpec>

/** Header height, cm: not part of the scan, only used to cross-check BMI. */
const HEIGHT_SPEC: FieldSpec = { min: 100, max: 250, decimals: 1, name: 'Зріст' }

const REQUIRED: ScalarField[] = ['weight', 'muscle', 'fatKg', 'pbf']

// ---------------------------------------------------------------------------
// Labels and sections

type LabelTarget =
  | { kind: 'scalar'; field: ScalarField }
  | { kind: 'segment'; seg: SegmentKey }
  | { kind: 'ignore' }

const LABELS: { text: string; target: LabelTarget }[] = [
  { text: 'Weight', target: { kind: 'scalar', field: 'weight' } },
  { text: 'Muscle', target: { kind: 'scalar', field: 'muscle' } },
  { text: 'Fat', target: { kind: 'scalar', field: 'fatKg' } },
  { text: 'TBW', target: { kind: 'scalar', field: 'tbw' } },
  { text: 'FFM', target: { kind: 'scalar', field: 'ffm' } },
  { text: 'BMI', target: { kind: 'scalar', field: 'bmi' } },
  { text: 'PBF', target: { kind: 'scalar', field: 'pbf' } },
  { text: 'WHR', target: { kind: 'scalar', field: 'whr' } },
  { text: 'Visceral Fat', target: { kind: 'scalar', field: 'visceral' } },
  { text: 'BMR', target: { kind: 'scalar', field: 'bmr' } },
  { text: 'Fitness Score', target: { kind: 'scalar', field: 'fitnessScore' } },
  { text: 'Right Arm', target: { kind: 'segment', seg: 'ra' } },
  { text: 'Left Arm', target: { kind: 'segment', seg: 'la' } },
  { text: 'Trunk', target: { kind: 'segment', seg: 'tr' } },
  { text: 'Right Leg', target: { kind: 'segment', seg: 'rl' } },
  { text: 'Left Leg', target: { kind: 'segment', seg: 'll' } },
  // Known non-value labels, so that e.g. "Height" never fuzzy-matches "Weight".
  { text: 'Height', target: { kind: 'ignore' } },
  { text: 'Gender', target: { kind: 'ignore' } },
  { text: 'Age', target: { kind: 'ignore' } },
  { text: 'InBody', target: { kind: 'ignore' } },
]

type Section = 'header' | 'body' | 'obesity' | 'segLean' | 'segFat' | 'other' | 'control' | 'impedance'

const HEADINGS: { text: string; section: Section }[] = [
  { text: 'Body Composition Analysis', section: 'body' },
  { text: 'Obesity Analysis', section: 'obesity' },
  { text: 'Segmental Lean', section: 'segLean' },
  { text: 'Lean Mass(kg) Evaluation', section: 'segLean' },
  { text: 'Segmental Fat', section: 'segFat' },
  { text: 'PBF(%) Fat Mass(kg) Evaluation', section: 'segFat' },
  { text: 'Segmental Fat is estimated', section: 'other' },
  { text: 'Muscle - Fat Control', section: 'control' },
  { text: 'Impedance', section: 'impedance' },
]

// ---------------------------------------------------------------------------
// String helpers

/** Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Folds case and look-alike characters so labels can be compared fuzzily. */
function canonLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1i|!]/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/[^a-z0-9]/g, '')
}

/** Max edit distance tolerated for a canonical label of this length. */
function maxDistance(len: number): number {
  return len <= 3 ? 1 : Math.max(1, Math.floor(len * 0.25))
}

// ---------------------------------------------------------------------------
// Numeric tokens

/** Characters OCR commonly produces instead of digits, and the digit meant. */
const DIGIT_FIX: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1',
  S: '5', s: '5', $: '5',
  B: '8',
  Z: '2', z: '2',
  G: '6',
  g: '9', q: '9',
}

const NUM_CHARS = '0-9OoQDIli|!Ss$BZzGgq'
const NUM_CORE_RE = new RegExp(`^([${NUM_CHARS}]+(?:[.,]+[${NUM_CHARS}]+)*)(.*)$`)
const UNIT_RE = /^(kg(\/m2?)?|kcal|cm|%|l|level|points?|pts)$/i
const JUNK_EDGES_RE = /^[\s'"`‘’“”*:;_=+-]+|[\s'"`‘’“”*:;_=,.]+$/g

interface NumToken {
  raw: string
  /** Value after look-alike fixing, before decimal restoration. */
  value: number
  /** Token had a decimal separator. */
  hadSep: boolean
  /** Has a real digit or a separator (as opposed to e.g. a lone "l"). */
  strict: boolean
}

/** Parses a token as a number, fixing OCR look-alike characters. */
export function parseNumericToken(token: string): NumToken | null {
  const cleaned = token.replace(JUNK_EDGES_RE, '')
  if (!cleaned) return null
  const m = NUM_CORE_RE.exec(cleaned)
  if (!m) return null
  const [, core, rest] = m
  if (rest && !UNIT_RE.test(rest)) return null
  let digits = [...core].map((c) => DIGIT_FIX[c] ?? c).join('').replace(/,/g, '.').replace(/\.{2,}/g, '.')
  const seps = (digits.match(/\./g) ?? []).length
  if (seps > 1) digits = digits.replace(/\./g, '') // ambiguous, let range restoration decide
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  return {
    raw: token,
    value,
    hadSep: seps === 1,
    strict: /[0-9]/.test(core) || /[.,]/.test(core),
  }
}

interface Interpreted {
  value: number
  inRange: boolean
  /** Decimal point was inserted by the parser. */
  restored: boolean
}

const inRange = (v: number, spec: FieldSpec) => v >= spec.min && v <= spec.max
const round = (v: number, d: number) => Number(v.toFixed(d))

/** Applies the field's plausible range to a token, restoring a lost decimal point if needed. */
function interpret(tok: NumToken, spec: FieldSpec): Interpreted {
  if (tok.hadSep) return { value: tok.value, inRange: inRange(tok.value, spec), restored: false }
  // InBody always prints the field's decimals, so a token without a separator
  // most likely lost its decimal point: try the expected position first.
  const order = [spec.decimals, 1, 2, 3, 0].filter((d, i, a) => a.indexOf(d) === i)
  for (const d of order) {
    const v = round(tok.value / 10 ** d, d)
    if (inRange(v, spec)) return { value: v, inRange: true, restored: d > 0 }
  }
  return { value: tok.value, inRange: false, restored: false }
}

// ---------------------------------------------------------------------------
// Lines

interface Line {
  raw: string
  /** Label tokens joined with a space (tokens before the first number). */
  label: string
  /** Numeric tokens after the label, up to the reference range. */
  nums: NumToken[]
  /** Whole line folded for heading matching. */
  canon: string
}

function tokenize(raw: string): string[] {
  return raw
    .replace(/[ \t]/g, ' ')
    .replace(/[(（[{]/g, ' (')
    .replace(/[~～]/g, ' ~ ')
    .replace(/([A-Za-z]{3,})(\d)/g, '$1 $2') // "Weight77.4" → "Weight 77.4"
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function analyseLine(raw: string): Line {
  const tokens = tokenize(raw)
  const labelParts: string[] = []
  const nums: NumToken[] = []
  let i = 0
  for (; i < tokens.length; i++) {
    if (tokens[i].startsWith('(') || tokens[i] === '~') break
    const n = parseNumericToken(tokens[i])
    if (n) break
    labelParts.push(tokens[i])
  }
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.startsWith('(') || t === '~') break
    if (tokens[i + 1] === '~') break // "68.9 ~ 93.3" without the parenthesis: a range, not a value
    const n = parseNumericToken(t)
    if (n) nums.push(n)
  }
  return { raw, label: labelParts.join(' '), nums, canon: canonLabel(raw) }
}

function matchHeading(line: Line): Section | null {
  if (line.nums.some((n) => n.strict)) return null
  if (!line.canon) return null
  let best: { section: Section; d: number } | null = null
  for (const h of HEADINGS) {
    const hc = canonLabel(h.text)
    const d = editDistance(line.canon, hc)
    if (d <= maxDistance(hc.length) && (!best || d < best.d)) best = { section: h.section, d }
  }
  return best?.section ?? null
}

function matchLabel(label: string): LabelTarget | null {
  const c = canonLabel(label)
  if (!c) return null
  let best: { target: LabelTarget; text: string; d: number } | null = null
  let tie = false
  for (const l of LABELS) {
    const lc = canonLabel(l.text)
    const d = editDistance(c, lc)
    if (d > maxDistance(lc.length)) continue
    if (!best || d < best.d) {
      best = { target: l.target, text: l.text, d }
      tie = false
    } else if (d === best.d && l.text !== best.text) {
      tie = true
    }
  }
  return best && !tie ? best.target : null
}

// ---------------------------------------------------------------------------
// Date

const DATE_PART = `[0-9OoQDIli|!SsBZz]`
const DATE_RE = new RegExp(`(${DATE_PART}{1,2})\\s*/\\s*(${DATE_PART}{1,2})\\s*/\\s*(${DATE_PART}{2,4})`)

const fixDigits = (s: string) => [...s].map((c) => DIGIT_FIX[c] ?? c).join('')

/** Header date is MM/DD/YY. */
function parseDate(lines: string[]): string | null {
  const ordered = [
    ...lines.filter((l) => /b[o0]dy/i.test(l)),
    ...lines.slice(0, 6),
    ...lines,
  ]
  for (const l of ordered) {
    const m = DATE_RE.exec(l)
    if (!m) continue
    const month = Number(fixDigits(m[1]))
    const day = Number(fixDigits(m[2]))
    let year = Number(fixDigits(m[3]))
    if (year < 100) year += 2000
    const d = new Date(Date.UTC(year, month - 1, day))
    if (
      month >= 1 && month <= 12 && day >= 1 && year >= 2000 && year <= 2099 &&
      d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Main

const emptySegments = (): Segments => ({ ra: null, la: null, tr: null, rl: null, ll: null })

const fmt = (v: number) => String(v).replace('.', ',')

/** Parses the OCR text of an InBody 170 receipt. Pure function. */
export function parseInbodyText(text: string): ParsedScan {
  const scan: ParsedScan = {
    date: null,
    weight: null,
    muscle: null,
    fatKg: null,
    tbw: null,
    ffm: null,
    bmi: null,
    pbf: null,
    whr: null,
    visceral: null,
    bmr: null,
    fitnessScore: null,
    lean: emptySegments(),
    fat: emptySegments(),
    issues: [],
    confidence: 0,
  }
  const issues: ParseIssue[] = []
  const issue = (field: string, message: string) => issues.push({ field, message })
  let restoredCount = 0

  /** Picks the first token plausible for the field; records issues. */
  const pick = (field: string, spec: FieldSpec, toks: NumToken[]): number | null => {
    const ordered = [...toks.filter((t) => t.strict), ...toks.filter((t) => !t.strict)]
    for (const t of ordered) {
      const r = interpret(t, spec)
      if (!r.inRange) continue
      if (r.restored) {
        restoredCount++
        issue(field, `${spec.name}: відновлено десяткову крапку («${t.raw}» → ${fmt(r.value)}), перевір.`)
      }
      return r.value
    }
    const first = toks.find((t) => t.strict)
    if (!first) return null
    issue(field, `${spec.name}: значення ${fmt(first.value)} поза правдоподібним діапазоном ${fmt(spec.min)}–${fmt(spec.max)}.`)
    return first.value
  }

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  scan.date = parseDate(rawLines)

  let section: Section = 'header'
  const headerLines: Line[] = []

  for (const raw of rawLines) {
    const line = analyseLine(raw)
    const heading = matchHeading(line)
    if (heading) {
      section = heading
      continue
    }
    if (section === 'header') headerLines.push(line)
    if (section === 'impedance' || !line.label || !line.nums.length) continue

    const target = matchLabel(line.label)
    if (!target || target.kind === 'ignore') continue

    if (target.kind === 'scalar') {
      const f = target.field
      if (section === 'control' && (f === 'muscle' || f === 'fatKg')) continue
      if (scan[f] !== null) continue // first occurrence wins
      scan[f] = pick(f, SCALAR_SPECS[f], line.nums)
      continue
    }

    // Segment row: the lean block has one number per row, the fat block two
    // (PBF %, then fat mass kg). Use the section, but trust the number count
    // when a heading was lost by OCR.
    const seg = target.seg
    const strictCount = line.nums.filter((n) => n.strict).length
    let block: 'lean' | 'fat'
    if (section === 'segFat') block = 'fat'
    else if (section === 'segLean') block = strictCount >= 2 ? 'fat' : 'lean'
    else block = strictCount >= 2 ? 'fat' : 'lean'

    if (block === 'lean') {
      if (scan.lean[seg] !== null) continue
      scan.lean[seg] = pick(`lean.${seg}`, LEAN_SPECS[seg], line.nums)
    } else {
      if (scan.fat[seg] !== null) continue
      const strict = line.nums.filter((n) => n.strict)
      const pool = strict.length >= 2 ? strict : line.nums
      if (pool.length >= 2) {
        scan.fat[seg] = pick(`fat.${seg}`, FAT_SPECS[seg], [pool[1]])
      } else {
        issue(`fat.${seg}`, `${FAT_SPECS[seg].name}: у рядку лише одне число, не зрозуміло, відсоток це чи кг.`)
      }
    }
  }

  // Height from the header line "Height : 192.0 cm Weight: 77.4 kg" (only used for the BMI check).
  let height: number | null = null
  for (const line of headerLines) {
    if (editDistance(canonLabel(line.label), 'helght') > 1) continue
    const tok = line.nums.find((n) => n.strict)
    const r = tok ? interpret(tok, HEIGHT_SPEC) : null
    if (r?.inRange) height = r.value
    break
  }

  // Fallback: weight from the same header line.
  if (scan.weight === null) {
    for (const line of headerLines) {
      const tokens = tokenize(line.raw)
      const idx = tokens.findIndex((t) => {
        const c = canonLabel(t)
        return c.length >= 4 && editDistance(c, 'welght') <= 1 && c !== 'helght'
      })
      if (idx < 0) continue
      const nums = tokens.slice(idx + 1).map(parseNumericToken).filter((n): n is NumToken => n !== null)
      const v = pick('weight', SCALAR_SPECS.weight, nums.slice(0, 1))
      if (v !== null) {
        scan.weight = v
        break
      }
    }
  }

  // --- Sanity checks (only add issues) ------------------------------------
  let checks = 0
  let passed = 0
  const fieldsTotal = 1 + Object.keys(SCALAR_SPECS).length + SEGMENT_KEYS.length * 2
  let found = scan.date ? 1 : 0
  if (!scan.date) issue('date', 'Не вдалося розпізнати дату заміру.')

  for (const f of Object.keys(SCALAR_SPECS) as ScalarField[]) {
    const v = scan[f]
    if (v === null) {
      if (REQUIRED.includes(f)) issue(f, `${SCALAR_SPECS[f].name}: обов'язкове поле не знайдено.`)
      continue
    }
    found++
    checks++
    if (inRange(v, SCALAR_SPECS[f])) passed++
  }
  for (const [block, specs] of [['lean', LEAN_SPECS], ['fat', FAT_SPECS]] as const) {
    for (const k of SEGMENT_KEYS) {
      const v = scan[block][k]
      if (v === null) continue
      found++
      checks++
      if (inRange(v, specs[k])) passed++
    }
  }

  const { weight, fatKg, ffm, pbf } = scan
  checks++
  if (weight !== null && fatKg !== null && ffm !== null) {
    const sum = round(fatKg + ffm, 2)
    if (Math.abs(sum - weight) <= 0.6) passed++
    else {
      const msg = `Жир + безжирова маса = ${fmt(sum)} кг, а вага ${fmt(weight)} кг (різниця понад 0,6).`
      for (const f of ['weight', 'fatKg', 'ffm']) issue(f, msg)
    }
  }
  checks++
  if (weight !== null && fatKg !== null && pbf !== null && weight > 0) {
    const calc = round((fatKg / weight) * 100, 1)
    if (Math.abs(calc - pbf) <= 1) passed++
    else {
      const msg = `Відсоток жиру ${fmt(pbf)}%, а з ваги і жирової маси виходить ${fmt(calc)}%.`
      for (const f of ['pbf', 'fatKg', 'weight']) issue(f, msg)
    }
  }

  if (height !== null && weight !== null && scan.bmi !== null) {
    checks++
    const calc = round(weight / (height / 100) ** 2, 1)
    if (Math.abs(calc - scan.bmi) <= 0.3) passed++
    else issue('bmi', `ІМТ ${fmt(scan.bmi)}, а з росту ${fmt(height)} см і ваги виходить ${fmt(calc)}.`)
  }

  const confidence = 0.5 * (found / fieldsTotal) + 0.5 * (checks ? passed / checks : 0) - 0.02 * restoredCount
  scan.confidence = Math.max(0, Math.min(1, round(confidence, 2)))
  scan.issues = issues
  return scan
}

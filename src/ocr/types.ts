/** Body segments as printed on the InBody 170 receipt. */
export interface Segments {
  /** Right arm */
  ra: number | null
  /** Left arm */
  la: number | null
  /** Trunk */
  tr: number | null
  /** Right leg */
  rl: number | null
  /** Left leg */
  ll: number | null
}

export type SegmentKey = keyof Segments

/** Scalar numeric fields of a scan. */
export type ScalarField =
  | 'weight'
  | 'muscle'
  | 'fatKg'
  | 'tbw'
  | 'ffm'
  | 'bmi'
  | 'pbf'
  | 'whr'
  | 'visceral'
  | 'bmr'
  | 'fitnessScore'

/** A doubtful field found by the parser. */
export interface ParseIssue {
  /** Field key: a ScalarField, 'date', or 'lean.ra' / 'fat.tr' etc. */
  field: string
  /** Human-readable message in Ukrainian. */
  message: string
}

/** Result of parsing the OCR text of an InBody 170 receipt. */
export interface ParsedScan {
  /** Scan date from the receipt header, 'YYYY-MM-DD'. */
  date: string | null
  /** Weight, kg */
  weight: number | null
  /** Skeletal muscle mass, kg */
  muscle: number | null
  /** Body fat mass, kg */
  fatKg: number | null
  /** Total body water, l */
  tbw: number | null
  /** Fat-free mass, kg */
  ffm: number | null
  /** Body mass index, kg/m2 */
  bmi: number | null
  /** Percent body fat, % */
  pbf: number | null
  /** Waist-hip ratio */
  whr: number | null
  /** Visceral fat level */
  visceral: number | null
  /** Basal metabolic rate, kcal */
  bmr: number | null
  /** InBody fitness score, points */
  fitnessScore: number | null
  /** Segmental lean mass, kg */
  lean: Segments
  /** Segmental fat MASS, kg (not %) */
  fat: Segments
  /** Doubtful or missing fields; never auto-corrected by sanity checks. */
  issues: ParseIssue[]
  /** 0..1: share of fields found and checks passed. */
  confidence: number
}

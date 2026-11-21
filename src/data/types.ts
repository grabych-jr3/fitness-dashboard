/** Muscle groups used for exercise tagging and the weekly balance chart. */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
]

/** ISO calendar date, `YYYY-MM-DD` (local time). */
export type IsoDate = string

/** Segmental values from the InBody printout, kg. `null` = not recognised / not entered. */
export interface Segments {
  /** right arm */
  ra: number | null
  /** left arm */
  la: number | null
  /** trunk */
  tr: number | null
  /** right leg */
  rl: number | null
  /** left leg */
  ll: number | null
}

export interface InbodyScan {
  id?: number
  date: IsoDate
  /** body weight, kg */
  weight: number
  /** skeletal muscle mass (SMM), kg */
  muscle: number
  /** body fat mass, kg */
  fatKg: number
  /** percent body fat, % */
  pbf: number
  /** total body water, L */
  tbw?: number
  /** fat-free mass, kg */
  ffm?: number
  bmi?: number
  /** waist-hip ratio */
  whr?: number
  /** visceral fat level */
  visceral?: number
  /** basal metabolic rate, kcal */
  bmr?: number
  fitnessScore?: number
  lean: Segments
  fat: Segments
  photoId?: number
  /** 0..1 mean OCR confidence, if the scan came from OCR */
  ocrConfidence?: number
  /** epoch ms */
  createdAt: number
}

export interface WeighIn {
  id?: number
  date: IsoDate
  weight: number
}

export interface Photo {
  id?: number
  blob: Blob
  /** epoch ms */
  createdAt: number
}

export interface Exercise {
  id?: number
  /** Ukrainian display name */
  name: string
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
  archived: boolean
  /** kg added when it's time to go heavier; a default is guessed from the name when absent */
  weightStep?: number
}

export interface TemplateItem {
  exerciseId: number
  targetSets: number
  repMin: number
  repMax: number
}

export interface Template {
  id?: number
  name: string
  items: TemplateItem[]
  /** sort order in the template list */
  order: number
}

export interface Workout {
  id?: number
  date: IsoDate
  templateId?: number
  /** epoch ms */
  startedAt: number
  /** epoch ms; absent while the workout is in progress */
  finishedAt?: number
  note?: string
}

export interface WorkoutSet {
  id?: number
  workoutId: number
  exerciseId: number
  /** 0-based position of the set within the exercise in this workout */
  setIndex: number
  /** kg */
  weight: number
  reps: number
  done: boolean
  pain?: boolean
  /** epoch ms */
  completedAt?: number
}

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  id: 'main'
  goalWeight: number
  weeklySetTarget: { min: number; max: number }
  theme: Theme
  restSeconds: number
  /** epoch ms of the last successful JSON export */
  lastBackupAt?: number
  /** Gemini API key for receipt recognition. Stays on this device; never exported. */
  aiKey?: string
  /** Gemini model id, e.g. 'gemini-3.8-flash'. */
  aiModel?: string
}

/** Point of the merged weight chart. */
export interface WeightPoint {
  date: IsoDate
  weight: number
  source: 'scan' | 'weighIn'
}

export interface PersonalRecord {
  exerciseId: number
  e1rm: number
  weight: number
  reps: number
  date: IsoDate
  workoutId: number
}

export type MuscleVolume = Record<MuscleGroup, number>

/** A receipt photo being recognised (or waiting for the user to confirm). Not backed up. */
export interface ScanDraft {
  id?: number
  photoId: number
  createdAt: number
  status: 'processing' | 'done' | 'error'
  /** Recognition attempts so far (a background tab or a killed app restarts it). */
  attempts: number
  result?: {
    values: Record<string, string> & { date: string }
    issues: { field: string; message: string }[]
    confidence?: number
    source?: string
    note?: string
  }
  error?: string
}

import { isIsoDate } from './dates'
import { db, SCHEMA_VERSION, TABLE_NAMES } from './db'
import {
  MUSCLE_GROUPS,
  type Exercise,
  type InbodyScan,
  type MuscleGroup,
  type Photo,
  type Settings,
  type Template,
  type WeighIn,
  type Workout,
  type WorkoutSet,
} from './types'

export const BACKUP_APP_ID = 'fitness-dashboard'

/** Photo as stored in a backup file: the blob becomes a base64 `data:` URL. */
export interface BackupPhoto {
  id?: number
  createdAt: number
  dataUrl: string
}

export interface BackupTables {
  inbodyScans: InbodyScan[]
  weighIns: WeighIn[]
  photos: BackupPhoto[]
  exercises: Exercise[]
  templates: Template[]
  workouts: Workout[]
  sets: WorkoutSet[]
  settings: Settings[]
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID
  schemaVersion: number
  /** ISO timestamp */
  exportedAt: string
  tables: BackupTables
}

export interface ImportOptions {
  /** Only full replacement is supported: every table is cleared first. */
  mode: 'replace'
}

export type ImportResult = Record<keyof BackupTables, number>

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

// ---------- Blob <-> data URL (works in browsers and in Node for tests) ----------

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) throw new BackupValidationError('Некоректне фото у файлі бекапу (не data URL)')
  const [, type, isBase64, payload] = match
  if (!isBase64) return new Blob([decodeURIComponent(payload)], { type })
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

// ---------- Export ----------

export async function exportAll(): Promise<BackupFile> {
  // One read transaction gives a consistent snapshot of every table.
  const t = await db.transaction('r', TABLE_NAMES.map((n) => db.table(n)), async () => {
    const [inbodyScans, weighIns, photos, exercises, templates, workouts, sets, settings] = await Promise.all([
      db.inbodyScans.toArray(),
      db.weighIns.toArray(),
      db.photos.toArray(),
      db.exercises.toArray(),
      db.templates.toArray(),
      db.workouts.toArray(),
      db.sets.toArray(),
      db.settings.toArray(),
    ])
    // The API key never leaves the phone, not even in a backup file.
    const safeSettings = settings.map(({ aiKey: _omit, ...rest }) => rest as Settings)
    return { inbodyScans, weighIns, photos, exercises, templates, workouts, sets, settings: safeSettings }
  })

  // Blob reading happens after the transaction (non-IndexedDB awaits would auto-commit it).
  const photos = await Promise.all(
    t.photos.map(async (p): Promise<BackupPhoto> => ({
      ...(p.id !== undefined ? { id: p.id } : {}),
      createdAt: p.createdAt,
      dataUrl: await blobToDataUrl(p.blob),
    })),
  )

  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { ...t, photos },
  }
}

/** Pretty JSON blob ready to be saved / shared. */
export async function exportAllAsBlob(): Promise<Blob> {
  return new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
}

/** e.g. `fitness-dashboard-2026-11-21.backup.json` (git-ignored pattern). */
export function backupFileName(date = new Date()): string {
  return `${BACKUP_APP_ID}-${date.toISOString().slice(0, 10)}.backup.json`
}

// ---------- Validation ----------

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isOptNum = (v: unknown): boolean => v === undefined || isNum(v)
const isOptId = (v: unknown): boolean => v === undefined || (Number.isInteger(v) && (v as number) > 0)
const isId = (v: unknown): boolean => Number.isInteger(v) && (v as number) > 0
const isGroups = (v: unknown): v is MuscleGroup[] =>
  Array.isArray(v) && v.every((g) => MUSCLE_GROUPS.includes(g as MuscleGroup))
const isSegments = (v: unknown): boolean =>
  isRec(v) && (['ra', 'la', 'tr', 'rl', 'll'] as const).every((k) => v[k] === null || isNum(v[k]))

const validators: Record<keyof BackupTables, (r: Rec) => boolean> = {
  inbodyScans: (r) =>
    isOptId(r.id) &&
    isIsoDate(r.date) &&
    isNum(r.weight) &&
    isNum(r.muscle) &&
    isNum(r.fatKg) &&
    isNum(r.pbf) &&
    ['tbw', 'ffm', 'bmi', 'whr', 'visceral', 'bmr', 'fitnessScore', 'ocrConfidence'].every((k) => isOptNum(r[k])) &&
    isSegments(r.lean) &&
    isSegments(r.fat) &&
    isOptId(r.photoId) &&
    isNum(r.createdAt),
  weighIns: (r) => isOptId(r.id) && isIsoDate(r.date) && isNum(r.weight),
  photos: (r) => isOptId(r.id) && isNum(r.createdAt) && typeof r.dataUrl === 'string' && r.dataUrl.startsWith('data:'),
  exercises: (r) =>
    isOptId(r.id) &&
    typeof r.name === 'string' &&
    r.name.trim() !== '' &&
    isGroups(r.primary) &&
    isGroups(r.secondary) &&
    typeof r.archived === 'boolean' &&
    (r.weightStep === undefined || (isNum(r.weightStep) && r.weightStep >= 0)),
  templates: (r) =>
    isOptId(r.id) &&
    typeof r.name === 'string' &&
    isNum(r.order) &&
    Array.isArray(r.items) &&
    r.items.every(
      (i) => isRec(i) && isId(i.exerciseId) && isNum(i.targetSets) && isNum(i.repMin) && isNum(i.repMax),
    ),
  workouts: (r) =>
    isOptId(r.id) &&
    isIsoDate(r.date) &&
    isOptId(r.templateId) &&
    isNum(r.startedAt) &&
    isOptNum(r.finishedAt) &&
    (r.note === undefined || typeof r.note === 'string'),
  sets: (r) =>
    isOptId(r.id) &&
    isId(r.workoutId) &&
    isId(r.exerciseId) &&
    Number.isInteger(r.setIndex) &&
    isNum(r.weight) &&
    isNum(r.reps) &&
    typeof r.done === 'boolean' &&
    (r.pain === undefined || typeof r.pain === 'boolean') &&
    isOptNum(r.completedAt),
  settings: (r) =>
    r.id === 'main' &&
    isNum(r.goalWeight) &&
    isRec(r.weeklySetTarget) &&
    isNum(r.weeklySetTarget.min) &&
    isNum(r.weeklySetTarget.max) &&
    (r.theme === 'system' || r.theme === 'light' || r.theme === 'dark') &&
    isNum(r.restSeconds) &&
    isOptNum(r.lastBackupAt) &&
    (r.trainingDays === undefined || (Array.isArray(r.trainingDays) && r.trainingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) &&
    (r.inbodyReminderDismissed === undefined || typeof r.inbodyReminderDismissed === 'string'),
}

/** Checks the structure of a parsed backup; throws BackupValidationError with a Ukrainian message. */
export function validateBackup(raw: unknown): BackupFile {
  if (!isRec(raw)) throw new BackupValidationError('Файл не є бекапом: очікується JSON-об’єкт')
  if (raw.app !== BACKUP_APP_ID) throw new BackupValidationError('Це бекап іншого застосунку')
  if (!Number.isInteger(raw.schemaVersion) || (raw.schemaVersion as number) < 1)
    throw new BackupValidationError('У бекапі немає версії схеми')
  if ((raw.schemaVersion as number) > SCHEMA_VERSION)
    throw new BackupValidationError('Бекап створено новішою версією застосунку — спершу оновіть застосунок')
  if (typeof raw.exportedAt !== 'string') throw new BackupValidationError('У бекапі немає дати експорту')
  if (!isRec(raw.tables)) throw new BackupValidationError('У бекапі немає таблиць')

  const tables = raw.tables
  for (const name of TABLE_NAMES) {
    const rows = tables[name]
    if (!Array.isArray(rows)) throw new BackupValidationError(`Таблиця «${name}» відсутня або пошкоджена`)
    rows.forEach((row, i) => {
      if (!isRec(row) || !validators[name](row))
        throw new BackupValidationError(`Пошкоджений запис №${i + 1} у таблиці «${name}»`)
    })
  }
  return raw as unknown as BackupFile
}

/** Reads a user-picked file (e.g. from `<input type="file">`) and parses JSON. */
export async function readBackupFile(file: Blob): Promise<unknown> {
  try {
    return JSON.parse(await file.text()) as unknown
  } catch {
    throw new BackupValidationError('Файл не є коректним JSON')
  }
}

// ---------- Import ----------

/**
 * Validates and restores a backup. `file` may be an already parsed object,
 * a JSON string or a Blob/File. In `replace` mode all tables are cleared and
 * refilled in one transaction (all-or-nothing); original ids are kept so
 * references (sets → workouts → templates → exercises, scans → photos) stay valid.
 */
export async function importAll(file: unknown, options: ImportOptions = { mode: 'replace' }): Promise<ImportResult> {
  if (options.mode !== 'replace') throw new BackupValidationError('Підтримується лише режим заміни')
  const raw = file instanceof Blob ? await readBackupFile(file) : typeof file === 'string' ? parseJson(file) : file
  const backup = validateBackup(raw)
  const t = backup.tables

  // Decode photos before opening the transaction (no async non-IDB work inside it).
  const photos: Photo[] = t.photos.map((p) => ({
    ...(p.id !== undefined ? { id: p.id } : {}),
    createdAt: p.createdAt,
    blob: dataUrlToBlob(p.dataUrl),
  }))

  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    // Keep this phone's API key: backups never contain it.
    const current = await db.settings.get('main')
    const settings = t.settings.map((x) => ({ ...x, aiKey: current?.aiKey, aiModel: x.aiModel ?? current?.aiModel }))
    await Promise.all(TABLE_NAMES.map((n) => db.table(n).clear()))
    await Promise.all([
      db.inbodyScans.bulkAdd(t.inbodyScans),
      db.weighIns.bulkAdd(t.weighIns),
      db.photos.bulkAdd(photos),
      db.exercises.bulkAdd(t.exercises),
      db.templates.bulkAdd(t.templates),
      db.workouts.bulkAdd(t.workouts),
      db.sets.bulkAdd(t.sets),
      db.settings.bulkAdd(settings),
    ])
  })

  return {
    inbodyScans: t.inbodyScans.length,
    weighIns: t.weighIns.length,
    photos: photos.length,
    exercises: t.exercises.length,
    templates: t.templates.length,
    workouts: t.workouts.length,
    sets: t.sets.length,
    settings: t.settings.length,
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BackupValidationError('Файл не є коректним JSON')
  }
}

// ---------- Persistent storage ----------

/**
 * Asks the browser not to evict IndexedDB under storage pressure. Never
 * throws; resolves to true only when persistence is granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

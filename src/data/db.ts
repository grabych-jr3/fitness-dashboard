import { Dexie, type EntityTable } from 'dexie'
import type { Exercise, InbodyScan, Photo, ScanDraft, Settings, Template, WeighIn, Workout, WorkoutSet } from './types'

export const DB_NAME = 'fitness-dashboard'
export const SCHEMA_VERSION = 1

export class FitnessDb extends Dexie {
  inbodyScans!: EntityTable<InbodyScan, 'id'>
  weighIns!: EntityTable<WeighIn, 'id'>
  photos!: EntityTable<Photo, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  templates!: EntityTable<Template, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  sets!: EntityTable<WorkoutSet, 'id'>
  settings!: EntityTable<Settings, 'id'>
  drafts!: EntityTable<ScanDraft, 'id'>

  constructor(name = DB_NAME) {
    super(name)
    // Only indexed fields are listed; everything else is stored as-is.
    this.version(SCHEMA_VERSION).stores({
      inbodyScans: '++id, date, createdAt',
      weighIns: '++id, date',
      photos: '++id, createdAt',
      // booleans are not valid IndexedDB keys, so `archived` is filtered in memory
      exercises: '++id, name, *primary, *secondary',
      templates: '++id, name, order',
      workouts: '++id, date, templateId, startedAt, finishedAt',
      sets: '++id, workoutId, exerciseId, [workoutId+exerciseId], [exerciseId+workoutId]',
      settings: 'id',
    })
    // v2: receipt recognition runs in the background and survives tab switches / app restarts.
    this.version(2).stores({ drafts: '++id, createdAt, status' })
  }
}

export const db = new FitnessDb()

/** Table names in a stable order (used by backup). */
export const TABLE_NAMES = [
  'inbodyScans',
  'weighIns',
  'photos',
  'exercises',
  'templates',
  'workouts',
  'sets',
  'settings',
] as const

export type TableName = (typeof TABLE_NAMES)[number]

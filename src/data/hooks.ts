import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { personalRecords, scansSorted, weeklyMuscleVolume, weightSeries } from './queries'
import { DEFAULT_SETTINGS } from './seed'
import type {
  Exercise,
  InbodyScan,
  IsoDate,
  MuscleVolume,
  PersonalRecord,
  Settings,
  Template,
  WeightPoint,
} from './types'

/*
 * All list hooks return `undefined` while the first query is loading, then a
 * live-updating value (re-renders on any change to the underlying tables).
 */

/** Current settings; falls back to defaults while loading or before seeding. */
export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('main'), []) ?? DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('main')) ?? DEFAULT_SETTINGS
    await db.settings.put({ ...current, ...patch, id: 'main' })
  })
}

/** InBody scans, oldest first. */
export function useScans(): InbodyScan[] | undefined {
  return useLiveQuery(() => scansSorted(), [])
}

/** Merged scans + weigh-ins, oldest first, one point per date. */
export function useWeightSeries(fromDate?: IsoDate, toDate?: IsoDate): WeightPoint[] | undefined {
  return useLiveQuery(() => weightSeries(fromDate, toDate), [fromDate, toDate])
}

/** Exercises sorted by name (uk collation); archived ones hidden unless asked for. */
export function useExercises(options: { includeArchived?: boolean } = {}): Exercise[] | undefined {
  const includeArchived = options.includeArchived ?? false
  return useLiveQuery(async () => {
    const all = await db.exercises.toArray()
    return all
      .filter((e) => includeArchived || !e.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  }, [includeArchived])
}

/** Templates sorted by `order`. */
export function useTemplates(): Template[] | undefined {
  return useLiveQuery(() => db.templates.orderBy('order').toArray(), [])
}

export function useWeeklyMuscleVolume(fromDate: IsoDate, toDate: IsoDate): MuscleVolume | undefined {
  return useLiveQuery(() => weeklyMuscleVolume(fromDate, toDate), [fromDate, toDate])
}

export function usePersonalRecords(): PersonalRecord[] | undefined {
  return useLiveQuery(() => personalRecords(), [])
}

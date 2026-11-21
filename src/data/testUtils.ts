import { db } from './db'

/** Wipes the (fake-indexeddb) database between tests. */
export async function resetDb(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
}

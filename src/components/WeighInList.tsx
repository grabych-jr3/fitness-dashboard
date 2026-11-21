import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../data/db.ts'
import type { WeighIn } from '../data/types.ts'
import { Button, Sheet } from '../glass'
import { fmt, fmtDate } from '../lib/format.ts'

/** Recorded weigh-ins, newest first, each with a delete button (confirmed). */
export default function WeighInList({ limit, empty }: { limit?: number; empty?: string }) {
  const items = useLiveQuery(async () => {
    const all = await db.weighIns.orderBy('date').reverse().toArray()
    return limit ? all.slice(0, limit) : all
  }, [limit])
  const [remove, setRemove] = useState<WeighIn | null>(null)

  if (!items) return null
  if (items.length === 0) return empty ? <p className="lg-muted" style={{ margin: 0 }}>{empty}</p> : null
  return (
    <>
      <div className="scan-list">
        {items.map((w) => (
          <div key={w.id} className="scan-row">
            <span>{fmtDate(w.date, 'full')}</span>
            <span className="lg-row" style={{ gap: 12 }}>
              <b className="weigh-val">{fmt(w.weight)} кг</b>
              <button type="button" className="ex-link ex-link--muted" aria-label={`Видалити зважування ${fmtDate(w.date, 'full')}`} onClick={() => setRemove(w)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <Sheet open={remove !== null} onClose={() => setRemove(null)} title="Видалити зважування?">
        <div className="lg-stack">
          <p className="lg-muted" style={{ margin: 0, textAlign: 'center' }}>
            {remove && `${fmt(remove.weight)} кг за ${fmtDate(remove.date, 'full')}`}
          </p>
          <Button
            variant="primary"
            block
            onClick={async () => {
              if (remove?.id !== undefined) await db.weighIns.delete(remove.id)
              setRemove(null)
            }}
          >
            Видалити
          </Button>
          <Button block onClick={() => setRemove(null)}>
            Ні
          </Button>
        </div>
      </Sheet>
    </>
  )
}

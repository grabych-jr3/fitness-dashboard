import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { db } from '../data/db.ts'
import { Glass } from '../glass'

/**
 * Shown on other tabs while a receipt is being recognised and when it's ready,
 * so a scan started on «Заміри» is never lost from sight.
 */
export default function ScanToast() {
  const { pathname } = useLocation()
  const counts = useLiveQuery(async () => {
    const all = await db.drafts.toArray()
    return {
      processing: all.filter((d) => d.status === 'processing').length,
      done: all.filter((d) => d.status === 'done').map((d) => d.id!),
    }
  }, [])
  const [dismissed, setDismissed] = useState<number[]>([])

  if (!counts || pathname.startsWith('/measurements')) return null
  const fresh = counts.done.filter((id) => !dismissed.includes(id))
  if (fresh.length === 0 && counts.processing === 0) return null

  return (
    <Glass strong className="scan-toast" role="status">
      {fresh.length > 0 ? (
        <>
          <span>Чек розпізнано ✓</span>
          <Link to="/measurements" className="scan-toast-link" onClick={() => setDismissed([...dismissed, ...fresh])}>
            Переглянути
          </Link>
          <button type="button" className="scan-toast-x" aria-label="Сховати" onClick={() => setDismissed([...dismissed, ...fresh])}>
            ✕
          </button>
        </>
      ) : (
        <>
          <span className="scan-toast-spinner" aria-hidden="true" />
          <span>Розпізнаю чек…</span>
          <Link to="/measurements" className="scan-toast-link">
            Відкрити
          </Link>
        </>
      )}
    </Glass>
  )
}

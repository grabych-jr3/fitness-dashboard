import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db } from '../data/db.ts'
import type { ScanDraft } from '../data/types.ts'
import { Button, Glass } from '../glass'
import { discardScan, retryScan, useScanProgress, type ScanStage } from './scanJobs.ts'

const stageText: Record<ScanStage, string> = {
  ai: 'Gemini читає чек…',
  preprocess: 'Готую фото…',
  load: 'Завантажую розпізнавання (лише першого разу)…',
  recognize: 'Читаю цифри…',
  parse: 'Перевіряю результат…',
  done: 'Готово',
}

/** One receipt being recognised in the background, or ready for review. */
export default function DraftCard({ draft, onReview }: { draft: ScanDraft; onReview: () => void }) {
  const progress = useScanProgress().get(draft.id!)
  const blob = useLiveQuery(async () => (await db.photos.get(draft.photoId))?.blob, [draft.photoId])
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  return (
    <Glass padded className="draft-card" aria-live="polite">
      <div className="draft-row">
        {url ? <img className="scan-thumb" src={url} alt="" /> : <div className="scan-thumb scan-thumb--empty">📄</div>}
        <div className="draft-main">
          {draft.status === 'processing' && (
            <>
              <div className="draft-title">Розпізнаю чек…</div>
              <div className="goal-bar draft-bar">
                <div className={'draft-bar-fill' + (progress ? '' : ' is-waiting')} style={{ width: `${Math.round((progress?.p ?? 0.06) * 100)}%` }} />
              </div>
              <div className="lg-muted draft-sub">
                {progress ? stageText[progress.stage] : 'Продовжу, щойно застосунок буде відкритий.'} Можна перейти на іншу вкладку — результат збережеться.
              </div>
            </>
          )}
          {draft.status === 'done' && (
            <>
              <div className="draft-title stat-good">Чек розпізнано ✓</div>
              <div className="lg-muted draft-sub">
                {draft.result?.source ? `${draft.result.source}. ` : ''}
                {draft.result?.issues.length ? `${draft.result.issues.length} полів варто перевірити.` : 'Перевір цифри і збережи.'}
              </div>
            </>
          )}
          {draft.status === 'error' && (
            <>
              <div className="draft-title form-error">Не вдалося розпізнати</div>
              <div className="lg-muted draft-sub">{draft.error}</div>
            </>
          )}
        </div>
      </div>
      {draft.status !== 'processing' && (
        <div className="lg-grid-2 draft-actions">
          {draft.status === 'done' ? (
            <Button variant="primary" onClick={onReview}>
              Перевірити
            </Button>
          ) : (
            <Button onClick={() => retryScan(draft.id!)}>Ще раз</Button>
          )}
          {draft.status === 'error' ? (
            <Button onClick={onReview}>Ввести вручну</Button>
          ) : (
            <Button onClick={() => discardScan(draft.id!)}>Видалити</Button>
          )}
        </div>
      )}
      {draft.status === 'error' && (
        <button type="button" className="ex-link ex-link--muted draft-discard" onClick={() => discardScan(draft.id!)}>
          Видалити це фото
        </button>
      )}
    </Glass>
  )
}

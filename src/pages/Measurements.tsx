import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Page from '../components/Page.tsx'
import WeighInList from '../components/WeighInList.tsx'
import WeighInSheet from '../components/WeighInSheet.tsx'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { useScans, useSettings } from '../data/hooks.ts'
import type { InbodyScan, ScanDraft } from '../data/types.ts'
import { Button, Glass, Sheet } from '../glass'
import { fmt, fmtDate } from '../lib/format.ts'
import DraftCard from '../measure/DraftCard.tsx'
import ScanEditor, { type EditorInput } from '../measure/ScanEditor.tsx'
import { startScan } from '../measure/scanJobs.ts'
import { emptyValues, valuesFromScan, type FormValues } from '../measure/scanForm.ts'
export default function Measurements() {
  const scans = useScans()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const settings = useSettings()
  const [editor, setEditor] = useState<EditorInput | null>(null)
  const [weighIn, setWeighIn] = useState(false)
  const [remove, setRemove] = useState<InbodyScan | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const drafts = useLiveQuery(() => db.drafts.orderBy('createdAt').reverse().toArray(), [])

  const onFile = async (file: File | undefined) => {
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (!file) return
    setStartError(null)
    try {
      // Saved first, recognised in the background: leaving this tab or the app doesn't lose it.
      await startScan(file)
    } catch (e) {
      console.error(e)
      setStartError('Не вдалося зберегти фото на телефоні.')
    }
  }

  const review = async (d: ScanDraft) => {
    const photo = await db.photos.get(d.photoId)
    const r = d.result
    setEditor({
      values: (r?.values as FormValues) ?? emptyValues(toIsoDate()),
      issues: r?.issues ?? [],
      confidence: r?.confidence,
      source: r?.source,
      note: r?.note,
      photo: photo?.blob,
      photoId: d.photoId,
      draftId: d.id,
    })
  }

  return (
    <Page title="Заміри">
      <Glass padded className="measure-hero">
        <h2 className="lg-h2">Новий замір InBody</h2>
        <p className="lg-muted measure-tip">Поклади чек рівно, без тіней і згинів, щоб цифри були в кадрі повністю.</p>
        {!settings.aiKey && (
          <p className="measure-ai-hint">
            Для точного розпізнавання <Link to="/settings#ai">підключи Gemini</Link> (безкоштовно).
          </p>
        )}
        <div className="lg-stack">
          <Button variant="primary" block onClick={() => camera.current?.click()}>
            📷 Сфотографувати чек
          </Button>
          <div className="lg-grid-2">
            <Button onClick={() => gallery.current?.click()}>З галереї</Button>
            <Button onClick={() => setEditor({ values: emptyValues(toIsoDate()), issues: [] })}>Ввести вручну</Button>
          </div>
        </div>
        {startError && <p className="form-error" style={{ marginTop: 10 }}>{startError}</p>}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </Glass>

      {drafts?.map((d) => <DraftCard key={d.id} draft={d} onReview={() => review(d)} />)}

      <Button block onClick={() => setWeighIn(true)}>
        ⚖️ Швидке зважування
      </Button>

      <WeighInsCard />

      {scans && scans.length > 0 && (
        <Glass padded>
          <h2 className="lg-h2">Мої заміри</h2>
          <div className="scan-list">
            {[...scans].reverse().map((s) => (
              <div key={s.id} className="scan-item">
                <button type="button" className="scan-item-main" onClick={() => setEditor({ values: valuesFromScan(s), issues: [], scanId: s.id })}>
                  <span className="scan-item-date">{fmtDate(s.date, 'full')}</span>
                  <span className="lg-muted">
                    {fmt(s.weight)} кг · м'язи {fmt(s.muscle)} · жир {fmt(s.pbf)}%
                  </span>
                </button>
                <button type="button" className="ex-link ex-link--muted" aria-label="Видалити замір" onClick={() => setRemove(s)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Glass>
      )}

      <ScanEditor input={editor} onClose={() => setEditor(null)} />
      <WeighInSheet open={weighIn} onClose={() => setWeighIn(false)} />
      <Sheet open={remove !== null} onClose={() => setRemove(null)} title="Видалити замір?">
        <div className="lg-stack">
          <p className="lg-muted" style={{ margin: 0, textAlign: 'center' }}>
            {remove && `Замір від ${fmtDate(remove.date, 'full')} буде видалено.`}
          </p>
          <Button
            variant="primary"
            block
            onClick={async () => {
              if (remove) {
                await db.inbodyScans.delete(remove.id!)
              }
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
    </Page>
  )
}

function WeighInsCard() {
  const count = useLiveQuery(() => db.weighIns.count(), [])
  if (!count) return null
  return (
    <Glass padded>
      <h2 className="lg-h2">Мої зважування</h2>
      <WeighInList />
    </Glass>
  )
}

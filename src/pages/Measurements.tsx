import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import Page from '../components/Page.tsx'
import WeighInSheet from '../components/WeighInSheet.tsx'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { useScans } from '../data/hooks.ts'
import type { InbodyScan } from '../data/types.ts'
import { Button, Glass, Sheet } from '../glass'
import { fmt, fmtDate } from '../lib/format.ts'
import ScanEditor, { type EditorInput } from '../measure/ScanEditor.tsx'
import { emptyValues, valuesFromParsed, valuesFromScan } from '../measure/scanForm.ts'
import type { OcrStage } from '../ocr/engine.ts'

const stageText: Record<OcrStage, string> = {
  preprocess: 'Готую фото…',
  load: 'Завантажую розпізнавання (лише першого разу)…',
  recognize: 'Читаю цифри…',
  parse: 'Перевіряю результат…',
  done: 'Готово',
}

function Thumb({ photoId }: { photoId?: number }) {
  const blob = useLiveQuery(async () => (photoId ? (await db.photos.get(photoId))?.blob : undefined), [photoId])
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  return url ? <img className="scan-thumb" src={url} alt="" /> : <div className="scan-thumb scan-thumb--empty">📄</div>
}

export default function Measurements() {
  const scans = useScans()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [ocr, setOcr] = useState<{ p: number; stage: OcrStage } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorInput | null>(null)
  const [weighIn, setWeighIn] = useState(false)
  const [remove, setRemove] = useState<InbodyScan | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setOcr({ p: 0, stage: 'preprocess' })
    try {
      // Loaded on demand so the OCR code stays out of the main bundle.
      const { recognizeInbody } = await import('../ocr/engine.ts')
      const { parsed } = await recognizeInbody(file, (p, stage) => setOcr({ p, stage }))
      setEditor({ values: valuesFromParsed(parsed, toIsoDate()), issues: parsed.issues, photo: file, confidence: parsed.confidence })
    } catch (e) {
      console.error(e)
      setError(navigator.onLine ? 'Не вдалося розпізнати фото. Спробуй ще раз або введи цифри вручну.' : 'Для першого розпізнавання потрібен інтернет (завантаження ~7 МБ). Потім працює офлайн.')
    } finally {
      setOcr(null)
      if (camera.current) camera.current.value = ''
      if (gallery.current) gallery.current.value = ''
    }
  }

  return (
    <Page title="Заміри">
      <Glass padded className="measure-hero">
        <h2 className="lg-h2">Новий замір InBody</h2>
        <p className="lg-muted measure-tip">Поклади чек рівно, без тіней і згинів, щоб цифри були в кадрі повністю.</p>
        {ocr ? (
          <div className="ocr-progress" role="status">
            <div className="goal-bar">
              <div className="goal-bar-fill" style={{ width: `${Math.round(ocr.p * 100)}%` }} />
            </div>
            <span className="lg-muted">{stageText[ocr.stage]}</span>
          </div>
        ) : (
          <div className="lg-stack">
            <Button variant="primary" block onClick={() => camera.current?.click()}>
              📷 Сфотографувати чек
            </Button>
            <div className="lg-grid-2">
              <Button onClick={() => gallery.current?.click()}>З галереї</Button>
              <Button onClick={() => setEditor({ values: emptyValues(toIsoDate()), issues: [] })}>Ввести вручну</Button>
            </div>
          </div>
        )}
        {error && <p className="form-error" style={{ marginTop: 10 }}>{error}</p>}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </Glass>

      <Button block onClick={() => setWeighIn(true)}>
        ⚖️ Швидке зважування
      </Button>

      {scans && scans.length > 0 && (
        <Glass padded>
          <h2 className="lg-h2">Мої заміри</h2>
          <div className="scan-list">
            {[...scans].reverse().map((s) => (
              <div key={s.id} className="scan-item">
                <Thumb photoId={s.photoId} />
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
            {remove && `Замір від ${fmtDate(remove.date, 'full')} і його фото буде видалено.`}
          </p>
          <Button
            variant="primary"
            block
            onClick={async () => {
              if (remove) {
                await db.transaction('rw', [db.inbodyScans, db.photos], async () => {
                  if (remove.photoId) await db.photos.delete(remove.photoId)
                  await db.inbodyScans.delete(remove.id!)
                })
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

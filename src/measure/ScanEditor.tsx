import { useEffect, useMemo, useState } from 'react'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { Button, Sheet } from '../glass'
import type { ParseIssue } from '../ocr/types.ts'
import { FAT_FIELDS, LEAN_FIELDS, MAIN_FIELDS, toScan, type FieldDef, type FormValues } from './scanForm.ts'

export type EditorInput = {
  values: FormValues
  issues: ParseIssue[]
  photo?: Blob
  confidence?: number
  /** Editing an existing scan instead of adding a new one. */
  scanId?: number
}

/** Confirmation / edit form for an InBody scan. Fields the OCR doubts are highlighted. */
export default function ScanEditor({ input, onClose }: { input: EditorInput | null; onClose: () => void }) {
  const [values, setValues] = useState<FormValues | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const photoUrl = useMemo(() => (input?.photo ? URL.createObjectURL(input.photo) : null), [input?.photo])

  useEffect(() => {
    setValues(input?.values ?? null)
    setErrors({})
  }, [input])
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])

  if (!input || !values) return null
  const issueFor = (key: string) => input.issues.filter((i) => i.field === key).map((i) => i.message)
  const dateIssues = issueFor('date')

  const field = (f: FieldDef) => {
    const doubt = issueFor(f.key)
    const err = errors[f.key]
    return (
      <label key={f.key} className={'lg-field scan-field' + (doubt.length || err ? ' scan-field--warn' : '')}>
        <span>
          {f.label}
          {f.unit && <span className="scan-unit">, {f.unit}</span>}
        </span>
        <input
          className="lg-input"
          inputMode="decimal"
          value={values[f.key] ?? ''}
          onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
        />
        {(err || doubt[0]) && <span className="scan-msg">{err ?? doubt.join(' ')}</span>}
      </label>
    )
  }

  const save = async () => {
    const res = toScan(values)
    if ('errors' in res) {
      setErrors(res.errors)
      return
    }
    setSaving(true)
    try {
      await db.transaction('rw', [db.inbodyScans, db.photos], async () => {
        let photoId: number | undefined
        if (input.photo) photoId = (await db.photos.add({ blob: input.photo, createdAt: Date.now() })) as number
        if (input.scanId !== undefined) {
          const old = await db.inbodyScans.get(input.scanId)
          await db.inbodyScans.put({ ...old, ...res.scan, id: input.scanId, photoId: photoId ?? old?.photoId, createdAt: old?.createdAt ?? Date.now() })
        } else {
          // One scan per date: a new scan for the same day replaces the old one.
          const same = await db.inbodyScans.where('date').equals(res.scan.date).toArray()
          for (const s of same) {
            if (s.photoId) await db.photos.delete(s.photoId)
            await db.inbodyScans.delete(s.id!)
          }
          await db.inbodyScans.add({ ...res.scan, photoId, ocrConfidence: input.confidence, createdAt: Date.now() })
        }
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={input.scanId !== undefined ? 'Редагувати замір' : 'Перевір цифри'}>
      <div className="lg-stack">
        {photoUrl && <img className="scan-photo" src={photoUrl} alt="Фото чека" />}
        {input.confidence !== undefined && (
          <p className={'scan-summary ' + (input.issues.length ? 'bal-warn' : 'stat-good')}>
            {input.issues.length
              ? `Розпізнано, але ${input.issues.length} ${input.issues.length === 1 ? 'поле варто' : 'полів варто'} перевірити — вони підсвічені.`
              : 'Усе розпізнано і зійшлося. Глянь ще раз і зберігай.'}
          </p>
        )}
        <label className={'lg-field' + (dateIssues.length || errors.date ? ' scan-field--warn' : '')}>
          Дата заміру
          <input className="lg-input" type="date" max={toIsoDate()} value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} />
          {(errors.date || dateIssues[0]) && <span className="scan-msg">{errors.date ?? dateIssues.join(' ')}</span>}
        </label>
        <div className="lg-label">Склад тіла</div>
        <div className="lg-grid-2">{MAIN_FIELDS.map(field)}</div>
        <div className="lg-label">Суха маса по сегментах</div>
        <div className="lg-grid-2">{LEAN_FIELDS.map(field)}</div>
        <div className="lg-label">Жир по сегментах</div>
        <div className="lg-grid-2">{FAT_FIELDS.map(field)}</div>
        {Object.keys(errors).length > 0 && <p className="form-error">Виправ підсвічені поля.</p>}
        <Button variant="primary" block disabled={saving} onClick={save}>
          {saving ? 'Зберігаю…' : 'Зберегти замір'}
        </Button>
        <Button block onClick={onClose}>
          Скасувати
        </Button>
      </div>
    </Sheet>
  )
}

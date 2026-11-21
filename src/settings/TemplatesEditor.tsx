import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useExercises, useTemplates } from '../data/hooks.ts'
import type { Exercise, Template, TemplateItem } from '../data/types.ts'
import { Button, Glass, Sheet } from '../glass'
import ExercisePicker from '../workout/ExercisePicker.tsx'
import {
  EditorError,
  addTemplateItem,
  createTemplate,
  deleteTemplate,
  moveTemplateItem,
  removeTemplateItem,
  renameTemplate,
  updateTemplateItem,
} from './editorActions.ts'
import { REPS_MAX, REPS_MIN, SETS_MAX, SETS_MIN, parseIntInput, suggestTemplateName } from './editorLogic.ts'
import { Icon } from './icons.tsx'
import './settings.css'

function exercisesWord(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return 'вправа'
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'вправи'
  return 'вправ'
}

/** Integer input that commits on blur / Enter; invalid text snaps back to the saved value. */
function IntInput({ value, label, min, max, onCommit }: { value: number; label: string; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  // keep in sync when the other end of the range pushes this value
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const raw = parseIntInput(text)
    if (!Number.isFinite(raw)) return setText(String(value))
    const v = Math.min(max, Math.max(min, Math.round(raw)))
    setText(String(v))
    if (v !== value) onCommit(v)
  }
  return (
    <input
      className="set-input"
      inputMode="numeric"
      enterKeyHint="done"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function ItemCard({
  templateId,
  item,
  index,
  count,
  exercise,
}: {
  templateId: number
  item: TemplateItem
  index: number
  count: number
  exercise: Exercise | undefined
}) {
  const name = exercise?.name ?? 'Невідома вправа'
  const update = (patch: Partial<Omit<TemplateItem, 'exerciseId'>>) => updateTemplateItem(templateId, item.exerciseId, patch)
  return (
    <div className="se-item">
      <div className="se-item-head">
        <span className="se-item-num">{index + 1}</span>
        <span className="se-item-name">
          {name}
          {exercise?.archived && <span className="se-item-hidden"> · прихована</span>}
        </span>
        <div className="se-item-btns">
          <button type="button" className="se-icon" aria-label={`Перемістити вище: ${name}`} disabled={index === 0} onClick={() => moveTemplateItem(templateId, item.exerciseId, -1)}>
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="se-icon"
            aria-label={`Перемістити нижче: ${name}`}
            disabled={index === count - 1}
            onClick={() => moveTemplateItem(templateId, item.exerciseId, 1)}
          >
            <Icon name="down" />
          </button>
          <button type="button" className="se-icon se-icon--danger" aria-label={`Прибрати: ${name}`} onClick={() => removeTemplateItem(templateId, item.exerciseId)}>
            <Icon name="remove" />
          </button>
        </div>
      </div>
      <div className="se-item-params">
        <div className="se-param">
          <span className="se-param-label">Підходи</span>
          <div className="se-stepper">
            <button type="button" className="se-icon" aria-label="Менше підходів" disabled={item.targetSets <= SETS_MIN} onClick={() => update({ targetSets: item.targetSets - 1 })}>
              <Icon name="minus" />
            </button>
            <span className="se-stepper-val" aria-live="polite">
              {item.targetSets}
            </span>
            <button type="button" className="se-icon" aria-label="Більше підходів" disabled={item.targetSets >= SETS_MAX} onClick={() => update({ targetSets: item.targetSets + 1 })}>
              <Icon name="plus" />
            </button>
          </div>
        </div>
        <div className="se-param">
          <span className="se-param-label">Повтори</span>
          <div className="se-reps">
            <IntInput value={item.repMin} min={REPS_MIN} max={REPS_MAX} label={`Повтори від (${REPS_MIN}–${REPS_MAX})`} onCommit={(repMin) => update({ repMin })} />
            <span className="se-dash">–</span>
            <IntInput value={item.repMax} min={REPS_MIN} max={REPS_MAX} label={`Повтори до (${REPS_MIN}–${REPS_MAX})`} onCommit={(repMax) => update({ repMax })} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TemplateSheet({ template, onClose }: { template: Template; onClose: () => void }) {
  const exercises = useExercises({ includeArchived: true })
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id!, e])), [exercises])
  const [name, setName] = useState(template.name)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const saveName = async () => {
    if (name === template.name) return setError(null)
    try {
      await renameTemplate(template.id!, name)
      setError(null)
    } catch (e) {
      setError(e instanceof EditorError ? e.message : 'Не вдалося зберегти назву.')
      setName(template.name)
    }
  }

  const closePicker = useCallback(() => setPicker(false), [])
  const closeConfirm = useCallback(() => setConfirm(false), [])

  return (
    <>
      <Sheet open onClose={onClose} title="Шаблон">
        <div className="lg-stack">
          <label className="lg-field">
            Назва
            <input
              className="lg-input"
              value={name}
              maxLength={40}
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </label>
          {error && <p className="form-error">{error}</p>}

          <div className="se-items">
            {template.items.map((item, i) => (
              <ItemCard key={item.exerciseId} templateId={template.id!} item={item} index={i} count={template.items.length} exercise={byId.get(item.exerciseId)} />
            ))}
            {template.items.length === 0 && <p className="lg-muted se-empty">Поки що без вправ. Додай першу.</p>}
          </div>

          <div className="se-actions">
            <Button block onClick={() => setPicker(true)}>
              + Додати вправу
            </Button>
            <Button variant="primary" block onClick={onClose}>
              Готово
            </Button>
            <button type="button" className="wo-discard se-danger" onClick={() => setConfirm(true)}>
              Видалити шаблон
            </button>
          </div>
        </div>
      </Sheet>

      <ExercisePicker open={picker} onClose={closePicker} exclude={template.items.map((i) => i.exerciseId)} onPick={(id) => addTemplateItem(template.id!, id)} />

      <Sheet open={confirm} onClose={closeConfirm} title="Видалити шаблон?">
        <div className="lg-stack">
          <p className="lg-muted se-confirm-text">
            «{template.name}» буде видалено. Минулі тренування за цим шаблоном залишаться в історії.
          </p>
          <Button
            variant="primary"
            block
            onClick={async () => {
              setConfirm(false)
              onClose()
              await deleteTemplate(template.id!)
            }}
          >
            Видалити
          </Button>
          <Button block onClick={closeConfirm}>
            Скасувати
          </Button>
        </div>
      </Sheet>
    </>
  )
}

export default function TemplatesEditor() {
  const templates = useTemplates()
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { hash } = useLocation()
  const loaded = templates !== undefined
  const editing = templates?.find((t) => t.id === editId)

  // /settings#templates (the «Редагувати» link on the Workout page) scrolls here.
  useEffect(() => {
    if (hash === '#templates' && loaded) document.getElementById('templates')?.scrollIntoView({ block: 'start' })
  }, [hash, loaded])

  const create = async () => {
    try {
      setError(null)
      setEditId(await createTemplate(suggestTemplateName(templates ?? [])))
    } catch (e) {
      setError(e instanceof EditorError ? e.message : 'Не вдалося створити шаблон.')
    }
  }
  const close = useCallback(() => setEditId(null), [])

  return (
    <Glass padded id="templates" className="se-section">
      <div className="lg-row se-head">
        <h2 className="lg-h2">Шаблони тренувань</h2>
        <div className="lg-spacer" />
        <button type="button" className="ex-link" onClick={create}>
          + Створити
        </button>
      </div>
      <p className="lg-muted set-text">Торкнись шаблону, щоб змінити назву, вправи, їх порядок, підходи й повтори.</p>
      <div className="scan-list">
        {(templates ?? []).map((t) => (
          <button key={t.id} type="button" className="se-row-btn" onClick={() => setEditId(t.id!)}>
            <span className="se-row-main">
              {t.name}
              <span className="se-row-sub">
                {t.items.length} {exercisesWord(t.items.length)}
              </span>
            </span>
            <span className="se-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
        {loaded && templates.length === 0 && <p className="lg-muted se-empty">Шаблонів немає.</p>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing && <TemplateSheet key={editing.id} template={editing} onClose={close} />}
    </Glass>
  )
}

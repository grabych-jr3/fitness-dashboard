import { useCallback, useMemo, useState } from 'react'
import { db } from '../data/db.ts'
import { useExercises } from '../data/hooks.ts'
import { defaultWeightStep } from '../data/queries.ts'
import { muscleGroupLabels } from '../data/seed.ts'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../data/types.ts'
import { Button, Glass, Sheet } from '../glass'
import { EditorError, saveExercise, setExerciseArchived } from './editorActions.ts'
import { cycleGroup, exerciseWarning, groupRole, validateExercise, type GroupSelection } from './editorLogic.ts'
import './settings.css'

const labels = (groups: readonly MuscleGroup[]) => groups.map((g) => muscleGroupLabels[g]).join(', ')

const roleText = { none: 'не задіяна', primary: 'основна', secondary: 'допоміжна' } as const

/** All 10 muscle groups as chips; each tap cycles none → основна → допоміжна → none. */
export function GroupChips({ value, onChange }: { value: GroupSelection; onChange: (v: GroupSelection) => void }) {
  return (
    <div className="se-chips" role="group" aria-label="Групи м'язів">
      {MUSCLE_GROUPS.map((g) => {
        const role = groupRole(value, g)
        return (
          <button
            key={g}
            type="button"
            className={`se-chip se-chip--${role}`}
            aria-label={`${muscleGroupLabels[g]}: ${roleText[role]}`}
            onClick={() => onChange(cycleGroup(value, g))}
          >
            {muscleGroupLabels[g]}
            {role !== 'none' && <span className="se-chip-tag">{role === 'primary' ? 'осн.' : 'доп.'}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ExerciseSheet({ exercise, all, onClose }: { exercise: Exercise | null; all: readonly Exercise[]; onClose: () => void }) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [groups, setGroups] = useState<GroupSelection>({ primary: exercise?.primary ?? [], secondary: exercise?.secondary ?? [] })
  const [step, setStep] = useState(exercise?.weightStep !== undefined ? String(exercise.weightStep) : '')
  const [error, setError] = useState<string | null>(null)
  const warning = exerciseWarning(name)

  const save = async () => {
    const err = validateExercise({ name, ...groups }, all, exercise?.id)
    if (err) return setError(err)
    const stepNum = step.trim() === '' ? undefined : Number(step.replace(',', '.'))
    if (stepNum !== undefined && (!Number.isFinite(stepNum) || stepNum < 0 || stepNum > 50)) return setError('Крок ваги — число від 0 до 50 кг.')
    try {
      const id = await saveExercise({ name, ...groups }, exercise?.id)
      await db.exercises.update(id, { weightStep: stepNum })
      onClose()
    } catch (e) {
      setError(e instanceof EditorError ? e.message : 'Не вдалося зберегти вправу.')
    }
  }

  return (
    <Sheet open onClose={onClose} title={exercise ? 'Вправа' : 'Нова вправа'}>
      <div className="lg-stack">
        <label className="lg-field">
          Назва
          <input className="lg-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Наприклад, Кросовер на блоці" />
        </label>
        {warning && <p className="se-warn">{warning}</p>}

        <div className="lg-field">
          Групи м'язів
          <p className="lg-muted se-hint">Торкнись раз — основна (1 підхід у балансі), ще раз — допоміжна (½ підходу), втретє — прибрати.</p>
          <GroupChips value={groups} onChange={(g) => {
              setGroups(g)
              setError(null)
            }} />
        </div>
        <p className="se-summary">
          <b>Основні:</b> {groups.primary.length ? labels(groups.primary) : '—'}
          <br />
          <b>Допоміжні:</b> {groups.secondary.length ? labels(groups.secondary) : '—'}
        </p>

        <label className="lg-field">
          Крок ваги, кг
          <input className="lg-input" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} placeholder={`${defaultWeightStep(name)} (типово)`} />
          <span className="lg-muted se-hint">Скільки додавати, коли всі підходи дійшли до верхньої межі повторів: наступна пара гантелей, плитка тренажера.</span>
        </label>

        {error && <p className="form-error">{error}</p>}
        <div className="se-actions">
          <Button variant="primary" block onClick={save}>
            {exercise ? 'Зберегти' : 'Додати'}
          </Button>
          {exercise && (
            <Button
              block
              onClick={async () => {
                await setExerciseArchived(exercise.id!, !exercise.archived)
                onClose()
              }}
            >
              {exercise.archived ? 'Показати вправу' : 'Сховати вправу'}
            </Button>
          )}
          <Button block onClick={onClose}>
            Скасувати
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

export default function ExerciseEditor() {
  const exercises = useExercises({ includeArchived: true })
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [q, setQ] = useState('')
  const close = useCallback(() => setEditing(null), [])

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('uk')
    return (exercises ?? []).filter((e) => !needle || e.name.toLocaleLowerCase('uk').includes(needle))
  }, [exercises, q])

  return (
    <Glass padded id="exercises" className="se-section">
      <div className="lg-row se-head">
        <h2 className="lg-h2">Вправи</h2>
        <div className="lg-spacer" />
        <button type="button" className="ex-link" onClick={() => setEditing('new')}>
          + Додати
        </button>
      </div>
      <p className="lg-muted set-text">Торкнись вправи, щоб змінити назву і групи м'язів. Приховані вправи не пропонуються при додаванні, але їхня історія лишається.</p>
      <input className="lg-input se-search" type="search" placeholder="Пошук вправи" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scan-list">
        {list.map((e) => (
          <div key={e.id} className={'se-ex-row' + (e.archived ? ' ex-archived' : '')}>
            <button type="button" className="se-row-btn" onClick={() => setEditing(e)}>
              <span className="se-row-main">
                {e.name}
                <span className="se-row-sub">
                  {labels(e.primary)}
                  {e.secondary.length > 0 && ` · доп.: ${labels(e.secondary)}`}
                </span>
              </span>
            </button>
            <button type="button" className="ex-link ex-link--muted" onClick={() => setExerciseArchived(e.id!, !e.archived)}>
              {e.archived ? 'Показати' : 'Сховати'}
            </button>
          </div>
        ))}
        {exercises && list.length === 0 && <p className="lg-muted se-empty">Нічого не знайдено.</p>}
      </div>
      {editing && <ExerciseSheet key={editing === 'new' ? 'new' : editing.id} exercise={editing === 'new' ? null : editing} all={exercises ?? []} onClose={close} />}
    </Glass>
  )
}

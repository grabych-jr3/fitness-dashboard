import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { nextTarget } from '../data/queries.ts'
import type { Exercise, WorkoutSet } from '../data/types.ts'
import { Glass } from '../glass'
import { addSet, removeExercise, removeSet, toggleDone, updateSet } from './actions.ts'
import { TodayTarget } from './Progression.tsx'
import { startRest } from './restTimer.ts'

/** Numeric input that keeps what the user is typing and saves valid numbers on blur. */
function NumField({ value, onSave, label, step }: { value: number; onSave: (v: number) => void; label: string; step: 'decimal' | 'numeric' }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => setText(value ? String(value) : ''), [value])
  return (
    <input
      className="set-input"
      inputMode={step}
      aria-label={label}
      placeholder="0"
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = Number(text.replace(',', '.'))
        if (Number.isFinite(v) && v >= 0 && v !== value) onSave(step === 'numeric' ? Math.round(v) : Math.round(v * 100) / 100)
        else setText(value ? String(value) : '')
      }}
    />
  )
}

export default function ExerciseBlock({
  workoutId,
  templateId,
  exercise,
  sets,
  restSeconds,
}: {
  workoutId: number
  templateId?: number
  exercise: Exercise
  sets: WorkoutSet[]
  restSeconds: number
}) {
  const rec = useLiveQuery(() => nextTarget(exercise.id!, { templateId, excludeWorkoutId: workoutId }), [exercise.id, workoutId, templateId])

  return (
    <Glass padded className="ex-block">
      <div className="lg-row">
        <h3 className="ex-name">{exercise.name}</h3>
        <div className="lg-spacer" />
        <button type="button" className="ex-remove" onClick={() => removeExercise(workoutId, exercise.id!)} aria-label={`Прибрати ${exercise.name}`}>
          Прибрати
        </button>
      </div>
      {rec ? <TodayTarget rec={rec} /> : <p className="lg-muted ex-hint">&nbsp;</p>}

      <div className="set-grid set-head" aria-hidden="true">
        <span>№</span>
        <span>кг</span>
        <span>повт.</span>
        <span />
        <span />
      </div>
      {sets.map((s, i) => (
        <div key={s.id} className={'set-grid set-row' + (s.done ? ' set-done' : '')}>
          <span className="set-num">{i + 1}</span>
          <NumField label={`Вага, підхід ${i + 1}`} step="decimal" value={s.weight} onSave={(weight) => updateSet(s.id!, { weight })} />
          <NumField label={`Повтори, підхід ${i + 1}`} step="numeric" value={s.reps} onSave={(reps) => updateSet(s.id!, { reps })} />
          <button
            type="button"
            className={'set-pain' + (s.pain ? ' on' : '')}
            aria-pressed={!!s.pain}
            aria-label="Відчуваю біль"
            title="Відчуваю біль"
            onClick={() => updateSet(s.id!, { pain: !s.pain })}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" fill={s.pain ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="set-check"
            aria-pressed={s.done}
            aria-label={s.done ? 'Скасувати виконання' : 'Підхід виконано'}
            onClick={async () => {
              if (await toggleDone(s.id!)) startRest(restSeconds)
            }}
          >
            ✓
          </button>
        </div>
      ))}
      <div className="lg-row ex-actions">
        <button type="button" className="ex-link" onClick={() => addSet(workoutId, exercise.id!)}>
          + Підхід
        </button>
        {sets.length > 0 && (
          <button type="button" className="ex-link ex-link--muted" onClick={() => removeSet(sets.at(-1)!.id!)}>
            − Останній
          </button>
        )}
      </div>
    </Glass>
  )
}

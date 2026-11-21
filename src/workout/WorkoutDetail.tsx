import { useMemo, useState } from 'react'
import type { Workout, WorkoutSet } from '../data/types.ts'
import { Button, Sheet } from '../glass'
import { fmt, fmtDate } from '../lib/format.ts'
import { deleteWorkout, repeatWorkout } from './actions.ts'
import { comparisonTrend, fmtComparison, fmtDuration, fmtKg, fmtTime, fmtWeight, weekday, workoutDetail, type ExerciseSummary } from './history.ts'
import './history.css'

function ExerciseCard({ ex, name }: { ex: ExerciseSummary; name: string }) {
  const trend = ex.previous && ex.best ? comparisonTrend(ex.previous, ex.best) : null
  return (
    <section className="wd-ex" aria-label={name}>
      <div className="wd-ex-head">
        <h3 className="ex-name wd-ex-name">{name}</h3>
        {ex.best && (
          <span className="wd-e1rm" title="Найкращий розрахунковий 1ПМ у цьому тренуванні">
            <span className="lg-muted">e1RM</span> {fmt(ex.best.e1rm)} кг
          </span>
        )}
      </div>

      <ol className="wd-sets">
        {ex.sets.map(({ set, record }, i) => (
          <li key={set.id} className={'wd-set' + (record ? ' wd-set--pr' : '')}>
            <span className="set-num wd-num">{i + 1}</span>
            <span className="wd-load">
              {fmtWeight(set.weight)} кг × {set.reps}
            </span>
            {set.pain && (
              <span className="wd-pain" role="img" aria-label="Відчував біль" title="Відчував біль">
                ⚡
              </span>
            )}
            <span className="lg-spacer" />
            {record && <span className="wd-badge">Рекорд</span>}
          </li>
        ))}
      </ol>

      {ex.previous ? (
        <p className="wd-prev">
          <span className="lg-muted">
            Минулого разу ({fmtDate(ex.previous.date)}): {fmtWeight(ex.previous.previous.weight)} × {ex.previous.previous.reps}
          </span>{' '}
          <span className={'wd-delta wd-delta--' + trend}>{fmtComparison(ex.previous)}</span>
        </p>
      ) : ex.firstTime ? (
        <p className="wd-prev lg-muted">Перший раз</p>
      ) : null}
    </section>
  )
}

/** Bottom sheet with the full record of one finished workout. */
export default function WorkoutDetail({
  workoutId,
  onClose,
  workouts,
  sets,
  templateNames,
  exerciseNames,
}: {
  workoutId: number | null
  onClose: () => void
  workouts: readonly Workout[]
  sets: readonly WorkoutSet[]
  templateNames: ReadonlyMap<number, string>
  exerciseNames: ReadonlyMap<number, string>
}) {
  // id of the workout whose delete confirmation is shown (resets when another one opens)
  const [confirmFor, setConfirmFor] = useState<number | null>(null)
  const confirmDelete = confirmFor !== null && confirmFor === workoutId
  const [busy, setBusy] = useState(false)

  const detail = useMemo(
    () => (workoutId === null ? null : workoutDetail(workoutId, workouts, sets, templateNames)),
    [workoutId, workouts, sets, templateNames],
  )

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!detail) return null
  const w = detail.workout
  return (
    <Sheet open onClose={onClose} title={confirmDelete ? 'Видалити тренування?' : detail.name}>
      {confirmDelete ? (
        <div className="lg-stack">
          <p className="lg-muted wd-confirm">
            Тренування {fmtDate(w.date, 'full')} і всі його {detail.doneSets} підходів буде видалено назавжди.
          </p>
          <Button variant="primary" block disabled={busy} className="wd-danger" onClick={() => run(() => deleteWorkout(w.id!))}>
            Видалити
          </Button>
          <Button block onClick={() => setConfirmFor(null)}>
            Ні, залишити
          </Button>
        </div>
      ) : (
        <div className="lg-stack">
          <p className="wd-date">
            {weekday(w.date, 'long')}, {fmtDate(w.date, 'full')}
          </p>
          <div className="wd-stats">
            <div>
              <div className="lg-label">Початок</div>
              <div className="wd-stat">{fmtTime(w.startedAt)}</div>
            </div>
            <div>
              <div className="lg-label">Тривалість</div>
              <div className="wd-stat">{fmtDuration(detail.minutes)}</div>
            </div>
            <div>
              <div className="lg-label">Підходів</div>
              <div className="wd-stat">{detail.doneSets}</div>
            </div>
            <div>
              <div className="lg-label">Тоннаж</div>
              <div className="wd-stat">{fmtKg(detail.tonnage)}</div>
            </div>
          </div>

          <div className="wd-list">
            {detail.exercises.map((ex) => (
              <ExerciseCard key={ex.exerciseId} ex={ex} name={exerciseNames.get(ex.exerciseId) ?? 'Видалена вправа'} />
            ))}
          </div>

          <Button
            variant="primary"
            block
            disabled={busy}
            onClick={() =>
              run(async () => {
                await repeatWorkout(w.id!)
                document.getElementById('app-scroll')?.scrollTo({ top: 0 })
              })
            }
          >
            Повторити
          </Button>
          <button type="button" className="wo-discard" onClick={() => setConfirmFor(w.id!)}>
            Видалити тренування
          </button>
        </div>
      )}
    </Sheet>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Page from '../components/Page.tsx'
import { db } from '../data/db.ts'
import { useExercises, useSettings, useTemplates } from '../data/hooks.ts'
import { nextStepsAfter, type NextStep } from '../data/queries.ts'
import type { Exercise, Workout as WorkoutT, WorkoutSet } from '../data/types.ts'
import { Button, Glass, Sheet } from '../glass'
import { addExercise, discardWorkout, exerciseOrder, finishWorkout, startWorkout } from '../workout/actions.ts'
import ExerciseBlock from '../workout/ExerciseBlock.tsx'
import FinishSummary from '../workout/FinishSummary.tsx'
import { InbodyReminder } from '../workout/Reminders.tsx'
import ExercisePicker from '../workout/ExercisePicker.tsx'
import HistoryList from '../workout/HistoryList.tsx'
import { fmtClock, stopRest } from '../workout/restTimer.ts'
import '../settings/settings.css'

function useActiveWorkout() {
  return useLiveQuery(async () => {
    const all = await db.workouts.toArray()
    return all.filter((w) => !w.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  }, [])
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="wo-elapsed">{fmtClock(Math.max(0, Math.floor((now - since) / 1000)))}</span>
}

function ActiveWorkout({ workout, onFinished }: { workout: WorkoutT; onFinished: (steps: NextStep[]) => void }) {
  const settings = useSettings()
  const exercises = useExercises({ includeArchived: true })
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workout.id!).toArray(), [workout.id])
  const template = useLiveQuery(() => (workout.templateId ? db.templates.get(workout.templateId) : undefined), [workout.templateId])
  const [picker, setPicker] = useState(false)
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null)

  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id!, e])), [exercises])
  const order = useMemo(() => exerciseOrder(sets ?? []), [sets])
  const done = (sets ?? []).filter((s) => s.done).length

  if (!sets || !exercises) return null
  return (
    <>
      <InbodyReminder />
      <Glass padded className="wo-head">
        <div className="lg-row">
          <div>
            <div className="lg-label">{template?.name ?? 'Вільне тренування'}</div>
            <Elapsed since={workout.startedAt} />
          </div>
          <div className="lg-spacer" />
          <div className="wo-count">
            <span className="lg-big">{done}</span>
            <span className="lg-muted"> / {sets.length}</span>
            <div className="lg-muted wo-count-label">підходів</div>
          </div>
        </div>
      </Glass>

      {order.map((exId) => {
        const ex: Exercise | undefined = byId.get(exId)
        if (!ex) return null
        const exSets = sets.filter((s: WorkoutSet) => s.exerciseId === exId).sort((a, b) => a.setIndex - b.setIndex)
        return <ExerciseBlock key={exId} workoutId={workout.id!} templateId={workout.templateId} exercise={ex} sets={exSets} restSeconds={settings.restSeconds} />
      })}

      <Button block onClick={() => setPicker(true)}>
        + Додати вправу
      </Button>
      <Button variant="primary" block onClick={() => setConfirm('finish')}>
        Завершити тренування
      </Button>
      <button type="button" className="wo-discard" onClick={() => setConfirm('discard')}>
        Скасувати тренування
      </button>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} exclude={order} onPick={(id) => addExercise(workout.id!, id)} />

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'finish' ? 'Завершити тренування?' : 'Скасувати тренування?'}>
        <div className="lg-stack">
          <p className="lg-muted" style={{ margin: 0, textAlign: 'center' }}>
            {confirm === 'finish'
              ? done === 0
                ? 'Жодного підходу не відмічено — тренування не збережеться.'
                : `Збережеться ${done} виконаних підходів. Невідмічені буде прибрано.`
              : 'Усі записані підходи цього тренування буде видалено.'}
          </p>
          <Button
            variant="primary"
            block
            onClick={async () => {
              if (confirm === 'finish') {
                if (await finishWorkout(workout.id!)) onFinished(await nextStepsAfter(workout.id!))
              } else await discardWorkout(workout.id!)
              stopRest()
              setConfirm(null)
            }}
          >
            {confirm === 'finish' ? 'Завершити' : 'Так, скасувати'}
          </Button>
          <Button block onClick={() => setConfirm(null)}>
            Повернутися
          </Button>
        </div>
      </Sheet>
    </>
  )
}

export default function Workout() {
  const active = useActiveWorkout()
  const templates = useTemplates()
  const exercises = useExercises({ includeArchived: true })
  const names = useMemo(() => new Map((exercises ?? []).map((e) => [e.id!, e.name])), [exercises])
  const [summary, setSummary] = useState<NextStep[] | null>(null)
  const summarySheet = <FinishSummary steps={summary} onClose={() => setSummary(null)} />

  if (active === undefined) return <Page title="Тренування" />
  if (active) {
    return (
      <Page title="Тренування">
        <ActiveWorkout workout={active} onFinished={setSummary} />
        {summarySheet}
      </Page>
    )
  }
  return (
    <Page title="Тренування">
      {summarySheet}
      <InbodyReminder />
      {(templates ?? []).map((t) => (
        <div key={t.id} className="tpl-card-wrap">
          <Glass padded interactive as="button" type="button" className="tpl-card tpl-card--editable" onClick={() => startWorkout(t.id)}>
            <div className="lg-row">
              <h2 className="lg-h2" style={{ margin: 0 }}>
                {t.name}
              </h2>
              <div className="lg-spacer" />
              <span className="tpl-start">Почати →</span>
            </div>
            <ul className="tpl-list">
              {t.items.map((i) => (
                <li key={i.exerciseId}>
                  {names.get(i.exerciseId) ?? '…'}{' '}
                  <span className="lg-muted">
                    {i.targetSets}×{i.repMin}–{i.repMax}
                  </span>
                </li>
              ))}
            </ul>
          </Glass>
          <Link to="/settings#templates" className="ex-link tpl-edit">
            Редагувати
          </Link>
        </div>
      ))}
      <Button block onClick={() => startWorkout()}>
        Вільне тренування
      </Button>
      <HistoryList />
    </Page>
  )
}

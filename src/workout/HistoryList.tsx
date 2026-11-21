import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../data/db.ts'
import { Button, Glass } from '../glass'
import { fmtDuration, fmtKg, groupByMonth, summarizeWorkouts, weekday } from './history.ts'
import WorkoutDetail from './WorkoutDetail.tsx'
import './history.css'

const PREVIEW = 10

/** Loads everything the history needs; live-updates on any change. */
function useHistoryData() {
  return useLiveQuery(async () => {
    const [workouts, sets, templates, exercises] = await Promise.all([
      db.workouts.toArray(),
      db.sets.toArray(),
      db.templates.toArray(),
      db.exercises.toArray(),
    ])
    const finished = workouts.filter((w) => w.finishedAt !== undefined)
    const finishedIds = new Set(finished.map((w) => w.id!))
    return {
      workouts: finished,
      sets: sets.filter((s) => finishedIds.has(s.workoutId)),
      templateNames: new Map(templates.map((t) => [t.id!, t.name])),
      exerciseNames: new Map(exercises.map((e) => [e.id!, e.name])),
    }
  }, [])
}

/** Finished workouts grouped by month; tap a row for the details. */
export default function HistoryList() {
  const data = useHistoryData()
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const summaries = useMemo(() => (data ? summarizeWorkouts(data.workouts, data.sets, data.templateNames) : []), [data])
  const groups = useMemo(() => groupByMonth(showAll ? summaries : summaries.slice(0, PREVIEW)), [summaries, showAll])

  if (!data || summaries.length === 0) return null
  return (
    <Glass padded>
      <div className="lg-row hist-head">
        <h2 className="lg-h2">Історія</h2>
        <div className="lg-spacer" />
        <span className="lg-muted hist-total">{summaries.length} трен.</span>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="hist-month" aria-label={g.label}>
          <div className="lg-label hist-month-label">{g.label}</div>
          <div className="scan-list">
            {g.items.map(({ workout: w, name, minutes, doneSets, tonnage }) => (
              <button key={w.id} type="button" className="scan-row hist-row" onClick={() => setOpenId(w.id!)}>
                <span className="hist-date">
                  <span className="hist-day">{Number(w.date.slice(8, 10))}</span>
                  <span className="lg-muted hist-dow">{weekday(w.date)}</span>
                </span>
                <span className="hist-main">
                  <span className="hist-name">{name}</span>
                  <span className="lg-muted hist-meta">
                    {fmtDuration(minutes)} · {doneSets} підх. · {fmtKg(tonnage)}
                  </span>
                </span>
                <span className="hist-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {summaries.length > PREVIEW && (
        <Button block className="hist-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Згорнути' : `Показати всі (${summaries.length})`}
        </Button>
      )}

      <WorkoutDetail
        workoutId={openId}
        onClose={() => setOpenId(null)}
        workouts={data.workouts}
        sets={data.sets}
        templateNames={data.templateNames}
        exerciseNames={data.exerciseNames}
      />
    </Glass>
  )
}

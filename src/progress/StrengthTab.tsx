import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import TrendChart from '../charts/TrendChart.tsx'
import BarChart from '../charts/BarChart.tsx'
import { db } from '../data/db.ts'
import { useExercises, usePersonalRecords } from '../data/hooks.ts'
import { Glass } from '../glass'
import { fmt, fmtDate } from '../lib/format.ts'
import NextSteps from './NextSteps.tsx'
import { e1rmSeries, weeklyVolume } from './strength.ts'

export default function StrengthTab() {
  const data = useLiveQuery(async () => ({ sets: await db.sets.toArray(), workouts: await db.workouts.toArray() }), [])
  const exercises = useExercises({ includeArchived: true })
  const records = usePersonalRecords()
  const names = useMemo(() => new Map((exercises ?? []).map((e) => [e.id!, e.name])), [exercises])
  const [picked, setPicked] = useState<number | null>(null)

  if (!data || !exercises || !records) return null
  if (records.length === 0) {
    return (
      <Glass padded>
        <p className="lg-muted" style={{ margin: 0 }}>
          Тут з'являться графіки сили, коли ти завершиш перше тренування з відміченими підходами.
        </p>
      </Glass>
    )
  }

  const withData = records.map((r) => r.exerciseId)
  const exId = picked !== null && withData.includes(picked) ? picked : withData[0]
  const series = e1rmSeries(exId, data.sets, data.workouts)
  const volume = weeklyVolume(data.sets, data.workouts)

  return (
    <>
      <NextSteps />

      <Glass padded>
        <h2 className="lg-h2">Сила (e1RM)</h2>
        <select className="lg-input ex-select" value={exId} onChange={(e) => setPicked(Number(e.target.value))} aria-label="Вправа">
          {withData.map((id) => (
            <option key={id} value={id}>
              {names.get(id)}
            </option>
          ))}
        </select>
        <TrendChart
          label={`e1RM по тренуваннях: ${names.get(exId) ?? ''}`}
          dates={series.map((p) => p.date)}
          series={[{ label: 'e1RM', values: series.map((p) => p.e1rm), unit: 'кг' }]}
        />
        <p className="lg-muted chart-note">e1RM — розрахункова вага на 1 повтор: вага × (1 + повтори / 30). Береться найкращий підхід за тренування.</p>
      </Glass>

      <Glass padded>
        <h2 className="lg-h2">Об'єм за тиждень</h2>
        <BarChart
          label="Тижневий об'єм тренувань, кг × повтори"
          labels={volume.map((v) => fmtDate(v.week))}
          values={volume.map((v) => v.volume)}
          tip={(i) => ({ title: `Тиждень з ${fmtDate(volume[i].week, 'full')}`, lines: [`${volume[i].volume.toLocaleString('uk-UA')} кг`, `${volume[i].sets} підходів`] })}
        />
        <p className="lg-muted chart-note">Сума вага × повтори за виконаними підходами, з понеділка по неділю.</p>
      </Glass>

      <Glass padded>
        <h2 className="lg-h2">Рекорди</h2>
        <div className="scan-list">
          {[...records]
            .sort((a, b) => (names.get(a.exerciseId) ?? '').localeCompare(names.get(b.exerciseId) ?? '', 'uk'))
            .map((r) => (
              <div key={r.exerciseId} className="scan-row">
                <span>{names.get(r.exerciseId)}</span>
                <span className="lg-muted">
                  <b className="pr-value">{fmt(r.e1rm)}</b> кг · {fmt(r.weight, r.weight % 1 ? 1 : 0)}×{r.reps} · {fmtDate(r.date)}
                </span>
              </div>
            ))}
        </div>
      </Glass>
    </>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import TrendChart from '../charts/TrendChart.tsx'
import Page from '../components/Page.tsx'
import StatCard from '../components/StatCard.tsx'
import GoalSheet from '../components/GoalSheet.tsx'
import WeighInSheet from '../components/WeighInSheet.tsx'
import { db } from '../data/db.ts'
import { weekRange } from '../data/dates.ts'
import { useScans, useSettings, useWeightSeries } from '../data/hooks.ts'
import { AnimatedNumber, Button, Glass } from '../glass'
import { diff, fmt, fmtDate } from '../lib/format.ts'

function useThisWeek() {
  return useLiveQuery(async () => {
    const { from, to } = weekRange()
    const workouts = await db.workouts.where('date').between(from, to, true, true).toArray()
    const ids = workouts.map((w) => w.id!).filter((id) => id !== undefined)
    const sets = ids.length ? await db.sets.where('workoutId').anyOf(ids).filter((s) => s.done).count() : 0
    return { workouts: workouts.filter((w) => w.finishedAt).length, sets }
  }, [])
}

export default function Overview() {
  const settings = useSettings()
  const scans = useScans()
  const series = useWeightSeries()
  const week = useThisWeek()
  const [weighIn, setWeighIn] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)

  const latest = scans?.at(-1)
  const prev = scans && scans.length > 1 ? scans.at(-2) : undefined
  const current = series?.at(-1)
  // Weight change is against the previous weight of any kind (scan or weigh-in), so the
  // card always agrees with the goal card above.
  const prevPoint = series && series.length > 1 ? series.at(-2) : undefined
  const start = series?.[0]
  const goal = settings.goalWeight
  const toGoal = current ? goal - current.weight : null
  const pct =
    current && start && goal !== start.weight
      ? Math.max(0, Math.min(100, ((current.weight - start.weight) / (goal - start.weight)) * 100))
      : current && start ? 100 : 0

  const backupDays = settings.lastBackupAt ? (Date.now() - settings.lastBackupAt) / 86400000 : Infinity
  const scansCount = scans?.length ?? 0

  return (
    <Page title="Огляд">
      {backupDays > 30 && scansCount > 1 && (
        <Glass padded small className="backup-nudge">
          <span>{settings.lastBackupAt ? 'Бекапу не було понад місяць.' : 'Ти ще не робив бекап даних.'}</span>
          <Link to="/settings">Зробити →</Link>
        </Glass>
      )}
      <Glass padded className="goal-card">
        <div className="lg-row">
          <div>
            <button type="button" className="goal-edit" onClick={() => setGoalOpen(true)} aria-label="Змінити ціль">
              <span className="lg-label">Ціль: {fmt(goal)} кг</span>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="goal-now">
              <span className="lg-big">
                <AnimatedNumber value={current?.weight} format={(v) => fmt(v)} />
              </span>{' '}
              <span className="lg-muted">кг</span>
            </div>
          </div>
          <div className="lg-spacer" />
          <Button onClick={() => setWeighIn(true)}>Зважитися</Button>
        </div>
        <div className="goal-bar" aria-hidden="true">
          <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="lg-muted goal-note">
          {current
            ? toGoal !== null && toGoal > 0
              ? `Лишилось ${fmt(toGoal)} кг · пройдено ${Math.round(pct)}% від ${fmt(start?.weight)} кг`
              : 'Ціль досягнуто 🎉'
            : 'Додай перше зважування або замір InBody.'}
        </p>
        {series && series.length > 0 && (
          <TrendChart
            label="Вага по датах"
            height={150}
            dates={series.map((p) => p.date)}
            series={[{ label: 'Вага', values: series.map((p) => p.weight), unit: 'кг' }]}
            goal={{ value: goal, label: 'Ціль' }}
          />
        )}
      </Glass>

      <div className="section-head">
        <h2 className="lg-h2">Склад тіла</h2>
        <span className="lg-muted section-meta">{latest ? `м'язи і жир — InBody ${fmtDate(latest.date, 'full')}` : ''}</span>
      </div>
      {latest ? (
        <div className="lg-grid-2">
          <StatCard
            label="Вага"
            value={current?.weight ?? latest.weight}
            unit="кг"
            delta={diff(current?.weight, prevPoint?.weight)}
            good="up"
            note={current ? `${current.source === 'weighIn' ? 'зважування' : 'InBody'} · ${fmtDate(current.date)}` : undefined}
          />
          <StatCard label="М'язи" value={latest.muscle} unit="кг" delta={diff(latest.muscle, prev?.muscle)} good="up" />
          <StatCard label="Жир" value={latest.pbf} unit="%" delta={diff(latest.pbf, prev?.pbf)} />
          <StatCard label="Жирова маса" value={latest.fatKg} unit="кг" delta={diff(latest.fatKg, prev?.fatKg)} />
          <StatCard label="Базовий обмін" value={latest.bmr} unit="ккал" digits={0} delta={diff(latest.bmr, prev?.bmr)} good="up" />
          <StatCard label="Fitness Score" value={latest.fitnessScore} unit="б." digits={0} delta={diff(latest.fitnessScore, prev?.fitnessScore)} good="up" />
        </div>
      ) : (
        <Glass padded>
          <p className="lg-muted" style={{ margin: 0 }}>
            Ще немає замірів. Сфотографуй чек InBody на вкладці <Link to="/measurements">Заміри</Link>.
          </p>
        </Glass>
      )}

      <h2 className="lg-h2 section-head">Цей тиждень</h2>
      <div className="lg-grid-2">
        <Glass padded>
          <div className="lg-label">Тренувань</div>
          <div className="lg-big" style={{ marginTop: 8 }}>{week?.workouts ?? '—'}</div>
          <div className="lg-muted stat-delta">ціль — 3</div>
        </Glass>
        <Glass padded>
          <div className="lg-label">Підходів</div>
          <div className="lg-big" style={{ marginTop: 8 }}>{week?.sets ?? '—'}</div>
          <div className="lg-muted stat-delta">виконаних</div>
        </Glass>
      </div>

      <WeighInSheet open={weighIn} onClose={() => setWeighIn(false)} />
      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} />
    </Page>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { updateSettings, useSettings } from '../data/hooks.ts'
import { Button, Glass } from '../glass'
import { isTrainingDayPending, monthKey, needsInbodyReminder, nextTemplate } from '../progress/activity.ts'
import { startWorkout } from './actions.ts'
import '../progress/activity.css'

/** «Перше тренування місяця — зважся на InBody». Hidden once there's a scan this month or after «Пізніше». */
export function InbodyReminder() {
  const settings = useSettings()
  const navigate = useNavigate()
  const data = useLiveQuery(async () => ({ workouts: await db.workouts.toArray(), scans: await db.inbodyScans.toArray() }), [])
  const today = toIsoDate()
  if (!data || !needsInbodyReminder(data.workouts, data.scans, today, settings.inbodyReminderDismissed)) return null
  return (
    <Glass padded className="reminder">
      <div className="reminder-row">
        <span className="reminder-icon" aria-hidden="true">
          📋
        </span>
        <div className="reminder-text">
          <b>Перше тренування місяця</b>
          <span className="lg-muted">Зважся на InBody і сфотографуй чек — так буде видно, як змінюються м'язи і жир.</span>
        </div>
      </div>
      <div className="reminder-actions">
        <Button variant="primary" onClick={() => navigate('/measurements')}>
          До замірів
        </Button>
        <Button onClick={() => updateSettings({ inbodyReminderDismissed: monthKey(today) })}>Пізніше</Button>
      </div>
    </Glass>
  )
}

/** On a planned training day with nothing trained yet: «Сьогодні тренування — Full body B». */
export function TrainingTodayReminder() {
  const settings = useSettings()
  const navigate = useNavigate()
  const data = useLiveQuery(async () => ({ workouts: await db.workouts.toArray(), templates: await db.templates.toArray() }), [])
  if (!data) return null
  const active = data.workouts.find((w) => w.finishedAt === undefined)
  if (active) {
    return (
      <Glass padded small className="backup-nudge">
        <span>Тренування триває</span>
        <Link to="/workout">Продовжити →</Link>
      </Glass>
    )
  }
  if (!isTrainingDayPending(settings.trainingDays, data.workouts, toIsoDate())) return null
  const next = nextTemplate(data.templates, data.workouts)
  return (
    <Glass padded small className="backup-nudge">
      <span>
        💪 Сьогодні тренування{next ? <> · <b>{next.name}</b></> : null}
      </span>
      <button
        type="button"
        className="ex-link"
        onClick={async () => {
          await startWorkout(next?.id)
          navigate('/workout')
        }}
      >
        Почати →
      </button>
    </Glass>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import BarChart from '../charts/BarChart.tsx'
import { useWidth } from '../charts/useWidth.ts'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { useSettings, useTemplates } from '../data/hooks.ts'
import type { Workout } from '../data/types.ts'
import { Glass, Segmented } from '../glass'
import { fmtDate } from '../lib/format.ts'
import { durationMinutes, fmtMinutes, heatmap, monthTitle, periodBounds, periodStats, WEEKDAYS, WEEKDAYS_FULL, weekStreak, type PeriodKind } from './activity.ts'
import './activity.css'

const CELL = 14
const GAP = 4
const LABEL_W = 24
const MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру']

function Heatmap({ workouts, names }: { workouts: Workout[]; names: Map<number, string> }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [picked, setPicked] = useState<string | null>(null)
  const today = toIsoDate()
  const weeks = Math.max(8, Math.min(26, Math.floor((width - LABEL_W + GAP) / (CELL + GAP))))
  const cols = heatmap(workouts, today, weeks)
  const top = 16
  const h = top + 7 * (CELL + GAP)
  const pickedWs = picked ? workouts.filter((w) => w.finishedAt && w.date === picked) : []

  return (
    <div ref={ref} className="heat">
      {width > 0 && (
        <svg width={LABEL_W + weeks * (CELL + GAP)} height={h} role="img" aria-label={`Тренування за останні ${weeks} тижнів`}>
          {[0, 2, 4].map((d) => (
            <text key={d} x={0} y={top + d * (CELL + GAP) + CELL / 2} className="svg-tick" dominantBaseline="middle">
              {WEEKDAYS[d]}
            </text>
          ))}
          {cols.map((col, c) => {
            const first = col[0].date
            const month = first.slice(5, 7)
            const changed = c > 0 && month !== cols[c - 1][0].date.slice(5, 7)
            const lastLabel = cols.findLastIndex((cc, i) => i < c && i > 0 && cc[0].date.slice(5, 7) !== cols[i - 1][0].date.slice(5, 7))
            const showMonth = changed && (lastLabel < 0 || c - lastLabel >= 3)
            const x = LABEL_W + c * (CELL + GAP)
            return (
              <g key={first}>
                {showMonth && (
                  <text x={x} y={10} className="svg-tick">
                    {MONTHS_SHORT[+month - 1]}
                  </text>
                )}
                {col.map((d, r) =>
                  d.future ? null : (
                    <rect
                      key={d.date}
                      x={x}
                      y={top + r * (CELL + GAP)}
                      width={CELL}
                      height={CELL}
                      rx={4}
                      className={`heat-cell heat-${Math.min(d.count, 2)}${d.date === today ? ' heat-today' : ''}${d.date === picked ? ' heat-picked' : ''}`}
                      onClick={() => setPicked(d.date === picked ? null : d.date)}
                    >
                      <title>{`${fmtDate(d.date, 'full')}: ${d.count ? `${d.count} трен.` : 'відпочинок'}`}</title>
                    </rect>
                  ),
                )}
              </g>
            )
          })}
        </svg>
      )}
      <p className="lg-muted heat-picked-text">
        {picked
          ? `${fmtDate(picked, 'full')}: ${
              pickedWs.length
                ? pickedWs.map((w) => `${w.templateId !== undefined ? (names.get(w.templateId) ?? 'шаблон') : 'вільне'}${durationMinutes(w) !== null ? `, ${fmtMinutes(durationMinutes(w)!)}` : ''}`).join(' · ')
                : 'відпочинок'
            }`
          : 'Торкнись дня, щоб побачити тренування.'}
      </p>
    </div>
  )
}

function Stats({ workouts }: { workouts: Workout[] }) {
  const [kind, setKind] = useState<PeriodKind>('month')
  const [offset, setOffset] = useState(0)
  const today = toIsoDate()
  const first = workouts.filter((w) => w.finishedAt).map((w) => w.date).sort()[0]
  const { from, to } = periodBounds(kind, today, offset, first)
  const s = periodStats(workouts, from, to)
  const earliestOffset = first ? (+today.slice(0, 4) - +first.slice(0, 4)) * 12 + (+today.slice(5, 7) - +first.slice(5, 7)) : 0

  return (
    <Glass padded>
      <h2 className="lg-h2">Статистика</h2>
      <Segmented
        label="Період"
        value={kind}
        onChange={(k) => {
          setKind(k)
          setOffset(0)
        }}
        options={[
          { value: 'month', label: 'Місяць' },
          { value: '3m', label: '3 міс' },
          { value: 'year', label: 'Рік' },
          { value: 'all', label: 'Усе' },
        ]}
      />
      <div className="act-period">
        {kind === 'month' ? (
          <>
            <button type="button" className="act-arrow" aria-label="Попередній місяць" disabled={offset >= earliestOffset} onClick={() => setOffset(offset + 1)}>
              ‹
            </button>
            <span>{monthTitle(today, offset)}</span>
            <button type="button" className="act-arrow" aria-label="Наступний місяць" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>
              ›
            </button>
          </>
        ) : (
          <span>
            {fmtDate(from, 'full')} – {fmtDate(to, 'full')}
          </span>
        )}
      </div>
      <div className="act-stats">
        <div>
          <span className="lg-label">Тренувань</span>
          <b>{s.count}</b>
          <span className="lg-muted">{s.count ? `${s.perWeek.toFixed(1)} на тиждень` : '—'}</span>
        </div>
        <div>
          <span className="lg-label">Середня тривалість</span>
          <b>{s.avgMinutes !== null ? fmtMinutes(s.avgMinutes) : '—'}</b>
          <span className="lg-muted">{s.totalMinutes ? `разом ${fmtMinutes(s.totalMinutes)}` : '—'}</span>
        </div>
      </div>
      {s.count > 0 ? (
        <>
          <h3 className="act-sub">Дні тижня</h3>
          <BarChart minLabelGap={30} label="Тренування за днями тижня" labels={[...WEEKDAYS]} values={s.byWeekday} height={150} tip={(i) => ({ title: WEEKDAYS_FULL[i], lines: [`${s.byWeekday[i]} трен.`] })} />
          <p className="lg-muted chart-note">
            Найчастіше: <b>{s.topDays.map((d) => WEEKDAYS_FULL[d]).join(', ')}</b>. Тривалість — від «почати» до «завершити»; тренування довші за 4 год не враховуються.
          </p>
        </>
      ) : (
        <p className="lg-muted">За цей період тренувань немає.</p>
      )}
    </Glass>
  )
}

/** Progress → Звички: calendar heatmap, weekly streak and period stats. */
export default function ActivityTab() {
  const workouts = useLiveQuery(() => db.workouts.toArray(), [])
  const templates = useTemplates()
  const settings = useSettings()
  const names = useMemo(() => new Map((templates ?? []).map((t) => [t.id!, t.name])), [templates])
  if (!workouts) return null
  const target = settings.trainingDays?.length || 3
  const streak = weekStreak(workouts, toIsoDate(), target)

  return (
    <>
      <Glass padded>
        <h2 className="lg-h2">Календар</h2>
        <Heatmap workouts={workouts} names={names} />
        <div className="act-streak">
          <span className="act-fire" aria-hidden="true">
            🔥
          </span>
          <div>
            <b>
              {streak.current} {plural(streak.current, 'тиждень', 'тижні', 'тижнів')} поспіль
            </b>
            <span className="lg-muted">
              {' '}
              по {target}+ тренування · рекорд {streak.best}
            </span>
            <div className="lg-muted act-week">
              Цей тиждень: {Math.min(streak.thisWeek, target)}/{target}
              {streak.thisWeek >= target ? ' ✓' : ''}
            </div>
          </div>
        </div>
      </Glass>
      <Stats workouts={workouts} />
    </>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

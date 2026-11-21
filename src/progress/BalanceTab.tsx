import { useState } from 'react'
import RadarChart from '../charts/RadarChart.tsx'
import { addDays, weekRange } from '../data/dates.ts'
import { useSettings, useWeeklyMuscleVolume } from '../data/hooks.ts'
import { muscleGroupLabels } from '../data/seed.ts'
import { MUSCLE_GROUPS } from '../data/types.ts'
import { Glass, Segmented } from '../glass'
import { fmt, fmtDate } from '../lib/format.ts'
import { balanceRows } from './balance.ts'

type Week = 'this' | 'last'

export default function BalanceTab() {
  const settings = useSettings()
  const [week, setWeek] = useState<Week>('this')
  const thisWeek = weekRange()
  const range = week === 'this' ? thisWeek : weekRange(addDays(thisWeek.from, -7))
  const volume = useWeeklyMuscleVolume(range.from, range.to)
  const target = settings.weeklySetTarget

  if (!volume) return null
  const rows = balanceRows(volume, target, MUSCLE_GROUPS)
  const low = rows.filter((r) => r.status === 'low')
  const total = rows.reduce((n, r) => n + r.sets, 0)
  const scaleMax = Math.max(target.max, ...rows.map((r) => r.sets))

  return (
    <>
      <Segmented
        label="Тиждень"
        value={week}
        onChange={setWeek}
        options={[
          { value: 'this', label: 'Цей тиждень' },
          { value: 'last', label: 'Минулий' },
        ]}
      />

      <Glass padded>
        <h2 className="lg-h2">Підходи на групу м'язів</h2>
        <p className="lg-muted bal-sub">
          {fmtDate(range.from, 'full')} – {fmtDate(range.to, 'full')} · ціль {target.min}–{target.max} на групу
        </p>
        {total === 0 ? (
          <p className="lg-muted" style={{ margin: 0 }}>
            За цей тиждень ще немає виконаних підходів.
          </p>
        ) : (
          <>
            <RadarChart
              label="Радар: підходи за тиждень на кожну групу м'язів"
              axes={MUSCLE_GROUPS.map((g) => muscleGroupLabels[g])}
              values={MUSCLE_GROUPS.map((g) => volume[g])}
              reference={target.min}
              max={scaleMax}
            />
            <p className={'bal-verdict ' + (low.length ? 'bal-warn' : 'stat-good')}>
              {low.length
                ? `${week === 'this' ? 'Поки нижче цілі' : 'Було нижче цілі'}: ${low.map((r) => muscleGroupLabels[r.group].toLowerCase()).join(', ')}`
                : 'Усі групи в цільовому діапазоні 💪'}
            </p>
          </>
        )}
      </Glass>

      <Glass padded>
        <div className="bal-list">
          {rows.map((r) => (
            <div key={r.group} className="bal-row">
              <span className="bal-name">{muscleGroupLabels[r.group]}</span>
              <div className="bal-track" aria-hidden="true">
                <div className="bal-band" style={{ left: `${(target.min / scaleMax) * 100}%`, width: `${((target.max - target.min) / scaleMax) * 100}%` }} />
                <div className={'bal-fill bal-' + r.status} style={{ width: `${Math.min(100, (r.sets / scaleMax) * 100)}%` }} />
              </div>
              <span className={'bal-val ' + (r.status === 'low' ? 'bal-warn' : r.status === 'high' ? '' : 'stat-good')}>{fmt(r.sets, r.sets % 1 ? 1 : 0)}</span>
            </div>
          ))}
        </div>
        <p className="lg-muted chart-note">
          Рахуються виконані підходи: основна група вправи +1, допоміжна +0.5. Сіра смуга — цільовий діапазон.
        </p>
      </Glass>
    </>
  )
}

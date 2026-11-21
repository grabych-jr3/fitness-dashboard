import { useState } from 'react'
import TrendChart from '../charts/TrendChart.tsx'
import Page, { Placeholder } from '../components/Page.tsx'
import { useScans, useSettings, useWeightSeries } from '../data/hooks.ts'
import type { InbodyScan, Segments } from '../data/types.ts'
import { Glass, Segmented } from '../glass'
import { diff, fmt, fmtDate, fmtDelta } from '../lib/format.ts'

type Tab = 'body' | 'strength' | 'balance'

const SEGMENTS: { key: keyof Segments; label: string }[] = [
  { key: 'la', label: 'Ліва рука' },
  { key: 'ra', label: 'Права рука' },
  { key: 'tr', label: 'Тулуб' },
  { key: 'll', label: 'Ліва нога' },
  { key: 'rl', label: 'Права нога' },
]

function BodyTab() {
  const settings = useSettings()
  const series = useWeightSeries()
  const scans = useScans()

  if (!series || !scans) return null
  return (
    <>
      <Glass padded>
        <h2 className="lg-h2">Вага</h2>
        {series.length ? (
          <TrendChart
            label="Вага по датах з ціллю"
            dates={series.map((p) => p.date)}
            series={[{ label: 'Вага', values: series.map((p) => p.weight), unit: 'кг' }]}
            goal={{ value: settings.goalWeight, label: 'Ціль' }}
          />
        ) : (
          <p className="lg-muted">Ще немає даних.</p>
        )}
      </Glass>

      <Glass padded>
        <h2 className="lg-h2">М'язи і жир</h2>
        {scans.length ? (
          <TrendChart
            label="Скелетні м'язи і жирова маса за замірами InBody"
            legend
            dualAxis
            dates={scans.map((s) => s.date)}
            series={[
              { label: "М'язи", values: scans.map((s) => s.muscle), unit: 'кг', color: 'accent' },
              { label: 'Жир', values: scans.map((s) => s.fatKg), unit: 'кг', color: 'orange' },
            ]}
          />
        ) : (
          <p className="lg-muted">Ще немає замірів InBody.</p>
        )}
      </Glass>

      {scans.length > 0 && <SegmentsCard latest={scans.at(-1)!} prev={scans.length > 1 ? scans.at(-2) : undefined} />}

      {scans.length > 0 && (
        <Glass padded>
          <h2 className="lg-h2">Історія замірів</h2>
          <div className="scan-list">
            {[...scans].reverse().map((s) => (
              <div key={s.id} className="scan-row">
                <span>{fmtDate(s.date, 'full')}</span>
                <span className="lg-muted">
                  {fmt(s.weight)} кг · м'язи {fmt(s.muscle)} · жир {fmt(s.pbf)}%
                </span>
              </div>
            ))}
          </div>
        </Glass>
      )}
    </>
  )
}

function SegmentsCard({ latest, prev }: { latest: InbodyScan; prev?: InbodyScan }) {
  const max = Math.max(...SEGMENTS.filter((s) => s.key !== 'tr').map((s) => latest.lean[s.key] ?? 0), 1)
  const armGap = diff(latest.lean.la, latest.lean.ra)
  const legGap = diff(latest.lean.ll, latest.lean.rl)

  return (
    <Glass padded>
      <h2 className="lg-h2">Суха маса по сегментах</h2>
      <p className="lg-muted seg-sub">
        {fmtDate(latest.date, 'full')}
        {prev ? ` · зміна від ${fmtDate(prev.date, 'full')}` : ''}
      </p>
      <div className="seg-list">
        {SEGMENTS.map((s) => {
          const v = latest.lean[s.key]
          const d = fmtDelta(diff(v, prev?.lean[s.key]), 2)
          const width = s.key === 'tr' ? 100 : ((v ?? 0) / max) * 100
          return (
            <div key={s.key} className="seg-row">
              <span className="seg-name">{s.label}</span>
              <div className="seg-bar" aria-hidden="true">
                <div className="seg-bar-fill" style={{ width: `${width}%` }} />
              </div>
              <span className="seg-val">{fmt(v, 2)} кг</span>
              <span className={'seg-delta ' + (d && d.startsWith('+') ? 'stat-good' : d && d.startsWith('−') ? 'stat-bad' : '')}>{d ?? ''}</span>
            </div>
          )
        })}
      </div>
      <p className="lg-muted seg-note">
        Різниця ліва − права: руки {fmtDelta(armGap, 2) ?? '—'} кг, ноги {fmtDelta(legGap, 2) ?? '—'} кг.
      </p>
    </Glass>
  )
}

export default function Progress() {
  const [tab, setTab] = useState<Tab>('body')
  return (
    <Page title="Прогрес">
      <Segmented
        label="Розділ"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'body', label: 'Тіло' },
          { value: 'strength', label: 'Сила' },
          { value: 'balance', label: 'Баланс' },
        ]}
      />
      {tab === 'body' && <BodyTab />}
      {tab === 'strength' && <Placeholder stage={6} text="Графіки e1RM по кожній вправі, тижневий об'єм і рекорди." />}
      {tab === 'balance' && <Placeholder stage={7} text="Підходи за тиждень на кожну групу м'язів і що відстає." />}
    </Page>
  )
}

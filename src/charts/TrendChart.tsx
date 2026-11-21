import { Line } from 'react-chartjs-2'
import { fmtDate } from '../lib/format.ts'
import { baseOptions, useChartTheme } from './useChartTheme.ts'

export type Series = { label: string; values: (number | null)[]; color?: 'accent' | 'accent2' | 'pink' | 'orange'; unit?: string }

/**
 * Line chart over dates with optional dashed goal line. Points are joined straight
 * (no smoothing) so the line never suggests values that weren't measured.
 */
export default function TrendChart({
  dates,
  series,
  goal,
  height = 220,
  legend = false,
  label,
  dualAxis = false,
}: {
  dates: string[]
  series: Series[]
  goal?: { value: number; label: string }
  height?: number
  legend?: boolean
  label: string
  /** Second series on its own right-hand axis (e.g. muscle vs fat, different scales). */
  dualAxis?: boolean
}) {
  const t = useChartTheme()
  const opts = baseOptions(t)
  const single = dates.length === 1

  const datasets = series.map((s, i) => {
    const color = t[s.color ?? 'accent']
    return {
      label: s.label,
      data: s.values,
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: 'transparent',
      pointRadius: single ? 6 : 3.5,
      pointHoverRadius: 7,
      borderWidth: 2.5,
      tension: 0,
      spanGaps: true,
      unit: s.unit,
      yAxisID: dualAxis && i === 1 ? 'y2' : 'y',
    }
  })
  if (goal) {
    datasets.push({
      label: goal.label,
      data: dates.map(() => goal.value),
      borderColor: t.muted,
      backgroundColor: t.muted,
      pointBackgroundColor: 'transparent',
      pointBorderColor: 'transparent',
      pointRadius: 0,
      pointHoverRadius: 0,
      borderWidth: 1.5,
      tension: 0,
      spanGaps: true,
      unit: undefined,
      yAxisID: 'y',
      // @ts-expect-error borderDash is a valid line dataset option
      borderDash: [6, 6],
    })
  }

  return (
    <div style={{ height }} role="img" aria-label={label}>
      <Line
        data={{ labels: dates.map((d) => fmtDate(d)), datasets }}
        options={{
          ...opts,
          plugins: {
            ...opts.plugins,
            legend: { ...opts.plugins.legend, display: legend },
            tooltip: {
              ...opts.plugins.tooltip,
              callbacks: {
                title: (items) => (items[0] ? fmtDate(dates[items[0].dataIndex], 'full') : ''),
                label: (item) => {
                  const unit = (item.dataset as { unit?: string }).unit
                  return ` ${item.dataset.label}: ${item.formattedValue}${unit ? ' ' + unit : ''}`
                },
              },
            },
          },
          scales: {
            ...opts.scales,
            y: { ...opts.scales.y, grace: '8%', ticks: { ...opts.scales.y.ticks, color: dualAxis ? t[series[0]?.color ?? 'accent'] : t.muted } },
            ...(dualAxis
              ? { y2: { position: 'right' as const, grace: '8%', grid: { display: false }, border: { display: false }, ticks: { color: t[series[1]?.color ?? 'accent2'], maxTicksLimit: 5 } } }
              : {}),
          },
        }}
      />
    </div>
  )
}

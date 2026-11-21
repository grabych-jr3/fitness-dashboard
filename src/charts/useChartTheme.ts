import { CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip, BarElement, RadialLinearScale, Legend } from 'chart.js'
import { useEffect, useState } from 'react'
import { CHART_DPR } from './useReleaseCanvas.ts'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, RadialLinearScale, Filler, Tooltip, Legend)
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
Chart.defaults.font.size = 12
Chart.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 900, easing: 'easeOutQuart' }

export type ChartTheme = {
  fg: string
  muted: string
  grid: string
  accent: string
  accent2: string
  pink: string
  orange: string
  tooltipBg: string
}

function read(): ChartTheme {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    fg: v('--fg', '#111'),
    muted: v('--muted', '#888'),
    grid: v('--separator', 'rgba(127,127,127,0.15)'),
    accent: v('--accent', '#5856d6'),
    accent2: v('--accent-2', '#30b0c7'),
    pink: '#ff375f',
    orange: '#ff9f0a',
    tooltipBg: v('--glass-tint-strong', 'rgba(255,255,255,0.9)'),
  }
}

/** CSS-variable colours for Chart.js; updates when the theme or system appearance changes. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(read)
  useEffect(() => {
    const update = () => setTheme(read())
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => {
      mo.disconnect()
      mq.removeEventListener('change', update)
    }
  }, [])
  return theme
}

export function baseOptions(t: ChartTheme) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: CHART_DPR,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false, labels: { color: t.fg, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
      tooltip: {
        backgroundColor: t.tooltipBg,
        titleColor: t.fg,
        bodyColor: t.fg,
        borderColor: t.grid,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 12,
        displayColors: true,
        usePointStyle: true,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 16 } },
      y: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, maxTicksLimit: 5 } },
    },
  }
}

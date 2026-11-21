import type { Chart, ChartType } from 'chart.js'
import { useEffect, useRef } from 'react'

/**
 * iOS Safari caps the total memory of all <canvas> elements and frees a removed canvas
 * only on a later garbage collection. Switching tabs a few times created new charts
 * before the old ones were freed, and the new ones then rendered blank. Shrinking the
 * canvas to 0×0 on unmount gives the memory back immediately.
 */
export function useReleaseCanvas<T extends ChartType>() {
  const ref = useRef<Chart<T> | null>(null)
  useEffect(
    () => () => {
      const canvas = ref.current?.canvas
      // after react-chartjs-2 has destroyed the chart
      setTimeout(() => {
        if (canvas) {
          canvas.width = 0
          canvas.height = 0
        }
      }, 0)
    },
    [],
  )
  return ref
}

/** Sharp enough on a 3× iPhone screen at less than half the canvas memory. */
export const CHART_DPR = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)

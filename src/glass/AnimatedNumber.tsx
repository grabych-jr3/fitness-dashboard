import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts smoothly from the previous value to the new one (ease-out, ~0.7 s). */
export default function AnimatedNumber({ value, format }: { value: number | null | undefined; format: (v: number | null | undefined) => string }) {
  const [shown, setShown] = useState<number | null | undefined>(value)
  const from = useRef<number | null | undefined>(null)
  const raf = useRef(0)

  useEffect(() => {
    if (value === null || value === undefined || !Number.isFinite(value) || reduced()) {
      setShown(value)
      from.current = value
      return
    }
    const start = from.current ?? value * 0.92
    if (start === value) {
      setShown(value)
      return
    }
    const t0 = performance.now()
    const dur = 700
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(start + (value - start) * eased)
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else from.current = value
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf.current)
      from.current = value
    }
  }, [value])

  return <>{format(shown)}</>
}

import { useEffect, useState, useSyncExternalStore } from 'react'

/** Rest timer shared across tabs; the end time survives reloads (localStorage). */
const KEY = 'fd-rest-end'
let endAt: number | null = load()
const listeners = new Set<() => void>()

function load(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v > Date.now() ? v : null
  } catch {
    return null
  }
}

function emit() {
  try {
    if (endAt) localStorage.setItem(KEY, String(endAt))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function startRest(seconds: number) {
  endAt = Date.now() + seconds * 1000
  emit()
}

export function addRest(seconds: number) {
  if (endAt) {
    endAt += seconds * 1000
    emit()
  }
}

export function stopRest() {
  endAt = null
  emit()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Seconds left (null when no timer), re-rendering every second. */
export function useRestLeft(): number | null {
  const end = useSyncExternalStore(subscribe, () => endAt)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!end) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [end])
  if (!end) return null
  return Math.max(0, Math.ceil((end - now) / 1000))
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

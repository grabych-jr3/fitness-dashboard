import { useEffect, useRef } from 'react'
import { Glass } from '../glass'
import { addRest, fmtClock, stopRest, useRestLeft } from './restTimer.ts'

/** Floating pill above the tab bar while resting between sets. */
export default function RestTimer() {
  const left = useRestLeft()
  const buzzed = useRef(false)

  useEffect(() => {
    if (left === null) {
      buzzed.current = false
      return
    }
    if (left === 0 && !buzzed.current) {
      buzzed.current = true
      navigator.vibrate?.([200, 100, 200])
      const t = setTimeout(stopRest, 4000)
      return () => clearTimeout(t)
    }
  }, [left])

  if (left === null) return null
  const done = left === 0
  return (
    <Glass strong className={'rest-pill' + (done ? ' rest-pill--done' : '')} role="timer" aria-live="polite">
      <span className="rest-label">{done ? 'Час для підходу!' : 'Відпочинок'}</span>
      {!done && <span className="rest-time">{fmtClock(left)}</span>}
      {!done && (
        <button type="button" className="rest-btn" onClick={() => addRest(30)}>
          +30с
        </button>
      )}
      <button type="button" className="rest-btn" onClick={stopRest} aria-label="Закрити таймер">
        ✕
      </button>
    </Glass>
  )
}

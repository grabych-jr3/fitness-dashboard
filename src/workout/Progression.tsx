import { useState } from 'react'
import { ACTION_LABEL, fmtSession, PLATEAU_TIPS, type Recommendation } from '../progress/progression.ts'
import './progression.css'

const kg = (w: number) => (w % 1 ? String(w) : w.toFixed(0))

/** "62.5 кг × 8" or "60 кг × 12/12/10"; bodyweight exercises show reps only. */
export function targetText(r: Recommendation): string {
  const reps = r.reps.every((x) => x === r.reps[0]) ? String(r.reps[0]) : r.reps.join('/')
  return r.weight > 0 ? `${kg(r.weight)} кг × ${reps}` : `${reps} повт.`
}

export function ProgressBadges({ rec }: { rec: Recommendation }) {
  return (
    <span className="prog-badges">
      <span className={`prog-badge prog-badge--${rec.action}`}>{ACTION_LABEL[rec.action]}</span>
      {rec.plateau && <span className="prog-badge prog-badge--plateau">плато</span>}
    </span>
  )
}

export function PlateauTips() {
  return (
    <ol className="prog-tips">
      {PLATEAU_TIPS.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  )
}

/** Target for today inside an exercise card of the active workout. */
export function TodayTarget({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false)
  if (rec.action === 'first') return <p className="lg-muted ex-hint">{rec.reason}</p>
  return (
    <div className="prog-today">
      <button type="button" className="prog-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ProgressBadges rec={rec} />
        <span className="prog-target">🎯 {targetText(rec)}</span>
        <span className="prog-more" aria-hidden="true">
          {open ? '▴' : 'ⓘ'}
        </span>
      </button>
      <p className="lg-muted prog-last">Минулого разу: {rec.last ? fmtSession(rec.last) : '—'}</p>
      {open && (
        <div className="prog-detail">
          <p>{rec.reason}</p>
          {rec.plateau && (
            <>
              <p>
                <b>Плато:</b> 3 тренування поспіль на цій вазі без жодного повтору більше. Що спробувати:
              </p>
              <PlateauTips />
            </>
          )}
        </div>
      )}
    </div>
  )
}

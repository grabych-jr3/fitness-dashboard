import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { allNextSteps } from '../data/queries.ts'
import { Glass } from '../glass'
import { fmtSession } from './progression.ts'
import { PlateauTips, ProgressBadges, targetText } from '../workout/Progression.tsx'

/** Progress → Сила: what to do next time in every exercise; plateaus first. */
export default function NextSteps() {
  const steps = useLiveQuery(allNextSteps, [])
  const [open, setOpen] = useState<number | null>(null)
  if (!steps || steps.length === 0) return null
  const plateaus = steps.filter((s) => s.rec.plateau).length
  return (
    <Glass padded>
      <h2 className="lg-h2">Наступного разу</h2>
      <p className="lg-muted chart-note" style={{ marginTop: -4, marginBottom: 6 }}>
        {plateaus > 0 ? `${plateaus} ${plateaus === 1 ? 'вправа' : 'вправи'} на плато — торкнись, щоб побачити поради.` : 'Подвійна прогресія: спершу повтори до верхньої межі, потім вага.'}
      </p>
      <div>
        {steps.map((s) => (
          <div key={s.exerciseId} className="prog-row">
            <button type="button" className="prog-row-top" aria-expanded={open === s.exerciseId} onClick={() => setOpen(open === s.exerciseId ? null : s.exerciseId)}>
              <span className="prog-row-name">{s.name}</span>
              <ProgressBadges rec={s.rec} />
            </button>
            <span className="prog-row-sub">
              🎯 {targetText(s.rec)}
              {s.rec.last && ` · було ${fmtSession(s.rec.last)}`}
            </span>
            {open === s.exerciseId && (
              <div className="prog-detail">
                <p>{s.rec.reason}</p>
                {s.rec.plateau && (
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
        ))}
      </div>
    </Glass>
  )
}

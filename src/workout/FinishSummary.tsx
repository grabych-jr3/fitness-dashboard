import type { NextStep } from '../data/queries.ts'
import { Button, Sheet } from '../glass'
import { ProgressBadges, targetText } from './Progression.tsx'

/** Shown after «Завершити»: what to do with every exercise next time. */
export default function FinishSummary({ steps, onClose }: { steps: NextStep[] | null; onClose: () => void }) {
  const up = steps?.filter((s) => s.rec.action === 'up-weight').length ?? 0
  return (
    <Sheet open={steps !== null} onClose={onClose} title="Тренування збережено 💪">
      <div className="lg-stack">
        {steps && steps.length > 0 && (
          <>
            <p className="lg-muted" style={{ margin: 0, textAlign: 'center' }}>
              {up > 0 ? `Наступного разу додаєш вагу в ${up} ${up === 1 ? 'вправі' : 'вправах'}.` : 'Наступного разу — ціль по кожній вправі:'}
            </p>
            <div>
              {steps.map((s) => (
                <div key={s.exerciseId} className="prog-row">
                  <div className="prog-row-top">
                    <span className="prog-row-name">{s.name}</span>
                    <ProgressBadges rec={s.rec} />
                  </div>
                  <span className="prog-row-sub">🎯 {targetText(s.rec)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <Button variant="primary" block onClick={onClose}>
          Готово
        </Button>
      </div>
    </Sheet>
  )
}

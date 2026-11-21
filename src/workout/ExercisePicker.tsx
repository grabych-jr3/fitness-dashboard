import { useMemo, useState } from 'react'
import { useExercises } from '../data/hooks.ts'
import { muscleGroupLabels } from '../data/seed.ts'
import { Sheet } from '../glass'

export default function ExercisePicker({
  open,
  onClose,
  onPick,
  exclude = [],
}: {
  open: boolean
  onClose: () => void
  onPick: (exerciseId: number) => void
  exclude?: number[]
}) {
  const exercises = useExercises()
  const [q, setQ] = useState('')
  const list = useMemo(
    () => (exercises ?? []).filter((e) => !exclude.includes(e.id!) && e.name.toLowerCase().includes(q.trim().toLowerCase())),
    [exercises, exclude, q],
  )

  return (
    <Sheet open={open} onClose={onClose} title="Додати вправу">
      <input className="lg-input picker-search" placeholder="Пошук" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="picker-list">
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            className="picker-item"
            onClick={() => {
              onPick(e.id!)
              setQ('')
              onClose()
            }}
          >
            <span>{e.name}</span>
            <span className="lg-muted picker-groups">{e.primary.map((g) => muscleGroupLabels[g]).join(', ')}</span>
          </button>
        ))}
        {list.length === 0 && <p className="lg-muted">Нічого не знайдено.</p>}
      </div>
    </Sheet>
  )
}

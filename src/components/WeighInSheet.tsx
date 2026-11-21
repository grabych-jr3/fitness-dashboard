import { useState, type FormEvent } from 'react'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { Button, Sheet } from '../glass'

/** Quick body-weight entry between InBody scans. One entry per date: a new one replaces the old. */
export default function WeighInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(toIsoDate())
  const [weight, setWeight] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const w = Number(weight.replace(',', '.'))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Вкажи дату.')
    if (!Number.isFinite(w) || w < 30 || w > 250) return setError('Вага має бути від 30 до 250 кг.')
    try {
      await db.transaction('rw', db.weighIns, async () => {
        await db.weighIns.where('date').equals(date).delete()
        await db.weighIns.add({ date, weight: Math.round(w * 10) / 10 })
      })
      setWeight('')
      setError(null)
      onClose()
    } catch {
      setError('Не вдалося зберегти.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Зважування">
      <form className="lg-stack" onSubmit={submit}>
        <div className="lg-grid-2">
          <label className="lg-field">
            Дата
            <input className="lg-input" type="date" value={date} max={toIsoDate()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="lg-field">
            Вага, кг
            <input
              className="lg-input"
              inputMode="decimal"
              placeholder="77.4"
              autoFocus
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <Button variant="primary" block type="submit">
          Зберегти
        </Button>
      </form>
    </Sheet>
  )
}

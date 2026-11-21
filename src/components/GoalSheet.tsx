import { useEffect, useState } from 'react'
import { updateSettings, useSettings } from '../data/hooks.ts'
import { Button, Sheet } from '../glass'

/** Lets the user set their own target body weight. */
export default function GoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings()
  const [text, setText] = useState(String(settings.goalWeight))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setText(String(settings.goalWeight))
      setError(null)
    }
  }, [open, settings.goalWeight])

  const save = async () => {
    const v = Number(text.replace(',', '.'))
    if (!Number.isFinite(v) || v < 30 || v > 250) return setError('Вкажи вагу від 30 до 250 кг.')
    await updateSettings({ goalWeight: Math.round(v * 10) / 10 })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Моя ціль">
      <div className="lg-stack">
        <label className="lg-field">
          Цільова вага, кг
          <input className="lg-input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <Button variant="primary" block onClick={save}>
          Зберегти
        </Button>
      </div>
    </Sheet>
  )
}

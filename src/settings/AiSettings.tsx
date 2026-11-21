import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { updateSettings, useSettings } from '../data/hooks.ts'
import { Button, Glass } from '../glass'
import { checkGeminiKey, DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from '../ocr/gemini.ts'

/** Gemini key + model for receipt recognition. The key is stored only on this device. */
export default function AiSettings() {
  const settings = useSettings()
  const [key, setKey] = useState(settings.aiKey ?? '')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setKey(settings.aiKey ?? ''), [settings.aiKey])
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#ai') document.getElementById('ai')?.scrollIntoView({ block: 'start' })
  }, [hash])

  const save = async () => {
    const k = key.trim()
    if (!k) return setStatus({ ok: false, text: 'Встав ключ.' })
    setBusy(true)
    setStatus(null)
    const res = await checkGeminiKey(k)
    setBusy(false)
    if (!res.ok) return setStatus({ ok: false, text: res.message })
    await updateSettings({ aiKey: k, aiModel: settings.aiModel ?? DEFAULT_GEMINI_MODEL })
    setStatus({ ok: true, text: 'Ключ працює і збережений на цьому телефоні.' })
  }

  const remove = async () => {
    await updateSettings({ aiKey: undefined })
    setKey('')
    setStatus({ ok: true, text: 'Ключ видалено. Чеки читатиме звичайне розпізнавання.' })
  }

  return (
    <Glass padded id="ai">
      <h2 className="lg-h2">Розпізнавання чека (Gemini)</h2>
      <p className="lg-muted set-text">
        З ключем Google Gemini фото чека читає ШІ — набагато точніше за звичайне розпізнавання. Безкоштовний ключ:{' '}
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
          aistudio.google.com
        </a>{' '}
        → «Create API key». Ключ зберігається тільки на цьому телефоні й не потрапляє в бекап. На безкоштовному тарифі Google може
        використовувати надіслані фото для покращення своїх моделей.
      </p>
      <div className="lg-stack">
        <label className="lg-field">
          Ключ API
          <div className="lg-row">
            <input
              className="lg-input"
              style={{ flex: 1 }}
              type={show ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="AIza…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="button" className="ex-link ex-link--muted" onClick={() => setShow(!show)}>
              {show ? 'Сховати' : 'Показати'}
            </button>
          </div>
        </label>
        <label className="lg-field">
          Модель
          <select className="lg-input" value={settings.aiModel ?? DEFAULT_GEMINI_MODEL} onChange={(e) => updateSettings({ aiModel: e.target.value })}>
            {GEMINI_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
                {m === DEFAULT_GEMINI_MODEL ? ' (рекомендовано)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="lg-grid-2">
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? 'Перевіряю…' : 'Зберегти'}
          </Button>
          <Button disabled={!settings.aiKey} onClick={remove}>
            Видалити ключ
          </Button>
        </div>
        {status && <p className={status.ok ? 'set-ok' : 'form-error'}>{status.text}</p>}
        {!status && settings.aiKey && <p className="set-ok">Gemini підключено ✓</p>}
      </div>
    </Glass>
  )
}

import { useEffect, useRef, useState } from 'react'
import Page from '../components/Page.tsx'
import { BackupValidationError, backupFileName, exportAllAsBlob, importAll, readBackupFile } from '../data/backup.ts'
import { updateSettings, useSettings } from '../data/hooks.ts'
import { Button, Glass, Segmented, Sheet, useTheme, type ThemeMode } from '../glass'
import { fmtDate } from '../lib/format.ts'
import ExerciseEditor from '../settings/ExerciseEditor.tsx'
import TemplatesEditor from '../settings/TemplatesEditor.tsx'

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Системна' },
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
]

/** Number field that saves on blur when the value is valid. */
function NumberSetting({ label, value, min, max, step = 1, unit, onSave }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <label className="lg-field">
      {label}
      <div className="lg-row">
        <input
          className="lg-input"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number(text.replace(',', '.'))
            if (Number.isFinite(v) && v >= min && v <= max) onSave(Math.round(v / step) * step)
            else setText(String(value))
          }}
          style={{ flex: 1 }}
        />
        <span className="lg-muted">{unit}</span>
      </div>
    </label>
  )
}

function Backup() {
  const settings = useSettings()
  const fileInput = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<unknown>(null)

  const doExport = async () => {
    setMsg(null)
    try {
      const blob = await exportAllAsBlob()
      const name = backupFileName()
      const file = new File([blob], name, { type: 'application/json' })
      if (navigator.canShare?.({ files: [file] })) {
        // iPhone: share sheet → "Зберегти у Файли" / iCloud Drive.
        await navigator.share({ files: [file], title: 'Бекап фітнес-дашборду' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
      await updateSettings({ lastBackupAt: Date.now() })
      setMsg({ ok: true, text: 'Бекап збережено.' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setMsg({ ok: false, text: 'Не вдалося зробити бекап.' })
    }
  }

  const onPick = async (file: File | undefined) => {
    if (!file) return
    try {
      setPending(await readBackupFile(file))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BackupValidationError ? e.message : 'Це не схоже на файл бекапу.' })
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const doImport = async () => {
    try {
      await importAll(pending, { mode: 'replace' })
      setMsg({ ok: true, text: 'Дані відновлено з бекапу.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BackupValidationError ? e.message : 'Не вдалося відновити дані.' })
    } finally {
      setPending(null)
    }
  }

  return (
    <Glass padded>
      <h2 className="lg-h2">Бекап</h2>
      <p className="lg-muted set-text">
        Усі дані лежать тільки на цьому телефоні. Якщо видалити застосунок з початкового екрана, вони зникнуть — тож раз на місяць збережи
        бекап у Файли або iCloud Drive.
        {settings.lastBackupAt ? ` Останній бекап: ${fmtDate(new Date(settings.lastBackupAt).toISOString().slice(0, 10), 'full')}.` : ' Бекапу ще не було.'}
      </p>
      <div className="lg-grid-2">
        <Button variant="primary" onClick={doExport}>
          Зберегти
        </Button>
        <Button onClick={() => fileInput.current?.click()}>Відновити</Button>
      </div>
      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => onPick(e.target.files?.[0])} />
      {msg && <p className={msg.ok ? 'set-ok' : 'form-error'}>{msg.text}</p>}
      <Sheet open={pending !== null} onClose={() => setPending(null)} title="Відновити з бекапу?">
        <div className="lg-stack">
          <p className="lg-muted" style={{ margin: 0, textAlign: 'center' }}>
            Поточні дані на телефоні буде повністю замінено даними з файлу.
          </p>
          <Button variant="primary" block onClick={doImport}>
            Відновити
          </Button>
          <Button block onClick={() => setPending(null)}>
            Скасувати
          </Button>
        </div>
      </Sheet>
    </Glass>
  )
}

export default function Settings() {
  const [theme, setTheme] = useTheme()
  const settings = useSettings()

  return (
    <Page title="Налаштування">
      <Glass padded>
        <div className="set-row">
          <span className="lg-label">Тема</span>
          <Segmented label="Тема" options={themeOptions} value={theme} onChange={setTheme} />
        </div>
      </Glass>

      <Glass padded>
        <h2 className="lg-h2">Цілі</h2>
        <div className="lg-stack">
          <NumberSetting label="Цільова вага" value={settings.goalWeight} min={40} max={200} step={0.1} unit="кг" onSave={(goalWeight) => updateSettings({ goalWeight })} />
          <div className="lg-grid-2">
            <NumberSetting
              label="Підходів на групу: від"
              value={settings.weeklySetTarget.min}
              min={1}
              max={settings.weeklySetTarget.max}
              unit=""
              onSave={(min) => updateSettings({ weeklySetTarget: { ...settings.weeklySetTarget, min } })}
            />
            <NumberSetting
              label="до"
              value={settings.weeklySetTarget.max}
              min={settings.weeklySetTarget.min}
              max={60}
              unit=""
              onSave={(max) => updateSettings({ weeklySetTarget: { ...settings.weeklySetTarget, max } })}
            />
          </div>
          <NumberSetting label="Відпочинок між підходами" value={settings.restSeconds} min={15} max={600} step={5} unit="сек" onSave={(restSeconds) => updateSettings({ restSeconds })} />
        </div>
      </Glass>

      <Backup />
      <TemplatesEditor />
      <ExerciseEditor />

      <p className="lg-muted version">Версія {__APP_VERSION__}</p>
    </Page>
  )
}

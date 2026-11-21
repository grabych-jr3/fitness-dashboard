import { useState } from 'react'
import Page from '../components/Page.tsx'
import { Button, Glass, Segmented, Sheet, useTheme, type ThemeMode } from '../glass'

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Системна' },
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
]

export default function Settings() {
  const [theme, setTheme] = useTheme()
  const [sheet, setSheet] = useState(false)

  return (
    <Page title="Налаштування">
      <Glass padded>
        <div className="set-row">
          <span className="lg-label">Тема</span>
          <Segmented label="Тема" options={themeOptions} value={theme} onChange={setTheme} />
        </div>
        <div className="set-row">
          <span className="lg-label">Інше</span>
          <p className="lg-muted" style={{ margin: 0 }}>
            Ціль ваги, вправи й шаблони, експорт та імпорт даних з'являться на етапі 3.
          </p>
          <Button onClick={() => setSheet(true)}>Показати приклад вікна</Button>
        </div>
      </Glass>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Приклад вікна">
        <div className="lg-stack">
          <p className="lg-muted" style={{ margin: 0 }}>
            Так виглядатимуть форми: новий замір, підхід, підтвердження розпізнаних цифр.
          </p>
          <label className="lg-field">
            Вага, кг
            <input className="lg-input" inputMode="decimal" placeholder="77.4" />
          </label>
          <Button variant="primary" block onClick={() => setSheet(false)}>
            Готово
          </Button>
        </div>
      </Sheet>

      <p className="lg-muted version">Версія {__APP_VERSION__}</p>
    </Page>
  )
}

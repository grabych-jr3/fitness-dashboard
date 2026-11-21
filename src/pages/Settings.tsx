import Page, { Placeholder } from '../components/Page.tsx'

export default function Settings() {
  return (
    <Page title="Налаштування">
      <Placeholder stage={3} text="Ціль ваги, тема, вправи і шаблони, експорт та імпорт даних." />
      <p className="muted version">Версія {__APP_VERSION__}</p>
    </Page>
  )
}

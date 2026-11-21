import Page, { Placeholder } from '../components/Page.tsx'

export default function Progress() {
  return (
    <Page title="Прогрес">
      <Placeholder stage={5} text="Графіки ваги, м'язів, жиру, сили (e1RM) і баланс по групах м'язів." />
    </Page>
  )
}

import Page, { Placeholder } from '../components/Page.tsx'

export default function Overview() {
  return (
    <Page title="Огляд">
      <Placeholder stage={5} text="Вага і прогрес до цілі, склад тіла, тренування цього тижня." />
    </Page>
  )
}

import Page, { Placeholder } from '../components/Page.tsx'
import { Glass } from '../glass'

// Static preview of the card style. Real numbers come from the database in stage 5.
const preview = [
  { label: 'Вага', value: '77.4', unit: 'кг' },
  { label: "М'язи", value: '41.4', unit: 'кг' },
  { label: 'Жир', value: '7.2', unit: '%' },
  { label: 'BMR', value: '1921', unit: 'ккал' },
]

export default function Overview() {
  return (
    <Page title="Огляд">
      <div className="lg-grid-2">
        {preview.map((c) => (
          <Glass key={c.label} padded interactive>
            <div className="lg-label">{c.label}</div>
            <div style={{ marginTop: 8 }}>
              <span className="lg-big">{c.value}</span> <span className="lg-muted">{c.unit}</span>
            </div>
          </Glass>
        ))}
      </div>
      <Placeholder stage={5} text="Вага і прогрес до цілі, склад тіла, тренування цього тижня." />
    </Page>
  )
}

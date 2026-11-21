import Glass from './Glass.tsx'

type Option<V extends string> = { value: V; label: string }

/** iOS-style segmented control with a sliding glass thumb. */
export default function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<V>[]
  value: V
  onChange: (v: V) => void
  label: string
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <Glass small className="lg-seg" role="radiogroup" aria-label={label}>
      <span
        className="lg-seg-thumb"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
        aria-hidden="true"
      />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </Glass>
  )
}

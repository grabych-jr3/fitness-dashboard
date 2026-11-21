/* Small stroke icons for the editor buttons (24×24). */

const paths = {
  up: 'M6 14.5 12 8.5l6 6',
  down: 'M6 9.5l6 6 6-6',
  remove: 'M7 7l10 10M17 7 7 17',
  minus: 'M6 12h12',
  plus: 'M12 6v12M6 12h12',
} as const

export type IconName = keyof typeof paths

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

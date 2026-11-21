import { NavLink, useLocation } from 'react-router-dom'
import { Glass } from '../glass'

type Tab = { to: string; label: string; icon: string }

// Simple stroke icons (24×24) so the bar needs no icon library.
const tabs: Tab[] = [
  { to: '/', label: 'Огляд', icon: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h4.5v-6h4v6h4.5V10' },
  { to: '/workout', label: 'Тренування', icon: 'M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11' },
  { to: '/measurements', label: 'Заміри', icon: 'M4 7.5h3.2L9 5h6l1.8 2.5H20V19H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z' },
  { to: '/progress', label: 'Прогрес', icon: 'M4 19.5h16M5.5 15.5l4-4.5 3 3 6-7' },
  { to: '/settings', label: 'Налашт.', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10.07 5.27L10.24 2.97L13.76 2.97L13.93 5.27L15.39 5.88L17.14 4.37L19.63 6.86L18.12 8.61L18.73 10.07L21.03 10.24L21.03 13.76L18.73 13.93L18.12 15.39L19.63 17.14L17.14 19.63L15.39 18.12L13.93 18.73L13.76 21.03L10.24 21.03L10.07 18.73L8.61 18.12L6.86 19.63L4.37 17.14L5.88 15.39L5.27 13.93L2.97 13.76L2.97 10.24L5.27 10.07L5.88 8.61L4.37 6.86L6.86 4.37L8.61 5.88z' },
]

export default function TabBar() {
  const { pathname } = useLocation()
  const active = Math.max(
    0,
    tabs.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname.startsWith(t.to))),
  )

  return (
    <Glass as="nav" refract className="lg-tabbar" aria-label="Навігація">
      <span className="lg-tab-indicator" style={{ transform: `translateX(${active * 100}%)` }} aria-hidden="true" />
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => 'lg-tab' + (isActive ? ' lg-tab-active' : '')}>
          <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
            <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </Glass>
  )
}

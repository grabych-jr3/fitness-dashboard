import { NavLink } from 'react-router-dom'

type Tab = { to: string; label: string; icon: string }

// Simple stroke icons (24×24) so the bar needs no icon library.
const tabs: Tab[] = [
  { to: '/', label: 'Огляд', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/workout', label: 'Тренування', icon: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10' },
  { to: '/measurements', label: 'Заміри', icon: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z' },
  { to: '/progress', label: 'Прогрес', icon: 'M4 19h16M6 15l4-4 3 3 5-6' },
  { to: '/settings', label: 'Налашт.', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7' },
]

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Навігація">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' tab-active' : '')}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

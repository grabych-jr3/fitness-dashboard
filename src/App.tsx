import { useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import TabBar from './components/TabBar.tsx'
import { Background } from './glass'
import Measurements from './pages/Measurements.tsx'
import Overview from './pages/Overview.tsx'
import Progress from './pages/Progress.tsx'
import Settings from './pages/Settings.tsx'
import Workout from './pages/Workout.tsx'
import RestTimer from './workout/RestTimer.tsx'

export default function App() {
  const location = useLocation()
  // The page scrolls inside its own container, so the tab bar never moves with iOS scrolling.
  useLayoutEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 })
  }, [location.pathname])
  return (
    <div className="app">
      <Background />
      <div className="status-blur" aria-hidden="true" />
      <div id="app-scroll" className="app-scroll">
      <main className="app-main">
        <div key={location.pathname} className="page-anim">
        <Routes location={location}>
          <Route path="/" element={<Overview />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/measurements" element={<Measurements />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
      </main>
      </div>
      <RestTimer />
      <TabBar />
    </div>
  )
}

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
  return (
    <div className="app">
      <Background />
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
      <RestTimer />
      <TabBar />
    </div>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import TabBar from './components/TabBar.tsx'
import { Background } from './glass'
import Measurements from './pages/Measurements.tsx'
import Overview from './pages/Overview.tsx'
import Progress from './pages/Progress.tsx'
import Settings from './pages/Settings.tsx'
import Workout from './pages/Workout.tsx'

export default function App() {
  return (
    <div className="app">
      <Background />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/measurements" element={<Measurements />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  )
}

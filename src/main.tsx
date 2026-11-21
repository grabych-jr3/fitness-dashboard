import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { requestPersistentStorage } from './data/backup'
import { seedIfEmpty } from './data/seed'

// Fire-and-forget: live queries re-render once seeding commits; render never waits.
seedIfEmpty().catch((err: unknown) => console.error('Не вдалося заповнити базу', err))
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

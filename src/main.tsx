import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/700.css'
import './index.css'
import App from './App'

// A new version waits for the learner's go-ahead (UpdatePrompt in App), so it never reloads mid-lesson.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => window.dispatchEvent(new CustomEvent('medved:update', { detail: () => updateSW(true) })),
  onOfflineReady: () => window.dispatchEvent(new Event('medved:offline-ready')),
  // installed apps can stay open for days: look for a new version every hour
  onRegisteredSW: (_url, reg) => reg && setInterval(() => void reg.update(), 60 * 60 * 1000),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

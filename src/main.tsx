import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/700.css'
import './index.css'
import App from './App'
import { setOfflineReady, setUpdateReady } from './lib/pwa'
import { primeVoices } from './audio/tts'

// A new version waits for the learner's go-ahead (UpdatePrompt in App), so it never reloads mid-lesson.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => setUpdateReady(() => void updateSW(true)),
  onOfflineReady: setOfflineReady,
  // installed apps can stay open for days: look for a new version every hour (when online; offline it would fail)
  onRegisteredSW: (_url, reg) => reg && setInterval(() => navigator.onLine && reg.update().catch(() => {}), 60 * 60 * 1000),
})

primeVoices()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

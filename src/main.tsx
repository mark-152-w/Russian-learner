import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/700.css'
import './index.css'
import App from './App'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

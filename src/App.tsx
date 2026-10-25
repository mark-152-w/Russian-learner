import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Attributions from './pages/Attributions'

export default function App() {
  return (
    <HashRouter>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
        <header className="flex items-center justify-between border-b border-line py-4">
          <NavLink to="/" className="font-serif text-2xl font-bold text-red">
            Медве́дь
          </NavLink>
          <nav className="text-sm text-ink-soft">
            <NavLink to="/attributions" className="hover:text-red">
              Attributions
            </NavLink>
          </nav>
        </header>
        <main className="flex-1 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/attributions" element={<Attributions />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

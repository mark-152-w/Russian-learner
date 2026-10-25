import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { prefersReducedMotion, useSettings } from './db/settings'
import { setSoundEnabled } from './audio/sound'
import { setHapticsEnabled } from './audio/haptics'
import { onAppOpen } from './rewards/service'
import { levelInfo } from './rewards/levels'
import { dayKey, streakStatus } from './rewards/streak'
import { useProfile } from './hooks/live'
import { JuiceLayer, useJuice } from './components/juice'
import { Ru } from './components/Md'
import { Icon } from './components/ui'
import Home from './pages/Home'

const Practice = lazy(() => import('./pages/Practice'))
const Trophies = lazy(() => import('./pages/Trophies'))
const Settings = lazy(() => import('./pages/Settings'))
const Attributions = lazy(() => import('./pages/Attributions'))

const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/practice/full', label: 'Practice', icon: 'play' },
  { to: '/trophies', label: 'Trophies', icon: 'trophy' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
]

/** Applies theme, skin, motion and audio preferences to the document. */
function Preferences() {
  const s = useSettings()
  const profile = useProfile()
  useEffect(() => {
    const root = document.documentElement
    if (s.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = s.theme
    root.dataset.skin = profile.skin
    const reduce = prefersReducedMotion(s)
    root.dataset.motion = reduce ? 'reduce' : s.reduceMotion === 'off' ? 'full' : ''
    setSoundEnabled(s.sound)
    setHapticsEnabled(s.haptics)
  }, [s, profile.skin])
  return null
}

function AppOpen() {
  const juice = useJuice()
  useEffect(() => {
    void onAppOpen(Date.now()).then((r) => {
      if (r.happyHourStarted) juice.toast({ title: 'Счастли́вый час!', body: 'Double XP for the next 15 minutes.', tone: 'gold' })
    })
  }, [juice])
  return null
}

function Header() {
  const profile = useProfile()
  const li = levelInfo(profile.xp)
  const streak = streakStatus(profile.streak, profile.freezes, dayKey(Date.now()))
  const { pathname } = useLocation()
  const inSession = pathname.startsWith('/practice')
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <NavLink to="/" className="font-serif text-2xl font-bold text-red">
          <Ru>Медве́дь</Ru>
        </NavLink>
        {!inSession && (
          <nav className="hidden gap-5 text-sm sm:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => (isActive ? 'font-bold text-red' : 'text-ink-soft hover:text-red')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3 text-sm font-bold">
          <span className={`flex items-center gap-1 ${streak.status === 'done-today' ? 'text-red' : 'text-ink-soft'}`} title="Streak">
            <Icon name="flame" filled className="h-5 w-5" />
            {streak.shown}
          </span>
          <span className="rounded-full bg-paper-2 px-2 py-0.5" title={`${li.rank.en}, level ${li.level}`}>
            Lv {li.level}
          </span>
        </div>
      </div>
    </header>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/practice')) return null
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Main">
      <div className="grid grid-cols-4">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-red' : 'text-ink-soft'}`}>
            <Icon name={n.icon} className="h-6 w-6" />
            {n.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <JuiceLayer>
        <Preferences />
        <AppOpen />
        <Header />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-4 sm:pb-8">
          <Suspense fallback={<p className="py-12 text-center text-ink-soft">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/practice/:mode" element={<Practice />} />
              <Route path="/trophies" element={<Trophies />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/attributions" element={<Attributions />} />
            </Routes>
          </Suspense>
        </main>
        <BottomNav />
      </JuiceLayer>
    </HashRouter>
  )
}

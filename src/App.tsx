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
const Review = lazy(() => import('./pages/Review'))
const Lab = lazy(() => import('./pages/Lab'))
const Word = lazy(() => import('./pages/Word'))
const Drill = lazy(() => import('./pages/Drill'))
const CoursePage = lazy(() => import('./pages/Course').then((m) => ({ default: m.CoursePage })))
const UnitPage = lazy(() => import('./pages/Course').then((m) => ({ default: m.UnitPage })))
const LessonPage = lazy(() => import('./pages/Course').then((m) => ({ default: m.LessonPage })))
const Placement = lazy(() => import('./pages/Placement'))
const GrammarIndex = lazy(() => import('./pages/Grammar').then((m) => ({ default: m.GrammarIndex })))
const GrammarArticlePage = lazy(() => import('./pages/Grammar').then((m) => ({ default: m.GrammarArticlePage })))
const TrainersHub = lazy(() => import('./pages/Trainers').then((m) => ({ default: m.TrainersHub })))
const TrainerPage = lazy(() => import('./pages/Trainers').then((m) => ({ default: m.TrainerPage })))
const TrainerRun = lazy(() => import('./pages/Trainers').then((m) => ({ default: m.TrainerRun })))
const ReaderPage = lazy(() => import('./pages/Reader').then((m) => ({ default: m.ReaderPage })))
const StoryView = lazy(() => import('./pages/Reader').then((m) => ({ default: m.StoryView })))
const StoryQuiz = lazy(() => import('./pages/Reader').then((m) => ({ default: m.StoryQuiz })))
const ListeningPage = lazy(() => import('./pages/Listening').then((m) => ({ default: m.ListeningPage })))
const ListenRun = lazy(() => import('./pages/Listening').then((m) => ({ default: m.ListenRun })))
const KeyboardPage = lazy(() => import('./pages/Keyboard').then((m) => ({ default: m.KeyboardPage })))
const KeyboardRun = lazy(() => import('./pages/Keyboard').then((m) => ({ default: m.KeyboardRun })))
const Games = lazy(() => import('./pages/Games'))
const Arcade = lazy(() => import('./pages/Arcade'))
const CrosswordHub = lazy(() => import('./pages/Crossword').then((m) => ({ default: m.CrosswordHub })))
const CrosswordGame = lazy(() => import('./pages/Crossword').then((m) => ({ default: m.CrosswordGame })))
const Speed = lazy(() => import('./pages/Speed'))
const Boss = lazy(() => import('./pages/Boss'))
const CardsPage = lazy(() => import('./pages/Cards').then((m) => ({ default: m.CardsPage })))
const CardPage = lazy(() => import('./pages/Cards').then((m) => ({ default: m.CardPage })))
const Town = lazy(() => import('./pages/Town'))
const AdventureHub = lazy(() => import('./pages/Adventure').then((m) => ({ default: m.AdventureHub })))
const AdventurePlay = lazy(() => import('./pages/Adventure').then((m) => ({ default: m.AdventurePlay })))

const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/course', label: 'Course', icon: 'path' },
  { to: '/review', label: 'Review', icon: 'cards' },
  { to: '/reader', label: 'Read', icon: 'book' },
  { to: '/trainers', label: 'Practice', icon: 'target' },
  { to: '/grammar', label: 'Reference', icon: 'table' },
]
const IN_SESSION = ['/practice', '/review', '/drill', '/lesson', '/placement', '/listen/']
/** Full-screen sessions hide the navigation (a trainer's run page is /trainer/:id/:mode). */
const inSessionPath = (p: string) => IN_SESSION.some((x) => p.startsWith(x)) || /^\/trainer\/[^/]+\/[^/]+|\/quiz$|^\/keyboard\/\d|^\/arcade|^\/crossword\/.|^\/speed|^\/boss\/|^\/adventure\/\d/.test(p)

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
  const inSession = inSessionPath(pathname)
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
          <NavLink to="/trophies" className="rounded-full bg-paper-2 px-2 py-0.5 hover:text-red" title={`${li.rank.en}, level ${li.level}: trophies`}>
            Lv {li.level}
          </NavLink>
          <NavLink to="/settings" className="text-ink-soft hover:text-red" aria-label="Settings">
            <Icon name="gear" className="h-5 w-5" />
          </NavLink>
        </div>
      </div>
    </header>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  if (inSessionPath(pathname)) return null
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Main">
      <div className="grid grid-cols-6">
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
              <Route path="/review" element={<Review />} />
              <Route path="/lab" element={<Lab />} />
              <Route path="/word/:id" element={<Word />} />
              <Route path="/drill/:kind/:a/:b?/:c?" element={<Drill />} />
              <Route path="/course" element={<CoursePage />} />
              <Route path="/unit/:id" element={<UnitPage />} />
              <Route path="/lesson/:id/:mode" element={<LessonPage />} />
              <Route path="/placement" element={<Placement />} />
              <Route path="/trainers" element={<TrainersHub />} />
              <Route path="/trainer/:id" element={<TrainerPage />} />
              <Route path="/trainer/:id/:mode" element={<TrainerRun />} />
              <Route path="/reader" element={<ReaderPage />} />
              <Route path="/story/:id" element={<StoryView />} />
              <Route path="/story/:id/quiz" element={<StoryQuiz />} />
              <Route path="/dialogue/:id" element={<StoryView listening />} />
              <Route path="/dialogue/:id/quiz" element={<StoryQuiz listening />} />
              <Route path="/listening" element={<ListeningPage />} />
              <Route path="/listen/:mode" element={<ListenRun />} />
              <Route path="/keyboard" element={<KeyboardPage />} />
              <Route path="/keyboard/:n" element={<KeyboardRun />} />
              <Route path="/games" element={<Games />} />
              <Route path="/arcade" element={<Arcade />} />
              <Route path="/crossword" element={<CrosswordHub />} />
              <Route path="/crossword/:topic" element={<CrosswordGame />} />
              <Route path="/speed" element={<Speed />} />
              <Route path="/boss/:id" element={<Boss />} />
              <Route path="/cards" element={<CardsPage />} />
              <Route path="/card/:id" element={<CardPage />} />
              <Route path="/town" element={<Town />} />
              <Route path="/adventure" element={<AdventureHub />} />
              <Route path="/adventure/:n" element={<AdventurePlay />} />
              <Route path="/grammar" element={<GrammarIndex />} />
              <Route path="/grammar/:id" element={<GrammarArticlePage />} />
            </Routes>
          </Suspense>
        </main>
        <BottomNav />
      </JuiceLayer>
    </HashRouter>
  )
}

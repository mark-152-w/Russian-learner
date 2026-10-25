import { Link } from 'react-router-dom'
import { useSettings } from '../db/settings'
import { useNow, useProfile, useQuests, useStats, useToday } from '../hooks/live'
import { isHappyHour, nextGoal } from '../rewards/goals'
import { levelInfo } from '../rewards/levels'
import { questDef } from '../rewards/quests'
import { activeBoost } from '../rewards/service'
import { dayKey, streakStatus } from '../rewards/streak'
import { Ru } from '../components/Md'
import { Bar, Card, CountUp, Icon } from '../components/ui'

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export default function Home() {
  const now = useNow(1000)
  const profile = useProfile()
  const stats = useStats()
  const today = useToday()
  const quests = useQuests()
  const settings = useSettings()
  const li = levelInfo(profile.xp)
  const streak = streakStatus(profile.streak, profile.freezes, dayKey(now))
  const xpPerCorrect = stats.correct ? Math.max(3, Math.round(profile.xp / stats.correct)) : 8
  const goal = nextGoal({ xp: profile.xp, xpPerCorrect, quests, streak })
  const minutes = (today?.seconds ?? 0) / 60
  const happy = isHappyHour(profile.happyHour, now)
  const boost = activeBoost(profile, now)
  const daily = quests.filter((q) => q.period.startsWith('d:'))
  const weekly = quests.filter((q) => q.period.startsWith('w:'))

  const streakLine = {
    'done-today': 'Done for today. See you tomorrow!',
    'at-risk': 'Practise today to keep it going.',
    protected: 'A streak freeze is covering the missed day(s). Practise today!',
    broken: 'Start a new streak today.',
    none: 'Finish a session to start a streak.',
  }[streak.status]

  return (
    <div className="space-y-4">
      {happy && profile.happyHour && (
        <div className="anim-pop flex items-center justify-between rounded-xl bg-gold px-4 py-3 font-bold text-paper">
          <span>
            <Ru>Счастли́вый час!</Ru> Double XP
          </span>
          <span className="tabular-nums">{mmss(profile.happyHour.until - now)}</span>
        </div>
      )}
      {boost > 1 && !happy && (
        <div className="rounded-xl border-2 border-gold px-4 py-2 text-sm font-bold">
          <Icon name="bolt" filled className="mr-1 inline h-4 w-4 text-gold" />×{boost} XP boost active
        </div>
      )}

      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="font-serif text-2xl">
              <Ru>{li.rank.ru}</Ru>
            </div>
            <div className="text-sm text-ink-soft">
              {li.rank.en} · level {li.level}
            </div>
          </div>
          <div className="text-right font-bold text-red">
            <CountUp value={profile.xp} /> XP
          </div>
        </div>
        <Bar value={li.progress} className="mt-3" />
        <p className="mt-3 font-bold text-red">{goal}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center gap-2">
            <Icon name="flame" filled className={`h-7 w-7 ${streak.status === 'done-today' ? 'text-red' : 'text-ink-soft'}`} />
            <span className="text-2xl font-bold">{streak.shown}</span>
            <span className="text-sm text-ink-soft">day{streak.shown === 1 ? '' : 's'}</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">{streakLine}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
            <Icon name="snow" className="h-3.5 w-3.5" /> {profile.freezes} freeze{profile.freezes === 1 ? '' : 's'} · best {profile.streak.longest}
          </p>
        </Card>
        <Card>
          <div className="text-sm text-ink-soft">Today</div>
          <div className="text-2xl font-bold">
            {Math.floor(minutes)}
            <span className="text-sm font-normal text-ink-soft"> / {settings.dailyGoalMinutes} min</span>
          </div>
          <Bar value={minutes / settings.dailyGoalMinutes} className="mt-2" color="bg-good" />
          <p className="mt-1 text-xs text-ink-soft">
            {today?.correct ?? 0} correct · {today?.xp ?? 0} XP
          </p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/practice/full" className="flex items-center gap-3 rounded-xl bg-red px-5 py-4 text-paper shadow-md transition hover:brightness-110 active:scale-[0.99]">
          <Icon name="play" filled className="h-8 w-8" />
          <span>
            <span className="block text-lg font-bold">Practice session</span>
            <span className="block text-sm opacity-90">20 items · about 10 minutes</span>
          </span>
        </Link>
        <Link to="/practice/quick" className="flex items-center gap-3 rounded-xl border-2 border-red px-5 py-4 text-red transition hover:bg-paper-2 active:scale-[0.99]">
          <Icon name="bolt" filled className="h-8 w-8" />
          <span>
            <span className="block text-lg font-bold">Quick 5 minutes</span>
            <span className="block text-sm text-ink-soft">10 items</span>
          </span>
        </Link>
      </div>

      <Card className="space-y-3">
        <h2 className="font-serif text-xl">Today's quests</h2>
        {[...daily, ...weekly].map((q) => {
          const d = questDef(q.def)
          if (!d) return null
          return (
            <div key={q.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className={q.done ? 'text-ink-soft line-through' : ''}>
                  {d.period === 'weekly' && <span className="mr-1 rounded bg-red px-1.5 text-xs font-bold text-paper">week</span>}
                  {d.text}
                </span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {q.done ? <Icon name="check" className="inline h-4 w-4 text-good" /> : `${Math.floor(q.progress)}/${d.target}`} · +{d.xp}
                </span>
              </div>
              <Bar value={q.progress / d.target} className="mt-1 h-1.5" color={q.done ? 'bg-good' : 'bg-red'} />
            </div>
          )
        })}
      </Card>
    </div>
  )
}

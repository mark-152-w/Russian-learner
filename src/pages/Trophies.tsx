import { FEATURES } from '../features'
import { useNow, useProfile, useStats, useUnlocked } from '../hooks/live'
import { visibleAchievements } from '../rewards/achievements'
import { SKINS } from '../rewards/chest'
import { levelInfo, RANKS, xpForLevel } from '../rewards/levels'
import { activeBoost, saveProfile } from '../rewards/service'
import { Ru } from '../components/Md'
import { Bar, Button, Card, Icon } from '../components/ui'

export default function Trophies() {
  const profile = useProfile()
  const stats = useStats()
  const unlocked = useUnlocked()
  const now = useNow(30000)
  const li = levelInfo(profile.xp)
  const all = visibleAchievements(FEATURES as Set<string>)
  const derived = { ...stats, level: li.level, xp: profile.xp, longestStreak: profile.streak.longest, skins: profile.skins.length }
  const acc = stats.answers ? Math.round((100 * (stats.correct ?? 0)) / stats.answers) : 0
  const boost = activeBoost(profile, now)

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-serif text-xl">Ranks</h2>
        <ol className="mt-2 space-y-1">
          {RANKS.map((r) => {
            const reached = li.level >= r.minLevel
            const current = li.rank === r
            return (
              <li key={r.ru} className={`flex items-center justify-between rounded-lg px-3 py-2 ${current ? 'bg-red text-paper' : reached ? '' : 'text-ink-soft'}`}>
                <span>
                  <Ru className="font-bold">{r.ru}</Ru> · {r.en}
                </span>
                <span className="text-sm">
                  level {r.minLevel} · {xpForLevel(r.minLevel).toLocaleString('en')} XP
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Answers', (stats.answers ?? 0).toLocaleString('en')],
          ['Accuracy', `${acc}%`],
          ['Best combo', stats.bestCombo ?? 0],
          ['Sessions', stats.sessions ?? 0],
        ].map(([k, v]) => (
          <Card key={k as string} className="text-center">
            <div className="text-xl font-bold text-red">{v}</div>
            <div className="text-xs text-ink-soft">{k}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-serif text-xl">Inventory</h2>
        <p className="mt-1 flex items-center gap-2">
          <Icon name="snow" className="h-5 w-5 text-red-soft" /> {profile.freezes} streak freeze{profile.freezes === 1 ? '' : 's'} (max 5; one more every 7-day streak)
        </p>
        {boost > 1 && (
          <p className="mt-1 flex items-center gap-2">
            <Icon name="bolt" filled className="h-5 w-5 text-gold" /> ×{boost} XP boost active
          </p>
        )}
        <h3 className="mt-3 font-bold">Themes</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SKINS.map((s) => {
            const owned = profile.skins.includes(s.id)
            const active = profile.skin === s.id
            return (
              <Button
                key={s.id}
                variant={active ? 'primary' : 'secondary'}
                disabled={!owned}
                onClick={() => saveProfile({ ...profile, skin: s.id })}
                className="text-left text-sm"
              >
                <Ru>{s.ru}</Ru>
                <span className="block text-xs font-normal opacity-80">{owned ? s.en : 'Found in chests'}</span>
              </Button>
            )
          })}
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-xl">
          Achievements <span className="text-base text-ink-soft">{all.filter((a) => unlocked.has(a.id)).length} / {all.length}</span>
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {all.map((a) => {
            const got = unlocked.has(a.id)
            const [cur, target] = a.progress(derived)
            if (a.hidden && !got) {
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-lg border border-dashed border-line p-3 text-ink-soft">
                  <Icon name="lock" className="h-6 w-6" />
                  <span>Hidden achievement</span>
                </li>
              )
            }
            return (
              <li key={a.id} className={`flex items-start gap-3 rounded-lg border p-3 ${got ? 'border-gold bg-paper' : 'border-line'}`}>
                <Icon name="trophy" className={`mt-0.5 h-6 w-6 shrink-0 ${got ? 'text-gold' : 'text-line'}`} />
                <div className="min-w-0 flex-1">
                  <div>
                    <Ru className="font-bold">{a.ru}</Ru> <span className="text-sm text-ink-soft">· {a.en}</span>
                  </div>
                  <div className="text-sm text-ink-soft">
                    {a.desc} +{a.xp} XP
                  </div>
                  {!got && target > 1 && (
                    <div className="mt-1 flex items-center gap-2">
                      <Bar value={cur / target} className="h-1.5 flex-1" />
                      <span className="text-xs tabular-nums text-ink-soft">
                        {Math.floor(cur)}/{target}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

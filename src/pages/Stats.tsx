// Stats: how much you've practised, when, and what's going well or badly. Everything comes from the per-day
// totals and the learner model; nothing here awards anything.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, type Day, type Mastery } from '../db/db'
import { useProfile } from '../hooks/live'
import { loadVocabulary, tagLabel, WEAK_MIN_ATTEMPTS } from '../lib/plan'
import { calendar, caseAccuracy, totals, topErrors, weeklyXp, type CalendarCell } from '../lib/statsData'
import { dayKey } from '../rewards/streak'
import errorsJson from '../data/errors.json'
import { Card } from '../components/ui'

const ERROR_LABEL = new Map(errorsJson.items.map((e) => [e.id, e.label]))
const CASE_EN: Record<string, string> = { nom: 'Nominative', gen: 'Genitive', dat: 'Dative', acc: 'Accusative', ins: 'Instrumental', prep: 'Prepositional' }
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' })
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1]

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <Card className="text-center">
      <div className="text-2xl font-bold tabular-nums text-ink">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </Card>
  )
}

function ActivityCalendar({ cols }: { cols: CalendarCell[][] }) {
  const [hover, setHover] = useState<CalendarCell | null>(null)
  const describe = (c: CalendarCell) => `${fmtDay(c.day)}: ${c.answers ? `${c.answers} answers, ${c.minutes} min` : 'no practice'}`
  return (
    <Card>
      <h2 className="font-serif text-xl">Activity</h2>
      <p className="h-5 text-sm text-ink-soft" aria-live="polite">
        {hover ? describe(hover) : 'Tap or hover a day.'}
      </p>
      <div className="mt-2 flex justify-center gap-[2px] overflow-x-auto" role="group" aria-label={`Practice over the last ${cols.length} weeks`}>
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-[2px]">
            {col.map((c) => (
              <button
                key={c.day}
                type="button"
                disabled={c.future}
                onMouseEnter={() => setHover(c)}
                onFocus={() => setHover(c)}
                onClick={() => setHover(c)}
                aria-label={describe(c)}
                className={`h-3.5 w-3.5 rounded-[3px] ${c.future ? 'opacity-0' : c.level ? 'bg-red' : 'bg-line/60'} ${hover?.day === c.day ? 'ring-2 ring-ink' : ''}`}
                style={c.level ? { opacity: LEVEL_OPACITY[c.level] } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-ink-soft" aria-hidden="true">
        Less
        {LEVEL_OPACITY.map((o, i) => (
          <span key={i} className={`h-3 w-3 rounded-[3px] ${i ? 'bg-red' : 'bg-line/60'}`} style={i ? { opacity: o } : undefined} />
        ))}
        More
      </div>
    </Card>
  )
}

function WeeklyXp({ weeks }: { weeks: { week: string; xp: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...weeks.map((w) => w.xp))
  const H = 120
  const bw = 100 / weeks.length
  const shown = hover ?? weeks.length - 1
  return (
    <Card>
      <h2 className="font-serif text-xl">XP per week</h2>
      <p className="h-5 text-sm text-ink-soft" aria-live="polite">
        Week of {fmtDay(weeks[shown]!.week)}: <b className="text-ink">{weeks[shown]!.xp.toLocaleString('en')} XP</b>
      </p>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="mt-2 h-32 w-full" role="img" aria-label={`XP per week for the last ${weeks.length} weeks`}>
        <line x1="0" x2="100" y1={H - 0.5} y2={H - 0.5} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {weeks.map((w, i) => {
          const h = (w.xp / max) * (H - 6)
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              {w.xp > 0 && <rect x={i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={h} rx="1.5" fill="var(--red)" opacity={i === shown ? 1 : 0.55} />}
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-xs text-ink-soft">
        <span>{fmtDay(weeks[0]!.week)}</span>
        <span>this week</span>
      </div>
    </Card>
  )
}

export default function Stats() {
  const profile = useProfile()
  const [data, setData] = useState<{ days: Day[]; mastery: Mastery[]; words: number } | null>(null)
  useEffect(() => {
    void (async () => {
      const [days, mastery, vocab] = await Promise.all([db.days.toArray(), db.mastery.toArray(), loadVocabulary()])
      setData({ days, mastery, words: vocab.known })
    })()
  }, [])
  if (!data) return <p className="py-12 text-center text-ink-soft">Counting…</p>
  const today = dayKey(Date.now())
  const t = totals(data.days)
  const cases = caseAccuracy(data.mastery)
  const weak = data.mastery
    .filter((m) => m.kind === 'tag' && m.attempts >= WEAK_MIN_ATTEMPTS && m.key !== 'tag:vocab')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
  const errors = topErrors(data.mastery)
  const hours = Math.floor(t.minutes / 60)

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Your stats</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile value={hours ? `${hours} h ${t.minutes % 60} min` : `${t.minutes} min`} label="practised" />
        <Tile value={t.answers.toLocaleString('en')} label="answers" />
        <Tile value={`${Math.round(t.accuracy * 100)}%`} label="accuracy" />
        <Tile value={`${profile.streak.longest}`} label="longest streak (days)" />
        <Tile value={data.words.toLocaleString('en')} label="words known" />
      </div>

      <ActivityCalendar cols={calendar(data.days, today)} />
      <WeeklyXp weeks={weeklyXp(data.days, today)} />

      <Card>
        <h2 className="font-serif text-xl">Accuracy by case</h2>
        <p className="text-sm text-ink-soft">From every noun and adjective form you've answered.</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {cases.map((c) => {
              const acc = c.attempts ? c.correct / c.attempts : 0
              return (
                <tr key={c.case}>
                  <th scope="row" className="w-28 py-1 text-left font-normal">
                    {CASE_EN[c.case]}
                  </th>
                  <td className="py-1">
                    <div className="h-2.5 rounded-full bg-paper">{c.attempts > 0 && <div className="h-full rounded-full bg-red" style={{ width: `${acc * 100}%` }} />}</div>
                  </td>
                  <td className="w-24 py-1 text-right tabular-nums">{c.attempts ? `${Math.round(acc * 100)}% of ${c.attempts}` : 'none yet'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl">Weakest topics</h2>
          {weak.length ? (
            <ul className="mt-2 space-y-1">
              {weak.map((m) => (
                <li key={m.key}>
                  <Link to={`/drill/tag/${m.key.slice(4)}`} className="flex justify-between gap-2 rounded px-1 hover:bg-paper">
                    <span>{tagLabel(m.key.slice(4))}</span>
                    <span className="tabular-nums text-ink-soft">{Math.round(m.score * 100)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Not enough answers yet: a topic shows up here after {WEAK_MIN_ATTEMPTS} of them.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-serif text-xl">Most common mistakes</h2>
          {errors.length ? (
            <ul className="mt-2 space-y-1">
              {errors.map((e) => (
                <li key={e.id} className="flex justify-between gap-2 px-1">
                  <span>{ERROR_LABEL.get(e.id) ?? e.id}</span>
                  <span className="tabular-nums text-ink-soft">{e.count}×</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">No mistakes recorded yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

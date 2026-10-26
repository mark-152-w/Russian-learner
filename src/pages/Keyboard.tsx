// ЙЦУКЕН keyboard trainer: lessons from the home row outwards, an on-screen keyboard that lights up the next key,
// words per minute and accuracy. Each finished line is reported to the reward service like any other item.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ExerciseItem } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { sound } from '../audio/sound'
import { learnerLevel } from '../lib/learner'
import { poolUpTo } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { sentencesUpTo } from '../lib/sentences'
import { CODE_TO_RU, FINGER, LATIN, lessonLines, LESSONS, ROWS, score } from '../engine/keyboard'
import { RewardSession, type SessionEnd } from '../rewards/service'
import { SessionSummary } from '../components/SessionSummary'
import { Bar, Button, Card, Icon } from '../components/ui'

interface KbProgress {
  [lesson: number]: { wpm: number; accuracy: number }
}
const PASS = 0.9
const useKbProgress = () => useLiveQuery(async () => ((await db.kv.get('keyboard'))?.value as KbProgress) ?? {}, [], {} as KbProgress)

const FINGER_COLOR = ['bg-red/15', 'bg-gold/20', 'bg-good/15', 'bg-ink/10', 'bg-ink/10', 'bg-good/15', 'bg-gold/20', 'bg-red/15']

function KeyboardMap({ next, known }: { next?: string; known: Set<string> }) {
  return (
    <div className="mx-auto w-full max-w-xl select-none space-y-1" aria-hidden="true">
      {ROWS.slice(1).map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1" style={{ paddingLeft: `${ri * 0.9}rem` }}>
          {row.map(([ru]) => (
            <div
              key={ru}
              className={`flex h-10 w-[8%] min-w-7 flex-col items-center justify-center rounded border text-sm ${
                ru === next ? 'border-red bg-red text-paper' : known.has(ru) ? `border-line ${FINGER_COLOR[FINGER[ru] ?? 0]}` : 'border-line text-ink-soft opacity-40'
              }`}
            >
              <span className="ru font-bold leading-none">{ru}</span>
              <span className="text-[0.6rem] leading-none opacity-70">{LATIN[ru]}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex justify-center">
        <div className={`h-8 w-1/2 rounded border ${next === ' ' ? 'border-red bg-red' : 'border-line'}`} />
      </div>
    </div>
  )
}

export function KeyboardPage() {
  const progress = useKbProgress()
  const unlocked = (n: number) => n === 1 || (progress[n - 1]?.accuracy ?? 0) >= PASS
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Keyboard</h1>
      <p className="text-ink-soft">
        Learn to touch-type the Russian ЙЦУКЕН layout, a few keys at a time. You can practise before installing the layout: the trainer reads which physical key
        you press. Pass a lesson with {Math.round(PASS * 100)}% accuracy to open the next.
      </p>
      <Card>
        <ol className="space-y-1">
          {LESSONS.map((l) => {
            const p = progress[l.n]
            const open = unlocked(l.n)
            return (
              <li key={l.n}>
                <Link
                  to={open ? `/keyboard/${l.n}` : '#'}
                  aria-disabled={!open}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${open ? 'hover:bg-paper' : 'pointer-events-none opacity-50'}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${p && p.accuracy >= PASS ? 'bg-good text-paper' : 'bg-paper'}`}>
                    {p && p.accuracy >= PASS ? <Icon name="check" className="h-5 w-5" /> : open ? l.n : <Icon name="lock" className="h-4 w-4" />}
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold">{l.title}</span>
                    {l.adds && <span className="ru text-sm text-ink-soft">{[...l.adds].join(' ')}</span>}
                  </span>
                  {p && (
                    <span className="text-right text-xs text-ink-soft">
                      {p.wpm} wpm
                      <br />
                      {Math.round(p.accuracy * 100)}%
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ol>
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-serif text-xl">Adding the Russian layout</h2>
        <p>
          <b>Windows:</b> Settings → Time &amp; language → Language &amp; region → Add a language → Russian. Switch with Win + Space.
        </p>
        <p>
          <b>macOS:</b> System Settings → Keyboard → Text Input → Edit → + → Russian (choose "Russian – PC" for the standard layout). Switch with Ctrl + Space.
        </p>
        <p>
          <b>iPhone / iPad:</b> Settings → General → Keyboard → Keyboards → Add New Keyboard → Russian. Tap the globe key to switch.
        </p>
        <p>
          <b>Android:</b> Gboard settings → Languages → Add keyboard → Russian. Long-press the space bar to switch.
        </p>
        <p className="text-ink-soft">
          Until then, the transliteration option in Settings lets you type Russian answers with Latin letters (kniga → книга) in every exercise.
        </p>
      </Card>
    </div>
  )
}

const asItem = (n: number, line: string): ExerciseItem => ({
  id: `kb:${n}:${line}`,
  type: 'transform',
  level: 'A1',
  tags: ['keyboard'],
  source: 'generated',
  prompt: { instruction: 'Type the line' },
  accept: [line],
})

export function KeyboardRun() {
  const { n: ns = '1' } = useParams()
  const n = Number(ns)
  const nav = useNavigate()
  const [lines, setLines] = useState<string[] | null>(null)
  const [li, setLi] = useState(0)
  const [pos, setPos] = useState(0)
  const [errors, setErrors] = useState(0)
  const [wrong, setWrong] = useState(false)
  const [stats, setStats] = useState({ chars: 0, errors: 0, ms: 0 })
  const [end, setEnd] = useState<SessionEnd | null>(null)
  const [round, setRound] = useState(0)
  const started = useRef<number | null>(null)
  const session = useRef<RewardSession | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    setLines(null)
    setLi(0)
    setPos(0)
    setErrors(0)
    setStats({ chars: 0, errors: 0, ms: 0 })
    setEnd(null)
    session.current = new RewardSession('keyboard', Date.now())
    void learnerLevel().then(async (lv) => {
      const [pool, sents] = await Promise.all([poolUpTo(lv), sentencesUpTo(lv)])
      if (alive) setLines(lessonLines(n, pool, sents, mulberry32(Date.now())))
    })
    return () => {
      alive = false
    }
  }, [n, round])

  const line = lines?.[li] ?? ''
  const next = line[pos]

  const finishLine = async () => {
    const ms = Date.now() - (started.current ?? Date.now())
    started.current = null
    const item = asItem(n, line)
    await session.current!.answer({
      item,
      verdict: { correct: errors === 0, expected: line },
      ms,
      golden: false,
      lexeme: undefined,
      recall: null,
      now: Date.now(),
    })
    const total = { chars: stats.chars + line.length, errors: stats.errors + errors, ms: stats.ms + ms }
    setStats(total)
    setErrors(0)
    setPos(0)
    if (li + 1 >= (lines?.length ?? 0)) {
      const s = score(total.chars, total.ms, total.errors)
      const p = await getKV<KbProgress>('keyboard', {})
      const best = p[n]
      p[n] = { wpm: Math.max(best?.wpm ?? 0, s.wpm), accuracy: Math.max(best?.accuracy ?? 0, s.accuracy) }
      await setKV('keyboard', p)
      const e = await session.current!.finish(Date.now())
      if (e) setEnd(e)
      else nav('/keyboard')
    } else setLi(li + 1)
  }

  const type = (ch: string) => {
    if (!lines || end || !next) return
    if (started.current === null) started.current = Date.now()
    if (ch === next) {
      setWrong(false)
      if (pos + 1 >= line.length) void finishLine()
      else setPos(pos + 1)
    } else {
      setWrong(true)
      setErrors((e) => e + 1)
      sound.wrong()
    }
  }

  useEffect(() => {
    input.current?.focus()
  }, [lines, li])

  if (end) {
    const s = score(stats.chars, stats.ms, stats.errors)
    return (
      <>
        <Card className={`mx-auto mb-4 max-w-xl text-center ${s.accuracy >= PASS ? 'border-good' : 'border-bad'}`}>
          <p className="font-serif text-2xl">
            {s.wpm} words per minute · {Math.round(s.accuracy * 100)}% accurate
          </p>
          <p className="text-sm text-ink-soft">{s.accuracy >= PASS ? 'Lesson passed: the next one is open.' : `You need ${Math.round(PASS * 100)}% to open the next lesson. Accuracy first, speed comes by itself.`}</p>
        </Card>
        <SessionSummary end={end} onDone={() => nav('/keyboard')} onAgain={() => setRound((r) => r + 1)} />
      </>
    )
  }
  if (!lines) return <p className="py-12 text-center text-ink-soft">Preparing the lesson…</p>
  const known = new Set([...LESSONS.filter((l) => l.n <= n).map((l) => l.adds).join('')])
  return (
    <div className="mx-auto max-w-xl space-y-5" onClick={() => input.current?.focus()}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => nav('/keyboard')} className="text-ink-soft hover:text-red" aria-label="End">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <Bar value={li / lines.length} className="flex-1" />
        <span className="text-sm text-ink-soft">
          {li + 1}/{lines.length}
        </span>
      </div>
      <p className="text-center text-sm font-bold uppercase tracking-wide text-ink-soft">{LESSONS[n - 1]?.title}</p>
      <div className={`ru rounded-2xl border-2 bg-paper-2 p-5 text-center text-3xl tracking-wide ${wrong ? 'anim-shake border-bad' : 'border-line'}`} lang="ru">
        <span className="text-good">{line.slice(0, pos)}</span>
        <span className="rounded bg-red/20 underline decoration-red decoration-2 underline-offset-4">{next === ' ' ? '␣' : next}</span>
        <span>{line.slice(pos + 1)}</span>
      </div>
      <input
        ref={input}
        aria-label="Type here"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        lang="ru"
        className="h-1 w-full opacity-0"
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return
          // physical keyboards: read the key position, so a Latin layout still types Cyrillic
          const ru = e.code === 'Space' ? ' ' : CODE_TO_RU[e.code]
          if (ru && !/[а-яё]/i.test(e.key)) { // ru-ignore
            e.preventDefault()
            type(ru)
          } else if (/^[а-яё ]$/i.test(e.key)) { // ru-ignore
            e.preventDefault()
            type(e.key.toLowerCase())
          }
        }}
        onInput={(e) => {
          // on-screen keyboards (phones) insert text instead of reporting keys
          const v = (e.target as HTMLInputElement).value
          ;(e.target as HTMLInputElement).value = ''
          for (const ch of v.toLowerCase()) type(ch)
        }}
      />
      <KeyboardMap next={next} known={known} />
      <p className="text-center text-xs text-ink-soft">Keep your fingers on the home row (ф ы в а · о л д ж). The colours show which finger presses each key.</p>
      <Button variant="ghost" className="mx-auto block" onClick={() => input.current?.focus()}>
        Tap here if typing stops working
      </Button>
    </div>
  )
}

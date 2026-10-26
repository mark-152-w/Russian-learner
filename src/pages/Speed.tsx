// Speed match: tap a Russian word, then its meaning (or the other way round). One minute; wrong pairs cost time.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Lexeme } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { sound } from '../audio/sound'
import { haptic } from '../audio/haptics'
import { grade } from '../engine/grader'
import { gloss } from '../engine/generators'
import { deal, matchPoints, pairItem, PENALTY_SECONDS, refill, ROUND_SECONDS, speedWords, type Board } from '../engine/speed'
import { learnerLevel } from '../lib/learner'
import { poolUpTo } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { RewardSession, bumpStatsExternal, type SessionEnd } from '../rewards/service'
import { SessionSummary } from '../components/SessionSummary'
import { Ru } from '../components/Md'
import { Bar, Button, Card, Icon } from '../components/ui'

interface Best {
  pairs: number
  score: number
}

export default function Speed() {
  const nav = useNavigate()
  const best = useLiveQuery(async () => (await db.kv.get('speed:best'))?.value as Best | undefined, [])
  const [pool, setPool] = useState<Lexeme[] | null>(null)
  const [phase, setPhase] = useState<'intro' | 'play' | 'over'>('intro')
  const [board, setBoard] = useState<Board | null>(null)
  const [sel, setSel] = useState<{ side: 'ru' | 'en'; i: number } | null>(null)
  const [bad, setBad] = useState<{ ru: number; en: number } | null>(null)
  const [left, setLeft] = useState(ROUND_SECONDS)
  const [pairs, setPairs] = useState(0)
  const [score, setScore] = useState(0)
  const [end, setEnd] = useState<SessionEnd | null>(null)
  const queue = useRef<Lexeme[]>([])
  const rng = useRef(mulberry32(Date.now()))
  const session = useRef<RewardSession | null>(null)
  const deadline = useRef(0)
  const lastAt = useRef(0)
  const run = useRef(0)
  // answers are saved in order, and all of them before the session finishes
  const pending = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    void learnerLevel().then(async (lv) => setPool((await poolUpTo(lv)).filter((x) => x.pos !== 'other' || x.en.length > 0)))
  }, [])

  const start = () => {
    if (!pool) return
    queue.current = speedWords(pool, rng.current)
    setBoard(deal(queue.current, rng.current))
    session.current = new RewardSession('speed', Date.now())
    deadline.current = performance.now() + ROUND_SECONDS * 1000
    lastAt.current = performance.now()
    run.current = 0
    setPairs(0)
    setScore(0)
    setSel(null)
    setEnd(null)
    setLeft(ROUND_SECONDS)
    setPhase('play')
  }

  // the clock
  useEffect(() => {
    if (phase !== 'play') return
    const t = setInterval(() => {
      const s = Math.max(0, (deadline.current - performance.now()) / 1000)
      setLeft(s)
      if (s <= 0) {
        clearInterval(t)
        setPhase('over')
      }
    }, 100)
    return () => clearInterval(t)
  }, [phase])

  // round over: personal best, stats, summary
  useEffect(() => {
    if (phase !== 'over' || !session.current) return
    const s = session.current
    session.current = null
    void (async () => {
      const prev = await getKV<Best | null>('speed:best', null)
      if (!prev || score > prev.score) await setKV('speed:best', { pairs, score })
      await pending.current
      await bumpStatsExternal({ speedRounds: 1 }, { speedBest: pairs })
      const e = await s.finish(Date.now())
      if (e) setEnd(e)
      else setPhase('intro')
    })()
  }, [phase, pairs, score])

  const attempt = (ruIdx: number, enIdx: number) => {
    if (!board) return
    const lx = board.ru[ruIdx]
    const chosen = board.en[enIdx]
    if (!lx || !chosen) return
    const item = pairItem(lx, board)
    const v = grade(item, { kind: 'choice', value: gloss(chosen) }, {})
    const now = performance.now()
    const s = session.current
    const input = { item, verdict: v, ms: now - lastAt.current, golden: false, lexeme: undefined, recall: null, now: Date.now() }
    pending.current = pending.current.then(() => s?.answer(input))
    lastAt.current = now
    setSel(null)
    if (v.correct) {
      run.current++
      sound.correct(Math.min(run.current, 12))
      haptic.tick()
      setPairs((p) => p + 1)
      setScore((s) => s + matchPoints(run.current - 1))
      setBoard(refill(board, ruIdx, enIdx, queue.current, rng.current))
    } else {
      run.current = 0
      sound.wrong()
      haptic.wrong()
      deadline.current -= PENALTY_SECONDS * 1000
      setBad({ ru: ruIdx, en: enIdx })
      setTimeout(() => setBad(null), 450)
    }
  }

  const tap = (side: 'ru' | 'en', i: number) => {
    if (!sel || sel.side === side) return setSel(sel?.side === side && sel.i === i ? null : { side, i })
    if (side === 'en') attempt(sel.i, i)
    else attempt(i, sel.i)
  }

  if (end) return <SessionSummary end={end} onDone={() => nav('/games')} onAgain={start} />
  if (phase !== 'play' || !board)
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="space-y-3">
          <h1 className="font-serif text-3xl">Speed match</h1>
          <p>
            Tap a Russian word, then its meaning. {ROUND_SECONDS} seconds; every match brings a new word, runs of matches score more, and a wrong pair costs {PENALTY_SECONDS}{' '}
            seconds. Words come from your level.
          </p>
          {phase === 'over' && <p className="text-ink-soft">Counting up…</p>}
          {best && (
            <p className="text-sm text-red">
              Your best: {best.score} points ({best.pairs} pairs)
            </p>
          )}
          <Button className="w-full" disabled={!pool || phase === 'over'} onClick={start}>
            {pool ? 'Start' : 'Loading words…'}
          </Button>
        </Card>
      </div>
    )

  const cell = (side: 'ru' | 'en', i: number, lx: Lexeme | null) => {
    const active = sel?.side === side && sel.i === i
    const wrong = bad && bad[side] === i
    return (
      <button
        key={`${side}${i}:${lx?.id ?? ''}`}
        type="button"
        disabled={!lx}
        onClick={() => tap(side, i)}
        className={`anim-pop min-h-14 rounded-lg border-2 px-2 text-center ${side === 'ru' ? 'ru text-xl' : 'text-sm'} ${
          !lx ? 'border-transparent' : wrong ? 'anim-shake border-bad bg-bad/10' : active ? 'border-red bg-red/10' : 'border-line bg-paper hover:border-red'
        }`}
        lang={side === 'ru' ? 'ru' : undefined}
      >
        {lx && (side === 'ru' ? <Ru>{lx.lemma}</Ru> : gloss(lx))}
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setPhase('over')} className="text-ink-soft hover:text-red" aria-label="End round">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <Bar value={left / ROUND_SECONDS} className="flex-1" color={left < 10 ? 'bg-bad' : undefined} />
        <span className="w-10 text-right font-bold tabular-nums">{Math.ceil(left)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>
          <b className="text-red">{score}</b> points
        </span>
        <span className="text-ink-soft">{pairs} pairs</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">{board.ru.map((lx, i) => cell('ru', i, lx))}</div>
        <div className="grid gap-2">{board.en.map((lx, i) => cell('en', i, lx))}</div>
      </div>
    </div>
  )
}

// Case arcade: the card falls; pick the right form before it lands. Three lives, waves of eight cards, faster
// each wave. Answers go through the grader and the reward service; the best runs are kept as personal bests.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Lexeme } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { useSettings, prefersReducedMotion } from '../db/settings'
import { sound } from '../audio/sound'
import { haptic } from '../audio/haptics'
import { grade } from '../engine/grader'
import { arcadeCard, arcadePools, CARDS_PER_WAVE, fallSeconds, WAVES, type ArcadeCard } from '../engine/arcade'
import { NUMERAL_LEXEMES } from '../engine/trainers'
import { learnerLevel } from '../lib/learner'
import { loadLexemes, poolUpTo } from '../lib/lexicon'
import { mulberry32, type Rng } from '../lib/rng'
import { RewardSession, bumpStatsExternal, type SessionEnd } from '../rewards/service'
import { SessionSummary } from '../components/SessionSummary'
import { Md, Ru } from '../components/Md'
import { Button, Card, Icon } from '../components/ui'

interface Run {
  score: number
  wave: number
  ts: number
}
const useRuns = () => useLiveQuery(async () => ((await db.kv.get('arcade:runs'))?.value as Run[]) ?? [], [], [] as Run[])
const LIVES = 3

interface Pools {
  nouns: Lexeme[]
  adjectives: Lexeme[]
  numberNouns: Lexeme[]
  lexemes: Map<string, Lexeme>
}

export default function Arcade() {
  const nav = useNavigate()
  const runs = useRuns()
  const settings = useSettings()
  const [pools, setPools] = useState<Pools | null>(null)
  const [phase, setPhase] = useState<'intro' | 'play' | 'over'>('intro')
  const [card, setCard] = useState<ArcadeCard | null>(null)
  const [wave, setWave] = useState(1)
  const [count, setCount] = useState(0)
  const [lives, setLives] = useState(LIVES)
  const [score, setScore] = useState(0)
  const [progress, setProgress] = useState(0)
  const [flash, setFlash] = useState<{ ok: boolean; reason?: string; answer: string } | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [end, setEnd] = useState<SessionEnd | null>(null)
  const session = useRef<RewardSession | null>(null)
  const rng = useRef<Rng>(mulberry32(Date.now()))
  const shownAt = useRef(0)
  const progressRef = useRef(0)
  const raf = useRef(0)
  const still = prefersReducedMotion(settings)

  useEffect(() => {
    void learnerLevel().then(async (lv) => {
      const pool = await poolUpTo(lv)
      const nums = await loadLexemes(NUMERAL_LEXEMES)
      const { nouns, adjectives } = arcadePools(pool)
      const numberNouns = [...nums.values()].filter((x) => x.pos === 'noun')
      setPools({ nouns, adjectives, numberNouns, lexemes: new Map([...pool.map((x) => [x.id, x] as const), ...nums]) })
    })
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const draw = useCallback(
    (w: number) => {
      if (!pools) return
      for (let i = 0; i < 30; i++) {
        const c = arcadeCard(w, pools.nouns, pools.adjectives, pools.numberNouns, rng.current)
        if (c) {
          setCard(c)
          setProgress(0)
          shownAt.current = performance.now()
          return
        }
      }
    },
    [pools],
  )

  const start = () => {
    session.current = new RewardSession('arcade', Date.now())
    setWave(1)
    setCount(0)
    setLives(LIVES)
    setScore(0)
    setEnd(null)
    setPhase('play')
    setBanner(WAVES[0]!.title)
    setTimeout(() => setBanner(null), 1400)
    draw(1)
  }

  const finish = useCallback(
    async (finalScore: number, finalWave: number) => {
      cancelAnimationFrame(raf.current)
      setPhase('over')
      const list = [...(await getKV<Run[]>('arcade:runs', [])), { score: finalScore, wave: finalWave, ts: Date.now() }].sort((a, b) => b.score - a.score).slice(0, 10)
      await setKV('arcade:runs', list)
      await bumpStatsExternal({ arcadeRuns: 1 }, { arcadeBest: finalScore })
      const e = await session.current?.finish(Date.now())
      setEnd(e ?? null)
    },
    [],
  )

  const answer = useCallback(
    async (value: string | null) => {
      if (!card || flash || phase !== 'play') return
      cancelAnimationFrame(raf.current)
      const ms = performance.now() - shownAt.current
      const v = value === null ? { correct: false, expected: card.item.choices![card.item.answerIndex!]!, reason: card.item.reason } : grade(card.item, { kind: 'choice', value }, { lexemes: pools?.lexemes })
      const left = Math.max(0, 1 - progressRef.current)
      const gained = v.correct ? 10 * wave + Math.round(left * 10 * wave) : 0
      const nextScore = score + gained
      const nextLives = v.correct ? lives : lives - 1
      if (v.correct) {
        sound.correct(Math.min(count + 1, 12))
        haptic.tick()
      } else {
        sound.wrong()
        haptic.wrong()
      }
      setFlash({ ok: v.correct, reason: v.correct ? undefined : (v.reason ?? card.item.reason), answer: v.expected })
      setScore(nextScore)
      setLives(nextLives)
      await session.current?.answer({ item: card.item, verdict: v, ms, golden: false, lexeme: card.item.target ? pools?.lexemes.get(card.item.target.lex) : undefined, recall: null, now: Date.now() })
      setTimeout(
        () => {
          setFlash(null)
          if (nextLives <= 0) return void finish(nextScore, wave)
          const nextCount = count + 1
          if (nextCount >= CARDS_PER_WAVE) {
            const nw = wave + 1
            setWave(nw)
            setCount(0)
            setBanner(`Wave ${nw}: ${WAVES[Math.min(nw, WAVES.length) - 1]!.title}`)
            setTimeout(() => setBanner(null), 1400)
            draw(nw)
          } else {
            setCount(nextCount)
            draw(wave)
          }
        },
        v.correct ? 450 : 1800,
      )
    },
    [card, flash, phase, wave, score, lives, count, pools, draw, finish],
  )

  // the fall
  useEffect(() => {
    if (phase !== 'play' || !card || flash) return
    const duration = (fallSeconds(wave) + (still ? 3 : 0)) * 1000
    const tick = () => {
      const p = (performance.now() - shownAt.current) / duration
      progressRef.current = p
      if (p >= 1) {
        setProgress(1)
        void answer(null)
        return
      }
      setProgress(p)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [phase, card, flash, wave, still, answer])

  // keys 1–3
  useEffect(() => {
    if (phase !== 'play') return
    const k = (e: KeyboardEvent) => {
      const n = Number(e.key)
      const choices = card?.item.choices
      if (choices && n >= 1 && n <= choices.length) void answer(choices[n - 1]!)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [phase, card, answer])

  if (phase === 'over' && end) return <SessionSummary end={end} onDone={() => nav('/games')} onAgain={start} />
  if (phase === 'intro' || phase === 'over')
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="space-y-3">
          <h1 className="font-serif text-3xl">Case arcade</h1>
          <p>
            A noun falls with the word that governs it: <Ru>без</Ru>, <Ru>к</Ru>, <Ru>че́рез</Ru>, <Ru>с</Ru>, <Ru>о</Ru>… Pick the right form before it lands. Waves of
            eight get faster and add plurals, adjective + noun phrases and numbers. Three lives.
          </p>
          {phase === 'over' && (
            <p className="text-xl font-bold text-red">
              Game over: {score} points, wave {wave}
            </p>
          )}
          <Button className="w-full" disabled={!pools} onClick={start}>
            {pools ? (phase === 'over' ? 'Play again' : 'Play') : 'Loading words…'}
          </Button>
        </Card>
        {runs.length > 0 && (
          <Card>
            <h2 className="font-serif text-xl">Personal bests</h2>
            <ol className="mt-2 space-y-1">
              {runs.map((r, i) => (
                <li key={r.ts} className="flex justify-between text-sm">
                  <span>
                    {i + 1}. {r.score} points
                  </span>
                  <span className="text-ink-soft">
                    wave {r.wave} · {new Date(r.ts).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    )

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => void finish(score, wave)} className="text-ink-soft hover:text-red" aria-label="End game">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <span className="font-bold tabular-nums text-red">{score}</span>
        <span className="text-sm text-ink-soft">wave {wave}</span>
        <span aria-label={`${lives} lives`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className={i < lives ? 'text-red' : 'text-line'}>
              ♥
            </span>
          ))}
        </span>
      </div>
      <div className="relative h-[52vh] overflow-hidden rounded-2xl border-2 border-line bg-paper-2">
        {banner && <div className="anim-pop absolute inset-x-0 top-1/3 z-10 text-center font-serif text-2xl text-red">{banner}</div>}
        {card && (
          <div
            className={`absolute inset-x-4 rounded-xl border-2 bg-paper p-3 text-center shadow-md ${flash ? (flash.ok ? 'border-good' : 'anim-shake border-bad') : 'border-red'}`}
            style={{ top: `calc(${progress} * (100% - 7.5rem))` }}
          >
            <p className="ru text-2xl" lang="ru">
              <span className="font-bold text-red">{card.governor}</span>{' '}
              <Ru>{card.base}</Ru>
            </p>
            <p className="text-xs text-ink-soft">
              {card.cue && <span className="ru mr-1 font-bold">{card.cue}</span>}
              {card.plural && <span className="mr-1 rounded bg-ink/10 px-1">plural</span>}
              {card.meaning}
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-red/40" />
      </div>
      {flash && !flash.ok && (
        <div className="rounded-lg border border-bad bg-paper p-2 text-sm">
          <Md text={flash.reason ?? `Answer: **${flash.answer}**`} />
        </div>
      )}
      <div className="grid gap-2">
        {card?.item.choices?.map((c, i) => (
          <button
            key={c}
            type="button"
            disabled={!!flash}
            onClick={() => void answer(c)}
            className={`ru flex min-h-12 items-center gap-3 rounded-lg border-2 bg-paper px-4 text-xl ${flash && c === flash.answer ? 'border-good' : 'border-line hover:border-red'}`}
            lang="ru"
          >
            <span className="hidden text-xs text-ink-soft sm:inline">{i + 1}</span>
            <Ru>{c}</Ru>
          </button>
        ))}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { grade, type Response, type Verdict } from '../engine/grader'
import { haptic } from '../audio/haptics'
import { sound } from '../audio/sound'
import { stopSpeaking } from '../audio/tts'
import { RewardSession, type AnswerEffects, type SessionEnd } from '../rewards/service'
import type { LevelInfo } from '../rewards/levels'
import { ExerciseView } from './exercises'
import { FEATURES } from '../features'
import { addFormCard } from '../srs/deck'
import { itemLexeme, noteConfusion } from '../srs/confusion'
import { getHook } from '../srs/leech'
import { Celebration, ComboMeter, EdgePulse, useJuice, XpFloat } from './juice'
import { Md, Ru } from './Md'
import { ItemVisual } from './visuals'
import { SessionSummary } from './SessionSummary'
import { requeueMissed, type RelearnMode } from '../lib/relearn'
import { Bar, Button, CountUp, Icon } from './ui'

interface Props {
  items: ExerciseItem[]
  lexemes: Map<string, Lexeme>
  kind: string
  onDone: () => void
  onAgain?: () => void
  /** SRS sessions: retrievability before review (drives XP freshness). */
  recallFor?: (item: ExerciseItem) => number | null
  /** Called after each graded answer (e.g. to reschedule an SRS card). */
  onGraded?: (item: ExerciseItem, verdict: Verdict, ms: number) => Promise<void>
  /** Called once with the session result (e.g. to pass a unit checkpoint). */
  onFinish?: (end: SessionEnd) => void | Promise<void>
  /** Shown above the summary (e.g. "Checkpoint passed"). */
  summaryNote?: (end: SessionEnd) => ReactNode
  /** Shown above the exercise card (e.g. a boss and its HP). */
  hud?: ReactNode
  /** Called after each answer; return true to end the session once its feedback is dismissed. */
  onAnswered?: (verdict: Verdict, effects: AnswerEffects) => boolean | void
  /** What happens to a missed item: back once at the end (default), or spaced retries until it's right. */
  relearn?: RelearnMode
}

const FORM_TYPES = new Set(['transform', 'cloze', 'choice'])

export function SessionRunner({ items, lexemes, kind, onDone, onAgain, recallFor, onGraded, onFinish, summaryNote, hud, onAnswered, relearn = 'once' }: Props) {
  const session = useRef<RewardSession>(null as unknown as RewardSession)
  session.current ??= new RewardSession(kind, Date.now())
  const [queue, setQueue] = useState(items)
  const [idx, setIdx] = useState(0)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [fx, setFx] = useState<AnswerEffects | null>(null)
  const [golden, setGolden] = useState(false)
  const [end, setEnd] = useState<SessionEnd | null>(null)
  const [levelUp, setLevelUp] = useState<LevelInfo | null>(null)
  const [xp, setXp] = useState(0)
  const [hook, setHook] = useState('')
  const shownAt = useRef(Date.now())
  const misses = useRef(new Map<string, number>())
  const stop = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const juice = useJuice()
  const item = queue[idx]!
  const attempt = queue.slice(0, idx).filter((q) => q.id === item.id).length

  useEffect(() => {
    setGolden(session.current.rollGolden())
    shownAt.current = Date.now()
  }, [idx])

  const submit = async (r: Response) => {
    if (verdict) return
    const v = grade(item, r, { lexemes })
    setVerdict(v)
    const ms = Date.now() - shownAt.current
    // feedback first, persistence after: no perceptible lag
    if (v.correct) {
      sound.correct(session.current.combo + 1)
      haptic.tick()
      juice.burst(cardRef.current, { color: golden ? 'var(--gold)' : undefined, count: golden ? 24 : 14 })
    } else {
      sound.wrong()
      haptic.wrong()
    }
    const lexeme = item.target ? lexemes.get(item.target.lex) : undefined
    const e = await session.current.answer({ item, verdict: v, ms, golden, lexeme, recall: recallFor?.(item) ?? null, now: Date.now() })
    await onGraded?.(item, v, ms)
    // a form missed anywhere becomes its own spaced-repetition card
    if (!v.correct && item.target && FORM_TYPES.has(item.type) && FEATURES.has('vocab') && !item.id.startsWith('srs:form:')) {
      void addFormCard(item.target.lex, item.target.slot, Date.now())
    }
    if (!v.correct && FEATURES.has('vocab')) {
      // a mix-up with another deck word is counted; the learner's own memory hook is shown with the answer
      void noteConfusion(item, v.given ?? '', lexemes, Date.now())
      const lex = itemLexeme(item)
      if (lex) void getHook(lex).then(setHook)
    }
    setFx(e)
    setXp(session.current.xp)
    if (onAnswered?.(v, e)) stop.current = true
    if (e.comboUp) {
      sound.comboUp(e.multiplier)
      haptic.combo()
    }
    if (e.golden) sound.golden()
    for (const a of e.achievements) juice.toast({ title: `🏆 ${a.ru}`, body: `${a.en} · +${a.xp} XP`, tone: 'gold' })
    for (const q of e.quests) juice.toast({ title: `Quest complete: ${q.text}`, body: `+${q.xp} XP`, tone: 'red' })
    if (e.levelUp) {
      sound.levelUp()
      haptic.big()
      setLevelUp(e.levelUp)
    }
    // missed items come back later in the session
    if (!v.correct) {
      const n = (misses.current.get(item.id) ?? 0) + 1
      misses.current.set(item.id, n)
      const q = requeueMissed(queue, idx, n, relearn)
      if (q) setQueue(q)
    }
  }

  const finish = useCallback(async () => {
    stopSpeaking()
    const e = await session.current.finish(Date.now())
    if (e) {
      await onFinish?.(e)
      setEnd(e)
    } else onDone()
  }, [onDone, onFinish])

  const next = useCallback(() => {
    if (stop.current || idx + 1 >= queue.length) return void finish()
    setIdx(idx + 1)
    setVerdict(null)
    setFx(null)
    setHook('')
  }, [idx, queue.length, finish])

  useEffect(() => {
    if (!verdict || levelUp) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        next()
      }
    }
    const t = setTimeout(() => window.addEventListener('keydown', k), 150)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', k)
    }
  }, [verdict, levelUp, next])

  if (end)
    return (
      <>
        {summaryNote?.(end)}
        <SessionSummary end={end} onDone={onDone} onAgain={onAgain} />
      </>
    )

  const combo = fx?.combo ?? session.current.combo
  const multiplier = fx?.multiplier ?? 1
  return (
    <div className="mx-auto max-w-xl space-y-4 pb-48">
      <EdgePulse active={multiplier >= 5} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={finish} className="text-ink-soft hover:text-red" aria-label="End session">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <Bar value={idx / queue.length} className="flex-1" />
        <span className="text-sm font-bold text-red">
          <CountUp value={xp} /> XP
        </span>
      </div>
      <div className="flex h-8 items-center justify-between">
        <ComboMeter combo={combo} multiplier={multiplier} />
        {golden && <span className="anim-pop rounded-full bg-gold px-3 py-1 text-xs font-bold text-[#2a1d0f]">Golden question · ×5 XP</span>}
      </div>

      {hud}
      <div ref={cardRef} className={`relative rounded-2xl border-2 p-5 ${golden ? 'golden-card' : 'border-line bg-paper-2'}`}>
        {fx && <XpFloat key={idx} amount={fx.xp} golden={golden} />}
        <ExerciseView key={`${idx}:${item.id}`} item={item} verdict={verdict} onSubmit={submit} attempt={attempt} />
      </div>

      {verdict && <Feedback verdict={verdict} item={item} fx={fx} hook={hook} onNext={next} />}

      {levelUp && (
        <Celebration ms={0} onDone={() => setLevelUp(null)}>
          <p className="text-sm uppercase tracking-widest text-ink-soft">Level up</p>
          <p className="my-2 font-serif text-6xl font-bold text-red">{levelUp.level}</p>
          <p className="text-xl">
            <Ru>{levelUp.rank.ru}</Ru> <span className="text-ink-soft">· {levelUp.rank.en}</span>
          </p>
          <p className="mt-4 text-sm text-ink-soft">Tap to continue</p>
        </Celebration>
      )}
    </div>
  )
}

function Feedback({ verdict, item, fx, hook, onNext }: { verdict: Verdict; item: ExerciseItem; fx: AnswerEffects | null; hook: string; onNext: () => void }) {
  const ok = verdict.correct
  const showAnswer = !ok && verdict.expected && item.type !== 'match'
  return (
    <div className={`anim-rise fixed inset-x-0 bottom-0 z-30 border-t-4 bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] ${ok ? 'border-good' : 'border-bad'}`} role="status" aria-live="assertive">
      <div className="mx-auto max-w-xl space-y-2">
        <div className={`flex items-center gap-2 text-lg font-bold ${ok ? 'text-good' : 'text-bad'}`}>
          <Icon name={ok ? 'check' : 'x'} className="h-6 w-6" />
          {ok ? (fx?.golden ? 'Golden!' : 'Right') : 'Not quite'}
          {fx && fx.xp > 0 && <span className="ml-auto text-sm text-red">+{fx.xp} XP{fx.multiplier > 1 ? ` (×${fx.multiplier})` : ''}</span>}
          {fx?.repeat && ok && <span className="ml-auto text-xs font-normal text-ink-soft">repeat: no XP</span>}
        </div>
        {showAnswer && (
          <p>
            Answer: <Ru className="text-xl font-bold" stress={item.tags.includes('stress')}>{verdict.expected}</Ru>
          </p>
        )}
        {verdict.message && <Md text={verdict.message} className="text-ink" />}
        {verdict.noteText && <Md text={verdict.noteText} className="text-sm text-ink-soft" />}
        {verdict.reason && <Md text={verdict.reason} className="text-sm text-ink-soft" stress={item.tags.includes('stress')} />}
        {!ok && hook && (
          <p className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm">
            <span className="font-bold">Your hook:</span> {hook}
          </p>
        )}
        <ItemVisual item={item} />
        {verdict.diff && (
          <p className="flex flex-wrap gap-x-2 text-lg" lang="ru">
            {verdict.diff.map((t, i) => (
              <span key={i} className={`ru ${t.status === 'ok' ? '' : t.status === 'extra' ? 'text-bad line-through' : 'text-bad underline'}`}>
                {t.status === 'wrong' ? `${t.text} → ${t.expected}` : t.text}
              </span>
            ))}
          </p>
        )}
        <Button autoFocus onClick={onNext} className={`w-full ${ok ? '' : 'bg-bad'}`}>
          Continue
        </Button>
      </div>
    </div>
  )
}

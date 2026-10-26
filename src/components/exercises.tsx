// Renderers for every exercise type. Each calls onSubmit once with a grader Response.
// Desktop shortcuts: Enter submits, 1–4 pick choices, Space plays audio (outside text fields).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ExerciseItem } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { choiceOptions, type Response, type Verdict } from '../engine/grader'
import { normalizeAnswer } from '../engine/normalize'
import { translitToCyrillic } from '../engine/translit'
import { speak } from '../audio/tts'
import { sound } from '../audio/sound'
import { displayStress, isVowel, stressIndex, stripStress } from '../lib/ru'
import { seeded, shuffle } from '../lib/rng'
import { Md, Ru } from './Md'
import { Button, Icon } from './ui'

export interface ViewProps {
  item: ExerciseItem
  /** Set once graded: the view shows the outcome and ignores input. */
  verdict: Verdict | null
  onSubmit: (r: Response) => void
}

const CYRILLIC = /[а-яё]/i // ru-ignore
const inField = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

function useKeys(handler: (e: KeyboardEvent) => void, active: boolean) {
  const h = useRef(handler)
  h.current = handler
  useEffect(() => {
    if (!active) return
    const k = (e: KeyboardEvent) => h.current(e)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [active])
}

function useSpeaker(text?: string, auto = false) {
  const s = useSettings()
  const play = (slow = false) => text && speak(text, { rate: slow ? s.ttsRate * 0.65 : s.ttsRate, voice: s.ttsVoice })
  useEffect(() => {
    if (auto && text) {
      const t = setTimeout(() => speak(text, { rate: s.ttsRate, voice: s.ttsVoice }), 250)
      return () => clearTimeout(t)
    }
  }, [text, auto, s.ttsRate, s.ttsVoice])
  return play
}

function PlayButtons({ play }: { play: (slow?: boolean) => void }) {
  return (
    <div className="flex justify-center gap-3">
      <button type="button" onClick={() => play()} className="flex h-16 w-16 items-center justify-center rounded-full bg-red text-paper" aria-label="Play (Space)">
        <Icon name="speaker" className="h-8 w-8" />
      </button>
      <button type="button" onClick={() => play(true)} className="flex h-16 items-center rounded-full border border-line px-4 text-sm text-ink-soft" aria-label="Play slowly">
        slower
      </button>
    </div>
  )
}

/** Instruction, Russian prompt (with the cloze gap and governing word highlighted), English gloss. */
export function Prompt({ item }: { item: ExerciseItem }) {
  const { showStress } = useSettings()
  const p = item.prompt
  let ru: ReactNode = null
  if (p.ru) {
    const parts = displayStress(p.ru, showStress).split('___')
    const gov = p.governor ? displayStress(p.governor, showStress) : null
    const mark = (s: string, k: number) =>
      gov && s.includes(gov)
        ? s.split(gov).flatMap((x, i) => (i ? [<span key={`${k}g${i}`} className="text-red underline decoration-2 underline-offset-4">{gov}</span>, x] : [x]))
        : [s]
    ru = (
      <p className="ru text-center text-3xl leading-snug" lang="ru">
        {parts.flatMap((s, i) => (i ? [<span key={`gap${i}`} className="mx-1 inline-block min-w-16 border-b-2 border-red align-baseline">&nbsp;</span>, ...mark(s, i)] : mark(s, i)))}
      </p>
    )
  }
  return (
    <div className="space-y-2 text-center">
      {p.instruction && <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{p.instruction}</p>}
      {ru}
      {p.en && <p className="text-ink-soft">{p.en}</p>}
    </div>
  )
}

function TypedView({ item, verdict, onSubmit, audio }: ViewProps & { audio?: boolean }) {
  const s = useSettings()
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const play = useSpeaker(item.prompt.audio, audio)
  useEffect(() => ref.current?.focus(), [])
  useKeys((e) => {
    if (e.key === ' ' && audio && !inField(e)) {
      e.preventDefault()
      play()
    }
  }, !verdict)
  const value = s.translit ? translitToCyrillic(text) : text
  const submit = () => normalizeAnswer(value) && onSubmit({ kind: 'text', text: value })
  return (
    <div className="space-y-4">
      {audio ? <PlayButtons play={play} /> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!verdict) submit()
        }}
        className="space-y-2"
      >
        <input
          ref={ref}
          lang="ru"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!!verdict}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={s.translit ? 'type in Latin: kniga, zhizn’…' : 'type in Russian'}
          aria-label="Your answer"
          className={`ru w-full rounded-lg border-2 bg-paper px-4 py-3 text-center text-2xl outline-none ${verdict ? (verdict.correct ? 'border-good' : 'border-bad') : 'border-line focus:border-red'}`}
        />
        {s.translit && text && <p className="ru text-center text-lg text-ink-soft" lang="ru">→ {value}</p>}
        {!verdict && (
          <Button type="submit" className="w-full" disabled={!normalizeAnswer(value)}>
            Check
          </Button>
        )}
      </form>
    </div>
  )
}

function ChoiceView({ item, verdict, onSubmit, audio }: ViewProps & { audio?: boolean }) {
  const options = useMemo(() => choiceOptions(item, seeded(item.id)), [item])
  const [picked, setPicked] = useState<string | null>(null)
  const play = useSpeaker(item.prompt.audio, audio)
  const choose = (o: string) => {
    if (verdict) return
    setPicked(o)
    onSubmit({ kind: 'choice', value: o })
  }
  useKeys((e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= options.length && !inField(e)) choose(options[n - 1]!)
    if (e.key === ' ' && audio && !inField(e)) {
      e.preventDefault()
      play()
    }
  }, !verdict)
  const correct = verdict?.expected
  const isRu = !item.choices
  return (
    <div className="space-y-4">
      {audio ? <PlayButtons play={play} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o, i) => {
          // fixed choices compare exactly: за́мок and замо́к are different answers
          const right = verdict && (item.choices ? o === correct : normalizeAnswer(o) === normalizeAnswer(correct ?? ''))
          const wrong = verdict && picked === o && !right
          return (
            <button
              key={o}
              type="button"
              onClick={() => choose(o)}
              disabled={!!verdict}
              className={`flex min-h-14 items-center gap-3 rounded-lg border-2 bg-paper px-4 py-2 text-left transition ${right ? 'border-good' : wrong ? 'anim-shake border-bad' : 'border-line hover:border-red'}`}
            >
              <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded border border-line text-xs text-ink-soft sm:flex">{i + 1}</span>
              {isRu ? <Ru className="text-xl">{o}</Ru> : CYRILLIC.test(o) ? <span className="ru text-xl" lang="ru">{o}</span> : <span className="text-lg">{o}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StressView({ item, verdict, onSubmit }: ViewProps) {
  const word = item.stressWord ?? ''
  const bare = stripStress(word)
  const target = stressIndex(word)
  const [picked, setPicked] = useState<number | null>(null)
  let vi = -1
  return (
    <div className="flex flex-wrap justify-center gap-1" lang="ru">
      {[...bare].map((ch, i) => {
        if (!isVowel(ch)) return <span key={i} className="ru px-0.5 py-3 text-4xl">{ch}</span>
        const idx = ++vi
        const state = verdict ? (idx === target ? 'border-good bg-good/15' : idx === picked ? 'border-bad anim-shake' : 'border-line') : 'border-line hover:border-red'
        return (
          <button
            key={i}
            type="button"
            disabled={!!verdict}
            onClick={() => {
              setPicked(idx)
              onSubmit({ kind: 'stress', vowelIndex: idx })
            }}
            className={`ru min-w-12 rounded-lg border-2 bg-paper px-2 py-2 text-4xl ${state}`}
            aria-label={`Stress on ${ch}`}
          >
            {verdict && idx === target ? `${ch}\u0301` : ch}
          </button>
        )
      })}
    </div>
  )
}

function MatchView({ item, verdict, onSubmit }: ViewProps) {
  const pairs = item.pairs ?? []
  const rng = useMemo(() => seeded(item.id), [item.id])
  const left = useMemo(() => shuffle(rng, pairs.map((p) => p[0]!)), [pairs, rng])
  const right = useMemo(() => shuffle(rng, pairs.map((p) => p[1]!)), [pairs, rng])
  const [sel, setSel] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [bad, setBad] = useState<string | null>(null)
  const mistakes = useRef(0)
  const pick = (r: string) => {
    if (!sel || verdict) return
    const ok = pairs.some((p) => p[0] === sel && p[1] === r)
    if (ok) {
      sound.tap()
      const next = new Set(done).add(sel).add(r)
      setDone(next)
      setSel(null)
      if (next.size === pairs.length * 2) onSubmit({ kind: 'match', mistakes: mistakes.current })
    } else {
      mistakes.current++
      setBad(r)
      setTimeout(() => setBad(null), 400)
    }
  }
  const cls = (k: string, active: boolean) =>
    `min-h-12 w-full rounded-lg border-2 px-3 py-2 transition ${done.has(k) ? 'border-good opacity-40' : active ? 'border-red bg-paper' : bad === k ? 'anim-shake border-bad' : 'border-line bg-paper hover:border-red'}`
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-2">
        {left.map((l) => (
          <button key={l} type="button" disabled={done.has(l)} onClick={() => setSel(l)} className={cls(l, sel === l)}>
            <Ru className="text-lg">{l}</Ru>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {right.map((r) => (
          <button key={r} type="button" disabled={done.has(r)} onClick={() => pick(r)} className={cls(r, false)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}

function TilesView({ item, verdict, onSubmit }: ViewProps) {
  const bank = useMemo(() => shuffle(seeded(item.id), (item.tiles ?? []).map((t, i) => ({ t, i }))), [item])
  const [chosen, setChosen] = useState<number[]>([])
  useKeys((e) => e.key === 'Enter' && chosen.length && onSubmit({ kind: 'tiles', tiles: chosen.map((i) => item.tiles![i]!) }), !verdict)
  return (
    <div className="space-y-4">
      <div className={`flex min-h-16 flex-wrap gap-2 rounded-lg border-2 border-dashed p-2 ${verdict ? (verdict.correct ? 'border-good' : 'border-bad') : 'border-line'}`}>
        {chosen.map((i) => (
          <button key={i} type="button" disabled={!!verdict} onClick={() => setChosen(chosen.filter((x) => x !== i))} className="rounded-lg border border-red bg-paper px-3 py-2">
            <Ru className="text-lg">{item.tiles![i]!}</Ru>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {bank.map(({ t, i }) => (
          <button key={i} type="button" disabled={!!verdict || chosen.includes(i)} onClick={() => setChosen([...chosen, i])} className="rounded-lg border border-line bg-paper px-3 py-2 disabled:opacity-30">
            <Ru className="text-lg">{t}</Ru>
          </button>
        ))}
      </div>
      {!verdict && (
        <Button className="w-full" disabled={!chosen.length} onClick={() => onSubmit({ kind: 'tiles', tiles: chosen.map((i) => item.tiles![i]!) })}>
          Check
        </Button>
      )}
    </div>
  )
}

function FindErrorView({ item, verdict, onSubmit }: ViewProps) {
  const words = (item.prompt.ru ?? '').split(/\s+/)
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className="flex flex-wrap justify-center gap-2" lang="ru">
      {words.map((w, i) => (
        <button
          key={i}
          type="button"
          disabled={!!verdict}
          onClick={() => {
            setPicked(i)
            onSubmit({ kind: 'index', index: i })
          }}
          className={`rounded-lg border-2 bg-paper px-3 py-2 ${verdict && i === item.errorIndex ? 'border-bad' : verdict && i === picked ? 'border-line opacity-60' : 'border-line hover:border-red'}`}
        >
          <Ru className="text-2xl">{w}</Ru>
        </button>
      ))}
    </div>
  )
}

function SelfGradedView({ item, verdict, onSubmit }: ViewProps) {
  const [text, setText] = useState('')
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-3">
      <textarea
        lang="ru"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        readOnly={shown}
        className="ru w-full rounded-lg border-2 border-line bg-paper p-3 text-xl outline-none focus:border-red"
        aria-label="Your answer"
      />
      {!shown ? (
        <Button className="w-full" onClick={() => setShown(true)}>
          Compare with the model answer
        </Button>
      ) : (
        <>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="text-sm text-ink-soft">Model answer</p>
            <Md text={item.model ?? ''} className="ru text-xl" />
          </div>
          {!verdict && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => onSubmit({ kind: 'self', ok: false })}>
                Not yet
              </Button>
              <Button onClick={() => onSubmit({ kind: 'self', ok: true })}>I got it</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ExerciseView(props: ViewProps) {
  const t = props.item.type
  return (
    <div className="space-y-6">
      {t !== 'listen-choose' && t !== 'dictation' && <Prompt item={props.item} />}
      {(t === 'listen-choose' || t === 'dictation') && props.item.prompt.instruction && (
        <p className="text-center text-sm font-bold uppercase tracking-wide text-ink-soft">{props.item.prompt.instruction}</p>
      )}
      {t === 'choice' || t === 'choice-reason' ? <ChoiceView {...props} /> : null}
      {t === 'listen-choose' ? <ChoiceView {...props} audio /> : null}
      {t === 'cloze' || t === 'transform' ? <TypedView {...props} /> : null}
      {t === 'dictation' ? <TypedView {...props} audio /> : null}
      {t === 'stress' ? <StressView {...props} /> : null}
      {t === 'match' ? <MatchView {...props} /> : null}
      {t === 'tiles' ? <TilesView {...props} /> : null}
      {t === 'find-error' ? <FindErrorView {...props} /> : null}
      {t === 'self-graded' ? <SelfGradedView {...props} /> : null}
    </div>
  )
}

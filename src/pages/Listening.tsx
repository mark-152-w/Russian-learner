// Listening and speaking: dialogues with questions, sentence dictation, hearing the difference, unstressed о and
// shadowing. Everything here needs a Russian voice except reading the dialogue transcripts.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { useRussianVoices } from '../audio/tts'
import { recognitionSupported } from '../audio/speech'
import { buildDrillContext } from '../lib/drillContext'
import { akanyeItems, pairItems, sentenceDictationItems, shadowItems } from '../engine/listening'
import { SessionRunner } from '../components/SessionRunner'
import { Card } from '../components/ui'
import { Library } from './Reader'

const MODES = [
  { id: 'dictation', title: 'Dictation', detail: 'Hear a sentence, type it; the mistakes are marked word by word.' },
  { id: 'yi', title: 'ы or и?', detail: 'был or бил, мыл or мил: which one did you hear?' },
  { id: 'soft', title: 'Hard or soft?', detail: 'брат or брать, у́гол or у́голь, рад or ряд.' },
  { id: 'akanye', title: 'Unstressed о', detail: 'You hear «малако́», you write молоко́.' }, // ru-ignore (the heard form is deliberately misspelt)
  { id: 'shadow', title: 'Shadowing', detail: 'Hear it, say it aloud.' },
]

export function ListeningPage() {
  const { voices, ready } = useRussianVoices()
  const hasVoice = voices.length > 0
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Listening</h1>
      {ready && !hasVoice && (
        <Card className="border-gold">
          <p className="font-bold">No Russian voice on this device</p>
          <p className="text-sm text-ink-soft">
            The listening drills use your device's text-to-speech. Add a Russian voice (Settings → Voice shows how) and they'll appear here. Until then you
            can read the dialogues and answer their questions.
          </p>
        </Card>
      )}
      {hasVoice && (
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <Link key={m.id} to={`/listen/${m.id}`} className="block rounded-xl border-2 border-line bg-paper-2 p-4 transition hover:border-red active:scale-[0.99]">
              <p className="font-bold">{m.title}</p>
              <p className="text-sm text-ink-soft">
                {m.detail}
                {m.id === 'shadow' && (recognitionSupported() ? ' Your browser can check what you said.' : ' You check yourself against the text.')}
              </p>
            </Link>
          ))}
        </div>
      )}
      <h2 className="font-serif text-2xl">Dialogues</h2>
      <p className="text-sm text-ink-soft">Listen first with the transcript hidden, then answer the questions. Each speaker gets a different voice where your device has two.</p>
      <Library kinds={['dialogue']} />
    </div>
  )
}

export function ListenRun() {
  const { mode = 'dictation' } = useParams()
  const nav = useNavigate()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [state, setState] = useState<{ items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    setState(null)
    void buildDrillContext({ hasVoice: voices.length > 0 }).then((ctx) => {
      const items =
        mode === 'yi' || mode === 'soft'
          ? pairItems(mode, ctx.rng, 12)
          : mode === 'akanye'
            ? akanyeItems(ctx.pool, ctx.rng, 10)
            : mode === 'shadow'
              ? shadowItems(ctx.sentences, ctx.rng, 8, recognitionSupported())
              : sentenceDictationItems(ctx.sentences, ctx.rng, 8)
      if (alive) setState({ items, lexemes: ctx.lexemes })
    })
    return () => {
      alive = false
    }
  }, [mode, round, ready, voices.length])
  if (!state) return <p className="py-12 text-center text-ink-soft">Getting the audio ready…</p>
  if (!voices.length) return <p className="py-12 text-center text-ink-soft">These drills need a Russian voice on your device.</p>
  return (
    <SessionRunner
      key={round}
      items={state.items}
      lexemes={state.lexemes}
      kind={`listening-${mode}`}
      onDone={() => nav('/listening')}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

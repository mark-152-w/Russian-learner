import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { loadChunk } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { buildPracticeSession } from '../engine/generators'
import { useRussianVoices } from '../audio/tts'
import { SessionRunner } from '../components/SessionRunner'

/** Practice from the learner's current vocabulary band (A1–A2 until the placement test exists). */
export default function Practice() {
  const { mode } = useParams()
  const nav = useNavigate()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [state, setState] = useState<{ items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)
  const count = mode === 'quick' ? 10 : 20

  useEffect(() => {
    if (!ready) return
    let alive = true
    setState(null)
    Promise.all([loadChunk('A1'), loadChunk('A2')]).then(([a1, a2]) => {
      if (!alive) return
      const pool = [...a1, ...a2]
      const items = buildPracticeSession(pool, { rng: mulberry32(Date.now()), count, hasVoice: voices.length > 0 })
      setState({ items, lexemes: new Map(pool.map((x) => [x.id, x])) })
    })
    return () => {
      alive = false
    }
  }, [ready, round, count, voices.length])

  if (!state) return <p className="py-12 text-center text-ink-soft">Preparing your session…</p>
  return (
    <SessionRunner
      key={round}
      items={state.items}
      lexemes={state.lexemes}
      kind={`practice-${mode}`}
      onDone={() => nav('/')}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

// One page for every focused drill: a word, a declension pattern, a heatmap cell, or a grammar topic.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { useRussianVoices } from '../audio/tts'
import { buildDrillContext } from '../lib/drillContext'
import { shuffle } from '../lib/rng'
import { examplesFor } from '../lib/sentences'
import { choiceItem, drillableSlots, isDrillable, stressItem, transformItem } from '../engine/generators'
import { itemsForTag, type DrillContext } from '../engine/drills'
import { caseClozeItems, patternItems, verbClozeItems, type NounClass } from '../engine/sentenceGen'
import { SessionRunner } from '../components/SessionRunner'

const N = 12

function wordDrill(ctx: DrillContext, id: string): ExerciseItem[] {
  const lx = ctx.lexemes.get(id)
  if (!lx || !isDrillable(lx)) return []
  const slots = shuffle(ctx.rng, drillableSlots(lx))
  const items: ExerciseItem[] = slots.slice(0, 8).map((s, i) => (i % 3 === 2 ? choiceItem(lx, s, ctx.rng) : null) ?? transformItem(lx, s))
  for (const s of examplesFor(id, ctx.sentences, 4)) {
    items.push(...[...caseClozeItems(s, ctx.lexemes, { pos: [lx.pos], rng: ctx.rng }), ...verbClozeItems(s, ctx.lexemes)].filter((i) => i.target?.lex === id).slice(0, 1))
  }
  const st = stressItem(lx, ctx.rng)
  if (st) items.push(st)
  return shuffle(ctx.rng, items).slice(0, N)
}

function cellDrill(ctx: DrillContext, kase: string, num: string, gender: string): ExerciseItem[] {
  const slot = `${num}_${kase}`
  const nouns = shuffle(ctx.rng, ctx.pool.filter((x) => x.pos === 'noun' && isDrillable(x) && (gender === 'x' || x.gender === gender) && drillableSlots(x).includes(slot)))
  return nouns.slice(0, N).map((lx, i) => (i % 3 === 2 ? choiceItem(lx, slot, ctx.rng) : null) ?? transformItem(lx, slot))
}

export default function Drill() {
  const { kind, a, b, c } = useParams()
  const nav = useNavigate()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [state, setState] = useState<{ items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)

  useEffect(() => {
    if (!ready || !a) return
    let alive = true
    setState(null)
    buildDrillContext({ hasVoice: voices.length > 0, vocab: kind === 'word' ? [a] : undefined }).then((ctx) => {
      let items: ExerciseItem[] = []
      if (kind === 'word') items = wordDrill(ctx, a)
      else if (kind === 'pattern') items = patternItems(ctx.pool, a as NounClass, (b ?? 'pl_gen').split(','), ctx.rng, N)
      else if (kind === 'cell') items = cellDrill(ctx, a, b ?? 'sg', c ?? 'x')
      else if (kind === 'tag') items = itemsForTag(a, ctx, N)
      if (alive) setState({ items, lexemes: ctx.lexemes })
    })
    return () => {
      alive = false
    }
  }, [ready, kind, a, b, c, round, voices.length])

  if (!state) return <p className="py-12 text-center text-ink-soft">Building your drill…</p>
  if (!state.items.length) return <p className="py-12 text-center text-ink-soft">Nothing to drill here yet at your level.</p>
  return (
    <SessionRunner
      key={round}
      items={state.items}
      lexemes={state.lexemes}
      kind={`drill-${kind}`}
      onDone={() => nav(-1)}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

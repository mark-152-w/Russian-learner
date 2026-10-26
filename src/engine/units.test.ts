import { beforeAll, describe, expect, it } from 'vitest'
import type { ExerciseItem, Lexeme, Unit } from '../types/content.gen'
import { CORE_CHUNKS, loadChunk } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { loadSentences } from '../lib/sentences'
import { loadHandwritten, loadUnits } from '../lib/content'
import { grade } from './grader'
import { runDrill, type DrillContext } from './drills'

let units: Unit[]
let base: Omit<DrillContext, 'vocab'>

beforeAll(async () => {
  const pool = [...(await loadChunk('A1')), ...(await loadChunk('A2'))]
  const all = (await Promise.all(CORE_CHUNKS.map(loadChunk))).flat()
  const lexemes = new Map<string, Lexeme>(all.map((x) => [x.id, x]))
  units = await loadUnits()
  base = {
    lexemes, pool, rng: mulberry32(11), hasVoice: true, handwritten: await loadHandwritten(),
    sentences: [...(await loadSentences('A1')), ...(await loadSentences('A2'))],
  }
})

describe('A2 units', () => {
  it('there are 20, numbered 1–20', () => {
    expect(units.map((u) => u.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })
  it('every drill of every unit produces gradable items', () => {
    for (const u of units) {
      const ctx = { ...base, vocab: u.vocab.map((id) => base.lexemes.get(id)).filter((x): x is Lexeme => !!x) }
      expect(ctx.vocab.length, u.id).toBe(u.vocab.length)
      let total = 0
      for (const d of u.drills) {
        const items = runDrill(d, ctx)
        expect(items.length, `${u.id} ${d.generator ?? 'hand-written'}`).toBeGreaterThan(0)
        total += items.length
        for (const it of items) {
          const right = correctResponse(it)
          if (right) expect(grade(it, right, { lexemes: base.lexemes }).correct, `${u.id} ${it.id}`).toBe(true)
        }
      }
      expect(total, u.id).toBeGreaterThanOrEqual(12)
    }
  })
})

function correctResponse(it: ExerciseItem) {
  if (it.type === 'match' || it.type === 'stress' || it.type === 'self-graded') return null
  if (it.type === 'find-error') return { kind: 'index' as const, index: it.errorIndex! }
  if (it.type === 'tiles') return null
  if (it.choices) return { kind: 'choice' as const, value: it.choices[it.answerIndex!]! }
  if (it.type === 'choice' || it.type === 'choice-reason' || it.type === 'listen-choose') return { kind: 'choice' as const, value: it.accept![0]! }
  return { kind: 'text' as const, text: it.accept![0]! }
}

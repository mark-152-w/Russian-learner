import { beforeAll, describe, expect, it } from 'vitest'
import type { ExerciseItem, Lexeme, Sentence, Unit } from '../types/content.gen'
import { CORE_CHUNKS, loadChunk } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { loadSentences } from '../lib/sentences'
import { loadHandwritten, loadUnits } from '../lib/content'
import { grade } from './grader'
import { runDrill, type DrillContext } from './drills'

let units: Unit[]
let lexemes: Map<string, Lexeme>
let handwritten: Map<string, ExerciseItem>
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
const pools: Record<string, Lexeme[]> = {}
const sentences: Record<string, Sentence[]> = {}

beforeAll(async () => {
  const all = (await Promise.all(CORE_CHUNKS.map(loadChunk))).flat()
  lexemes = new Map<string, Lexeme>(all.map((x) => [x.id, x]))
  units = await loadUnits()
  handwritten = await loadHandwritten()
  for (const [i, lv] of LEVELS.entries()) {
    pools[lv] = [...(pools[LEVELS[i - 1]!] ?? []), ...(await loadChunk(lv))]
    sentences[lv] = [...(sentences[LEVELS[i - 1]!] ?? []), ...(await loadSentences(lv))]
  }
}, 120_000)

const levelsWithUnits = ['A2', 'B1', 'B2', 'C1']

describe('course units', () => {
  it('each level is numbered from 1 without gaps, and ids are unique', () => {
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length)
    for (const lv of levelsWithUnits) {
      const ns = units.filter((u) => u.level === lv).map((u) => u.number)
      expect(ns, lv).toEqual(Array.from({ length: ns.length }, (_, i) => i + 1))
    }
    expect(units.filter((u) => u.level === 'A2')).toHaveLength(20)
    expect(units.filter((u) => u.level === 'B1')).toHaveLength(20)
    expect(units.filter((u) => u.level === 'B2')).toHaveLength(15)
    expect(units.filter((u) => u.level === 'C1')).toHaveLength(10)
  })
  it('units come in course order: by level, then number', () => {
    const order = units.map((u) => `${levelsWithUnits.indexOf(u.level)}:${String(u.number).padStart(2, '0')}`)
    expect(order).toEqual([...order].sort())
  })
  it('every drill of every unit produces gradable items', { timeout: 120_000 }, () => {
    for (const u of units) {
      const ctx: DrillContext = {
        lexemes, handwritten, rng: mulberry32(11), hasVoice: true, pool: pools[u.level]!, sentences: sentences[u.level]!,
        vocab: u.vocab.map((id) => lexemes.get(id)).filter((x): x is Lexeme => !!x),
      }
      expect(ctx.vocab.length, u.id).toBe(u.vocab.length)
      let total = 0
      for (const d of u.drills) {
        const items = runDrill(d, ctx)
        expect(items.length, `${u.id} ${d.generator ?? 'hand-written'}`).toBeGreaterThan(0)
        if (d.items) expect(items.length, `${u.id}: unknown item ids`).toBe(d.items.length)
        total += items.length
        for (const it of items) {
          const right = correctResponse(it)
          if (right) expect(grade(it, right, { lexemes }).correct, `${u.id} ${it.id}`).toBe(true)
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

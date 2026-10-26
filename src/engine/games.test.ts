import { beforeAll, describe, expect, it } from 'vitest'
import type { Lexeme } from '../types/content.gen'
import { loadChunk, loadLexemes, primaryForm } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { stripStress } from '../lib/ru'
import { grade } from './grader'
import { arcadeCard, arcadePools, joinPreposition, WAVES } from './arcade'
import { buildPuzzle, candidates, daySeed, entryCells, TOPICS } from './crossword'
import { NUMERAL_LEXEMES } from './trainers'

let pool: Lexeme[]
let lexemes: Map<string, Lexeme>
let numberNouns: Lexeme[]
beforeAll(async () => {
  pool = [...(await loadChunk('A1')), ...(await loadChunk('A2'))]
  const nums = await loadLexemes(NUMERAL_LEXEMES)
  numberNouns = [...nums.values()].filter((x) => x.pos === 'noun')
  lexemes = new Map([...pool.map((x) => [x.id, x] as const), ...nums])
}, 60_000)

describe('case arcade', () => {
  it('adjusts prepositions before awkward clusters', () => {
    expect(joinPreposition('о', 'окне́')).toBe('об')
    expect(joinPreposition('с', 'шко́лой')).toBe('со')
    expect(joinPreposition('в', 'вто́рник')).toBe('во')
    expect(joinPreposition('к', 'мне')).toBe('ко')
    expect(joinPreposition('о', 'кни́ге')).toBe('о')
  })
  it('every wave deals cards whose answer grades correct and whose choices differ', () => {
    const { nouns, adjectives } = arcadePools(pool)
    expect(nouns.length).toBeGreaterThan(50)
    expect(adjectives.length).toBeGreaterThan(20)
    const rng = mulberry32(7)
    for (const w of WAVES) {
      let dealt = 0
      for (let i = 0; i < 200 && dealt < 25; i++) {
        const c = arcadeCard(w.n, nouns, adjectives, numberNouns, rng)
        if (!c) continue
        dealt++
        const choices = c.item.choices!
        expect(new Set(choices.map(stripStress)).size, c.item.id).toBe(choices.length)
        expect(grade(c.item, { kind: 'choice', value: choices[c.item.answerIndex!]! }, { lexemes }).correct, c.item.id).toBe(true)
        if (c.item.target) expect(primaryForm(lexemes.get(c.item.target.lex)!, c.item.target.slot)).toBe(choices[c.item.answerIndex!])
      }
      expect(dealt, `wave ${w.n}`).toBe(25)
    }
  })
})

describe('crossword', () => {
  it('builds a consistent grid for every topic', () => {
    for (const t of TOPICS) {
      const rng = mulberry32(daySeed('2026-10-26') + t.id.length)
      const p = buildPuzzle(candidates(pool, t.id, rng), rng, 10)
      expect(p, t.id).not.toBeNull()
      const covered = new Set<string>()
      for (const e of p!.entries) {
        entryCells(e).forEach(([r, c], i) => {
          expect(p!.grid[r]![c], `${t.id} ${e.answer}`).toBe(e.answer[i])
          covered.add(`${r},${c}`)
        })
        expect(p!.numbers[e.row]![e.col]).toBe(e.n)
        expect(e.answer).toMatch(/^[а-я]{3,9}$/) // ru-ignore
      }
      p!.grid.forEach((row, r) => row.forEach((ch, c) => ch && expect(covered.has(`${r},${c}`)).toBe(true)))
      expect(p!.entries.length).toBeGreaterThanOrEqual(6)
    }
  })
  it('the daily puzzle is the same all day', () => {
    const a = buildPuzzle(candidates(pool, 'mixed', mulberry32(daySeed('2026-10-26'))), mulberry32(daySeed('2026-10-26')), 10)
    const b = buildPuzzle(candidates(pool, 'mixed', mulberry32(daySeed('2026-10-26'))), mulberry32(daySeed('2026-10-26')), 10)
    expect(a!.entries.map((e) => e.answer)).toEqual(b!.entries.map((e) => e.answer))
  })
})

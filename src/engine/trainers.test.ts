import { beforeAll, describe, expect, it } from 'vitest'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { loadChunk, loadLexemes } from '../lib/lexicon'
import { loadHandwritten } from '../lib/content'
import { mulberry32 } from '../lib/rng'
import { grade, choiceOptions } from './grader'
import {
  countBand, countForm, countItems, declinedNumeralItems, formPairItems, MINIMAL_PAIR_LEXEMES, MINIMAL_PAIRS, minimalPairItems,
  NUMERAL_LEXEMES, numeralForm, prepSortItems, PREPOSITIONS, resolvePairs, shiftingStressItems,
} from './trainers'

let lexemes: Map<string, Lexeme>
let pool: Lexeme[]
beforeAll(async () => {
  lexemes = await loadLexemes([...NUMERAL_LEXEMES, ...MINIMAL_PAIR_LEXEMES])
  pool = [...(await loadChunk('A1')), ...(await loadChunk('A2'))]
  for (const x of pool) lexemes.set(x.id, x)
}, 120_000)

/** The item's own answer must grade as correct. */
function answerable(it: ExerciseItem) {
  let r
  if (it.type === 'choice') r = { kind: 'choice' as const, value: it.choices ? it.choices[it.answerIndex!]! : it.accept![0]! }
  if (it.type === 'cloze') r = { kind: 'text' as const, text: it.accept![0]! }
  if (!r) return
  expect(grade(it, r, { lexemes }).correct, it.id).toBe(true)
}

describe('numerals', () => {
  it('bands follow the 1 / 2–4 / 5+ rule with 11–14 exceptions', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(countBand)).toEqual(['one', 'few', 'few', 'many', 'many', 'many', 'many', 'one', 'few', 'many', 'one', 'many'])
  })
  it('uses the special counting forms', () => {
    expect(countForm(lexemes.get('n:час')!, 2)!.form).toBe('часа́')
    expect(countForm(lexemes.get('n:год')!, 5)!.form).toBe('лет')
    expect(countForm(lexemes.get('n:год')!, 21)!.form).toBe('год')
    expect(countForm(lexemes.get('n:человек')!, 5)!.form).toBe('челове́к')
    expect(countForm(lexemes.get('n:рубль')!, 3)!.form).toBe('рубля́')
  })
  it('declines numerals from closed_class', () => {
    expect(numeralForm(3, 'ins')).toBe('тремя́')
    expect(numeralForm(2, 'gen')).toBe('двух')
    expect(numeralForm(5, 'dat')).toBe('пяти́')
  })
  it('every frame produces answerable items', () => {
    const items = [...countItems(lexemes, mulberry32(1), 40), ...declinedNumeralItems(lexemes, mulberry32(2), 20)]
    expect(items.length).toBeGreaterThanOrEqual(50)
    items.forEach(answerable)
    for (const it of items.filter((x) => x.type === 'choice')) expect(choiceOptions(it, mulberry32(3)).length).toBeGreaterThanOrEqual(2)
  })
  it('names the rule when the band is wrong', () => {
    const it = countItems(lexemes, mulberry32(5), 40).find((x) => x.type === 'cloze' && x.target?.slot === 'pl_gen')!
    const lx = lexemes.get(it.target!.lex)!
    const v = grade(it, { kind: 'text', text: lx.forms![0]!.split('|')[0]! }, { lexemes })
    expect(v.correct).toBe(false)
    expect(v.reason).toMatch(/genitive plural/)
  })
})

describe('prepositions', () => {
  it('sorts every preposition into one bin', () => {
    const items = prepSortItems('B2', mulberry32(1), 99)
    expect(items).toHaveLength(PREPOSITIONS.length)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    items.forEach(answerable)
    const wrong = grade(items[0]!, { kind: 'choice', value: items[0]!.choices!.find((_, i) => i !== items[0]!.answerIndex)! })
    expect(wrong.errorType).toBe('case.preposition-government')
  })
  it('A2 rounds hold only A2 prepositions', () => {
    expect(prepSortItems('A2', mulberry32(1), 99).every((i) => i.level === 'A2')).toBe(true)
  })
})

describe('stress', () => {
  it('finds shifting nouns and feminine-past verbs', () => {
    const nouns = shiftingStressItems(pool, mulberry32(1), 20, 'noun')
    const past = shiftingStressItems(pool, mulberry32(1), 20, 'past')
    expect(nouns.length).toBe(20)
    expect(past.length).toBeGreaterThanOrEqual(10)
    expect(past.some((i) => i.stressWord === 'жила́' || i.stressWord === 'была́' || i.stressWord === 'начала́')).toBe(true)
  })
  it('form pairs differ only in stress', () => {
    const items = formPairItems(pool, mulberry32(2), 15)
    expect(items.length).toBe(15)
    items.forEach(answerable)
  })
  it('most hand-listed minimal pairs resolve from the lexicon', () => {
    const resolved = resolvePairs(lexemes)
    const missing = MINIMAL_PAIRS.filter((p) => !resolved.some((r) => r.a.lex === p.a[0] && r.b.lex === p.b[0])).map((p) => `${p.a[0]}/${p.b[0]}`)
    expect(missing, missing.join(', ')).toEqual([])
    minimalPairItems(lexemes, mulberry32(4), 20).forEach(answerable)
  })
})

describe('hand-written aspect and motion items', () => {
  it('are answerable, carry a reason, and aspect items all have a timeline', async () => {
    const hand = [...(await loadHandwritten()).values()]
    const aspect = hand.filter((i) => i.id.startsWith('ex-asp-'))
    const motion = hand.filter((i) => i.id.startsWith('ex-mot-'))
    expect(aspect.length).toBeGreaterThanOrEqual(70)
    expect(motion.length).toBeGreaterThanOrEqual(60)
    for (const it of [...aspect, ...motion]) {
      expect(it.reason, it.id).toBeTruthy()
      expect(grade(it, { kind: 'choice', value: it.accept![0]! }).correct, it.id).toBe(true)
      const wrong = grade(it, { kind: 'choice', value: it.distractors![0]!.ru })
      expect(wrong.correct, it.id).toBe(false)
    }
    expect(aspect.every((i) => i.visual?.timeline)).toBe(true)
  })
})

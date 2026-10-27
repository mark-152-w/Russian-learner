import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Lexeme, Sentence } from '../types/content.gen'
import { db, MedvedDB, useDatabase } from '../db/db'
import { loadChunk } from '../lib/lexicon'
import { loadSentences } from '../lib/sentences'
import { mulberry32 } from '../lib/rng'
import { coverageOf, coverageTopN, marginalCoverage } from '../lib/coverage'
import { getStats } from '../rewards/service'
import { grade } from '../engine/grader'
import { newCard, setScheduler } from './fsrs'
import { pairCardId } from './confusion'
import {
  addFormCard, addWord, attemptsFor, cardToItem, countDue, dueCards, introduceNewWords, newWordsAddedToday, queueWords, recordReview,
} from './deck'

const T0 = new Date(2026, 3, 1, 10).getTime()
const DAY = 86400000
let lex: Map<string, Lexeme>
let pool: Lexeme[]
let sents: Sentence[]
let n = 0

beforeAll(async () => {
  setScheduler({ fuzz: false })
  pool = [...(await loadChunk('A1')), ...(await loadChunk('A2'))]
  lex = new Map(pool.map((x) => [x.id, x]))
  sents = [...(await loadSentences('A1')), ...(await loadSentences('A2'))]
})
beforeEach(() => useDatabase(new MedvedDB(`deck-${++n}`)))

describe('deck', () => {
  it('adding a word creates staggered cards; audio only with a voice', async () => {
    await addWord('n:книга', T0, false)
    const cards = await db.srs.toArray()
    expect(cards.map((c) => c.dir).sort()).toEqual(['cloze', 'en-ru', 'ru-en'])
    expect(await countDue(T0)).toBe(1)
    expect(await countDue(T0 + 5 * DAY)).toBe(3)
    expect(await addWord('n:книга', T0, false)).toBe(false)
  })

  it('introduces new words up to the daily limit, queued words first, then by frequency', async () => {
    await queueWords(['n:школа'])
    const added = await introduceNewWords(pool, 5, T0, true)
    expect(added).toHaveLength(5)
    expect(added[0]).toBe('n:школа')
    // no prepositions/conjunctions, nothing above the assumed-known frequency band
    for (const id of added.slice(1)) {
      const x = lex.get(id)!
      expect(x.rank!).toBeGreaterThanOrEqual(150)
      expect(x.sub ?? []).not.toContain('PREP')
    }
    expect(await newWordsAddedToday(T0)).toBe(5)
    expect(await introduceNewWords(pool, 5, T0 + 1000, true)).toEqual([])
    expect((await introduceNewWords(pool, 5, T0 + DAY, true)).length).toBe(5)
  })

  it('cards become gradable items in every direction', async () => {
    await addWord('n:книга', T0, true)
    await addFormCard('n:книга', 'pl_gen', T0)
    const rng = mulberry32(1)
    for (const c of await dueCards(T0 + 10 * DAY)) {
      const it = cardToItem(c, lex, sents, rng, true)!
      expect(it.card).toBe(c.id)
      const answer = it.choices ? { kind: 'choice' as const, value: it.choices[it.answerIndex!]! } : { kind: 'text' as const, text: it.accept![0]! }
      expect(grade(it, answer, { lexemes: lex }).correct, c.id).toBe(true)
    }
  })

  it('a cloze card moves to a different sentence on each review', async () => {
    await addWord('n:книга', T0, true)
    const card = (await db.srs.get('vocab:n:книга:cloze'))!
    const prompts = [0, 1, 2].map((reps) => JSON.stringify(cardToItem({ ...card, reps }, lex, sents, mulberry32(1), true)!.prompt))
    expect(new Set(prompts).size).toBe(3)
  })

  it('reviews reschedule the card and feed stats and quests', async () => {
    await addWord('n:книга', T0, false)
    const id = 'vocab:n:книга:ru-en'
    const after = await recordReview(id, { correct: true }, 3000, false, T0)
    expect(after!.due).toBeGreaterThan(T0)
    expect((await getStats()).reviews).toBe(1)
    const wrong = await recordReview(id, { correct: false }, 3000, false, after!.due)
    expect(wrong!.lapses + wrong!.reps).toBeGreaterThan(after!.reps)
  })
})

describe('a word\'s history', () => {
  const att = (item: string, lex?: string) => db.attempts.add({ ts: T0, item, type: 'meaning', level: 'A1', tags: [], lex, correct: true, ms: 1, xp: 1 })
  it('counts its items and its own cards, not a homograph\'s', async () => {
    await addWord('n:замок', T0, false)
    await addWord('n:замок:2', T0, false)
    const pair = pairCardId('n:замок', 'n:замок:2')
    await db.srs.put(newCard({ id: pair, kind: 'pair', dir: 'pair', lex: 'n:замок:2', other: 'n:замок' }, T0))
    await att('gen:form:1', 'n:замок')
    await att('srs:vocab:n:замок:ru-en')
    await att('srs:vocab:n:замок:2:ru-en')
    await att(`srs:${pair}`)
    await att('gen:form:2', 'n:замок:2')
    expect((await attemptsFor('n:замок')).map((a) => a.item).sort()).toEqual(['gen:form:1', `srs:${pair}`, 'srs:vocab:n:замок:ru-en'])
    expect((await attemptsFor('n:замок:2')).map((a) => a.item).sort()).toEqual(['gen:form:2', `srs:${pair}`, 'srs:vocab:n:замок:2:ru-en'])
  })
})

describe('coverage milestone', () => {
  it('is computed from the frequency curve, not invented', () => {
    expect(marginalCoverage(1)).toBeGreaterThan(marginalCoverage(1000))
    const top = Array.from({ length: 1000 }, (_, i) => i + 1)
    expect(coverageOf(top)).toBeCloseTo(coverageTopN(1000), 2)
    expect(coverageOf([5000, 5001])).toBeLessThan(0.001)
  })
})

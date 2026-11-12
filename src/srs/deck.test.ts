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
import { enRuItem } from '../engine/drills'
import { meaningItem } from '../engine/generators'
import { newCard, setScheduler, State } from './fsrs'
import {
  addFormCard, addWord, BACKLOG_PAUSE, BACKLOG_SLOW, cardToItem, countDue, dueCards, introduceNewWords, isWaiting, newWordRoom,
  newWordsAddedToday, newWordsHeldBack, pickDue, queueWords, recordReview, UNLOCK_STABILITY,
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
    // the other directions wait for the first to settle: a new word is one card, not three
    expect(await countDue(T0 + 5 * DAY)).toBe(1)
    expect(await addWord('n:книга', T0, false)).toBe(false)
  })

  it('unlocks a direction once the one before it has settled', async () => {
    await addWord('n:книга', T0, false)
    const all = await db.srs.toArray()
    const en = all.find((c) => c.dir === 'en-ru')!
    expect(isWaiting(en, all)).toBe(true)
    const settled = all.map((c) => (c.dir === 'ru-en' ? { ...c, reps: 3, state: State.Review, stability: UNLOCK_STABILITY } : c))
    expect(isWaiting(en, settled)).toBe(false)
    // cloze still waits for en-ru
    expect(isWaiting(settled.find((c) => c.dir === 'cloze')!, settled)).toBe(true)
  })

  it('shows one card per word a day, and seen cards before new ones', async () => {
    await addWord('n:книга', T0, false)
    await addWord('n:школа', T0 + 1, false)
    const all = (await db.srs.toArray()).map((c) => ({ ...c, reps: 2, state: State.Review, stability: 10, due: T0, last_review: T0 - 10 * DAY }))
    const now = T0 + DAY
    const picked = pickDue(all, now)
    expect(picked.map((c) => c.lex).sort()).toEqual(['n:книга', 'n:школа'])
    // книга reviewed today: its other cards wait until tomorrow
    const reviewed = all.map((c) => (c.id === 'vocab:n:книга:ru-en' ? { ...c, last_review: now - 1000, due: now + 5 * DAY } : c))
    expect(pickDue(reviewed, now).map((c) => c.lex)).toEqual(['n:школа'])
    expect(pickDue(reviewed, now + DAY).map((c) => c.lex).sort()).toEqual(['n:книга', 'n:школа'])
    const fresh = { ...all[0]!, id: 'vocab:n:дом:ru-en', lex: 'n:дом', reps: 0, state: State.New, due: T0 - DAY, last_review: undefined }
    expect(pickDue([fresh, ...all], now).at(-1)!.lex).toBe('n:дом')
  })

  it('slows and then pauses new words while reviews pile up', async () => {
    expect(newWordRoom(10, 0, 0)).toBe(10)
    expect(newWordRoom(10, 3, 0)).toBe(7)
    expect(newWordRoom(10, 0, BACKLOG_SLOW)).toBe(5)
    expect(newWordRoom(10, 6, BACKLOG_SLOW)).toBe(0)
    expect(newWordRoom(10, 0, BACKLOG_PAUSE)).toBe(0)
    const backlog = Array.from({ length: BACKLOG_PAUSE }, (_, i) => ({
      ...newCard({ id: `form:n:x${i}:pl_gen`, kind: 'form' as const, dir: 'form' as const, lex: `n:x${i}`, slot: 'pl_gen' }, T0 - 30 * DAY),
      reps: 2, state: State.Review, stability: 3, due: T0 - DAY, last_review: T0 - 5 * DAY,
    }))
    await db.srs.bulkPut(backlog)
    expect(await introduceNewWords(pool, 10, T0, false)).toEqual([])
    expect((await newWordsHeldBack(T0)).paused).toBe(true)
  })

  it('missed forms become cards a few a day, one waiting per word', async () => {
    expect(await addFormCard('n:книга', 'pl_gen', T0)).toBe(true)
    expect(await addFormCard('n:книга', 'sg_ins', T0)).toBe(false)
    for (const w of ['n:школа', 'n:дом', 'n:город', 'n:вода']) expect(await addFormCard(w, 'pl_gen', T0)).toBe(true)
    expect(await addFormCard('n:мама', 'pl_gen', T0)).toBe(false)
    expect(await addFormCard('n:мама', 'pl_gen', T0 + DAY)).toBe(true)
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
    expect((await dueCards(T0 + 10 * DAY)).length).toBe(1)
    for (const c of await db.srs.toArray()) {
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

describe('card prompts say what they want', () => {
  it('English → Russian names the kind of word and its first letter, and explains the aspect partner', () => {
    const it = enRuItem(lex.get('v:отвечать')!, lex)
    expect(it.prompt.instruction).toBe('Write the Russian verb, imperfective')
    expect(it.prompt.en).toMatch(/^to answer, .* · starts with о…$/)
    const v = grade(it, { kind: 'text', text: 'ответить' }, { lexemes: lex })
    expect(v.correct).toBe(false)
    expect(v.errorType).toBe('aspect.wrong')
    expect(grade(it, { kind: 'text', text: 'отвечать' }, { lexemes: lex }).correct).toBe(true)
    expect(enRuItem(lex.get('n:книга')!, lex).prompt.instruction).toBe('Write the Russian noun')
  })

  it('a meaning question never offers another meaning of the same word as a wrong answer', () => {
    const rng = mulberry32(7)
    const verbs = pool.filter((x) => x.pos === 'verb').slice(0, 300)
    for (const lx of verbs) {
      const it = meaningItem(lx, pool, rng)
      if (!it) continue
      const own = lx.en.flatMap((e) => e.split(',')).map((x) => x.trim().toLowerCase().replace(/^to /, ''))
      const wrong = it.choices!.filter((_, i) => i !== it.answerIndex).map((c) => c.toLowerCase().replace(/^to /, ''))
      for (const w of wrong) expect(own, `${lx.lemma}: ${w}`).not.toContain(w)
      expect(it.choices![it.answerIndex!]).toMatch(/^to /i)
    }
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

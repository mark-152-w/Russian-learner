import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Lexeme } from '../types/content.gen'
import { db, MedvedDB, useDatabase } from '../db/db'
import { loadChunk } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { grade } from '../engine/grader'
import { gloss, meaningItem, pairItem } from '../engine/generators'
import { enRuItem } from '../engine/drills'
import { addWord, cardToItem } from './deck'
import { confusedWith, confusionsOf, noteConfusion, pairCardId, recordConfusion, SAME_OCCASION_MS } from './confusion'
import { getHook, LEECH_AGAIN, LEECH_LAPSES, leechesToRescue, markRescued, needsRescue, setHook } from './leech'

const T0 = new Date(2026, 3, 1, 10).getTime()
let lex: Map<string, Lexeme>
let n = 0
const L = (id: string) => lex.get(id)!

beforeAll(async () => {
  const pool = [...(await loadChunk('A1')), ...(await loadChunk('A2')), ...(await loadChunk('C1'))]
  lex = new Map(pool.map((x) => [x.id, x]))
})
beforeEach(() => useDatabase(new MedvedDB(`memory-${++n}`)))

const answer = (it: ReturnType<typeof pairItem>) => ({ kind: 'choice' as const, value: it!.choices![it!.answerIndex!]! })

describe('pair cards', () => {
  it('alternate the word asked and the direction, and every one grades', () => {
    const items = [0, 1, 2, 3].map((r) => pairItem(L('v:платить'), L('n:платье'), r, mulberry32(r))!)
    expect(new Set(items.map((i) => i.vocab![0])).size).toBe(2)
    expect(items.filter((i) => i.prompt.en).length).toBe(2)
    for (const it of items) expect(grade(it, answer(it)).correct).toBe(true)
    expect(items[0]!.reason).toContain('пла́тье')
  })
  it('are not made for words that cannot be told apart', () => {
    expect(pairItem(L('n:книга'), L('n:книга'), 0, mulberry32(1))).toBeNull()
  })
})

describe('confusions', () => {
  const deck = new Set(['v:платить', 'n:платье'])
  it('count a meaning picked from another deck word', () => {
    const it = meaningItem(L('v:платить'), [...lex.values()], mulberry32(3))!
    expect(confusedWith(it, gloss(L('n:платье')), lex, deck)).toEqual(['n:платье'])
    expect(confusedWith(it, gloss(L('n:платье')), lex, new Set(['v:платить']))).toEqual([])
  })
  it('count a typed form of another deck word, but not a form of the word asked for', () => {
    const it = enRuItem(L('v:платить'))
    expect(confusedWith(it, 'платья', lex, deck)).toEqual(['n:платье'])
    expect(confusedWith(it, 'плачу', lex, deck)).toEqual([])
    // ста́ли is a form of both сталь and стать: for сталь it's a grammar slip
    expect(confusedWith(enRuItem(L('n:сталь')), 'стали', lex, new Set(['n:сталь', 'v:стать']))).toEqual([])
  })
  it('add a pair card on the second mix-up, on a separate occasion', async () => {
    await recordConfusion(L('n:платье'), L('v:платить'), T0)
    expect((await recordConfusion(L('v:платить'), L('n:платье'), T0 + 60_000)).n).toBe(1)
    expect(await db.srs.get(pairCardId('v:платить', 'n:платье'))).toBeUndefined()
    await recordConfusion(L('v:платить'), L('n:платье'), T0 + SAME_OCCASION_MS)
    const card = (await db.srs.get(pairCardId('n:платье', 'v:платить')))!
    expect(card).toMatchObject({ kind: 'pair', lex: 'n:платье', other: 'v:платить' })
    const it = cardToItem(card, lex, [], mulberry32(1), true)!
    expect(it.id).toBe(`srs:${card.id}`)
    expect(grade(it, { kind: 'choice', value: it.choices![it.answerIndex!]! }).correct).toBe(true)
    expect(await confusionsOf('v:платить')).toEqual([{ lex: 'n:платье', n: 2 }])
  })
  it('are noted from wrong answers on deck words only', async () => {
    const it = enRuItem(L('v:платить'))
    await noteConfusion(it, 'платье', lex, T0)
    expect(await confusionsOf('v:платить')).toEqual([])
    await addWord('v:платить', T0, false)
    await addWord('n:платье', T0, false)
    await noteConfusion(it, 'платье', lex, T0)
    await noteConfusion(it, 'платье', lex, T0 + SAME_OCCASION_MS)
    expect(await db.srs.get(pairCardId('v:платить', 'n:платье'))).toBeDefined()
  })
})

describe('leeches', () => {
  it('are rescued at the threshold, then only after more lapses', () => {
    expect(needsRescue(LEECH_LAPSES - 1)).toBe(false)
    expect(needsRescue(LEECH_LAPSES)).toBe(true)
    expect(needsRescue(LEECH_LAPSES + 1, LEECH_LAPSES)).toBe(false)
    expect(needsRescue(LEECH_LAPSES + LEECH_AGAIN, LEECH_LAPSES)).toBe(true)
  })
  it('are found among due cards by lapses across the word’s cards', async () => {
    await addWord('n:книга', T0, false)
    await addWord('n:школа', T0, false)
    await db.srs.where('lex').equals('n:книга').modify({ lapses: 2 })
    await db.srs.where('lex').equals('n:школа').modify({ lapses: 1 })
    const due = await db.srs.toArray()
    expect(await leechesToRescue(due)).toEqual([{ lex: 'n:книга', lapses: 6 }])
    await markRescued('n:книга', 6)
    expect(await leechesToRescue(due)).toEqual([])
  })
  it('keep the learner’s hook, and an empty hook removes it', async () => {
    await setHook('n:книга', '  a book with a knee  ')
    expect(await getHook('n:книга')).toBe('a book with a knee')
    await setHook('n:книга', ' ')
    expect(await getHook('n:книга')).toBe('')
  })
})

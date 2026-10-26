import { describe, expect, it } from 'vitest'
import type { Attempt } from '../db/db'
import type { Lexeme } from '../types/content.gen'
import { mulberry32 } from '../lib/rng'
import { poolUpTo } from '../lib/lexicon'
import { grade } from './grader'
import { gloss } from './generators'
import { bossHit, bossItems, recentErrorTargets, startBoss } from './boss'
import { BOARD, deal, pairItem, refill, speedWords } from './speed'

describe('boss battles', () => {
  it('hits harder on a run and ends on HP or hearts', () => {
    let s = startBoss(3)
    let h = bossHit(s, true, 1)
    expect(h.damage).toBe(1)
    h = bossHit(h.state, true, 3)
    expect(h).toMatchObject({ damage: 2, crit: true, outcome: 'won' })
    s = startBoss(10)
    for (let i = 0; i < 2; i++) s = bossHit(s, false, 0).state
    expect(bossHit(s, false, 0).outcome).toBe('lost')
  })

  it('turns recent mistakes into revenge items', async () => {
    const now = Date.now()
    const a = (lex: string, slot: string, ts: number, correct = false) => ({ ts, item: 'x', type: 'choice', level: 'A2', tags: [], lex, slot, correct, ms: 1, xp: 0 }) as Attempt
    const targets = recentErrorTargets([a('n:книга', 'pl_gen', now - 1000), a('n:книга', 'pl_gen', now - 500), a('n:стол', 'sg_ins', now - 30 * 86400000), a('n:дом', 'sg_prep', now, true)], now)
    expect(targets).toEqual([{ lex: 'n:книга', slot: 'pl_gen' }])
    const pool = await poolUpTo('A2')
    const lexemes = new Map(pool.map((x) => [x.id, x] as const))
    const items = bossItems([], targets, lexemes, 10)
    expect(items).toHaveLength(1)
    expect(items[0]!.accept).toContain('книг')
  })
})

describe('speed match', () => {
  it('deals distinct words and never gives the newcomer away', async () => {
    const pool = await poolUpTo('A2')
    const rng = mulberry32(5)
    const q = speedWords(pool, rng, 40)
    expect(new Set(q.map((x) => gloss(x).toLowerCase())).size).toBe(q.length)
    let b = deal(q, rng)
    for (let n = 0; n < 60; n++) {
      const lx = b.ru[0]!
      const enIdx = b.en.findIndex((x) => x?.id === lx.id)
      const item = pairItem(lx, b)
      expect(grade(item, { kind: 'choice', value: gloss(b.en[enIdx]!) }, {}).correct).toBe(true)
      b = refill(b, 0, enIdx, q, rng)
      const ru = b.ru.filter((x): x is Lexeme => !!x).map((x) => x.id).sort()
      const en = b.en.filter((x): x is Lexeme => !!x).map((x) => x.id).sort()
      expect(ru).toEqual(en)
      expect(new Set(ru).size).toBe(BOARD)
    }
  })
})

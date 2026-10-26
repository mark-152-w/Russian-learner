import { beforeAll, describe, expect, it } from 'vitest'
import { loadChunk } from '../lib/lexicon'
import { loadHandwritten } from '../lib/content'
import { loadSentences } from '../lib/sentences'
import { mulberry32 } from '../lib/rng'
import { grade } from './grader'
import {
  initPlacement, nextSkill, PL_LEVELS, placementItem, placementResult, recordAnswer, skillLevel, SKILLS,
  type PlacementBank, type PlacementState, type Skill,
} from './placement'

let bank: PlacementBank

beforeAll(async () => {
  const words = { A1: await loadChunk('A1'), A2: await loadChunk('A2'), B1: await loadChunk('B1'), B2: await loadChunk('B2'), C1: await loadChunk('C1') }
  bank = {
    lexemes: new Map(Object.values(words).flat().map((x) => [x.id, x])),
    words,
    sentences: { A1: await loadSentences('A1'), A2: await loadSentences('A2'), B1: await loadSentences('B1'), B2: await loadSentences('B2'), C1: await loadSentences('C1') },
    handwritten: [...(await loadHandwritten()).values()],
  }
}, 120_000)

/** Simulate a learner who answers correctly exactly at or below `trueLevel` for every skill. */
function simulate(trueLevel: number): PlacementState {
  let st = initPlacement()
  let s: Skill | null
  while ((s = nextSkill(st))) st = recordAnswer(st, s, st[s].level <= trueLevel)
  return st
}

describe('placement staircase', () => {
  it('asks 5 items per skill, interleaved', () => {
    let st = initPlacement()
    const seen: Skill[] = []
    let s: Skill | null
    while ((s = nextSkill(st))) {
      seen.push(s)
      st = recordAnswer(st, s, true)
    }
    expect(seen).toHaveLength(25)
    expect(seen.slice(0, 5).sort()).toEqual([...SKILLS].sort())
  })
  it('recovers the true level of a consistent learner', () => {
    for (let lvl = 0; lvl < PL_LEVELS.length; lvl++) {
      const r = placementResult(simulate(lvl))
      expect(r.level).toBe(PL_LEVELS[lvl])
    }
  })
  it('a learner who gets everything wrong lands at A1, everything right at C1', () => {
    let st = initPlacement()
    let s: Skill | null
    while ((s = nextSkill(st))) st = recordAnswer(st, s, false)
    expect(placementResult(st).level).toBe('A1')
    expect(placementResult(simulate(9)).level).toBe('C1')
    expect(placementResult(simulate(9)).knownRank).toBe(5500)
  })
  it('skill level needs at least as many right as wrong at that level', () => {
    expect(skillLevel({ level: 2, history: [{ level: 1, correct: true }, { level: 2, correct: false }, { level: 1, correct: true }] })).toBe(1)
  })
})

describe('placement item bank', () => {
  it('produces a correct-answerable item for every skill at every level', () => {
    const rng = mulberry32(3)
    for (const skill of SKILLS) {
      for (const level of PL_LEVELS) {
        const it = placementItem(skill, level, bank, rng, new Set())
        expect(it, `${skill} ${level}`).not.toBeNull()
        const value = it!.choices ? it!.choices[it!.answerIndex!]! : it!.accept![0]!
        expect(grade(it!, { kind: 'choice', value }, { lexemes: bank.lexemes }).correct, `${skill} ${level} ${it!.id}`).toBe(true)
      }
    }
  })
})

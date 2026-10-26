// Adaptive placement: one staircase per skill. Right → one level up, wrong → one level down.
// A skill's level is the highest level the learner answered correctly at least as often as not.
import type { ExerciseItem, Lexeme, Sentence } from '../types/content.gen'
import { pick, shuffle, type Rng } from '../lib/rng'
import { wordTokens } from '../lib/sentences'
import { choiceItem, isDrillable, meaningItem } from './generators'
import { caseClozeItems, verbClozeItems } from './sentenceGen'

export type Skill = 'cases' | 'verbs' | 'aspect' | 'vocab' | 'reading'
export const SKILLS: Skill[] = ['cases', 'verbs', 'aspect', 'vocab', 'reading']
export const PL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export type PlLevel = (typeof PL_LEVELS)[number]
export const ITEMS_PER_SKILL = 5
const START = 1 // A2

export interface SkillState {
  level: number
  history: { level: number; correct: boolean }[]
}
export type PlacementState = Record<Skill, SkillState>

export function initPlacement(): PlacementState {
  return Object.fromEntries(SKILLS.map((s) => [s, { level: START, history: [] }])) as unknown as PlacementState
}

/** Round-robin over skills that still need items; null when the test is over. */
export function nextSkill(st: PlacementState): Skill | null {
  const open = SKILLS.filter((s) => st[s].history.length < ITEMS_PER_SKILL)
  if (!open.length) return null
  return open.reduce((a, b) => (st[b].history.length < st[a].history.length ? b : a))
}

export function recordAnswer(st: PlacementState, skill: Skill, correct: boolean): PlacementState {
  const s = st[skill]
  const level = Math.max(0, Math.min(PL_LEVELS.length - 1, s.level + (correct ? 1 : -1)))
  return { ...st, [skill]: { level, history: [...s.history, { level: s.level, correct }] } }
}

export function skillLevel(s: SkillState): number {
  let best = 0
  for (let l = 0; l < PL_LEVELS.length; l++) {
    const at = s.history.filter((h) => h.level === l)
    const right = at.filter((h) => h.correct).length
    if (right >= 1 && right >= at.length - right) best = l
  }
  return best
}

export interface PlacementResult {
  level: PlLevel
  skills: Record<Skill, PlLevel>
  /** Words more frequent than this are assumed known. */
  knownRank: number
}

const KNOWN_RANK = [150, 600, 1500, 3000, 5500]

export function placementResult(st: PlacementState): PlacementResult {
  const levels = SKILLS.map((s) => skillLevel(st[s]))
  const median = [...levels].sort((a, b) => a - b)[Math.floor(levels.length / 2)]!
  return {
    level: PL_LEVELS[median]!,
    skills: Object.fromEntries(SKILLS.map((s, i) => [s, PL_LEVELS[levels[i]!]!])) as Record<Skill, PlLevel>,
    knownRank: KNOWN_RANK[levels[SKILLS.indexOf('vocab')]!]!,
  }
}

// ------------------------------------------------------------------ item bank
export interface PlacementBank {
  lexemes: Map<string, Lexeme>
  sentences: Record<PlLevel, Sentence[]>
  words: Record<PlLevel, Lexeme[]>
  handwritten: ExerciseItem[]
}

/** A choice version of a cloze item (placement favours quick choices over typing). */
function asChoice(it: ExerciseItem, lexemes: Map<string, Lexeme>, rng: Rng): ExerciseItem | null {
  const lx = it.target ? lexemes.get(it.target.lex) : undefined
  const ch = lx && it.target ? choiceItem(lx, it.target.slot, rng) : null
  if (!ch?.distractors) return null
  return { ...it, type: 'choice', distractors: ch.distractors }
}

export function placementItem(skill: Skill, level: PlLevel, bank: PlacementBank, rng: Rng, used: Set<string>): ExerciseItem | null {
  const fresh = (xs: ExerciseItem[]) => xs.filter((x) => !used.has(x.id))
  const sents = shuffle(rng, bank.sentences[level]).slice(0, 80)
  if (skill === 'cases') {
    for (const s of sents) {
      const c = fresh(caseClozeItems(s, bank.lexemes, { choice: true, rng }))
      if (c.length) return pick(rng, c)
    }
  }
  if (skill === 'verbs') {
    for (const s of sents) {
      const c = fresh(verbClozeItems(s, bank.lexemes)).map((x) => asChoice(x, bank.lexemes, rng)).filter((x): x is ExerciseItem => !!x)
      if (c.length) return pick(rng, c)
    }
  }
  if (skill === 'aspect') {
    const order = [level, ...PL_LEVELS.filter((l) => l !== level)]
    for (const l of order) {
      const c = fresh(bank.handwritten.filter((h) => h.level === l && h.tags.some((t) => t.startsWith('aspect.'))))
      if (c.length) return pick(rng, c)
    }
  }
  if (skill === 'vocab') {
    const pool = bank.words[level].filter((x) => isDrillable(x))
    for (let i = 0; i < 20; i++) {
      const it = meaningItem(pick(rng, pool), bank.words[level], rng)
      if (it && !used.has(it.id)) return it
    }
  }
  if (skill === 'reading') {
    const pool = bank.sentences[level].filter((s) => wordTokens(s).length >= 4)
    for (let i = 0; i < 20; i++) {
      const s = pick(rng, pool)
      const id = `pl:read:${s.id}`
      if (used.has(id)) continue
      const others = shuffle(rng, pool.filter((x) => x.id !== s.id && Math.abs(x.w.length - s.w.length) <= 2))
        .map((x) => x.en[0]!)
        .filter((e, j, a) => e !== s.en[0] && a.indexOf(e) === j)
        .slice(0, 3)
      if (others.length < 3) continue
      const choices = shuffle(rng, [s.en[0]!, ...others])
      return {
        id, type: 'choice', level, tags: ['reading'], source: 'generated',
        prompt: { ru: s.ru, instruction: 'What does this mean?' }, choices, answerIndex: choices.indexOf(s.en[0]!),
      }
    }
  }
  return null
}

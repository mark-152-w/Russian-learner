// XP and combos. Rewards track genuine learning: harder items and weaker recall pay more,
// items known cold pay little, and the same item repeated within REPEAT_WINDOW_MS pays nothing.
import type { ExerciseItem } from '../types/content.gen'

export type ItemType = ExerciseItem['type']
export type Level = ExerciseItem['level']

export const REPEAT_WINDOW_MS = 10 * 60 * 1000

export const BASE_XP: Record<ItemType, number> = {
  choice: 4,
  'listen-choose': 4,
  stress: 3,
  match: 6,
  'find-error': 6,
  'choice-reason': 6,
  'self-graded': 6,
  cloze: 8,
  transform: 8,
  tiles: 10,
  dictation: 10,
}

export const LEVEL_FACTOR: Record<Level, number> = { A1: 0.8, A2: 1, B1: 1.25, B2: 1.5, C1: 1.75, C2: 2 }

/** Combo = consecutive correct answers including this one. */
export function comboMultiplier(combo: number): 1 | 2 | 3 | 5 {
  if (combo >= 20) return 5
  if (combo >= 10) return 3
  if (combo >= 5) return 2
  return 1
}

/** Answers until the next multiplier step (0 at ×5). */
export function comboToNext(combo: number): number {
  for (const step of [5, 10, 20]) if (combo < step) return step - combo
  return 0
}

export interface XpInput {
  type: ItemType
  level: Level
  correct: boolean
  /** FSRS retrievability before this review (SRS items); null for non-SRS items. */
  recall?: number | null
  /** Learner's mastery (0..1) of the item's main grammar tag, for non-SRS items. */
  mastery?: number
  combo: number
  golden: boolean
  happyHour: boolean
  /** Active chest boost multiplier (1 = none). */
  boost: number
  /** Same item already rewarded within REPEAT_WINDOW_MS. */
  repeat: boolean
}

export interface XpResult {
  xp: number
  multiplier: number
  freshness: number
}

export function answerXp(i: XpInput): XpResult {
  const multiplier = comboMultiplier(i.combo) * (i.golden ? 5 : 1) * (i.happyHour ? 2 : 1) * i.boost
  if (!i.correct || i.repeat) return { xp: 0, multiplier, freshness: 0 }
  // How much this answer says about learning: low recall / low mastery = real work.
  const freshness =
    i.recall !== null && i.recall !== undefined ? 0.15 + 0.85 * (1 - i.recall) : 0.3 + 0.7 * (1 - (i.mastery ?? 0))
  const raw = BASE_XP[i.type] * LEVEL_FACTOR[i.level] * freshness
  return { xp: Math.max(1, Math.round(raw * multiplier)), multiplier, freshness }
}

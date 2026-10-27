// Grammar mastery fades between practice sessions (the forgetting curve). The learner model stores plain
// recent accuracy; recallScore() discounts it by the days since the topic was last practised, so a topic
// mastered weeks ago comes back as "due for a refresh". More evidence decays more slowly, which spaces the
// refreshes out further each time, like spaced repetition does for words.
import type { Mastery } from '../db/db'

const DAY = 86400000

/** Days for an untouched score to halve: 30 days at 10 attempts, growing with the square root of practice. */
export function halfLifeDays(attempts: number): number {
  return Math.min(180, Math.max(20, 30 * Math.sqrt(attempts / 10)))
}

/** Estimated accuracy now: the stored score, faded by time since the last attempt. */
export function recallScore(m: Pick<Mastery, 'score' | 'attempts' | 'last'>, now: number): number {
  const days = Math.max(0, (now - m.last) / DAY)
  return m.score * 2 ** (-days / halfLifeDays(m.attempts))
}

/** Whole days since the topic was last practised. */
export const daysSince = (m: Pick<Mastery, 'last'>, now: number) => Math.max(0, Math.floor((now - m.last) / DAY))

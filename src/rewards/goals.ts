// Happy hour and the "next nearby goal" line.
import type { Rng } from '../lib/rng'
import { levelInfo } from './levels'
import { questDef, type QuestState } from './quests'
import type { StreakStatus } from './streak'

export const HAPPY_HOUR_MS = 15 * 60 * 1000
export const HAPPY_HOUR_CHANCE = 0.12

export interface HappyHour {
  day: string
  until: number
}

/** On app open: at most one roll per day; occasionally starts a 15-minute double-XP window. */
export function rollHappyHour(state: HappyHour | null, today: string, now: number, rng: Rng): { state: HappyHour | null; started: boolean } {
  if (state?.day === today) return { state, started: false }
  if (rng() < HAPPY_HOUR_CHANCE) return { state: { day: today, until: now + HAPPY_HOUR_MS }, started: true }
  return { state: { day: today, until: 0 }, started: false }
}

export const isHappyHour = (h: HappyHour | null, now: number) => !!h && now < h.until

export interface GoalInput {
  xp: number
  /** Recent average XP per correct answer (for "N more correct" estimates). */
  xpPerCorrect: number
  quests: QuestState[]
  streak: { status: StreakStatus; shown: number }
}

/** The single most reachable goal, phrased concretely. */
export function nextGoal(g: GoalInput): string {
  if (g.streak.status === 'at-risk') return `Practise today to keep your ${g.streak.shown}-day streak`
  const li = levelInfo(g.xp)
  const toLevel = li.needed - li.into
  const correctToLevel = Math.max(1, Math.ceil(toLevel / Math.max(1, g.xpPerCorrect)))
  const quest = g.quests
    .filter((q) => !q.done)
    .map((q) => ({ q, d: questDef(q.def)! }))
    .filter((x) => x.d)
    .map((x) => ({ ...x, left: x.d.target - x.q.progress }))
    .sort((a, b) => a.left / a.d.target - b.left / b.d.target)[0]
  if (quest && quest.left <= 5 && quest.left < correctToLevel) return `${quest.d.text}: ${quest.left} to go`
  const nextRank = li.nextRank && li.level + 1 === li.nextRank.minLevel ? ` and become ${li.nextRank.ru}` : ''
  return `${correctToLevel} more correct to reach level ${li.level + 1}${nextRank}`
}

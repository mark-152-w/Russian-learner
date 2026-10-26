// Daily quests (3, randomised per day) and one weekly challenge.
import { seeded, shuffle } from '../lib/rng'
import { daysBetween } from './streak'

/** Metrics fed by events. "max" metrics keep the best value instead of summing. */
export type Metric =
  | 'correct' | 'xp' | 'sessions' | 'minutes' | 'typedCorrect' | 'stressCorrect' | 'golden'
  | 'perfectSessions' | 'bestCombo' | 'activeDays' | 'reviews' | 'stories'
export const MAX_METRICS: Metric[] = ['bestCombo']

export interface QuestDef {
  id: string
  period: 'daily' | 'weekly'
  text: string
  metric: Metric
  target: number
  xp: number
  /** Only offered once this feature exists. */
  feature?: string
}

export const QUESTS: QuestDef[] = [
  { id: 'correct-25', period: 'daily', text: 'Answer 25 items correctly', metric: 'correct', target: 25, xp: 40 },
  { id: 'correct-50', period: 'daily', text: 'Answer 50 items correctly', metric: 'correct', target: 50, xp: 60 },
  { id: 'xp-200', period: 'daily', text: 'Earn 200 XP', metric: 'xp', target: 200, xp: 40 },
  { id: 'combo-20', period: 'daily', text: 'Reach a ×5 combo (20 in a row)', metric: 'bestCombo', target: 20, xp: 50 },
  { id: 'combo-10', period: 'daily', text: 'Reach a ×3 combo (10 in a row)', metric: 'bestCombo', target: 10, xp: 30 },
  { id: 'sessions-2', period: 'daily', text: 'Finish 2 sessions', metric: 'sessions', target: 2, xp: 40 },
  { id: 'minutes-15', period: 'daily', text: 'Practise for 15 minutes', metric: 'minutes', target: 15, xp: 50 },
  { id: 'typed-20', period: 'daily', text: 'Type 20 correct forms', metric: 'typedCorrect', target: 20, xp: 50 },
  { id: 'stress-15', period: 'daily', text: 'Place the stress correctly 15 times', metric: 'stressCorrect', target: 15, xp: 40 },
  { id: 'golden-1', period: 'daily', text: 'Answer a golden question', metric: 'golden', target: 1, xp: 30 },
  { id: 'perfect-1', period: 'daily', text: 'Finish a session without a mistake', metric: 'perfectSessions', target: 1, xp: 60 },
  { id: 'reviews-30', period: 'daily', text: 'Review 30 cards', metric: 'reviews', target: 30, xp: 50, feature: 'vocab' },
  { id: 'story-1', period: 'daily', text: 'Read a story', metric: 'stories', target: 1, xp: 50, feature: 'reader' },
  { id: 'w-xp-2000', period: 'weekly', text: 'Earn 2,000 XP this week', metric: 'xp', target: 2000, xp: 250 },
  { id: 'w-correct-400', period: 'weekly', text: 'Answer 400 items correctly this week', metric: 'correct', target: 400, xp: 250 },
  { id: 'w-days-5', period: 'weekly', text: 'Practise on 5 different days this week', metric: 'activeDays', target: 5, xp: 300 },
  { id: 'w-perfect-3', period: 'weekly', text: 'Finish 3 perfect sessions this week', metric: 'perfectSessions', target: 3, xp: 250 },
]

export interface QuestState {
  id: string // `${periodKey}|${defId}`
  period: string // 'd:2026-10-25' or 'w:2026-10-19'
  def: string
  progress: number
  done: boolean
}

/** Monday of the week containing `day`. */
export function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  const dow = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - dow)
  return dt.toISOString().slice(0, 10)
}

export function questDef(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id)
}

/** The quests for a day (3 daily) or week (1 weekly), stable for that period. */
export function questsForPeriod(day: string, features: Set<string>): QuestState[] {
  const avail = (p: 'daily' | 'weekly') => QUESTS.filter((q) => q.period === p && (!q.feature || features.has(q.feature)))
  const dKey = `d:${day}`
  const wKey = `w:${weekKey(day)}`
  const daily: QuestDef[] = []
  for (const q of shuffle(seeded(dKey), avail('daily'))) {
    // never two quests on the same metric in one day
    if (daily.some((x) => x.metric === q.metric)) continue
    daily.push(q)
    if (daily.length === 3) break
  }
  const weekly = shuffle(seeded(wKey), avail('weekly'))[0]!
  return [
    ...daily.map((q) => ({ id: `${dKey}|${q.id}`, period: dKey, def: q.id, progress: 0, done: false })),
    { id: `${wKey}|${weekly.id}`, period: wKey, def: weekly.id, progress: 0, done: false },
  ]
}

export type QuestEvent = Partial<Record<Metric, number>>

/** Apply an event; returns the new state and whether it just completed. */
export function applyQuestEvent(q: QuestState, ev: QuestEvent): { quest: QuestState; completed: boolean } {
  const def = questDef(q.def)
  if (!def || q.done) return { quest: q, completed: false }
  const v = ev[def.metric]
  if (v === undefined) return { quest: q, completed: false }
  const progress = MAX_METRICS.includes(def.metric) ? Math.max(q.progress, v) : q.progress + v
  const done = progress >= def.target
  return { quest: { ...q, progress: Math.min(progress, def.target), done }, completed: done }
}

export const isCurrent = (q: QuestState, day: string) =>
  q.period === `d:${day}` || (q.period.startsWith('w:') && daysBetween(q.period.slice(2), day) < 7 && daysBetween(q.period.slice(2), day) >= 0)

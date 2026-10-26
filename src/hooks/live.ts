// Live views of learner state (re-render when IndexedDB changes).
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_PROFILE, getProfile, getStats } from '../rewards/service'
import type { Stats } from '../rewards/achievements'
import { isCurrent, type QuestState } from '../rewards/quests'
import { dayKey } from '../rewards/streak'

export const useProfile = () => useLiveQuery(getProfile, [], DEFAULT_PROFILE)
export const useStats = () => useLiveQuery(getStats, [], {} as Stats)
export const useUnlocked = () => useLiveQuery(async () => new Map((await db.achievements.toArray()).map((a) => [a.id, a.ts])), [], new Map<string, number>())

export function useToday() {
  const day = dayKey(Date.now())
  return useLiveQuery(async () => (await db.days.get(day)) ?? { day, seconds: 0, xp: 0, answers: 0, correct: 0, sessions: 0 }, [day])
}

export function useQuests(): QuestState[] {
  const day = dayKey(Date.now())
  return useLiveQuery(async () => (await db.quests.toArray()).filter((q) => isCurrent(q, day)), [day], [])
}

/** Re-render every `ms` (for countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

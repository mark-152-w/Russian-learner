// Daily streaks with earnable freezes. Day keys are local dates (YYYY-MM-DD).
import { MAX_FREEZES } from './chest'

export interface Streak {
  current: number
  longest: number
  lastDay: string | null
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  return Math.round((Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!) - Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!)) / 86400000)
}

export interface StreakUpdate {
  streak: Streak
  freezes: number
  usedFreezes: number
  extended: boolean
  /** A freeze earned for reaching a 7-day milestone. */
  earnedFreeze: boolean
}

/** Record that the learner completed a qualifying session today. */
export function applyActivity(s: Streak, freezes: number, today: string): StreakUpdate {
  if (s.lastDay === today) return { streak: s, freezes, usedFreezes: 0, extended: false, earnedFreeze: false }
  let current = 1
  let used = 0
  if (s.lastDay) {
    const gap = daysBetween(s.lastDay, today)
    if (gap === 1) current = s.current + 1
    else if (gap > 1 && freezes >= gap - 1) {
      used = gap - 1
      current = s.current + 1
    }
  }
  let f = freezes - used
  const earned = current % 7 === 0 && f < MAX_FREEZES
  if (earned) f++
  return {
    streak: { current, longest: Math.max(s.longest, current), lastDay: today },
    freezes: f,
    usedFreezes: used,
    extended: true,
    earnedFreeze: earned,
  }
}

export type StreakStatus = 'done-today' | 'at-risk' | 'protected' | 'broken' | 'none'

/** For display: is the streak still alive, and does it need today's practice? */
export function streakStatus(s: Streak, freezes: number, today: string): { status: StreakStatus; shown: number } {
  if (!s.lastDay || s.current === 0) return { status: 'none', shown: 0 }
  const gap = daysBetween(s.lastDay, today)
  if (gap <= 0) return { status: 'done-today', shown: s.current }
  if (gap === 1) return { status: 'at-risk', shown: s.current }
  if (freezes >= gap - 1) return { status: 'protected', shown: s.current }
  return { status: 'broken', shown: 0 }
}

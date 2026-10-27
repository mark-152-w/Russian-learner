// Pure summaries for the stats dashboard, from the per-day totals and the learner model.
import type { Day, Mastery } from '../db/db'
import { dayKey } from '../rewards/streak'

const DAY_MS = 86400000
const parse = (day: string) => new Date(`${day}T12:00:00`)
const key = (d: Date) => dayKey(d.getTime())
/** Noon on the Monday of the week containing `day`. */
const mondayOf = (day: string) => {
  const t = parse(day)
  return new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY_MS)
}

export interface CalendarCell {
  day: string
  answers: number
  minutes: number
  /** 0 = nothing, 1–4 = quartiles of the busiest days shown. */
  level: number
  future: boolean
}

/** `weeks` columns of Monday-to-Sunday cells, ending with the week of `today`. */
export function calendar(days: Day[], today: string, weeks = 18): CalendarCell[][] {
  const byDay = new Map(days.map((d) => [d.day, d]))
  const monday = mondayOf(today)
  const start = new Date(monday.getTime() - (weeks - 1) * 7 * DAY_MS)
  const cols: CalendarCell[][] = []
  const counts: number[] = []
  for (let w = 0; w < weeks; w++) {
    const col: CalendarCell[] = []
    for (let i = 0; i < 7; i++) {
      const d = key(new Date(start.getTime() + (w * 7 + i) * DAY_MS))
      const row = byDay.get(d)
      const answers = row?.answers ?? 0
      if (answers) counts.push(answers)
      col.push({ day: d, answers, minutes: Math.round((row?.seconds ?? 0) / 60), level: 0, future: d > today })
    }
    cols.push(col)
  }
  const max = Math.max(1, ...counts)
  for (const col of cols) for (const c of col) c.level = c.answers ? Math.min(4, Math.ceil((4 * c.answers) / max)) : 0
  return cols
}

/** XP per week (Monday start) for the last `weeks` weeks, oldest first. */
export function weeklyXp(days: Day[], today: string, weeks = 12): { week: string; xp: number }[] {
  const monday = mondayOf(today)
  return Array.from({ length: weeks }, (_, i) => {
    const from = new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY_MS)
    const keys = new Set(Array.from({ length: 7 }, (_, j) => key(new Date(from.getTime() + j * DAY_MS))))
    return { week: key(from), xp: days.filter((d) => keys.has(d.day)).reduce((a, d) => a + d.xp, 0) }
  })
}

export const CASES = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'] as const

/** Accuracy per case from the form rows of the learner model (form:pos:case:number:gender). */
export function caseAccuracy(rows: Mastery[]): { case: (typeof CASES)[number]; attempts: number; correct: number }[] {
  return CASES.map((c) => {
    const hit = rows.filter((m) => m.kind === 'form' && (m.key.split(':')[2] === c || (c === 'prep' && m.key.split(':')[2] === 'loc2')))
    return { case: c, attempts: hit.reduce((a, m) => a + m.attempts, 0), correct: hit.reduce((a, m) => a + m.correct, 0) }
  })
}

/** The learner's most frequent error types (from the err: rows). */
export function topErrors(rows: Mastery[], n = 5): { id: string; count: number }[] {
  return rows
    .filter((m) => m.kind === 'err')
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, n)
    .map((m) => ({ id: m.key.slice(4), count: m.attempts }))
}

export interface Totals {
  minutes: number
  answers: number
  accuracy: number
  activeDays: number
}
export function totals(days: Day[]): Totals {
  const answers = days.reduce((a, d) => a + d.answers, 0)
  const correct = days.reduce((a, d) => a + d.correct, 0)
  return {
    minutes: Math.round(days.reduce((a, d) => a + d.seconds, 0) / 60),
    answers,
    accuracy: answers ? correct / answers : 0,
    activeDays: days.filter((d) => d.answers > 0).length,
  }
}

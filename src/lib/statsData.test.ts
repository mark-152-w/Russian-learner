import { describe, expect, it } from 'vitest'
import type { Day, Mastery } from '../db/db'
import { calendar, caseAccuracy, topErrors, totals, weeklyXp } from './statsData'

const d = (day: string, answers: number, xp = answers * 10): Day => ({ day, answers, correct: Math.round(answers * 0.8), seconds: answers * 20, xp, sessions: 1 })
const days = [d('2026-10-26', 40), d('2026-10-20', 10), d('2026-09-01', 5)]

describe('stats', () => {
  it('lays out a Monday-first calendar ending this week, with quartile levels', () => {
    const cols = calendar(days, '2026-10-26', 18)
    expect(cols).toHaveLength(18)
    expect(cols.every((c) => c.length === 7)).toBe(true)
    const last = cols[17]!
    expect(last[0]!.day).toBe('2026-10-26') // a Monday
    expect(last[0]!.level).toBe(4)
    expect(last[1]!.future).toBe(true)
    expect(cols.flat().find((c) => c.day === '2026-10-20')!.level).toBe(1)
  })
  it('sums XP by week', () => {
    const w = weeklyXp(days, '2026-10-26', 3)
    expect(w.map((x) => x.xp)).toEqual([0, 100, 400])
    expect(w[2]!.week).toBe('2026-10-26')
  })
  it('totals and accuracy by case', () => {
    expect(totals(days)).toMatchObject({ answers: 55, activeDays: 3 })
    const m = (key: string, attempts: number, correct: number): Mastery => ({ key, kind: key.split(':')[0] as Mastery['kind'], attempts, correct, score: 0, last: 0 })
    const rows = [m('form:noun:gen:pl:f', 10, 4), m('form:adj:gen:sg:m', 5, 5), m('form:noun:loc2:sg:m', 2, 2), m('err:case.wrong', 7, 0), m('err:stress.wrong', 2, 0)]
    expect(caseAccuracy(rows).find((c) => c.case === 'gen')).toMatchObject({ attempts: 15, correct: 9 })
    expect(caseAccuracy(rows).find((c) => c.case === 'prep')).toMatchObject({ attempts: 2 })
    expect(topErrors(rows)[0]).toEqual({ id: 'case.wrong', count: 7 })
  })
})

import { describe, expect, it } from 'vitest'
import type { Mastery } from '../db/db'
import type { Unit } from '../types/content.gen'
import { planSteps, weakestTag } from './plan'

const m = (key: string, score: number, attempts = 10): Mastery => ({ key, kind: 'tag', attempts, correct: 0, score, last: 0 })
const unit = { id: 'u-a2-03', number: 3, level: 'A2', title: { en: 'Where things are' } } as Unit
const base = { due: 12, doneKinds: new Set<string>(), next: unit, progress: {}, tagMastery: [], features: new Set(['vocab', 'course']) }

describe('daily plan', () => {
  it('lists reviews, the next lesson and a fun drill', () => {
    const s = planSteps(base)
    expect(s.map((x) => x.id)).toEqual(['review', 'course', 'fun'])
    expect(s[0]!.title).toBe('Review 12 cards')
    expect(s[1]!.to).toBe('/lesson/u-a2-03/lesson')
    expect(s.every((x) => !x.done)).toBe(true)
  })
  it('suggests the checkpoint once the lesson has been taken', () => {
    const s = planSteps({ ...base, progress: { 'u-a2-03': { lessons: 1, best: 0 } } })
    expect(s[1]!.to).toBe('/lesson/u-a2-03/check')
  })
  it('ticks steps off from today’s sessions', () => {
    const s = planSteps({ ...base, due: 0, doneKinds: new Set(['review', 'lesson', 'drill-tag-stress']) })
    expect(s.every((x) => x.done)).toBe(true)
  })
  it('reviews are not done while cards are still due', () => {
    expect(planSteps({ ...base, doneKinds: new Set(['review']) })[0]!.done).toBe(false)
  })
  it('picks the weakest topic with enough evidence', () => {
    const rows = [m('tag:case.gen', 0.6), m('tag:case.dat', 0.4, 3), m('tag:verb.past', 0.5), m('tag:case.acc', 0.9)]
    expect(weakestTag(rows)?.key).toBe('tag:verb.past')
    const s = planSteps({ ...base, tagMastery: rows })
    expect(s.find((x) => x.id === 'weak')?.to).toBe('/drill/tag/verb.past')
  })
  it('brings back a strong topic that has not been practised for a while', () => {
    const DAY = 86400000
    const now = 60 * DAY
    const rows = [{ ...m('tag:case.gen', 0.95), last: now - 2 * DAY }, { ...m('tag:verb.past', 0.95), last: now - 30 * DAY }]
    expect(weakestTag(rows)).toBeUndefined()
    expect(weakestTag(rows, now)).toMatchObject({ key: 'tag:verb.past', stale: true })
    const s = planSteps({ ...base, tagMastery: rows, now }).find((x) => x.id === 'weak')!
    expect(s.title).toMatch(/^Refresh: /)
    expect(s.detail).toMatch(/^Last practised 30 days ago/)
    // a genuinely weak topic is still called a weak spot
    const weak = planSteps({ ...base, tagMastery: [{ ...m('tag:case.dat', 0.5), last: now }], now }).find((x) => x.id === 'weak')!
    expect(weak.title).toMatch(/^Weak spot: /)
  })
  it('offers an evening review of today’s new words, after the reviews', () => {
    const s = planSteps({ ...base, newToday: 5 })
    expect(s.map((x) => x.id)).toEqual(['review', 'evening', 'course', 'fun'])
    expect(s[1]).toMatchObject({ title: "Evening review: today's 5 new words", to: '/review/evening', done: false })
    expect(planSteps({ ...base, newToday: 5, doneKinds: new Set(['evening']) })[1]!.done).toBe(true)
    expect(planSteps({ ...base, newToday: 2 }).map((x) => x.id)).not.toContain('evening')
  })
  it('rotates the light item through the trainers', () => {
    const t = { ...base, features: new Set(['trainers']) }
    const days = [0, 1, 2, 3, 4].map((d) => planSteps({ ...t, dayIndex: d }).find((x) => x.id === 'fun')!.to)
    expect(new Set(days).size).toBe(5)
    expect(planSteps({ ...t, dayIndex: 1, doneKinds: new Set(['trainer-cases']) }).find((x) => x.id === 'fun')!.done).toBe(true)
  })
  it('hides sections whose feature is off', () => {
    expect(planSteps({ ...base, features: new Set() }).map((x) => x.id)).toEqual(['fun'])
  })
})

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
  it('hides sections whose feature is off', () => {
    expect(planSteps({ ...base, features: new Set() }).map((x) => x.id)).toEqual(['fun'])
  })
})

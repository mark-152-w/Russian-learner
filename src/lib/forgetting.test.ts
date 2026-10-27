import { describe, expect, it } from 'vitest'
import { daysSince, halfLifeDays, recallScore } from './forgetting'

const DAY = 86400000

describe('grammar mastery fades with time', () => {
  it('is unchanged right after practice and halves after one half-life', () => {
    const m = { score: 0.9, attempts: 10, last: 0 }
    expect(recallScore(m, 0)).toBe(0.9)
    expect(recallScore(m, halfLifeDays(10) * DAY)).toBeCloseTo(0.45)
    expect(daysSince(m, 3.5 * DAY)).toBe(3)
  })
  it('fades more slowly the more a topic has been practised', () => {
    expect(halfLifeDays(10)).toBeLessThan(halfLifeDays(40))
    expect(halfLifeDays(1)).toBe(20)
    expect(halfLifeDays(100000)).toBe(180)
    const after = (attempts: number) => recallScore({ score: 0.95, attempts, last: 0 }, 21 * DAY)
    expect(after(10)).toBeLessThan(0.75)
    expect(after(60)).toBeGreaterThan(0.75)
  })
})

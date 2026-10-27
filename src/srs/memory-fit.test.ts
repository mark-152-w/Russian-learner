import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../lib/rng'
import { Rating, State, type SrsReviewLog } from './fsrs'
import { curveReport, fitMemory, fitStrength, intervalAt, observations, recallAt, retentionFor, reviewsPerDay, usableK, type Observation } from './memory'

const DAY = 86400000

/** Reviews of a learner whose memories last k times as long as FSRS assumes. */
function simulate(k: number, n: number): Observation[] {
  const rng = mulberry32(42)
  return Array.from({ length: n }, () => {
    const s = 1 + rng() * 60
    const t = 1 + rng() * 3 * s
    return { t, s, recalled: rng() < recallAt(t, k * s) }
  })
}

describe('a forgetting curve fitted to the learner', () => {
  it('recovers a memory strength from reviews', () => {
    expect(fitStrength(simulate(1.6, 3000))).toBeCloseTo(1.6, 0)
    expect(Math.abs(fitStrength(simulate(1.6, 3000)) - 1.6)).toBeLessThan(0.15)
    expect(Math.abs(fitStrength(simulate(0.7, 3000)) - 0.7)).toBeLessThan(0.08)
  })
  it('stays near average without evidence', () => {
    expect(fitStrength([])).toBeCloseTo(1, 5)
    expect(usableK({ k: 2, n: 10, recalled: 1, predicted: 0.9, at: 0 })).toBe(1)
    expect(usableK({ k: 2, n: 300, recalled: 1, predicted: 0.9, at: 0 })).toBe(2)
  })
  it('stretches intervals by the strength while keeping the learner’s target', () => {
    // stability is, by definition, the interval at which recall is 90%
    expect(intervalAt(10, 0.9)).toBeCloseTo(10, 6)
    expect(retentionFor(0.9, 1)).toBeCloseTo(0.9, 6)
    for (const k of [0.6, 1.5]) {
      const r = retentionFor(0.9, k)
      expect(intervalAt(10, r)).toBeCloseTo(intervalAt(10 * k, 0.9), 6)
      // what the learner actually retains at that interval is the target
      expect(recallAt(intervalAt(10, r), 10 * k)).toBeCloseTo(0.9, 6)
    }
    expect(retentionFor(0.9, 2)).toBeLessThan(0.9)
  })
  it('replays the log into reviews of learned words at least a day apart', () => {
    const T0 = new Date(2026, 3, 1, 9).getTime()
    const log = (ts: number, rating: Rating): SrsReviewLog => ({ card: 'c', ts, rating, state: State.New, scheduled_days: 0 })
    const logs = [log(T0, Rating.Good), log(T0 + 600_000, Rating.Good), log(T0 + 4 * DAY, Rating.Good), log(T0 + 30 * DAY, Rating.Again)]
    const obs = observations(logs)
    expect(obs.length).toBeGreaterThanOrEqual(1)
    expect(obs.at(-1)!.recalled).toBe(false)
    expect(obs.every((o) => o.t >= 1 && o.s > 0)).toBe(true)
    expect(fitMemory(logs, T0).n).toBe(obs.length)
  })
  it('costs more reviews a day to remember more', () => {
    const cards = [1, 5, 20, 60].map((stability) => ({ state: State.Review, stability }))
    expect(reviewsPerDay(cards, 0.95)).toBeGreaterThan(reviewsPerDay(cards, 0.9))
    expect(reviewsPerDay(cards, 0.9)).toBeGreaterThan(reviewsPerDay(cards, 0.85))
  })
})

describe('the forgetting-curve chart data', () => {
  it('places reviews on a typical card’s timescale and bins actual recall', () => {
    const obs = simulate(1.3, 2000)
    const r = curveReport(obs, [4, 10, 30], 1.3)
    expect(r.sRef).toBe(10)
    expect(r.days).toBeGreaterThanOrEqual(2.5 * 1.3 * 10)
    expect(r.bins.length).toBeGreaterThan(3)
    for (const [t, share, n] of r.bins) {
      expect(t).toBeLessThanOrEqual(r.days)
      expect(n).toBeGreaterThanOrEqual(8)
      // binned actual recall sits near the learner's curve, not the average one
      expect(Math.abs(share - recallAt(t, 1.3 * r.sRef))).toBeLessThan(0.08)
    }
  })
})

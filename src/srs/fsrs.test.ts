import { beforeAll, describe, expect, it } from 'vitest'
import { isDue, isKnown, newCard, ratingFor, Rating, retrievability, reviewCard, setScheduler, State, type SrsCard } from './fsrs'

const DAY = 86400000
const T0 = Date.UTC(2026, 0, 1, 9)

beforeAll(() => setScheduler({ fuzz: false }))

const fresh = () => newCard({ id: 'vocab:n:книга:ru-en', kind: 'vocab', dir: 'ru-en', lex: 'n:книга' }, T0)

function run(ratings: Rating[], gapDays = 0): SrsCard {
  let c = fresh()
  let now = T0
  for (const r of ratings) {
    c = reviewCard(c, r as never, now).card
    now = Math.max(c.due, now + gapDays * DAY)
  }
  return c
}

describe('FSRS scheduling', () => {
  it('new cards are due immediately and unknown', () => {
    const c = fresh()
    expect(c.state).toBe(State.New)
    expect(isDue(c, T0)).toBe(true)
    expect(retrievability(c, T0)).toBe(0)
    expect(isKnown(c)).toBe(false)
  })

  it('better ratings schedule further out', () => {
    const again = reviewCard(fresh(), Rating.Again, T0).card
    const good = reviewCard(fresh(), Rating.Good, T0).card
    const easy = reviewCard(fresh(), Rating.Easy, T0).card
    expect(again.due).toBeLessThanOrEqual(good.due)
    expect(good.due).toBeLessThan(easy.due)
  })

  it('successive Good reviews grow the interval; a lapse shrinks it', () => {
    const c = run([Rating.Good, Rating.Good, Rating.Good, Rating.Good])
    expect(c.state).toBe(State.Review)
    expect(c.scheduled_days).toBeGreaterThan(7)
    const lapsed = reviewCard(c, Rating.Again, c.due).card
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.due - c.due).toBeLessThan(c.scheduled_days * DAY)
  })

  it('retrievability decays over time and resets after review', () => {
    const c = run([Rating.Good, Rating.Good, Rating.Good])
    const r1 = retrievability(c, c.due)
    const r2 = retrievability(c, c.due + 60 * DAY)
    expect(r1).toBeGreaterThan(0.8)
    expect(r2).toBeLessThan(r1)
  })

  it('stores plain numbers (JSON-safe)', () => {
    const c = run([Rating.Good])
    expect(JSON.parse(JSON.stringify(c))).toEqual(c)
  })

  it('a word becomes known after stable reviews', () => {
    expect(isKnown(run([Rating.Good, Rating.Good, Rating.Good, Rating.Good, Rating.Good]))).toBe(true)
  })
})

describe('ratingFor', () => {
  it('maps verdicts to ratings', () => {
    expect(ratingFor({ correct: false }, 1000, true)).toBe(Rating.Again)
    expect(ratingFor({ correct: true, note: 'typo' }, 3000, true)).toBe(Rating.Hard)
    expect(ratingFor({ correct: true }, 30000, true)).toBe(Rating.Hard)
    expect(ratingFor({ correct: true }, 3000, true)).toBe(Rating.Good)
    const mature = run([Rating.Good, Rating.Good, Rating.Good])
    expect(ratingFor({ correct: true }, 3000, true, mature)).toBe(Rating.Easy)
  })
})

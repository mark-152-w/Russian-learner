// A forgetting curve fitted to the learner. FSRS's default parameters describe an average learner. This finds one
// number, the learner's memory strength k: how much longer (k > 1) or shorter (k < 1) their memories last than FSRS
// predicts. It's a maximum-likelihood fit over their own reviews, with a prior that keeps k near 1 until the
// evidence says otherwise. The scheduler then aims at the requested retention that makes the learner's *actual*
// retention match the target they chose.
import { computeDecayFactor, createEmptyCard, default_w, forgetting_curve, fsrs, generatorParameters, State, type Card, type Grade } from 'ts-fsrs'
import { db, getKV, setKV } from '../db/db'
import { loadSettings } from '../db/settings'
import { Rating, type SrsCard, type SrsReviewLog } from './fsrs'

const DAY = 86400000
// FSRS's curve is R = (1 + factor·t/S)^decay, with decay negative
const { decay, factor } = computeDecayFactor(default_w)

/** One review of a learned word: days since the last review, FSRS's stability then, and whether it was recalled. */
export interface Observation {
  t: number
  s: number
  recalled: boolean
}

export interface MemoryFit {
  /** Memory strength relative to FSRS's average learner (1 = average). */
  k: number
  /** Observations the fit used. */
  n: number
  /** Share of those reviews recalled, and the share FSRS's default curve predicted. */
  recalled: number
  predicted: number
  at: number
}

/** Observations before the fit is used for scheduling. */
export const MIN_OBSERVATIONS = 30
/** Prior on ln k: a standard deviation of 0.5 keeps k within about ×0.4–×2.7 without strong evidence. */
const PRIOR_SD = 0.5

/** FSRS's forgetting curve: the chance of recalling after t days at stability s. */
export const recallAt = (t: number, s: number) => forgetting_curve(default_w, t, s)

/**
 * Replay the review log through FSRS's default parameters, keeping each review of a learned (Review-state) card
 * made at least a day after the previous one. Same-day steps say little about long-term forgetting.
 */
export function observations(logs: SrsReviewLog[]): Observation[] {
  const replay = fsrs(generatorParameters({ enable_fuzz: false }))
  const byCard = new Map<string, SrsReviewLog[]>()
  for (const l of logs) byCard.set(l.card, [...(byCard.get(l.card) ?? []), l])
  const out: Observation[] = []
  for (const list of byCard.values()) {
    list.sort((a, b) => a.ts - b.ts)
    let card: Card = createEmptyCard(new Date(list[0]!.ts))
    for (const l of list) {
      if (l.rating === Rating.Manual) continue
      if (card.state === State.Review && card.last_review) {
        const t = (l.ts - card.last_review.getTime()) / DAY
        if (t >= 1) out.push({ t, s: card.stability, recalled: l.rating !== Rating.Again })
      }
      card = replay.next(card, new Date(l.ts), l.rating as Grade).card
    }
  }
  return out
}

function logLikelihood(obs: Observation[], k: number): number {
  let ll = 0
  for (const o of obs) {
    const r = Math.min(1 - 1e-6, Math.max(1e-6, recallAt(o.t, k * o.s)))
    ll += o.recalled ? Math.log(r) : Math.log(1 - r)
  }
  return ll
}

/** The most likely k given the observations and the prior (golden-section search on ln k). */
export function fitStrength(obs: Observation[]): number {
  const score = (x: number) => logLikelihood(obs, Math.exp(x)) - (x * x) / (2 * PRIOR_SD * PRIOR_SD)
  let [a, b] = [Math.log(0.25), Math.log(4)]
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  for (let i = 0; i < 60; i++) {
    if (score(c) > score(d)) b = d
    else a = c
    c = b - g * (b - a)
    d = a + g * (b - a)
  }
  return Math.exp((a + b) / 2)
}

export function fitMemory(logs: SrsReviewLog[], now: number): MemoryFit {
  const obs = observations(logs)
  const k = fitStrength(obs)
  const n = obs.length
  const mean = (f: (o: Observation) => number) => (n ? obs.reduce((x, o) => x + f(o), 0) / n : 0)
  return { k, n, recalled: mean((o) => (o.recalled ? 1 : 0)), predicted: mean((o) => recallAt(o.t, o.s)), at: now }
}

/** The k scheduling uses: the fitted one once there's enough evidence, else 1. */
export const usableK = (fit: MemoryFit | null) => (fit && fit.n >= MIN_OBSERVATIONS ? fit.k : 1)

/**
 * The retention to request from FSRS so that a learner of strength k actually retains `target`. The interval for
 * retention r is S·(r^(1/decay) − 1)/factor, so stretching it by k means r' = (1 + k·(target^(1/decay) − 1))^decay.
 */
export function retentionFor(target: number, k: number): number {
  const r = (1 + k * (target ** (1 / decay) - 1)) ** decay
  return Math.min(0.99, Math.max(0.7, r))
}

/** Days until a card of stability s is due when FSRS aims at retention r. */
export const intervalAt = (s: number, r: number) => (s * (r ** (1 / decay) - 1)) / factor

/** Roughly how many reviews a day the learned cards cost at this requested retention. */
export function reviewsPerDay(cards: Pick<SrsCard, 'state' | 'stability' | 'suspended'>[], r: number): number {
  return cards.filter((c) => c.state === State.Review && !c.suspended).reduce((n, c) => n + 1 / Math.max(1, intervalAt(c.stability, r)), 0)
}

export const getFit = () => getKV<MemoryFit | null>('memory:fit', null)

/** Refit from the whole review log and store it (after a review session). */
export async function refitMemory(now: number): Promise<MemoryFit> {
  const fit = fitMemory(await db.reviews.toArray(), now)
  await setKV('memory:fit', fit)
  return fit
}

/** The retention the scheduler should request now: the learner's target, corrected by their fitted strength. */
export async function effectiveRetention(): Promise<number> {
  const [settings, fit] = await Promise.all([loadSettings(), getFit()])
  return retentionFor(settings.retention, usableK(fit))
}

export interface CurveReport {
  k: number
  n: number
  /** The typical learned card's stability (median), which the curves are drawn for. */
  sRef: number
  /** Actual recall, binned by time scaled to the typical card: [days, share recalled, reviews]. */
  bins: [number, number, number][]
  /** The chart's day range. */
  days: number
}

/**
 * What /stats draws: FSRS's curve for a typical learned card next to the learner's (stretched by k), and the
 * learner's actual recall as dots. Each review is placed at the time it would be for the typical card (t·sRef/s),
 * so reviews of cards of any strength can share one curve.
 */
export function curveReport(obs: Observation[], stabilities: number[], k: number): CurveReport {
  const sorted = [...stabilities].sort((a, b) => a - b)
  const sRef = sorted.length ? Math.max(1, sorted[Math.floor(sorted.length / 2)]!) : 10
  const days = [14, 30, 60, 90, 180, 365].find((d) => d >= 2.5 * Math.max(1, k) * sRef) ?? 365
  const BINS = 6
  const acc = Array.from({ length: BINS }, () => ({ t: 0, ok: 0, n: 0 }))
  for (const o of obs) {
    const t = (o.t * sRef) / o.s
    if (t > days) continue
    const b = acc[Math.min(BINS - 1, Math.floor((t / days) * BINS))]!
    b.t += t
    b.n++
    if (o.recalled) b.ok++
  }
  const bins = acc.filter((b) => b.n >= 8).map((b): [number, number, number] => [b.t / b.n, b.ok / b.n, b.n])
  return { k, n: obs.length, sRef, bins, days }
}

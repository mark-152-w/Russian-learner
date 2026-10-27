// Spaced repetition on top of ts-fsrs. Cards are stored with epoch-ms dates (JSON-safe for export).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade, type FSRS } from 'ts-fsrs'

export { Rating, State }

export type SrsKind = 'vocab' | 'form' | 'pair'
export type SrsDir = 'ru-en' | 'en-ru' | 'audio' | 'cloze' | 'form' | 'pair'

export interface SrsCard {
  id: string // e.g. "vocab:n:книга:ru-en", "form:n:книга:pl_gen", "pair:v:платить|n:платье"
  kind: SrsKind
  dir: SrsDir
  lex: string
  slot?: string
  /** Pair cards: the word `lex` keeps getting mixed up with. */
  other?: string
  added: number
  suspended?: boolean
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: number
}

export interface SrsReviewLog {
  card: string
  ts: number
  rating: Rating
  state: State
  scheduled_days: number
  ms?: number
}

let scheduler: FSRS = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }))

/** Tests use a fuzz-free scheduler for exact intervals. */
export function setScheduler(opts: { fuzz: boolean; retention?: number }) {
  scheduler = fsrs(generatorParameters({ enable_fuzz: opts.fuzz, request_retention: opts.retention ?? 0.9 }))
}

function toCard(c: SrsCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review !== undefined ? new Date(c.last_review) : undefined,
  }
}

function fromCard(meta: SrsCard, c: Card): SrsCard {
  return {
    ...meta,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
  }
}

export function newCard(meta: { id: string; kind: SrsKind; dir: SrsDir; lex: string; slot?: string; other?: string }, now: number): SrsCard {
  const c = createEmptyCard(new Date(now))
  return fromCard({ ...meta, added: now } as SrsCard, c)
}

export function reviewCard(card: SrsCard, rating: Grade, now: number, ms?: number): { card: SrsCard; log: SrsReviewLog } {
  const r = scheduler.next(toCard(card), new Date(now), rating)
  return {
    card: fromCard(card, r.card),
    log: { card: card.id, ts: now, rating, state: card.state, scheduled_days: r.card.scheduled_days, ms },
  }
}

/** Probability of recall right now (0 for a card never reviewed). */
export function retrievability(card: SrsCard, now: number): number {
  if (card.state === State.New) return 0
  return scheduler.get_retrievability(toCard(card), new Date(now), false)
}

export const isDue = (card: SrsCard, now: number) => !card.suspended && card.due <= now

/** A word counts as "known" once it has survived a review with ≥ 7 days stability. */
export const isKnown = (card: SrsCard) => card.state === State.Review && card.stability >= 7

/**
 * Map a graded answer to an FSRS rating. Wrong → Again. Accepted with a typo or slowly → Hard.
 * Quick and clean on a mature card → Easy. Otherwise Good.
 */
export function ratingFor(v: { correct: boolean; note?: string }, ms: number, typed: boolean, card?: SrsCard): Grade {
  if (!v.correct) return Rating.Again
  const slow = typed ? 20000 : 10000
  const fast = typed ? 5000 : 2500
  if (v.note === 'typo' || ms > slow) return Rating.Hard
  if (ms < fast && card?.state === State.Review) return Rating.Easy
  return Rating.Good
}

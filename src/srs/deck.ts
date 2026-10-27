// The vocabulary deck: which words are being learned, which cards are due, and how a card becomes an item.
import type { ExerciseItem, Lexeme, Sentence } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { dayKey } from '../rewards/streak'
import { bumpStatsExternal, progressQuestsExternal } from '../rewards/service'
import { examplesFor, soleLexeme, wordTokens } from '../lib/sentences'
import type { Rng } from '../lib/rng'
import { listenItem, meaningItem, transformItem } from '../engine/generators'
import { enRuItem } from '../engine/drills'
import { caseClozeItems, verbClozeItems } from '../engine/sentenceGen'
import type { Verdict } from '../engine/grader'
import { isDue, isKnown, newCard, ratingFor, retrievability, reviewCard, State, type SrsCard, type SrsDir } from './fsrs'

const DAY = 86400000

/** A vocabulary card introduces several directions, spread out so the first day isn't all one word. */
export const VOCAB_DIRS: { dir: SrsDir; delayDays: number; needsVoice?: boolean }[] = [
  { dir: 'ru-en', delayDays: 0 },
  { dir: 'en-ru', delayDays: 1 },
  { dir: 'audio', delayDays: 2, needsVoice: true },
  { dir: 'cloze', delayDays: 4 },
]

export const cardId = (lex: string, dir: SrsDir, slot?: string) => (dir === 'form' ? `form:${lex}:${slot}` : `vocab:${lex}:${dir}`)

export async function inDeck(lex: string): Promise<boolean> {
  return (await db.srs.where('lex').equals(lex).count()) > 0
}

export async function addWord(lex: string, now: number, hasVoice: boolean): Promise<boolean> {
  if (await inDeck(lex)) return false
  const cards = VOCAB_DIRS.filter((d) => hasVoice || !d.needsVoice).map((d) => {
    const c = newCard({ id: cardId(lex, d.dir), kind: 'vocab', dir: d.dir, lex }, now)
    return { ...c, due: now + d.delayDays * DAY }
  })
  await db.srs.bulkPut(cards)
  return true
}

/** A form the learner got wrong in practice becomes its own card (e.g. кни́га → genitive plural). */
export async function addFormCard(lex: string, slot: string, now: number): Promise<void> {
  const id = cardId(lex, 'form', slot)
  if (await db.srs.get(id)) return
  await db.srs.put(newCard({ id, kind: 'form', dir: 'form', lex, slot }, now))
}

export async function newWordsAddedToday(now: number): Promise<number> {
  const start = new Date(dayKey(now) + 'T00:00').getTime()
  return db.srs.filter((c) => c.dir === 'ru-en' && c.added >= start).count()
}

/** Words queued for learning ahead of plain frequency order (e.g. the current unit's vocabulary). */
export const getQueue = () => getKV<string[]>('deck:queue', [])
export async function queueWords(lexes: string[]) {
  const q = await getQueue()
  await setKV('deck:queue', [...new Set([...lexes, ...q])])
}

/**
 * Introduce today's new words, up to the daily limit: queued words first, then the most frequent words
 * of the learner's band that aren't in the deck yet.
 */
/** Function words (prepositions, conjunctions, particles) are learned through grammar, not flashcards. */
export function isCardWorthy(x: Lexeme): boolean {
  if (x.flags?.includes('suspect') || x.flags?.includes('lemma-unstressed')) return false
  if (x.lemma[0] !== x.lemma[0]!.toLowerCase()) return false
  if (x.pos !== 'other') return true
  const sub = x.sub ?? []
  return !sub.some((t) => ['PREP', 'CONJ', 'PRCL', 'INTJ'].includes(t)) && sub.some((t) => ['ADVB', 'PRED', 'NPRO', 'NUMR'].includes(t))
}

/** Words more frequent than this are assumed known (the placement test refines it). */
export const DEFAULT_KNOWN_RANK = 150

export async function introduceNewWords(pool: Lexeme[], limit: number, now: number, hasVoice: boolean, skipBelowRank = DEFAULT_KNOWN_RANK): Promise<string[]> {
  const room = Math.max(0, limit - (await newWordsAddedToday(now)))
  if (!room) return []
  const deck = new Set((await db.srs.toArray()).map((c) => c.lex))
  const byId = new Map(pool.map((x) => [x.id, x]))
  const queue = (await getQueue()).filter((id) => !deck.has(id))
  const fresh = pool
    .filter((x) => !deck.has(x.id) && x.rank && x.rank >= skipBelowRank && isCardWorthy(x))
    .sort((a, b) => a.rank! - b.rank!)
    .map((x) => x.id)
  const added: string[] = []
  for (const id of [...queue, ...fresh]) {
    if (added.length >= room) break
    if (!byId.has(id) && !queue.includes(id)) continue
    if (await addWord(id, now, hasVoice)) added.push(id)
  }
  await setKV('deck:queue', (await getQueue()).filter((id) => !added.includes(id)))
  return added
}

export async function dueCards(now: number, limit = 200): Promise<SrsCard[]> {
  return (await db.srs.where('due').belowOrEqual(now).toArray()).filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due).slice(0, limit)
}

export async function countDue(now: number): Promise<number> {
  return db.srs.where('due').belowOrEqual(now).filter((c) => !c.suspended).count()
}

export type DeckItem = ExerciseItem & { card: string }

/** How many sentences a cloze card rotates through (the shortest ones that make a gap for the word). */
export const CLOZE_SENTENCES = 8

/** Sentence gaps for this word, one per sentence, shortest sentences first. */
function clozesFor(lx: Lexeme, lexemes: Map<string, Lexeme>, sentences: Sentence[], rng: Rng): ExerciseItem[] {
  const out: ExerciseItem[] = []
  for (const s of examplesFor(lx.id, sentences, Infinity)) {
    const hit = [...caseClozeItems(s, lexemes, { pos: [lx.pos], rng }), ...verbClozeItems(s, lexemes)].find((i) => i.target?.lex === lx.id)
    if (hit) out.push(hit)
    if (out.length >= CLOZE_SENTENCES) break
  }
  return out
}

/** Turn a card into an exercise. Falls back to a simpler direction when the ideal one isn't possible. */
export function cardToItem(card: SrsCard, lexemes: Map<string, Lexeme>, sentences: Sentence[], rng: Rng, hasVoice: boolean): DeckItem | null {
  const lx = lexemes.get(card.lex)
  if (!lx) return null
  let item: ExerciseItem | null = null
  if (card.dir === 'form' && card.slot) item = transformItem(lx, card.slot)
  else if (card.dir === 'ru-en') item = meaningItem(lx, [...lexemes.values()], rng)
  else if (card.dir === 'audio') item = hasVoice ? listenItem(lx, [...lexemes.values()], rng) : meaningItem(lx, [...lexemes.values()], rng)
  else if (card.dir === 'cloze') {
    // a different sentence on each review: a word met in varied contexts is recalled in new ones
    const gaps = clozesFor(lx, lexemes, sentences, rng)
    item = gaps.length ? gaps[card.reps % gaps.length]! : null
  }
  item ??= enRuItem(lx)
  return { ...item, id: `srs:${card.id}`, card: card.id }
}

/** Is there a sentence for this word's cloze card? (used to decide whether a cloze card is worth showing) */
export function hasExample(lex: string, sentences: Sentence[]): boolean {
  return sentences.some((s) => wordTokens(s).some((t) => soleLexeme(t) === lex))
}

/** Record a graded review: FSRS update, review log, stats and quest progress. */
export async function recordReview(cardIdValue: string, v: Pick<Verdict, 'correct' | 'note'>, ms: number, typed: boolean, now: number): Promise<SrsCard | null> {
  const card = await db.srs.get(cardIdValue)
  if (!card) return null
  const rating = ratingFor(v, ms, typed, card)
  const { card: next, log } = reviewCard(card, rating, now, ms)
  await db.srs.put(next)
  await db.reviews.add(log)
  const known = await countKnownWords()
  await bumpStatsExternal({ reviews: 1 }, { knownWords: known })
  await progressQuestsExternal({ reviews: 1 }, now)
  return next
}

/** Words with a mature vocabulary card. */
export async function knownLexemes(): Promise<Set<string>> {
  const lexes = new Set<string>()
  await db.srs.each((c) => {
    if (c.kind === 'vocab' && isKnown(c)) lexes.add(c.lex)
  })
  return lexes
}

export const countKnownWords = async () => (await knownLexemes()).size

export async function retrievabilityOf(cardIdValue: string, now: number): Promise<number | null> {
  const c = await db.srs.get(cardIdValue)
  return c ? retrievability(c, now) : null
}

export interface WordState {
  cards: SrsCard[]
  known: boolean
  learning: boolean
}

export async function wordState(lex: string): Promise<WordState> {
  const cards = await db.srs.where('lex').equals(lex).toArray()
  return { cards, known: cards.some(isKnown), learning: cards.some((c) => c.state !== State.New) }
}

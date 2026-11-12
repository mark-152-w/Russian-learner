// The vocabulary deck: which words are being learned, which cards are due, and how a card becomes an item.
import type { ExerciseItem, Lexeme, RootFamily, Sentence } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { dayKey } from '../rewards/streak'
import { bumpStatsExternal, progressQuestsExternal } from '../rewards/service'
import { examplesFor, soleLexeme, wordTokens } from '../lib/sentences'
import type { Rng } from '../lib/rng'
import { guessItem, listenItem, meaningItem, pairItem, transformItem } from '../engine/generators'
import { enRuItem } from '../engine/drills'
import { caseClozeItems, verbClozeItems } from '../engine/sentenceGen'
import type { Verdict } from '../engine/grader'
import { isDue, isKnown, newCard, ratingFor, retrievability, reviewCard, setRetention, State, type SrsCard, type SrsDir } from './fsrs'
import { effectiveRetention } from './memory'

const DAY = 86400000

/**
 * A vocabulary word has several directions. They are introduced one at a time: a direction's first review waits
 * until the one before it is settled (`isWaiting`), so a new word costs one card, not four, while it's fresh.
 * The delays only order the directions; the unlock decides when each is first seen.
 */
export const VOCAB_DIRS: { dir: SrsDir; delayDays: number; needsVoice?: boolean }[] = [
  { dir: 'ru-en', delayDays: 0 },
  { dir: 'en-ru', delayDays: 1 },
  { dir: 'audio', delayDays: 2, needsVoice: true },
  { dir: 'cloze', delayDays: 4 },
]

/** A direction is settled once it has survived a review into an interval of this many days. */
export const UNLOCK_STABILITY = 5
/** Due reviews above this slow new words to half the daily number; at BACKLOG_PAUSE they stop until it's cleared. */
export const BACKLOG_SLOW = 30
export const BACKLOG_PAUSE = 60
/** Missed forms that become cards in a day; more misses than that are practice, not a deck. */
export const FORM_CARDS_PER_DAY = 5

const startOfDay = (now: number) => new Date(dayKey(now) + 'T00:00').getTime()
const DIR_ORDER = VOCAB_DIRS.map((d) => d.dir)

/** A vocabulary direction not yet seen whose earlier directions (of the same word) aren't settled yet. */
export function isWaiting(card: SrsCard, siblings: readonly SrsCard[]): boolean {
  if (card.kind !== 'vocab' || card.reps > 0) return false
  const i = DIR_ORDER.indexOf(card.dir)
  if (i <= 0) return false
  return siblings.some((s) => {
    const j = DIR_ORDER.indexOf(s.dir)
    return s.kind === 'vocab' && j >= 0 && j < i && !s.suspended && !(s.state === State.Review && s.stability >= UNLOCK_STABILITY)
  })
}

/** Another card of the same word was reviewed today, and this one wasn't: it waits until tomorrow. */
export function isBuried(card: SrsCard, siblings: readonly SrsCard[], dayStart: number): boolean {
  if ((card.last_review ?? 0) >= dayStart) return false
  return siblings.some((s) => s.id !== card.id && (s.last_review ?? 0) >= dayStart)
}

/**
 * The cards to review now: due, unlocked, not buried, one per word. Cards already being learned come before
 * new ones, so a backlog is worked off before more is started; within each group the most overdue go first.
 */
export function pickDue(all: readonly SrsCard[], now: number, limit = Infinity): SrsCard[] {
  const byLex = new Map<string, SrsCard[]>()
  for (const c of all) byLex.set(c.lex, [...(byLex.get(c.lex) ?? []), c])
  const dayStart = startOfDay(now)
  const due = all
    .filter((c) => isDue(c, now) && !isWaiting(c, byLex.get(c.lex)!) && !isBuried(c, byLex.get(c.lex)!, dayStart))
    .sort((a, b) => Number(a.reps === 0) - Number(b.reps === 0) || a.due - b.due)
  const seen = new Set<string>()
  const out: SrsCard[] = []
  for (const c of due) {
    if (seen.has(c.lex)) continue
    seen.add(c.lex)
    out.push(c)
    if (out.length >= limit) break
  }
  return out
}

/** Reviews due now of cards already seen: the backlog that holds back new words. */
export const backlogOf = (all: readonly SrsCard[], now: number) => pickDue(all, now).filter((c) => c.reps > 0).length

/** New words allowed today: the daily number, halved by a growing backlog and paused by a big one. */
export function newWordRoom(limit: number, addedToday: number, backlog: number): number {
  const cap = backlog >= BACKLOG_PAUSE ? 0 : backlog >= BACKLOG_SLOW ? Math.ceil(limit / 2) : limit
  return Math.max(0, cap - addedToday)
}

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
export async function addFormCard(lex: string, slot: string, now: number): Promise<boolean> {
  const id = cardId(lex, 'form', slot)
  if (await db.srs.get(id)) return false
  // a few a day, and one waiting per word: a hard practice session shouldn't bury the learner in cards
  const forms = await db.srs.where('kind').equals('form').toArray()
  const start = startOfDay(now)
  if (forms.filter((c) => c.added >= start).length >= FORM_CARDS_PER_DAY) return false
  if (forms.some((c) => c.lex === lex && c.reps === 0)) return false
  await db.srs.put(newCard({ id, kind: 'form', dir: 'form', lex, slot }, now))
  return true
}

/** Words that joined the deck today, in the order they came. */
export async function wordsAddedToday(now: number): Promise<string[]> {
  const start = new Date(dayKey(now) + 'T00:00').getTime()
  return (await db.srs.filter((c) => c.dir === 'ru-en' && c.added >= start).toArray()).sort((a, b) => a.added - b.added).map((c) => c.lex)
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
  const all = await db.srs.toArray()
  const room = newWordRoom(limit, await newWordsAddedToday(now), backlogOf(all, now))
  if (!room) return []
  const deck = new Set(all.map((c) => c.lex))
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
  return pickDue(await db.srs.toArray(), now, limit)
}

export async function countDue(now: number): Promise<number> {
  return pickDue(await db.srs.toArray(), now).length
}

/** Whether new words are held back today by the review backlog (for explaining an empty or short session). */
export async function newWordsHeldBack(now: number): Promise<{ backlog: number; paused: boolean; slowed: boolean }> {
  const backlog = backlogOf(await db.srs.toArray(), now)
  return { backlog, paused: backlog >= BACKLOG_PAUSE, slowed: backlog >= BACKLOG_SLOW && backlog < BACKLOG_PAUSE }
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

/** A relative to hint at a new word's meaning: one the learner is learning already, else the most frequent. */
export function relativeFor(lx: Lexeme, family: RootFamily | undefined, lexemes: Map<string, Lexeme>, deck: ReadonlySet<string>): Lexeme | undefined {
  const kin = (family?.lexemes ?? []).flatMap((id) => (id !== lx.id && lexemes.get(id)?.rank ? [lexemes.get(id)!] : []))
  return kin.find((k) => deck.has(k.id)) ?? kin.sort((a, b) => a.rank! - b.rank!).find((k) => !lx.rank || k.rank! < lx.rank)
}

/**
 * Turn a card into an exercise. Falls back to a simpler direction when the ideal one isn't possible. A new word's
 * first card is a guess (`relatives` gives the hint for it).
 */
export function cardToItem(
  card: SrsCard, lexemes: Map<string, Lexeme>, sentences: Sentence[], rng: Rng, hasVoice: boolean, relatives?: Map<string, Lexeme>,
): DeckItem | null {
  const lx = lexemes.get(card.lex)
  if (!lx) return null
  let item: ExerciseItem | null = null
  if (card.dir === 'pair') {
    const other = lexemes.get(card.other ?? '')
    item = other ? pairItem(lx, other, card.reps, rng) : null
  } else if (card.dir === 'form' && card.slot) item = transformItem(lx, card.slot)
  else if (card.dir === 'ru-en') {
    const first = card.state === State.New && card.reps === 0
    if (first) item = guessItem(lx, [...lexemes.values()], rng, examplesFor(lx.id, sentences, 1)[0], relatives?.get(lx.id))
    item ??= meaningItem(lx, [...lexemes.values()], rng)
  }
  else if (card.dir === 'audio') item = hasVoice ? listenItem(lx, [...lexemes.values()], rng) : meaningItem(lx, [...lexemes.values()], rng)
  else if (card.dir === 'cloze') {
    // a different sentence on each review: a word met in varied contexts is recalled in new ones
    const gaps = clozesFor(lx, lexemes, sentences, rng)
    item = gaps.length ? gaps[card.reps % gaps.length]! : null
  }
  item ??= enRuItem(lx, lexemes)
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
  setRetention(await effectiveRetention())
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
  const vocab = cards.filter((c) => c.kind !== 'pair')
  return { cards: vocab, known: vocab.some(isKnown), learning: vocab.some((c) => c.state !== State.New) }
}

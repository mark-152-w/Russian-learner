// Confusion pairs (interference): words that get in each other's way. A wrong answer counts as a confusion
// when it is another word the learner is also learning: its meaning picked, or one of its forms typed. Words
// outside the deck don't count, since picking one of those is a guess rather than interference. After two
// confusions between the same two words, a pair card puts them side by side.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { decodeCell } from '../lib/lexicon'
import { gloss, pairItem } from '../engine/generators'
import { normalizeAnswer } from '../engine/normalize'
import { mulberry32 } from '../lib/rng'
import { newCard } from './fsrs'

/** Confusions between two words before they get a pair card. */
export const PAIR_AFTER = 2
/** Mix-ups closer together than this are one occasion (a relearning retry repeats the same slip). */
export const SAME_OCCASION_MS = 3600_000

export interface Confusion {
  n: number
  last: number
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
export const pairCardId = (a: string, b: string) => `pair:${pairKey(a, b)}`

/** The word an item tests, if it tests exactly one. */
export function itemLexeme(item: ExerciseItem): string | undefined {
  return item.target?.lex ?? (item.vocab?.length === 1 ? item.vocab[0] : undefined)
}

const CYRILLIC = /[а-яё]/i // ru-ignore

/** Is the (normalised) answer the lemma or any form of this word? */
function isFormOf(lx: Lexeme, typed: string): boolean {
  if (normalizeAnswer(lx.lemma) === typed) return true
  return (lx.forms ?? []).some((cell) => decodeCell(cell).some((v) => normalizeAnswer(v.form) === typed))
}

/** Deck words a wrong answer points to: their meaning was picked, or one of their forms was given. */
export function confusedWith(item: ExerciseItem, given: string, lexemes: Map<string, Lexeme>, deck: ReadonlySet<string>): string[] {
  const target = lexemes.get(itemLexeme(item) ?? '')
  if (!target || !given || item.id.startsWith('gen:pair:') || item.id.startsWith('srs:pair:')) return []
  const typed = CYRILLIC.test(given) ? normalizeAnswer(given) : null
  // a form of the word asked for is a grammar slip, not a mix-up (стали is стать and сталь)
  if (typed && isFormOf(target, typed)) return []
  const out: string[] = []
  for (const id of deck) {
    const lx = id === target.id ? undefined : lexemes.get(id)
    if (lx && (typed ? isFormOf(lx, typed) : gloss(lx) === given)) out.push(id)
  }
  return out
}

/** Record a confusion; the second occasion for the same two words adds their pair card. */
export async function recordConfusion(a: Lexeme, b: Lexeme, now: number): Promise<Confusion> {
  const key = `confuse:${pairKey(a.id, b.id)}`
  const c = await getKV<Confusion>(key, { n: 0, last: 0 })
  if (c.n && now - c.last < SAME_OCCASION_MS) return c
  const next = { n: c.n + 1, last: now }
  await setKV(key, next)
  const id = pairCardId(a.id, b.id)
  // only words that can be told apart get a card (two words both glossed "to pay" can't)
  if (next.n >= PAIR_AFTER && !(await db.srs.get(id)) && pairItem(a, b, 0, mulberry32(0))) {
    const [lex, other] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
    await db.srs.put(newCard({ id, kind: 'pair', dir: 'pair', lex, other }, now))
  }
  return next
}

/** After a wrong answer anywhere: record any confusion with another deck word. */
export async function noteConfusion(item: ExerciseItem, given: string, lexemes: Map<string, Lexeme>, now: number): Promise<void> {
  const target = lexemes.get(itemLexeme(item) ?? '')
  if (!target) return
  const deck = new Set((await db.srs.orderBy('lex').uniqueKeys()) as string[])
  if (!deck.has(target.id)) return
  for (const id of confusedWith(item, given, lexemes, deck)) await recordConfusion(target, lexemes.get(id)!, now)
}

/** Words this one has been confused with, most often first. */
export async function confusionsOf(lex: string): Promise<{ lex: string; n: number }[]> {
  const rows = await db.kv.where('key').startsWith('confuse:').toArray()
  return rows
    .map((r) => ({ ids: r.key.slice(8).split('|'), n: (r.value as Confusion).n }))
    .filter((r) => r.ids.includes(lex))
    .map((r) => ({ lex: r.ids[0] === lex ? r.ids[1]! : r.ids[0]!, n: r.n }))
    .sort((x, y) => y.n - x.n)
}

// Speed match: five Russian words, five meanings, one minute. Each matched pair is replaced by a new one (its
// meaning swapped into a random slot, so the newcomer isn't given away). A wrong pair costs three seconds.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { shuffle, type Rng } from '../lib/rng'
import { gloss } from './generators'

export const ROUND_SECONDS = 60
export const BOARD = 5
export const PENALTY_SECONDS = 3

/** A queue of words with short, mutually distinct glosses. */
export function speedWords(pool: Lexeme[], rng: Rng, n = 80): Lexeme[] {
  const seen = new Set<string>()
  const out: Lexeme[] = []
  for (const lx of shuffle(rng, pool)) {
    const g = gloss(lx).toLowerCase()
    if (g.length > 22 || seen.has(g) || lx.lemma[0] !== lx.lemma[0]!.toLowerCase() || lx.lemma.includes(' ')) continue
    seen.add(g)
    out.push(lx)
    if (out.length >= n) break
  }
  return out
}

export interface Board {
  ru: (Lexeme | null)[]
  en: (Lexeme | null)[]
  /** Next word to deal. */
  next: number
}

export function deal(queue: Lexeme[], rng: Rng): Board {
  const first = queue.slice(0, BOARD)
  return { ru: [...first], en: shuffle(rng, [...first]), next: first.length }
}

/** Remove a matched pair and deal the next word into the two free slots, mixing its meaning in. */
export function refill(b: Board, ruIdx: number, enIdx: number, queue: Lexeme[], rng: Rng): Board {
  const ru = [...b.ru]
  const en = [...b.en]
  // never deal a word that's still on the board (the queue wraps in very long rounds)
  const onBoard = new Set(ru.filter((x, i) => x && i !== ruIdx).map((x) => x!.id))
  let next = b.next
  let word: Lexeme | null = null
  for (let tries = 0; tries < queue.length && !word; tries++, next++) {
    const lx = queue[next % queue.length]!
    if (!onBoard.has(lx.id)) word = lx
  }
  ru[ruIdx] = word
  en[enIdx] = word
  if (word) {
    const k = Math.floor(rng() * BOARD)
    ;[en[enIdx], en[k]] = [en[k]!, en[enIdx]!]
  }
  return { ru, en, next }
}

/** The graded item behind one attempted pair: the Russian word against the meanings on the board. */
export function pairItem(lx: Lexeme, board: Board): ExerciseItem {
  const choices = [...new Set(board.en.filter((x): x is Lexeme => !!x).map(gloss))]
  return {
    id: `speed:${lx.id}`,
    type: 'choice',
    level: lx.level ?? 'A2',
    tags: ['vocab'],
    vocab: [lx.id],
    source: 'generated',
    prompt: { ru: lx.lemma, instruction: 'Match the meaning' },
    choices,
    answerIndex: choices.indexOf(gloss(lx)),
  }
}

/** Points for a match: 10, plus 2 for each pair already in the current run (capped). */
export const matchPoints = (run: number) => 10 + 2 * Math.min(run, 10)

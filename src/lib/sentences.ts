// Example sentences (Tatoeba, CC BY 2.0 FR), stressed and analysed at build time by tools/sentences.py.
import type { Sentence } from '../types/content.gen'

export type Level = Sentence['lv']
export const SENTENCE_LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1']

export interface Reading {
  lex: string
  slot: string
}
export interface WordToken {
  start: number
  end: number
  text: string
  readings: Reading[]
}

const loaders = import.meta.glob<{ default: Sentence[] }>('../data/sentences/*.json')
const cache = new Map<string, Promise<Sentence[]>>()

export function loadSentences(level: Level): Promise<Sentence[]> {
  let p = cache.get(level)
  if (!p) {
    const loader = loaders[`../data/sentences/${level}.json`]
    if (!loader) return Promise.resolve([])
    p = loader().then((m) => m.default)
    cache.set(level, p)
  }
  return p
}

/** All sentences up to and including `max`. */
export async function sentencesUpTo(max: Level): Promise<Sentence[]> {
  const lv = SENTENCE_LEVELS.slice(0, SENTENCE_LEVELS.indexOf(max) + 1)
  return (await Promise.all(lv.map(loadSentences))).flat()
}

export function wordTokens(s: Sentence): WordToken[] {
  return s.w.map((w) => {
    const [start, end, ...rest] = w as [number, number, ...string[]]
    return {
      start,
      end,
      text: s.ru.slice(start, end),
      readings: rest.map((r) => {
        const [lex, slot] = r.split('|')
        return { lex: lex!, slot: slot ?? '' }
      }),
    }
  })
}

/** The single lexeme a token belongs to, if unambiguous. */
export function soleLexeme(t: WordToken): string | null {
  const ids = new Set(t.readings.map((r) => r.lex))
  return ids.size === 1 ? [...ids][0]! : null
}

/** Sentences containing an unambiguous form of `lex`, shortest first. */
export function examplesFor(lex: string, pool: Sentence[], limit = 6): Sentence[] {
  return pool
    .filter((s) => wordTokens(s).some((t) => soleLexeme(t) === lex))
    .sort((a, b) => a.w.length - b.w.length)
    .slice(0, limit)
}

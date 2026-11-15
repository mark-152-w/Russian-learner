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
    p.catch(() => cache.delete(level))
  }
  return p
}

const upTo = new Map<Level, Promise<Sentence[]>>()

/** All sentences up to and including `max` (the same array each call, so the example index can be cached on it). */
export function sentencesUpTo(max: Level): Promise<Sentence[]> {
  let p = upTo.get(max)
  if (!p) {
    const lv = SENTENCE_LEVELS.slice(0, SENTENCE_LEVELS.indexOf(max) + 1)
    p = Promise.all(lv.map(loadSentences)).then((parts) => parts.flat())
    upTo.set(max, p)
    p.catch(() => upTo.delete(max))
  }
  return p
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

const indexes = new WeakMap<Sentence[], Map<string, Sentence[]>>()

/** lexeme id → sentences where it is the sole reading of some token (pool order), built once per pool array. */
function exampleIndex(pool: Sentence[]): Map<string, Sentence[]> {
  let idx = indexes.get(pool)
  if (!idx) {
    idx = new Map()
    for (const s of pool) {
      const seen = new Set<string>()
      for (const t of wordTokens(s)) {
        const id = soleLexeme(t)
        if (id === null || seen.has(id)) continue
        seen.add(id)
        const list = idx.get(id)
        if (list) list.push(s)
        else idx.set(id, [s])
      }
    }
    indexes.set(pool, idx)
  }
  return idx
}

/** Sentences containing an unambiguous form of `lex`, shortest first. */
export function examplesFor(lex: string, pool: Sentence[], limit = 6): Sentence[] {
  const hits = exampleIndex(pool).get(lex)
  if (!hits) return []
  return [...hits].sort((a, b) => a.w.length - b.w.length).slice(0, limit)
}

/** Does any sentence in the pool contain an unambiguous form of `lex`? */
export function hasExampleIn(lex: string, pool: Sentence[]): boolean {
  return exampleIndex(pool).has(lex)
}

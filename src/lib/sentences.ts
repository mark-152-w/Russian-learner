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

/** soleLexeme() for a raw `w` entry, without building tokens. */
function soleLex(w: Sentence['w'][number]): string | null {
  let lex: string | null = null
  for (let i = 2; i < w.length; i++) {
    const r = w[i] as string
    const bar = r.indexOf('|')
    const l = bar < 0 ? r : r.slice(0, bar)
    if (lex === null) lex = l
    else if (l !== lex) return null
  }
  return lex
}

// lexeme → its sentences in pool order, built in one pass per pool: Review asks for every cloze card's word.
const indexes = new WeakMap<Sentence[], Map<string, Sentence[]>>()
function indexOf(pool: Sentence[]): Map<string, Sentence[]> {
  let idx = indexes.get(pool)
  if (!idx) {
    idx = new Map()
    for (const s of pool) {
      for (const w of s.w) {
        const lex = soleLex(w)
        if (!lex) continue
        const list = idx.get(lex)
        if (!list) idx.set(lex, [s])
        else if (list[list.length - 1] !== s) list.push(s)
      }
    }
    for (const list of idx.values()) list.sort((a, b) => a.w.length - b.w.length)
    indexes.set(pool, idx)
  }
  return idx
}

/** Sentences containing an unambiguous form of `lex`, shortest first. */
export function examplesFor(lex: string, pool: Sentence[], limit = 6): Sentence[] {
  return (indexOf(pool).get(lex) ?? []).slice(0, limit)
}

/** Up to `limit` examples, reading sentence levels from the easiest up and stopping once there are enough: the
 *  B2 and C1 files are large and cached only on first use. */
export async function examplesUpTo(lex: string, max: Level, limit = 6): Promise<Sentence[]> {
  const out: Sentence[] = []
  for (const lv of SENTENCE_LEVELS.slice(0, SENTENCE_LEVELS.indexOf(max) + 1)) {
    out.push(...examplesFor(lex, await loadSentences(lv), limit - out.length))
    if (out.length >= limit) break
  }
  return out
}

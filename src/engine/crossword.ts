// Declension crossword: inflected forms from the lexicon placed on a grid where they cross. Clues give the
// dictionary form (or the English meaning) plus the form wanted: «кни́га — gen. pl.». Answers ignore stress; ё = е.
import type { Lexeme } from '../types/content.gen'
import { primaryForm } from '../lib/lexicon'
import { shuffle, type Rng } from '../lib/rng'
import { fold } from '../lib/ru'
import { gloss, isDrillable } from './generators'

export type Topic = 'mixed' | 'gen' | 'dat' | 'acc' | 'ins' | 'prep' | 'plural' | 'verbs'
export const TOPICS: { id: Topic; title: string }[] = [
  { id: 'mixed', title: 'Mixed' },
  { id: 'gen', title: 'Genitive' },
  { id: 'dat', title: 'Dative' },
  { id: 'acc', title: 'Accusative' },
  { id: 'ins', title: 'Instrumental' },
  { id: 'prep', title: 'Prepositional' },
  { id: 'plural', title: 'Plurals' },
  { id: 'verbs', title: 'Verb forms' },
]

const CASE_ABBR: Record<string, string> = { nom: 'nom.', gen: 'gen.', dat: 'dat.', acc: 'acc.', ins: 'instr.', prep: 'prep.' }
const VERB_ABBR: Record<string, string> = {
  np_1sg: 'я …', np_2sg: 'ты …', np_3sg: 'он …', np_1pl: 'мы …', np_2pl: 'вы …', np_3pl: 'они́ …',
  pst_m: 'past, m.', pst_f: 'past, f.', pst_n: 'past, n.', pst_pl: 'past, pl.', imp_sg: 'imperative (ты)', imp_pl: 'imperative (вы)',
}

export interface Candidate {
  answer: string
  form: string
  lex: string
  slot: string
  clue: string
}

/** Slots a topic draws on, with the label shown in the clue. */
function topicSlots(topic: Topic): { pos: 'noun' | 'verb'; slot: string; label: string }[] {
  const cases = topic === 'mixed' || topic === 'plural' ? ['gen', 'dat', 'acc', 'ins', 'prep'] : topic === 'verbs' ? [] : [topic]
  const nums = topic === 'plural' ? ['pl'] : ['sg', 'pl']
  const noun = cases.flatMap((c) => nums.map((n) => ({ pos: 'noun' as const, slot: `${n}_${c}`, label: `${CASE_ABBR[c]} ${n === 'sg' ? 'sg.' : 'pl.'}` })))
  const verb = topic === 'verbs' || topic === 'mixed' ? Object.entries(VERB_ABBR).map(([slot, label]) => ({ pos: 'verb' as const, slot, label })) : []
  return topic === 'mixed' ? [...noun, ...verb.slice(0, 4)] : [...noun, ...verb]
}

export function candidates(pool: Lexeme[], topic: Topic, rng: Rng, max = 120): Candidate[] {
  const wants = topicSlots(topic)
  const words = shuffle(rng, pool.filter((x) => (x.pos === 'noun' || x.pos === 'verb') && isDrillable(x) && x.lemma[0] === x.lemma[0]!.toLowerCase()))
  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const lx of words) {
    if (out.length >= max) break
    const options = shuffle(rng, wants.filter((w) => w.pos === lx.pos))
    for (const w of options) {
      const form = primaryForm(lx, w.slot)
      if (!form) continue
      const answer = fold(form)
      // a form identical to the dictionary form is no puzzle; skip hyphens and very short/long words
      if (answer === fold(lx.lemma) || !/^[а-я]{3,9}$/.test(answer) || seen.has(answer)) continue // ru-ignore
      seen.add(answer)
      const byMeaning = rng() < 0.35
      out.push({ answer, form, lex: lx.id, slot: w.slot, clue: byMeaning ? `“${gloss(lx)}” — ${w.label}` : `${lx.lemma} — ${w.label}` })
      break
    }
  }
  return out
}

export interface Entry extends Candidate {
  n: number
  dir: 'across' | 'down'
  row: number
  col: number
}
export interface Puzzle {
  rows: number
  cols: number
  /** Solution letters, '' for black squares. */
  grid: string[][]
  /** Clue number shown in a cell, if any. */
  numbers: (number | null)[][]
  entries: Entry[]
}

const SIZE = 15

/** Greedy placement: each new word must cross the grid at least once and never touch another word side by side. */
export function buildPuzzle(cands: Candidate[], rng: Rng, target = 10): Puzzle | null {
  const cells = new Map<string, string>()
  const key = (r: number, c: number) => `${r},${c}`
  const placed: Omit<Entry, 'n'>[] = []
  const sorted = [...cands].sort((a, b) => b.answer.length - a.answer.length)
  const first = sorted.find((c) => c.answer.length >= 6) ?? sorted[0]
  if (!first) return null
  const r0 = Math.floor(SIZE / 2)
  const c0 = Math.floor((SIZE - first.answer.length) / 2)
  ;[...first.answer].forEach((ch, i) => cells.set(key(r0, c0 + i), ch))
  placed.push({ ...first, dir: 'across', row: r0, col: c0 })

  const fits = (word: string, r: number, c: number, dir: 'across' | 'down') => {
    const dr = dir === 'down' ? 1 : 0
    const dc = dir === 'across' ? 1 : 0
    const endR = r + dr * (word.length - 1)
    const endC = c + dc * (word.length - 1)
    if (r < 0 || c < 0 || endR >= SIZE || endC >= SIZE) return -1
    if (cells.has(key(r - dr, c - dc)) || cells.has(key(endR + dr, endC + dc))) return -1
    let crossings = 0
    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i
      const cc = c + dc * i
      const have = cells.get(key(rr, cc))
      if (have) {
        if (have !== word[i]) return -1
        crossings++
      } else if (cells.has(key(rr + dc, cc + dr)) || cells.has(key(rr - dc, cc - dr))) return -1 // side contact
    }
    return crossings
  }

  for (const cand of shuffle(rng, sorted.filter((c) => c !== first))) {
    if (placed.length >= target) break
    let best: { r: number; c: number; dir: 'across' | 'down'; score: number } | null = null
    for (const [k, letter] of cells) {
      const [pr, pc] = k.split(',').map(Number) as [number, number]
      for (let i = 0; i < cand.answer.length; i++) {
        if (cand.answer[i] !== letter) continue
        for (const dir of ['across', 'down'] as const) {
          const r = dir === 'down' ? pr - i : pr
          const c = dir === 'across' ? pc - i : pc
          const score = fits(cand.answer, r, c, dir)
          if (score > 0 && (!best || score + rng() > best.score)) best = { r, c, dir, score }
        }
      }
    }
    if (!best) continue
    const { r, c, dir } = best
    ;[...cand.answer].forEach((ch, i) => cells.set(key(dir === 'down' ? r + i : r, dir === 'across' ? c + i : c), ch))
    placed.push({ ...cand, dir, row: r, col: c })
  }
  if (placed.length < Math.min(6, target)) return null

  // trim to the used area and number the starts in reading order
  const rs = [...cells.keys()].map((k) => Number(k.split(',')[0]))
  const cs = [...cells.keys()].map((k) => Number(k.split(',')[1]))
  const minR = Math.min(...rs)
  const minC = Math.min(...cs)
  const rows = Math.max(...rs) - minR + 1
  const cols = Math.max(...cs) - minC + 1
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cells.get(key(r + minR, c + minC)) ?? ''))
  const numbers: (number | null)[][] = grid.map((row) => row.map(() => null))
  const starts = placed
    .map((p) => ({ ...p, row: p.row - minR, col: p.col - minC }))
    .sort((a, b) => a.row - b.row || a.col - b.col)
  let n = 0
  const entries: Entry[] = []
  for (const p of starts) {
    const existing = numbers[p.row]![p.col]
    const num = existing ?? ++n
    numbers[p.row]![p.col] = num
    entries.push({ ...p, n: num })
  }
  return { rows, cols, grid, numbers, entries }
}

/** A deterministic daily seed from a day key (2026-10-26). */
export function daySeed(day: string): number {
  let h = 2166136261
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export function entryCells(e: Entry): [number, number][] {
  return [...e.answer].map((_, i) => (e.dir === 'across' ? [e.row, e.col + i] : [e.row + i, e.col]))
}

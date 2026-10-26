// Boss battles: one per course unit. The boss has HP (from the unit JSON); every right answer hits it, a run of
// three or more right hits twice as hard, and every mistake costs one of your three hearts. Items are the unit's
// checkpoint drills plus forms you have recently got wrong anywhere in the app.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import type { Attempt } from '../db/db'
import { transformItem } from './generators'

export const HEARTS = 3
export const CRIT_COMBO = 3
/** Recent mistakes count for this long. */
export const ERROR_WINDOW_MS = 14 * 86400000

export interface BossState {
  hp: number
  maxHp: number
  hearts: number
}

export interface Hit {
  state: BossState
  damage: number
  crit: boolean
  outcome: 'won' | 'lost' | null
}

export const startBoss = (hp: number): BossState => ({ hp, maxHp: hp, hearts: HEARTS })

/** Apply one answer. `combo` is the run of right answers including this one. */
export function bossHit(s: BossState, correct: boolean, combo: number): Hit {
  if (!correct) {
    const hearts = s.hearts - 1
    return { state: { ...s, hearts }, damage: 0, crit: false, outcome: hearts <= 0 ? 'lost' : null }
  }
  const crit = combo >= CRIT_COMBO
  const damage = crit ? 2 : 1
  const hp = Math.max(0, s.hp - damage)
  return { state: { ...s, hp }, damage, crit, outcome: hp === 0 ? 'won' : null }
}

/** Distinct (lexeme, slot) pairs missed recently, newest first. */
export function recentErrorTargets(attempts: Attempt[], now: number, max = 5): { lex: string; slot: string }[] {
  const out: { lex: string; slot: string }[] = []
  const seen = new Set<string>()
  for (const a of [...attempts].sort((x, y) => y.ts - x.ts)) {
    if (a.correct || !a.lex || !a.slot || a.ts < now - ERROR_WINDOW_MS) continue
    const k = `${a.lex}|${a.slot}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ lex: a.lex, slot: a.slot })
    if (out.length >= max) break
  }
  return out
}

/** The battle's items: the unit drills with "revenge" items for recent mistakes mixed in; enough to beat the boss. */
export function bossItems(unitItems: ExerciseItem[], errors: { lex: string; slot: string }[], lexemes: Map<string, Lexeme>, hp: number): ExerciseItem[] {
  const revenge = errors
    .map(({ lex, slot }) => lexemes.get(lex) && transformItem(lexemes.get(lex)!, slot))
    .filter((x): x is ExerciseItem => !!x && !!x.accept?.length)
    .map((it) => ({ ...it, id: `boss:${it.id}` }))
  const byId = new Map<string, ExerciseItem>()
  // interleave so the revenge items don't all come first
  const rest = [...unitItems]
  while (revenge.length || rest.length) {
    for (const it of rest.splice(0, 2)) byId.set(it.id, it)
    const r = revenge.shift()
    if (r) byId.set(r.id, r)
  }
  return [...byId.values()].slice(0, hp + HEARTS + 6)
}

export interface BossRecord {
  wins: number
  firstWin?: number
  /** Fewest hearts lost in a win. */
  bestHearts?: number
}
export type BossRecords = Record<string, BossRecord>

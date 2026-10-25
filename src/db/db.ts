// All learner state lives in IndexedDB (Dexie). Every value is plain JSON (dates as epoch ms),
// so the whole database can be exported and imported losslessly.
import Dexie, { type Table } from 'dexie'
import type { SrsCard, SrsReviewLog } from '../srs/fsrs'
import type { QuestState } from '../rewards/quests'

export interface KV {
  key: string
  value: unknown
}

export interface Attempt {
  id?: number
  ts: number
  item: string
  type: string
  level: string
  tags: string[]
  lex?: string
  slot?: string
  correct: boolean
  err?: string
  ms: number
  xp: number
  golden?: boolean
}

/** Learner model: one row per tracked thing (tag:…, lex:…, form:…, err:…). */
export interface Mastery {
  key: string
  kind: 'tag' | 'lex' | 'form' | 'err'
  attempts: number
  correct: number
  /** Exponentially weighted accuracy, 0..1. */
  score: number
  last: number
}

export interface Day {
  day: string
  seconds: number
  xp: number
  answers: number
  correct: number
  sessions: number
}

export interface Unlock {
  id: string
  ts: number
}

export interface Best {
  key: string
  score: number
  ts: number
  replay?: unknown
}

export interface SessionRow {
  id?: number
  start: number
  end: number
  kind: string
  answered: number
  correct: number
  xp: number
  bestCombo: number
  chest?: string
}

export class MedvedDB extends Dexie {
  kv!: Table<KV, string>
  srs!: Table<SrsCard, string>
  reviews!: Table<SrsReviewLog & { id?: number }, number>
  attempts!: Table<Attempt, number>
  mastery!: Table<Mastery, string>
  days!: Table<Day, string>
  quests!: Table<QuestState, string>
  achievements!: Table<Unlock, string>
  bests!: Table<Best, string>
  sessions!: Table<SessionRow, number>

  constructor(name = 'medved') {
    super(name)
    this.version(1).stores({
      kv: '&key',
      srs: '&id, due, lex, kind, state',
      reviews: '++id, card, ts',
      attempts: '++id, ts, item, *tags, err',
      mastery: '&key, kind',
      days: '&day',
      quests: '&id, period',
      achievements: '&id',
      bests: '&key',
      sessions: '++id, start',
    })
  }
}

export const TABLES = ['kv', 'srs', 'reviews', 'attempts', 'mastery', 'days', 'quests', 'achievements', 'bests', 'sessions'] as const
export type TableName = (typeof TABLES)[number]

export let db = new MedvedDB()

/** Tests swap in a fresh database. */
export function useDatabase(d: MedvedDB) {
  db = d
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}

export async function setKV<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value })
}

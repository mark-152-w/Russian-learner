// The learner's placed level (from the placement test; A2 until then, per the brief).
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getKV } from '../db/db'
import type { ChunkName } from './lexicon'

export type CourseLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'

export interface Placement {
  level: CourseLevel
  skills: Record<string, CourseLevel>
  /** Words more frequent than this rank are assumed known (not introduced as new cards). */
  knownRank?: number
  ts: number
}

export const DEFAULT_LEVEL: CourseLevel = 'A2'

export async function getPlacement(): Promise<Placement | null> {
  return getKV<Placement | null>('placement', null)
}

export async function learnerLevel(): Promise<CourseLevel> {
  return (await getPlacement())?.level ?? DEFAULT_LEVEL
}

export function usePlacement(): Placement | null | undefined {
  return useLiveQuery(async () => ((await db.kv.get('placement'))?.value as Placement | undefined) ?? null, [])
}

export const asChunk = (l: CourseLevel) => l as ChunkName

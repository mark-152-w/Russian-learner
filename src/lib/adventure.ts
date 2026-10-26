// «Де́ло» progress: the scene you're in per chapter, story flags (shared across chapters) and finished chapters.
import { useLiveQuery } from 'dexie-react-hooks'
import type { AdventureChapter } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'

const files = import.meta.glob<{ default: AdventureChapter }>('../data/content/adventure/*.json')
let all: Promise<AdventureChapter[]> | null = null
export function loadChapters(): Promise<AdventureChapter[]> {
  return (all ??= Promise.all(Object.values(files).map((f) => f())).then((m) => m.map((x) => x.default).sort((a, b) => a.chapter - b.chapter)))
}

export interface AdventureProgress {
  at: Record<number, string>
  flags: string[]
  done: number[]
}
const EMPTY: AdventureProgress = { at: {}, flags: [], done: [] }
export const getAdventure = async () => ({ ...EMPTY, ...(await getKV<Partial<AdventureProgress>>('adventure', {})) })
export const saveAdventure = (p: AdventureProgress) => setKV('adventure', p)
export const useAdventure = () => useLiveQuery(async () => ({ ...EMPTY, ...((await db.kv.get('adventure'))?.value as Partial<AdventureProgress>) }), [], EMPTY)

/** A chapter opens once the one before it is finished. */
export const isOpen = (n: number, p: AdventureProgress) => n === 1 || p.done.includes(n - 1)

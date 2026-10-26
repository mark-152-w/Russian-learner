// Boss battle records (per unit) in the kv store.
import { useLiveQuery } from 'dexie-react-hooks'
import type { Unit } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import type { BossRecords } from '../engine/boss'
import { awardCard, bumpStatsExternal } from '../rewards/service'

export const getBossRecords = () => getKV<BossRecords>('bosses', {})
export const useBossRecords = () => useLiveQuery(async () => ((await db.kv.get('bosses'))?.value as BossRecords) ?? {}, [], {} as BossRecords)

/** Record a win. The first over a boss counts for the boss achievements and earns a card. */
export async function recordBossWin(unit: Unit, hearts: number, now: number): Promise<{ first: boolean; card: string | null }> {
  const all = await getBossRecords()
  const r = all[unit.id] ?? { wins: 0 }
  const first = !r.wins
  all[unit.id] = { wins: r.wins + 1, firstWin: r.firstWin ?? now, bestHearts: Math.max(r.bestHearts ?? 0, hearts) }
  await setKV('bosses', all)
  if (!first) return { first, card: null }
  await bumpStatsExternal({ bosses: 1 })
  return { first, card: (await awardCard(now, 'rare'))?.card ?? null }
}

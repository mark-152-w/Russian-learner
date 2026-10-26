// Course progress: lessons taken, checkpoints passed, units completed (and tested out).
import { useLiveQuery } from 'dexie-react-hooks'
import type { ExerciseItem, Unit } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { awardCard, bumpStatsExternal } from '../rewards/service'
import { shuffle } from './rng'
import { runDrill, type DrillContext } from '../engine/drills'

export interface UnitProgress {
  lessons: number
  best: number
  completed?: number
  testedOut?: boolean
}
export type CourseProgress = Record<string, UnitProgress>

export const PASS_MARK = 0.8
export const CHECKPOINT_SIZE = 15

export const getProgress = () => getKV<CourseProgress>('course', {})
export const useCourseProgress = (): CourseProgress =>
  useLiveQuery(async () => ((await db.kv.get('course'))?.value as CourseProgress) ?? {}, [], {} as CourseProgress)

export async function recordLesson(unitId: string): Promise<void> {
  const p = await getProgress()
  const u = p[unitId] ?? { lessons: 0, best: 0 }
  p[unitId] = { ...u, lessons: u.lessons + 1 }
  await setKV('course', p)
}

/** Record a checkpoint result: whether it completed the unit just now, and the card that earned. */
export async function recordCheckpoint(unit: Unit, accuracy: number, testOut: boolean, now: number): Promise<{ completed: boolean; card: string | null }> {
  const p = await getProgress()
  const u = p[unit.id] ?? { lessons: 0, best: 0 }
  const already = !!u.completed
  p[unit.id] = { ...u, best: Math.max(u.best, accuracy) }
  const passed = accuracy >= PASS_MARK
  if (passed && !already) {
    p[unit.id] = { ...p[unit.id]!, completed: now, testedOut: testOut || undefined }
    await bumpStatsExternal({ units: 1, [`units${unit.level}`]: 1 })
  }
  await setKV('course', p)
  const completed = passed && !already
  return { completed, card: completed ? ((await awardCard(now, 'common'))?.card ?? null) : null }
}

/** The first unit not yet completed, in course order. */
export function nextUnit(units: Unit[], p: CourseProgress): Unit | undefined {
  return units.find((u) => !p[u.id]?.completed)
}

/** A lesson: every drill of the unit, in order, lightly interleaved. */
export function lessonItems(unit: Unit, ctx: DrillContext): ExerciseItem[] {
  const blocks = unit.drills.map((d) => runDrill(d, ctx))
  const out: ExerciseItem[] = []
  // round-robin so the lesson moves between activities instead of 10 of the same in a row
  const queues = blocks.map((b) => [...b])
  while (queues.some((q) => q.length)) for (const q of queues) out.push(...q.splice(0, 2))
  return out.slice(0, 28)
}

/** The checkpoint draws a fresh sample from all of the unit's drills. */
export function checkpointItems(unit: Unit, ctx: DrillContext): ExerciseItem[] {
  const all = unit.drills.flatMap((d) => runDrill({ ...d, count: (d.count ?? 6) + 3 }, ctx))
  return shuffle(ctx.rng, [...new Map(all.map((i) => [i.id, i])).values()]).slice(0, CHECKPOINT_SIZE)
}

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ExerciseItem } from '../types/content.gen'
import { db, MedvedDB, useDatabase } from '../db/db'
import { exportProgress, importProgress, parseBackup, BackupError, resetProgress } from '../db/backup'
import { loadSettings, updateSettings } from '../db/settings'
import { getProfile, getStats, masteryKeys, onAppOpen, RewardSession, saveProfile, updateMastery, DEFAULT_PROFILE } from './service'
import { comboMultiplier } from './xp'

let n = 0
beforeEach(async () => {
  useDatabase(new MedvedDB(`test-${++n}`))
  await onAppOpen(T0, () => 0.99)
})

const T0 = new Date(2026, 2, 10, 12).getTime() // a Tuesday, local noon
const item = (i: number, type: ExerciseItem['type'] = 'transform'): ExerciseItem => ({
  id: `t:${i}`, type, level: 'A2', tags: ['case.gen'], vocab: ['n:книга'], prompt: {}, accept: ['кни́ги'],
})
const ok = { correct: true, expected: 'кни́ги' }
const bad = { correct: false, expected: 'кни́ги', errorType: 'case.wrong' }

async function play(s: RewardSession, results: boolean[], start = T0, typeOf: (i: number) => ExerciseItem['type'] = () => 'transform') {
  let t = start
  const effects = []
  for (let i = 0; i < results.length; i++) {
    t += 5000
    effects.push(await s.answer({ item: item(i, typeOf(i)), verdict: results[i] ? ok : bad, ms: 4000, golden: false, now: t }))
  }
  return { effects, t }
}

describe('reward session', () => {
  it('combos build and reset; XP accrues to the profile and the day', async () => {
    const s = new RewardSession('practice', T0)
    const { effects } = await play(s, [true, true, true, true, true, false, true])
    expect(effects.map((e) => e.combo)).toEqual([1, 2, 3, 4, 5, 0, 1])
    expect(effects[4]!.comboUp).toBe(true)
    expect(effects[4]!.multiplier).toBe(comboMultiplier(5))
    expect(effects[5]!.xp).toBe(0)
    const p = await getProfile()
    expect(p.xp).toBeGreaterThanOrEqual(s.xp)
    const day = (await db.days.toArray())[0]!
    expect(day.answers).toBe(7)
    expect(day.correct).toBe(6)
  })

  it('no XP for repeating the same item inside the window', async () => {
    const s = new RewardSession('practice', T0)
    const a = await s.answer({ item: item(1), verdict: ok, ms: 3000, golden: false, now: T0 + 1000 })
    const b = await s.answer({ item: item(1), verdict: ok, ms: 3000, golden: false, now: T0 + 60000 })
    const c = await s.answer({ item: item(1), verdict: ok, ms: 3000, golden: false, now: T0 + 11 * 60000 })
    expect(a.xp).toBeGreaterThan(0)
    expect(b.repeat).toBe(true)
    expect(b.xp).toBe(0)
    expect(c.xp).toBeGreaterThan(0)
  })

  it('updates the learner model: tags, words, error types', async () => {
    const s = new RewardSession('practice', T0)
    await play(s, [true, false, true])
    expect((await db.mastery.get('tag:case.gen'))!.attempts).toBe(3)
    expect((await db.mastery.get('lex:n:книга'))!.correct).toBe(2)
    expect((await db.mastery.get('err:case.wrong'))!.attempts).toBe(1)
    expect(await db.attempts.count()).toBe(3)
  })

  it('finishing a good session extends the streak, opens a chest, unlocks achievements', async () => {
    const s = new RewardSession('practice', T0)
    const { t } = await play(s, Array(10).fill(true))
    const end = (await s.finish(t))!
    expect(end.answered).toBe(10)
    expect(end.accuracy).toBe(1)
    expect(end.chest).not.toBeNull()
    expect(end.streak.current).toBe(1)
    const ids = end.achievements.map((a) => a.id)
    expect(ids).toContain('first-step')
    expect(ids).toContain('session-1')
    expect(ids).toContain('perfect-1')
    expect(ids).toContain('combo-10')
    const stats = await getStats()
    expect(stats.sessions).toBe(1)
    expect(stats.perfectSessions).toBe(1)
    expect(stats.bestCombo).toBe(10)
  })

  it('short sessions get no chest and do not count for the streak', async () => {
    const s = new RewardSession('practice', T0)
    const { t } = await play(s, [true, true, true])
    const end = (await s.finish(t))!
    expect(end.chest).toBeNull()
    expect(end.streak.extended).toBe(false)
  })

  it('quests progress and pay out', async () => {
    const quests = await db.quests.toArray()
    expect(quests).toHaveLength(4)
    const s = new RewardSession('practice', T0)
    await play(s, Array(30).fill(true))
    const after = await db.quests.toArray()
    expect(after.some((q) => q.progress > 0)).toBe(true)
  })
})

describe('learner model helpers', () => {
  it('EWMA mastery moves towards recent results', () => {
    let m = updateMastery(undefined, 'tag:x', 'tag', true, 0)
    expect(m.score).toBe(1)
    m = updateMastery(m, 'tag:x', 'tag', false, 1)
    expect(m.score).toBe(0.75)
    expect(m.attempts).toBe(2)
  })
  it('form keys for the heatmap', () => {
    const lx = { id: 'n:книга', pos: 'noun', lemma: 'кни́га', en: ['book'], gender: 'f' } as never
    const keys = masteryKeys({ ...item(1), target: { lex: 'n:книга', slot: 'pl_gen' } }, lx)
    expect(keys.map((k) => k.key)).toContain('form:noun:gen:pl:f')
  })
})

describe('settings and backup', () => {
  it('settings merge with defaults', async () => {
    await updateSettings({ showStress: false })
    const s = await loadSettings()
    expect(s.showStress).toBe(false)
    expect(s.dailyGoalMinutes).toBe(20)
  })

  it('export → reset → import round-trips everything', async () => {
    const s = new RewardSession('practice', T0)
    const { t } = await play(s, Array(9).fill(true))
    await s.finish(t)
    await saveProfile({ ...(await getProfile()), skin: 'gzhel' })
    const backup = await exportProgress()
    const text = JSON.stringify(backup)
    await resetProgress()
    expect(await db.attempts.count()).toBe(0)
    expect((await getProfile()).xp).toBe(DEFAULT_PROFILE.xp)
    await importProgress(parseBackup(text))
    expect(await db.attempts.count()).toBe(9)
    expect((await getProfile()).skin).toBe('gzhel')
    expect(JSON.parse(JSON.stringify(await exportProgress())).tables).toEqual(JSON.parse(text).tables)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"other"}')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"medved","version":99,"tables":{}}')).toThrow(/newer version/)
    expect(() => parseBackup('{"app":"medved","version":1,"tables":{"evil":[]}}')).toThrow(/Unknown table/)
  })
})

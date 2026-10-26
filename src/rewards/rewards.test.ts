import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../lib/rng'
import { ACHIEVEMENTS, newlyUnlocked, visibleAchievements } from './achievements'
import { rollChest, sessionQuality, SKINS, tierWeights, TIERS, type Tier } from './chest'
import { isHappyHour, nextGoal, rollHappyHour } from './goals'
import { levelInfo, rankFor, xpForLevel } from './levels'
import { applyQuestEvent, questsForPeriod, weekKey } from './quests'
import { applyActivity, daysBetween, streakStatus } from './streak'
import { answerXp, comboMultiplier, comboToNext } from './xp'

const xpIn = { type: 'transform' as const, level: 'A2' as const, correct: true, combo: 1, golden: false, happyHour: false, boost: 1, repeat: false }

describe('XP and anti-grind', () => {
  it('combo multiplier steps ×2 ×3 ×5', () => {
    expect([1, 4, 5, 9, 10, 19, 20, 99].map(comboMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 5, 5])
    expect(comboToNext(7)).toBe(3)
    expect(comboToNext(25)).toBe(0)
  })
  it('wrong or repeated answers earn nothing', () => {
    expect(answerXp({ ...xpIn, correct: false }).xp).toBe(0)
    expect(answerXp({ ...xpIn, repeat: true }).xp).toBe(0)
  })
  it('a card known cold pays far less than one nearly forgotten', () => {
    const cold = answerXp({ ...xpIn, recall: 0.98 }).xp
    const shaky = answerXp({ ...xpIn, recall: 0.5 }).xp
    expect(cold).toBeLessThan(shaky / 2)
    expect(cold).toBeGreaterThanOrEqual(1)
  })
  it('harder items and levels pay more; mastery reduces pay', () => {
    expect(answerXp({ ...xpIn, type: 'dictation' }).xp).toBeGreaterThan(answerXp({ ...xpIn, type: 'choice' }).xp)
    expect(answerXp({ ...xpIn, level: 'B2' }).xp).toBeGreaterThan(answerXp(xpIn).xp)
    expect(answerXp({ ...xpIn, mastery: 0.95 }).xp).toBeLessThan(answerXp({ ...xpIn, mastery: 0.1 }).xp)
  })
  it('multipliers stack: combo × golden × happy hour × boost', () => {
    const base = answerXp(xpIn).xp
    const r = answerXp({ ...xpIn, combo: 20, golden: true, happyHour: true, boost: 1.5 })
    expect(r.multiplier).toBe(75)
    expect(r.xp).toBe(Math.round((base / 1) * 75))
  })
})

describe('levels and ranks', () => {
  it('thresholds increase and ranks change at the right levels', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(3)).toBeGreaterThan(xpForLevel(2))
    expect(rankFor(1).ru).toBe('Тури́ст')
    expect(rankFor(5).ru).toBe('Студе́нт')
    expect(rankFor(45).ru).toBe('Кла́ссик')
    const li = levelInfo(xpForLevel(4) + 10)
    expect(li.level).toBe(4)
    expect(li.into).toBe(10)
    expect(li.nextRank?.ru).toBe('Студе́нт')
  })
})

describe('chests', () => {
  it('quality rewards accuracy and hard items, discounts tiny sessions', () => {
    const great = sessionQuality({ answered: 25, correct: 25, hard: 15 })
    const sloppy = sessionQuality({ answered: 25, correct: 12, hard: 5 })
    const tiny = sessionQuality({ answered: 4, correct: 4, hard: 4 })
    expect(great).toBeGreaterThan(sloppy)
    expect(tiny).toBeLessThan(great / 3)
  })
  it('better sessions shift odds towards rarer tiers', () => {
    const lo = tierWeights(0)
    const hi = tierWeights(1)
    expect(hi[3]! / hi.reduce((a, b) => a + b)).toBeGreaterThan(lo[3]! / lo.reduce((a, b) => a + b))
    const rng = mulberry32(7)
    const count = (q: number) => {
      const c: Record<Tier, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
      for (let i = 0; i < 4000; i++) c[rollChest(q, rng, { skins: ['paper'], freezes: 0 }).tier]++
      return c
    }
    const a = count(0)
    const b = count(1)
    expect(b.epic + b.legendary).toBeGreaterThan(2 * (a.epic + a.legendary))
  })
  it('loot respects caps: no owned skins, no freeze beyond the max', () => {
    const all = SKINS.map((s) => s.id)
    for (const t of TIERS) {
      const r = rollChest(1, mulberry32(3), { skins: all, freezes: 5 }, t)
      expect(r.loot.some((l) => l.kind === 'skin')).toBe(false)
      expect(r.loot.some((l) => l.kind === 'freeze')).toBe(false)
      expect(r.loot[0]!.kind).toBe('xp')
    }
    const leg = rollChest(1, mulberry32(3), { skins: ['paper'], freezes: 0 }, 'legendary')
    expect(leg.loot.some((l) => l.kind === 'skin')).toBe(true)
  })
})

describe('streaks', () => {
  it('extends on consecutive days and resets after a gap', () => {
    let s = { current: 0, longest: 0, lastDay: null as string | null }
    let r = applyActivity(s, 0, '2026-01-01')
    expect(r.streak.current).toBe(1)
    r = applyActivity(r.streak, 0, '2026-01-02')
    expect(r.streak.current).toBe(2)
    expect(applyActivity(r.streak, 0, '2026-01-02').extended).toBe(false)
    s = applyActivity(r.streak, 0, '2026-01-05').streak
    expect(s.current).toBe(1)
    expect(s.longest).toBe(2)
  })
  it('freezes cover missed days', () => {
    const s = { current: 4, longest: 4, lastDay: '2026-01-01' }
    const r = applyActivity(s, 2, '2026-01-04')
    expect(r.usedFreezes).toBe(2)
    expect(r.streak.current).toBe(5)
    expect(r.freezes).toBe(0)
  })
  it('earns a freeze every 7 days', () => {
    const r = applyActivity({ current: 6, longest: 6, lastDay: '2026-01-06' }, 0, '2026-01-07')
    expect(r.earnedFreeze).toBe(true)
    expect(r.freezes).toBe(1)
  })
  it('status for display', () => {
    const s = { current: 5, longest: 5, lastDay: '2026-01-10' }
    expect(streakStatus(s, 0, '2026-01-10').status).toBe('done-today')
    expect(streakStatus(s, 0, '2026-01-11').status).toBe('at-risk')
    expect(streakStatus(s, 1, '2026-01-12').status).toBe('protected')
    expect(streakStatus(s, 0, '2026-01-12')).toEqual({ status: 'broken', shown: 0 })
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })
})

describe('quests', () => {
  const features = new Set<string>()
  it('3 daily + 1 weekly, stable per day, distinct metrics, feature-gated', () => {
    const a = questsForPeriod('2026-03-04', features)
    expect(a).toEqual(questsForPeriod('2026-03-04', features))
    expect(a.filter((q) => q.period.startsWith('d:'))).toHaveLength(3)
    expect(a.filter((q) => q.period.startsWith('w:'))).toHaveLength(1)
    for (let d = 1; d <= 28; d++) {
      const qs = questsForPeriod(`2026-03-${String(d).padStart(2, '0')}`, features)
      expect(qs.some((q) => q.def === 'story-1' || q.def === 'reviews-30')).toBe(false)
    }
    expect(weekKey('2026-03-04')).toBe('2026-03-02')
  })
  it('progress sums or takes the max', () => {
    let q = { id: 'x', period: 'd:2026-01-01', def: 'correct-25', progress: 0, done: false }
    q = applyQuestEvent(q, { correct: 20 }).quest
    const r = applyQuestEvent(q, { correct: 7 })
    expect(r.completed).toBe(true)
    expect(r.quest.progress).toBe(25)
    let c = { id: 'y', period: 'd:2026-01-01', def: 'combo-20', progress: 0, done: false }
    c = applyQuestEvent(c, { bestCombo: 12 }).quest
    c = applyQuestEvent(c, { bestCombo: 8 }).quest
    expect(c.progress).toBe(12)
  })
})

describe('achievements', () => {
  it('has 50+ achievements with unique ids, including hidden ones', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(50)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
    expect(ACHIEVEMENTS.filter((a) => a.hidden).length).toBeGreaterThanOrEqual(8)
  })
  it('unlocks from stats, skipping already-unlocked and unbuilt features', () => {
    const got = newlyUnlocked({ correct: 120, stories: 3 }, new Set(['first-step']), new Set())
    expect(got.map((a) => a.id)).toEqual(['correct-100'])
    expect(visibleAchievements(new Set()).some((a) => a.feature)).toBe(false)
  })
})

describe('happy hour and goals', () => {
  it('rolls at most once a day', () => {
    const always = () => 0
    const r = rollHappyHour(null, '2026-01-01', 1000, always)
    expect(r.started).toBe(true)
    expect(isHappyHour(r.state, 1000 + 60000)).toBe(true)
    expect(rollHappyHour(r.state, '2026-01-01', 2000, always).started).toBe(false)
    const no = rollHappyHour(null, '2026-01-02', 1000, () => 0.99)
    expect(no.started).toBe(false)
    expect(isHappyHour(no.state, 1000)).toBe(false)
  })
  it('next goal prefers a streak at risk, then a nearly-done quest, then levelling up', () => {
    const quests = [{ id: 'a', period: 'd:x', def: 'correct-25', progress: 22, done: false }]
    expect(nextGoal({ xp: 0, xpPerCorrect: 10, quests, streak: { status: 'at-risk', shown: 6 } })).toContain('6-day streak')
    expect(nextGoal({ xp: 0, xpPerCorrect: 1, quests, streak: { status: 'done-today', shown: 6 } })).toContain('3 to go')
    expect(nextGoal({ xp: 0, xpPerCorrect: 10, quests: [], streak: { status: 'done-today', shown: 1 } })).toMatch(/^15 more correct to reach level 2/)
  })
})

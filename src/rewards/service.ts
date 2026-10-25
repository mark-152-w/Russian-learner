// The central rewards module: every section and game reports answers and sessions here.
// Pure calculators live in xp/levels/chest/streak/quests/achievements/goals; this file persists them.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { db, getKV, setKV, type Attempt, type Mastery } from '../db/db'
import { FEATURES } from '../features'
import type { Verdict } from '../engine/grader'
import { parseSlot } from '../engine/slots'
import { mulberry32, type Rng } from '../lib/rng'
import { newlyUnlocked, type AchievementDef, type Stats } from './achievements'
import { MIN_ANSWERS_FOR_CHEST, rollChest, sessionQuality, type Loot, type Tier } from './chest'
import { isHappyHour, rollHappyHour, type HappyHour } from './goals'
import { levelInfo, type LevelInfo } from './levels'
import { applyQuestEvent, isCurrent, questDef, questsForPeriod, type QuestDef, type QuestEvent } from './quests'
import { applyActivity, dayKey, daysBetween, type Streak } from './streak'
import { answerXp, comboMultiplier, REPEAT_WINDOW_MS } from './xp'

export interface Profile {
  xp: number
  streak: Streak
  freezes: number
  boosts: { mult: number; until: number }[]
  skins: string[]
  skin: string
  happyHour: HappyHour | null
  created: number
}

export const DEFAULT_PROFILE: Profile = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDay: null },
  freezes: 1,
  boosts: [],
  skins: ['paper'],
  skin: 'paper',
  happyHour: null,
  created: 0,
}

export const getProfile = async () => ({ ...DEFAULT_PROFILE, ...(await getKV<Partial<Profile>>('profile', {})) })
export const saveProfile = (p: Profile) => setKV('profile', p)
export const getStats = () => getKV<Stats>('stats', {})

export const activeBoost = (p: Profile, now: number) => Math.max(1, ...p.boosts.filter((b) => b.until > now).map((b) => b.mult))

const TYPED = new Set(['cloze', 'transform', 'dictation', 'tiles'])
const HARD = new Set(['cloze', 'transform', 'dictation', 'tiles', 'find-error', 'self-graded'])
export const GOLDEN_CHANCE = 1 / 25

// ------------------------------------------------------------------ learner model
export function updateMastery(prev: Mastery | undefined, key: string, kind: Mastery['kind'], correct: boolean, now: number): Mastery {
  const x = correct ? 1 : 0
  if (!prev) return { key, kind, attempts: 1, correct: x, score: x, last: now }
  return { key, kind, attempts: prev.attempts + 1, correct: prev.correct + x, score: prev.score + 0.25 * (x - prev.score), last: now }
}

/** Learner-model keys touched by one attempt. Form keys feed the case × number × gender heatmap. */
export function masteryKeys(item: ExerciseItem, lx?: Lexeme): { key: string; kind: Mastery['kind'] }[] {
  const keys: { key: string; kind: Mastery['kind'] }[] = (item.tags ?? []).map((t) => ({ key: `tag:${t}`, kind: 'tag' as const }))
  for (const v of item.vocab ?? []) keys.push({ key: `lex:${v}`, kind: 'lex' })
  if (lx && item.target && (lx.pos === 'noun' || lx.pos === 'adj')) {
    const s = parseSlot(lx.pos, item.target.slot)
    if (s.kind === 'case') {
      const gender = s.gender ?? (lx.gender && ['m', 'f', 'n'].includes(lx.gender) ? lx.gender : 'x')
      keys.push({ key: `form:${lx.pos}:${s.case}:${s.number}:${gender}`, kind: 'form' })
    }
  }
  return keys
}

async function bumpStats(delta: Stats, max: Stats = {}): Promise<Stats> {
  const s = await getStats()
  for (const [k, v] of Object.entries(delta)) s[k] = (s[k] ?? 0) + v
  for (const [k, v] of Object.entries(max)) s[k] = Math.max(s[k] ?? 0, v)
  await setKV('stats', s)
  return s
}

async function progressQuests(ev: QuestEvent, today: string): Promise<QuestDef[]> {
  const done: QuestDef[] = []
  for (const q of await db.quests.toArray()) {
    if (!isCurrent(q, today)) continue
    const r = applyQuestEvent(q, ev)
    if (r.quest !== q) await db.quests.put(r.quest)
    if (r.completed) done.push(questDef(q.def)!)
  }
  return done
}

async function addXp(amount: number, now: number) {
  if (!amount) return
  const p = await getProfile()
  p.xp += amount
  await saveProfile(p)
  const day = dayKey(now)
  const d = (await db.days.get(day)) ?? { day, seconds: 0, xp: 0, answers: 0, correct: 0, sessions: 0 }
  d.xp += amount
  await db.days.put(d)
}

/** Unlock achievements whose conditions now hold; each pays its bonus XP. */
async function checkAchievements(now: number): Promise<AchievementDef[]> {
  const p = await getProfile()
  const stats = await getStats()
  const derived: Stats = { ...stats, level: levelInfo(p.xp).level, xp: p.xp, longestStreak: p.streak.longest, skins: p.skins.length }
  const unlocked = new Set((await db.achievements.toArray()).map((a) => a.id))
  const fresh = newlyUnlocked(derived, unlocked, FEATURES as Set<string>)
  for (const a of fresh) {
    await db.achievements.put({ id: a.id, ts: now })
    await addXp(a.xp, now)
  }
  return fresh
}

const ALL_TABLES = () => [db.kv, db.attempts, db.mastery, db.days, db.quests, db.achievements, db.sessions]

// ------------------------------------------------------------------ app open
export interface OpenResult {
  happyHourStarted: boolean
}

export async function onAppOpen(now: number, rng: Rng = Math.random): Promise<OpenResult> {
  return db.transaction('rw', ALL_TABLES(), async () => {
    const p = await getProfile()
    if (!p.created) p.created = now
    const today = dayKey(now)
    const hh = rollHappyHour(p.happyHour, today, now, rng)
    p.happyHour = hh.state
    p.boosts = p.boosts.filter((b) => b.until > now)
    await saveProfile(p)
    await ensureQuests(today)
    return { happyHourStarted: hh.started }
  })
}

export async function ensureQuests(today: string) {
  for (const q of questsForPeriod(today, FEATURES as Set<string>)) {
    if (!(await db.quests.get(q.id))) await db.quests.put(q)
  }
}

// ------------------------------------------------------------------ sessions
export interface AnswerInput {
  item: ExerciseItem
  verdict: Verdict
  ms: number
  golden: boolean
  lexeme?: Lexeme
  /** FSRS retrievability before review, for SRS items. */
  recall?: number | null
  now: number
}

export interface AnswerEffects {
  xp: number
  combo: number
  multiplier: number
  /** The multiplier just stepped up (×2, ×3, ×5). */
  comboUp: boolean
  golden: boolean
  repeat: boolean
  achievements: AchievementDef[]
  quests: QuestDef[]
  levelUp: LevelInfo | null
}

export interface SessionEnd {
  answered: number
  correct: number
  accuracy: number
  xp: number
  bestCombo: number
  chest: { tier: Tier; loot: Loot[] } | null
  streak: { current: number; extended: boolean; usedFreezes: number; earnedFreeze: boolean }
  levelBefore: LevelInfo
  levelAfter: LevelInfo
  achievements: AchievementDef[]
  quests: QuestDef[]
  minutes: number
}

export class RewardSession {
  combo = 0
  bestCombo = 0
  answered = 0
  correct = 0
  hard = 0
  xp = 0
  private wrongRun = 0
  private comebackRun = 0
  private lastAt: number
  private seconds = 0
  private perSlot: Record<string, { n: number; ok: number }> = {}
  private levelBefore: LevelInfo | null = null
  private achievements: AchievementDef[] = []
  private quests: QuestDef[] = []

  constructor(
    readonly kind: string,
    readonly startedAt: number,
    private rng: Rng = mulberry32(startedAt),
  ) {
    this.lastAt = startedAt
  }

  /** Roll whether the next item is golden (≈1 in 25). */
  rollGolden(): boolean {
    return this.rng() < GOLDEN_CHANCE
  }

  async answer(a: AnswerInput): Promise<AnswerEffects> {
    const { item, verdict, now } = a
    return db.transaction('rw', ALL_TABLES(), async () => {
      const p = await getProfile()
      if (!this.levelBefore) this.levelBefore = levelInfo(p.xp)
      const before = levelInfo(p.xp).level
      const today = dayKey(now)

      const recent = await db.attempts.where('item').equals(item.id).filter((x) => x.ts > now - REPEAT_WINDOW_MS && x.xp > 0).count()
      const tagRow = item.tags?.[0] ? await db.mastery.get(`tag:${item.tags[0]}`) : undefined
      const mastery = tagRow && tagRow.attempts >= 5 ? tagRow.score : 0

      const prevMult = comboMultiplier(this.combo)
      this.combo = verdict.correct ? this.combo + 1 : 0
      this.bestCombo = Math.max(this.bestCombo, this.combo)
      this.answered++
      if (verdict.correct) this.correct++
      if (HARD.has(item.type)) this.hard++
      const dt = Math.min(90, Math.max(0, (now - this.lastAt) / 1000))
      this.lastAt = now
      this.seconds += dt

      const r = answerXp({
        type: item.type, level: item.level, correct: verdict.correct, recall: a.recall ?? null, mastery,
        combo: this.combo, golden: a.golden, happyHour: isHappyHour(p.happyHour, now), boost: activeBoost(p, now), repeat: recent > 0,
      })
      this.xp += r.xp

      // per-slot tallies for "perfect round" achievements
      if (item.target && a.lexeme) {
        const s = parseSlot(a.lexeme.pos, item.target.slot)
        const keys = s.kind === 'case' ? [`${s.case}`, `${s.number}_${s.case}`] : []
        for (const k of keys) {
          const t = (this.perSlot[k] ??= { n: 0, ok: 0 })
          t.n++
          if (verdict.correct) t.ok++
        }
      }
      // comebacks: 5 right straight after 3+ wrong
      if (!verdict.correct) {
        this.wrongRun++
        this.comebackRun = 0
      } else {
        this.comebackRun = this.wrongRun >= 3 || this.comebackRun > 0 ? this.comebackRun + 1 : 0
        this.wrongRun = 0
      }

      const ok = verdict.correct ? 1 : 0
      const caseOf = item.target && a.lexeme ? parseSlot(a.lexeme.pos, item.target.slot).case : undefined
      await bumpStats(
        {
          answers: 1,
          correct: ok,
          typedCorrect: ok && TYPED.has(item.type) ? 1 : 0,
          stressCorrect: ok && item.type === 'stress' ? 1 : 0,
          golden: ok && a.golden ? 1 : 0,
          goldenAtX5: ok && a.golden && this.combo >= 20 ? 1 : 0,
          typos: verdict.note === 'typo' ? 1 : 0,
          yo: ok && verdict.expected.includes('ё') && TYPED.has(item.type) && verdict.note !== 'yo' ? 1 : 0,
          fastCorrect: ok && a.ms < 3000 ? 1 : 0,
          comebacks: this.comebackRun === 5 ? 1 : 0,
          ...(caseOf && ok ? { [`case_${caseOf === 'loc2' ? 'prep' : caseOf}`]: 1 } : {}),
        },
        { bestCombo: this.combo },
      )

      const attempt: Attempt = {
        ts: now, item: item.id, type: item.type, level: item.level, tags: item.tags ?? [], lex: item.target?.lex,
        slot: item.target?.slot, correct: verdict.correct, err: verdict.errorType, ms: a.ms, xp: r.xp, golden: a.golden || undefined,
      }
      await db.attempts.add(attempt)
      const keys = masteryKeys(item, a.lexeme)
      if (!verdict.correct && verdict.errorType) keys.push({ key: `err:${verdict.errorType}`, kind: 'err' })
      for (const { key, kind } of keys) {
        await db.mastery.put(updateMastery(await db.mastery.get(key), key, kind, kind === 'err' ? false : verdict.correct, now))
      }

      const d = (await db.days.get(today)) ?? { day: today, seconds: 0, xp: 0, answers: 0, correct: 0, sessions: 0 }
      d.seconds += dt
      d.answers++
      d.correct += ok
      await db.days.put(d)
      await addXp(r.xp, now)

      const quests = await progressQuests(
        {
          correct: ok, xp: r.xp, typedCorrect: ok && TYPED.has(item.type) ? 1 : 0,
          stressCorrect: ok && item.type === 'stress' ? 1 : 0, golden: ok && a.golden ? 1 : 0,
          bestCombo: this.combo, minutes: dt / 60,
        },
        today,
      )
      for (const q of quests) await addXp(q.xp, now)
      const achievements = await checkAchievements(now)
      this.quests.push(...quests)
      this.achievements.push(...achievements)
      const after = levelInfo((await getProfile()).xp)
      return {
        xp: r.xp,
        combo: this.combo,
        multiplier: comboMultiplier(this.combo),
        comboUp: comboMultiplier(this.combo) > prevMult,
        golden: a.golden && verdict.correct,
        repeat: recent > 0,
        achievements,
        quests,
        levelUp: after.level > before ? after : null,
      }
    })
  }

  async finish(now: number): Promise<SessionEnd | null> {
    if (!this.answered) return null
    return db.transaction('rw', ALL_TABLES(), async () => {
      const today = dayKey(now)
      const p = await getProfile()
      const levelBefore = this.levelBefore ?? levelInfo(p.xp)
      const hour = new Date(now).getHours()
      const perfect = this.answered >= 8 && this.correct === this.answered
      const perfectRounds: Stats = {}
      for (const [k, key] of [['pl_gen', 'perfect_pl_gen'], ['ins', 'perfect_ins'], ['prep', 'perfect_prep'], ['dat', 'perfect_dat']] as const) {
        const t = this.perSlot[k]
        if (t && t.n >= 5 && t.ok === t.n) perfectRounds[key] = 1
      }

      // streak (sessions of 5+ answers count)
      const firstToday = !(await db.sessions.where('start').aboveOrEqual(new Date(today + 'T00:00').getTime()).count())
      let streak = { current: p.streak.current, extended: false, usedFreezes: 0, earnedFreeze: false }
      if (this.answered >= 5) {
        const u = applyActivity(p.streak, p.freezes, today)
        p.streak = u.streak
        p.freezes = u.freezes
        streak = { current: u.streak.current, extended: u.extended, usedFreezes: u.usedFreezes, earnedFreeze: u.earnedFreeze }
      }
      const dow = new Date(now).getDay()
      let weekend = 0
      if (dow === 0) {
        const sat = dayKey(now - 86400000)
        weekend = ((await db.days.get(sat))?.sessions ?? 0) > 0 ? 1 : 0
      }

      let chest: SessionEnd['chest'] = null
      let bonusXp = 0
      if (this.answered >= MIN_ANSWERS_FOR_CHEST) {
        chest = rollChest(sessionQuality({ answered: this.answered, correct: this.correct, hard: this.hard }), this.rng, p)
        for (const l of chest.loot) {
          if (l.kind === 'xp') bonusXp += l.amount
          if (l.kind === 'freeze') p.freezes += l.amount
          if (l.kind === 'boost') p.boosts.push({ mult: l.mult, until: now + l.minutes * 60000 })
          if (l.kind === 'skin' && !p.skins.includes(l.skin)) p.skins.push(l.skin)
        }
      }
      await saveProfile(p)
      await addXp(bonusXp, now)

      const d = (await db.days.get(today)) ?? { day: today, seconds: 0, xp: 0, answers: 0, correct: 0, sessions: 0 }
      d.sessions++
      await db.days.put(d)
      await db.sessions.add({
        start: this.startedAt, end: now, kind: this.kind, answered: this.answered, correct: this.correct,
        xp: this.xp + bonusXp, bestCombo: this.bestCombo, chest: chest?.tier,
      })

      await bumpStats({
        sessions: 1,
        perfectSessions: perfect ? 1 : 0,
        nightSessions: hour >= 23 || hour < 4 ? 1 : 0,
        earlySessions: hour >= 5 && hour < 7 ? 1 : 0,
        happyHourSessions: isHappyHour(p.happyHour, now) ? 1 : 0,
        freezesUsed: streak.usedFreezes,
        weekendWarrior: weekend,
        chests: chest ? 1 : 0,
        ...(chest ? { [`chest_${chest.tier}`]: 1 } : {}),
        minutes: this.seconds / 60,
        ...perfectRounds,
      })

      const quests = await progressQuests({ sessions: 1, perfectSessions: perfect ? 1 : 0, activeDays: firstToday ? 1 : 0 }, today)
      for (const q of quests) await addXp(q.xp, now)
      this.quests.push(...quests)
      this.achievements.push(...(await checkAchievements(now)))
      const levelAfter = levelInfo((await getProfile()).xp)
      return {
        answered: this.answered,
        correct: this.correct,
        accuracy: this.correct / this.answered,
        xp: this.xp + bonusXp,
        bestCombo: this.bestCombo,
        chest,
        streak,
        levelBefore,
        levelAfter,
        achievements: this.achievements,
        quests: this.quests,
        minutes: this.seconds / 60,
      }
    })
  }
}

/** Mark an export in stats (for the hidden achievement). */
export async function noteExported(now: number) {
  await bumpStats({ exported: 1 })
  await checkAchievements(now)
}

/** Whether the learner still has to practise today for the streak. */
export async function practisedToday(now: number): Promise<boolean> {
  const p = await getProfile()
  return !!p.streak.lastDay && daysBetween(p.streak.lastDay, dayKey(now)) === 0
}

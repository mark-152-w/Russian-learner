// Today's plan on Home: due reviews, the next course step, one weak spot from the learner model, and
// something light. Each step ticks off once a session of its kind ran today. Pure planSteps() + a loader.
import type { Unit } from '../types/content.gen'
import { db, type Mastery } from '../db/db'
import { dayKey } from '../rewards/streak'
import { countDue, DEFAULT_KNOWN_RANK, knownLexemes } from '../srs/deck'
import { drillableTag } from '../engine/drills'
import { loadHandwritten, loadUnits } from './content'
import { getProgress, nextUnit, type CourseProgress } from './course'
import { coverageOf } from './coverage'
import { getPlacement, learnerLevel } from './learner'
import { getReaderProgress, STORY_INDEX } from './stories'
import { loadIndex } from './lexicon'
import tagsJson from '../data/tags.json'

export interface PlanStep {
  id: 'review' | 'course' | 'weak' | 'read' | 'fun'
  title: string
  detail: string
  to: string
  done: boolean
}

export interface PlanInput {
  due: number
  /** Session kinds finished today (RewardSession kind strings). */
  doneKinds: Set<string>
  next?: Unit
  progress: CourseProgress
  /** Tag mastery rows, already filtered to drillable tags. */
  tagMastery: Mastery[]
  features: ReadonlySet<string>
  /** Days since the epoch: picks today's light item. */
  dayIndex?: number
  /** The next unread story at the learner's level, if any. */
  nextStory?: { id: string; title: string; words: number }
}

/** A topic counts as weak with enough evidence and an accuracy below this. */
export const WEAK_BELOW = 0.75
export const WEAK_MIN_ATTEMPTS = 6

const TAG_LABEL = new Map(tagsJson.items.map((t) => [t.id, t.label]))
export const tagLabel = (tag: string) => TAG_LABEL.get(tag) ?? tag

const FUN = [
  { title: 'Stress sprint', detail: 'Where does the stress fall? Quick taps, no typing.', to: '/trainer/stress/nouns', kind: 'trainer-stress' },
  { title: 'Preposition sort', detail: 'Which case follows без, к, че́рез, ме́жду…?', to: '/trainer/cases/prepositions', kind: 'trainer-cases' },
  { title: 'Numbers and prices', detail: 'два рубля́, пять рубле́й, два́дцать оди́н год…', to: '/trainer/numerals/count', kind: 'trainer-numerals' },
  { title: 'Aspect: process or result?', detail: 'Real contexts, a one-line reason and a timeline.', to: '/trainer/aspect/mixed', kind: 'trainer-aspect' },
  { title: 'Verbs of motion', detail: 'идти́ or ходи́ть? пришёл or ушёл?', to: '/trainer/motion/mixed', kind: 'trainer-motion' },
  { title: 'Case arcade', detail: 'Pick the right form before the noun lands.', to: '/arcade', kind: 'arcade', feature: 'arcade' },
  { title: 'Speed match', detail: 'Five words, five meanings, one minute.', to: '/speed', kind: 'speed', feature: 'speed' },
  { title: "Today's crossword", detail: 'Every answer is an inflected form.', to: '/crossword/daily', kind: 'crossword', feature: 'crossword' },
]

export function weakestTag(rows: Mastery[]): Mastery | undefined {
  return rows
    .filter((m) => m.kind === 'tag' && m.attempts >= WEAK_MIN_ATTEMPTS && m.score < WEAK_BELOW && m.key !== 'tag:vocab')
    .sort((a, b) => a.score - b.score || b.attempts - a.attempts)[0]
}

export function planSteps(x: PlanInput): PlanStep[] {
  const steps: PlanStep[] = []
  const did = (k: string) => x.doneKinds.has(k)
  if (x.features.has('vocab')) {
    steps.push({
      id: 'review',
      title: x.due ? `Review ${x.due} card${x.due === 1 ? '' : 's'}` : 'Learn new words',
      detail: x.due > 100 ? 'A big pile: do one round now and the rest will spread out.' : x.due ? 'Spaced repetition: a few minutes keeps them fresh.' : 'Nothing due. Add a few new words to your deck.',
      to: '/review',
      done: did('review') && x.due === 0,
    })
  }
  if (x.features.has('course') && x.next) {
    const p = x.progress[x.next.id]
    const check = (p?.lessons ?? 0) > 0
    steps.push({
      id: 'course',
      title: check ? `Unit ${x.next.number} checkpoint` : `Unit ${x.next.number}: ${x.next.title.en}`,
      detail: check ? 'You have done the lesson. Score 80% to complete the unit.' : 'Next lesson in your course.',
      to: check ? `/lesson/${x.next.id}/check` : `/lesson/${x.next.id}/lesson`,
      done: did('lesson') || did('checkpoint'),
    })
  }
  const weak = weakestTag(x.tagMastery)
  if (weak) {
    const tag = weak.key.slice(4)
    steps.push({
      id: 'weak',
      title: `Weak spot: ${tagLabel(tag)}`,
      detail: `${Math.round(weak.score * 100)}% recently. A short focused drill.`,
      to: `/drill/tag/${tag}`,
      done: did(`drill-tag-${tag}`),
    })
  }
  if (x.features.has('reader') && x.nextStory) {
    steps.push({
      id: 'read',
      title: `Read: ${x.nextStory.title}`,
      detail: `${x.nextStory.words} words, then a few questions. Tap any word you don't know.`,
      to: `/story/${x.nextStory.id}`,
      done: did('story'),
    })
  }
  // the light item rotates through the trainers day by day
  const funs = FUN.filter((f) => !('feature' in f) || x.features.has(f.feature as string))
  const fun = x.features.has('trainers') ? funs[(x.dayIndex ?? 0) % funs.length]! : { ...FUN[0]!, to: '/drill/tag/stress', kind: 'drill-tag-stress' }
  steps.push({ id: 'fun', title: fun.title, detail: fun.detail, to: fun.to, done: did(fun.kind) })
  return steps
}

export const WORD_MILESTONES = [100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000]

export interface Vocabulary {
  /** Words with a mature card, plus the most frequent words assumed known (see `credited`). */
  known: number
  /** How many of `known` are the top-frequency words the deck skips (placement or default). */
  credited: number
  /** Estimated share of everyday spoken Russian these words cover. */
  coverage: number
  /** The highest milestone reached, and the next one. */
  milestone: number
  nextMilestone?: number
}

export async function loadVocabulary(): Promise<Vocabulary> {
  const [mature, index, placement] = await Promise.all([knownLexemes(), loadIndex('core'), getPlacement()])
  const skip = placement?.knownRank ?? DEFAULT_KNOWN_RANK
  const ranks: number[] = []
  let credited = 0
  for (const [id, , , rank] of index) {
    if (rank <= skip) {
      credited++
      ranks.push(rank)
    } else if (mature.has(id)) ranks.push(rank)
  }
  const known = ranks.length
  return {
    known,
    credited,
    coverage: coverageOf(ranks),
    milestone: [...WORD_MILESTONES].reverse().find((m) => known >= m) ?? 0,
    nextMilestone: WORD_MILESTONES.find((m) => known < m),
  }
}

export async function loadPlan(now: number, features: ReadonlySet<string>): Promise<PlanStep[]> {
  const today = dayKey(now)
  const [due, units, progress, tagRows, hand, sessions, reader, level] = await Promise.all([
    countDue(now),
    loadUnits(),
    getProgress(),
    db.mastery.where('key').startsWith('tag:').toArray(),
    loadHandwritten(),
    db.sessions.where('start').aboveOrEqual(now - 36 * 3600_000).toArray(),
    getReaderProgress(),
    learnerLevel(),
  ])
  const LV = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const story = STORY_INDEX.find((s) => s.kind !== 'dialogue' && !reader[s.id]?.read && LV.indexOf(s.level) >= LV.indexOf(level))
  const nextStory = story ? { id: story.id, title: story.title.en, words: story.words } : undefined
  const doneKinds = new Set(sessions.filter((s) => dayKey(s.start) === today).map((s) => s.kind))
  const tagMastery = tagRows.filter((m) => drillableTag(m.key.slice(4), hand))
  const dayIndex = Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000)
  return planSteps({ due, doneKinds, next: nextUnit(units, progress), progress, tagMastery, features, dayIndex, nextStory })
}

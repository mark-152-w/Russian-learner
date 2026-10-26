// Graded reader and dialogues: lazy story files, a small index for the library, reading progress, and
// plain-English labels for the build-time analysis of each word.
import { useLiveQuery } from 'dexie-react-hooks'
import type { Grammemes, Story, Token } from '../types/content.gen'
import { db, getKV, setKV } from '../db/db'
import { bumpStatsExternal, progressQuestsExternal } from '../rewards/service'
import storyIndex from '../data/stories-index.json'

export interface StoryMeta {
  id: string
  kind: Story['kind']
  level: string
  series?: string
  chapter?: number
  title: { ru?: string; en: string }
  words: number
  questions: number
}
export const STORY_INDEX = storyIndex as StoryMeta[]

const files = import.meta.glob<{ default: Story }>('../data/content/stories/*.json')
export async function loadStory(id: string): Promise<Story | null> {
  const f = files[`../data/content/stories/${id}.json`]
  return f ? (await f()).default : null
}

export const isWord = (t: Token) => !!t.g

// ------------------------------------------------------------------ progress
export interface StoryProgress {
  /** First finished (questions answered). */
  read?: number
  best: number
}
export type ReaderProgress = Record<string, StoryProgress>
export const getReaderProgress = () => getKV<ReaderProgress>('reader', {})
export const useReaderProgress = (): ReaderProgress =>
  useLiveQuery(async () => ((await db.kv.get('reader'))?.value as ReaderProgress) ?? {}, [], {} as ReaderProgress)

/** Record a finished text: the first time it counts towards the story stats, quests and achievements. */
export async function recordStory(id: string, accuracy: number, now: number, kind: Story['kind']) {
  const p = await getReaderProgress()
  const first = !p[id]?.read
  p[id] = { read: p[id]?.read ?? now, best: Math.max(p[id]?.best ?? 0, accuracy) }
  await setKV('reader', p)
  if (first && kind !== 'dialogue') {
    await bumpStatsExternal({ stories: 1 })
    await progressQuestsExternal({ stories: 1 }, now)
  }
  if (first && kind === 'dialogue') await bumpStatsExternal({ dialogues: 1 })
}

// ------------------------------------------------------------------ labels
const CASE: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', ins: 'instrumental', prep: 'prepositional',
  loc2: 'locative (в лесу́)', gen2: 'partitive genitive', voc: 'vocative',
}
const GENDER: Record<string, string> = { m: 'masculine', f: 'feminine', n: 'neuter' }
const NUMBER: Record<string, string> = { sg: 'singular', pl: 'plural' }
const POS: Record<string, string> = {
  noun: 'noun', verb: 'verb', adj: 'adjective', pron: 'pronoun', num: 'numeral', adv: 'adverb', prep: 'preposition',
  conj: 'conjunction', part: 'particle', intj: 'interjection', pred: 'predicative (на́до, мо́жно, нет…)', prtf: 'participle',
  prts: 'short participle', grnd: 'gerund', comp: 'comparative', name: 'name',
}
const PERSON = ['', '1st person', '2nd person', '3rd person']

/** "noun · genitive plural", "verb (perfective) · past, feminine", "adjective · nominative feminine singular". */
export function analysisLabel(g: Grammemes): string {
  const pos = POS[g.pos ?? ''] ?? g.pos ?? ''
  const parts: string[] = []
  if (g.pos === 'verb') {
    const asp = g.aspect ? ` (${g.aspect === 'pf' ? 'perfective' : 'imperfective'})` : ''
    if (g.mood === 'imp') parts.push(`imperative ${NUMBER[g.number ?? 'sg']}`)
    else if (g.tense === 'past') parts.push(`past${g.gender ? `, ${GENDER[g.gender]}` : g.number === 'pl' ? ', plural' : ''}`)
    else if (g.tense) parts.push(`${g.tense === 'fut' ? 'future' : 'present'}, ${PERSON[g.person ?? 3]} ${NUMBER[g.number ?? 'sg']}`)
    else parts.push('infinitive')
    return `verb${asp} · ${parts.join(', ')}`
  }
  if (g.short) parts.push(`short form${g.gender ? `, ${GENDER[g.gender]}` : g.number === 'pl' ? ', plural' : ''}`)
  if (g.degree === 'sup') parts.push('superlative')
  if (g.case) parts.push([CASE[g.case], g.gender ? GENDER[g.gender] : '', g.number ? NUMBER[g.number] : ''].filter(Boolean).join(' '))
  return parts.length ? `${pos} · ${parts.join(', ')}` : pos
}

/** Stress and inline glosses are shown by default at A2–B1 and hidden above. */
export const defaultHelp = (level: string) => ['A1', 'A2', 'B1'].includes(level)

/** Plain text of a sentence for TTS. */
export function sentenceText(tokens: Token[]): string {
  return tokens.map((t) => t.t + (t.sp === false ? '' : ' ')).join('').trim()
}

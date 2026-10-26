import { beforeAll, describe, expect, it } from 'vitest'
import type { Lexeme, Sentence, Story } from '../types/content.gen'
import { loadChunk } from '../lib/lexicon'
import { loadSentences } from '../lib/sentences'
import { mulberry32 } from '../lib/rng'
import { analysisLabel, sentenceText, STORY_INDEX } from '../lib/stories'
import { grade } from './grader'
import { akanye, akanyeItems, pairItems, sentenceDictationItems, shadowItems } from './listening'
import { CODE_TO_RU, lessonLines, LESSONS, lettersUpTo, score } from './keyboard'

const storyFiles = import.meta.glob<{ default: Story }>('../data/content/stories/*.json', { eager: true })
const stories = Object.values(storyFiles).map((m) => m.default)

let pool: Lexeme[]
let sents: Sentence[]
beforeAll(async () => {
  pool = [...(await loadChunk('A1')), ...(await loadChunk('A2'))]
  sents = await loadSentences('A2')
}, 60_000)

describe('stories', () => {
  it('has 40 reading texts and 20 dialogues across A2–C1, indexed', () => {
    const reading = stories.filter((s) => s.kind !== 'dialogue')
    expect(reading).toHaveLength(40)
    expect(stories.filter((s) => s.kind === 'dialogue')).toHaveLength(20)
    expect(new Set(reading.map((s) => s.level))).toEqual(new Set(['A2', 'B1', 'B2', 'C1']))
    expect(STORY_INDEX).toHaveLength(stories.length)
  })
  it('every word carries an analysis and every question is answerable', () => {
    for (const s of stories) {
      expect(s.questions.length, s.id).toBeGreaterThanOrEqual(3)
      for (const se of s.sentences) for (const t of se.tokens) if (/[а-яё]/i.test(t.t)) expect(t.g && t.lemma, `${s.id} ${t.t}`).toBeTruthy() // ru-ignore
      for (const q of s.questions) expect(grade(q, { kind: 'choice', value: q.accept![0]! }).correct, q.id).toBe(true)
    }
  })
  it('labels analyses in plain English', () => {
    expect(analysisLabel({ pos: 'noun', case: 'gen', number: 'pl' })).toBe('noun · genitive plural')
    expect(analysisLabel({ pos: 'verb', aspect: 'pf', tense: 'past', gender: 'f', number: 'sg' })).toBe('verb (perfective) · past, feminine')
    expect(analysisLabel({ pos: 'verb', aspect: 'impf', tense: 'pres', person: 3, number: 'pl' })).toBe('verb (imperfective) · present, 3rd person plural')
  })
  it('rebuilds sentence text with spacing', () => {
    expect(sentenceText([{ t: 'Приве́т', sp: false }, { t: '!' }])).toBe('Приве́т!')
  })
})

describe('listening', () => {
  it('áканье: unstressed о is heard as а, the stressed one stays', () => {
    expect(akanye('молоко́')).toBe('малако')
    expect(akanye('хорошо́')).toBe('харашо')
    expect(akanye('до́ма')).toBe('дома')
  })
  it('builds dictation, shadowing, pairs and а́канье items that grade their own answer', () => {
    const rng = mulberry32(1)
    const items = [
      ...sentenceDictationItems(sents, rng, 6),
      ...shadowItems(sents, rng, 4, true),
      ...pairItems('yi', rng, 6),
      ...pairItems('soft', rng, 6),
      ...akanyeItems(pool, rng, 6),
    ]
    expect(items.length).toBe(28)
    for (const it of items) {
      const r = it.type === 'listen-choose' ? { kind: 'choice' as const, value: it.choices![it.answerIndex!]! } : { kind: 'text' as const, text: it.accept![0]! }
      expect(grade(it, r).correct, it.id).toBe(true)
    }
    expect(shadowItems(sents, rng, 2, false)[0]!.type).toBe('self-graded')
  })
})

describe('keyboard', () => {
  it('maps physical keys to ЙЦУКЕН', () => {
    expect(CODE_TO_RU.KeyF).toBe('а')
    expect(CODE_TO_RU.KeyJ).toBe('о')
    expect(CODE_TO_RU.Semicolon).toBe('ж')
    expect(lettersUpTo(LESSONS.length - 1)).toHaveLength(33)
  })
  it('each lesson only uses letters learned so far', () => {
    for (const l of LESSONS.slice(0, -1)) {
      const known = new Set([...lettersUpTo(l.n), ' '])
      const lines = lessonLines(l.n, pool, sents, mulberry32(l.n))
      expect(lines.length, `lesson ${l.n}`).toBeGreaterThanOrEqual(2)
      for (const line of lines) for (const ch of line) expect(known.has(ch), `lesson ${l.n}: ${line}`).toBe(true)
    }
    expect(lessonLines(13, pool, sents, mulberry32(1)).length).toBeGreaterThan(0)
  })
  it('scores words per minute and accuracy', () => {
    expect(score(100, 60_000, 5)).toEqual({ wpm: 20, accuracy: 0.95 })
  })
})

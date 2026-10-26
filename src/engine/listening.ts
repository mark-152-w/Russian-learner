// Listening and speaking items: sentence dictation, hearing the difference (ы/и, hard/soft consonants),
// unstressed о (а́канье) and shadowing. Every item needs a Russian voice; the Listening page hides them otherwise.
import type { ExerciseItem, Lexeme, Sentence } from '../types/content.gen'
import { shuffle, type Rng } from '../lib/rng'
import { stressIndex, syllables } from '../lib/ru'
import { wordTokens } from '../lib/sentences'
import { gloss, isDrillable } from './generators'

/** Short sentences from the bank for dictation and shadowing. */
function shortSentences(pool: Sentence[], maxWords: number) {
  return pool.filter((s) => {
    const n = wordTokens(s).length
    return n >= 3 && n <= maxWords && !/[0-9]/.test(s.ru)
  })
}

export function sentenceDictationItems(pool: Sentence[], rng: Rng, n: number, maxWords = 8): ExerciseItem[] {
  return shuffle(rng, shortSentences(pool, maxWords))
    .slice(0, n)
    .map((s) => ({
      id: `ls:dict:${s.id}`,
      type: 'dictation',
      level: s.lv,
      tags: ['listening'],
      source: 'generated',
      prompt: { audio: s.ru, instruction: 'Type the sentence you hear' },
      accept: [s.ru],
      reason: s.en[0],
    }))
}

/** Shadowing: hear it, say it. With speech recognition the answer is spoken; without, it's self-checked. */
export function shadowItems(pool: Sentence[], rng: Rng, n: number, canRecognise: boolean): ExerciseItem[] {
  return shuffle(rng, shortSentences(pool, 7))
    .slice(0, n)
    .map((s) =>
      canRecognise
        ? {
            id: `ls:shadow:${s.id}`,
            type: 'dictation',
            level: s.lv,
            tags: ['listening', 'speaking'],
            source: 'generated',
            prompt: { audio: s.ru, instruction: 'Listen, then say it aloud', en: s.en[0] },
            accept: [s.ru],
          }
        : {
            id: `ls:shadow:${s.id}`,
            type: 'self-graded',
            level: s.lv,
            tags: ['listening', 'speaking'],
            source: 'generated',
            prompt: { audio: s.ru, instruction: 'Listen, say it aloud, then check', en: s.en[0] },
            model: s.ru,
          },
    )
}

interface Pair {
  a: string
  b: string
  ea: string
  eb: string
}
/** Words told apart only by ы/и, or by a hard/soft final consonant. */
export const YI_PAIRS: Pair[] = [
  { a: 'был', b: 'бил', ea: 'was', eb: 'hit, beat' },
  { a: 'мыл', b: 'мил', ea: 'washed', eb: 'sweet, dear' },
  { a: 'пыл', b: 'пил', ea: 'ardour', eb: 'drank' },
  { a: 'быть', b: 'бить', ea: 'to be', eb: 'to hit' },
  { a: 'выть', b: 'вить', ea: 'to howl', eb: 'to weave' },
  { a: 'мы́шка', b: 'ми́шка', ea: 'little mouse', eb: 'teddy bear' },
]
export const SOFT_PAIRS: Pair[] = [
  { a: 'брат', b: 'брать', ea: 'brother', eb: 'to take' },
  { a: 'мат', b: 'мать', ea: 'checkmate', eb: 'mother' },
  { a: 'вес', b: 'весь', ea: 'weight', eb: 'all, whole' },
  { a: 'у́гол', b: 'у́голь', ea: 'corner', eb: 'coal' },
  { a: 'по́лка', b: 'по́лька', ea: 'shelf', eb: 'Polish woman; polka' },
  { a: 'стал', b: 'сталь', ea: 'became', eb: 'steel' },
  { a: 'рад', b: 'ряд', ea: 'glad', eb: 'row' },
  { a: 'лук', b: 'люк', ea: 'onion', eb: 'hatch' },
  { a: 'мал', b: 'мял', ea: 'small', eb: 'crumpled' },
  { a: 'ел', b: 'ель', ea: 'ate', eb: 'fir tree' },
]

export function pairItems(kind: 'yi' | 'soft', rng: Rng, n: number): ExerciseItem[] {
  const pairs = kind === 'yi' ? YI_PAIRS : SOFT_PAIRS
  const items: ExerciseItem[] = []
  for (let i = 0; i < n; i++) {
    const p = pairs[i % pairs.length]!
    const [want, other] = rng() < 0.5 ? [p.a, p.b] : [p.b, p.a]
    const choices = [p.a, p.b]
    items.push({
      id: `ls:${kind}:${want}:${i}`,
      type: 'listen-choose',
      level: 'A2',
      tags: [kind === 'yi' ? 'phonetics.y-i' : 'phonetics.hard-soft', 'listening'],
      source: 'generated',
      prompt: { audio: want, instruction: 'Which word do you hear?' },
      choices,
      answerIndex: choices.indexOf(want),
      distractors: [{ ru: other, error: 'listening.misheard' }],
      reason: `**${p.a}**: ${p.ea} · **${p.b}**: ${p.eb}`,
    })
  }
  return shuffle(rng, items)
}

/** How a word with unstressed о sounds (а́канье): о before the stress → а; further away → a weak "uh". */
export function akanye(word: string): string {
  const stressed = stressIndex(word)
  let vi = -1
  let out = ''
  for (const ch of word.replace(/́/g, '')) {
    if (/[аеёиоуыэюя]/i.test(ch)) vi++ // ru-ignore
    out += ch === 'о' && vi !== stressed ? 'а' : ch // ru-ignore
  }
  return out
}

/** Dictation of words whose unstressed о you hear as а: молоко́ sounds like «малако». */
export function akanyeItems(pool: Lexeme[], rng: Rng, n: number): ExerciseItem[] {
  const words = pool.filter((x) => (x.pos === 'noun' || x.pos === 'adj' || x.pos === 'verb') && isDrillable(x) && syllables(x.lemma) >= 2)
  const out: ExerciseItem[] = []
  for (const lx of shuffle(rng, words)) {
    if (out.length >= n) break
    const heard = akanye(lx.lemma)
    if (heard === lx.lemma.replace(/́/g, '')) continue // no unstressed о
    out.push({
      id: `ls:akanye:${lx.id}`,
      type: 'dictation',
      level: lx.level ?? 'A2',
      tags: ['phonetics.vowel-reduction', 'listening'],
      vocab: [lx.id],
      source: 'generated',
      prompt: { audio: lx.lemma, instruction: 'Type the word you hear', en: gloss(lx) },
      accept: [lx.lemma],
      reason: `Unstressed о sounds like а: you hear «${heard}», you write **${lx.lemma}**.`,
    })
  }
  return out
}


// Idiom practice: what does the expression mean? Distractors are meanings of other expressions, preferring the
// same kind (an idiom against idioms, a greeting against greetings).
import type { ExerciseItem } from '../types/content.gen'
import type { Idiom } from '../lib/content'
import { shuffle, type Rng } from '../lib/rng'

export function idiomItem(it: Idiom, all: Idiom[], rng: Rng): ExerciseItem {
  const others = shuffle(rng, all.filter((x) => x.id !== it.id && x.meaning !== it.meaning))
  const sameKind = others.filter((x) => x.kind === it.kind)
  const wrong = [...new Set([...sameKind, ...others].map((x) => x.meaning))].slice(0, 3)
  const choices = shuffle(rng, [it.meaning, ...wrong])
  return {
    id: `idm:${it.id}`,
    type: 'choice',
    level: it.level,
    tags: ['vocab'],
    source: 'generated',
    prompt: { ru: it.ru, instruction: 'What does it mean?' },
    choices,
    answerIndex: choices.indexOf(it.meaning),
    reason: it.literal ? `Literally: *${it.literal}*.` : undefined,
  }
}

export function idiomSession(all: Idiom[], rng: Rng, n = 10, kind?: string): ExerciseItem[] {
  const pool = kind ? all.filter((x) => x.kind === kind) : all
  return shuffle(rng, pool).slice(0, n).map((it) => idiomItem(it, all, rng))
}

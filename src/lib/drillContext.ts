// Assemble everything generators need for the learner's level.
import type { Lexeme } from '../types/content.gen'
import type { DrillContext } from '../engine/drills'
import { loadHandwritten } from './content'
import { learnerLevel, type CourseLevel } from './learner'
import { loadLexemes, poolUpTo } from './lexicon'
import { mulberry32 } from './rng'
import { sentencesUpTo } from './sentences'

export async function buildDrillContext(opts: { level?: CourseLevel; vocab?: string[]; hasVoice: boolean; seed?: number }): Promise<DrillContext> {
  const level = opts.level ?? (await learnerLevel())
  const pool = await poolUpTo(level)
  const extra = opts.vocab?.length ? await loadLexemes(opts.vocab) : new Map<string, Lexeme>()
  const lexemes = new Map<string, Lexeme>([...pool.map((x) => [x.id, x] as const), ...extra])
  return {
    lexemes,
    pool,
    vocab: (opts.vocab ?? []).map((id) => lexemes.get(id)).filter((x): x is Lexeme => !!x),
    sentences: await sentencesUpTo(level),
    handwritten: await loadHandwritten(),
    rng: mulberry32(opts.seed ?? Date.now()),
    hasVoice: opts.hasVoice,
  }
}

// Drill registry: turns a unit's drill spec ({generator, params, count} or hand-written item ids) into items.
import type { ExerciseItem, Lexeme, Sentence } from '../types/content.gen'
import { pick, shuffle, type Rng } from '../lib/rng'
import { soleLexeme, wordTokens } from '../lib/sentences'
import { choiceItem, drillableSlots, gloss, isDrillable, listenItem, matchItem, meaningItem, stressItem, transformItem } from './generators'
import { caseClozeItems, findErrorItem, patternItems, tilesItem, verbClozeItems, type NounClass } from './sentenceGen'
import type { Case } from './slots'

export interface DrillSpec {
  generator?: string
  params?: Record<string, unknown>
  items?: string[]
  count?: number
}

export interface DrillContext {
  lexemes: Map<string, Lexeme>
  /** Sentences at or below the learner's level. */
  sentences: Sentence[]
  /** The unit's own words (drills prefer them). */
  vocab: Lexeme[]
  /** Wider practice pool (the level's vocabulary). */
  pool: Lexeme[]
  handwritten: Map<string, ExerciseItem>
  rng: Rng
  hasVoice: boolean
}

type P = Record<string, unknown>
const arr = <T>(p: P, k: string) => (Array.isArray(p[k]) ? (p[k] as T[]) : undefined)

/** English → Russian: write the dictionary form. */
export function enRuItem(lx: Lexeme): ExerciseItem {
  const slot = { noun: 'sg_nom', verb: 'inf', adj: 'm_nom', other: '' }[lx.pos]
  return {
    id: `gen:enru:${lx.id}`, type: 'transform', level: lx.level ?? 'C2', tags: ['vocab'], vocab: [lx.id], source: 'generated',
    ...(slot ? { target: { lex: lx.id, slot } } : {}),
    prompt: { en: gloss(lx), instruction: 'Write in Russian' }, accept: [lx.lemma],
  }
}

/** Sentences that contain the unit's words come first. */
function unitSentences(ctx: DrillContext): Sentence[] {
  const ids = new Set(ctx.vocab.map((v) => v.id))
  const withVocab = ctx.sentences.filter((s) => wordTokens(s).some((t) => ids.has(soleLexeme(t) ?? '')))
  const rest = ctx.sentences.filter((s) => !withVocab.includes(s))
  return [...shuffle(ctx.rng, withVocab), ...shuffle(ctx.rng, rest)]
}

function take(items: Iterable<ExerciseItem>, n: number): ExerciseItem[] {
  const out: ExerciseItem[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.id)) continue
    seen.add(it.id)
    out.push(it)
    if (out.length >= n) break
  }
  return out
}

function* clozeStream(ctx: DrillContext, p: P): Generator<ExerciseItem> {
  const choiceShare = typeof p.choice === 'number' ? p.choice : 0.3
  for (const s of unitSentences(ctx)) {
    const items = caseClozeItems(s, ctx.lexemes, {
      cases: arr<Case>(p, 'cases'), numbers: arr(p, 'numbers'), tags: arr(p, 'tags'), pos: arr(p, 'pos'),
      choice: ctx.rng() < choiceShare, rng: ctx.rng,
    })
    if (items.length) yield pick(ctx.rng, items)
  }
}

export const GENERATORS: Record<string, (ctx: DrillContext, p: P, n: number) => ExerciseItem[]> = {
  'case-cloze': (ctx, p, n) => take(clozeStream(ctx, p), n),

  'verb-cloze': (ctx, p, n) => {
    const kinds = arr<string>(p, 'kinds') ?? ['np', 'pst', 'imp']
    return take((function* () {
      for (const s of unitSentences(ctx)) {
        const items = verbClozeItems(s, ctx.lexemes, kinds)
        if (items.length) yield pick(ctx.rng, items)
      }
    })(), n)
  },

  forms: (ctx, p, n) => {
    const src = (p.fromPool ? ctx.pool : ctx.vocab).filter((x) => isDrillable(x) && (!p.pos || x.pos === p.pos))
    const slots = arr<string>(p, 'slots')
    return take((function* () {
      for (let i = 0; i < n * 6 && src.length; i++) {
        const lx = pick(ctx.rng, src)
        const ok = drillableSlots(lx).filter((s) => !slots || slots.includes(s))
        if (!ok.length) continue
        const slot = pick(ctx.rng, ok)
        yield (ctx.rng() < 0.4 ? choiceItem(lx, slot, ctx.rng) : null) ?? transformItem(lx, slot)
      }
    })(), n)
  },

  pattern: (ctx, p, n) => patternItems(ctx.pool, (p.class as NounClass) ?? 'fem-a', arr<string>(p, 'slots') ?? ['pl_gen'], ctx.rng, n),

  vocab: (ctx, _p, n) => {
    const words = shuffle(ctx.rng, ctx.vocab)
    return take((function* () {
      for (const lx of words) {
        const r = ctx.rng()
        if (r < 0.35) yield meaningItem(lx, ctx.pool, ctx.rng) ?? enRuItem(lx)
        else if (r < 0.55 && ctx.hasVoice) yield listenItem(lx, ctx.pool, ctx.rng) ?? enRuItem(lx)
        else yield enRuItem(lx)
      }
    })(), n)
  },

  stress: (ctx, _p, n) => take(shuffle(ctx.rng, ctx.vocab).map((lx) => stressItem(lx, ctx.rng)).filter((x): x is ExerciseItem => !!x), n),

  match: (ctx) => {
    const m = matchItem(shuffle(ctx.rng, ctx.vocab).slice(0, 6))
    return m ? [m] : []
  },

  'find-error': (ctx, _p, n) => take((function* () {
    for (const s of unitSentences(ctx)) {
      const it = findErrorItem(s, ctx.lexemes, ctx.rng)
      if (it) yield it
    }
  })(), n),

  tiles: (ctx, _p, n) => take((function* () {
    for (const s of unitSentences(ctx)) {
      const it = tilesItem(s, ctx.lexemes, ctx.rng)
      if (it) yield it
    }
  })(), n),
}

export function runDrill(spec: DrillSpec, ctx: DrillContext): ExerciseItem[] {
  const out: ExerciseItem[] = []
  for (const id of spec.items ?? []) {
    const it = ctx.handwritten.get(id)
    if (it) out.push(it)
  }
  if (spec.generator) {
    const gen = GENERATORS[spec.generator]
    if (!gen) throw new Error(`unknown generator ${spec.generator}`)
    out.push(...gen(ctx, spec.params ?? {}, spec.count ?? 6))
  }
  return out
}

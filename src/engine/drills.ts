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

// Which sentences use the unit's words: worked out once per drill context (a lesson runs several drills over
// tens of thousands of sentences), then shuffled afresh for each drill.
const split = new WeakMap<DrillContext, { withVocab: Sentence[]; rest: Sentence[] }>()

/** Sentences that contain the unit's words come first. */
function unitSentences(ctx: DrillContext): Sentence[] {
  let sp = split.get(ctx)
  if (!sp) {
    const ids = new Set(ctx.vocab.map((v) => v.id))
    const withVocab: Sentence[] = []
    const rest: Sentence[] = []
    for (const s of ctx.sentences) (wordTokens(s).some((t) => ids.has(soleLexeme(t) ?? '')) ? withVocab : rest).push(s)
    sp = { withVocab, rest }
    split.set(ctx, sp)
  }
  return [...shuffle(ctx.rng, sp.withVocab), ...shuffle(ctx.rng, sp.rest)]
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

/** Grammar tag → how to build a drill of exactly that topic (generated items + hand-written ones with the tag). */
export function itemsForTag(tag: string, ctx: DrillContext, count = 12): ExerciseItem[] {
  const hand = [...ctx.handwritten.values()].filter((i) => i.tags.includes(tag))
  const gen: ExerciseItem[] = []
  const caseMatch = /^case\.(nom|gen|dat|acc|ins|prep)(\.|$)/.exec(tag)
  const want = Math.max(0, count - Math.min(hand.length, Math.ceil(count / 2)))
  if (tag === 'case.loc2') gen.push(...GENERATORS['case-cloze']!(ctx, { tags: [tag] }, want))
  else if (caseMatch) {
    const kase = caseMatch[1]
    const exact = tag.split('.').length > 2
    gen.push(...GENERATORS['case-cloze']!(ctx, exact ? { tags: [tag] } : { cases: [kase] }, Math.ceil(want * 0.7)))
    if (!exact) gen.push(...GENERATORS.forms!({ ...ctx, vocab: ctx.pool }, { pos: 'noun', slots: [`sg_${kase}`, `pl_${kase}`] }, want - gen.length))
  } else if (tag === 'case.plural') {
    gen.push(...GENERATORS['case-cloze']!(ctx, { numbers: ['pl'] }, Math.ceil(want / 2)))
    gen.push(...GENERATORS.forms!({ ...ctx, vocab: ctx.pool }, { pos: 'noun', slots: ['pl_nom', 'pl_gen', 'pl_dat', 'pl_acc', 'pl_ins', 'pl_prep'] }, want - gen.length))
  } else if (tag === 'adj.agreement') {
    gen.push(...GENERATORS['case-cloze']!(ctx, { pos: ['adj'] }, Math.ceil(want / 2)))
    gen.push(...GENERATORS.forms!({ ...ctx, vocab: ctx.pool }, { pos: 'adj' }, want - gen.length))
  } else if (tag.startsWith('verb.')) {
    const kinds = { 'verb.present': ['np'], 'verb.future': ['np'], 'verb.past': ['pst'], 'verb.imperative': ['imp'] }[tag] ?? ['np', 'pst']
    gen.push(...GENERATORS['verb-cloze']!(ctx, { kinds }, Math.ceil(want / 2)))
    const prefix = { np: 'np_', pst: 'pst_', imp: 'imp_' } as Record<string, string>
    const slots = ['np_1sg', 'np_2sg', 'np_3sg', 'np_1pl', 'np_2pl', 'np_3pl', 'pst_m', 'pst_f', 'pst_n', 'pst_pl', 'imp_sg', 'imp_pl'].filter((s) =>
      kinds.some((k) => s.startsWith(prefix[k]!)),
    )
    gen.push(...GENERATORS.forms!({ ...ctx, vocab: ctx.pool }, { pos: 'verb', slots }, want - gen.length))
  } else if (tag === 'case.gen.quantity' || tag === 'num.governance') {
    gen.push(...GENERATORS['case-cloze']!(ctx, { tags: ['case.gen.quantity', 'num.governance'] }, want))
  } else if (tag === 'stress') gen.push(...GENERATORS.stress!({ ...ctx, vocab: shuffle(ctx.rng, ctx.pool).slice(0, 40) }, {}, want))
  else if (tag === 'vocab') gen.push(...GENERATORS.vocab!({ ...ctx, vocab: shuffle(ctx.rng, ctx.pool).slice(0, 40) }, {}, want))
  return shuffle(ctx.rng, [...shuffle(ctx.rng, hand).slice(0, count - gen.length), ...gen]).slice(0, count)
}

/** Tags this build can drill (generated or hand-written). */
export function drillableTag(tag: string, handwritten: Map<string, ExerciseItem>): boolean {
  if (/^case\.|^verb\.(present|past|future|imperative)$|^adj\.agreement$|^num\.governance$|^stress$|^vocab$/.test(tag)) return true
  return [...handwritten.values()].some((i) => i.tags.includes(tag))
}

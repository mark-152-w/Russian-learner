// Programmatic drill generators: exercises built straight from the verified lexicon.
// Every form used comes from a usable (verified, stressed, non-rare) variant.
import type { ExerciseItem, Lexeme, Sentence } from '../types/content.gen'
import { SLOTS, decodeCell, formsOf, primaryForm } from '../lib/lexicon'
import { fold, stressIndex, syllables } from '../lib/ru'
import { hashString, pick, shuffle, weighted, type Rng } from '../lib/rng'
import { soleLexeme, wordTokens } from '../lib/sentences'
import { diagnoseForm } from './diagnose'
import { parseSlot, slotLabel, slotTags } from './slots'

type Level = NonNullable<Lexeme['level']>
type Distractor = NonNullable<ExerciseItem['distractors']>[number]

/** Short English gloss: first synonym of the first sense. */
export function gloss(lx: Lexeme): string {
  const first = lx.en[0].split(/,(?![^(]*\))/)[0]!.trim()
  return first.length > 40 ? first.slice(0, 38) + '…' : first
}

export function isDrillable(lx: Lexeme): boolean {
  if (lx.pos === 'other' || !lx.forms) return false
  if (lx.flags?.includes('suspect') || lx.flags?.includes('lemma-unstressed')) return false
  if (lx.indeclinable) return false
  return lx.lemma[0] === lx.lemma[0]!.toLowerCase()
}

/** Slots worth drilling as a transformation: usable and different from the dictionary form. */
export function drillableSlots(lx: Lexeme): string[] {
  const skip = new Set(['sg_nom', 'm_nom', 'inf', 'sg_loc2', 'sup'])
  const lemma = fold(lx.lemma)
  return SLOTS[lx.pos].filter((slot) => {
    if (skip.has(slot)) return false
    const f = primaryForm(lx, slot)
    return !!f && fold(f) !== lemma
  })
}

const level = (lx: Lexeme): Level => lx.level ?? 'C2'

/** Accepted answers for a slot: usable variants first, then rare ones (accepted, never taught). */
function acceptsFor(lx: Lexeme, slot: string): string[] {
  const vs = formsOf(lx, slot).filter((v) => !v.unverified)
  return [...vs.filter((v) => !v.rare), ...vs.filter((v) => v.rare)].map((v) => v.form)
}

function base(lx: Lexeme, slot: string, type: ExerciseItem['type'], prefix: string): ExerciseItem {
  const tags = slotTags(lx.pos, slot, lx.aspect)
  if (lx.pos === 'noun' && lx.animate && parseSlot('noun', slot).case === 'acc') tags.push('case.acc.animacy')
  return {
    id: `gen:${prefix}:${lx.id}:${slot}`,
    type,
    level: level(lx),
    tags: tags as [string, ...string[]],
    vocab: [lx.id],
    target: { lex: lx.id, slot },
    prompt: {},
    source: 'generated',
  }
}

export function transformItem(lx: Lexeme, slot: string): ExerciseItem {
  const it = base(lx, slot, 'transform', 'tr')
  it.prompt = { ru: lx.lemma, en: gloss(lx), instruction: `Put into the ${slotLabel(lx.pos, slot, lx.aspect)}` }
  it.accept = acceptsFor(lx, slot) as [string, ...string[]]
  return it
}

/** Invented misspellings that break a spelling rule (plausible wrong endings, not random words). */
export function spellingFakes(form: string): { ru: string; error: string }[] {
  const out: { ru: string; error: string }[] = []
  const m7 = form.replace(/([кгхжшщч])и(?=\u0301?[^а-яё]*$)/, '$1ы')
  if (m7 !== form) out.push({ ru: m7, error: 'spelling.7-letter' })
  const ya = form.replace(/([жшщч])а(?=\u0301?т?$)/, '$1я').replace(/([жшщч])у(\u0301?)$/, '$1ю$2')
  if (ya !== form) out.push({ ru: ya, error: 'spelling.ya-a' })
  // unstressed е after a husher written as о (ме́сяцем → ме́сяцом)
  const m5 = form.replace(/([жшщчц])е(?=м$|й$|го$|му$)/, '$1о')
  if (m5 !== form && !/[жшщчц]е́/.test(form)) out.push({ ru: m5, error: 'spelling.5-letter' })
  return out
}

export function choiceItem(lx: Lexeme, slot: string, rng: Rng): ExerciseItem | null {
  const it = base(lx, slot, 'choice', 'ch')
  const accepts = acceptsFor(lx, slot)
  const correct = accepts[0]
  if (!correct) return null
  const taken = new Set(accepts.map(fold))
  const e = parseSlot(lx.pos, slot)
  const candidates: { form: string; dist: number }[] = []
  for (const s of SLOTS[lx.pos]) {
    const f = primaryForm(lx, s)
    if (!f || taken.has(fold(f))) continue
    const g = parseSlot(lx.pos, s)
    if (g.kind !== e.kind && !(lx.pos === 'verb')) continue
    const dist = (g.case !== e.case ? 1 : 0) + (g.number !== e.number ? 1 : 0) + (g.gender !== e.gender ? 1 : 0)
    taken.add(fold(f))
    candidates.push({ form: f, dist: dist + rng() * 0.5 })
  }
  candidates.sort((a, b) => a.dist - b.dist)
  const distractors: Distractor[] = []
  const fake = shuffle(rng, spellingFakes(correct))[0]
  for (const c of candidates.slice(0, fake ? 2 : 3)) {
    const d = diagnoseForm(lx, slot, fold(c.form), it.tags)
    distractors.push({ ru: c.form, error: d?.errorType ?? 'case.wrong', why: d?.message })
  }
  if (fake) {
    const d = diagnoseForm(lx, slot, fold(fake.ru), it.tags)
    distractors.push({ ru: fake.ru, error: fake.error, why: d?.message })
  }
  if (distractors.length < 2) return null
  it.prompt = { ru: lx.lemma, en: gloss(lx), instruction: `Choose the ${slotLabel(lx.pos, slot, lx.aspect)}` }
  it.accept = accepts as [string, ...string[]]
  it.distractors = distractors
  return it
}

export function stressItem(lx: Lexeme, rng: Rng, dictionaryOnly = false): ExerciseItem | null {
  // beginners, who haven't met endings yet, are asked about the dictionary form only
  if (dictionaryOnly) {
    if (syllables(lx.lemma) < 2 || stressIndex(lx.lemma) === null) return null
    return {
      id: `gen:st:${lx.id}:lemma`, type: 'stress', level: level(lx), tags: ['stress'], vocab: [lx.id], source: 'generated',
      stressWord: lx.lemma, prompt: { instruction: 'Tap the stressed vowel', en: gloss(lx) },
    }
  }
  const lemmaIdx = stressIndex(lx.lemma)
  const options = SLOTS[lx.pos]
    .map((slot) => ({ slot, form: primaryForm(lx, slot) }))
    .filter((o): o is { slot: string; form: string } => !!o.form && syllables(o.form) > 1 && stressIndex(o.form) !== null)
  if (!options.length) return null
  const shifted = options.filter((o) => stressIndex(o.form) !== lemmaIdx)
  const o = shifted.length && rng() < 0.7 ? pick(rng, shifted) : pick(rng, options)
  const it = base(lx, o.slot, 'stress', 'st')
  it.tags = ['stress']
  it.stressWord = o.form
  it.prompt = { instruction: 'Tap the stressed vowel', en: `${gloss(lx)} · ${slotLabel(lx.pos, o.slot, lx.aspect)}` }
  return it
}

const STOP = new Set(['the', 'and', 'for', 'with', 'one', 'someone', 'something', 'from', 'into', 'out', 'off', 'not', 'get', 'make', 'have', 'take'])
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w))
/** True when two glosses share a content word: "first" and "first-class", "to run" and "run away". */
export function overlaps(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true
  const wb = new Set(words(b))
  return words(a).some((w) => wb.has(w))
}

/** Three meanings of other words of the same part of speech, none too close to the answer. The pool can hold
 *  thousands of words, so sample at random and stop at three; scan it all only when sampling comes up short. */
function glossChoices(lx: Lexeme, pool: Lexeme[], rng: Rng): { choices: string[]; answerIndex: number } | null {
  const answer = gloss(lx)
  const answerWords = new Set(words(answer))
  const seen = new Set([answer.toLowerCase()])
  const others: string[] = []
  // a distractor that contains the answer (first / first-class) or vice versa is too close to call
  const consider = (x: Lexeme) => {
    if (x.id === lx.id || x.pos !== lx.pos) return
    const g = gloss(x)
    if (seen.has(g.toLowerCase()) || words(g).some((w) => answerWords.has(w))) return
    seen.add(g.toLowerCase())
    others.push(g)
  }
  for (let tries = 0; tries < 60 && others.length < 3 && pool.length; tries++) consider(pool[Math.floor(rng() * pool.length)]!)
  if (others.length < 3)
    for (const x of shuffle(rng, pool)) {
      if (others.length >= 3) break
      consider(x)
    }
  if (others.length < 3) return null
  const choices = shuffle(rng, [answer, ...others])
  return { choices, answerIndex: choices.indexOf(answer) }
}

export function meaningItem(lx: Lexeme, pool: Lexeme[], rng: Rng): ExerciseItem | null {
  const gc = glossChoices(lx, pool, rng)
  if (!gc) return null
  return {
    id: `gen:mean:${lx.id}`, type: 'choice', level: level(lx), tags: ['vocab'], vocab: [lx.id], source: 'generated',
    prompt: { ru: lx.lemma, instruction: 'Choose the meaning' }, acceptEn: [gc.choices[gc.answerIndex]!], ...gc,
  }
}

/**
 * Two words the learner keeps mixing up, side by side. Successive reviews alternate which word is asked and
 * the direction (meaning → word, word → meaning). Null when the two can't be told apart by gloss or spelling.
 */
export function pairItem(a: Lexeme, b: Lexeme, reps: number, rng: Rng): ExerciseItem | null {
  if (a.lemma === b.lemma || overlaps(gloss(a), gloss(b))) return null
  const [ask, other] = reps % 2 ? [b, a] : [a, b]
  const base: Omit<ExerciseItem, 'prompt'> = {
    id: `gen:pair:${a.id}|${b.id}`, type: 'choice', level: level(ask), tags: ['vocab'], vocab: [ask.id], source: 'generated',
    reason: `**${a.lemma}** means *${gloss(a)}*; **${b.lemma}** means *${gloss(b)}*.`,
  }
  if (Math.floor(reps / 2) % 2) {
    const choices = shuffle(rng, [gloss(ask), gloss(other)])
    return { ...base, prompt: { ru: ask.lemma, instruction: 'Which meaning?' }, choices, answerIndex: choices.indexOf(gloss(ask)), acceptEn: [gloss(ask)] }
  }
  // Russian options are fixed choices so за́мок and замо́к stay different answers
  const choices = shuffle(rng, [ask.lemma, other.lemma])
  return { ...base, prompt: { en: gloss(ask), instruction: 'Which word means this?' }, choices, answerIndex: choices.indexOf(ask.lemma) }
}

/**
 * A new word's first appearance, as a guess (the pretesting effect): its meaning from a sentence it's used in
 * and, when it has one, a relative from its word family. A wrong guess is expected; the feedback teaches the
 * word. Null without a sentence or a relative, since a guess from nothing at all teaches nothing.
 */
export function guessItem(lx: Lexeme, pool: Lexeme[], rng: Rng, s?: Sentence, relative?: Lexeme): ExerciseItem | null {
  const gc = glossChoices(lx, pool, rng)
  const tok = s && wordTokens(s).find((t) => soleLexeme(t) === lx.id)
  if (!gc || (!tok && !relative)) return null
  return {
    id: `gen:guess:${lx.id}`, type: 'choice', level: level(lx), tags: ['vocab'], vocab: [lx.id], source: 'generated', pretest: true,
    prompt: {
      ru: tok ? s!.ru : lx.lemma,
      ...(tok ? { governor: tok.text } : {}),
      instruction: 'New word: guess what it means',
      ...(relative ? { en: `Related to ${relative.lemma} (${gloss(relative)})` } : {}),
    },
    acceptEn: [gc.choices[gc.answerIndex]!], ...gc,
    reason: `**${lx.lemma}** means *${gloss(lx)}*.${tok ? ` The sentence: *${s!.en[0]}*` : ''}`,
  }
}

export function listenItem(lx: Lexeme, pool: Lexeme[], rng: Rng): ExerciseItem | null {
  const gc = glossChoices(lx, pool, rng)
  if (!gc) return null
  return {
    id: `gen:listen:${lx.id}`, type: 'listen-choose', level: level(lx), tags: ['vocab', 'listening'], vocab: [lx.id],
    source: 'generated', prompt: { audio: lx.lemma, instruction: 'What does this word mean?' },
    acceptEn: [gc.choices[gc.answerIndex]!], ...gc,
  }
}

export function dictationItem(lx: Lexeme, rng: Rng): ExerciseItem {
  const slots = drillableSlots(lx)
  const slot = slots.length && rng() < 0.5 ? pick(rng, slots) : null
  const form = (slot && primaryForm(lx, slot)) || lx.lemma
  return {
    id: `gen:dict:${lx.id}:${slot ?? 'lemma'}`, type: 'dictation', level: level(lx), tags: ['listening'], vocab: [lx.id],
    source: 'generated', prompt: { audio: form, instruction: 'Type what you hear', en: gloss(lx) }, accept: [form],
  }
}

export function matchItem(lxs: Lexeme[]): ExerciseItem | null {
  const seen = new Set<string>()
  const pairs: [string, string][] = []
  for (const lx of lxs) {
    const g = gloss(lx)
    if (seen.has(g.toLowerCase())) continue
    seen.add(g.toLowerCase())
    pairs.push([lx.lemma, g])
    if (pairs.length === 5) break
  }
  if (pairs.length < 4) return null
  const ids = lxs.slice(0, pairs.length).map((l) => l.id)
  return {
    id: `gen:match:${hashString(ids.join(',')).toString(36)}`, type: 'match', level: level(lxs[0]!), tags: ['vocab'],
    vocab: ids, source: 'generated', prompt: { instruction: 'Match the pairs' }, pairs,
  }
}

export interface SessionOptions {
  rng: Rng
  count: number
  hasVoice: boolean
}

/** A mixed practice session from a pool of lexemes (frequent words weighted up). */
export function buildPracticeSession(pool: Lexeme[], opts: SessionOptions): ExerciseItem[] {
  const { rng, count, hasVoice } = opts
  const lex = pool.filter(isDrillable)
  if (lex.length < 8) return []
  const weights = lex.map((x) => 1 / Math.sqrt(x.rank ?? 10000))
  const kinds: [string, number][] = [
    ['transform', 0.38], ['choice', 0.24], ['stress', 0.13], ['meaning', 0.11],
    ['listen', hasVoice ? 0.08 : 0], ['dictation', hasVoice ? 0.06 : 0],
  ]
  const items: ExerciseItem[] = []
  const ids = new Set<string>()
  let guard = 0
  while (items.length < count && guard++ < count * 20) {
    const lx = lex[weighted(rng, weights)]!
    const kind = kinds[weighted(rng, kinds.map((k) => k[1]))]![0]
    let it: ExerciseItem | null = null
    const slots = drillableSlots(lx)
    if (kind === 'transform' && slots.length) it = transformItem(lx, pick(rng, slots))
    else if (kind === 'choice' && slots.length) it = choiceItem(lx, pick(rng, slots), rng)
    else if (kind === 'stress') it = stressItem(lx, rng)
    else if (kind === 'meaning') it = meaningItem(lx, lex, rng)
    else if (kind === 'listen') it = listenItem(lx, lex, rng)
    else if (kind === 'dictation') it = dictationItem(lx, rng)
    if (it && !ids.has(it.id)) {
      ids.add(it.id)
      items.push(it)
    }
  }
  const m = matchItem(shuffle(rng, lex).slice(0, 6))
  if (m && items.length >= 6) items.splice(Math.floor(items.length / 2), 0, m)
  return items
}

/** Lexemes an item needs in memory for grading diagnostics. */
export function itemLexemeIds(items: ExerciseItem[]): string[] {
  return [...new Set(items.flatMap((i) => (i.target ? [i.target.lex] : [])))]
}

export { decodeCell }

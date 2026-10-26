// Case arcade: a noun with its governing word falls towards the bottom; pick the right form before it lands.
// Waves add cases, then plurals, adjective + noun phrases and numbers. Every card is an ordinary choice item, so
// it goes through the grader and the reward service like any other answer.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { primaryForm } from '../lib/lexicon'
import { pick, shuffle, type Rng } from '../lib/rng'
import { stripStress } from '../lib/ru'
import { gloss, isDrillable } from './generators'
import { countBand, countForm } from './trainers'

type Kase = 'gen' | 'dat' | 'acc' | 'ins' | 'prep'
interface Governor {
  ru: string
  /** Shown under the governor when the case depends on meaning (в/на: где? or куда́?). */
  cue?: string
  case: Kase
  tag: string
}
const GOVERNORS: Governor[] = [
  { ru: 'без', case: 'gen', tag: 'case.gen.prepositions' },
  { ru: 'для', case: 'gen', tag: 'case.gen.prepositions' },
  { ru: 'из', case: 'gen', tag: 'case.gen.prepositions' },
  { ru: 'у', case: 'gen', tag: 'case.gen.prepositions' },
  { ru: 'до', case: 'gen', tag: 'case.gen.prepositions' },
  { ru: 'по́сле', case: 'gen', tag: 'case.gen.prepositions' },
  { ru: 'нет', case: 'gen', tag: 'case.gen.negation' },
  { ru: 'к', case: 'dat', tag: 'case.dat.prepositions' },
  { ru: 'по', case: 'dat', tag: 'case.dat.prepositions' },
  { ru: 'че́рез', case: 'acc', tag: 'case.acc' },
  { ru: 'про', case: 'acc', tag: 'case.acc' },
  { ru: 'в', cue: 'куда́?', case: 'acc', tag: 'case.acc.direction' },
  { ru: 'на', cue: 'куда́?', case: 'acc', tag: 'case.acc.direction' },
  { ru: 'с', cue: 'with', case: 'ins', tag: 'case.ins.with' },
  { ru: 'над', case: 'ins', tag: 'case.ins.prepositions' },
  { ru: 'пе́ред', case: 'ins', tag: 'case.ins.prepositions' },
  { ru: 'ме́жду', case: 'ins', tag: 'case.ins.prepositions' },
  { ru: 'о', case: 'prep', tag: 'case.prep.about' },
  { ru: 'в', cue: 'где?', case: 'prep', tag: 'case.prep.location' },
  { ru: 'на', cue: 'где?', case: 'prep', tag: 'case.prep.location' },
]
const CASE_EN: Record<Kase, string> = { gen: 'genitive', dat: 'dative', acc: 'accusative', ins: 'instrumental', prep: 'prepositional' }

/** о → об before a vowel, с/к/в → со/ко/во before awkward clusters (со шко́лой, ко мне, во вто́рник). */
export function joinPreposition(prep: string, next: string): string {
  const w = stripStress(next).toLowerCase()
  if (prep === 'о' && /^[аоуэи]/.test(w)) return 'об' // ru-ignore
  if (prep === 'с' && /^[сзшж][^аеёиоуыэюя]/.test(w)) return 'со' // ru-ignore
  if (prep === 'к' && /^(мн|вс)/.test(w)) return 'ко' // ru-ignore
  if (prep === 'в' && /^[вф][^аеёиоуыэюя]/.test(w)) return 'во' // ru-ignore
  return prep
}

export interface ArcadeCard {
  item: ExerciseItem
  /** The governing word (preposition/verb or a number), shown on the card. */
  governor: string
  cue?: string
  /** What the learner must put into the right form: a lemma or "adjective noun". */
  base: string
  plural: boolean
  meaning: string
}

export const WAVES = [
  { n: 1, title: 'Genitive, dative, accusative', cases: ['gen', 'dat', 'acc'] as Kase[], kinds: ['noun'] },
  { n: 2, title: 'All five cases', cases: ['gen', 'dat', 'acc', 'ins', 'prep'] as Kase[], kinds: ['noun'] },
  { n: 3, title: 'Plurals join in', cases: ['gen', 'dat', 'acc', 'ins', 'prep'] as Kase[], kinds: ['noun', 'plural'] },
  { n: 4, title: 'Adjective + noun', cases: ['gen', 'dat', 'acc', 'ins', 'prep'] as Kase[], kinds: ['noun', 'plural', 'phrase'] },
  { n: 5, title: 'Numbers too', cases: ['gen', 'dat', 'acc', 'ins', 'prep'] as Kase[], kinds: ['noun', 'plural', 'phrase', 'number'] },
]
export const CARDS_PER_WAVE = 8
/** Seconds a card takes to fall, by wave (faster each wave, then 0.4 s quicker per extra lap). */
export const fallSeconds = (wave: number) => Math.max(3.2, 9 - (wave - 1) * 1.1)

const SLOT_CASES: Kase[] = ['gen', 'dat', 'acc', 'ins', 'prep']

function distinctForms(lx: Lexeme, num: 'sg' | 'pl', want: Kase): { answer: string; others: string[] } | null {
  const answer = primaryForm(lx, `${num}_${want}`)
  if (!answer) return null
  const others = [...new Set(SLOT_CASES.filter((c) => c !== want).map((c) => primaryForm(lx, `${num}_${c}`)).filter((f): f is string => !!f))]
    .filter((f) => stripStress(f) !== stripStress(answer))
  return others.length >= 2 ? { answer, others } : null
}

function choiceItem(id: string, answer: string, others: string[], tag: string, reason: string, rng: Rng, target?: ExerciseItem['target']): ExerciseItem {
  const choices = shuffle(rng, [answer, ...shuffle(rng, others).slice(0, 2)])
  return {
    id,
    type: 'choice',
    level: 'A2',
    tags: [tag],
    source: 'generated',
    target,
    prompt: { instruction: 'Pick the right form' },
    choices,
    answerIndex: choices.indexOf(answer),
    distractors: [{ ru: '', error: 'case.preposition-government' }],
    reason,
  }
}

/** One card for the wave; null if the random draw didn't fit (callers just draw again). */
export function arcadeCard(wave: number, nouns: Lexeme[], adjectives: Lexeme[], numberNouns: Lexeme[], rng: Rng): ArcadeCard | null {
  const w = WAVES[Math.min(wave, WAVES.length) - 1]!
  const kind = pick(rng, w.kinds)
  if (kind === 'number') {
    const lx = pick(rng, numberNouns)
    const n = pick(rng, [1, 2, 3, 4, 5, 6, 10, 12, 21, 22, 25])
    const right = countForm(lx, n)
    const forms = [1, 2, 5].map((k) => countForm(lx, k)?.form).filter((f): f is string => !!f)
    const others = [...new Set(forms)].filter((f) => f !== right?.form)
    if (!right || others.length < 2) return null
    const band = countBand(n)
    const why = { one: 'after 1, 21, 31…: nominative singular', few: 'after 2, 3, 4: genitive singular', many: 'after 5–20 (and 11–14): genitive plural' }[band]
    return {
      item: choiceItem(`ar:num:${lx.id}:${n}`, right.form, others, 'num.governance', why, rng, right.slot ? { lex: lx.id, slot: right.slot } : undefined),
      governor: String(n),
      base: lx.lemma,
      plural: false,
      meaning: gloss(lx),
    }
  }
  const g = pick(rng, GOVERNORS.filter((x) => w.cases.includes(x.case)))
  const plural = kind === 'plural' || (kind === 'phrase' && rng() < 0.3)
  const num = plural ? 'pl' : 'sg'
  const noun = pick(rng, nouns)
  const nf = distinctForms(noun, num, g.case)
  if (!nf) return null
  if (kind === 'phrase') {
    const adj = pick(rng, adjectives)
    const gender = noun.gender === 'f' || noun.gender === 'n' ? noun.gender : 'm'
    const aslot = (c: Kase) => (num === 'pl' ? (c === 'acc' && noun.animate ? 'pl_acc_an' : `pl_${c}`) : c === 'acc' && gender === 'm' && noun.animate ? 'm_acc_an' : `${gender}_${c}`)
    const aRight = primaryForm(adj, aslot(g.case))
    const aBase = primaryForm(adj, num === 'pl' ? 'pl_nom' : `${gender}_nom`)
    const nBase = primaryForm(noun, `${num}_nom`)
    if (!aRight || !aBase || !nBase) return null
    const answer = `${aRight} ${nf.answer}`
    const wrongCase = pick(rng, SLOT_CASES.filter((c) => c !== g.case))
    const aWrong = primaryForm(adj, aslot(wrongCase))
    const others = [...new Set([aWrong && `${aWrong} ${nf.answer}`, `${aRight} ${pick(rng, nf.others)}`, aWrong && `${aWrong} ${pick(rng, nf.others)}`].filter((x): x is string => !!x && stripStress(x) !== stripStress(answer)))]
    if (others.length < 2) return null
    const gov = joinPreposition(g.ru, aRight)
    return {
      item: choiceItem(`ar:ph:${g.ru}:${g.case}:${adj.id}:${noun.id}:${num}`, answer, others, g.tag, `**${gov}** + ${CASE_EN[g.case]}: adjective and noun both take it: **${gov} ${answer}**`, rng),
      governor: gov,
      cue: g.cue,
      base: `${aBase} ${nBase}`,
      plural,
      meaning: `${gloss(adj)} ${gloss(noun)}`,
    }
  }
  const gov = joinPreposition(g.ru, nf.answer)
  return {
    item: choiceItem(`ar:n:${g.ru}:${g.case}:${noun.id}:${num}`, nf.answer, nf.others, g.tag, `**${gov}** + ${CASE_EN[g.case]}${plural ? ' plural' : ''}: **${gov} ${nf.answer}**`, rng, { lex: noun.id, slot: `${num}_${g.case}` }),
    governor: gov,
    cue: g.cue,
    base: primaryForm(noun, `${num}_nom`) ?? noun.lemma,
    plural,
    meaning: gloss(noun),
  }
}

/** Nouns and adjectives the arcade draws from: drillable, with full singular and plural tables. */
export function arcadePools(pool: Lexeme[]) {
  const full = (x: Lexeme, slots: string[]) => slots.every((s) => !!primaryForm(x, s))
  const nounSlots = ['sg', 'pl'].flatMap((n) => ['nom', ...SLOT_CASES].map((c) => `${n}_${c}`))
  const nouns = pool.filter((x) => x.pos === 'noun' && isDrillable(x) && x.lemma[0] === x.lemma[0]!.toLowerCase() && full(x, nounSlots))
  const adjectives = pool.filter((x) => x.pos === 'adj' && isDrillable(x) && full(x, ['m_nom', 'f_nom', 'n_nom', 'pl_nom', 'm_gen', 'f_gen', 'f_ins', 'pl_ins']))
  return { nouns, adjectives: adjectives.slice(0, 120) }
}

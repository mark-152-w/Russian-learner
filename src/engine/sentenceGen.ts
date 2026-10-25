// Exercises built from real (Tatoeba) sentences: case cloze with the governing word highlighted and a
// one-line "why this case?", verb cloze, find-the-error and word tiles.
import type { ExerciseItem, Lexeme, Sentence } from '../types/content.gen'
import { fold, stripStress } from '../lib/ru'
import { formsOf, primaryForm } from '../lib/lexicon'
import { hashString, pick, shuffle, type Rng } from '../lib/rng'
import { soleLexeme, wordTokens, type WordToken } from '../lib/sentences'
import { choiceItem, gloss, isDrillable } from './generators'
import { matchingSlots } from './diagnose'
import { CASE_NAME, parseSlot, slotLabel, slotTags, type Case } from './slots'

type Tags = [string, ...string[]]

/** Preposition (folded, variants included) → base form. */
const PREP_BASE: Record<string, string> = {
  в: 'в', во: 'в', на: 'на', о: 'о', об: 'о', обо: 'о', у: 'у', из: 'из', изо: 'из', от: 'от', ото: 'от', без: 'без', // ru-ignore
  для: 'для', до: 'до', после: 'после', с: 'с', со: 'с', к: 'к', ко: 'к', по: 'по', за: 'за', под: 'под', подо: 'под', // ru-ignore
  над: 'над', надо: 'над', перед: 'перед', передо: 'перед', между: 'между', через: 'через', про: 'про', при: 'при', // ru-ignore
  около: 'около', кроме: 'кроме', вокруг: 'вокруг', среди: 'среди', против: 'против', мимо: 'мимо', возле: 'возле', // ru-ignore
}

/** How each base preposition is shown in explanations (stressed). */
const PREP_SHOWN: Record<string, string> = {
  после: 'по́сле', перед: 'пе́ред', между: 'ме́жду', через: 'че́рез', около: 'о́коло', кроме: 'кро́ме', // ru-ignore
  вокруг: 'вокру́г', среди: 'среди́', против: 'про́тив', мимо: 'ми́мо', возле: 'во́зле', // ru-ignore
}

const GEN_PREPS = new Set(['у', 'из', 'от', 'без', 'для', 'до', 'после', 'около', 'кроме', 'вокруг', 'среди', 'против', 'мимо', 'возле']) // ru-ignore
const QUANT = new Set(['много', 'мало', 'сколько', 'несколько']) // ru-ignore
const FEW = new Set(['два', 'две', 'три', 'четыре', 'оба', 'обе']) // ru-ignore
const MANY = new Set(['пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'двадцать', 'тридцать', 'сто']) // ru-ignore

export interface CaseReason {
  tags: string[]
  reason: string
  governor?: string
}

/** Why a noun is in `kase` given the word(s) before it. Prepositions and quantities, else the case's core role. */
export function caseReason(kase: Case, number: string, prev: WordToken | undefined, prev2: WordToken | undefined, next?: WordToken): CaseReason {
  const p = prev ? fold(prev.text) : ''
  const base = PREP_BASE[p]
  // allow one adjective/possessive between preposition and noun: «в на́шем до́ме»
  const p2 = prev2 ? fold(prev2.text) : ''
  const base2 = !base && prev && prev.readings.every((r) => r.lex.startsWith('a:')) ? PREP_BASE[p2] : undefined
  const prep = base ?? base2
  const govText = base ? prev!.text : base2 ? prev2!.text : undefined
  const g = (tags: string[], reason: string): CaseReason => ({ tags, reason, governor: govText })
  if (prep) {
    const P = PREP_SHOWN[prep] ?? prep
    if ((prep === 'в' || prep === 'на') && (kase === 'prep' || kase === 'loc2'))
      return g(['case.prep.location', kase === 'loc2' ? 'case.loc2' : 'case.prep'], `${P} + prepositional: location (где?)${kase === 'loc2' ? ', with the stressed -у́ ending some masculine nouns take after в/на' : ''}.`)
    if ((prep === 'в' || prep === 'на') && kase === 'acc') return g(['case.acc.direction', 'case.acc'], `${P} + accusative: motion into/onto (куда́?), or a point in time (в сре́ду).`)
    if (prep === 'о' && kase === 'prep') return g(['case.prep.about', 'case.prep'], 'о/об + prepositional: about someone or something.')
    if (prep === 'при' && kase === 'prep') return g(['case.prep'], 'при + prepositional: in the presence of / at the time of.')
    if (GEN_PREPS.has(prep) && kase === 'gen') return g(['case.gen.prepositions', 'case.gen'], `${P} always takes the genitive.`)
    if (prep === 'с' && kase === 'ins') return g(['case.ins.with', 'case.ins'], 'с + instrumental: together with.')
    if (prep === 'с' && kase === 'gen') return g(['case.gen.prepositions', 'case.gen'], 'с + genitive: off / down from / since.')
    if ((prep === 'к' || prep === 'по') && kase === 'dat') return g(['case.dat.prepositions', 'case.dat'], `${P} + dative: ${prep === 'к' ? 'towards someone or something' : 'along, around, by (по телефо́ну)'}.`)
    if (['над', 'перед', 'между'].includes(prep) && kase === 'ins') return g(['case.ins.prepositions', 'case.ins'], `${P} takes the instrumental.`) // ru-ignore
    if ((prep === 'за' || prep === 'под') && kase === 'ins') return g(['case.ins.prepositions', 'case.ins'], `${P} + instrumental: location (где?).`)
    if ((prep === 'за' || prep === 'под') && kase === 'acc') return g(['case.acc.direction', 'case.acc'], `${P} + accusative: direction (куда́?), or "for" (спаси́бо за…).`)
    if ((prep === 'через' || prep === 'про') && kase === 'acc') return g(['case.acc'], `${P} takes the accusative.`) // ru-ignore
  }
  if (kase === 'gen') {
    if (p === 'нет' || (next && fold(next.text) === 'нет')) return { tags: ['case.gen.negation', 'case.gen'], reason: 'нет + genitive: the thing that is absent.', governor: p === 'нет' ? prev!.text : next!.text }
    if (QUANT.has(p)) return { tags: ['case.gen.quantity', 'case.gen'], reason: `${prev!.text} + genitive ${number === 'pl' ? 'plural' : 'singular'}.`, governor: prev!.text }
    if (FEW.has(p) && number === 'sg') return { tags: ['case.gen.quantity', 'num.governance'], reason: '2, 3, 4 + genitive singular.', governor: prev!.text }
    if (MANY.has(p) && number === 'pl') return { tags: ['case.gen.quantity', 'num.governance'], reason: '5 and above + genitive plural.', governor: prev!.text }
    return { tags: ['case.gen'], reason: 'Genitive: "of" (possession, part of something), or required by the word before it.' }
  }
  const core: Record<Case, [string, string]> = {
    nom: ['case.nom', 'Nominative: the subject of the sentence.'],
    gen: ['case.gen', ''],
    dat: ['case.dat', 'Dative: the person something is given or said to, or who experiences a state (мне хо́лодно).'],
    acc: ['case.acc.direct-object', 'Accusative: the direct object of the verb.'],
    ins: ['case.ins', 'Instrumental: the means or tool, or after быть/стать/рабо́тать/занима́ться and similar verbs.'],
    prep: ['case.prep', 'Prepositional: only ever after a preposition.'],
    loc2: ['case.loc2', 'Second locative after в/на.'],
  }
  const [tag, reason] = core[kase]
  return { tags: [tag, ...(kase === 'acc' ? ['case.acc'] : [])], reason }
}

/** Frozen expressions where the noun's form isn't a live grammar choice (до сих пор). */
const IDIOMS: [string, string][] = [['сих', 'пор'], ['всех', 'сил'], ['под', 'конец'], ['конце', 'концов']] // ru-ignore
function inIdiom(toks: WordToken[], i: number): boolean {
  const prev = toks[i - 1] ? fold(toks[i - 1]!.text) : ''
  return IDIOMS.some(([a, b]) => prev === a && fold(toks[i]!.text) === b)
}

function gapped(s: Sentence, t: WordToken): string {
  return s.ru.slice(0, t.start) + '___' + s.ru.slice(t.end)
}

/** Readings of a token agree on one case and number? → that case/number and a representative slot. */
function agreedCase(t: WordToken, lx: Lexeme): { kase: Case; number: string; slot: string } | null {
  const infos = t.readings.map((r) => ({ r, s: parseSlot(lx.pos, r.slot) }))
  if (!infos.length || infos.some((i) => i.s.kind !== 'case')) return null
  const cases = new Set(infos.map((i) => (i.s.case === 'loc2' ? 'loc2' : i.s.case)))
  const nums = new Set(infos.map((i) => i.s.number))
  if (cases.size !== 1 || nums.size !== 1) return null
  return { kase: [...cases][0] as Case, number: [...nums][0]!, slot: infos[0]!.r.slot }
}

const acceptFor = (lx: Lexeme, slot: string, surface: string) => {
  const lower = surface[0] === surface[0]!.toUpperCase() && lx.lemma[0] === lx.lemma[0]!.toLowerCase() ? surface.toLowerCase() : surface
  const extra = formsOf(lx, slot).filter((v) => !v.unverified).map((v) => v.form)
  return [...new Set([lower, ...extra])] as Tags
}

export interface ClozeOptions {
  cases?: Case[]
  numbers?: string[]
  /** Only items with one of these tags. */
  tags?: string[]
  pos?: Lexeme['pos'][]
  choice?: boolean
  rng: Rng
}

/** All case-cloze items a sentence supports (one per eligible noun/adjective). */
export function caseClozeItems(s: Sentence, lexemes: Map<string, Lexeme>, o: ClozeOptions): ExerciseItem[] {
  const toks = wordTokens(s)
  const out: ExerciseItem[] = []
  toks.forEach((t, i) => {
    const id = soleLexeme(t)
    const lx = id ? lexemes.get(id) : undefined
    if (!lx || !isDrillable(lx) || !(o.pos ?? ['noun']).includes(lx.pos)) return
    const ag = agreedCase(t, lx)
    if (!ag || ag.kase === 'nom') return
    if (o.cases && !o.cases.includes(ag.kase === 'loc2' ? 'prep' : ag.kase)) return
    if (o.numbers && !o.numbers.includes(ag.number)) return
    if (fold(t.text) === fold(lx.lemma)) return // nothing to change: not a useful gap
    if (inIdiom(toks, i)) return
    const why = caseReason(ag.kase, ag.number, toks[i - 1], toks[i - 2], toks[i + 1])
    if (o.tags && !o.tags.some((tag) => why.tags.includes(tag) || slotTags(lx.pos, ag.slot).includes(tag))) return
    const tags = [...new Set([...why.tags, ...slotTags(lx.pos, ag.slot)])] as Tags
    let item: ExerciseItem = {
      id: `gen:cz:${s.id}:${i}`, type: 'cloze', level: s.lv, tags, vocab: [lx.id], target: { lex: lx.id, slot: ag.slot },
      source: 'generated',
      prompt: { ru: gapped(s, t), en: s.en[0], instruction: `Fill the gap: ${lx.lemma}`, governor: why.governor },
      accept: acceptFor(lx, ag.slot, t.text),
      reason: why.reason,
    }
    if (o.choice) {
      const ch = choiceItem(lx, ag.slot, o.rng)
      if (!ch) return
      item = { ...item, id: `gen:czc:${s.id}:${i}`, type: 'choice', distractors: ch.distractors }
    }
    out.push(item)
  })
  return out
}

/** Verb cloze: give the infinitive, ask for the form used in the sentence. */
export function verbClozeItems(s: Sentence, lexemes: Map<string, Lexeme>, kinds: string[] = ['np', 'pst', 'imp']): ExerciseItem[] {
  const out: ExerciseItem[] = []
  wordTokens(s).forEach((t, i) => {
    const id = soleLexeme(t)
    const lx = id ? lexemes.get(id) : undefined
    if (!lx || lx.pos !== 'verb' || !isDrillable(lx)) return
    const slots = new Set(t.readings.map((r) => r.slot))
    if (slots.size !== 1) return
    const slot = [...slots][0]!
    const kind = slot.split('_')[0]!
    if (!kinds.includes(kind) || fold(t.text) === fold(lx.lemma)) return
    out.push({
      id: `gen:vz:${s.id}:${i}`, type: 'cloze', level: s.lv, tags: slotTags('verb', slot, lx.aspect) as Tags, vocab: [lx.id],
      target: { lex: lx.id, slot }, source: 'generated',
      prompt: { ru: gapped(s, t), en: s.en[0], instruction: `Fill the gap: ${lx.lemma}` },
      accept: acceptFor(lx, slot, t.text),
      reason: `${slotLabel('verb', slot, lx.aspect)[0]!.toUpperCase()}${slotLabel('verb', slot, lx.aspect).slice(1)}.`,
    })
  })
  return out
}

/** Swap one noun for a wrong case form; the learner taps the wrong word. */
export function findErrorItem(s: Sentence, lexemes: Map<string, Lexeme>, rng: Rng): ExerciseItem | null {
  const toks = wordTokens(s)
  const candidates = toks
    .map((t, i) => ({ t, i, lx: lexemes.get(soleLexeme(t) ?? '') }))
    .filter((c) => c.lx && c.lx.pos === 'noun' && isDrillable(c.lx) && agreedCase(c.t, c.lx) && agreedCase(c.t, c.lx)!.kase !== 'nom')
  if (!candidates.length) return null
  const c = pick(rng, candidates)
  const ag = agreedCase(c.t, c.lx!)!
  const ch = choiceItem(c.lx!, ag.slot, rng)
  // same number, different case only: a number change can still be good Russian (сде́лку → сде́лки)
  const sameNumberOtherCase = (form: string) =>
    matchingSlots(c.lx!, fold(form)).every((sl) => {
      const x = parseSlot('noun', sl)
      return x.number === ag.number && x.case !== ag.kase
    })
  const wrong = ch?.distractors?.find((d) => !d.error.startsWith('spelling') && !s.ru.includes(d.ru) && sameNumberOtherCase(d.ru))
  if (!wrong) return null
  const ru = s.ru.slice(0, c.t.start) + wrong.ru + s.ru.slice(c.t.end)
  const errorIndex = ru.slice(0, c.t.start).split(/\s+/).filter(Boolean).length
  const why = caseReason(ag.kase, ag.number, toks[c.i - 1], toks[c.i - 2], toks[c.i + 1])
  return {
    id: `gen:fe:${s.id}:${c.i}`, type: 'find-error', level: s.lv, tags: why.tags as Tags, vocab: [c.lx!.id],
    target: { lex: c.lx!.id, slot: ag.slot }, source: 'generated',
    prompt: { ru, en: s.en[0], instruction: 'Tap the word with the wrong ending' },
    errorIndex, accept: [s.ru], distractors: [wrong], explanation: `**${c.t.text}**, not ~~${stripStress(wrong.ru)}~~: ${why.reason}`,
  }
}

/** Build the sentence from tiles; one extra tile is a wrong form of a noun. */
export function tilesItem(s: Sentence, lexemes: Map<string, Lexeme>, rng: Rng): ExerciseItem | null {
  const toks = wordTokens(s)
  if (toks.length < 3 || toks.length > 8) return null
  const words = toks.map((t) => t.text)
  const noun = toks.find((t) => {
    const lx = lexemes.get(soleLexeme(t) ?? '')
    return lx?.pos === 'noun' && isDrillable(lx) && agreedCase(t, lx)
  })
  const distractors: NonNullable<ExerciseItem['distractors']> = []
  if (noun) {
    const lx = lexemes.get(soleLexeme(noun)!)!
    const ch = choiceItem(lx, agreedCase(noun, lx)!.slot, rng)
    const d = ch?.distractors?.find((x) => !x.error.startsWith('spelling') && !words.includes(x.ru))
    if (d) distractors.push(d)
  }
  return {
    id: `gen:ti:${s.id}`, type: 'tiles', level: s.lv, tags: ['vocab'], source: 'generated',
    vocab: toks.map((t) => soleLexeme(t)).filter((x): x is string => !!x && !x.startsWith('name:')),
    prompt: { en: s.en[0], instruction: 'Build the sentence' },
    accept: [s.ru], tiles: shuffle(rng, [...words, ...distractors.map((d) => d.ru)]), distractors,
  }
}

// ------------------------------------------------------------------ declension classes (pattern drills)
export type NounClass = 'masc-hard' | 'masc-soft' | 'neut-o' | 'neut-e' | 'fem-a' | 'fem-ya' | 'fem-soft' | 'neut-mya' | 'other'

export const NOUN_CLASS_LABEL: Record<NounClass, string> = {
  'masc-hard': 'masculine, consonant ending (стол)',
  'masc-soft': 'masculine, -й / -ь (музе́й, слова́рь)',
  'neut-o': 'neuter -о (окно́)',
  'neut-e': 'neuter -е / -ё (мо́ре, бельё)',
  'fem-a': '-а nouns, feminine and masculine (ма́ма, па́па)',
  'fem-ya': '-я nouns (неде́ля, дя́дя)',
  'fem-soft': 'feminine -ь (дверь, ночь)',
  'neut-mya': 'neuter -мя (и́мя, вре́мя)',
  other: 'other',
}

export function nounClass(lx: Lexeme): NounClass {
  if (lx.pos !== 'noun') return 'other'
  const w = fold(lx.lemma)
  const last = w.slice(-1)
  if (w.endsWith('мя') && lx.gender === 'n') return 'neut-mya' // ru-ignore
  if (last === 'а') return 'fem-a'
  if (last === 'я') return 'fem-ya'
  if (last === 'ь') return lx.gender === 'f' ? 'fem-soft' : 'masc-soft'
  if (last === 'й') return 'masc-soft'
  if (last === 'о') return 'neut-o'
  if (last === 'е') return 'neut-e'
  if (lx.gender === 'm' && /[бвгджзклмнпрстфхцчшщ]/.test(last)) return 'masc-hard'
  return 'other'
}

/** Pattern drill: forms of many words that share a declension class, in chosen slots. */
export function patternItems(pool: Lexeme[], cls: NounClass, slots: string[], rng: Rng, count: number): ExerciseItem[] {
  const lexes = shuffle(rng, pool.filter((x) => x.pos === 'noun' && isDrillable(x) && nounClass(x) === cls))
  const out: ExerciseItem[] = []
  for (const lx of lexes) {
    const slot = pick(rng, slots)
    if (!primaryForm(lx, slot)) continue
    const it = rng() < 0.6 ? null : choiceItem(lx, slot, rng)
    out.push(
      it ?? {
        id: `gen:pt:${lx.id}:${slot}`, type: 'transform', level: lx.level ?? 'C2', tags: slotTags('noun', slot) as Tags,
        vocab: [lx.id], target: { lex: lx.id, slot }, source: 'generated',
        prompt: { ru: lx.lemma, en: gloss(lx), instruction: `Put into the ${slotLabel('noun', slot)}` },
        accept: formsOf(lx, slot).filter((v) => !v.unverified).map((v) => v.form) as Tags,
      },
    )
    if (out.length >= count) break
  }
  return out
}

/** Deterministic sample of sentences (by seed) so sessions vary but tests are stable. */
export function sampleSentences(pool: Sentence[], n: number, rng: Rng): Sentence[] {
  return shuffle(rng, pool).slice(0, n)
}

export const sentenceSeed = (s: Sentence) => hashString(s.id)

export { CASE_NAME }

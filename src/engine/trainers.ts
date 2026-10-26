// Item builders for the specialist trainers: preposition → case sorting, numerals (counting forms, declined
// numerals, prices, times, ages) and stress (shifting paradigms, feminine past, minimal pairs).
// Everything Russian comes from the verified lexicon or tools/closed_class.json, except the short frames below.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import closedClass from '../../tools/closed_class.json'
import { primaryForm, SLOTS } from '../lib/lexicon'
import { stressIndex, stripStress, syllables } from '../lib/ru'
import { pick, shuffle, type Rng } from '../lib/rng'
import { gloss } from './generators'

// ------------------------------------------------------------------ prepositions → case
export type CaseKey = 'gen' | 'dat' | 'acc' | 'ins' | 'prep'
export const CASE_BINS: { key: CaseKey; en: string; q: string }[] = [
  { key: 'gen', en: 'Genitive', q: 'кого́? чего́?' },
  { key: 'dat', en: 'Dative', q: 'кому́? чему́?' },
  { key: 'acc', en: 'Accusative', q: 'кого́? что? куда́?' },
  { key: 'ins', en: 'Instrumental', q: 'кем? чем?' },
  { key: 'prep', en: 'Prepositional', q: 'о ком? о чём? где?' },
]

export interface Prep {
  prep: string
  sense: string
  case: CaseKey
  example: string
  tag: string
  level: 'A2' | 'B1' | 'B2'
}

/** Prepositions with the sense that fixes their case; в/на/за/под/с appear once per case they take. */
export const PREPOSITIONS: Prep[] = [
  { prep: 'без', sense: 'without', case: 'gen', example: 'ко́фе без са́хара', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'для', sense: 'for (the benefit of)', case: 'gen', example: 'пода́рок для дру́га', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'до', sense: 'until; as far as', case: 'gen', example: 'до ве́чера', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'из', sense: 'out of; from (a place)', case: 'gen', example: 'из Москвы́', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'от', sense: 'from (a person); away from', case: 'gen', example: 'письмо́ от ма́мы', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'у', sense: "at someone's place; by", case: 'gen', example: 'у бра́та', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'по́сле', sense: 'after', case: 'gen', example: 'по́сле рабо́ты', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'о́коло', sense: 'near; about (a number)', case: 'gen', example: 'о́коло до́ма', tag: 'case.gen.prepositions', level: 'A2' },
  { prep: 'с', sense: 'since; down from', case: 'gen', example: 'с утра́', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'кро́ме', sense: 'except', case: 'gen', example: 'кро́ме меня́', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'ми́мо', sense: 'past (going by)', case: 'gen', example: 'ми́мо шко́лы', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'про́тив', sense: 'against', case: 'gen', example: 'про́тив пла́на', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'вме́сто', sense: 'instead of', case: 'gen', example: 'вме́сто ча́я', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'среди́', sense: 'among', case: 'gen', example: 'среди́ друзе́й', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'из-за', sense: 'because of; from behind', case: 'gen', example: 'из-за дождя́', tag: 'case.gen.prepositions', level: 'B1' },
  { prep: 'из-под', sense: 'from under', case: 'gen', example: 'из-под стола́', tag: 'case.gen.prepositions', level: 'B2' },
  { prep: 'к', sense: 'towards; to (a person)', case: 'dat', example: 'к врачу́', tag: 'case.dat.prepositions', level: 'A2' },
  { prep: 'по', sense: 'along; around; by (phone, post)', case: 'dat', example: 'по у́лице', tag: 'case.dat.prepositions', level: 'A2' },
  { prep: 'благодаря́', sense: 'thanks to', case: 'dat', example: 'благодаря́ дру́гу', tag: 'case.dat.prepositions', level: 'B1' },
  { prep: 'вопреки́', sense: 'despite', case: 'dat', example: 'вопреки́ сове́ту', tag: 'case.dat.prepositions', level: 'B2' },
  { prep: 'навстре́чу', sense: 'towards (to meet)', case: 'dat', example: 'навстре́чу го́стю', tag: 'case.dat.prepositions', level: 'B2' },
  { prep: 'в', sense: 'into (motion: куда́?)', case: 'acc', example: 'в шко́лу', tag: 'case.acc.direction', level: 'A2' },
  { prep: 'на', sense: 'onto; to (motion: куда́?)', case: 'acc', example: 'на рабо́ту', tag: 'case.acc.direction', level: 'A2' },
  { prep: 'в', sense: 'on (a day of the week)', case: 'acc', example: 'в сре́ду', tag: 'case.acc.time', level: 'A2' },
  { prep: 'че́рез', sense: 'across; in (time from now)', case: 'acc', example: 'че́рез у́лицу', tag: 'case.acc', level: 'A2' },
  { prep: 'про', sense: 'about (colloquial)', case: 'acc', example: 'про фильм', tag: 'case.acc', level: 'B1' },
  { prep: 'за', sense: 'for (thanks, payment)', case: 'acc', example: 'спаси́бо за пода́рок', tag: 'case.acc', level: 'A2' },
  { prep: 'под', sense: 'under (motion: куда́?)', case: 'acc', example: 'под крова́ть', tag: 'case.acc.direction', level: 'B1' },
  { prep: 'сквозь', sense: 'through (an obstacle)', case: 'acc', example: 'сквозь стекло́', tag: 'case.acc', level: 'B2' },
  { prep: 'с', sense: 'with; together with', case: 'ins', example: 'с дру́гом', tag: 'case.ins.with', level: 'A2' },
  { prep: 'над', sense: 'above; over', case: 'ins', example: 'над столо́м', tag: 'case.ins.prepositions', level: 'A2' },
  { prep: 'под', sense: 'under (location: где?)', case: 'ins', example: 'под столо́м', tag: 'case.ins.prepositions', level: 'A2' },
  { prep: 'за', sense: 'behind (location: где?)', case: 'ins', example: 'за до́мом', tag: 'case.ins.prepositions', level: 'A2' },
  { prep: 'за', sense: 'to fetch (go for something)', case: 'ins', example: 'за хле́бом', tag: 'case.ins.prepositions', level: 'B1' },
  { prep: 'пе́ред', sense: 'in front of; just before', case: 'ins', example: 'пе́ред до́мом', tag: 'case.ins.prepositions', level: 'A2' },
  { prep: 'ме́жду', sense: 'between', case: 'ins', example: 'ме́жду на́ми', tag: 'case.ins.prepositions', level: 'A2' },
  { prep: 'в', sense: 'in (location: где?)', case: 'prep', example: 'в шко́ле', tag: 'case.prep.location', level: 'A2' },
  { prep: 'на', sense: 'on; at (location: где?)', case: 'prep', example: 'на рабо́те', tag: 'case.prep.location', level: 'A2' },
  { prep: 'о', sense: 'about', case: 'prep', example: 'о фи́льме', tag: 'case.prep.about', level: 'A2' },
  { prep: 'при', sense: "in the presence of; in the time of", case: 'prep', example: 'при мне', tag: 'case.prep', level: 'B2' },
]

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const upTo = (level: string, l: string) => LEVEL_ORDER.indexOf(l) <= LEVEL_ORDER.indexOf(level)

/** One sorting round: each preposition (with its sense) goes into one of the five case bins. */
export function prepSortItems(level: string, rng: Rng, n = 14): ExerciseItem[] {
  const pool = PREPOSITIONS.filter((p) => upTo(level, p.level))
  return shuffle(rng, pool)
    .slice(0, n)
    .map((p) => {
      const bin = CASE_BINS.find((b) => b.key === p.case)!
      return {
        id: `tr:prep:${p.prep}:${p.case}:${p.sense.length}`,
        type: 'choice',
        level: p.level,
        tags: [p.tag],
        source: 'generated',
        prompt: { instruction: 'Which case follows?', ru: p.prep, en: p.sense },
        choices: CASE_BINS.map((b) => b.en),
        answerIndex: CASE_BINS.indexOf(bin),
        distractors: [{ ru: '', error: 'case.preposition-government' }],
        reason: `**${p.prep}** + ${bin.en.toLowerCase()}: **${p.example}**`,
      } satisfies ExerciseItem
    })
}

// ------------------------------------------------------------------ numerals
type NumEntry = { lemma: string; kind: string; forms: Record<string, string> }
const NUMERALS = new Map(
  (closedClass.entries as unknown as NumEntry[]).filter((e) => e.kind === 'num').map((e) => [stripStress(e.lemma), e]),
)

/** A numeral's form in a case (first variant; два takes its masculine/neuter nominative). */
export function numeralForm(n: number, kase: string): string | undefined {
  const word = NUMBER_WORDS[n]
  const e = word ? NUMERALS.get(word) : undefined
  if (!e) return undefined
  const cell = e.forms[kase] ?? e.forms[`m_${kase}`]
  return cell?.split('|')[0]
}
const NUMBER_WORDS: Record<number, string> = {
  2: 'два', 3: 'три', 4: 'четыре', 5: 'пять', 6: 'шесть', 7: 'семь', 8: 'восемь', 9: 'девять', 10: 'десять', // ru-ignore
  20: 'двадцать', 30: 'тридцать', 40: 'сорок', 100: 'сто', // ru-ignore
}

export type CountBand = 'one' | 'few' | 'many'
/** 1, 21, 31… → one; 2–4, 22–24… → few; everything else (incl. 11–14) → many. */
export function countBand(n: number): CountBand {
  const t = n % 100
  if (t >= 11 && t <= 14) return 'many'
  if (n % 10 === 1) return 'one'
  if (n % 10 >= 2 && n % 10 <= 4) return 'few'
  return 'many'
}

/** The counting form of a noun after n, with the special counting forms (два часа́, пять лет, пять челове́к). */
export function countForm(lx: Lexeme, n: number): { form: string; slot?: string } | undefined {
  const band = countBand(n)
  const special = COUNT_SPECIAL[lx.id]?.[band]
  if (special) return { form: special }
  const slot = band === 'one' ? 'sg_nom' : band === 'few' ? 'sg_gen' : 'pl_gen'
  const form = primaryForm(lx, slot)
  return form ? { form, slot } : undefined
}
const COUNT_SPECIAL: Record<string, Partial<Record<CountBand, string>>> = {
  'n:час': { few: 'часа́' },
  'n:человек': { many: 'челове́к' },
  'n:год': { many: 'лет' },
}

const BAND_REASON: Record<CountBand, string> = {
  one: 'after 1 (and 21, 31…): nominative singular',
  few: 'after 2, 3, 4 (and 22–24…): genitive singular',
  many: 'after 5–20 (and 25–30…, and 11–14 always): genitive plural',
}

interface Frame {
  lex: string
  ru: string
  en: (n: number) => string
  numbers: number[]
  tag: string
}
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const COUNT_FRAMES: Frame[] = [
  { lex: 'n:рубль', ru: 'Э́то сто́ит {n} ___.', en: (n) => `This costs ${pl(n, 'rouble', 'roubles')}.`, numbers: [1, 2, 3, 5, 10, 21, 24, 50, 99, 100, 101, 102, 150, 300], tag: 'num.governance' },
  { lex: 'n:доллар', ru: 'Биле́т сто́ит {n} ___.', en: (n) => `The ticket costs ${pl(n, 'dollar', 'dollars')}.`, numbers: [1, 2, 4, 5, 12, 20, 21, 33, 45], tag: 'num.governance' },
  { lex: 'n:час', ru: 'Сейча́с {n} ___.', en: (n) => `It's ${n} o'clock.`, numbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], tag: 'num.time-date' },
  { lex: 'n:минута', ru: 'Я жду уже́ {n} ___.', en: (n) => `I've been waiting for ${pl(n, 'minute', 'minutes')}.`, numbers: [2, 3, 5, 10, 15, 20, 21, 22, 25, 40], tag: 'num.time-date' },
  { lex: 'n:год', ru: 'Мне {n} ___.', en: (n) => `I'm ${n} years old.`, numbers: [18, 20, 21, 22, 23, 25, 30, 31, 34, 40, 41, 45, 52, 61], tag: 'num.governance' },
  { lex: 'n:месяц', ru: 'Я жил там {n} ___.', en: (n) => `I lived there for ${pl(n, 'month', 'months')}.`, numbers: [2, 3, 4, 5, 6, 11, 21], tag: 'num.governance' },
  { lex: 'n:неделя', ru: 'О́тпуск дли́тся {n} ___.', en: (n) => `The holiday lasts ${pl(n, 'week', 'weeks')}.`, numbers: [2, 3, 4, 5, 6], tag: 'num.governance' },
  { lex: 'n:день', ru: 'Я был в Пари́же {n} ___.', en: (n) => `I was in Paris for ${pl(n, 'day', 'days')}.`, numbers: [2, 3, 4, 5, 7, 10, 14, 21, 22], tag: 'num.governance' },
  { lex: 'n:книга', ru: 'На столе́ {n} ___.', en: (n) => `There are ${n} books on the table.`, numbers: [2, 3, 4, 5, 8, 12, 22, 25], tag: 'num.governance' },
  { lex: 'n:человек', ru: 'В ко́мнате {n} ___.', en: (n) => `There are ${n} people in the room.`, numbers: [2, 3, 4, 5, 6, 10, 12, 22, 30], tag: 'num.governance' },
  { lex: 'n:раз', ru: 'Я звони́л тебе́ {n} ___!', en: (n) => `I called you ${n} times!`, numbers: [2, 3, 4, 5, 10, 22], tag: 'num.governance' },
  { lex: 'n:ребёнок', ru: 'У них {n} ___.', en: (n) => `They have ${n} ${n === 1 ? 'child' : 'children'}.`, numbers: [1, 2, 3, 4, 5, 6], tag: 'num.governance' },
]

/** Lexemes the numeral frames need. */
export const NUMERAL_LEXEMES = [...COUNT_FRAMES.map((f) => f.lex), 'n:друг', 'n:студент', 'n:город', 'n:фильм']

export function countItems(lexemes: Map<string, Lexeme>, rng: Rng, n: number): ExerciseItem[] {
  const out: ExerciseItem[] = []
  for (let tries = 0; out.length < n && tries < n * 6; tries++) {
    const f = pick(rng, COUNT_FRAMES)
    const lx = lexemes.get(f.lex)
    if (!lx) continue
    const num = pick(rng, f.numbers)
    const c = countForm(lx, num)
    if (!c) continue
    const id = `tr:num:${f.lex}:${num}`
    if (out.some((x) => x.id === id)) continue
    const band = countBand(num)
    const forms = (['one', 'few', 'many'] as CountBand[]).map((b) => countForm(lx, b === 'one' ? 1 : b === 'few' ? 2 : 5)?.form)
    const others = [...new Set(forms.filter((x): x is string => !!x && stripStress(x) !== stripStress(c.form)))]
    const choice = rng() < 0.35 && others.length >= 1
    out.push({
      id,
      type: choice ? 'choice' : 'cloze',
      level: 'A2',
      tags: [f.tag],
      vocab: [lx.id],
      source: 'generated',
      target: c.slot ? { lex: lx.id, slot: c.slot } : undefined,
      prompt: { instruction: choice ? 'Choose the right form' : `Put «${lx.lemma}» into the right form`, ru: f.ru.replace('{n}', String(num)), en: f.en(num) },
      accept: [c.form],
      distractors: choice ? others.map((o) => ({ ru: o, error: 'numeral.governance', why: BAND_REASON[band] })) : [{ ru: '', error: 'numeral.governance' }],
      reason: BAND_REASON[band],
    })
  }
  return out
}

interface DeclFrame {
  case: 'gen' | 'dat' | 'ins' | 'prep'
  ru: string
  en: (n: number, noun: string) => string
  nouns: string[]
}
const DECL_FRAMES: DeclFrame[] = [
  { case: 'gen', ru: 'Мы жда́ли о́коло ___ {noun}.', en: (n) => `We waited about ${n} hours.`, nouns: ['n:час'] },
  { case: 'gen', ru: 'Он вернётся из ___ {noun}.', en: (n, w) => `He'll come back from ${n} ${w}.`, nouns: ['n:город'] },
  { case: 'dat', ru: 'Я позвони́л ___ {noun}.', en: (n, w) => `I called ${n} ${w}.`, nouns: ['n:друг', 'n:студент'] },
  { case: 'ins', ru: 'Я говори́л с ___ {noun}.', en: (n, w) => `I talked with ${n} ${w}.`, nouns: ['n:друг', 'n:студент', 'n:ребёнок'] },
  { case: 'prep', ru: 'Он рассказа́л о ___ {noun}.', en: (n, w) => `He told us about ${n} ${w}.`, nouns: ['n:фильм', 'n:город', 'n:книга'] },
]
const PLURAL_EN: Record<string, string> = { 'n:час': 'hours', 'n:город': 'cities', 'n:друг': 'friends', 'n:студент': 'students', 'n:ребёнок': 'children', 'n:фильм': 'films', 'n:книга': 'books' }
const CASE_EN: Record<string, string> = { gen: 'genitive', dat: 'dative', ins: 'instrumental', prep: 'prepositional' }

/** «с тремя́ друзья́ми»: after a preposition the numeral declines, and the noun goes into the plural of the same case. */
export function declinedNumeralItems(lexemes: Map<string, Lexeme>, rng: Rng, n: number): ExerciseItem[] {
  const out: ExerciseItem[] = []
  for (let tries = 0; out.length < n && tries < n * 6; tries++) {
    const f = pick(rng, DECL_FRAMES)
    const lx = lexemes.get(pick(rng, f.nouns))
    if (!lx) continue
    const num = pick(rng, [2, 3, 4, 5, 6, 7, 8, 9, 10])
    const form = numeralForm(num, f.case)
    const noun = primaryForm(lx, `pl_${f.case}`)
    if (!form || !noun) continue
    const id = `tr:numdecl:${f.case}:${lx.id}:${num}`
    if (out.some((x) => x.id === id)) continue
    const nom = numeralForm(num, 'nom')!
    out.push({
      id,
      type: 'cloze',
      level: 'B1',
      tags: ['num.declension'],
      source: 'generated',
      prompt: { instruction: `Decline «${nom}»`, ru: f.ru.replace('{noun}', noun), en: f.en(num, PLURAL_EN[lx.id] ?? ''), governor: f.ru.split(' ___')[0]!.split(' ').pop() },
      accept: [form],
      distractors: [{ ru: nom, error: 'numeral.declension', why: `After a preposition the number declines too: ${CASE_EN[f.case]} **${form}**.` }],
      reason: `${CASE_EN[f.case]}: the number declines (**${form}**) and the noun goes into the ${CASE_EN[f.case]} plural (**${noun}**)`,
    })
  }
  return out
}

// ------------------------------------------------------------------ stress
/** Noun and verb forms whose stress differs from the dictionary form: ру́ку, города́, жила́. */
export function shiftingStressItems(pool: Lexeme[], rng: Rng, n: number, kind: 'noun' | 'past'): ExerciseItem[] {
  const out: ExerciseItem[] = []
  for (const lx of shuffle(rng, pool)) {
    if (out.length >= n) break
    if (kind === 'noun' && lx.pos !== 'noun') continue
    if (kind === 'past' && lx.pos !== 'verb') continue
    const lemmaIdx = stressIndex(lx.lemma)
    // the shifts worth drilling: ру́ку, ру́ки/руки́, городо́в, в лесу́ (not rare plurals of abstract nouns)
    const slots = kind === 'past' ? ['pst_f', 'pst_m', 'pst_pl'] : ['sg_acc', 'sg_gen', 'pl_nom', 'pl_gen', 'sg_loc2']
    const shifted = slots
      .map((slot) => ({ slot, form: primaryForm(lx, slot) }))
      .filter((o): o is { slot: string; form: string } => !!o.form && syllables(o.form) > 1 && stressIndex(o.form) !== null)
    if (kind === 'past') {
      // only verbs whose feminine past moves the stress (жил → жила́), shown alongside the masculine
      const m = primaryForm(lx, 'pst_m')
      const f = shifted.find((o) => o.slot === 'pst_f')
      if (!f || !m || stressAt(f.form) === stressAt(m)) continue
      for (const o of [f, shifted.find((x) => x.slot === 'pst_pl')].filter((x): x is { slot: string; form: string } => !!x)) out.push(stressFor(lx, o.slot, o.form, `${gloss(lx)} · past ${o.slot === 'pst_f' ? 'feminine' : 'plural'} (masculine ${m})`))
    } else {
      const moved = shifted.filter((o) => stressIndex(o.form) !== lemmaIdx && o.slot !== 'sg_nom')
      if (!moved.length) continue
      const o = pick(rng, moved)
      out.push(stressFor(lx, o.slot, o.form, `${gloss(lx)} · ${SLOT_EN[o.slot] ?? o.slot} (dictionary form ${lx.lemma})`))
    }
  }
  return out.slice(0, n)
}
/** Stressed syllable index, counting a monosyllable as stressed (жил). */
const stressAt = (w: string) => (syllables(w) === 1 ? 0 : stressIndex(w))
const SLOT_EN: Record<string, string> = Object.fromEntries(
  SLOTS.noun.map((s) => {
    const [num, kase] = s.split('_')
    return [s, `${{ nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', ins: 'instrumental', prep: 'prepositional', loc2: 'locative' }[kase!]} ${num === 'sg' ? 'singular' : 'plural'}`]
  }),
)

function stressFor(lx: Lexeme, slot: string, form: string, en: string): ExerciseItem {
  return {
    id: `tr:st:${lx.id}:${slot}`,
    type: 'stress',
    level: 'A2',
    tags: ['stress'],
    vocab: [lx.id],
    source: 'generated',
    target: { lex: lx.id, slot },
    prompt: { instruction: 'Tap the stressed vowel', en },
    stressWord: form,
  }
}

/** Two forms of one noun spelled alike but stressed differently: ру́ки (of the hand) / руки́ (hands). */
export function formPairItems(pool: Lexeme[], rng: Rng, n: number): ExerciseItem[] {
  const out: ExerciseItem[] = []
  for (const lx of shuffle(rng, pool)) {
    if (out.length >= n) break
    if (lx.pos !== 'noun') continue
    // sg_prep can list the second locative first (часу́|ча́се); compare it only where there is no separate locative
    const slots = SLOTS.noun.filter((s) => s !== 'sg_prep' || !primaryForm(lx, 'sg_loc2'))
    const forms = slots.map((slot) => ({ slot, form: primaryForm(lx, slot) })).filter((o): o is { slot: string; form: string } => !!o.form && syllables(o.form) > 1)
    const pair = forms.flatMap((a) => forms.filter((b) => b.slot > a.slot && stripStress(b.form) === stripStress(a.form) && b.form !== a.form).map((b) => [a, b] as const))[0]
    if (!pair) continue
    const [a, b] = rng() < 0.5 ? pair : ([pair[1], pair[0]] as const)
    const choices = shuffle(rng, [a.form, b.form])
    out.push({
      id: `tr:pair:${lx.id}:${a.slot}`,
      type: 'choice',
      level: 'B1',
      tags: ['stress'],
      vocab: [lx.id],
      source: 'generated',
      prompt: { instruction: `Which one is the ${SLOT_EN[a.slot]}?`, en: `${lx.lemma}: ${gloss(lx)}` },
      choices,
      answerIndex: choices.indexOf(a.form),
      distractors: [{ ru: b.form, error: 'stress.wrong' }],
      reason: `**${a.form}**: ${SLOT_EN[a.slot]} · **${b.form}**: ${SLOT_EN[b.slot]}`,
    })
  }
  return out
}

/** Different words told apart only by stress. Forms come from the lexicon, so the stress is the dataset's. */
export const MINIMAL_PAIRS: { a: [string, string, string]; b: [string, string, string] }[] = [
  { a: ['n:замок', 'sg_nom', 'castle'], b: ['n:замок:2', 'sg_nom', 'lock'] },
  { a: ['n:мука', 'sg_nom', 'torment'], b: ['n:мука:2', 'sg_nom', 'flour'] },
  { a: ['n:орган', 'sg_nom', 'organ (body, agency)'], b: ['n:орган:2', 'sg_nom', 'organ (instrument)'] },
  { a: ['n:хлопок', 'sg_nom', 'a clap, a bang'], b: ['n:хлопок:2', 'sg_nom', 'cotton'] },
  { a: ['v:плакать', 'np_1sg', 'I cry'], b: ['v:платить', 'np_1sg', 'I pay'] },
  { a: ['v:стоить', 'np_3sg', 'it costs'], b: ['v:стоять', 'np_3sg', 'it stands'] },
  { a: ['n:белка', 'pl_nom', 'squirrels'], b: ['n:белок', 'pl_nom', 'proteins'] },
  { a: ['n:полка', 'pl_nom', 'shelves'], b: ['n:полк', 'pl_nom', 'regiments'] },
  { a: ['n:кружка', 'pl_nom', 'mugs'], b: ['n:кружок', 'pl_nom', 'circles, clubs'] },
  { a: ['n:вина', 'sg_nom', 'guilt'], b: ['n:вино', 'pl_nom', 'wines'] },
  { a: ['n:весть', 'pl_nom', 'news, tidings'], b: ['v:вести', 'inf', 'to lead'] },
  { a: ['n:село', 'sg_nom', 'village'], b: ['v:сесть', 'pst_n', 'sat down (neuter)'] },
  { a: ['n:ирис', 'sg_nom', 'iris (flower)'], b: ['n:ирис:2', 'sg_nom', 'toffee'] },
  { a: ['n:дорога', 'sg_nom', 'road'], b: ['a:дорогой', 'short_f', 'dear, expensive (feminine)'] },
]
export const MINIMAL_PAIR_LEXEMES = [...new Set(MINIMAL_PAIRS.flatMap((p) => [p.a[0], p.b[0]]))]

export interface ResolvedPair {
  a: { form: string; en: string; lex: string }
  b: { form: string; en: string; lex: string }
}
/** Pairs whose two forms really are the same letters with different stress, as the lexicon spells them. */
export function resolvePairs(lexemes: Map<string, Lexeme>): ResolvedPair[] {
  const one = ([lex, slot, en]: [string, string, string]) => {
    const lx = lexemes.get(lex)
    const form = lx ? primaryForm(lx, slot) : undefined
    return form ? { form, en, lex } : null
  }
  return MINIMAL_PAIRS.flatMap(({ a, b }) => {
    const x = one(a)
    const y = one(b)
    return x && y && x.form !== y.form && stripStress(x.form).toLowerCase() === stripStress(y.form).toLowerCase() ? [{ a: x, b: y }] : []
  })
}

export function minimalPairItems(lexemes: Map<string, Lexeme>, rng: Rng, n: number): ExerciseItem[] {
  return shuffle(rng, resolvePairs(lexemes))
    .slice(0, n)
    .map(({ a, b }) => {
      const [want, other] = rng() < 0.5 ? [a, b] : [b, a]
      const choices = shuffle(rng, [a.form, b.form])
      return {
        id: `tr:mp:${want.lex}:${want.form}`,
        type: 'choice',
        level: 'B1',
        tags: ['stress'],
        vocab: [want.lex],
        source: 'generated',
        prompt: { instruction: 'Which one means…', en: `“${want.en}”` },
        choices,
        answerIndex: choices.indexOf(want.form),
        distractors: [{ ru: other.form, error: 'stress.wrong' }],
        reason: `**${want.form}**: ${want.en} · **${other.form}**: ${other.en}`,
      } satisfies ExerciseItem
    })
}

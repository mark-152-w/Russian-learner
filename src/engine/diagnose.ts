// Diagnose a wrong form against the word's whole paradigm and the spelling rules.
import type { Lexeme } from '../types/content.gen'
import { fold } from '../lib/ru'
import { SLOTS, decodeCell, primaryForm } from '../lib/lexicon'
import { commonPrefix } from './normalize'
import { CASE_NAME, GENDER_NAME, PRONOUN, parseSlot, slotLabel, type Case } from './slots'

export interface Diagnosis {
  errorType: string
  message: string
  matchedSlot?: string
}

const stemCache = new WeakMap<Lexeme, number>()

/** Length of the stem shared by every usable form of the word (folded). Endings start after it. */
export function stemLength(lx: Lexeme): number {
  const hit = stemCache.get(lx)
  if (hit !== undefined) return hit
  const forms: string[] = [fold(lx.lemma)]
  for (const cell of lx.forms ?? []) for (const v of decodeCell(cell)) if (v.usable) forms.push(fold(v.form))
  let n = forms[0]!.length
  for (const f of forms) n = Math.min(n, commonPrefix(forms[0]!, f))
  stemCache.set(lx, n)
  return n
}

/** Every slot whose variants (any, including rare) equal the normalised response. */
export function matchingSlots(lx: Lexeme, response: string): string[] {
  const slots = SLOTS[lx.pos]
  const out: string[] = []
  ;(lx.forms ?? []).forEach((cell, i) => {
    if (decodeCell(cell).some((v) => fold(v.form) === response)) out.push(slots[i]!)
  })
  return out
}

const b = (s: string) => `**${s}**`

function caseErrorType(expected: Case, got: Case, tags: string[], animate: boolean): string {
  if (got === 'nom' && expected !== 'nom') return 'case.nom-default'
  if ((expected === 'prep' || expected === 'loc2') && got === 'acc') return 'case.acc-for-prep'
  if (expected === 'acc' && (got === 'prep' || got === 'loc2')) return 'case.prep-for-acc'
  if (expected === 'gen' && tags.includes('case.gen.negation')) return 'case.gen-after-negation'
  if (expected === 'gen' && (tags.includes('case.gen.quantity') || tags.includes('num.governance'))) return 'case.gen-quantity'
  if (expected === 'acc' && animate && got === 'nom') return 'animacy.acc'
  if (expected === 'ins' && tags.some((t) => t.startsWith('case.ins.'))) return 'case.instrumental-role'
  if (tags.some((t) => t.endsWith('.prepositions'))) return 'case.preposition-government'
  return 'case.wrong'
}

const CASE_HINT: Record<string, string> = {
  'case.acc-for-prep': 'в/на + accusative means motion *into/onto* (куда́?). For location (где?) use the prepositional.',
  'case.prep-for-acc': 'Motion towards a place (куда́?) takes в/на + accusative; the prepositional is for location (где?).',
  'case.nom-default': 'That is the dictionary form. English nouns barely change, so this is the most common slip.',
  'case.gen-after-negation': 'нет / не́ было / не бу́дет + the missing thing takes the genitive.',
  'case.gen-quantity': '2–4 take the genitive singular; 5 and up, мно́го, ма́ло and ско́лько take the genitive plural.',
  'animacy.acc': 'Animate masculine nouns (and all animate plurals) use the genitive form as their accusative.',
}

function formOf(lx: Lexeme, slot: string): string {
  return primaryForm(lx, slot) ?? decodeCell(lx.forms?.[SLOTS[lx.pos].indexOf(slot)] ?? '')[0]?.form ?? '?'
}

/** Explain a response that matches another slot of the same word. */
function explainSlotMismatch(lx: Lexeme, expectedSlot: string, gotSlot: string, tags: string[]): Diagnosis {
  const e = parseSlot(lx.pos, expectedSlot)
  const g = parseSlot(lx.pos, gotSlot)
  const exp = formOf(lx, expectedSlot)
  const got = formOf(lx, gotSlot)
  const expLabel = slotLabel(lx.pos, expectedSlot, lx.aspect)
  const gotLabel = slotLabel(lx.pos, gotSlot, lx.aspect)
  const base = { matchedSlot: gotSlot }

  if (e.kind === 'case' && g.kind === 'case') {
    if (lx.pos === 'adj' && e.case === g.case && (e.gender !== g.gender || e.number !== g.number)) {
      const type = e.number !== g.number ? 'agreement.number' : 'agreement.gender'
      const what = e.number === 'pl' ? 'plural' : GENDER_NAME[e.gender!]
      return { ...base, errorType: type, message: `Right case, wrong agreement: ${b(got)} is ${gotLabel}. The noun here needs ${what}: ${b(exp)}.` }
    }
    if (e.case === g.case && e.number !== g.number) {
      return { ...base, errorType: 'number.wrong', message: `Right case, wrong number: ${b(got)} is the ${gotLabel}. You need the ${e.number === 'pl' ? 'plural' : 'singular'}: ${b(exp)}.` }
    }
    const type = caseErrorType(e.case!, g.case!, tags, !!lx.animate || !!e.animate)
    const hint = CASE_HINT[type] ? ` ${CASE_HINT[type]}` : ''
    const numberToo = e.number !== g.number ? ' (and the number is off too)' : ''
    return {
      ...base,
      errorType: type,
      message: `You used the ${CASE_NAME[g.case!]} (${b(got)})${numberToo}. Here you need the ${expLabel}: ${b(exp)}.${hint}`,
    }
  }
  if (e.kind === 'np' && g.kind === 'np') {
    return { ...base, errorType: 'verb.person', message: `${b(got)} is the ${PRONOUN[`${g.person}${g.number}`]} form. You need the ${PRONOUN[`${e.person}${e.number}`]} form: ${b(exp)}.` }
  }
  if (e.kind === 'pst' && g.kind === 'pst') {
    return { ...base, errorType: 'verb.past-gender', message: `The past tense agrees with its subject: ${b(got)} is ${gotLabel}; you need ${expLabel}: ${b(exp)}.` }
  }
  if (e.kind === 'imp' || g.kind === 'imp') {
    return { ...base, errorType: 'verb.imperative', message: `${b(got)} is the ${gotLabel}. You need the ${expLabel}: ${b(exp)}.` }
  }
  if (lx.pos === 'verb') {
    return { ...base, errorType: 'verb.tense', message: `${b(got)} is the ${gotLabel}. You need the ${expLabel}: ${b(exp)}.` }
  }
  return { ...base, errorType: 'case.wrong', message: `${b(got)} is the ${gotLabel}. You need the ${expLabel}: ${b(exp)}.` }
}

// Spelling rules: each maps the learner's response to what it would be with the rule applied.
const SPELLING_RULES: { type: string; fix: (r: string) => string[]; message: string }[] = [
  {
    type: 'spelling.7-letter',
    fix: (r) => [r.replace(/([кгхжшщч])ы/g, '$1и')],
    message: 'Spelling rule: after к, г, х, ж, ш, щ, ч write и, never ы.',
  },
  {
    type: 'spelling.ya-a',
    fix: (r) => [r.replace(/([кгхжшщчц])я/g, '$1а').replace(/([кгхжшщчц])ю/g, '$1у')],
    message: 'Spelling rule: after к, г, х, ж, ш, щ, ч, ц write а and у, not я and ю.',
  },
  {
    type: 'spelling.5-letter',
    fix: (r) => [r.replace(/([жшщчц])о/g, '$1е'), r.replace(/([жшщчц])е/g, '$1о')],
    message: 'Spelling rule: after ж, ш, щ, ч, ц an unstressed о is written е (stressed stays о).',
  },
  {
    type: 'spelling.soft-sign',
    fix: (r) => {
      const out = [r.replace(/ь/g, '')]
      for (let i = 1; i <= r.length; i++) out.push(r.slice(0, i) + 'ь' + r.slice(i))
      return out
    },
    message: 'Check the soft sign ь.',
  },
  {
    type: 'spelling.fleeting-vowel',
    fix: (r) => {
      const out: string[] = []
      for (let i = 1; i < r.length; i++) {
        if ('ое'.includes(r[i]!)) out.push(r.slice(0, i) + r.slice(i + 1)) // ru-ignore
        out.push(r.slice(0, i) + 'о' + r.slice(i), r.slice(0, i) + 'е' + r.slice(i))
      }
      return out
    },
    message: 'Fleeting vowel: the о/е in the last syllable of the stem drops out or appears in some forms (оте́ц → отца́, окно́ → о́кон).',
  },
]

/**
 * Explain why `response` (already normalised) is not the expected form.
 * Returns null when there is nothing specific to say.
 */
export function diagnoseForm(lx: Lexeme, expectedSlot: string, response: string, tags: string[] = []): Diagnosis | null {
  const expectedVariants = decodeCell(lx.forms?.[SLOTS[lx.pos].indexOf(expectedSlot)] ?? '').map((v) => fold(v.form))
  const exp = formOf(lx, expectedSlot)
  const expLabel = slotLabel(lx.pos, expectedSlot, lx.aspect)

  const slots = matchingSlots(lx, response).filter((s) => s !== expectedSlot)
  if (slots.length) {
    // prefer the reading that differs from the target in the fewest dimensions
    const e = parseSlot(lx.pos, expectedSlot)
    const score = (s: string) => {
      const g = parseSlot(lx.pos, s)
      return (g.case !== e.case ? 1 : 0) + (g.number !== e.number ? 1 : 0) + (g.gender !== e.gender ? 1 : 0) + (g.kind !== e.kind ? 2 : 0)
    }
    const best = [...slots].sort((a, c) => score(a) - score(c))[0]!
    return explainSlotMismatch(lx, expectedSlot, best, tags)
  }

  for (const rule of SPELLING_RULES) {
    if (rule.fix(response).some((c) => c !== response && expectedVariants.includes(c))) {
      return { errorType: rule.type, message: `${rule.message} The ${expLabel} is ${b(exp)}.` }
    }
  }

  const stem = stemLength(lx)
  if (stem >= 2 && commonPrefix(response, expectedVariants[0] ?? '') >= stem) {
    const ending = response.slice(stem) || '∅'
    return {
      errorType: 'ending.invented',
      message: `The stem is right, but -${ending} isn't an ending this word has. The ${expLabel} is ${b(exp)}.`,
    }
  }
  return null
}

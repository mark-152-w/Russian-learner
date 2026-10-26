// Structured view of lexicon slot names (see src/data/lexicon/slots.json) and their English labels.
import type { Pos } from '../lib/lexicon'

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'prep' | 'loc2'
export type Num = 'sg' | 'pl'
export type Gender = 'm' | 'f' | 'n'

export interface SlotInfo {
  kind: 'case' | 'np' | 'pst' | 'imp' | 'inf' | 'short' | 'comp' | 'sup'
  case?: Case
  number?: Num
  gender?: Gender
  person?: 1 | 2 | 3
  animate?: boolean
}

export const CASE_NAME: Record<Case, string> = {
  nom: 'nominative',
  gen: 'genitive',
  dat: 'dative',
  acc: 'accusative',
  ins: 'instrumental',
  prep: 'prepositional',
  loc2: 'locative in -у́',
}
export const GENDER_NAME: Record<Gender, string> = { m: 'masculine', f: 'feminine', n: 'neuter' }
export const PRONOUN: Record<string, string> = {
  '1sg': 'я', '2sg': 'ты', '3sg': 'он/она́', '1pl': 'мы', '2pl': 'вы', '3pl': 'они́',
}

export function parseSlot(pos: Pos, slot: string): SlotInfo {
  const p = slot.split('_')
  if (pos === 'noun') return { kind: 'case', number: p[0] as Num, case: p[1] as Case }
  if (pos === 'adj') {
    if (p[0] === 'short') {
      return p[1] === 'pl' ? { kind: 'short', number: 'pl' } : { kind: 'short', number: 'sg', gender: p[1] as Gender }
    }
    if (slot === 'comp') return { kind: 'comp' }
    if (slot === 'sup') return { kind: 'sup' }
    const info: SlotInfo = { kind: 'case', case: p[1] as Case, animate: p[2] === 'an' || undefined }
    if (p[0] === 'pl') info.number = 'pl'
    else {
      info.number = 'sg'
      info.gender = p[0] as Gender
    }
    return info
  }
  if (pos === 'verb') {
    if (slot === 'inf') return { kind: 'inf' }
    if (p[0] === 'np') {
      const pn = p[1]!
      return { kind: 'np', person: Number(pn[0]) as 1 | 2 | 3, number: pn.slice(1) as Num }
    }
    if (p[0] === 'pst') {
      return p[1] === 'pl' ? { kind: 'pst', number: 'pl' } : { kind: 'pst', number: 'sg', gender: p[1] as Gender }
    }
    return { kind: 'imp', number: p[1] as Num }
  }
  return { kind: 'inf' }
}

/** "genitive plural", "feminine instrumental", "past tense, feminine", "ты form" … */
export function slotLabel(pos: Pos, slot: string, aspect?: string): string {
  const s = parseSlot(pos, slot)
  switch (s.kind) {
    case 'case':
      if (pos === 'noun') return s.case === 'loc2' ? CASE_NAME.loc2 : `${CASE_NAME[s.case!]} ${s.number === 'pl' ? 'plural' : 'singular'}`
      if (s.number === 'pl') return `${CASE_NAME[s.case!]} plural${s.animate ? ' (animate)' : ''}`
      return `${GENDER_NAME[s.gender!]} ${CASE_NAME[s.case!]}${s.animate ? ' (animate)' : ''}`
    case 'short':
      return `short form, ${s.number === 'pl' ? 'plural' : GENDER_NAME[s.gender!]}`
    case 'comp':
      return 'comparative'
    case 'sup':
      return 'superlative'
    case 'inf':
      return 'infinitive'
    case 'np': {
      const key = `${s.person}${s.number}`
      const tense = aspect === 'pf' ? 'future' : 'present'
      return `${tense} tense, ${PRONOUN[key]} form`
    }
    case 'pst':
      return `past tense, ${s.number === 'pl' ? 'plural' : GENDER_NAME[s.gender!]}`
    case 'imp':
      return `imperative (${s.number === 'pl' ? 'вы' : 'ты'})`
  }
}

/** Grammar tags for drilling a slot (from src/data/tags.json). */
export function slotTags(pos: Pos, slot: string, aspect?: string): string[] {
  const s = parseSlot(pos, slot)
  if (s.kind === 'case') {
    const tags = [s.case === 'loc2' ? 'case.loc2' : `case.${s.case}`]
    if (s.number === 'pl') tags.push('case.plural')
    if (pos === 'adj') tags.push('adj.agreement')
    if (s.case === 'acc' && s.animate) tags.push('case.acc.animacy')
    return tags
  }
  if (s.kind === 'short') return ['adj.short']
  if (s.kind === 'comp') return ['adj.comparative']
  if (s.kind === 'sup') return ['adj.superlative']
  if (s.kind === 'np') return [aspect === 'pf' ? 'verb.future' : 'verb.present']
  if (s.kind === 'pst') return ['verb.past']
  if (s.kind === 'imp') return ['verb.imperative']
  return ['vocab']
}

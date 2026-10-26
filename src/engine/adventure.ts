// «Де́ло»: the text adventure's state machine and command parser. Chapters are data (content/adventure). The
// parser knows each verb's government (case + preposition) from the chapter files, so a failed command is
// explained grammatically: «возьми́ ключа́» → take *what?*: the accusative, ключ.
import type { AdventureChapter } from '../types/content.gen'
import { fold } from '../lib/ru'

export type Case = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'prep'
type Verb = NonNullable<AdventureChapter['verbs']>[number]
type Item = NonNullable<AdventureChapter['items']>[string]
export type Scene = AdventureChapter['scenes'][string]
type Spec = { case?: Case; preposition?: string; why?: string }

export const CASE_EN: Record<Case, string> = { nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', ins: 'instrumental', prep: 'prepositional' }
const CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep']
// spelling variants of prepositions (во, со, ко, об, обо) count as the base preposition
const PREPS: Record<string, string> = {
  в: 'в', во: 'в', на: 'на', о: 'о', об: 'о', обо: 'о', с: 'с', со: 'с', к: 'к', ко: 'к', у: 'у', из: 'из', от: 'от', для: 'для', про: 'про', за: 'за', под: 'под', по: 'по', // ru-ignore
}
/** Where-to prepositions and their case, for exits. */
const DIRECTION: Record<string, Case> = { в: 'acc', на: 'acc', к: 'dat' } // ru-ignore
const HELP_WORDS = new Set(['помощь', 'помоги', 'help', '?']) // ru-ignore
const LOOK_WORDS = new Set(['осмотрись', 'смотри', 'look', 'где']) // ru-ignore

export interface World {
  verbs: Verb[]
  items: Record<string, Item>
}

/** Verbs and items of this chapter and every earlier one (later definitions win). */
export function worldFor(chapters: AdventureChapter[], n: number): World {
  const upto = chapters.filter((c) => c.chapter <= n).sort((a, b) => a.chapter - b.chapter)
  const verbs = new Map<string, Verb>()
  const items: Record<string, Item> = {}
  for (const c of upto) {
    for (const v of c.verbs ?? []) verbs.set(v.id, v)
    Object.assign(items, c.items ?? {})
  }
  return { verbs: [...verbs.values()], items }
}

export const words = (input: string) =>
  fold(input)
    .replace(/[^a-zа-я?\s-]/g, ' ') // ru-ignore
    .split(/\s+/)
    .filter(Boolean)

interface Mention {
  item: string
  cases: Case[]
  word: string
  prep?: string
}

function mentions(ws: string[], world: World): { found: Mention[]; unknown: string[] } {
  const found: Mention[] = []
  const unknown: string[] = []
  let prep: string | undefined
  for (const w of ws) {
    if (PREPS[w]) {
      prep = PREPS[w]
      continue
    }
    let hit = false
    for (const [id, it] of Object.entries(world.items)) {
      const cases = CASES.filter((c) => it.forms[c] && fold(it.forms[c]!) === w)
      if (cases.length) {
        found.push({ item: id, cases, word: w, prep })
        hit = true
        break
      }
    }
    if (hit) prep = undefined
    else unknown.push(w)
  }
  return { found, unknown }
}

const normPhrase = (s: string) => words(s).map((w) => PREPS[w] ?? w).join(' ')

/** о → об before a vowel, for showing the expected phrase. */
const withPrep = (prep: string | undefined, form: string) => (prep ? `${prep === 'о' && /^[аоуэиы]/i.test(fold(form)) ? 'об' : prep} ${form}` : form) // ru-ignore

export function tagFor(spec: Spec): string {
  if (spec.preposition === 'о' && spec.case === 'prep') return 'case.prep.about' // ru-ignore
  if (spec.preposition === 'с' && spec.case === 'ins') return 'case.ins.with' // ru-ignore
  if (spec.preposition && spec.case === 'acc') return 'case.acc.direction'
  if (spec.case === 'dat') return spec.preposition ? 'case.dat.prepositions' : 'case.dat.indirect-object'
  if (spec.case === 'acc') return 'case.acc.direct-object'
  return `case.${spec.case ?? 'acc'}`
}

export type Outcome =
  | { kind: 'help' }
  | { kind: 'look' }
  /** Nothing happens (the Russian may well have been fine: `ok`). */
  | { kind: 'say'; en: string; ok?: boolean; grammar?: Graded }
  | { kind: 'grammar'; en: string; graded: Graded }
  | { kind: 'move'; to: string; response?: { ru: string; en?: string }; sets: string[]; grammar?: Graded }

/** A grammar decision the learner model hears about. */
export interface Graded {
  tag: string
  correct: boolean
  expected: string
  key: string
}

export function parse(input: string, scene: Scene, sceneId: string, world: World, flags: ReadonlySet<string>): Outcome {
  const ws = words(input)
  if (!ws.length) return { kind: 'say', en: 'Type a command, for example «осмотри́ дверь».' }
  if (HELP_WORDS.has(ws[0]!)) return { kind: 'help' }
  if (ws.length === 1 && LOOK_WORDS.has(ws[0]!)) return { kind: 'look' }
  const verb = world.verbs.find((v) => v.forms.some((f) => fold(f) === ws[0]))
  if (!verb) {
    return { kind: 'say', en: `I don't know the verb «${ws[0]}». Verbs you can use: ${world.verbs.map((v) => v.forms[0]).join(', ')}. Type «по́мощь» for help.` }
  }
  const rest = ws.slice(1)
  const shown = verb.forms[0]!
  if (verb.action === 'go') return go(rest, scene, sceneId, world, shown)

  const { found, unknown } = mentions(rest, world)
  const spec = { object: verb.object as Spec | undefined, topic: verb.topic as Spec | undefined }
  if (!found.length) {
    if (unknown.length) return { kind: 'say', en: `You don't see «${unknown.join(' ')}» here, or I don't know that word.` }
    const need = spec.object ? 'what?' : spec.topic?.preposition ? `${spec.topic.preposition} + ${CASE_EN[spec.topic.case!]}` : 'whom?'
    return { kind: 'say', en: `«${shown}» … ${need}` }
  }

  const noPrep = found.filter((m) => !m.prep)
  const prepped = found.filter((m) => m.prep)
  let topic: Mention | undefined
  if (spec.topic?.preposition) topic = prepped.find((m) => m.prep === spec.topic!.preposition) ?? prepped[0] ?? (spec.object ? undefined : noPrep[0])
  else if (spec.topic) topic = noPrep.find((m) => m.cases.includes(spec.topic!.case!) && !(spec.object && m.cases.includes(spec.object.case!) && noPrep.length === 1))
  let object = spec.object ? (noPrep.find((m) => m !== topic && m.cases.includes(spec.object!.case!)) ?? noPrep.find((m) => m !== topic)) : undefined
  // a give/show with two bare nouns: whichever isn't the object was meant as the recipient
  if (spec.topic && !spec.topic.preposition && !topic) topic = noPrep.find((m) => m !== object)
  if (!spec.object && !topic) object = undefined

  // grammar first: the wrong case or preposition is the useful feedback, whatever the scene allows
  for (const [m, s] of [
    [object, spec.object],
    [topic, spec.topic],
  ] as const) {
    if (!m || !s) continue
    const it = world.items[m.item]!
    const form = it.forms[s.case!]!
    const expected = `${shown} ${withPrep(s.preposition, form)}`
    const graded = { tag: tagFor(s), expected, key: `${verb.id}:${m.item}:${s.case}`, correct: false }
    if ((s.preposition ?? '') !== (m.prep ?? '')) {
      const what = s.preposition ? `**${shown}** goes with **${s.preposition}** + ${CASE_EN[s.case!]}` : `**${shown}** takes the ${CASE_EN[s.case!]} with no preposition`
      return { kind: 'grammar', graded, en: `${what}: **${expected}**. ${s.why ?? ''}`.trim() }
    }
    if (!m.cases.includes(s.case!)) {
      return {
        kind: 'grammar',
        graded,
        en: `${s.why ?? `Here it's the ${CASE_EN[s.case!]}.`} So: **${expected}**. You wrote ${m.word}, the ${m.cases.map((c) => CASE_EN[c]).join('/')}.`,
      }
    }
  }
  const graded: Graded | undefined =
    object || topic
      ? { tag: tagFor((object ? spec.object : spec.topic)!), correct: true, expected: input, key: `${verb.id}:${(object ?? topic)!.item}` }
      : undefined

  const cmd = (scene.commands ?? []).find(
    (c) =>
      c.verb === verb.id &&
      (!c.object || c.object === object?.item) &&
      (!c.topic || c.topic === topic?.item) &&
      (c.object || c.topic) &&
      (c.requires ?? []).every((f) => flags.has(f)),
  )
  if (!cmd) {
    const what = [object, topic].filter(Boolean).map((m) => world.items[m!.item]!.en ?? m!.item)
    return { kind: 'say', ok: true, grammar: graded, en: `Your Russian is fine, but nothing happens${what.length ? ` with ${what.join(' and ')}` : ''} here.` }
  }
  return { kind: 'move', to: cmd.to === sceneId ? sceneId : cmd.to, sets: cmd.sets ?? [], response: cmd.response ? { ru: cmd.response, en: cmd.en } : undefined, grammar: graded }
}

function go(rest: string[], scene: Scene, sceneId: string, world: World, shown: string): Outcome {
  const exits = scene.exits ?? {}
  const keys = Object.keys(exits)
  const list = keys.length ? keys.map((k) => `${shown} ${k}`).join(', ') : 'nowhere just now'
  if (!rest.length) return { kind: 'say', en: `Where to? From here: ${list}.` }
  const phrase = rest.map((w) => PREPS[w] ?? w).join(' ')
  const exact = keys.find((k) => normPhrase(k) === phrase)
  if (exact) return { kind: 'move', to: exits[exact]!, sets: [], grammar: { tag: 'case.acc.direction', correct: true, expected: `${shown} ${exact}`, key: `go:${sceneId}:${exact}` } }
  const { found } = mentions(rest, world)
  for (const m of found) {
    const it = world.items[m.item]!
    const key = keys.find((k) => words(k).some((w) => CASES.some((c) => it.forms[c] && fold(it.forms[c]!) === w)))
    if (!key) continue
    const [kp, kw] = [PREPS[words(key)[0]!], words(key).slice(-1)[0]!]
    // сара́й is both nominative and accusative: the preposition says which (в + accusative)
    const implied = kp ? DIRECTION[kp] : undefined
    const kc = implied && it.forms[implied] && fold(it.forms[implied]!) === kw ? implied : CASES.find((c) => it.forms[c] && fold(it.forms[c]!) === kw)!
    const expected = `${shown} ${key}`
    const graded = { tag: kc === 'dat' ? 'case.dat.prepositions' : 'case.acc.direction', correct: false, expected, key: `go:${sceneId}:${key}` }
    // a correct where-to phrase, just not the way the exit is written (в дом vs к до́му): not a grammar mistake
    if (m.prep && DIRECTION[m.prep] && m.cases.includes(DIRECTION[m.prep]!) && m.prep !== kp) return { kind: 'say', ok: true, en: `Good Russian, but that way isn't open. Try: **${expected}**.` }
    if (!m.prep) return { kind: 'grammar', graded, en: `*Where to?* (куда́?) needs a preposition: **${expected}**.` }
    const where = m.cases.includes('prep') && kc === 'acc' ? ` ${m.prep} ${m.word} (prepositional) says *where* something is; for *where to* use the accusative.` : ''
    return { kind: 'grammar', graded, en: `*Where to?* (куда́?): **${kp}** + ${CASE_EN[kc]}, so **${expected}**.${where}` }
  }
  return { kind: 'say', en: `You can't go that way. From here: ${list}.` }
}

/** The choices a scene offers, with whether each is available yet. */
export function availableChoices(scene: Scene, flags: ReadonlySet<string>) {
  return (scene.choices ?? []).map((c) => ({ choice: c, open: (c.requires ?? []).every((f) => flags.has(f)) }))
}

// Hand-written content (src/data/content/**), validated at build time by tools/validate.py.
import type { ExerciseFile, ExerciseItem, GrammarArticle, IdiomFile, Unit } from '../types/content.gen'

const exerciseFiles = import.meta.glob<{ default: ExerciseFile }>('../data/content/exercises/*.json')
const grammarFiles = import.meta.glob<{ default: GrammarArticle }>('../data/content/grammar/*.json')
const unitFiles = import.meta.glob<{ default: Unit }>('../data/content/units/*.json')

let exercises: Promise<Map<string, ExerciseItem>> | null = null
export function loadHandwritten(): Promise<Map<string, ExerciseItem>> {
  return (exercises ??= Promise.all(Object.values(exerciseFiles).map((f) => f())).then(
    (mods) => new Map(mods.flatMap((m) => m.default.items).map((i) => [i.id, i])),
  ))
}

let grammar: Promise<GrammarArticle[]> | null = null
export function loadGrammar(): Promise<GrammarArticle[]> {
  return (grammar ??= Promise.all(Object.values(grammarFiles).map((f) => f())).then((mods) => mods.map((m) => m.default)))
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
let units: Promise<Unit[]> | null = null
export function loadUnits(): Promise<Unit[]> {
  return (units ??= Promise.all(Object.values(unitFiles).map((f) => f())).then((mods) =>
    mods.map((m) => m.default).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.number - b.number),
  ))
}

const idiomFiles = import.meta.glob<{ default: IdiomFile }>('../data/content/idioms/*.json')
export type Idiom = IdiomFile['items'][number]
let idioms: Promise<Idiom[]> | null = null
export function loadIdioms(): Promise<Idiom[]> {
  return (idioms ??= Promise.all(Object.values(idiomFiles).map((f) => f())).then((mods) => mods.flatMap((m) => m.default.items)))
}

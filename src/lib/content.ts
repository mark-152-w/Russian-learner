// Hand-written content (src/data/content/**), validated at build time by tools/validate.py.
import type { ExerciseFile, ExerciseItem, GrammarArticle, Unit } from '../types/content.gen'

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

let units: Promise<Unit[]> | null = null
export function loadUnits(): Promise<Unit[]> {
  return (units ??= Promise.all(Object.values(unitFiles).map((f) => f())).then((mods) =>
    mods.map((m) => m.default).sort((a, b) => a.number - b.number),
  ))
}

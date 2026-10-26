// ЙЦУКЕН touch-typing course: lessons add keys from the home row outwards; drills use real words (and finally
// sentences) built only from the letters learned so far. Physical key codes map to Cyrillic, so the course works
// before the Russian layout is installed.
import type { Lexeme, Sentence } from '../types/content.gen'
import { shuffle, type Rng } from '../lib/rng'
import { stripStress } from '../lib/ru'

/** Rows of the standard Russian layout (ЙЦУКЕН) with the physical key each letter sits on. */
export const ROWS: [string, string][][] = [
  [['ё', 'Backquote']],
  [['й', 'KeyQ'], ['ц', 'KeyW'], ['у', 'KeyE'], ['к', 'KeyR'], ['е', 'KeyT'], ['н', 'KeyY'], ['г', 'KeyU'], ['ш', 'KeyI'], ['щ', 'KeyO'], ['з', 'KeyP'], ['х', 'BracketLeft'], ['ъ', 'BracketRight']], // ru-ignore
  [['ф', 'KeyA'], ['ы', 'KeyS'], ['в', 'KeyD'], ['а', 'KeyF'], ['п', 'KeyG'], ['р', 'KeyH'], ['о', 'KeyJ'], ['л', 'KeyK'], ['д', 'KeyL'], ['ж', 'Semicolon'], ['э', 'Quote']], // ru-ignore
  [['я', 'KeyZ'], ['ч', 'KeyX'], ['с', 'KeyC'], ['м', 'KeyV'], ['и', 'KeyB'], ['т', 'KeyN'], ['ь', 'KeyM'], ['б', 'Comma'], ['ю', 'Period']], // ru-ignore
]
export const CODE_TO_RU: Record<string, string> = Object.fromEntries(ROWS.flat().map(([ru, code]) => [code, ru]))
export const RU_TO_CODE: Record<string, string> = Object.fromEntries(ROWS.flat().map(([ru, code]) => [ru, code]))
/** The Latin letter printed on the same key (for the on-screen hint). */
export const LATIN: Record<string, string> = Object.fromEntries(
  ROWS.flat().map(([ru, code]) => [ru, code.startsWith('Key') ? code.slice(3) : { Backquote: '`', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.' }[code] ?? '']),
)
/** Which finger types each key (left little … right little), for colouring the keyboard. */
export const FINGER: Record<string, number> = Object.fromEntries(
  ROWS.flat().map(([ru, code]) => {
    const col = { Backquote: 0, KeyQ: 0, KeyA: 0, KeyZ: 0, KeyW: 1, KeyS: 1, KeyX: 1, KeyE: 2, KeyD: 2, KeyC: 2, KeyR: 3, KeyF: 3, KeyV: 3, KeyT: 3, KeyG: 3, KeyB: 3, KeyY: 4, KeyH: 4, KeyN: 4, KeyU: 4, KeyJ: 4, KeyM: 4, KeyI: 5, KeyK: 5, Comma: 5, KeyO: 6, KeyL: 6, Period: 6 }[code] ?? 7
    return [ru, col]
  }),
)

export interface KbLesson {
  n: number
  title: string
  /** Letters this lesson introduces. */
  adds: string
}
export const LESSONS: KbLesson[] = [
  { n: 1, title: 'Index and middle fingers', adds: 'аовл' }, // ru-ignore
  { n: 2, title: 'Ring fingers', adds: 'ыд' }, // ru-ignore
  { n: 3, title: 'The whole home row', adds: 'фпржэ' }, // ru-ignore
  { n: 4, title: 'Top row: the centre', adds: 'ен' }, // ru-ignore
  { n: 5, title: 'Top row: index fingers', adds: 'кг' }, // ru-ignore
  { n: 6, title: 'Top row: middle fingers', adds: 'уш' }, // ru-ignore
  { n: 7, title: 'Top row: the edges', adds: 'йцщз' }, // ru-ignore
  { n: 8, title: 'Top row: the far right', adds: 'хъё' }, // ru-ignore
  { n: 9, title: 'Bottom row: index fingers', adds: 'ми' }, // ru-ignore
  { n: 10, title: 'Bottom row: т and ь', adds: 'ть' }, // ru-ignore
  { n: 11, title: 'Bottom row: с and б', adds: 'сб' }, // ru-ignore
  { n: 12, title: 'Bottom row: the edges', adds: 'чюя' }, // ru-ignore
  { n: 13, title: 'Real sentences', adds: '' },
]

export const lettersUpTo = (n: number) => LESSONS.filter((l) => l.n <= n).map((l) => l.adds).join('')

const bare = (s: string) => stripStress(s).toLowerCase()

/** Lines for one lesson: a warm-up on the new keys, then real words that use only learned letters. */
export function lessonLines(n: number, pool: Lexeme[], sentences: Sentence[], rng: Rng): string[] {
  const lesson = LESSONS.find((l) => l.n === n)!
  if (!lesson.adds) {
    const usable = sentences.map((s) => bare(s.ru).replace(/[^а-яё ,.?!-]/g, '').trim()).filter((s) => s.length >= 15 && s.length <= 45) // ru-ignore
    return shuffle(rng, usable).slice(0, 6)
  }
  const known = new Set(lettersUpTo(n))
  const fresh = [...lesson.adds]
  const warm = [fresh.map((c) => c.repeat(3)).join(' '), shuffle(rng, [...fresh, ...fresh, ...[...known].slice(0, 4)]).join('')]
  const words = [...new Set(pool.map((x) => bare(x.lemma)))].filter((w) => w.length >= 2 && w.length <= 8 && [...w].every((c) => known.has(c)))
  // favour words that use this lesson's new letters
  const withNew = words.filter((w) => fresh.some((c) => w.includes(c)))
  const chosen = shuffle(rng, withNew.length >= 12 ? withNew : words).slice(0, 24)
  const lines: string[] = [...warm]
  for (let i = 0; i < chosen.length; i += 4) lines.push(chosen.slice(i, i + 4).join(' '))
  // early lessons have few real words: pad with letter groups that favour the new keys
  const letters = [...known]
  const pickFrom = (xs: string[]) => xs[Math.floor(rng() * xs.length)]!
  const group = () => Array.from({ length: 3 + Math.floor(rng() * 2) }, () => pickFrom(rng() < 0.5 ? fresh : letters)).join('')
  while (lines.length < 6) lines.push([group(), group(), group(), group()].join(' '))
  return lines.filter(Boolean).slice(0, 8)
}

/** Words per minute (5 characters = 1 word) and accuracy for a finished line. */
export function score(chars: number, ms: number, errors: number) {
  const wpm = ms > 0 ? Math.round((chars / 5) / (ms / 60000)) : 0
  const accuracy = chars ? Math.max(0, (chars - errors) / chars) : 0
  return { wpm, accuracy }
}

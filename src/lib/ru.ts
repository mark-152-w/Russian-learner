// Russian text helpers. Mirrors tools/rulib.py — keep the two in sync.
//  * Primary stress: U+0301 after the vowel (а́); secondary: U+0300.
//  * ё is always written and counts as stressed.

export const ACUTE = '́'
export const GRAVE = '̀'
const VOWELS = new Set('аеёиоуыэюяАЕЁИОУЫЭЮЯ')

export const isVowel = (ch: string) => VOWELS.has(ch)

export function stripStress(s: string): string {
  return s.replace(/[́̀]/g, '')
}

/** Comparison key: no stress marks, lower case, ё → е. */
export function fold(s: string): string {
  return stripStress(s).toLowerCase().replace(/ё/g, 'е')
}

export function syllables(word: string): number {
  let n = 0
  for (const ch of word) if (VOWELS.has(ch)) n++
  return n
}

/** 0-based index (among vowels) of the primary stressed vowel, or null. */
export function stressIndex(word: string): number | null {
  let vi = -1
  const chars = [...word]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!
    if (!VOWELS.has(ch)) continue
    vi++
    if (ch === 'ё' || ch === 'Ё') return vi
    if (chars[i + 1] === ACUTE) return vi
  }
  return null
}

/** Display helper: hide stress marks (advanced reading mode) but never touch ё. */
export function displayStress(s: string, show: boolean): string {
  return show ? s : stripStress(s)
}

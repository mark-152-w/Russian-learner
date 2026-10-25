// Answer normalisation: what counts as "the same answer" when grading typed input.
//  - stress marks ignored, case-insensitive, ё ≡ е, surrounding/inner punctuation ignored, spaces collapsed
//  - Latin look-alike letters inside a Cyrillic word are mapped to Cyrillic (a mixed-layout slip, not an error)

const LOOKALIKES: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в',
}
const CYR = /[а-яё]/
const PUNCT = /[.,!?;:«»"“”„()[\]…—–/\\~]/g

function fixMixedScript(word: string): string {
  if (!CYR.test(word) || !/[a-z]/.test(word)) return word
  return [...word].map((ch) => LOOKALIKES[ch] ?? ch).join('')
}

export function normalizeAnswer(s: string): string {
  const base = s
    .normalize('NFD')
    .replace(/[\u0300\u0301]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(PUNCT, ' ')
    .replace(/(^|\s)-+|-+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return base.split(' ').map(fixMixedScript).join(' ')
}

/** Words of a normalised answer. */
export const words = (s: string) => normalizeAnswer(s).split(' ').filter(Boolean)

/** True if the learner wrote е where the accepted answer has ё (accepted, but worth a note). */
export function missedYo(raw: string, accepted: string): boolean {
  const a = accepted.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC').toLowerCase()
  const r = raw.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC').toLowerCase()
  return a.includes('ё') && !r.includes('ё')
}

/** Damerau–Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const A = [...a]
  const B = [...b]
  const d: number[][] = Array.from({ length: A.length + 1 }, (_, i) =>
    Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1)
      d[i]![j] = v
    }
  }
  return d[A.length]![B.length]!
}

/** Longest common prefix length. */
export function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

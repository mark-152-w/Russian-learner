// Phonetic transliteration input (fallback until the ЙЦУКЕН layout is learned).
// Longest match wins. Cyrillic typed directly passes through unchanged.

export const TRANSLIT_TABLE: [string, string][] = [
  ['shch', 'щ'], ['sch', 'щ'],
  ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'],
  ['yo', 'ё'], ['jo', 'ё'], ['yu', 'ю'], ['ju', 'ю'], ['ya', 'я'], ['ja', 'я'], ['eh', 'э'],
  ["''", 'ъ'], ['#', 'ъ'], ["'", 'ь'],
  ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'],
  ['j', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'],
  ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['x', 'х'], ['c', 'ц'], ['y', 'ы'],
  ['w', 'щ'],
]
const SORTED = [...TRANSLIT_TABLE].sort((a, b) => b[0].length - a[0].length)

export function translitToCyrillic(input: string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const rest = input.slice(i)
    const lower = rest.toLowerCase()
    const hit = SORTED.find(([lat]) => lower.startsWith(lat))
    if (!hit) {
      out += input[i]
      i++
      continue
    }
    const [lat, cyr] = hit
    const upper = rest[0] !== rest[0]!.toLowerCase()
    out += upper ? cyr.toUpperCase() : cyr
    i += lat.length
  }
  return out
}

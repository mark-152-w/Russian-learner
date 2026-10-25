// Typed, lazy access to the generated lexicon (src/data/lexicon/*.json, built by tools/ingest.py).
import type { Lexeme } from '../types/content.gen'
import slotsJson from '../data/lexicon/slots.json'

export type Pos = Lexeme['pos']
export type ChunkName = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | `X${number}`

/** One variant of a form cell. Only `usable` variants may be drilled or offered as answers. */
export interface FormVariant {
  form: string
  rare: boolean
  unverified: boolean
  usable: boolean
}

export const SLOTS = slotsJson as Record<Pos, string[]>

/** Decode a cell: "кни́ги|*кни́ги" → variants. '*' = rare/archaic, '?' = unverified. */
export function decodeCell(cell: string): FormVariant[] {
  if (!cell) return []
  return cell.split('|').map((raw) => {
    let s = raw
    let rare = false
    let unverified = false
    if (s.startsWith('*')) {
      rare = true
      s = s.slice(1)
    }
    if (s.startsWith('?')) {
      unverified = true
      s = s.slice(1)
    }
    return { form: s, rare, unverified, usable: !rare && !unverified }
  })
}

/** All variants for a slot of a lexeme (e.g. 'pl_gen'). */
export function formsOf(lx: Lexeme, slot: string): FormVariant[] {
  const i = SLOTS[lx.pos].indexOf(slot)
  if (i < 0 || !lx.forms) return []
  return decodeCell(lx.forms[i] ?? '')
}

/** The preferred drillable form for a slot, if any. */
export function primaryForm(lx: Lexeme, slot: string): string | undefined {
  return formsOf(lx, slot).find((v) => v.usable)?.form
}

const chunkLoaders = import.meta.glob<{ default: Lexeme[] }>('../data/lexicon/[ABCX][0-9].json')
const cache = new Map<string, Promise<Lexeme[]>>()

export function loadChunk(name: ChunkName): Promise<Lexeme[]> {
  let p = cache.get(name)
  if (!p) {
    const loader = chunkLoaders[`../data/lexicon/${name}.json`]
    if (!loader) return Promise.reject(new Error(`unknown lexicon chunk ${name}`))
    p = loader().then((m) => m.default)
    cache.set(name, p)
  }
  return p
}

export const CORE_CHUNKS: ChunkName[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

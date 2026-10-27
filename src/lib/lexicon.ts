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

export type IndexRow = [id: string, lemma: string, pos: Pos, rank: number, chunk: ChunkName, gloss: string]
let coreIndex: Promise<IndexRow[]> | null = null
let extIndex: Promise<IndexRow[]> | null = null

export function loadIndex(which: 'core' | 'ext'): Promise<IndexRow[]> {
  if (which === 'core') return (coreIndex ??= import('../data/lexicon/index-core.json').then((m) => m.default as IndexRow[]))
  return (extIndex ??= import('../data/lexicon/index-ext.json').then((m) => m.default as IndexRow[]))
}

// Rare-tail lexemes that hand-written content uses (tools/contenttail.py): small and precached, so stories and
// trainers don't fetch the tail's index and 3 MB chunks for a word or two, and keep working offline.
let contentTail: Promise<Map<string, Lexeme>> | null = null
const loadContentTail = () =>
  (contentTail ??= import('../data/content-tail.json').then((m) => new Map((m.default as Lexeme[]).map((x) => [x.id, x]))))

/** Load the given lexeme ids: core chunks first, then content's tail words, then the rare tail only if needed. */
export async function loadLexemes(ids: string[]): Promise<Map<string, Lexeme>> {
  const want = new Set(ids.filter((id) => !id.startsWith('name:')))
  const out = new Map<string, Lexeme>()
  if (!want.size) return out
  const chunks = new Set<ChunkName>()
  const rest = new Set(want)
  for (const r of await loadIndex('core')) if (rest.delete(r[0])) chunks.add(r[4])
  if (rest.size) {
    const tail = await loadContentTail()
    for (const id of [...rest]) {
      const x = tail.get(id)
      if (x) {
        out.set(id, x)
        rest.delete(id)
      }
    }
  }
  if (rest.size) for (const r of await loadIndex('ext')) if (rest.has(r[0])) chunks.add(r[4])
  for (const xs of await Promise.all([...chunks].map(loadChunk))) for (const x of xs) if (want.has(x.id)) out.set(x.id, x)
  return out
}

export const LEVELS: ChunkName[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** All ranked words up to and including a level. */
export async function poolUpTo(level: ChunkName): Promise<Lexeme[]> {
  const lv = LEVELS.slice(0, LEVELS.indexOf(level) + 1)
  return (await Promise.all(lv.map(loadChunk))).flat()
}

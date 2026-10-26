// Collectible cards: the index (names, rarities, art) is small and always loaded; blurbs load per set.
import { useLiveQuery } from 'dexie-react-hooks'
import type { CardSet } from '../types/content.gen'
import { db } from '../db/db'
import type { Tier } from '../rewards/chest'
import index from '../data/cards-index.json'

export interface CardMeta {
  id: string
  name: { ru: string; en: string }
  rarity: Tier
  art: { icon: string; hue: number }
  level: string
}
export interface SetMeta {
  id: string
  title: { ru: string; en: string }
  bonusXp: number
  file: string
  cards: CardMeta[]
}

export const CARD_SETS = index as SetMeta[]
const BY_ID = new Map(CARD_SETS.flatMap((s) => s.cards.map((c) => [c.id, { card: c, set: s }] as const)))
export const cardById = (id: string) => BY_ID.get(id)
export const CARD_COUNT = BY_ID.size

const files = import.meta.glob<{ default: CardSet }>('../data/content/cards/*.json')
export async function loadCardSet(file: string): Promise<CardSet | undefined> {
  return (await files[`../data/content/cards/${file}.json`]?.())?.default
}

export const useOwnedCards = (): Set<string> =>
  useLiveQuery(async () => new Set(((await db.kv.get('profile'))?.value as { cards?: string[] } | undefined)?.cards ?? []), [], new Set<string>())

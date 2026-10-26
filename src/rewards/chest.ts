// Сундук: end-of-session chest. Odds improve with session quality (accuracy, hard items), not volume.
import { pick, weighted, type Rng } from '../lib/rng'

export type Tier = 'common' | 'rare' | 'epic' | 'legendary'
export const TIERS: Tier[] = ['common', 'rare', 'epic', 'legendary']
export const TIER_RU: Record<Tier, string> = {
  common: 'Обы́чный',
  rare: 'Ре́дкий',
  epic: 'Эпи́ческий',
  legendary: 'Легенда́рный',
}

export type Loot =
  | { kind: 'xp'; amount: number }
  | { kind: 'freeze'; amount: number }
  | { kind: 'boost'; mult: number; minutes: number }
  | { kind: 'skin'; skin: string }
  | { kind: 'card'; card: string }

/** A collectible card not yet owned, as the chest sees it. */
export interface CardOption {
  id: string
  rarity: Tier
}
/** Chance that a chest of each tier holds a card (while there are cards left to find). */
export const CARD_CHANCE: Record<Tier, number> = { common: 0.2, rare: 0.45, epic: 0.8, legendary: 1 }

/** A card for a chest or milestone: rarer cards only from better chests, and same-tier cards most likely. */
export function pickCard(rng: Rng, options: CardOption[], tier: Tier): string | null {
  const t = TIERS.indexOf(tier)
  const ok = options.filter((c) => TIERS.indexOf(c.rarity) <= t)
  if (!ok.length) return null
  return ok[weighted(rng, ok.map((c) => (TIERS.indexOf(c.rarity) === t ? 3 : 1)))]!.id
}

export interface Skin {
  id: string
  ru: string
  en: string
}

/** Cosmetic themes (CSS variable sets in index.css, [data-skin=...]). */
export const SKINS: Skin[] = [
  { id: 'paper', ru: 'Бума́га', en: 'Paper (default)' },
  { id: 'birch', ru: 'Берёза', en: 'Birch' },
  { id: 'gzhel', ru: 'Гжель', en: 'Gzhel blue' },
  { id: 'khokhloma', ru: 'Хохлома́', en: 'Khokhloma' },
  { id: 'palekh', ru: 'Па́лех', en: 'Palekh lacquer' },
  { id: 'white-nights', ru: 'Бе́лые но́чи', en: 'White nights' },
]

export const MAX_FREEZES = 5
export const MIN_ANSWERS_FOR_CHEST = 8

export interface SessionStats {
  answered: number
  correct: number
  /** Answers on typed/production items or items above the learner's comfort level. */
  hard: number
}

/** 0..1. Accuracy matters most; hard items count; short sessions are discounted. */
export function sessionQuality(s: SessionStats): number {
  if (!s.answered) return 0
  const acc = s.correct / s.answered
  const hardShare = s.hard / s.answered
  const length = Math.min(1, s.answered / 20)
  return Math.max(0, Math.min(1, (acc * acc * 0.65 + hardShare * 0.35) * length))
}

export function tierWeights(q: number): number[] {
  return [60 * (1 - 0.6 * q), 28, 9 * (1 + 2 * q), 1.5 * (1 + 4 * q)]
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))

export function rollChest(q: number, rng: Rng, owned: { skins: string[]; freezes: number; cardOptions?: CardOption[] }, forceTier?: Tier) {
  const tier: Tier = forceTier ?? TIERS[weighted(rng, tierWeights(q))]!
  const loot: Loot[] = []
  const unowned = SKINS.filter((s) => !owned.skins.includes(s.id))
  const canFreeze = owned.freezes < MAX_FREEZES
  const skin = () => (unowned.length ? ({ kind: 'skin', skin: pick(rng, unowned).id } as const) : null)
  switch (tier) {
    case 'common':
      loot.push({ kind: 'xp', amount: int(rng, 20, 40) })
      break
    case 'rare':
      loot.push({ kind: 'xp', amount: int(rng, 50, 90) })
      if (canFreeze && rng() < 0.4) loot.push({ kind: 'freeze', amount: 1 })
      break
    case 'epic': {
      loot.push({ kind: 'xp', amount: int(rng, 120, 180) })
      loot.push({ kind: 'boost', mult: 1.5, minutes: 30 })
      const s = rng() < 0.35 ? skin() : null
      if (s) loot.push(s)
      else if (canFreeze) loot.push({ kind: 'freeze', amount: 1 })
      break
    }
    case 'legendary': {
      loot.push({ kind: 'xp', amount: 300 })
      const s = skin()
      if (s) loot.push(s)
      if (canFreeze) loot.push({ kind: 'freeze', amount: 1 })
      loot.push({ kind: 'boost', mult: 2, minutes: 30 })
      break
    }
  }
  if (owned.cardOptions?.length && rng() < CARD_CHANCE[tier]) {
    const card = pickCard(rng, owned.cardOptions, tier)
    if (card) loot.push({ kind: 'card', card })
  }
  return { tier, loot }
}

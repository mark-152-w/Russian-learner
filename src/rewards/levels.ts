// Levels from XP, and Russian rank titles.

export interface Rank {
  minLevel: number
  ru: string
  en: string
}

export const RANKS: Rank[] = [
  { minLevel: 1, ru: 'Тури́ст', en: 'Tourist' },
  { minLevel: 5, ru: 'Студе́нт', en: 'Student' },
  { minLevel: 10, ru: 'Собесе́дник', en: 'Conversationalist' },
  { minLevel: 18, ru: 'Знато́к', en: 'Connoisseur' },
  { minLevel: 28, ru: 'Писа́тель', en: 'Writer' },
  { minLevel: 40, ru: 'Кла́ссик', en: 'Classic' },
]

/** Cumulative XP needed to reach `level` (level 1 = 0 XP). */
export const xpForLevel = (level: number) => (level <= 1 ? 0 : Math.round(150 * (level - 1) ** 1.8))

export function rankFor(level: number): Rank {
  let r = RANKS[0]!
  for (const x of RANKS) if (level >= x.minLevel) r = x
  return r
}

export interface LevelInfo {
  level: number
  rank: Rank
  nextRank?: Rank
  /** XP earned inside the current level, and needed for the next. */
  into: number
  needed: number
  progress: number
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const lo = xpForLevel(level)
  const hi = xpForLevel(level + 1)
  const rank = rankFor(level)
  return {
    level,
    rank,
    nextRank: RANKS.find((r) => r.minLevel > level),
    into: xp - lo,
    needed: hi - lo,
    progress: (xp - lo) / (hi - lo),
  }
}

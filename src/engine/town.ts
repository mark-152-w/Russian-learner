// The town: one building per part of your learning. Each grows through five levels as that part grows, so the
// map is a picture of what you've done (and of what you haven't tried yet).
export interface Building {
  id: string
  ru: string
  en: string
  emblem: string
  color: string
  /** Metric name and the value needed for levels 1–5. */
  metric: string
  label: string
  levels: [number, number, number, number, number]
  to: string
}

export const BUILDINGS: Building[] = [
  { id: 'house', ru: 'Дом', en: 'Home', emblem: '🔥', color: '#b5653a', metric: 'streak', label: 'longest streak (days)', levels: [1, 3, 7, 30, 100], to: '/' },
  { id: 'post', ru: 'По́чта', en: 'Post office', emblem: '✉️', color: '#3f6fa8', metric: 'reviews', label: 'word reviews', levels: [10, 100, 400, 1000, 3000], to: '/review' },
  { id: 'market', ru: 'Ры́нок', en: 'Market', emblem: '🧺', color: '#c08a2b', metric: 'words', label: 'words known', levels: [100, 300, 750, 1500, 3000], to: '/review' },
  { id: 'school', ru: 'Шко́ла', en: 'School', emblem: '📐', color: '#8c3b3b', metric: 'units', label: 'course units completed', levels: [1, 3, 8, 14, 20], to: '/course' },
  { id: 'library', ru: 'Библиоте́ка', en: 'Library', emblem: '📚', color: '#5b4a8a', metric: 'stories', label: 'stories read', levels: [1, 5, 12, 25, 40], to: '/reader' },
  { id: 'theatre', ru: 'Теа́тр', en: 'Theatre', emblem: '🎭', color: '#a63d6b', metric: 'listening', label: 'perfect dictations', levels: [1, 5, 15, 40, 100], to: '/listening' },
  { id: 'station', ru: 'Вокза́л', en: 'Station', emblem: '🚂', color: '#4b6b4b', metric: 'trainers', label: 'trainer sessions', levels: [1, 5, 15, 40, 100], to: '/trainers' },
  { id: 'stadium', ru: 'Стадио́н', en: 'Stadium', emblem: '🏆', color: '#2f7f8a', metric: 'games', label: 'games played', levels: [1, 5, 15, 40, 100], to: '/games' },
  { id: 'fortress', ru: 'Кре́пость', en: 'Fortress', emblem: '⚔️', color: '#6b6f78', metric: 'bosses', label: 'bosses defeated', levels: [1, 3, 7, 12, 20], to: '/games' },
  { id: 'museum', ru: 'Музе́й', en: 'Museum', emblem: '🖼️', color: '#9a7b3c', metric: 'cards', label: 'cards collected', levels: [1, 4, 10, 20, 32], to: '/cards' },
]

export const MAX_LEVEL = 5

export interface BuildingState {
  building: Building
  value: number
  level: number
  /** Value needed for the next level, if any. */
  next?: number
}

export function levelFor(b: Building, value: number): number {
  return b.levels.filter((t) => value >= t).length
}

export function townState(metrics: Record<string, number>): BuildingState[] {
  return BUILDINGS.map((b) => {
    const value = metrics[b.metric] ?? 0
    const level = levelFor(b, value)
    return { building: b, value, level, next: b.levels[level] }
  })
}

/** Town rank by the sum of building levels (0–50). */
export const TOWN_RANKS: [number, string, string][] = [
  [0, 'Ху́тор', 'Hamlet'],
  [5, 'Дере́вня', 'Village'],
  [12, 'Село́', 'Large village'],
  [20, 'Посёлок', 'Settlement'],
  [30, 'Го́род', 'Town'],
  [42, 'Столи́ца', 'Capital'],
]
export const townRank = (total: number) => [...TOWN_RANKS].reverse().find(([min]) => total >= min)!

import { useLiveQuery } from 'dexie-react-hooks'
import { db, getKV, setKV } from './db'

export interface Settings {
  dailyGoalMinutes: number
  newCardsPerDay: number
  /** How much of what's learned to remember (FSRS's target retention, before the personal correction). */
  retention: number
  showStress: boolean
  translit: boolean
  ttsRate: number
  ttsVoice: string
  theme: 'system' | 'light' | 'dark'
  sound: boolean
  haptics: boolean
  reduceMotion: 'system' | 'on' | 'off'
  reminderTime: string
}

export const DEFAULT_SETTINGS: Settings = {
  dailyGoalMinutes: 20,
  newCardsPerDay: 10,
  retention: 0.9,
  showStress: true,
  translit: false,
  ttsRate: 0.9,
  ttsVoice: '',
  theme: 'system',
  sound: true,
  haptics: true,
  reduceMotion: 'system',
  reminderTime: '19:00',
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await getKV<Partial<Settings>>('settings', {})) }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await setKV('settings', { ...(await loadSettings()), ...patch })
}

export function useSettings(): Settings {
  return useLiveQuery(async () => ({ ...DEFAULT_SETTINGS, ...((await db.kv.get('settings'))?.value as Partial<Settings>) }), [], DEFAULT_SETTINGS)
}

/** Effective reduced-motion preference (setting overrides the OS). */
export function prefersReducedMotion(s: Settings): boolean {
  if (s.reduceMotion !== 'system') return s.reduceMotion === 'on'
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

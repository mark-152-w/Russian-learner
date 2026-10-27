// Leeches: words that keep being forgotten after they were learned. Drilling them the same way again isn't
// working, so the learner is asked for a memory hook instead (self-made mnemonics stick far better than ones
// handed over), and that hook comes back whenever the word is missed. Hooks live in kv as `hook:<lex>`.
import { db, getKV, setKV } from '../db/db'
import type { SrsCard } from './fsrs'

/** Lapses (across a word's vocabulary cards) that make it a leech. */
export const LEECH_LAPSES = 5
/** Further lapses before a leech is offered a rescue again. */
export const LEECH_AGAIN = 4
/** Rescues offered before one review session. */
export const RESCUES_PER_SESSION = 3

export const getHook = (lex: string) => getKV<string>(`hook:${lex}`, '')

export async function setHook(lex: string, text: string): Promise<void> {
  const t = text.trim()
  if (t) await setKV(`hook:${lex}`, t)
  else await db.kv.delete(`hook:${lex}`)
}

/** Times a word was forgotten after being learned: lapses summed over its vocabulary cards. */
export function wordLapses(cards: SrsCard[], lex: string): number {
  return cards.filter((c) => c.kind === 'vocab' && c.lex === lex).reduce((n, c) => n + c.lapses, 0)
}

/** A leech is due a rescue at LEECH_LAPSES, then again every LEECH_AGAIN lapses after the last offer. */
export const needsRescue = (lapses: number, offeredAt?: number) => lapses >= LEECH_LAPSES && (offeredAt === undefined || lapses >= offeredAt + LEECH_AGAIN)

/** Leeches among these due cards that are due a rescue, worst first. */
export async function leechesToRescue(due: SrsCard[], limit = RESCUES_PER_SESSION): Promise<{ lex: string; lapses: number }[]> {
  const lexes = [...new Set(due.filter((c) => c.kind === 'vocab').map((c) => c.lex))]
  const cards = await db.srs.where('lex').anyOf(lexes).toArray()
  const out: { lex: string; lapses: number }[] = []
  for (const lex of lexes) {
    const lapses = wordLapses(cards, lex)
    if (lapses < LEECH_LAPSES) continue
    if (needsRescue(lapses, await getKV<number | undefined>(`rescue:${lex}`, undefined))) out.push({ lex, lapses })
  }
  return out.sort((a, b) => b.lapses - a.lapses).slice(0, limit)
}

/** Remember that a rescue was offered at this many lapses (saved or skipped), so it doesn't nag. */
export const markRescued = (lex: string, lapses: number) => setKV(`rescue:${lex}`, lapses)

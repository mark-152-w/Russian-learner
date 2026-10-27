// What happens to a missed item within a session. By default it comes back once, at the end. Review sessions
// use successive relearning instead: the item returns a few items later, again and again until it's answered
// correctly (with a cap, so one stubborn card can't take over the session). The gap makes each return a real
// retrieval rather than a copy of the answer just shown. Guessing before a rule is taught never retries: there's
// nothing to retrieve yet.

export type RelearnMode = 'once' | 'until-correct' | 'never'

/** Items between a miss and its retry, in until-correct mode. */
export const RELEARN_GAP = 3
/** Retries per item, in until-correct mode. */
export const RELEARN_MAX = 3

/**
 * The queue after the item at `idx` was missed for the `misses`-th time (1 = first miss), or null when it
 * shouldn't come back. `again` turns the item into its retry (a guess comes back as a real question).
 */
export function requeueMissed<T>(queue: T[], idx: number, misses: number, mode: RelearnMode, again: (item: T) => T = (x) => x): T[] | null {
  const missed = queue[idx]
  if (missed === undefined) return null
  const item = again(missed)
  if (mode === 'never') return null
  if (mode === 'once') return misses === 1 && queue.length - idx > 2 ? [...queue, item] : null
  if (misses > RELEARN_MAX) return null
  const at = Math.min(idx + 1 + RELEARN_GAP, queue.length)
  return [...queue.slice(0, at), item, ...queue.slice(at)]
}

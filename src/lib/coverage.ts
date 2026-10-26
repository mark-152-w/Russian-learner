// "You now know N words: enough to recognise about X% of everyday Russian."
// X is computed honestly from the subtitle frequency data: each known word contributes the share of
// running text its frequency band accounts for (coverage.json samples the cumulative curve every 50 ranks).
import coverage from '../data/stats/coverage.json'

const curve = coverage.curve as [number, number][]

/** Share of all tokens covered by the single word at `rank` (average over its 50-rank bucket). */
export function marginalCoverage(rank: number): number {
  const i = curve.findIndex(([r]) => r >= rank)
  if (i < 0) return 0
  const [r1, c1] = curve[i]!
  const [r0, c0] = i > 0 ? curve[i - 1]! : [0, 0]
  return (c1 - c0) / Math.max(1, r1 - r0)
}

/** Estimated share of everyday spoken Russian (tokens) covered by the given known words. */
export function coverageOf(ranks: number[]): number {
  return Math.min(1, ranks.reduce((sum, r) => sum + marginalCoverage(r), 0))
}

/** Coverage if you knew the N most frequent words. */
export function coverageTopN(n: number): number {
  let best = 0
  for (const [r, c] of curve) if (r <= n) best = c
  return best
}

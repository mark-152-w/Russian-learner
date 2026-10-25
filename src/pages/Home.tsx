import meta from '../data/meta.json'
import coverage from '../data/stats/coverage.json'

function coverageAt(n: number): number {
  let best = 0
  for (const [i, c] of coverage.curve as [number, number][]) if (i <= n) best = c
  return best
}

export default function Home() {
  const levels = meta.levels as Record<string, number>
  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-serif text-3xl">An offline Russian course, A2 → C1</h1>
        <p className="mt-2 text-ink-soft">
          The dictionary is built: {meta.counts.lexemes.toLocaleString('en')} entries with stressed inflection
          tables, every form cross-checked by a morphological analyser.
        </p>
      </section>
      <section className="rounded-lg border border-line bg-paper-2 p-4">
        <h2 className="font-serif text-xl">Vocabulary by level</h2>
        <ul className="mt-2 grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lv) => (
            <li key={lv} className="rounded bg-paper p-2 text-center">
              <div className="font-bold text-red">{lv}</div>
              <div>{levels[lv]?.toLocaleString('en')}</div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg border border-line bg-paper-2 p-4">
        <h2 className="font-serif text-xl">How far words take you</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Share of words in everyday spoken Russian (film and TV subtitles) covered by the most frequent words.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {[500, 1000, 2000, 5000].map((n) => (
            <li key={n} className="flex items-center gap-3">
              <span className="w-24 text-right">{n.toLocaleString('en')} words</span>
              <span className="h-3 flex-1 overflow-hidden rounded bg-paper">
                <span className="block h-full bg-red" style={{ width: `${coverageAt(n) * 100}%` }} />
              </span>
              <span className="w-12">{Math.round(coverageAt(n) * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

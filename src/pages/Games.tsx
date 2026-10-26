// Games hub. Games award XP and feed the same learner model as everything else.
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

const GAMES = [
  { to: '/arcade', title: 'Case arcade', detail: 'Nouns fall with the word that governs them. Pick the right form before they land.' },
  { to: '/crossword', title: 'Declension crossword', detail: 'A daily puzzle where every answer is an inflected form, plus puzzles by topic.' },
]

export default function Games() {
  const best = useLiveQuery(async () => ((await db.kv.get('arcade:runs'))?.value as { score: number }[] | undefined)?.[0]?.score, [])
  return (
    <div className="space-y-3">
      <h1 className="font-serif text-3xl">Games</h1>
      {GAMES.map((g) => (
        <Link key={g.to} to={g.to} className="block rounded-xl border-2 border-line bg-paper-2 p-4 transition hover:border-red active:scale-[0.99]">
          <p className="font-bold">{g.title}</p>
          <p className="text-sm text-ink-soft">{g.detail}</p>
          {g.to === '/arcade' && best !== undefined && <p className="mt-1 text-xs text-red">Your best: {best} points</p>}
        </Link>
      ))}
    </div>
  )
}

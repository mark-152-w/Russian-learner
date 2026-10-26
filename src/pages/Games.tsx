// Games hub. Games award XP and feed the same learner model as everything else.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Unit } from '../types/content.gen'
import { db } from '../db/db'
import { loadUnits } from '../lib/content'
import { useBossRecords } from '../lib/bosses'
import { BossArt } from '../components/BossArt'
import { Card } from '../components/ui'

const GAMES = [
  { to: '/adventure', title: '«Де́ло»: a detective story', detail: 'Five chapters. Find the missing samovar; from chapter 3 you type the commands in Russian.' },
  { to: '/arcade', title: 'Case arcade', detail: 'Nouns fall with the word that governs them. Pick the right form before they land.' },
  { to: '/speed', title: 'Speed match', detail: 'Five Russian words, five meanings, one minute. Runs of matches score more.' },
  { to: '/crossword', title: 'Declension crossword', detail: 'A daily puzzle where every answer is an inflected form, plus puzzles by topic.' },
]

export default function Games() {
  const best = useLiveQuery(async () => {
    const [arcade, speed] = await Promise.all([db.kv.get('arcade:runs'), db.kv.get('speed:best')])
    return {
      '/arcade': (arcade?.value as { score: number }[] | undefined)?.[0]?.score,
      '/speed': (speed?.value as { score: number } | undefined)?.score,
    } as Record<string, number | undefined>
  }, [])
  const [units, setUnits] = useState<Unit[]>([])
  const bosses = useBossRecords()
  useEffect(() => void loadUnits().then(setUnits), [])
  const beaten = units.filter((u) => bosses[u.id]?.wins).length
  return (
    <div className="space-y-3">
      <h1 className="font-serif text-3xl">Games</h1>
      {GAMES.map((g) => (
        <Link key={g.to} to={g.to} className="block rounded-xl border-2 border-line bg-paper-2 p-4 transition hover:border-red active:scale-[0.99]">
          <p className="font-bold">{g.title}</p>
          <p className="text-sm text-ink-soft">{g.detail}</p>
          {best?.[g.to] !== undefined && <p className="mt-1 text-xs text-red">Your best: {best[g.to]} points</p>}
        </Link>
      ))}
      {units.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-xl">Unit bosses</h2>
            <span className="text-sm text-ink-soft">
              {beaten} / {units.length} defeated
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {units
              .filter((u) => u.boss)
              .map((u) => (
                <Link key={u.id} to={`/boss/${u.id}`} className="flex flex-col items-center rounded-lg p-1 text-center hover:bg-paper" title={u.boss!.name.en}>
                  <BossArt art={u.boss!.art} defeated={!!bosses[u.id]?.wins} className="h-14 w-14" />
                  <span className="text-xs text-ink-soft">Unit {u.number}</span>
                </Link>
              ))}
          </div>
          <p className="mt-2 text-xs text-ink-soft">Each boss draws on its unit, plus forms you've recently got wrong anywhere in the app.</p>
        </Card>
      )}
    </div>
  )
}

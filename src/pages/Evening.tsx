import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { loadLexemes, poolUpTo } from '../lib/lexicon'
import { asChunk, learnerLevel } from '../lib/learner'
import { mulberry32, shuffle } from '../lib/rng'
import { meaningItem } from '../engine/generators'
import { enRuItem } from '../engine/drills'
import { wordsAddedToday } from '../srs/deck'
import { SessionRunner } from '../components/SessionRunner'
import { Button, Card } from '../components/ui'

/**
 * Today's new words once more before bed (sleep consolidation: what's retrieved shortly before sleep is kept
 * better). Plain practice: the cards keep their own schedule, so this never moves a review date.
 */
export default function Evening() {
  const nav = useNavigate()
  const [built, setBuilt] = useState<{ items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const now = Date.now()
      const [ids, pool] = await Promise.all([wordsAddedToday(now), learnerLevel().then((lv) => poolUpTo(asChunk(lv)))])
      const words = await loadLexemes(ids)
      const lexemes = new Map<string, Lexeme>([...pool.map((x) => [x.id, x] as const), ...words])
      const rng = mulberry32(now)
      // recall in both directions: meaning from the word, and the word from its meaning
      const items = [...words.values()].flatMap((lx, i) => (i % 2 ? meaningItem(lx, pool, rng) ?? enRuItem(lx) : enRuItem(lx)))
      if (alive) setBuilt({ items: shuffle(rng, items), lexemes })
    })()
    return () => {
      alive = false
    }
  }, [])
  if (!built) return <p className="py-12 text-center text-ink-soft">Gathering today's words…</p>
  if (!built.items.length)
    return (
      <Card className="mx-auto max-w-md space-y-3 text-center">
        <h1 className="font-serif text-2xl">No new words today</h1>
        <p className="text-ink-soft">The evening review goes over the words you met today. Learn a few in Review first.</p>
        <Button onClick={() => nav('/review')}>Go to Review</Button>
      </Card>
    )
  return <SessionRunner items={built.items} lexemes={built.lexemes} kind="evening" relearn="until-correct" onDone={() => nav('/')} />
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { useRussianVoices } from '../audio/tts'
import { loadLexemes, poolUpTo } from '../lib/lexicon'
import { asChunk, getPlacement, learnerLevel } from '../lib/learner'
import { mulberry32 } from '../lib/rng'
import { sentencesUpTo } from '../lib/sentences'
import { cardToItem, DEFAULT_KNOWN_RANK, dueCards, introduceNewWords, recordReview, type DeckItem } from '../srs/deck'
import { retrievability } from '../srs/fsrs'
import { db } from '../db/db'
import { SessionRunner } from '../components/SessionRunner'
import { Button, Card } from '../components/ui'

const MAX_ITEMS = 40
const TYPED = new Set(['transform', 'cloze', 'dictation'])

interface Built {
  items: DeckItem[]
  lexemes: Map<string, Lexeme>
  recall: Map<string, number>
  nextDue: number | null
}

export default function Review() {
  const nav = useNavigate()
  const settings = useSettings()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [built, setBuilt] = useState<Built | null>(null)

  useEffect(() => {
    if (!ready) return
    let alive = true
    setBuilt(null)
    ;(async () => {
      const now = Date.now()
      const level = await learnerLevel()
      const pool = await poolUpTo(asChunk(level))
      const hasVoice = voices.length > 0
      await introduceNewWords(pool, settings.newCardsPerDay, now, hasVoice, (await getPlacement())?.knownRank ?? DEFAULT_KNOWN_RANK)
      const cards = await dueCards(now, MAX_ITEMS)
      const extra = await loadLexemes(cards.map((c) => c.lex))
      const lexemes = new Map<string, Lexeme>([...pool.map((x) => [x.id, x] as const), ...extra])
      const sentences = await sentencesUpTo(level === 'C1' ? 'C1' : level)
      const rng = mulberry32(now)
      const items = cards.map((c) => cardToItem(c, lexemes, sentences, rng, hasVoice)).filter((x): x is DeckItem => !!x)
      const recall = new Map(cards.map((c) => [`srs:${c.id}`, retrievability(c, now)]))
      const next = await db.srs.orderBy('due').filter((c) => c.due > now && !c.suspended).first()
      if (alive) setBuilt({ items, lexemes, recall, nextDue: next?.due ?? null })
    })()
    return () => {
      alive = false
    }
  }, [ready, round, voices.length, settings.newCardsPerDay])

  if (!built) return <p className="py-12 text-center text-ink-soft">Gathering your cards…</p>
  if (!built.items.length) {
    const when = built.nextDue ? new Date(built.nextDue) : null
    return (
      <Card className="mx-auto max-w-md space-y-3 text-center">
        <h1 className="font-serif text-2xl">All caught up</h1>
        <p className="text-ink-soft">
          No cards are due{when ? `. The next one comes back ${when.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}. You've also had
          today's {settings.newCardsPerDay} new words. Change the daily number in Settings.
        </p>
        <div className="flex justify-center gap-2">
          <Link to="/practice/full">
            <Button>Practise instead</Button>
          </Link>
          <Link to="/">
            <Button variant="secondary">Home</Button>
          </Link>
        </div>
      </Card>
    )
  }
  return (
    <SessionRunner
      key={round}
      items={built.items as ExerciseItem[]}
      lexemes={built.lexemes}
      kind="review"
      recallFor={(it) => built.recall.get(it.id) ?? null}
      onGraded={async (it, v, ms) => {
        const card = (it as DeckItem).card
        if (card) await recordReview(card, v, ms, TYPED.has(it.type), Date.now())
      }}
      onDone={() => nav('/')}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

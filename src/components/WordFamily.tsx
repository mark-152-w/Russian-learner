import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lexeme, RootFamily } from '../types/content.gen'
import { db } from '../db/db'
import { loadFamilies } from '../lib/content'
import { loadLexemes } from '../lib/lexicon'
import { gloss } from '../engine/generators'
import { knownLexemes } from '../srs/deck'
import { Md, Ru } from './Md'
import { Card } from './ui'

interface Loaded {
  family: RootFamily
  words: Lexeme[]
  known: Set<string>
  deck: Set<string>
}

/**
 * The word's family: its root, what the root means, and the other words built on it (✓ = known). Renders nothing
 * until loaded, or when the word has no family; `card` wraps it in a Card.
 */
export function WordFamily({ lex, compact, card }: { lex: string; compact?: boolean; card?: boolean }) {
  const [data, setData] = useState<Loaded | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const family = (await loadFamilies()).get(lex)
      if (!family) return
      const [words, known, deck] = await Promise.all([loadLexemes(family.lexemes), knownLexemes(), db.srs.orderBy('lex').uniqueKeys()])
      if (alive) setData({ family, words: family.lexemes.flatMap((id) => words.get(id) ?? []), known, deck: new Set(deck as string[]) })
    })()
    return () => {
      alive = false
    }
  }, [lex])
  if (!data) return null
  const { family, words, known, deck } = data
  const body = (
    <div className="space-y-2">
      <p className={compact ? 'text-sm' : ''}>
        <span className="font-bold">Word family:</span>{' '}
        <span className="ru font-bold text-red" lang="ru">
          {family.root}
        </span>{' '}
        <span className="text-ink-soft">({family.meaning})</span>
      </p>
      <ul className="flex flex-wrap gap-2">
        {words.map((w) => (
          <li key={w.id}>
            {w.id === lex ? (
              <span className="inline-block rounded-lg border-2 border-red bg-paper px-2 py-1">
                <Ru className="font-bold">{w.lemma}</Ru>
              </span>
            ) : (
              <Link to={`/word/${encodeURIComponent(w.id)}`} className="inline-block rounded-lg border border-line bg-paper px-2 py-1 hover:border-red">
                <Ru>{w.lemma}</Ru>
                {known.has(w.id) ? <span aria-label="known"> ✓</span> : deck.has(w.id) ? <span aria-label="in your deck"> ·</span> : null}
                {!compact && <span className="ml-1 text-xs text-ink-soft">{gloss(w)}</span>}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {family.note && !compact && <Md text={family.note} className="text-sm text-ink-soft" />}
    </div>
  )
  return card ? <Card>{body}</Card> : body
}

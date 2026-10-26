// The card collection: four sets of eight, found in chests and for milestones (a boss's first defeat, a completed
// unit). Each card has a short analysed text: tap any word for its meaning and form.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Lexeme, Token } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { speak, useRussianVoices } from '../audio/tts'
import { CARD_COUNT, CARD_SETS, cardById, loadCardSet, useOwnedCards } from '../lib/cards'
import { loadLexemes } from '../lib/lexicon'
import { sentenceText } from '../lib/stories'
import { CardFace } from '../components/CardFace'
import { TappableTokens, WordSheet } from '../components/Tappable'
import { Ru } from '../components/Md'
import { Bar, Button, Card, Icon } from '../components/ui'

export function CardsPage() {
  const owned = useOwnedCards()
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="font-serif text-3xl">Cards</h1>
        <p className="text-ink-soft">
          People, places, idioms and culture. Cards turn up in chests (better chests, rarer cards) and as rewards for a boss's first defeat or a completed unit. A full set
          pays bonus XP.
        </p>
        <Bar value={owned.size / CARD_COUNT} className="mt-3" color="bg-gold" />
        <p className="mt-1 text-sm text-ink-soft">
          {owned.size} / {CARD_COUNT} collected
        </p>
      </Card>
      {CARD_SETS.map((s) => {
        const have = s.cards.filter((c) => owned.has(c.id)).length
        return (
          <Card key={s.id}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-xl">
                <Ru>{s.title.ru}</Ru> <span className="text-base text-ink-soft">· {s.title.en}</span>
              </h2>
              <span className={`text-sm ${have === s.cards.length ? 'font-bold text-good' : 'text-ink-soft'}`}>
                {have} / {s.cards.length}
                {have === s.cards.length ? ' ✓' : ` · +${s.bonusXp} XP when complete`}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {s.cards.map((c) =>
                owned.has(c.id) ? (
                  <Link key={c.id} to={`/card/${c.id}`} className="transition active:scale-95">
                    <CardFace card={c} />
                  </Link>
                ) : (
                  <CardFace key={c.id} card={c} owned={false} />
                ),
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function CardPage() {
  const { id = '' } = useParams()
  const owned = useOwnedCards()
  const settings = useSettings()
  const { voices } = useRussianVoices()
  const found = cardById(id)
  const [blurb, setBlurb] = useState<{ sentences: { tokens: Token[]; en: string }[] } | null>(null)
  const [lexemes, setLexemes] = useState<Map<string, Lexeme>>(new Map())
  const [popup, setPopup] = useState<Token | null>(null)
  const [english, setEnglish] = useState(false)

  useEffect(() => {
    if (!found) return
    void loadCardSet(found.set.file).then(async (set) => {
      const b = set?.cards.find((c) => c.id === id)?.blurb
      if (!b) return
      setBlurb(b)
      setLexemes(await loadLexemes([...new Set(b.sentences.flatMap((s) => s.tokens.map((t) => t.lex).filter((l): l is string => !!l)))]))
    })
  }, [id, found])

  if (!found) return <p className="py-12 text-center text-ink-soft">No such card.</p>
  const { card, set } = found
  if (!owned.has(id))
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <CardFace card={card} owned={false} size="lg" />
        <p className="text-ink-soft">You haven't found this card yet.</p>
      </div>
    )
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link to="/cards" className="text-sm text-ink-soft underline">
        ← All cards
      </Link>
      <div className="flex justify-center">
        <CardFace card={card} size="lg" />
      </div>
      <p className="text-center text-sm text-ink-soft">
        <Ru>{set.title.ru}</Ru> · {card.level}
      </p>
      {blurb && (
        <Card className="space-y-3">
          {blurb.sentences.map((s, i) => (
            <p key={i} className="ru text-xl leading-loose" lang="ru">
              <TappableTokens tokens={s.tokens} onTap={setPopup} selected={popup} />
              {english && <span className="block font-sans text-sm text-ink-soft">{s.en}</span>}
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEnglish(!english)}>
              {english ? 'Hide English' : 'Show English'}
            </Button>
            {voices.length > 0 && (
              <Button variant="secondary" onClick={() => speak(blurb.sentences.map((s) => sentenceText(s.tokens)).join(' '), { rate: settings.ttsRate, voice: settings.ttsVoice })}>
                <Icon name="speaker" className="mr-1 inline h-4 w-4" /> Listen
              </Button>
            )}
          </div>
        </Card>
      )}
      {popup && <WordSheet tok={popup} lexeme={popup.lex ? lexemes.get(popup.lex) : undefined} onClose={() => setPopup(null)} hasVoice={voices.length > 0} />}
    </div>
  )
}

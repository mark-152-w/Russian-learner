// Analysed Russian text with tappable words (stories, card blurbs, the adventure) and the word sheet they open.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lexeme, Token } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { speak } from '../audio/tts'
import { displayStress } from '../lib/ru'
import { analysisLabel, isWord } from '../lib/stories'
import { addWord, inDeck, isCardWorthy } from '../srs/deck'
import { gloss as lexGloss } from '../engine/generators'
import { Ru } from './Md'
import { Button, Icon } from './ui'

export function WordSheet({ tok, lexeme, onClose, hasVoice }: { tok: Token; lexeme?: Lexeme; onClose: () => void; hasVoice: boolean }) {
  const s = useSettings()
  const [state, setState] = useState<'idle' | 'in' | 'added'>('idle')
  useEffect(() => {
    if (lexeme) void inDeck(lexeme.id).then((x) => x && setState('in'))
  }, [lexeme])
  const meaning = tok.gloss ?? (lexeme ? lexGloss(lexeme) : '')
  return (
    <div className="anim-rise fixed inset-x-0 bottom-0 z-40 border-t-4 border-red bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.15)]" role="dialog" aria-label="Word">
      <div className="mx-auto max-w-xl space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Ru className="text-3xl" stress>
              {tok.t}
            </Ru>
            {tok.lemma && tok.lemma.toLowerCase() !== tok.t.toLowerCase() && (
              <span className="ml-2 text-ink-soft">
                from <Ru className="font-bold text-ink" stress>{tok.lemma}</Ru>
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-soft">
            <Icon name="x" className="h-6 w-6" />
          </button>
        </div>
        {meaning && <p className="text-lg">{meaning}</p>}
        {tok.g && <p className="text-sm text-ink-soft">{analysisLabel(tok.g)}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {hasVoice && (
            <Button variant="secondary" onClick={() => speak(tok.t, { rate: s.ttsRate, voice: s.ttsVoice })}>
              <Icon name="speaker" className="mr-1 inline h-4 w-4" /> Listen
            </Button>
          )}
          {lexeme && isCardWorthy(lexeme) && (
            <Button
              variant="secondary"
              disabled={state !== 'idle'}
              onClick={async () => {
                await addWord(lexeme.id, Date.now(), hasVoice)
                setState('added')
              }}
            >
              {state === 'idle' ? 'Add to my deck' : state === 'added' ? 'Added ✓' : 'In your deck'}
            </Button>
          )}
          {lexeme && (
            <Link to={`/word/${encodeURIComponent(lexeme.id)}`}>
              <Button variant="secondary">All forms</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/** One analysed sentence; tapping a word calls onTap. */
export function TappableTokens({ tokens, onTap, selected }: { tokens: Token[]; onTap: (t: Token) => void; selected?: Token | null }) {
  const stress = useSettings().showStress
  return (
    <>
      {tokens.map((t, ti) => {
        const shown = displayStress(t.t, stress)
        const space = t.sp === false ? '' : ' '
        if (!isWord(t)) return <span key={ti}>{shown + space}</span>
        return (
          <span key={ti}>
            <button type="button" onClick={() => onTap(t)} className={`rounded px-0.5 hover:bg-red/10 ${selected === t ? 'bg-red/15' : ''}`}>
              {shown}
            </button>
            {space}
          </span>
        )
      })}
    </>
  )
}

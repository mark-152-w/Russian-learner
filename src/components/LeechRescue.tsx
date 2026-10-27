import { useState } from 'react'
import type { Lexeme, Sentence } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { speak } from '../audio/tts'
import { gloss } from '../engine/generators'
import { markRescued, setHook } from '../srs/leech'
import { ExampleList } from './ExampleList'
import { Ru } from './Md'
import { Button, Card, Icon } from './ui'

export interface Rescue {
  lx: Lexeme
  lapses: number
  hook: string
  example?: Sentence
  /** Words the learner mixes this one up with. */
  partners: Lexeme[]
}

/** Before a review: one screen per leech, asking for a memory hook. Saving or skipping both count as offered. */
export function LeechRescue({ rescues, onDone }: { rescues: Rescue[]; onDone: () => void }) {
  const settings = useSettings()
  const [i, setI] = useState(0)
  const [text, setText] = useState(rescues[0]?.hook ?? '')
  const r = rescues[i]!

  const advance = async (save: boolean) => {
    if (save) await setHook(r.lx.id, text)
    await markRescued(r.lx.id, r.lapses)
    if (i + 1 >= rescues.length) return onDone()
    setI(i + 1)
    setText(rescues[i + 1]!.hook)
  }

  return (
    <Card className="mx-auto max-w-xl space-y-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
          Word rescue{rescues.length > 1 ? ` · ${i + 1} of ${rescues.length}` : ''}
        </p>
        <h1 className="font-serif text-2xl">This word keeps slipping</h1>
        <p className="text-ink-soft">
          You've forgotten it {r.lapses} times after learning it. More of the same drilling won't fix that. A hook of your own will: it comes
          back whenever you miss the word.
        </p>
      </div>
      <div>
        <button type="button" onClick={() => speak(r.lx.lemma, { rate: settings.ttsRate, voice: settings.ttsVoice })} className="flex items-center gap-2" aria-label="Play">
          <Ru className="font-serif text-4xl">{r.lx.lemma}</Ru>
          <Icon name="speaker" className="h-6 w-6 text-red" />
        </button>
        <p className="mt-1 text-lg">{r.lx.en.join('; ')}</p>
      </div>
      {r.example && <ExampleList sentences={[r.example]} lex={r.lx.id} />}
      {r.partners.length > 0 && (
        <p className="text-sm">
          You also mix it up with{' '}
          {r.partners.map((p, k) => (
            <span key={p.id}>
              {k ? ', ' : ''}
              <Ru className="font-bold">{p.lemma}</Ru> ({gloss(p)})
            </span>
          ))}
          .
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="hook" className="font-bold">
          Your memory hook
        </label>
        <textarea
          id="hook"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-lg border-2 border-line bg-paper px-3 py-2 focus:border-red focus:outline-none"
          placeholder="A sound-alike and a picture…"
        />
        <details className="text-sm text-ink-soft">
          <summary className="cursor-pointer">How to make a hook that sticks</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Find an English word that sounds like part of the Russian one.</li>
            <li>Picture it doing what the word means. Strange, vivid and personal beats sensible.</li>
            <li>
              Example: <Ru className="font-bold">щека́</Ru> (cheek) sounds like "check-a". Picture a doctor checking your cheek with a magnifying glass.
            </li>
            <li>Words you mix up: give each its own picture, so they stop sharing one.</li>
          </ul>
        </details>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => advance(true)} disabled={!text.trim()} className="flex-1">
          Save hook
        </Button>
        <Button variant="secondary" onClick={() => advance(false)}>
          Not now
        </Button>
      </div>
    </Card>
  )
}

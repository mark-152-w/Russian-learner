// Idioms, everyday phrases, etiquette and customs: browse, listen, and practise their meanings.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSettings } from '../db/settings'
import { speak, useRussianVoices } from '../audio/tts'
import { idiomSession } from '../engine/idioms'
import { loadIdioms, type Idiom } from '../lib/content'
import { mulberry32 } from '../lib/rng'
import { fold } from '../lib/ru'
import { bumpStatsExternal } from '../rewards/service'
import { SessionRunner } from '../components/SessionRunner'
import { Md, Ru } from '../components/Md'
import { Button, Card, Icon } from '../components/ui'

const KINDS: { id: string; label: string }[] = [
  { id: 'idiom', label: 'Idioms and proverbs' },
  { id: 'colloquial', label: 'Everyday speech' },
  { id: 'etiquette', label: 'Etiquette' },
  { id: 'culture', label: 'Customs' },
  { id: 'slang', label: 'Slang' },
  { id: 'mat-explained', label: 'Mild swearing, explained' },
]

export function IdiomsPage() {
  const [all, setAll] = useState<Idiom[]>([])
  const [kind, setKind] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const settings = useSettings()
  const { voices } = useRussianVoices()
  useEffect(() => void loadIdioms().then(setAll), [])
  const shown = useMemo(() => {
    const needle = fold(q.trim())
    return all.filter((x) => (!kind || x.kind === kind) && (!needle || fold(x.ru).includes(needle) || x.meaning.toLowerCase().includes(needle)))
  }, [all, kind, q])
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h1 className="font-serif text-3xl">Idioms and culture</h1>
        <p className="text-ink-soft">
          {all.length} expressions Russians actually use, with what they mean, what they say word for word, and when to use them.
        </p>
        <Link to="/idioms/practice">
          <Button className="w-full">Practise 10 meanings</Button>
        </Link>
      </Card>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setKind(null)} className={`rounded-full border-2 px-3 py-1 text-sm ${!kind ? 'border-red bg-red text-paper' : 'border-line'}`}>
          All
        </button>
        {KINDS.filter((k) => all.some((x) => x.kind === k.id)).map((k) => (
          <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`rounded-full border-2 px-3 py-1 text-sm ${kind === k.id ? 'border-red bg-red text-paper' : 'border-line'}`}>
            {k.label}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search in Russian or English"
        aria-label="Search"
        className="w-full rounded-lg border-2 border-line bg-paper px-3 py-2 focus:border-red focus:outline-none"
      />
      <div className="space-y-3">
        {shown.map((x) => (
          <Card key={x.id} className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <Ru className="font-serif text-xl">{x.ru}</Ru>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-ink-soft">{x.level}</span>
                {voices.length > 0 && (
                  <button type="button" onClick={() => speak(x.ru, { rate: settings.ttsRate, voice: settings.ttsVoice })} aria-label="Listen" className="text-ink-soft hover:text-red">
                    <Icon name="speaker" className="h-5 w-5" />
                  </button>
                )}
              </span>
            </div>
            <p className="font-bold">{x.meaning}</p>
            {x.literal && <p className="text-sm italic text-ink-soft">Literally: {x.literal}</p>}
            {x.register && x.register !== 'neutral' && <span className="inline-block rounded bg-ink/10 px-1.5 text-xs">{x.register}</span>}
            {x.note && <Md text={x.note} className="text-sm" />}
            {x.examples?.map((e, i) => (
              <p key={i} className="border-l-4 border-line pl-2 text-sm">
                <Ru>{e.ru}</Ru>
                <span className="block text-ink-soft">{e.en}</span>
              </p>
            ))}
          </Card>
        ))}
        {!shown.length && all.length > 0 && <p className="text-center text-ink-soft">Nothing matches.</p>}
      </div>
    </div>
  )
}

export function IdiomsPractice() {
  const nav = useNavigate()
  const [round, setRound] = useState(0)
  const [all, setAll] = useState<Idiom[] | null>(null)
  useEffect(() => void loadIdioms().then(setAll), [])
  const items = useMemo(() => (all ? idiomSession(all, mulberry32(Date.now() + round)) : []), [all, round])
  if (!all) return <p className="py-12 text-center text-ink-soft">Loading…</p>
  return (
    <SessionRunner
      key={round}
      items={items}
      lexemes={new Map()}
      kind="idioms"
      onFinish={async (end) => void (await bumpStatsExternal({ idiomsCorrect: end.correct }))}
      onDone={() => nav('/idioms')}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

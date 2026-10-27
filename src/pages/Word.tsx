import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Lexeme, Sentence } from '../types/content.gen'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { speak, useRussianVoices } from '../audio/tts'
import { loadLexemes } from '../lib/lexicon'
import { examplesUpTo } from '../lib/sentences'
import { addWord, attemptsFor, wordState } from '../srs/deck'
import { confusionsOf } from '../srs/confusion'
import { getHook, setHook, wordLapses } from '../srs/leech'
import { State } from '../srs/fsrs'
import { isDrillable } from '../engine/generators'
import { NOUN_CLASS_LABEL, nounClass } from '../engine/sentenceGen'
import { FormTable } from '../components/FormTable'
import { ExampleList } from '../components/ExampleList'
import { Ru } from '../components/Md'
import { Button, Card, Icon } from '../components/ui'

const POS_NAME = { noun: 'noun', verb: 'verb', adj: 'adjective', other: 'word' }
const GENDER = { m: 'masculine', f: 'feminine', n: 'neuter', mf: 'common gender', pl: 'plural only' }

function MemoryHook({ lex }: { lex: string }) {
  const saved = useLiveQuery(() => getHook(lex), [lex])
  const [text, setText] = useState<string | null>(null)
  const mixed = useLiveQuery(async () => {
    const rows = await confusionsOf(lex)
    const lxs = await loadLexemes(rows.map((r) => r.lex))
    return rows.flatMap((r) => (lxs.has(r.lex) ? [{ lx: lxs.get(r.lex)!, n: r.n }] : []))
  }, [lex])
  const value = text ?? saved ?? ''
  return (
    <Card className="space-y-2">
      <h2 className="font-serif text-xl">Memory hook</h2>
      <p className="text-sm text-ink-soft">A sound-alike or a picture of your own. It shows whenever you miss this word.</p>
      <textarea
        aria-label="Memory hook"
        value={value}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full rounded-lg border-2 border-line bg-paper px-3 py-2 focus:border-red focus:outline-none"
      />
      <Button variant="secondary" disabled={text === null || text.trim() === (saved ?? '')} onClick={() => setHook(lex, value).then(() => setText(null))}>
        Save hook
      </Button>
      {!!mixed?.length && (
        <p className="text-sm">
          Often mixed up with{' '}
          {mixed.map(({ lx, n }, k) => (
            <span key={lx.id}>
              {k ? ', ' : ''}
              <Link to={`/word/${encodeURIComponent(lx.id)}`} className="text-red underline">
                <Ru>{lx.lemma}</Ru>
              </Link>{' '}
              ({n}×)
            </span>
          ))}
        </p>
      )}
    </Card>
  )
}

export default function Word() {
  const { id = '' } = useParams()
  const settings = useSettings()
  const { voices } = useRussianVoices()
  // undefined while loading; null if there's no such word; 'offline' if it's a rare word not downloaded yet
  const [lx, setLx] = useState<Lexeme | null | undefined | 'offline'>(undefined)
  const [examples, setExamples] = useState<Sentence[]>([])
  const [partners, setPartners] = useState<Lexeme[]>([])
  const state = useLiveQuery(() => wordState(id), [id])
  const history = useLiveQuery(async () => {
    const attempts = await attemptsFor(id)
    const m = await db.mastery.get(`lex:${id}`)
    return { attempts, mastery: m }
  }, [id])

  useEffect(() => {
    let alive = true
    setLx(undefined)
    setExamples([])
    setPartners([])
    void (async () => {
      const m = await loadLexemes([id]).catch(() => null)
      const x = m ? (m.get(id) ?? null) : 'offline'
      if (!alive) return
      setLx(x)
      if (!x || x === 'offline') return
      if (x.partners?.length) void loadLexemes(x.partners).then((m) => alive && setPartners([...m.values()]), () => {})
      const ex = await examplesUpTo(id, 'C1', 6).catch(() => [])
      if (alive) setExamples(ex)
    })()
    return () => {
      alive = false
    }
  }, [id])

  if (lx === undefined) return <p className="py-12 text-center text-ink-soft">Loading…</p>
  if (lx === null) return <p className="py-12 text-center text-ink-soft">No such word in the dictionary.</p>
  if (lx === 'offline')
    return <p className="py-12 text-center text-ink-soft">This rare word isn't saved on this device yet. Connect to the internet, or download the full dictionary in Settings.</p>

  const cls = lx.pos === 'noun' ? nounClass(lx) : null
  const attempts = history?.attempts ?? []
  const correct = attempts.filter((a) => a.correct).length
  const due = state?.cards.filter((c) => c.state !== State.New).map((c) => c.due).sort()[0]

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <button type="button" onClick={() => speak(lx.lemma, { rate: settings.ttsRate, voice: settings.ttsVoice })} className="flex items-center gap-2" aria-label="Play">
              <Ru className="font-serif text-4xl">{lx.lemma}</Ru>
              <Icon name="speaker" className="h-6 w-6 text-red" />
            </button>
            <p className="mt-1 text-ink-soft">
              {POS_NAME[lx.pos]}
              {lx.gender ? `, ${GENDER[lx.gender]}` : ''}
              {lx.animate ? ', animate' : ''}
              {lx.indeclinable ? ', indeclinable' : ''}
              {lx.aspect ? `, ${lx.aspect === 'pf' ? 'perfective' : lx.aspect === 'impf' ? 'imperfective' : 'both aspects'}` : ''}
            </p>
          </div>
          <div className="text-right text-sm text-ink-soft">
            {lx.rank ? (
              <>
                <div className="font-bold text-red">{lx.level}</div>
                <div>#{lx.rank.toLocaleString('en')} most frequent</div>
              </>
            ) : (
              <div>rare word</div>
            )}
          </div>
        </div>
        <ul className="mt-3 list-disc pl-5">
          {lx.en.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        {partners.length > 0 && (
          <p className="mt-2 text-sm">
            Aspect partner:{' '}
            {partners.map((p) => (
              <Link key={p.id} to={`/word/${encodeURIComponent(p.id)}`} className="mr-2 text-red underline">
                <Ru>{p.lemma}</Ru>
              </Link>
            ))}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {state && state.cards.length === 0 ? (
            <Button onClick={() => addWord(lx.id, Date.now(), voices.length > 0)}>Add to my deck</Button>
          ) : (
            <span className="rounded-lg bg-paper px-3 py-2 text-sm">
              {state?.known ? 'Known ✓' : 'In your deck'}
              {due ? ` · next review ${new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            </span>
          )}
          {isDrillable(lx) && (
            <Link to={`/drill/word/${encodeURIComponent(lx.id)}`}>
              <Button variant="secondary">Drill this word</Button>
            </Link>
          )}
          {cls && cls !== 'other' && (
            <Link to={`/drill/pattern/${cls}/pl_gen,pl_ins,pl_dat,sg_ins,sg_gen`}>
              <Button variant="secondary">Drill this pattern</Button>
            </Link>
          )}
        </div>
        {cls && cls !== 'other' && <p className="mt-2 text-xs text-ink-soft">Pattern: {NOUN_CLASS_LABEL[cls]}</p>}
      </Card>

      {lx.pos !== 'other' && (
        <Card>
          <FormTable lx={lx} />
        </Card>
      )}

      {examples.length > 0 && (
        <Card>
          <h2 className="mb-2 font-serif text-xl">Examples</h2>
          <ExampleList sentences={examples} lex={lx.id} />
        </Card>
      )}

      <MemoryHook key={lx.id} lex={lx.id} />

      <Card>
        <h2 className="font-serif text-xl">My history with this word</h2>
        {attempts.length ? (
          <p className="mt-1 text-sm">
            Seen {attempts.length} time{attempts.length === 1 ? '' : 's'}, {Math.round((100 * correct) / attempts.length)}% correct
            {history?.mastery ? ` · mastery ${Math.round(history.mastery.score * 100)}%` : ''}. Last seen{' '}
            {new Date(Math.max(...attempts.map((a) => a.ts))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">You haven't practised this word yet.</p>
        )}
        {state && wordLapses(state.cards, lx.id) > 0 && (
          <p className="mt-1 text-sm text-ink-soft">Forgotten after learning: {wordLapses(state.cards, lx.id)}×</p>
        )}
        {attempts.some((a) => !a.correct && a.err) && (
          <p className="mt-1 text-sm text-ink-soft">
            Mistakes: {[...new Set(attempts.filter((a) => a.err).map((a) => a.err))].join(', ')}
          </p>
        )}
      </Card>
    </div>
  )
}

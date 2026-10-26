// Graded reader: the library, a story with tappable words and sentence-by-sentence listening, and its
// comprehension questions. Dialogues (the listening section) use the same view with the transcript hidden.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Lexeme, Story, Token } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { russianVoices, speak, stopSpeaking, useRussianVoices } from '../audio/tts'
import { loadLexemes } from '../lib/lexicon'
import { usePlacement } from '../lib/learner'
import { displayStress } from '../lib/ru'
import { analysisLabel, defaultHelp, isWord, loadStory, recordStory, sentenceText, STORY_INDEX, useReaderProgress, type StoryMeta } from '../lib/stories'
import { addWord, inDeck, isCardWorthy } from '../srs/deck'
import { gloss as lexGloss } from '../engine/generators'
import { SessionRunner } from '../components/SessionRunner'
import { Ru } from '../components/Md'
import { Button, Card, Icon } from '../components/ui'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const KIND_LABEL: Record<string, string> = { story: 'Stories', nonfiction: 'Non-fiction', dialogue: 'Dialogues' }

function StoryRow({ s, done }: { s: StoryMeta; done: boolean }) {
  const to = s.kind === 'dialogue' ? `/dialogue/${s.id}` : `/story/${s.id}`
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-paper">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-good text-paper' : 'bg-paper'}`}>
          {done ? <Icon name="check" className="h-5 w-5" /> : s.chapter ?? '•'}
        </span>
        <span className="min-w-0 flex-1">
          <Ru className="block text-lg">{s.title.ru ?? ''}</Ru>
          <span className="block text-sm text-ink-soft">
            {s.title.en} · {s.words} words
          </span>
        </span>
      </Link>
    </li>
  )
}

/** The library: stories and non-fiction by level (or dialogues, for the listening section). */
export function Library({ kinds }: { kinds: Story['kind'][] }) {
  const progress = useReaderProgress()
  const placement = usePlacement()
  const [kind, setKind] = useState(kinds[0]!)
  const level = placement?.level ?? 'A2'
  const list = STORY_INDEX.filter((s) => s.kind === kind)
  const next = list.find((s) => !progress[s.id]?.read && LEVELS.indexOf(s.level) >= LEVELS.indexOf(level))
  return (
    <div className="space-y-4">
      {kinds.length > 1 && (
        <div className="flex gap-2">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${k === kind ? 'bg-red text-paper' : 'border border-line'}`}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {next && (
        <Link to={next.kind === 'dialogue' ? `/dialogue/${next.id}` : `/story/${next.id}`} className="flex items-center gap-3 rounded-xl bg-red px-5 py-4 text-paper shadow-md">
          <Icon name="book" className="h-8 w-8" />
          <span>
            <span className="block text-sm opacity-90">Up next · {next.level}</span>
            <Ru className="block text-xl font-bold">{next.title.ru ?? ''}</Ru>
          </span>
        </Link>
      )}
      {LEVELS.filter((lv) => list.some((s) => s.level === lv)).map((lv) => (
        <Card key={lv}>
          <h2 className="font-serif text-2xl text-red">{lv}</h2>
          <ul className="mt-2">
            {list
              .filter((s) => s.level === lv)
              .map((s) => (
                <StoryRow key={s.id} s={s} done={!!progress[s.id]?.read} />
              ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

export function ReaderPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Reader</h1>
      <p className="text-sm text-ink-soft">Tap any word for its meaning, dictionary form and grammar. Each text ends with a few questions.</p>
      <Library kinds={['story', 'nonfiction']} />
    </div>
  )
}

interface Popup {
  tok: Token
  si: number
}

function WordSheet({ tok, lexeme, onClose, hasVoice }: { tok: Token; lexeme?: Lexeme; onClose: () => void; hasVoice: boolean }) {
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

/** One story or dialogue. `listening`: the transcript starts hidden and speakers get different voices. */
export function StoryView({ listening = false }: { listening?: boolean }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const s = useSettings()
  const { voices } = useRussianVoices()
  const progress = useReaderProgress()
  const [story, setStory] = useState<Story | null>(null)
  const [lexemes, setLexemes] = useState<Map<string, Lexeme>>(new Map())
  const [stress, setStress] = useState(true)
  const [glosses, setGlosses] = useState(true)
  const [english, setEnglish] = useState(false)
  const [transcript, setTranscript] = useState(!listening)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [rate, setRate] = useState(1)
  const stop = useRef(false)

  useEffect(() => {
    let alive = true
    void loadStory(id).then(async (st) => {
      if (!alive || !st) return
      setStory(st)
      const help = defaultHelp(st.level)
      setStress(s.showStress && help)
      setGlosses(help)
      const ids = [...new Set(st.sentences.flatMap((x) => x.tokens.map((t) => t.lex).filter((l): l is string => !!l)))]
      const lx = await loadLexemes(ids)
      if (alive) setLexemes(lx)
    })
    return () => {
      alive = false
      stopSpeaking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const speakers = useMemo(() => [...new Set(story?.sentences.map((x) => x.speaker).filter(Boolean) ?? [])] as string[], [story])

  const playFrom = (i: number) => {
    if (!story) return
    stop.current = false
    const go = (k: number) => {
      if (stop.current || k >= story.sentences.length) return setPlaying(null)
      setPlaying(k)
      const sent = story.sentences[k]!
      const who = sent.speaker ? speakers.indexOf(sent.speaker) : 0
      const vs = russianVoices()
      const voice = who > 0 && vs.length > 1 ? vs[who % vs.length]!.voiceURI : s.ttsVoice
      const pitch = who > 0 && vs.length < 2 ? 1.25 : undefined
      speak(sentenceText(sent.tokens), { rate: s.ttsRate * rate, voice, pitch, onEnd: () => setTimeout(() => go(k + 1), 250) })
    }
    go(i)
  }
  const pause = () => {
    stop.current = true
    stopSpeaking()
    setPlaying(null)
  }

  if (!story) return <p className="py-12 text-center text-ink-soft">Opening…</p>
  const hasVoice = voices.length > 0
  const done = progress[story.id]?.read
  const paras: { para: boolean; i: number }[][] = []
  story.sentences.forEach((x, i) => {
    if (x.para || !paras.length) paras.push([])
    paras[paras.length - 1]!.push({ para: !!x.para, i })
  })

  return (
    <div className="space-y-4 pb-40">
      <Card>
        <Link to={listening ? '/listening' : '/reader'} className="text-sm text-red underline">
          {listening ? 'Listening' : 'Reader'}
        </Link>
        <p className="mt-1 text-sm font-bold text-red">
          {story.level}
          {story.chapter ? ` · Chapter ${story.chapter}` : ''}
          {story.kind === 'nonfiction' ? ' · Non-fiction' : ''}
        </p>
        <h1 className="font-serif text-3xl">
          <Ru stress={stress}>{story.title.ru ?? ''}</Ru>
        </h1>
        <p className="text-ink-soft">{story.title.en}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {hasVoice &&
            (playing === null ? (
              <Button onClick={() => playFrom(0)}>
                <Icon name="play" filled className="mr-1 inline h-4 w-4" /> Listen
              </Button>
            ) : (
              <Button onClick={pause}>Pause</Button>
            ))}
          {hasVoice && (
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded-lg border border-line bg-paper px-2" aria-label="Speed">
              {[0.6, 0.8, 1, 1.2].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          )}
          {transcript && (
            <>
              <Toggle on={stress} set={setStress} label="Stress" />
              <Toggle on={glosses} set={setGlosses} label="Glosses" />
              <Toggle on={english} set={setEnglish} label="English" />
            </>
          )}
          {!transcript && <Button variant="secondary" onClick={() => setTranscript(true)}>Show the transcript</Button>}
        </div>
        {listening && !hasVoice && <p className="mt-2 text-sm text-ink-soft">No Russian voice is installed, so read the transcript instead. Settings explains how to add one.</p>}
      </Card>

      {transcript ? (
        <Card className="space-y-4">
          {paras.map((p, pi) => (
            <p key={pi} className="ru text-xl leading-loose" lang="ru">
              {p.map(({ i }) => {
                const sent = story.sentences[i]!
                return (
                  <span key={i} className={playing === i ? 'rounded bg-gold/25' : ''}>
                    {sent.speaker && <b className="mr-1 text-red">{sent.speaker}:</b>}
                    {sent.tokens.map((t, ti) => {
                      const shown = displayStress(t.t, stress)
                      const space = t.sp === false ? '' : ' '
                      if (!isWord(t)) return <span key={ti}>{shown + space}</span>
                      const lx = t.lex ? lexemes.get(t.lex) : undefined
                      const g = glosses && t.rare ? t.gloss ?? (lx ? lexGloss(lx) : '') : ''
                      return (
                        <span key={ti}>
                          <button
                            type="button"
                            onClick={() => setPopup({ tok: t, si: i })}
                            className={`rounded px-0.5 hover:bg-red/10 ${popup?.tok === t ? 'bg-red/15' : ''} ${g ? 'underline decoration-dotted decoration-1 underline-offset-4' : ''}`}
                          >
                            {shown}
                          </button>
                          {g && <sup className="font-sans text-xs text-ink-soft"> {g.split(/[,;]/)[0]}</sup>}
                          {space}
                        </span>
                      )
                    })}
                    {english && <span className="block font-sans text-sm text-ink-soft">{sent.en}</span>}
                    {hasVoice && playing === null && (
                      <button type="button" onClick={() => playFrom(i)} className="mx-1 align-middle text-ink-soft hover:text-red" aria-label="Play from here">
                        <Icon name="speaker" className="inline h-4 w-4" />
                      </button>
                    )}
                  </span>
                )
              })}
            </p>
          ))}
        </Card>
      ) : (
        <Card className="text-center text-ink-soft">Listen first, then answer the questions. The transcript is here when you need it.</Card>
      )}

      {story.cliffhanger && transcript && <p className="text-center italic text-ink-soft">Next time: {story.cliffhanger}</p>}
      <div className="flex justify-center">
        {story.questions.length ? (
          <Button onClick={() => nav(listening ? `/dialogue/${story.id}/quiz` : `/story/${story.id}/quiz`)}>
            {done ? 'Answer the questions again' : `Answer ${story.questions.length} questions`}
          </Button>
        ) : (
          !done && <Button onClick={() => void recordStory(story.id, 1, Date.now(), story.kind)}>Mark as read</Button>
        )}
      </div>
      {popup && <WordSheet tok={popup.tok} lexeme={popup.tok.lex ? lexemes.get(popup.tok.lex) : undefined} onClose={() => setPopup(null)} hasVoice={hasVoice} />}
    </div>
  )
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => set(!on)} aria-pressed={on} className={`rounded-lg border px-3 py-1.5 ${on ? 'border-red bg-red/10 font-bold text-red' : 'border-line text-ink-soft'}`}>
      {label}
    </button>
  )
}

export function StoryQuiz({ listening = false }: { listening?: boolean }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [story, setStory] = useState<Story | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => void loadStory(id).then(setStory), [id])
  if (!story) return <p className="py-12 text-center text-ink-soft">Opening…</p>
  const back = listening ? `/dialogue/${id}` : `/story/${id}`
  return (
    <SessionRunner
      key={round}
      items={story.questions}
      lexemes={new Map()}
      kind={listening ? 'dialogue' : 'story'}
      onFinish={(end) => recordStory(story.id, end.accuracy, Date.now(), story.kind)}
      onDone={() => nav(listening ? '/listening' : '/reader')}
      onAgain={() => (setRound((r) => r + 1), nav(back))}
    />
  )
}

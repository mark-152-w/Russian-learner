// «Де́ло»: a detective story in five chapters. Chapters 1–2 are choices (some gated by a grammar question);
// from chapter 3 you type commands, and the parser explains a wrong case or preposition.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { AdventureChapter, ExerciseItem } from '../types/content.gen'
import { sound } from '../audio/sound'
import { haptic } from '../audio/haptics'
import { grade, type Verdict } from '../engine/grader'
import { availableChoices, CASE_EN, parse, worldFor, type Graded, type World } from '../engine/adventure'
import { getAdventure, isOpen, loadChapters, saveAdventure, useAdventure, type AdventureProgress } from '../lib/adventure'
import { awardCard, bumpStatsExternal, RewardSession, type SessionEnd } from '../rewards/service'
import { ExerciseView } from '../components/exercises'
import { NewCard } from '../components/CardFace'
import { SessionSummary } from '../components/SessionSummary'
import { Md, Ru } from '../components/Md'
import { Button, Card, Icon } from '../components/ui'

export function AdventureHub() {
  const [chapters, setChapters] = useState<AdventureChapter[]>([])
  const progress = useAdventure()
  useEffect(() => void loadChapters().then(setChapters), [])
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="space-y-2">
        <h1 className="font-serif text-3xl">
          <Ru>«Де́ло»</Ru> <span className="text-ink-soft">· The case</span>
        </h1>
        <p>
          The town museum's two-hundred-year-old samovar has vanished overnight, and you're the detective. Chapters 1 and 2 are choices; from chapter 3 you type commands in
          Russian (<Ru>иди́ в сара́й</Ru>, <Ru>возьми́ ключ</Ru>), and a wrong case or preposition gets explained.
        </p>
      </Card>
      {chapters.map((c) => {
        const open = isOpen(c.chapter, progress)
        const done = progress.done.includes(c.chapter)
        const body = (
          <Card className={`flex items-center gap-3 ${open ? 'transition hover:border-red' : 'border-dashed text-ink-soft'}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${done ? 'bg-good text-paper' : open ? 'bg-red text-paper' : 'bg-line'}`}>
              {done ? <Icon name="check" className="h-5 w-5" /> : c.chapter}
            </span>
            <span className="min-w-0 flex-1">
              <Ru className="block font-serif text-lg">{c.title.ru ?? ''}</Ru>
              <span className="text-sm text-ink-soft">
                {c.title.en} · {c.level} · {c.parser ? 'typed commands' : 'choices'}
                {!open && ' · finish the chapter before'}
              </span>
            </span>
          </Card>
        )
        return open ? (
          <Link key={c.id} to={`/adventure/${c.chapter}`} className="block">
            {body}
          </Link>
        ) : (
          <div key={c.id}>{body}</div>
        )
      })}
    </div>
  )
}

type Entry = { t: 'scene'; ru: string; en?: string } | { t: 'you'; text: string } | { t: 'resp'; ru: string; en?: string } | { t: 'note'; en: string; tone: 'bad' | 'info' | 'ok' }

function patternOf(v: World['verbs'][number]): string {
  const part = (s?: { case?: string; preposition?: string }) => (s ? `${s.preposition ? `${s.preposition} + ` : ''}${CASE_EN[s.case as keyof typeof CASE_EN]}` : '')
  return v.action === 'go' ? 'в/на + accusative, к + dative (where to?)' : [part(v.object), part(v.topic)].filter(Boolean).join(' + ') // ru-ignore
}

export function AdventurePlay() {
  const { n = '1' } = useParams()
  // a fresh play state (and reward session) for each chapter
  return <ChapterPlay key={n} num={Number(n)} />
}

function ChapterPlay({ num }: { num: number }) {
  const nav = useNavigate()
  const [chapter, setChapter] = useState<AdventureChapter | null>(null)
  const [world, setWorld] = useState<World | null>(null)
  const [scene, setScene] = useState('')
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [english, setEnglish] = useState(false)
  const [check, setCheck] = useState<{ item: ExerciseItem; to: string; sets: string[]; verdict: Verdict | null } | null>(null)
  const [finished, setFinished] = useState<{ card: string | null; first: boolean } | null>(null)
  const [end, setEnd] = useState<SessionEnd | null>(null)
  const session = useRef<RewardSession>(new RewardSession('adventure', Date.now()))
  const bottom = useRef<HTMLDivElement>(null)
  const typed = useRef(0)
  const closed = useRef(false)
  /** Finish the reward session once (leaving the page also finishes it). */
  const finishOnce = async () => {
    if (closed.current) return null
    const e = await session.current.finish(Date.now())
    if (e) closed.current = true
    return e
  }

  useEffect(() => {
    void loadChapters().then(async (cs) => {
      const c = cs.find((x) => x.chapter === num)
      const p = await getAdventure()
      if (!c || !isOpen(num, p)) return void nav('/adventure')
      let at = p.at[num] ?? c.start
      if (c.scenes[at]?.end) at = c.start // replaying a finished chapter
      setChapter(c)
      setWorld(worldFor(cs, num))
      setScene(at)
      setFlags(new Set(p.flags))
      setEnglish(c.level === 'A2')
      setLog([{ t: 'scene', ru: c.scenes[at]!.text, en: c.scenes[at]!.en }])
    })
    return () => void finishOnce()
  }, [num, nav])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [log, check, finished])

  if (!chapter || !world) return <p className="py-12 text-center text-ink-soft">Opening the case file…</p>
  const sc = chapter.scenes[scene]!

  const report = (item: ExerciseItem, verdict: Verdict) =>
    void session.current.answer({ item, verdict, ms: Date.now() - typed.current, golden: false, lexeme: undefined, recall: null, now: Date.now() })

  const reportGraded = (g: Graded) =>
    report(
      { id: `adv:${num}:${g.key}`, type: 'transform', level: chapter.level, tags: [g.tag], source: 'handwritten', prompt: { instruction: 'Command' }, accept: [g.expected] },
      { correct: g.correct, expected: g.expected },
    )

  const move = async (to: string, sets: string[], response?: { ru: string; en?: string }, extra: Entry[] = []) => {
    const nf = new Set(flags)
    sets.forEach((f) => nf.add(f))
    setFlags(nf)
    const entries: Entry[] = [...extra]
    if (response) entries.push({ t: 'resp', ru: response.ru, en: response.en })
    const target = chapter.scenes[to]!
    if (to !== scene) entries.push({ t: 'scene', ru: target.text, en: target.en })
    setLog((l) => [...l, ...entries])
    setScene(to)
    const p = await getAdventure()
    const next: AdventureProgress = { ...p, at: { ...p.at, [num]: to }, flags: [...nf] }
    if (target.end && !p.done.includes(num)) next.done = [...p.done, num]
    await saveAdventure(next)
    if (target.end) {
      sound.levelUp()
      const first = !p.done.includes(num)
      let card: string | null = null
      if (first) {
        await bumpStatsExternal({ adventureChapters: 1 })
        card = (await awardCard(Date.now(), 'epic'))?.card ?? null
      }
      setFinished({ card, first })
    }
  }

  const submit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    const o = parse(text, sc, scene, world, flags)
    const you: Entry = { t: 'you', text }
    if (o.kind === 'help') {
      const verbs = world.verbs.map((v) => `- **${v.forms[0]}**: ${patternOf(v)}`).join('\n')
      const exits = Object.keys(sc.exits ?? {})
      setLog((l) => [...l, you, { t: 'note', tone: 'info', en: `Verbs:\n${verbs}${exits.length ? `\n\nFrom here: ${exits.map((e) => `**иди́ ${e}**`).join(', ')}` : ''}` }])
    } else if (o.kind === 'look') setLog((l) => [...l, you, { t: 'scene', ru: sc.text, en: sc.en }])
    else if (o.kind === 'say') {
      if (o.grammar) reportGraded(o.grammar)
      setLog((l) => [...l, you, { t: 'note', tone: o.ok ? 'ok' : 'info', en: o.en }])
    } else if (o.kind === 'grammar') {
      reportGraded(o.graded)
      sound.wrong()
      haptic.wrong()
      setLog((l) => [...l, you, { t: 'note', tone: 'bad', en: o.en }])
    } else {
      if (o.grammar) {
        reportGraded(o.grammar)
        sound.correct(1)
      }
      void move(o.to, o.sets, o.response, [you])
    }
    typed.current = Date.now()
  }

  const choose = (c: NonNullable<typeof sc.choices>[number]) => {
    typed.current = Date.now()
    if (c.check) return setCheck({ item: c.check, to: c.to, sets: c.sets ?? [], verdict: null })
    void move(c.to, c.sets ?? [], undefined, [{ t: 'you', text: c.text }])
  }

  if (end) return <SessionSummary end={end} onDone={() => nav('/adventure')} onAgain={finished && num < 5 ? () => nav(`/adventure/${num + 1}`) : undefined} />

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-24">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => nav('/adventure')} className="text-ink-soft hover:text-red" aria-label="Back to the chapters">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <h1 className="flex-1 font-serif text-xl">
          {chapter.chapter}. <Ru>{chapter.title.ru ?? ''}</Ru>
        </h1>
        <button type="button" onClick={() => setEnglish(!english)} className="rounded border border-line px-2 py-1 text-xs">
          {english ? 'Hide English' : 'English'}
        </button>
      </div>

      <div className="space-y-3">
        {log.map((e, i) =>
          e.t === 'scene' ? (
            <Card key={i} className="anim-rise">
              <Ru className="block text-lg leading-relaxed">{e.ru}</Ru>
              {english && e.en && <p className="mt-1 text-sm text-ink-soft">{e.en}</p>}
            </Card>
          ) : e.t === 'you' ? (
            <p key={i} className="text-right">
              <span className="ru inline-block rounded-xl bg-red px-3 py-1 text-paper" lang="ru">
                {e.text}
              </span>
            </p>
          ) : e.t === 'resp' ? (
            <div key={i} className="anim-rise rounded-xl border-l-4 border-gold bg-paper-2 px-3 py-2">
              <Ru className="block">{e.ru}</Ru>
              {english && e.en && <p className="text-sm text-ink-soft">{e.en}</p>}
            </div>
          ) : (
            <div key={i} className={`anim-rise rounded-xl border px-3 py-2 text-sm ${e.tone === 'bad' ? 'border-bad' : e.tone === 'ok' ? 'border-good' : 'border-line'}`}>
              <Md text={e.en} />
            </div>
          ),
        )}
      </div>

      {check && (
        <Card className="space-y-3 border-red">
          <ExerciseView
            key={check.item.id + (check.verdict ? 'v' : '')}
            item={check.item}
            verdict={check.verdict}
            onSubmit={(r) => {
              const v = grade(check.item, r, {})
              report(check.item, v)
              if (v.correct) sound.correct(1)
              else sound.wrong()
              setCheck({ ...check, verdict: v })
            }}
          />
          {check.verdict && (
            <>
              {!check.verdict.correct && <Md text={check.verdict.reason ?? check.item.reason ?? ''} className="text-sm" />}
              <Button
                className="w-full"
                onClick={() => {
                  if (check.verdict!.correct) {
                    const c = check
                    setCheck(null)
                    void move(c.to, c.sets, undefined, [{ t: 'you', text: c.verdict!.expected }])
                  } else setCheck({ ...check, verdict: null })
                }}
              >
                {check.verdict.correct ? 'Continue' : 'Try again'}
              </Button>
            </>
          )}
        </Card>
      )}

      {finished ? (
        <Card className="space-y-3 border-good text-center">
          <p className="font-serif text-2xl">{num === 5 ? <Ru>Де́ло закры́то!</Ru> : `Chapter ${num} complete`}</p>
          {chapter.cliffhanger && <p className="italic text-ink-soft">Next: {chapter.cliffhanger}</p>}
          {finished.card && <NewCard id={finished.card} />}
          <Button className="w-full" onClick={() => void finishOnce().then((e) => (e ? setEnd(e) : nav(num < 5 ? `/adventure/${num + 1}` : '/adventure')))}>
            {num < 5 ? 'On to the next chapter' : 'Back to the case file'}
          </Button>
        </Card>
      ) : chapter.parser ? (
        <div className="space-y-2">
          {sc.hint && <p className="text-sm text-ink-soft">{sc.hint}</p>}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              lang="ru"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="осмотри́ дверь"
              aria-label="Command"
              className="ru min-w-0 flex-1 rounded-lg border-2 border-line bg-paper px-3 py-2 text-lg focus:border-red focus:outline-none"
            />
            <Button type="submit">Go</Button>
          </form>
          <div className="flex flex-wrap gap-1">
            {[...world.verbs.map((v) => v.forms[0]!), 'по́мощь'].map((w) => (
              <button key={w} type="button" onClick={() => setInput(w === 'по́мощь' ? w : `${w} `)} className="ru rounded-full border border-line px-2 py-0.5 text-sm hover:border-red" lang="ru">
                {w}
              </button>
            ))}
          </div>
        </div>
      ) : (
        !check && (
          <div className="grid gap-2">
            {availableChoices(sc, flags).map(({ choice, open }) => (
              <button
                key={choice.text}
                type="button"
                disabled={!open}
                onClick={() => choose(choice)}
                className="rounded-xl border-2 border-line bg-paper px-4 py-3 text-left transition hover:border-red disabled:opacity-50"
              >
                <Ru className="block text-lg">{choice.text}</Ru>
                {(english || !open) && choice.en && <span className="text-sm text-ink-soft">{choice.en}</span>}
              </button>
            ))}
          </div>
        )
      )}
      <div ref={bottom} />
    </div>
  )
}

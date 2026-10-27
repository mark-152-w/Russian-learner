import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ExerciseItem, GrammarArticle, Lexeme, Unit } from '../types/content.gen'
import { useRussianVoices } from '../audio/tts'
import { loadGrammar, loadUnits } from '../lib/content'
import { checkpointItems, GUESS_ITEMS, guessItems, lessonItems, nextUnit, PASS_MARK, recordCheckpoint, recordLesson, useCourseProgress } from '../lib/course'
import { getKV, setKV } from '../db/db'
import { buildDrillContext } from '../lib/drillContext'
import { loadLexemes } from '../lib/lexicon'
import { usePlacement } from '../lib/learner'
import { queueWords } from '../srs/deck'
import { gloss } from '../engine/generators'
import { SessionRunner } from '../components/SessionRunner'
import { Md, Ru } from '../components/Md'
import { Bar, Button, Card, Icon } from '../components/ui'
import { BossArt } from '../components/BossArt'
import { NewCard } from '../components/CardFace'
import { useBossRecords } from '../lib/bosses'

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** Test-out is offered when the placement test put the learner above the unit's level. */
function canTestOut(unit: Unit, placed?: string): boolean {
  return !!placed && LEVEL_ORDER.indexOf(placed) > LEVEL_ORDER.indexOf(unit.level)
}

export function CoursePage() {
  const [units, setUnits] = useState<Unit[]>([])
  const progress = useCourseProgress()
  const placement = usePlacement()
  useEffect(() => void loadUnits().then(setUnits), [])
  const next = nextUnit(units, progress)
  const levels = LEVEL_ORDER.filter((l) => units.some((u) => u.level === l))
  return (
    <div className="space-y-4">
      {!placement && (
        <Card className="flex items-center justify-between gap-3">
          <span>Not sure where to start? The placement test finds your level and lets you test out of units you already know.</span>
          <Link to="/placement">
            <Button>Take the test</Button>
          </Link>
        </Card>
      )}
      {levels.map((lv) => {
        const us = units.filter((u) => u.level === lv)
        const done = us.filter((u) => progress[u.id]?.completed).length
        return (
          <Card key={lv}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-2xl text-red">{lv}</h2>
              <span className="text-sm text-ink-soft">
                {done} / {us.length} units
              </span>
            </div>
            <Bar value={done / us.length} className="mt-2" color="bg-good" />
            <ol className="mt-3 space-y-1">
              {us.map((u) => {
                const p = progress[u.id]
                const isNext = next?.id === u.id
                return (
                  <li key={u.id}>
                    <Link to={`/unit/${u.id}`} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isNext ? 'bg-red text-paper' : 'hover:bg-paper'}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${p?.completed ? 'bg-good text-paper' : isNext ? 'bg-paper text-red' : 'bg-paper'}`}>
                        {p?.completed ? <Icon name="check" className="h-5 w-5" /> : u.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{u.title.en}</span>
                        <Ru className={`text-sm ${isNext ? '' : 'text-ink-soft'}`}>{u.title.ru ?? ''}</Ru>
                      </span>
                      {!p?.completed && canTestOut(u, placement?.level) && <span className="text-xs">test-out</span>}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </Card>
        )
      })}
    </div>
  )
}

export function UnitPage() {
  const { id } = useParams()
  const [unit, setUnit] = useState<Unit | null>(null)
  const [grammar, setGrammar] = useState<GrammarArticle[]>([])
  const [words, setWords] = useState<Lexeme[]>([])
  const [queued, setQueued] = useState(false)
  // before the first lesson, the rule stays folded until the learner has guessed (or skipped guessing)
  const [guessed, setGuessed] = useState<boolean | null>(null)
  const progress = useCourseProgress()
  const placement = usePlacement()
  const bosses = useBossRecords()
  useEffect(() => {
    void loadUnits().then(async (us) => {
      const u = us.find((x) => x.id === id) ?? null
      setUnit(u)
      if (!u) return
      setGuessed(await getKV(`guessed:${u.id}`, false))
      const g = await loadGrammar()
      setGrammar(u.grammar.map((gid) => g.find((a) => a.id === gid)).filter((a): a is GrammarArticle => !!a))
      const lx = await loadLexemes(u.vocab)
      setWords(u.vocab.map((v) => lx.get(v)).filter((x): x is Lexeme => !!x))
    })
  }, [id])
  if (!unit) return <p className="py-12 text-center text-ink-soft">Loading…</p>
  const p = progress[unit.id]
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm font-bold text-red">
          {unit.level} · Unit {unit.number}
        </p>
        <h1 className="font-serif text-3xl">{unit.title.en}</h1>
        {unit.title.ru && <Ru className="text-xl text-ink-soft">{unit.title.ru}</Ru>}
        {p?.completed && <p className="mt-2 font-bold text-good">Completed{p.testedOut ? ' (tested out)' : ''} · best {Math.round(p.best * 100)}%</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/lesson/${unit.id}/lesson`}>
            <Button>{p?.lessons ? 'Practise again' : 'Start the lesson'}</Button>
          </Link>
          <Link to={`/lesson/${unit.id}/check`}>
            <Button variant="secondary">Unit checkpoint</Button>
          </Link>
          {!p?.completed && canTestOut(unit, placement?.level) && (
            <Link to={`/lesson/${unit.id}/testout`}>
              <Button variant="secondary">Test out</Button>
            </Link>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-soft">Score {Math.round(PASS_MARK * 100)}% or more in the checkpoint to complete the unit.</p>
      </Card>

      {unit.boss && (
        <Link to={`/boss/${unit.id}`} className="block">
          <Card className="flex items-center gap-3 transition hover:border-red">
            <BossArt art={unit.boss.art} defeated={!!bosses[unit.id]?.wins} className="h-16 w-16 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-red">Unit boss · {unit.boss.hp} HP</span>
              <Ru className="font-serif text-lg">{unit.boss.name.ru ?? ''}</Ru>
              <span className="block text-sm text-ink-soft">{bosses[unit.id]?.wins ? `Defeated ${bosses[unit.id]!.wins}×. Fight again?` : 'Beat it with what this unit teaches.'}</span>
            </span>
          </Card>
        </Link>
      )}

      {grammar.length > 0 && guessed === false && !p?.lessons && !p?.completed ? (
        <Card className="space-y-2">
          <h2 className="font-serif text-xl">Guess first</h2>
          <p>
            Before you read this unit's grammar, try {GUESS_ITEMS} questions on it. Wrong guesses cost nothing: trying first is what makes the
            explanation stick.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/lesson/${unit.id}/guess`}>
              <Button>Guess first</Button>
            </Link>
            <Button variant="secondary" onClick={() => setKV(`guessed:${unit.id}`, true).then(() => setGuessed(true))}>
              Show me the rule
            </Button>
          </div>
        </Card>
      ) : grammar.map((g) => (
        <Card key={g.id}>
          <h2 className="font-serif text-xl">{g.title.en}</h2>
          <Md text={g.card} className="mt-2" />
          <Link to={`/grammar/${g.id}`} className="mt-2 inline-block text-sm text-red underline">
            Read the full article
          </Link>
        </Card>
      ))}

      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl">Words</h2>
          <Button
            variant="secondary"
            disabled={queued}
            onClick={async () => {
              await queueWords(unit.vocab)
              setQueued(true)
            }}
          >
            {queued ? 'Added to your deck ✓' : 'Add to my deck'}
          </Button>
        </div>
        <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
          {words.map((w) => (
            <li key={w.id}>
              <Link to={`/word/${encodeURIComponent(w.id)}`} className="flex items-baseline gap-2 py-1 hover:text-red">
                <Ru className="text-lg">{w.lemma}</Ru>
                <span className="text-sm text-ink-soft">{gloss(w)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {queued && <p className="mt-1 text-xs text-ink-soft">They'll appear in your reviews over the next few days, within your daily new-word limit.</p>}
      </Card>
    </div>
  )
}

export function LessonPage() {
  const { id, mode = 'lesson' } = useParams()
  const nav = useNavigate()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [card, setCard] = useState<string | null>(null)
  const [state, setState] = useState<{ unit: Unit; items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)

  useEffect(() => {
    if (!ready) return
    let alive = true
    setState(null)
    void loadUnits().then(async (us) => {
      const unit = us.find((u) => u.id === id)
      if (!unit) return
      const ctx = await buildDrillContext({ level: unit.level as 'A2', vocab: unit.vocab, hasVoice: voices.length > 0 })
      const items = mode === 'lesson' ? lessonItems(unit, ctx) : mode === 'guess' ? guessItems(unit, ctx) : checkpointItems(unit, ctx)
      if (!items.length) {
        // nothing to guess at (an all-vocabulary unit): straight to the rule
        await setKV(`guessed:${unit.id}`, true)
        return nav(`/unit/${unit.id}`, { replace: true })
      }
      if (alive) setState({ unit, items, lexemes: ctx.lexemes })
    })
    return () => {
      alive = false
    }
  }, [id, mode, round, ready, voices.length, nav])

  if (!state) return <p className="py-12 text-center text-ink-soft">Preparing the unit…</p>
  const isCheck = mode === 'check' || mode === 'testout'
  const guess = mode === 'guess'
  const leave = async () => {
    if (guess) await setKV(`guessed:${state.unit.id}`, true)
    nav(`/unit/${state.unit.id}`)
  }
  return (
    <SessionRunner
      key={round}
      items={state.items}
      lexemes={state.lexemes}
      kind={isCheck ? 'checkpoint' : guess ? 'guess' : 'lesson'}
      relearn={guess ? 'never' : 'once'}
      doneLabel={guess ? 'Read the rule' : undefined}
      onFinish={async (end) => {
        if (isCheck) setCard((await recordCheckpoint(state.unit, end.accuracy, mode === 'testout', Date.now())).card)
        else if (!guess) await recordLesson(state.unit.id)
      }}
      summaryNote={(end) =>
        guess ? (
          <Card className="mx-auto mb-4 max-w-xl text-center">
            <p className="font-serif text-2xl">Now read the rule</p>
            <p className="text-sm text-ink-soft">It explains the questions you just tried. Then start the lesson.</p>
          </Card>
        ) : isCheck ? (
          <Card className={`mx-auto mb-4 max-w-xl text-center ${end.accuracy >= PASS_MARK ? 'border-good' : 'border-bad'}`}>
            <p className="font-serif text-2xl">{end.accuracy >= PASS_MARK ? `${state.unit.level} unit ${state.unit.number} complete!` : 'Not quite yet'}</p>
            {card && <NewCard id={card} />}
            <p className="text-sm text-ink-soft">
              {end.accuracy >= PASS_MARK
                ? 'On to the next unit.'
                : `You scored ${Math.round(end.accuracy * 100)}%. You need ${Math.round(PASS_MARK * 100)}%; another lesson first will help.`}
            </p>
          </Card>
        ) : null
      }
      onDone={leave}
      onAgain={guess ? undefined : () => setRound((r) => r + 1)}
    />
  )
}

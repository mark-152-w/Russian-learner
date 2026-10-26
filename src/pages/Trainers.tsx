// Specialist trainers: cases (with preposition sorting), numerals, aspect, verbs of motion, stress.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { db, type Mastery } from '../db/db'
import { useRussianVoices } from '../audio/tts'
import { buildDrillContext } from '../lib/drillContext'
import { learnerLevel } from '../lib/learner'
import { loadLexemes } from '../lib/lexicon'
import { shuffle } from '../lib/rng'
import { GENERATORS, itemsForTag } from '../engine/drills'
import {
  countItems, declinedNumeralItems, formPairItems, minimalPairItems, MINIMAL_PAIR_LEXEMES, NUMERAL_LEXEMES, prepSortItems,
  shiftingStressItems,
} from '../engine/trainers'
import { SessionRunner } from '../components/SessionRunner'
import { MotionVisual, TimelineVisual } from '../components/visuals'
import { Ru } from '../components/Md'
import { Bar, Card } from '../components/ui'

interface Mode {
  id: string
  title: string
  detail: string
  /** Learner-model tags whose mastery the mode shows. */
  tags?: string[]
}
interface Trainer {
  id: 'cases' | 'numerals' | 'aspect' | 'motion' | 'stress'
  title: string
  ru: string
  blurb: string
  /** Tag prefix in the learner model. */
  prefix: string
  modes: Mode[]
}

export const TRAINERS: Trainer[] = [
  {
    id: 'cases',
    title: 'Cases',
    ru: 'Падежи́',
    blurb: 'Real sentences with the governing word highlighted and a "why this case?" after each answer, plus a preposition sorting game.',
    prefix: 'case.',
    modes: [
      { id: 'prepositions', title: 'Sort the prepositions', detail: 'Which case follows без, к, че́рез, ме́жду…? Each one has its meaning attached.', tags: ['case.gen.prepositions', 'case.dat.prepositions', 'case.ins.prepositions'] },
      { id: 'mixed', title: 'All cases', detail: 'Sentence gaps from every case.' },
      { id: 'gen', title: 'Genitive', detail: 'кого́? чего́? · нет, мно́го, у, из, без…', tags: ['case.gen'] },
      { id: 'dat', title: 'Dative', detail: 'кому́? чему́? · к, по, мне хо́лодно…', tags: ['case.dat'] },
      { id: 'acc', title: 'Accusative', detail: 'кого́? что? куда́? · objects and direction', tags: ['case.acc'] },
      { id: 'ins', title: 'Instrumental', detail: 'кем? чем? · с, над, ме́жду, стать…', tags: ['case.ins'] },
      { id: 'prep', title: 'Prepositional', detail: 'о ком? о чём? где? · в, на, о', tags: ['case.prep'] },
    ],
  },
  {
    id: 'numerals',
    title: 'Numbers',
    ru: 'Числи́тельные',
    blurb: 'The 1 / 2–4 / 5+ rule with prices, times and ages, and numbers that decline after prepositions (с тремя́ друзья́ми).',
    prefix: 'num.',
    modes: [
      { id: 'count', title: 'Counting: 1, 2–4, 5+', detail: 'рубль, рубля́, рубле́й · час, часа́, часо́в · год, го́да, лет', tags: ['num.governance', 'num.time-date'] },
      { id: 'declined', title: 'Numbers after prepositions', detail: 'о двух, с тремя́, к пяти́: the number declines too', tags: ['num.declension'] },
      { id: 'mixed', title: 'Mixed', detail: 'Both together.' },
    ],
  },
  {
    id: 'aspect',
    title: 'Aspect',
    ru: 'Вид глаго́ла',
    blurb: 'Process or result? Pairs in real contexts, each with a one-line reason and a timeline picture.',
    prefix: 'aspect.',
    modes: [
      { id: 'mixed', title: 'Mixed', detail: 'Everything below, shuffled.' },
      { id: 'past', title: 'In the past', detail: 'смотре́л or посмотре́л? Process, result, repetition, sequence.', tags: ['aspect.past'] },
      { id: 'present', title: 'Now, habits and the future', detail: 'бу́ду чита́ть or прочита́ю? за два дня or два дня?', tags: ['aspect.future', 'aspect.intro'] },
      { id: 'negation', title: 'With не and нельзя́', detail: 'не смотре́л vs так и не посмотре́л; нельзя́ кури́ть vs нельзя́ откры́ть', tags: ['aspect.negation'] },
      { id: 'imperative', title: 'Imperatives', detail: 'Переда́й соль! but Не закрыва́й дверь!', tags: ['aspect.imperative'] },
      { id: 'nuance', title: 'Fine points', detail: 'приходи́л vs пришёл, брал vs взял, сдава́л vs сдал', tags: ['aspect.nuance'] },
    ],
  },
  {
    id: 'motion',
    title: 'Verbs of motion',
    ru: 'Глаго́лы движе́ния',
    blurb: 'идти́ or ходи́ть, on foot or by transport, then the prefixes, each with a diagram. Figurative uses at B2.',
    prefix: 'motion.',
    modes: [
      { id: 'basic', title: 'Basics', detail: 'иду́ / хожу́, е́ду / е́зжу, несу́ / ношу́…', tags: ['motion.basic'] },
      { id: 'prefixed', title: 'Prefixes', detail: 'пришёл, ушёл, перешёл, зашёл, обошёл…', tags: ['motion.prefixed'] },
      { id: 'figurative', title: 'Figurative uses', detail: 'идёт дождь, тебе́ идёт, вы́шла за́муж, сошёл с ума́', tags: ['motion.figurative'] },
      { id: 'mixed', title: 'Mixed', detail: 'All of it.' },
    ],
  },
  {
    id: 'stress',
    title: 'Stress',
    ru: 'Ударе́ние',
    blurb: 'Where stress moves: рука́ → ру́ку, го́род → города́, жил → жила́, and words told apart only by stress.',
    prefix: 'stress',
    modes: [
      { id: 'nouns', title: 'Shifting stress in nouns', detail: 'ру́ку, ру́ки/руки́, городо́в, в лесу́', tags: ['stress'] },
      { id: 'past', title: 'Past tense', detail: 'жил → жила́, на́чал → начала́, был → была́', tags: ['stress'] },
      { id: 'forms', title: 'Same letters, different form', detail: 'ру́ки (of the hand) or руки́ (hands)?', tags: ['stress'] },
      { id: 'minimal', title: 'Different words', detail: 'за́мок / замо́к, пла́чу / плачу́, сто́ит / стои́т', tags: ['stress'] },
    ],
  },
]

/** Accuracy over the learner-model rows matching any of the prefixes (attempt-weighted). */
function useMastery(prefixes: string[]): { score: number; attempts: number } {
  return useLiveQuery(
    async () => {
      const rows: Mastery[] = await db.mastery.where('kind').equals('tag').toArray()
      const hit = rows.filter((m) => prefixes.some((p) => m.key.slice(4) === p || m.key.slice(4).startsWith(p.endsWith('.') ? p : `${p}.`)))
      const attempts = hit.reduce((n, m) => n + m.attempts, 0)
      return { score: attempts ? hit.reduce((n, m) => n + m.score * m.attempts, 0) / attempts : 0, attempts }
    },
    [prefixes.join()],
    { score: 0, attempts: 0 },
  )
}

function MasteryLine({ prefixes }: { prefixes: string[] }) {
  const m = useMastery(prefixes)
  if (!m.attempts) return <p className="text-xs text-ink-soft">Not tried yet</p>
  return (
    <div className="flex items-center gap-2">
      <Bar value={m.score} className="h-1.5 flex-1" color={m.score >= 0.8 ? 'bg-good' : 'bg-red'} />
      <span className="text-xs tabular-nums text-ink-soft">
        {Math.round(m.score * 100)}% · {m.attempts}
      </span>
    </div>
  )
}

export function TrainersHub() {
  return (
    <div className="space-y-3">
      <h1 className="font-serif text-3xl">Trainers</h1>
      {TRAINERS.map((t) => (
        <Link key={t.id} to={`/trainer/${t.id}`} className="block">
          <Card className="space-y-2 transition hover:border-red">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-serif text-2xl">{t.title}</h2>
              <Ru className="text-ink-soft">{t.ru}</Ru>
            </div>
            <p className="text-sm text-ink-soft">{t.blurb}</p>
            <MasteryLine prefixes={[t.prefix]} />
          </Card>
        </Link>
      ))}
    </div>
  )
}

/** Prefix (morpheme notation), on foot pf / impf, by transport pf / impf. */
const PREFIX_VERBS: [string, string, string, string, string][] = [
  ['при-', 'прийти́', 'приходи́ть', 'прие́хать', 'приезжа́ть'],
  ['у-', 'уйти́', 'уходи́ть', 'уе́хать', 'уезжа́ть'],
  ['в-', 'войти́', 'входи́ть', 'въе́хать', 'въезжа́ть'],
  ['вы-', 'вы́йти', 'выходи́ть', 'вы́ехать', 'выезжа́ть'],
  ['под-', 'подойти́', 'подходи́ть', 'подъе́хать', 'подъезжа́ть'],
  ['от-', 'отойти́', 'отходи́ть', 'отъе́хать', 'отъезжа́ть'],
  ['до-', 'дойти́', 'доходи́ть', 'дое́хать', 'доезжа́ть'],
  ['пере-', 'перейти́', 'переходи́ть', 'перее́хать', 'переезжа́ть'],
  ['про-', 'пройти́', 'проходи́ть', 'прое́хать', 'проезжа́ть'],
  ['за-', 'зайти́', 'заходи́ть', 'зае́хать', 'заезжа́ть'],
  ['об-', 'обойти́', 'обходи́ть', 'объе́хать', 'объезжа́ть'],
  ['с-', 'сойти́', 'сходи́ть', 'съе́хать', 'съезжа́ть'],
  ['раз-', 'разойти́сь', 'расходи́ться', 'разъе́хаться', 'разъезжа́ться'],
]

const TIMELINES = ['process', 'result', 'repeated', 'sequence', 'simultaneous', 'duration', 'annulled', 'prohibition', 'warning'] as const

export function TrainerPage() {
  const { id } = useParams()
  const t = TRAINERS.find((x) => x.id === id)
  if (!t) return <p className="py-12 text-center text-ink-soft">No such trainer.</p>
  return (
    <div className="space-y-4">
      <Card>
        <Link to="/trainers" className="text-sm text-red underline">
          All trainers
        </Link>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h1 className="font-serif text-3xl">{t.title}</h1>
          <Ru className="text-xl text-ink-soft">{t.ru}</Ru>
        </div>
        <p className="mt-1 text-ink-soft">{t.blurb}</p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {t.modes.map((m) => (
          <Link key={m.id} to={`/trainer/${t.id}/${m.id}`} className="block rounded-xl border-2 border-line bg-paper-2 p-4 transition hover:border-red active:scale-[0.99]">
            <p className="font-bold">{m.title}</p>
            <p className="mb-2 text-sm text-ink-soft">
              <Ru>{m.detail}</Ru>
            </p>
            <MasteryLine prefixes={m.tags ?? [t.prefix]} />
          </Link>
        ))}
      </div>
      {t.id === 'aspect' && (
        <Card>
          <h2 className="font-serif text-xl">Reading the timelines</h2>
          <p className="text-sm text-ink-soft">After each answer you'll see one of these. Imperfective pictures a process or a pattern; perfective a point or a result.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TIMELINES.map((k) => (
              <TimelineVisual key={k} kind={k} />
            ))}
          </div>
        </Card>
      )}
      {t.id === 'motion' && (
        <Card>
          <h2 className="font-serif text-xl">The prefixes</h2>
          <p className="text-sm text-ink-soft">
            Each prefix adds a direction. With <Ru>-йти́ / -ходи́ть</Ru> you go on foot, with <Ru>-е́хать / -езжа́ть</Ru> by transport. The first verb of each pair
            is perfective (one completed trip), the second imperfective.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['uni', 'multi', 'round'] as const).map((k) => (
              <div key={k} className="rounded-lg border border-line p-2">
                <MotionVisual kind={k} />
              </div>
            ))}
            {PREFIX_VERBS.map(([p, f1, f2, v1, v2]) => (
              <div key={p} className="rounded-lg border border-line p-2">
                <MotionVisual kind={p.slice(0, -1) as 'при'} />
                <p className="mt-1 text-sm">
                  <Ru>{`${f1} / ${f2}`}</Ru>
                  <span className="text-ink-soft"> · </span>
                  <Ru>{`${v1} / ${v2}`}</Ru>
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const N = 12

async function trainerItems(trainer: string, mode: string, hasVoice: boolean): Promise<{ items: ExerciseItem[]; lexemes: Map<string, Lexeme> }> {
  const level = await learnerLevel()
  // hand-written items one level above the learner are fair game in a trainer
  const ceiling = LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + 1)]!
  const ctx = await buildDrillContext({ hasVoice })
  const { rng } = ctx
  const hand = (prefix: string) =>
    shuffle(rng, [...ctx.handwritten.values()].filter((i) => i.tags.some((t) => t.startsWith(prefix)) && LEVELS.indexOf(i.level) <= LEVELS.indexOf(ceiling))).slice(0, N)
  if (trainer === 'cases') {
    if (mode === 'prepositions') return { items: prepSortItems(ceiling, rng, 14), lexemes: ctx.lexemes }
    if (mode === 'mixed') return { items: GENERATORS['case-cloze']!(ctx, {}, N), lexemes: ctx.lexemes }
    return { items: itemsForTag(`case.${mode}`, ctx, N), lexemes: ctx.lexemes }
  }
  if (trainer === 'numerals') {
    const lexemes = new Map([...ctx.lexemes, ...(await loadLexemes(NUMERAL_LEXEMES))])
    const items =
      mode === 'count' ? countItems(lexemes, rng, N) : mode === 'declined' ? declinedNumeralItems(lexemes, rng, 10) : shuffle(rng, [...countItems(lexemes, rng, 8), ...declinedNumeralItems(lexemes, rng, 4)])
    return { items, lexemes }
  }
  if (trainer === 'aspect') {
    const prefix = { mixed: 'aspect.', past: 'aspect.past', present: 'aspect.future', negation: 'aspect.negation', imperative: 'aspect.imperative', nuance: 'aspect.nuance' }[mode] ?? 'aspect.'
    const items = mode === 'present' ? shuffle(rng, [...hand('aspect.future'), ...hand('aspect.intro')]).slice(0, N) : hand(prefix)
    return { items, lexemes: ctx.lexemes }
  }
  if (trainer === 'motion') return { items: hand(mode === 'mixed' ? 'motion.' : `motion.${mode}`), lexemes: ctx.lexemes }
  if (trainer === 'stress') {
    if (mode === 'minimal') {
      const lexemes = new Map([...ctx.lexemes, ...(await loadLexemes(MINIMAL_PAIR_LEXEMES))])
      return { items: minimalPairItems(lexemes, rng, N), lexemes }
    }
    const items = mode === 'forms' ? formPairItems(ctx.pool, rng, 10) : shiftingStressItems(ctx.pool, rng, N, mode === 'past' ? 'past' : 'noun')
    return { items, lexemes: ctx.lexemes }
  }
  return { items: [], lexemes: ctx.lexemes }
}

export function TrainerRun() {
  const { id = '', mode = 'mixed' } = useParams()
  const nav = useNavigate()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [state, setState] = useState<{ items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    setState(null)
    void trainerItems(id, mode, voices.length > 0).then((s) => alive && setState(s))
    return () => {
      alive = false
    }
  }, [id, mode, round, ready, voices.length])
  if (!state) return <p className="py-12 text-center text-ink-soft">Setting up the trainer…</p>
  if (!state.items.length) return <p className="py-12 text-center text-ink-soft">Nothing to practise here yet at your level.</p>
  return (
    <SessionRunner
      key={round}
      items={state.items}
      lexemes={state.lexemes}
      kind={`trainer-${id}`}
      onDone={() => nav(`/trainer/${id}`)}
      onAgain={() => setRound((r) => r + 1)}
    />
  )
}

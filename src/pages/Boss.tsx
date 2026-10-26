// Boss battle for a course unit: the unit's checkpoint drills plus your recent mistakes, against the boss's HP.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ExerciseItem, Lexeme, Unit } from '../types/content.gen'
import { db } from '../db/db'
import { useRussianVoices } from '../audio/tts'
import { sound } from '../audio/sound'
import { haptic } from '../audio/haptics'
import { bossHit, bossItems, ERROR_WINDOW_MS, HEARTS, recentErrorTargets, startBoss, type BossState } from '../engine/boss'
import { recordBossWin, useBossRecords } from '../lib/bosses'
import { loadUnits } from '../lib/content'
import { checkpointItems, useCourseProgress } from '../lib/course'
import { buildDrillContext } from '../lib/drillContext'
import { loadLexemes } from '../lib/lexicon'
import { SessionRunner } from '../components/SessionRunner'
import { BossArt } from '../components/BossArt'
import { NewCard } from '../components/CardFace'
import { Ru } from '../components/Md'
import { Bar, Button, Card } from '../components/ui'

function BossHud({ unit, state, hit, crit }: { unit: Unit; state: BossState; hit: number; crit: boolean }) {
  const boss = unit.boss!
  return (
    <Card className="flex items-center gap-3">
      <div key={hit} className="shrink-0">
        <BossArt art={boss.art} hit={hit > 0} defeated={state.hp === 0} className="h-24 w-24" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-serif text-lg leading-tight">
          <Ru>{boss.name.ru ?? ''}</Ru>
        </p>
        <Bar value={state.hp / state.maxHp} color="bg-bad" />
        <p className="flex justify-between text-xs text-ink-soft">
          <span>
            HP {state.hp} / {state.maxHp}
            {crit && <b className="anim-pop ml-2 text-red">Critical hit!</b>}
          </span>
          <span aria-label={`${state.hearts} hearts`}>
            {Array.from({ length: HEARTS }, (_, i) => (
              <span key={i} className={i < state.hearts ? 'text-red' : 'text-line'}>
                ♥
              </span>
            ))}
          </span>
        </p>
      </div>
    </Card>
  )
}

export default function BossPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { voices, ready } = useRussianVoices()
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<'intro' | 'fight'>('intro')
  const [data, setData] = useState<{ unit: Unit; items: ExerciseItem[]; lexemes: Map<string, Lexeme> } | null>(null)
  const [state, setState] = useState<BossState | null>(null)
  const [hit, setHit] = useState(0)
  const [crit, setCrit] = useState(false)
  const [firstWin, setFirstWin] = useState<{ first: boolean; card: string | null }>({ first: false, card: null })
  const live = useRef<BossState | null>(null)
  const records = useBossRecords()
  const progress = useCourseProgress()

  useEffect(() => {
    if (!ready) return
    let alive = true
    setData(null)
    void loadUnits().then(async (us) => {
      const unit = us.find((u) => u.id === id)
      if (!unit?.boss) return
      const ctx = await buildDrillContext({ level: unit.level as 'A2', vocab: unit.vocab, hasVoice: voices.length > 0 })
      const now = Date.now()
      const errors = recentErrorTargets(await db.attempts.where('ts').above(now - ERROR_WINDOW_MS).toArray(), now)
      const extra = await loadLexemes(errors.map((e) => e.lex))
      const lexemes = new Map([...ctx.lexemes, ...extra])
      const unitItems = [...checkpointItems(unit, ctx), ...checkpointItems(unit, ctx)]
      const items = bossItems(unitItems, errors, lexemes, unit.boss.hp)
      if (!alive) return
      setData({ unit, items, lexemes })
      live.current = startBoss(unit.boss.hp)
      setState(live.current)
      setHit(0)
      setCrit(false)
    })
    return () => {
      alive = false
    }
  }, [id, round, ready, voices.length])

  if (!data || !state) return <p className="py-12 text-center text-ink-soft">The boss is getting ready…</p>
  const { unit } = data
  const boss = unit.boss!
  const rec = records[unit.id]

  if (phase === 'intro')
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="space-y-3 text-center">
          <p className="text-sm font-bold text-red">
            Unit {unit.number} boss · {unit.title.en}
          </p>
          <BossArt art={boss.art} className="mx-auto h-48 w-48" />
          <h1 className="font-serif text-3xl">
            <Ru>{boss.name.ru ?? ''}</Ru>
          </h1>
          <p className="text-ink-soft">{boss.name.en}</p>
          <p>
            {boss.hp} HP. Every right answer hits; three in a row hit twice as hard. Each mistake costs one of your {HEARTS} hearts. The questions come from this unit, plus forms
            you've recently got wrong anywhere in the app.
          </p>
          {!progress[unit.id]?.lessons && !progress[unit.id]?.completed && <p className="text-sm text-ink-soft">Tip: do the unit's lesson first.</p>}
          {rec?.wins ? <p className="text-sm font-bold text-good">Defeated {rec.wins}×</p> : null}
          <Button className="w-full" onClick={() => setPhase('fight')}>
            Fight
          </Button>
          <Link to={`/unit/${unit.id}`} className="block text-sm text-ink-soft underline">
            Back to the unit
          </Link>
        </Card>
      </div>
    )

  return (
    <SessionRunner
      key={round}
      items={data.items}
      lexemes={data.lexemes}
      kind="boss"
      hud={<BossHud unit={unit} state={state} hit={hit} crit={crit} />}
      onAnswered={(v, fx) => {
        const h = bossHit(live.current!, v.correct, fx.combo)
        live.current = h.state
        setState(h.state)
        setCrit(h.crit)
        if (v.correct) setHit((n) => n + 1)
        else haptic.wrong()
        if (h.outcome === 'won') sound.levelUp()
        return h.outcome !== null
      }}
      onFinish={async () => {
        const s = live.current!
        if (s.hp === 0) setFirstWin(await recordBossWin(unit, s.hearts, Date.now()))
      }}
      summaryNote={() => {
        const s = live.current!
        const won = s.hp === 0
        return (
          <Card className={`mx-auto mb-4 max-w-xl text-center ${won ? 'border-good' : 'border-bad'}`}>
            <BossArt art={boss.art} defeated={won} className="mx-auto h-28 w-28" />
            <p className="font-serif text-2xl">{won ? <Ru>Побе́да!</Ru> : s.hearts <= 0 ? 'The boss won this time' : 'The boss got away'}</p>
            <p className="text-sm text-ink-soft">
              {won
                ? firstWin.first
                  ? 'A first victory over this boss: it counts towards Богаты́рь.'
                  : `With ${s.hearts} heart${s.hearts === 1 ? '' : 's'} to spare.`
                : `${s.hp} HP left. The XP and practice still count; try again after a lesson.`}
            </p>
            {firstWin.card && <NewCard id={firstWin.card} />}
          </Card>
        )
      }}
      onDone={() => nav(`/unit/${unit.id}`)}
      onAgain={() => {
        setPhase('intro')
        setRound((r) => r + 1)
      }}
    />
  )
}

// Adaptive placement test: ~25 quick questions across five skills; no XP, no pressure.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ExerciseItem } from '../types/content.gen'
import { setKV } from '../db/db'
import { grade, type Response } from '../engine/grader'
import {
  ITEMS_PER_SKILL, initPlacement, nextSkill, PL_LEVELS, placementItem, placementResult, recordAnswer, SKILLS,
  type PlacementBank, type PlacementResult, type PlacementState, type Skill,
} from '../engine/placement'
import { loadHandwritten } from '../lib/content'
import { loadChunk } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { loadSentences } from '../lib/sentences'
import { ExerciseView } from '../components/exercises'
import { Bar, Button, Card } from '../components/ui'

const SKILL_NAME: Record<Skill, string> = {
  cases: 'Case endings',
  verbs: 'Verb forms',
  aspect: 'Aspect',
  vocab: 'Vocabulary',
  reading: 'Reading',
}

async function loadBank(): Promise<PlacementBank> {
  const [a1, a2, b1, b2] = await Promise.all(PL_LEVELS.map((l) => loadChunk(l)))
  const sents = await Promise.all(PL_LEVELS.map((l) => loadSentences(l)))
  return {
    lexemes: new Map([...a1!, ...a2!, ...b1!, ...b2!].map((x) => [x.id, x])),
    words: { A1: a1!, A2: a2!, B1: b1!, B2: b2! },
    sentences: { A1: sents[0]!, A2: sents[1]!, B1: sents[2]!, B2: sents[3]! },
    handwritten: [...(await loadHandwritten()).values()],
  }
}

export default function Placement() {
  const [phase, setPhase] = useState<'intro' | 'loading' | 'test' | 'done'>('intro')
  const [bank, setBank] = useState<PlacementBank | null>(null)
  const [state, setState] = useState<PlacementState>(initPlacement)
  const [cur, setCur] = useState<{ skill: Skill; item: ExerciseItem } | null>(null)
  const [flash, setFlash] = useState<boolean | null>(null)
  const [result, setResult] = useState<PlacementResult | null>(null)
  const used = useRef(new Set<string>())
  const rng = useRef(mulberry32(Date.now()))

  const ask = (st: PlacementState, b: PlacementBank) => {
    let s = nextSkill(st)
    while (s) {
      const item = placementItem(s, PL_LEVELS[st[s].level]!, b, rng.current, used.current)
      if (item) {
        used.current.add(item.id)
        setCur({ skill: s, item })
        return
      }
      st = recordAnswer(st, s, false) // no item available: count as a miss and move on
      s = nextSkill(st)
    }
    finish(st)
  }

  const finish = async (st: PlacementState) => {
    const r = placementResult(st)
    setResult(r)
    await setKV('placement', { level: r.level, skills: r.skills, knownRank: r.knownRank, ts: Date.now() })
    setPhase('done')
  }

  useEffect(() => {
    if (phase !== 'loading') return
    void loadBank().then((b) => {
      setBank(b)
      setPhase('test')
      ask(initPlacement(), b)
    })
  }, [phase])

  const submit = (r: Response) => {
    if (!cur || !bank || flash !== null) return
    const ok = grade(cur.item, r, { lexemes: bank.lexemes }).correct
    setFlash(ok)
    const next = recordAnswer(state, cur.skill, ok)
    setState(next)
    setTimeout(() => {
      setFlash(null)
      ask(next, bank)
    }, 650)
  }

  if (phase === 'intro')
    return (
      <Card className="mx-auto max-w-lg space-y-3">
        <h1 className="font-serif text-3xl">Placement test</h1>
        <p>
          About {SKILLS.length * ITEMS_PER_SKILL} quick questions on case endings, verb forms, aspect, vocabulary and reading. The test
          adapts: get one right and the next is harder. It takes about five minutes and doesn't affect your XP.
        </p>
        <p className="text-sm text-ink-soft">Guessing is fine, but skip the guesswork when you really don't know: an honest result gives you a better course.</p>
        <Button onClick={() => setPhase('loading')} className="w-full">
          Start
        </Button>
      </Card>
    )
  if (phase === 'loading' || (phase === 'test' && !cur)) return <p className="py-12 text-center text-ink-soft">Preparing questions…</p>
  if (phase === 'done' && result)
    return (
      <Card className="mx-auto max-w-lg space-y-4">
        <h1 className="font-serif text-3xl">Your level: {result.level}</h1>
        <ul className="space-y-2">
          {SKILLS.map((s) => (
            <li key={s}>
              <div className="flex justify-between text-sm">
                <span>{SKILL_NAME[s]}</span>
                <span className="font-bold">{result.skills[s]}</span>
              </div>
              <Bar value={(PL_LEVELS.indexOf(result.skills[s]) + 1) / PL_LEVELS.length} />
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">
          Units below your level are marked <b>test-out</b> on the course page: pass their checkpoint to skip them. Words more
          frequent than about #{result.knownRank.toLocaleString('en')} won't be introduced as new cards. You can retake the test any time
          from Settings.
        </p>
        <Link to="/course">
          <Button className="w-full">Go to the course</Button>
        </Link>
      </Card>
    )

  const answered = SKILLS.reduce((n, s) => n + state[s].history.length, 0)
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Bar value={answered / (SKILLS.length * ITEMS_PER_SKILL)} />
      <p className="text-center text-sm text-ink-soft">{SKILL_NAME[cur!.skill]}</p>
      <div className={`rounded-2xl border-2 bg-paper-2 p-5 transition-colors ${flash === null ? 'border-line' : flash ? 'border-good' : 'border-bad'}`}>
        <ExerciseView key={cur!.item.id} item={cur!.item} verdict={null} onSubmit={submit} />
      </div>
    </div>
  )
}

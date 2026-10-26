// Declension crossword: a daily puzzle and puzzles by topic. Tap a cell to pick a word (tap again to switch
// direction), type with any keyboard. Check marks wrong letters; Reveal fills a word (it then doesn't count).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ExerciseItem } from '../types/content.gen'
import { buildPuzzle, candidates, daySeed, entryCells, TOPICS, type Entry, type Puzzle, type Topic } from '../engine/crossword'
import { CODE_TO_RU } from '../engine/keyboard'
import { learnerLevel } from '../lib/learner'
import { poolUpTo } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { fold } from '../lib/ru'
import { dayKey } from '../rewards/streak'
import { RewardSession, bumpStatsExternal, type SessionEnd } from '../rewards/service'
import { SessionSummary } from '../components/SessionSummary'
import { Ru } from '../components/Md'
import { Button, Card, Icon } from '../components/ui'

export function CrosswordHub() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="space-y-3">
        <h1 className="font-serif text-3xl">Declension crossword</h1>
        <p className="text-ink-soft">Every answer is an inflected form: «кни́га — gen. pl.» means you write кни́г. Stress doesn't matter, and ё counts as е.</p>
        <Link to="/crossword/daily">
          <Button className="w-full">Today's puzzle</Button>
        </Link>
      </Card>
      <Card>
        <h2 className="font-serif text-xl">By topic</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {TOPICS.map((t) => (
            <Link key={t.id} to={`/crossword/${t.id}`} className="rounded-lg border-2 border-line bg-paper px-3 py-2 text-center hover:border-red">
              {t.title}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

const asItem = (e: Entry): ExerciseItem => ({
  id: `cw:${e.lex}:${e.slot}`,
  type: 'transform',
  level: 'A2',
  tags: ['crossword'],
  source: 'generated',
  target: { lex: e.lex, slot: e.slot },
  prompt: { instruction: e.clue },
  accept: [e.form],
})

export function CrosswordGame() {
  const { topic = 'daily' } = useParams()
  const nav = useNavigate()
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [fill, setFill] = useState<string[][]>([])
  const [sel, setSel] = useState<{ r: number; c: number; dir: 'across' | 'down' } | null>(null)
  const [wrong, setWrong] = useState<Set<string>>(new Set())
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [end, setEnd] = useState<SessionEnd | null>(null)
  const [round, setRound] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const started = useRef(Date.now())

  useEffect(() => {
    let alive = true
    setPuzzle(null)
    setEnd(null)
    setWrong(new Set())
    setRevealed(new Set())
    started.current = Date.now()
    void learnerLevel().then(async (lv) => {
      const pool = await poolUpTo(lv)
      const seed = topic === 'daily' ? daySeed(dayKey(Date.now())) : Date.now() + round
      for (let attempt = 0; attempt < 8; attempt++) {
        const rng = mulberry32(seed + attempt)
        const p = buildPuzzle(candidates(pool, topic === 'daily' ? 'mixed' : (topic as Topic), rng), rng, 10)
        if (p) {
          if (!alive) return
          setPuzzle(p)
          setFill(p.grid.map((row) => row.map(() => '')))
          const e = p.entries[0]!
          setSel({ r: e.row, c: e.col, dir: e.dir })
          return
        }
      }
    })
    return () => {
      alive = false
    }
  }, [topic, round])

  const current = useMemo(() => {
    if (!puzzle || !sel) return undefined
    const on = (e: Entry) => entryCells(e).some(([r, c]) => r === sel.r && c === sel.c)
    return puzzle.entries.find((e) => e.dir === sel.dir && on(e)) ?? puzzle.entries.find(on)
  }, [puzzle, sel])

  const complete = useMemo(
    () => !!puzzle && puzzle.grid.every((row, r) => row.every((ch, c) => !ch || fill[r]?.[c] === ch)),
    [puzzle, fill],
  )

  useEffect(() => {
    if (!complete || !puzzle || end) return
    const session = new RewardSession('crossword', started.current)
    void (async () => {
      for (const e of puzzle.entries) {
        const correct = !revealed.has(puzzle.entries.indexOf(e))
        await session.answer({ item: asItem(e), verdict: { correct, expected: e.form }, ms: 20000, golden: false, lexeme: undefined, recall: null, now: Date.now() })
      }
      await bumpStatsExternal({ crosswords: 1 })
      const r = await session.finish(Date.now())
      if (r) setEnd(r)
    })()
  }, [complete, puzzle, end, revealed])

  const move = (step: number) => {
    if (!current || !sel) return
    const cells = entryCells(current)
    const i = cells.findIndex(([r, c]) => r === sel.r && c === sel.c)
    const next = cells[Math.max(0, Math.min(cells.length - 1, i + step))]!
    setSel({ r: next[0], c: next[1], dir: current.dir })
  }

  const type = (ch: string) => {
    if (!sel || !puzzle?.grid[sel.r]?.[sel.c]) return
    const letter = fold(ch)
    if (!/^[а-я]$/.test(letter)) return // ru-ignore
    setFill((f) => f.map((row, r) => row.map((x, c) => (r === sel.r && c === sel.c ? letter : x))))
    setWrong((w) => {
      const n = new Set(w)
      n.delete(`${sel.r},${sel.c}`)
      return n
    })
    move(1)
  }
  const erase = () => {
    if (!sel) return
    setFill((f) => f.map((row, r) => row.map((x, c) => (r === sel.r && c === sel.c ? '' : x))))
    move(-1)
  }

  const check = () => {
    if (!puzzle) return
    const w = new Set<string>()
    puzzle.grid.forEach((row, r) => row.forEach((ch, c) => ch && fill[r]?.[c] && fill[r]![c] !== ch && w.add(`${r},${c}`)))
    setWrong(w)
  }
  const reveal = () => {
    if (!puzzle || !current) return
    setRevealed((s) => new Set(s).add(puzzle.entries.indexOf(current)))
    setFill((f) => {
      const g = f.map((row) => [...row])
      for (const [r, c] of entryCells(current)) g[r]![c] = puzzle.grid[r]![c]!
      return g
    })
  }

  useEffect(() => input.current?.focus(), [sel])

  if (end) return <SessionSummary end={end} onDone={() => nav('/crossword')} onAgain={() => setRound((r) => r + 1)} />
  if (!puzzle) return <p className="py-12 text-center text-ink-soft">Building the puzzle…</p>

  const across = puzzle.entries.filter((e) => e.dir === 'across')
  const down = puzzle.entries.filter((e) => e.dir === 'down')
  const inCurrent = new Set(current ? entryCells(current).map(([r, c]) => `${r},${c}`) : [])
  const cellPx = `min(2.4rem, calc((100vw - 2rem) / ${puzzle.cols}))`
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => nav('/crossword')} className="text-ink-soft hover:text-red" aria-label="Back">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <h1 className="flex-1 font-serif text-xl">{topic === 'daily' ? "Today's crossword" : `Crossword: ${TOPICS.find((t) => t.id === topic)?.title}`}</h1>
      </div>
      {current && (
        <div className="sticky top-0 z-10 rounded-lg bg-red px-3 py-2 text-paper">
          <b>
            {current.n} {current.dir}:
          </b>{' '}
          <Ru>{current.clue}</Ru>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="mx-auto grid w-max gap-px bg-line p-px" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, ${cellPx})` }}>
          {puzzle.grid.flatMap((row, r) =>
            row.map((ch, c) => {
              const k = `${r},${c}`
              if (!ch) return <div key={k} className="bg-ink/80" style={{ height: cellPx }} />
              const active = sel?.r === r && sel?.c === c
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSel(active ? { r, c, dir: sel!.dir === 'across' ? 'down' : 'across' } : { r, c, dir: sel?.dir ?? 'across' })}
                  className={`ru relative flex items-center justify-center text-lg uppercase ${active ? 'bg-gold/50' : inCurrent.has(k) ? 'bg-gold/20' : 'bg-paper'} ${wrong.has(k) ? 'text-bad' : ''}`}
                  style={{ height: cellPx }}
                  aria-label={`row ${r + 1}, column ${c + 1}`}
                >
                  {puzzle.numbers[r]![c] && <span className="absolute left-0.5 top-0 font-sans text-[0.55rem] leading-none text-ink-soft">{puzzle.numbers[r]![c]}</span>}
                  {fill[r]?.[c]}
                </button>
              )
            }),
          )}
        </div>
      </div>
      <input
        ref={input}
        aria-label="Type a letter"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        lang="ru"
        className="h-1 w-full opacity-0"
        onKeyDown={(e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return
          if (e.key === 'Backspace') {
            e.preventDefault()
            erase()
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault()
            move(1)
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault()
            move(-1)
          } else if (/^[а-яё]$/i.test(e.key)) { // ru-ignore
            e.preventDefault()
            type(e.key)
          } else if (CODE_TO_RU[e.code]) {
            e.preventDefault()
            type(CODE_TO_RU[e.code]!)
          }
        }}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value
          ;(e.target as HTMLInputElement).value = ''
          for (const ch of v) type(ch)
        }}
      />
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={check}>
          Check
        </Button>
        <Button variant="secondary" className="flex-1" onClick={reveal} disabled={!current}>
          Reveal word
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Across', across],
          ['Down', down],
        ].map(([title, list]) => (
          <Card key={title as string}>
            <h2 className="font-bold">{title as string}</h2>
            <ol className="mt-1 space-y-1 text-sm">
              {(list as Entry[]).map((e) => (
                <li key={`${e.dir}${e.n}`}>
                  <button type="button" className={`text-left ${current === e ? 'font-bold text-red' : ''}`} onClick={() => setSel({ r: e.row, c: e.col, dir: e.dir })}>
                    {e.n}. <Ru>{e.clue}</Ru>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  )
}

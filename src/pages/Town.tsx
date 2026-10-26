// Your town: each building grows with one part of your learning (see engine/town.ts).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BUILDINGS, MAX_LEVEL, townRank, townState, type BuildingState } from '../engine/town'
import { loadVocabulary } from '../lib/plan'
import { bumpStatsExternal, getProfile, getStats } from '../rewards/service'
import { Ru } from '../components/Md'
import { Bar, Card } from '../components/ui'

async function loadMetrics(): Promise<Record<string, number>> {
  const [s, p, vocab] = await Promise.all([getStats(), getProfile(), loadVocabulary()])
  const v = (k: string) => s[k] ?? 0
  return {
    streak: p.streak.longest,
    reviews: v('reviews'),
    words: vocab.known,
    units: v('units'),
    stories: v('stories'),
    listening: v('dictationPerfect'),
    trainers: v('trainerSessions'),
    games: v('arcadeRuns') + v('speedRounds') + v('crosswords'),
    bosses: v('bosses'),
    cards: p.cards.length,
  }
}

function BuildingArt({ color, level, emblem }: { color: string; level: number; emblem: string }) {
  if (level === 0)
    return (
      <svg viewBox="0 0 100 80" className="h-24 w-full" aria-hidden="true">
        <rect x="10" y="68" width="80" height="6" rx="2" fill="#9b8a6a" opacity="0.5" />
        {[18, 34, 50, 66, 82].map((x) => (
          <rect key={x} x={x - 2} y="54" width="4" height="16" fill="#8b6f47" />
        ))}
        <rect x="14" y="58" width="72" height="3" fill="#8b6f47" />
        <rect x="38" y="30" width="24" height="16" rx="2" fill="#f2e6c9" stroke="#8b6f47" strokeWidth="2" />
        <rect x="49" y="46" width="2" height="10" fill="#8b6f47" />
        <text x="50" y="42" textAnchor="middle" fontSize="11" fill="#8b6f47">?</text>
      </svg>
    )
  const floors = Math.min(level, 3)
  const w = 36 + level * 8
  const x0 = 50 - w / 2
  const fh = 14
  const top = 70 - floors * fh
  const lit = level >= 2
  return (
    <svg viewBox="0 0 100 80" className="h-24 w-full" aria-hidden="true">
      <rect x="4" y="70" width="92" height="5" rx="2" fill="#7a9a5a" opacity="0.6" />
      {level >= 4 && <rect x={x0 - 10} y={70 - fh} width="10" height={fh} fill={color} opacity="0.75" stroke="#2a1d0f" strokeWidth="1.5" />}
      {level >= 4 && <rect x={x0 + w} y={70 - fh} width="10" height={fh} fill={color} opacity="0.75" stroke="#2a1d0f" strokeWidth="1.5" />}
      <rect x={x0} y={top} width={w} height={floors * fh} fill={color} stroke="#2a1d0f" strokeWidth="2" />
      {Array.from({ length: floors }, (_, f) =>
        Array.from({ length: Math.floor(w / 12) }, (_, i) => (
          <rect key={`${f}-${i}`} x={x0 + 5 + i * 12} y={top + 4 + f * fh} width="6" height="6" fill={lit ? '#f6d77a' : '#f2e6c9'} stroke="#2a1d0f" strokeWidth="1" />
        )),
      )}
      <rect x="46" y="60" width="8" height="10" fill="#4a3220" />
      <path d={`M${x0 - 4} ${top}L50 ${top - 14 - level * 2}L${x0 + w + 4} ${top}Z`} fill={level >= 5 ? '#d3a21c' : '#8c3b2b'} stroke="#2a1d0f" strokeWidth="2" />
      {level >= 3 && <circle cx="50" cy={top - 16 - level * 2} r="4" fill={level >= 5 ? '#f6d77a' : '#d3a21c'} stroke="#2a1d0f" strokeWidth="1.5" />}
      {level >= 4 && (
        <g>
          <rect x={x0 + w - 6} y={top - 22} width="1.5" height="18" fill="#2a1d0f" />
          <path d={`M${x0 + w - 4.5} ${top - 22}l10 3l-10 3z`} fill="#b3262a" />
        </g>
      )}
      <text x="50" y={top + floors * fh - 16} textAnchor="middle" fontSize="10">
        {emblem}
      </text>
    </svg>
  )
}

export default function Town() {
  const [state, setState] = useState<BuildingState[] | null>(null)
  useEffect(() => {
    void loadMetrics().then((m) => {
      const st = townState(m)
      setState(st)
      void bumpStatsExternal({}, { townLevels: st.reduce((a, b) => a + b.level, 0) })
    })
  }, [])
  if (!state) return <p className="py-12 text-center text-ink-soft">Walking into town…</p>
  const total = state.reduce((a, b) => a + b.level, 0)
  const [, rankRu, rankEn] = townRank(total)
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="font-serif text-3xl">Your town</h1>
        <p className="text-lg">
          <Ru className="font-bold text-red">{rankRu}</Ru> <span className="text-ink-soft">· {rankEn}</span>
        </p>
        <Bar value={total / (BUILDINGS.length * MAX_LEVEL)} className="mt-2" color="bg-good" />
        <p className="mt-1 text-sm text-ink-soft">
          {total} / {BUILDINGS.length * MAX_LEVEL} building levels. Each building grows with one part of your Russian; an empty plot is something you haven't tried yet.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {state.map(({ building: b, value, level, next }) => (
          <Link key={b.id} to={b.to} className="rounded-xl border-2 border-line bg-paper-2 p-2 text-center transition hover:border-red active:scale-[0.98]">
            <BuildingArt color={b.color} level={level} emblem={b.emblem} />
            <Ru className="block font-serif text-lg">{b.ru}</Ru>
            <span className="block text-xs text-ink-soft">{b.en}</span>
            <span className="mt-1 flex justify-center gap-0.5" aria-label={`level ${level} of ${MAX_LEVEL}`}>
              {Array.from({ length: MAX_LEVEL }, (_, i) => (
                <span key={i} className={`h-1.5 w-4 rounded-full ${i < level ? 'bg-gold' : 'bg-line'}`} />
              ))}
            </span>
            <span className="mt-1 block text-xs text-ink-soft">{next !== undefined ? `${value.toLocaleString('en')} / ${next.toLocaleString('en')} ${b.label}` : `Complete: ${value.toLocaleString('en')} ${b.label}`}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

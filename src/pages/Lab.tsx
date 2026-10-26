// Declension & conjugation lab: look up any word (by lemma, English or an inflected form) and see your
// accuracy heatmap per case × number × gender.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { CORE_CHUNKS, decodeCell, loadChunk, loadIndex, type IndexRow } from '../lib/lexicon'
import { fold } from '../lib/ru'
import { CASE_NAME, type Case } from '../engine/slots'
import { Ru } from '../components/Md'
import { Card } from '../components/ui'

const CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep']
const COLS: [string, string, string][] = [
  ['sg', 'm', 'm'], ['sg', 'f', 'f'], ['sg', 'n', 'n'],
  ['pl', 'm', 'm'], ['pl', 'f', 'f'], ['pl', 'n', 'n'],
]

function Heatmap() {
  const rows = useLiveQuery(() => db.mastery.where('kind').equals('form').toArray(), [], [])
  const cell = (c: Case, num: string, g: string) => rows.find((r) => r.key === `form:noun:${c}:${num}:${g}`)
  return (
    <Card>
      <h2 className="font-serif text-xl">Your accuracy by case</h2>
      <p className="text-sm text-ink-soft">Nouns you've practised, by case, number and gender. Tap a cell to drill it.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full table-fixed text-center text-sm">
          <thead>
            <tr>
              <th className="w-12" />
              <th colSpan={3} className="text-xs font-normal text-ink-soft">singular</th>
              <th colSpan={3} className="text-xs font-normal text-ink-soft">plural</th>
            </tr>
            <tr>
              <th />
              {COLS.map(([, , label]) => (
                <th key={label} className="px-1 pb-1 text-xs font-normal text-ink-soft">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CASES.map((c) => (
              <tr key={c}>
                <th className="pr-1 text-left text-xs font-bold" title={CASE_NAME[c]}>{c}</th>
                {COLS.map(([num, g]) => {
                  const r = cell(c, num, g)
                  const score = r ? r.score : null
                  const bg = score === null ? 'var(--paper)' : `color-mix(in srgb, var(--good) ${Math.round(score * 100)}%, var(--bad))`
                  return (
                    <td key={num + g} className="p-0.5">
                      <Link
                        to={`/drill/cell/${c}/${num}/${g}`}
                        className="flex h-9 items-center justify-center rounded text-[0.7rem] font-bold text-paper"
                        style={{ background: bg, color: score === null ? 'var(--ink-soft)' : undefined }}
                        title={r ? `${r.correct}/${r.attempts} correct` : 'not practised yet'}
                      >
                        {r ? `${Math.round(r.score * 100)}%` : '·'}
                      </Link>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function Lab() {
  const [q, setQ] = useState('')
  const [index, setIndex] = useState<IndexRow[]>([])
  const [formHits, setFormHits] = useState<IndexRow[]>([])
  const [searchingForms, setSearchingForms] = useState(false)

  useEffect(() => {
    void loadIndex('core').then(setIndex)
  }, [])

  const query = fold(q.trim())
  const hits = useMemo(() => {
    if (query.length < 2) return []
    const ru = /[а-я]/.test(query)
    return index
      .filter((r) => (ru ? fold(r[1]).startsWith(query) : r[5].toLowerCase().includes(query)))
      .sort((a, b) => (ru ? Number(fold(a[1]) !== query) - Number(fold(b[1]) !== query) : 0) || a[3] - b[3])
      .slice(0, 30)
  }, [query, index])

  // Inflected-form lookup (книгами → кни́га) when the lemma search finds nothing exact.
  useEffect(() => {
    setFormHits([])
    if (query.length < 2 || !/[а-я]/.test(query) || hits.some((h) => fold(h[1]) === query)) return
    let alive = true
    setSearchingForms(true)
    ;(async () => {
      const found = new Set<string>()
      for (const c of CORE_CHUNKS) {
        for (const x of await loadChunk(c)) {
          if (x.forms?.some((cell) => decodeCell(cell).some((v) => fold(v.form) === query))) found.add(x.id)
        }
      }
      if (alive) {
        setFormHits(index.filter((r) => found.has(r[0])))
        setSearchingForms(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [query, hits, index])

  const row = (r: IndexRow) => (
    <li key={r[0]}>
      <Link to={`/word/${encodeURIComponent(r[0])}`} className="flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 hover:bg-paper">
        <span>
          <Ru className="text-lg">{r[1]}</Ru> <span className="text-sm text-ink-soft">{r[5]}</span>
        </span>
        <span className="shrink-0 text-xs text-ink-soft">
          {r[2]} · {r[4]}
        </span>
      </Link>
    </li>
  )

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="font-serif text-2xl">Declension lab</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          lang="ru"
          autoFocus
          placeholder="кни́га, кни́гами, book…"
          aria-label="Search the dictionary"
          className="ru mt-3 w-full rounded-lg border-2 border-line bg-paper px-4 py-3 text-xl outline-none focus:border-red"
        />
        {hits.length > 0 && <ul className="mt-2">{hits.map(row)}</ul>}
        {formHits.length > 0 && (
          <>
            <p className="mt-3 text-sm text-ink-soft">«{q}» is a form of:</p>
            <ul>{formHits.map(row)}</ul>
          </>
        )}
        {searchingForms && <p className="mt-2 text-sm text-ink-soft">Looking through word forms…</p>}
        {query.length >= 2 && !hits.length && !formHits.length && !searchingForms && <p className="mt-2 text-sm text-ink-soft">No match among the 12,000 core words.</p>}
      </Card>
      <Heatmap />
    </div>
  )
}

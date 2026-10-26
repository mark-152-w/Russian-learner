import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ExerciseItem, GrammarArticle } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { speak } from '../audio/tts'
import { loadGrammar, loadHandwritten } from '../lib/content'
import { loadLexemes, formsOf, type FormVariant } from '../lib/lexicon'
import { displayStress, fold } from '../lib/ru'
import { drillableTag } from '../engine/drills'
import { Md, Ru } from '../components/Md'
import { Button, Card } from '../components/ui'
import type { Lexeme } from '../types/content.gen'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function GrammarIndex() {
  const [all, setAll] = useState<GrammarArticle[]>([])
  const [q, setQ] = useState('')
  useEffect(() => void loadGrammar().then(setAll), [])
  const query = fold(q.trim())
  const shown = useMemo(
    () =>
      all
        .filter((a) => !query || fold(JSON.stringify([a.title, a.card, a.tags])).includes(query))
        .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.id.localeCompare(b.id)),
    [all, query],
  )
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="font-serif text-2xl">Grammar reference</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: genitive, aspect, motion, кото́рый…"
          aria-label="Search grammar"
          className="mt-3 w-full rounded-lg border-2 border-line bg-paper px-4 py-3 outline-none focus:border-red"
        />
      </Card>
      {LEVELS.filter((lv) => shown.some((a) => a.level === lv)).map((lv) => (
        <Card key={lv}>
          <h2 className="font-serif text-xl text-red">{lv}</h2>
          <ul className="mt-2 divide-y divide-line">
            {shown
              .filter((a) => a.level === lv)
              .map((a) => (
                <li key={a.id}>
                  <Link to={`/grammar/${a.id}`} className="block py-2 hover:text-red">
                    <span className="font-bold">{a.title.en}</span>
                    {a.title.ru && (
                      <>
                        {' '}
                        · <Ru>{a.title.ru}</Ru>
                      </>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

/** A table whose cells are filled from the lexicon at runtime (no hand-typed forms). */
function GeneratedTable({ spec }: { spec: { lexemes: string[]; slots: string[]; highlightEndings?: boolean } }) {
  const [lx, setLx] = useState<Lexeme[]>([])
  const s = useSettings()
  useEffect(() => void loadLexemes(spec.lexemes).then((m) => setLx(spec.lexemes.map((id) => m.get(id)).filter((x): x is Lexeme => !!x))), [spec])
  const show = (v: FormVariant[]) => v.filter((x) => !x.unverified).map((x) => displayStress(x.form, s.showStress)).join(' / ') || '—'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem]">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-xs text-ink-soft" />
            {lx.map((x) => (
              <th key={x.id} className="ru px-2 py-1 text-left">
                <Link to={`/word/${encodeURIComponent(x.id)}`} className="hover:text-red">
                  {displayStress(x.lemma, s.showStress)}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.slots.map((slot) => (
            <tr key={slot} className="border-t border-line">
              <td className="px-2 py-1 text-xs font-bold text-ink-soft">{slot.replace('_', ' ')}</td>
              {lx.map((x) => (
                <td key={x.id} className="ru px-2 py-1 text-lg" lang="ru">
                  {show(formsOf(x, slot))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const SECTION_STYLE: Record<string, string> = {
  why: '',
  explanation: '',
  'vs-english': 'border-l-4 border-red-soft pl-3',
  'spelling-rule': 'rounded-lg border-2 border-red bg-paper p-3',
  'memory-trick': 'rounded-lg border-2 border-gold bg-paper p-3',
  'common-mistakes': 'rounded-lg border-2 border-bad bg-paper p-3',
  note: 'text-sm text-ink-soft',
  table: '',
}
const SECTION_TITLE: Record<string, string> = {
  why: 'Why it works this way',
  'vs-english': 'Compared with English',
  'spelling-rule': 'Spelling rule',
  'memory-trick': 'Memory trick',
  'common-mistakes': 'Common mistakes for English speakers',
}

export function GrammarArticlePage() {
  const { id } = useParams()
  const s = useSettings()
  const [a, setA] = useState<GrammarArticle | null | undefined>(undefined)
  const [all, setAll] = useState<GrammarArticle[]>([])
  const [hand, setHand] = useState<Map<string, ExerciseItem>>(new Map())
  useEffect(() => {
    void loadGrammar().then((g) => {
      setAll(g)
      setA(g.find((x) => x.id === id) ?? null)
    })
    void loadHandwritten().then(setHand)
  }, [id])
  if (a === undefined) return <p className="py-12 text-center text-ink-soft">Loading…</p>
  if (!a) return <p className="py-12 text-center text-ink-soft">Article not found.</p>
  const drillTag = a.tags.find((t) => drillableTag(t, hand))
  return (
    <article className="space-y-4">
      <Card>
        <p className="text-sm font-bold text-red">{a.level}</p>
        <h1 className="font-serif text-3xl">{a.title.en}</h1>
        {a.title.ru && <Ru className="text-xl text-ink-soft">{a.title.ru}</Ru>}
        <Md text={a.card} className="mt-3 text-lg" />
        {drillTag && (
          <Link to={`/drill/tag/${drillTag}`} className="mt-3 inline-block">
            <Button>Drill this topic</Button>
          </Link>
        )}
      </Card>
      {a.sections.map((sec, i) => (
        <Card key={i}>
          <section className={SECTION_STYLE[sec.kind] ?? ''}>
            {(sec.title || SECTION_TITLE[sec.kind]) && <h2 className="mb-2 font-serif text-xl">{sec.title ?? SECTION_TITLE[sec.kind]}</h2>}
            {sec.body && <Md text={sec.body} />}
            {sec.table?.generate && <GeneratedTable spec={sec.table.generate} />}
            {sec.table?.rows && (
              <div className="overflow-x-auto">
                {sec.table.caption && <p className="mb-1 text-sm text-ink-soft">{sec.table.caption}</p>}
                <table className="w-full min-w-[18rem]">
                  {sec.table.head && (
                    <thead>
                      <tr>
                        {sec.table.head.map((h, j) => (
                          <th key={j} className="px-2 py-1 text-left text-xs uppercase tracking-wide text-ink-soft">
                            <Md text={h} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {sec.table.rows.map((r, j) => (
                      <tr key={j} className="border-t border-line">
                        {r.map((c, k) => (
                          <td key={k} className="px-2 py-1 align-top">
                            <Md text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sec.mistakes && (
              <ul className="mt-2 space-y-3">
                {sec.mistakes.map((m, j) => (
                  <li key={j}>
                    <div>
                      <s className="ru text-bad">{displayStress(m.wrong, s.showStress)}</s> → <Ru className="font-bold text-good">{m.right}</Ru>
                    </div>
                    <Md text={m.why} className="text-sm text-ink-soft" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>
      ))}
      <Card>
        <h2 className="mb-2 font-serif text-xl">Examples</h2>
        <ul className="space-y-2">
          {a.examples.map((e, i) => {
            const parts = e.focus ? displayStress(e.ru, s.showStress).split(displayStress(e.focus, s.showStress)) : [displayStress(e.ru, s.showStress)]
            return (
              <li key={i}>
                <button type="button" className="ru text-left text-lg" lang="ru" onClick={() => speak(e.ru, { rate: s.ttsRate, voice: s.ttsVoice })}>
                  {parts.flatMap((p, k) => (k ? [<b key={k} className="text-red">{displayStress(e.focus!, s.showStress)}</b>, p] : [p]))}
                </button>
                <div className="text-sm text-ink-soft">{e.en}</div>
              </li>
            )
          })}
        </ul>
      </Card>
      {a.related && a.related.length > 0 && (
        <Card>
          <h2 className="mb-1 font-serif text-xl">Related</h2>
          <ul className="flex flex-wrap gap-2">
            {a.related.map((r) => {
              const x = all.find((y) => y.id === r)
              return x ? (
                <li key={r}>
                  <Link to={`/grammar/${r}`} className="rounded-full border border-line px-3 py-1 text-sm hover:border-red">
                    {x.title.en}
                  </Link>
                </li>
              ) : null
            })}
          </ul>
        </Card>
      )}
    </article>
  )
}

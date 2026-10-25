// Full stressed inflection tables with filters; endings highlighted, rare and unverified variants marked.
import { useMemo, useState } from 'react'
import type { Lexeme } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { formsOf, type FormVariant } from '../lib/lexicon'
import { displayStress } from '../lib/ru'
import { stemLength } from '../engine/diagnose'
import { CASE_NAME, PRONOUN, type Case } from '../engine/slots'
import { speak } from '../audio/tts'

const CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep']
const CASE_ABBR: Record<Case, string> = { nom: 'nom', gen: 'gen', dat: 'dat', acc: 'acc', ins: 'ins', prep: 'prep', loc2: 'loc' }
const CASE_Q: Record<Case, string> = { nom: 'кто? что?', gen: 'кого́? чего́?', dat: 'кому́? чему́?', acc: 'кого́? что?', ins: 'кем? чем?', prep: 'о ком? о чём?', loc2: 'где?' }

/** Split a stressed form into stem and ending, where the stem length is counted on letters only. */
export function splitEnding(form: string, stemLen: number): [string, string] {
  let letters = 0
  for (let i = 0; i < form.length; i++) {
    if (!/[̀́]/.test(form[i]!)) letters++
    if (letters > stemLen) return [form.slice(0, i), form.slice(i)]
  }
  return [form, '']
}

function Cell({ variants, stem, show }: { variants: FormVariant[]; stem: number; show: boolean }) {
  const s = useSettings()
  if (!variants.length) return <span className="text-line">—</span>
  return (
    <span className="flex flex-wrap gap-x-2">
      {variants.map((v) => {
        const text = displayStress(v.form, s.showStress)
        const [a, b] = show ? splitEnding(text, stem) : [text, '']
        return (
          <button
            key={v.form}
            type="button"
            onClick={() => speak(v.form, { rate: s.ttsRate, voice: s.ttsVoice })}
            title={v.unverified ? 'Not verified by the morphology check' : v.rare ? 'Rare or archaic' : 'Tap to hear'}
            className={`ru text-left ${v.unverified ? 'opacity-50' : ''} ${v.rare ? 'text-sm italic text-ink-soft' : 'text-lg'}`}
            lang="ru"
          >
            {a}
            <span className="text-red">{b}</span>
            {v.rare && <sup className="ml-0.5 not-italic">rare</sup>}
            {v.unverified && <sup className="ml-0.5">?</sup>}
          </button>
        )
      })}
    </span>
  )
}

function Chips<T extends string>({ all, on, set, label }: { all: [T, string][]; on: Set<T>; set: (s: Set<T>) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {all.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={on.has(k)}
          onClick={() => {
            const n = new Set(on)
            if (n.has(k)) n.delete(k)
            else n.add(k)
            set(n.size ? n : new Set(all.map((x) => x[0])))
          }}
          className={`rounded-full border px-3 py-1 text-sm ${on.has(k) ? 'border-red bg-red text-paper' : 'border-line text-ink-soft'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

export function FormTable({ lx }: { lx: Lexeme }) {
  const stem = useMemo(() => stemLength(lx), [lx])
  const [endings, setEndings] = useState(true)
  const [cases, setCases] = useState(new Set<Case>(CASES))
  const [cols, setCols] = useState(new Set<string>(lx.pos === 'adj' ? ['m', 'n', 'f', 'pl'] : ['sg', 'pl']))
  const [verbParts, setVerbParts] = useState(new Set<string>(['np', 'pst', 'imp']))
  const f = (slot: string) => formsOf(lx, slot)
  const th = 'px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-ink-soft'
  const td = 'border-t border-line px-2 py-2 align-top'
  const toggleEndings = (
    <label className="flex items-center gap-2 text-sm text-ink-soft">
      <input type="checkbox" checked={endings} onChange={(e) => setEndings(e.target.checked)} className="accent-red" /> highlight endings
    </label>
  )

  if (lx.pos === 'noun') {
    const loc2 = f('sg_loc2')
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chips label="Cases" all={CASES.map((c) => [c, CASE_ABBR[c]] as [Case, string])} on={cases} set={setCases} />
          <Chips label="Number" all={[['sg', 'singular'], ['pl', 'plural']]} on={cols} set={setCols} />
          {toggleEndings}
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>case</th>
              {cols.has('sg') && <th className={th}>singular</th>}
              {cols.has('pl') && <th className={th}>plural</th>}
            </tr>
          </thead>
          <tbody>
            {CASES.filter((c) => cases.has(c)).map((c) => (
              <tr key={c}>
                <td className={td}>
                  <div className="text-sm font-bold">{CASE_NAME[c]}</div>
                  <div className="ru text-xs text-ink-soft">{CASE_Q[c]}</div>
                </td>
                {cols.has('sg') && <td className={td}><Cell variants={f(`sg_${c}`)} stem={stem} show={endings} /></td>}
                {cols.has('pl') && <td className={td}><Cell variants={f(`pl_${c}`)} stem={stem} show={endings} /></td>}
              </tr>
            ))}
            {loc2.length > 0 && cases.has('prep') && (
              <tr>
                <td className={td}>
                  <div className="text-sm font-bold">locative</div>
                  <div className="ru text-xs text-ink-soft">в/на + где?</div>
                </td>
                <td className={td} colSpan={2}><Cell variants={loc2} stem={stem} show={endings} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  if (lx.pos === 'adj') {
    const gcols = (['m', 'n', 'f', 'pl'] as const).filter((g) => cols.has(g))
    const name = { m: 'masc.', n: 'neut.', f: 'fem.', pl: 'plural' }
    const short = ['short_m', 'short_n', 'short_f', 'short_pl'].map(f)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chips label="Cases" all={CASES.map((c) => [c, CASE_ABBR[c]] as [Case, string])} on={cases} set={setCases} />
          <Chips label="Gender" all={[['m', 'masc.'], ['n', 'neut.'], ['f', 'fem.'], ['pl', 'plural']]} on={cols} set={setCols} />
          {toggleEndings}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem]">
            <thead>
              <tr>
                <th className={th}>case</th>
                {gcols.map((g) => <th key={g} className={th}>{name[g]}</th>)}
              </tr>
            </thead>
            <tbody>
              {CASES.filter((c) => cases.has(c)).map((c) => (
                <tr key={c}>
                  <td className={`${td} text-sm font-bold`}>{CASE_NAME[c]}</td>
                  {gcols.map((g) => (
                    <td key={g} className={td}>
                      <Cell variants={f(`${g}_${c}`)} stem={stem} show={endings} />
                      {c === 'acc' && (g === 'm' || g === 'pl') && f(`${g}_acc_an`).length > 0 && (
                        <div className="mt-1 text-xs text-ink-soft">
                          animate: <Cell variants={f(`${g}_acc_an`)} stem={stem} show={endings} />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {short.some((x) => x.length) && (
                <tr>
                  <td className={`${td} text-sm font-bold`}>short</td>
                  {gcols.map((g) => <td key={g} className={td}><Cell variants={f(`short_${g}`)} stem={stem} show={false} /></td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(f('comp').length > 0 || f('sup').length > 0) && (
          <p className="text-sm">
            comparative: <Cell variants={f('comp')} stem={stem} show={false} /> · superlative: <Cell variants={f('sup')} stem={stem} show={false} />
          </p>
        )}
      </div>
    )
  }

  if (lx.pos === 'verb') {
    const persons = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl']
    const npName = lx.aspect === 'pf' ? 'future (perfective)' : 'present'
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chips label="Tenses" all={[['np', lx.aspect === 'pf' ? 'future' : 'present'], ['pst', 'past'], ['imp', 'imperative']]} on={verbParts} set={setVerbParts} />
          {toggleEndings}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {verbParts.has('np') && (
            <table>
              <thead><tr><th className={th} colSpan={2}>{npName}</th></tr></thead>
              <tbody>
                {persons.map((p) => (
                  <tr key={p}>
                    <td className={`${td} ru w-20 text-ink-soft`}>{PRONOUN[p]}</td>
                    <td className={td}><Cell variants={f(`np_${p}`)} stem={stem} show={endings} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="space-y-4">
            {verbParts.has('pst') && (
              <table className="w-full">
                <thead><tr><th className={th} colSpan={2}>past</th></tr></thead>
                <tbody>
                  {(['m', 'f', 'n', 'pl'] as const).map((g) => (
                    <tr key={g}>
                      <td className={`${td} ru w-20 text-ink-soft`}>{{ m: 'он', f: 'она́', n: 'оно́', pl: 'они́' }[g]}</td>
                      <td className={td}><Cell variants={f(`pst_${g}`)} stem={stem} show={endings} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {verbParts.has('imp') && (
              <table className="w-full">
                <thead><tr><th className={th} colSpan={2}>imperative</th></tr></thead>
                <tbody>
                  <tr><td className={`${td} ru w-20 text-ink-soft`}>ты</td><td className={td}><Cell variants={f('imp_sg')} stem={stem} show={endings} /></td></tr>
                  <tr><td className={`${td} ru w-20 text-ink-soft`}>вы</td><td className={td}><Cell variants={f('imp_pl')} stem={stem} show={endings} /></td></tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
        {lx.aspect === 'impf' && <p className="text-sm text-ink-soft">Future: бу́ду / бу́дешь / бу́дет… + infinitive.</p>}
      </div>
    )
  }
  return <p className="text-ink-soft">This word doesn't change its form.</p>
}

import { beforeAll, describe, expect, it } from 'vitest'
import type { Lexeme, Sentence } from '../types/content.gen'
import { loadChunk } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { examplesFor, loadSentences, soleLexeme, wordTokens } from '../lib/sentences'
import { normalizeAnswer } from './normalize'
import { matchingSlots } from './diagnose'
import { grade } from './grader'
import { GENERATORS, runDrill, type DrillContext } from './drills'
import { caseClozeItems, caseReason, findErrorItem, nounClass, patternItems, tilesItem, verbClozeItems } from './sentenceGen'

let lex: Map<string, Lexeme>
let sents: Sentence[]
let ctx: DrillContext

beforeAll(async () => {
  const all = [...(await loadChunk('A1')), ...(await loadChunk('A2')), ...(await loadChunk('B1'))]
  lex = new Map(all.map((x) => [x.id, x]))
  sents = [...(await loadSentences('A1')), ...(await loadSentences('A2'))]
  const vocab = ['n:книга', 'n:школа', 'n:дом', 'n:город', 'n:работа', 'n:друг'].map((i) => lex.get(i)!)
  ctx = { lexemes: lex, sentences: sents, vocab, pool: all.filter((x) => x.level === 'A1' || x.level === 'A2'), handwritten: new Map(), rng: mulberry32(9), hasVoice: false }
})

describe('sentences data', () => {
  it('token offsets cover words and readings are well-formed', () => {
    for (const s of sents.slice(0, 500)) {
      for (const t of wordTokens(s)) {
        expect(t.text).toMatch(/^[А-Яа-яЁё́-]+$/)
        for (const r of t.readings) expect(r.lex).toMatch(/^(n|v|a|o|name|pron|num|word):/)
      }
    }
  })
  it('finds examples for a word', () => {
    const ex = examplesFor('n:книга', sents)
    expect(ex.length).toBeGreaterThan(0)
    for (const s of ex) expect(wordTokens(s).some((t) => soleLexeme(t) === 'n:книга')).toBe(true)
  })
})

describe('why this case', () => {
  const tok = (text: string) => ({ start: 0, end: 0, text, readings: [{ lex: 'o:' + text, slot: '' }] })
  it('explains prepositions, negation and quantities', () => {
    expect(caseReason('prep', 'sg', tok('в'), undefined).tags).toContain('case.prep.location')
    expect(caseReason('acc', 'sg', tok('в'), undefined).tags).toContain('case.acc.direction')
    expect(caseReason('gen', 'sg', tok('без'), undefined).reason).toContain('genitive')
    expect(caseReason('gen', 'sg', tok('нет'), undefined).tags).toContain('case.gen.negation')
    expect(caseReason('gen', 'pl', tok('много'), undefined).tags).toContain('case.gen.quantity')
    expect(caseReason('ins', 'sg', tok('с'), undefined).tags).toContain('case.ins.with')
    expect(caseReason('ins', 'sg', tok('с'), undefined).governor).toBe('с')
  })
})

describe('sentence generators', () => {
  it('case cloze: gap, governor, reason, self-consistent answer', () => {
    let n = 0
    for (const s of sents) {
      for (const it of caseClozeItems(s, lex, { rng: mulberry32(1) })) {
        n++
        expect(it.prompt.ru).toContain('___')
        expect(it.reason).toBeTruthy()
        const v = grade(it, { kind: 'text', text: it.accept![0]! }, { lexemes: lex })
        expect(v.correct, it.id).toBe(true)
        // the gapped word put back gives the original sentence
        expect(normalizeAnswer(it.prompt.ru!.replace('___', it.accept![0]!))).toBe(normalizeAnswer(s.ru))
      }
      if (n > 200) break
    }
    expect(n).toBeGreaterThan(100)
  })
  it('case cloze can be restricted to a case and a context', () => {
    const items = sents.flatMap((s) => caseClozeItems(s, lex, { cases: ['prep'], tags: ['case.prep.location'], rng: mulberry32(2) }))
    expect(items.length).toBeGreaterThan(20)
    for (const it of items) expect(it.tags).toContain('case.prep.location')
    expect(items.some((it) => it.prompt.governor === 'в' || it.prompt.governor === 'на')).toBe(true)
  })
  it('verb cloze', () => {
    const items = sents.slice(0, 400).flatMap((s) => verbClozeItems(s, lex, ['pst']))
    expect(items.length).toBeGreaterThan(10)
    for (const it of items) expect(it.target!.slot.startsWith('pst')).toBe(true)
  })
  it('find-error swaps exactly one word for a wrong form', () => {
    let n = 0
    for (const s of sents.slice(0, 300)) {
      const it = findErrorItem(s, lex, mulberry32(3))
      if (!it) continue
      n++
      const words = it.prompt.ru!.split(/\s+/)
      const orig = s.ru.split(/\s+/)
      expect(words.length).toBe(orig.length)
      expect(normalizeAnswer(words[it.errorIndex!]!)).not.toBe(normalizeAnswer(orig[it.errorIndex!]!))
      expect(grade(it, { kind: 'index', index: it.errorIndex! }).correct).toBe(true)
      // the planted form keeps the number: only the case is wrong
      const lx = lex.get(it.target!.lex)!
      const slots = matchingSlots(lx, normalizeAnswer(words[it.errorIndex!]!))
      for (const sl of slots) expect(sl.split('_')[0]).toBe(it.target!.slot.split('_')[0])
    }
    expect(n).toBeGreaterThan(10)
  })
  it('tiles: the original words in order are correct', () => {
    for (const s of sents.slice(0, 200)) {
      const it = tilesItem(s, lex, mulberry32(4))
      if (!it) continue
      const words = wordTokens(s).map((t) => t.text)
      expect(grade(it, { kind: 'tiles', tiles: words }).correct).toBe(true)
    }
  })
  it('declension classes and pattern drills', () => {
    expect(nounClass(lex.get('n:книга')!)).toBe('fem-a')
    expect(nounClass(lex.get('n:дверь')!)).toBe('fem-soft')
    expect(nounClass(lex.get('n:стол')!)).toBe('masc-hard')
    expect(nounClass(lex.get('n:имя')!)).toBe('neut-mya')
    const items = patternItems(ctx.pool, 'fem-a', ['pl_gen'], mulberry32(5), 10)
    expect(items).toHaveLength(10)
    for (const it of items) expect(it.target!.slot).toBe('pl_gen')
  })
})

describe('drill registry', () => {
  it('every generator produces gradable items', () => {
    for (const name of Object.keys(GENERATORS)) {
      const items = runDrill({ generator: name, count: 4 }, ctx)
      expect(items.length, name).toBeGreaterThan(0)
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    }
  })
  it('hand-written items are included by id', () => {
    const hw = { id: 'x:hw', type: 'choice' as const, level: 'A2' as const, tags: ['vocab'] as [string], prompt: {}, choices: ['a', 'b'], answerIndex: 0 }
    const items = runDrill({ items: ['x:hw'] }, { ...ctx, handwritten: new Map([['x:hw', hw]]) })
    expect(items).toEqual([hw])
  })
})

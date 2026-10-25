import { beforeAll, describe, expect, it } from 'vitest'
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { loadChunk, primaryForm } from '../lib/lexicon'
import { mulberry32 } from '../lib/rng'
import { stressIndex } from '../lib/ru'
import { diagnoseForm, matchingSlots, stemLength } from './diagnose'
import {
  buildPracticeSession, choiceItem, drillableSlots, gloss, isDrillable, matchItem, spellingFakes, stressItem, transformItem,
} from './generators'
import { choiceOptions, diffWords, grade, isStemTypo } from './grader'
import { editDistance, normalizeAnswer } from './normalize'
import { slotLabel } from './slots'
import { translitToCyrillic } from './translit'

let lex: Map<string, Lexeme>
const L = (id: string) => lex.get(id)!

beforeAll(async () => {
  const all = [...(await loadChunk('A1')), ...(await loadChunk('A2')), ...(await loadChunk('B1'))]
  lex = new Map(all.map((x) => [x.id, x]))
})

describe('normalizeAnswer', () => {
  it('ignores stress, case, ё/е, punctuation and spacing', () => {
    expect(normalizeAnswer('  Ещё́ РУ́КУ!  ')).toBe('еще руку')
    expect(normalizeAnswer('«В лесу́», — сказа́л он.')).toBe('в лесу сказал он')
    expect(normalizeAnswer('кто-нибудь')).toBe('кто-нибудь')
  })
  it('repairs Latin look-alikes inside Cyrillic words', () => {
    expect(normalizeAnswer('кнuгa'.replace('u', 'и'))).toBe('книга')
    expect(normalizeAnswer('мoлoкo')).toBe('молоко')
  })
  it('edit distance counts transpositions as one', () => {
    expect(editDistance('книга', 'кнгиа')).toBe(1)
    expect(editDistance('книга', 'книги')).toBe(1)
  })
})

describe('translit', () => {
  it('converts phonetic Latin to Cyrillic, longest match first', () => {
    expect(translitToCyrillic('shchi')).toBe('щи')
    expect(translitToCyrillic("zhizn'")).toBe('жизнь')
    expect(translitToCyrillic('Privet, kak dela?')).toBe('Привет, как дела?')
    expect(translitToCyrillic('yolka')).toBe('ёлка')
    expect(translitToCyrillic('ehto')).toBe('это')
    expect(translitToCyrillic('novye')).toBe('новые')
    expect(translitToCyrillic('уже')).toBe('уже')
  })
})

describe('diagnosis against the paradigm', () => {
  it('finds which slot a wrong form belongs to', () => {
    expect(matchingSlots(L('n:книга'), 'книгу')).toContain('sg_acc')
  })
  it('accusative instead of prepositional (в + location)', () => {
    const d = diagnoseForm(L('n:школа'), 'sg_prep', 'школу', ['case.prep.location'])!
    expect(d.errorType).toBe('case.acc-for-prep')
    expect(d.message).toContain('accusative')
    expect(d.message).toContain('шко́ле')
  })
  it('right case, wrong number', () => {
    expect(diagnoseForm(L('n:книга'), 'sg_ins', 'книгами')!.errorType).toBe('number.wrong')
  })
  it('dictionary form left unchanged', () => {
    expect(diagnoseForm(L('n:книга'), 'pl_gen', 'книга')!.errorType).toBe('case.nom-default')
  })
  it('7-letter spelling rule', () => {
    const d = diagnoseForm(L('n:книга'), 'pl_nom', 'книгы')!
    expect(d.errorType).toBe('spelling.7-letter')
  })
  it('fleeting vowel', () => {
    expect(diagnoseForm(L('n:отец'), 'sg_gen', 'отеца')!.errorType).toBe('spelling.fleeting-vowel')
  })
  it('invented ending on a correct stem', () => {
    expect(diagnoseForm(L('n:книга'), 'sg_dat', 'книгю')!.errorType).toBe('ending.invented')
  })
  it('verb person and past-tense gender', () => {
    expect(diagnoseForm(L('v:говорить'), 'np_1sg', 'говорит')!.errorType).toBe('verb.person')
    expect(diagnoseForm(L('v:читать'), 'pst_f', 'читал')!.errorType).toBe('verb.past-gender')
  })
  it('adjective agreement', () => {
    expect(diagnoseForm(L('a:новый'), 'f_ins', 'новым')!.errorType).toBe('agreement.gender')
  })
  it('stem length excludes the endings', () => {
    expect(stemLength(L('n:книга'))).toBe(4) // книг-
  })
})

describe('grader: typed answers', () => {
  const item = (lx: string, slot: string, tags?: string[]): ExerciseItem => {
    const it = transformItem(L(lx), slot)
    if (tags) it.tags = tags as [string, ...string[]]
    return it
  }
  const g = (it: ExerciseItem, text: string) => grade(it, { kind: 'text', text }, { lexemes: lex })

  it('accepts the right form regardless of stress marks, case and ё', () => {
    expect(g(item('n:книга', 'pl_gen'), 'КНИГ').correct).toBe(true)
    const v = g(item('v:идти', 'np_2sg'), 'идешь')
    expect(v.correct).toBe(true)
    expect(v.note).toBe('yo')
    expect(v.expected).toBe('идёшь')
  })
  it('tolerates one typo in the stem but never in the ending', () => {
    expect(isStemTypo('кнмгами', 'книгами', 4)).toBe(true)
    expect(isStemTypo('книгамм', 'книгами', 4)).toBe(false)
    const v = g(item('n:книга', 'pl_ins'), 'кнмгами')
    expect(v.correct).toBe(true)
    expect(v.note).toBe('typo')
    expect(g(item('n:книга', 'pl_ins'), 'книгаим').correct).toBe(false)
  })
  it('a real form of the wrong slot is a grammar error, not a typo', () => {
    const v = g(item('n:школа', 'sg_prep', ['case.prep.location']), 'школу')
    expect(v.correct).toBe(false)
    expect(v.errorType).toBe('case.acc-for-prep')
  })
  it('uses distractor error mapping first', () => {
    const it = item('n:книга', 'pl_nom')
    it.distractors = [{ ru: 'книгы', error: 'spelling.7-letter', why: 'After г write и.' }]
    const v = g(it, 'книгы')
    expect(v.errorType).toBe('spelling.7-letter')
    expect(v.message).toBe('After г write и.')
  })
  it('accepts rare variants but shows the taught form first', () => {
    const it = item('n:год', 'pl_nom')
    expect(it.accept![0]).toBe('го́ды')
    expect(g(it, 'лета').correct).toBe(true)
  })
  it('multi-word answers: one stem typo allowed, heuristic stem', () => {
    const it: ExerciseItem = { id: 'x:1', type: 'cloze', level: 'A2', tags: ['vocab'], prompt: {}, accept: ['в большо́м го́роде'] }
    expect(grade(it, { kind: 'text', text: 'в болшом городе' }).correct).toBe(true)
    expect(grade(it, { kind: 'text', text: 'в большой городе' }).correct).toBe(false)
  })
})

describe('grader: other item types', () => {
  it('choice with paradigm distractors and diagnostics', () => {
    const it = choiceItem(L('n:книга'), 'pl_gen', mulberry32(1))!
    expect(it.distractors!.length).toBeGreaterThanOrEqual(2)
    const wrongOpt = it.distractors![0]!
    const v = grade(it, { kind: 'choice', value: wrongOpt.ru }, { lexemes: lex })
    expect(v.correct).toBe(false)
    expect(v.errorType).toBe(wrongOpt.error)
    expect(grade(it, { kind: 'choice', value: 'книг' }).correct).toBe(true)
    const opts = choiceOptions(it, mulberry32(2))
    expect(opts).toContain(it.accept![0])
    expect(new Set(opts).size).toBe(opts.length)
  })
  it('choice with English options', () => {
    const it: ExerciseItem = { id: 'x:2', type: 'choice', level: 'A1', tags: ['vocab'], prompt: { ru: 'дом' }, choices: ['house', 'cat'], answerIndex: 0 }
    expect(grade(it, { kind: 'choice', value: 'house' }).correct).toBe(true)
    expect(grade(it, { kind: 'choice', value: 'cat' }).errorType).toBe('vocab.wrong-word')
  })
  it('stress taps', () => {
    const it: ExerciseItem = { id: 'x:3', type: 'stress', level: 'A1', tags: ['stress'], prompt: {}, stressWord: 'ру́ку' }
    expect(grade(it, { kind: 'stress', vowelIndex: 0 }).correct).toBe(true)
    const v = grade(it, { kind: 'stress', vowelIndex: 1 })
    expect(v.correct).toBe(false)
    expect(v.errorType).toBe('stress.wrong')
  })
  it('tiles: wrong ending tile and word order', () => {
    const it: ExerciseItem = {
      id: 'x:4', type: 'tiles', level: 'A2', tags: ['case.prep.location'], prompt: {},
      accept: ['Я живу́ в Москве́'], tiles: ['Я', 'живу́', 'в', 'Москве́', 'Москву́'],
      distractors: [{ ru: 'Москву́', error: 'case.acc-for-prep' }],
    }
    expect(grade(it, { kind: 'tiles', tiles: ['Я', 'живу́', 'в', 'Москве́'] }).correct).toBe(true)
    expect(grade(it, { kind: 'tiles', tiles: ['Я', 'живу́', 'в', 'Москву́'] }).errorType).toBe('case.acc-for-prep')
    expect(grade(it, { kind: 'tiles', tiles: ['живу́', 'Я', 'Москве́', 'в'] }).errorType).toBe('word-order.unnatural')
  })
  it('find-error, match and self-graded', () => {
    const fe: ExerciseItem = { id: 'x:5', type: 'find-error', level: 'A2', tags: ['case.prep.location'], prompt: { ru: 'Я живу́ в Москву́' }, errorIndex: 3, accept: ['Я живу́ в Москве́'], distractors: [{ ru: 'Москву́', error: 'case.acc-for-prep' }] }
    expect(grade(fe, { kind: 'index', index: 3 }).correct).toBe(true)
    expect(grade(fe, { kind: 'index', index: 1 }).errorType).toBe('case.acc-for-prep')
    const m: ExerciseItem = { id: 'x:6', type: 'match', level: 'A1', tags: ['vocab'], prompt: {}, pairs: [['дом', 'house']] }
    expect(grade(m, { kind: 'match', mistakes: 0 }).correct).toBe(true)
    expect(grade(m, { kind: 'match', mistakes: 2 }).correct).toBe(false)
    const sg: ExerciseItem = { id: 'x:7', type: 'self-graded', level: 'B1', tags: ['vocab'], prompt: {}, model: 'Приве́т' }
    expect(grade(sg, { kind: 'self', ok: true }).correct).toBe(true)
  })
  it('dictation diffs word by word', () => {
    const it: ExerciseItem = { id: 'x:8', type: 'dictation', level: 'A2', tags: ['listening'], prompt: { audio: 'x' }, accept: ['Я иду́ домо́й.'] }
    expect(grade(it, { kind: 'text', text: 'я иду домой' }).correct).toBe(true)
    const v = grade(it, { kind: 'text', text: 'я еду домой сейчас' })
    expect(v.correct).toBe(false)
    expect(v.diff!.map((t) => t.status)).toEqual(['ok', 'wrong', 'ok', 'extra'])
    expect(diffWords(['a', 'b'], ['a'])).toEqual([{ text: 'a', status: 'ok' }, { text: 'b', status: 'missing' }])
  })
})

describe('generators', () => {
  it('only drills verified forms that differ from the lemma', () => {
    const slots = drillableSlots(L('n:книга'))
    expect(slots).toContain('pl_gen')
    expect(slots).not.toContain('sg_nom')
    for (const s of slots) expect(primaryForm(L('n:книга'), s)).toBeTruthy()
  })
  it('transform items carry target, tags and stressed accepts', () => {
    const it = transformItem(L('n:книга'), 'pl_ins')
    expect(it.accept![0]).toBe('кни́гами')
    expect(it.tags).toEqual(['case.ins', 'case.plural'])
    expect(it.prompt.instruction).toBe(`Put into the ${slotLabel('noun', 'pl_ins')}`)
  })
  it('spelling fakes break exactly one rule', () => {
    expect(spellingFakes('кни́ги')).toContainEqual({ ru: 'кни́гы', error: 'spelling.7-letter' })
  })
  it('stress items prefer shifting stress', () => {
    const it = stressItem(L('n:рука'), mulberry32(3))!
    expect(stressIndex(it.stressWord!)).not.toBeNull()
  })
  it('match items have distinct glosses', () => {
    const lxs = ['n:дом', 'n:книга', 'n:рука', 'n:город', 'n:время'].map(L)
    const m = matchItem(lxs)!
    expect(new Set(m.pairs!.map((p) => p[1])).size).toBe(m.pairs!.length)
    expect(gloss(L('n:дом'))).toBe('house')
  })
  it('builds a deterministic mixed session of drillable items', () => {
    const pool = [...lex.values()].filter((x) => x.level === 'A1' || x.level === 'A2')
    const a = buildPracticeSession(pool, { rng: mulberry32(42), count: 20, hasVoice: false })
    const b = buildPracticeSession(pool, { rng: mulberry32(42), count: 20, hasVoice: false })
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id))
    expect(a.length).toBeGreaterThanOrEqual(20)
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length)
    expect(a.some((i) => i.type === 'listen-choose' || i.type === 'dictation')).toBe(false)
    for (const it of a) if (it.target) expect(isDrillable(L(it.target.lex))).toBe(true)
    // every generated item grades its own first accepted answer as correct
    for (const it of a) {
      if (it.type === 'transform' || it.type === 'choice') {
        const v = it.choices
          ? grade(it, { kind: 'choice', value: it.choices[it.answerIndex!]! })
          : grade(it, { kind: it.type === 'choice' ? 'choice' : 'text', ...(it.type === 'choice' ? { value: it.accept![0]! } : { text: it.accept![0]! }) } as never, { lexemes: lex })
        expect(v.correct, it.id).toBe(true)
      }
    }
  })
})

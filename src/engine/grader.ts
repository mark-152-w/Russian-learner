// The diagnostic grader. Pure: (item, response, lexemes) → verdict. No I/O.
import type { ExerciseItem, Lexeme } from '../types/content.gen'
import { fold, stressIndex, stripStress } from '../lib/ru'
import { diagnoseForm, stemLength } from './diagnose'
import { editDistance, missedYo, normalizeAnswer } from './normalize'

export type Response =
  | { kind: 'text'; text: string }
  | { kind: 'choice'; value: string }
  | { kind: 'tiles'; tiles: string[] }
  | { kind: 'stress'; vowelIndex: number }
  | { kind: 'index'; index: number }
  | { kind: 'match'; mistakes: number }
  | { kind: 'self'; ok: boolean }

export interface DiffToken {
  text: string
  status: 'ok' | 'wrong' | 'missing' | 'extra'
  expected?: string
}

export interface Verdict {
  correct: boolean
  /** Canonical correct answer, stressed. */
  expected: string
  /** The learner's answer as shown back. */
  given?: string
  /** Error taxonomy id (src/data/errors.json) when wrong. */
  errorType?: string
  /** Markdown-lite diagnostic. */
  message?: string
  /** Accepted, but worth a remark. */
  note?: 'typo' | 'yo' | 'order'
  noteText?: string
  diff?: DiffToken[]
  /** choice-reason: the one-line reason, shown either way. */
  reason?: string
}

export interface GradeContext {
  lexemes?: Map<string, Lexeme>
}

/**
 * One-character typo allowed only inside the stem: the ending must be exactly right.
 * `stemLen` is the length of the shared stem of the expected word (0 = no tolerance).
 */
export function isStemTypo(response: string, expected: string, stemLen: number): boolean {
  if (stemLen < 3 || response === expected || stemLen > expected.length) return false
  const ending = expected.slice(stemLen)
  if (!response.endsWith(ending)) return false
  const rStem = response.slice(0, response.length - ending.length)
  return rStem.length >= stemLen - 1 && editDistance(rStem, expected.slice(0, stemLen)) === 1
}

/** Heuristic stem for words not tied to a lexeme: everything but the last 3 letters of long words. */
const heuristicStem = (w: string) => (w.length >= 6 ? w.length - 3 : 0)

function typoMatch(resp: string, accept: string, lexStem: number | null): boolean {
  const rw = resp.split(' ')
  const aw = accept.split(' ')
  if (rw.length !== aw.length) return false
  const diffs = rw.map((w, i) => (w === aw[i] ? -1 : i)).filter((i) => i >= 0)
  if (diffs.length !== 1) return false
  const i = diffs[0]!
  const stem = lexStem !== null && aw.length === 1 ? lexStem : heuristicStem(aw[i]!)
  return isStemTypo(rw[i]!, aw[i]!, stem)
}

function lexemeFor(item: ExerciseItem, ctx?: GradeContext): Lexeme | undefined {
  return item.target ? ctx?.lexemes?.get(item.target.lex) : undefined
}

function wrong(item: ExerciseItem, given: string, errorType: string, message?: string): Verdict {
  return { correct: false, expected: item.accept?.[0] ?? '', given, errorType, message }
}

function gradeText(item: ExerciseItem, raw: string, ctx?: GradeContext): Verdict {
  const accepts = item.accept ?? []
  const resp = normalizeAnswer(raw)
  const given = raw.trim()
  if (!resp) return wrong(item, given, item.distractors?.[0]?.error ?? 'case.wrong', 'No answer given.')

  const exact = accepts.find((a) => normalizeAnswer(a) === resp)
  if (exact) {
    const v: Verdict = { correct: true, expected: exact, given }
    if (missedYo(raw, exact)) {
      v.note = 'yo'
      v.noteText = `Accepted. It's spelt with ё: **${exact}**.`
    }
    return v
  }

  const d = item.distractors?.find((x) => normalizeAnswer(x.ru) === resp)
  if (d) return wrong(item, given, d.error, d.why)

  const lx = lexemeFor(item, ctx)
  const tags = item.tags ?? []
  // A real form of the same word in the wrong slot is a grammar error, never a typo.
  if (lx && item.target) {
    const diag = diagnoseForm(lx, item.target.slot, resp, tags)
    if (diag?.matchedSlot) return wrong(item, given, diag.errorType, diag.message)
  }

  const lexStem = lx ? stemLength(lx) : null
  const typo = accepts.find((a) => typoMatch(resp, normalizeAnswer(a), lexStem))
  if (typo) return { correct: true, expected: typo, given, note: 'typo', noteText: `Accepted with a typo in the stem: **${typo}**.` }

  if (lx && item.target) {
    const diag = diagnoseForm(lx, item.target.slot, resp, tags)
    if (diag) return wrong(item, given, diag.errorType, diag.message)
  }
  const msg = lx ? `${given} isn't a form of **${lx.lemma}**.` : undefined
  return wrong(item, given, item.distractors?.[0]?.error ?? 'vocab.wrong-word', msg)
}

function gradeChoice(item: ExerciseItem, value: string, ctx?: GradeContext): Verdict {
  const reason = item.reason
  if (item.choices && item.answerIndex !== undefined) {
    const answer = item.choices[item.answerIndex]!
    const ok = value === answer
    return { correct: ok, expected: answer, given: value, reason, errorType: ok ? undefined : item.distractors?.[0]?.error ?? 'vocab.wrong-word' }
  }
  const resp = normalizeAnswer(value)
  const hit = (item.accept ?? []).find((a) => normalizeAnswer(a) === resp)
  if (hit) return { correct: true, expected: hit, given: value, reason }
  const d = item.distractors?.find((x) => normalizeAnswer(x.ru) === resp)
  const lx = lexemeFor(item, ctx)
  const diag = lx && item.target ? diagnoseForm(lx, item.target.slot, resp, item.tags) : null
  return {
    correct: false,
    expected: item.accept?.[0] ?? '',
    given: value,
    reason,
    errorType: d?.error ?? diag?.errorType ?? 'case.wrong',
    message: d?.why ?? diag?.message,
  }
}

/** Word-level LCS alignment for dictation. Expected words keep their display form. */
export function diffWords(expectedDisplay: string[], got: string[]): DiffToken[] {
  const E = expectedDisplay.map((w) => normalizeAnswer(w))
  const G = got.map((w) => normalizeAnswer(w))
  const n = E.length
  const m = G.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i]![j] = E[i] === G[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
  const raw: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && E[i] === G[j]) {
      raw.push({ text: expectedDisplay[i]!, status: 'ok' })
      i++
      j++
    } else if (j < m && (i >= n || L[i]![j + 1]! >= L[i + 1]![j]!)) {
      raw.push({ text: got[j]!, status: 'extra' })
      j++
    } else {
      raw.push({ text: expectedDisplay[i]!, status: 'missing' })
      i++
    }
  }
  // an extra word next to a missing one is really one misheard word
  const out: DiffToken[] = []
  for (let k = 0; k < raw.length; k++) {
    const a = raw[k]!
    const c = raw[k + 1]
    if (c && ((a.status === 'extra' && c.status === 'missing') || (a.status === 'missing' && c.status === 'extra'))) {
      const typed = a.status === 'extra' ? a : c
      const exp = a.status === 'missing' ? a : c
      out.push({ text: typed.text, status: 'wrong', expected: exp.text })
      k++
    } else out.push(a)
  }
  return out
}

function gradeDictation(item: ExerciseItem, raw: string): Verdict {
  const expected = item.accept?.[0] ?? ''
  const expWords = expected.split(/\s+/).filter((w) => normalizeAnswer(w))
  const accepted = (item.accept ?? []).some((a) => normalizeAnswer(a) === normalizeAnswer(raw))
  const diff = diffWords(expWords, raw.split(/\s+/).filter((w) => normalizeAnswer(w)))
  const ok = accepted || diff.every((t) => t.status === 'ok')
  const v: Verdict = { correct: ok, expected, given: raw.trim(), diff }
  if (!ok) {
    const bad = diff.filter((t) => t.status !== 'ok').length
    v.errorType = 'listening.misheard'
    v.message = `${bad} word${bad === 1 ? '' : 's'} to fix.`
  }
  return v
}

function gradeTiles(item: ExerciseItem, tiles: string[]): Verdict {
  const sentence = tiles.join(' ')
  const resp = normalizeAnswer(sentence)
  const accepts = item.accept ?? []
  const hit = accepts.find((a) => normalizeAnswer(a) === resp)
  if (hit) return { correct: true, expected: hit, given: sentence }
  const sorted = (s: string) => normalizeAnswer(s).split(' ').sort().join(' ')
  const sameWords = accepts.find((a) => sorted(a) === sorted(sentence))
  if (sameWords) {
    // Russian word order is flexible: the right words in another order count, with the original shown.
    return { correct: true, expected: sameWords, given: sentence, note: 'order', noteText: `Word order is flexible in Russian. The original: **${sameWords}**` }
  }
  for (const t of tiles) {
    const d = item.distractors?.find((x) => normalizeAnswer(x.ru) === normalizeAnswer(t))
    if (d) return wrong(item, sentence, d.error, d.why ?? `**${t}** doesn't fit here.`)
  }
  return wrong(item, sentence, 'case.wrong', `The sentence is: **${accepts[0] ?? ''}**`)
}

function gradeStress(item: ExerciseItem, vowelIndex: number): Verdict {
  const word = item.stressWord ?? ''
  const ok = stressIndex(word) === vowelIndex
  return ok
    ? { correct: true, expected: word }
    : { correct: false, expected: word, errorType: 'stress.wrong', message: `The stress falls here: **${word}**.` }
}

function gradeFindError(item: ExerciseItem, index: number): Verdict {
  const ok = index === item.errorIndex
  const expected = item.accept?.[0] ?? ''
  return ok
    ? { correct: true, expected, message: item.explanation }
    : {
        correct: false,
        expected,
        errorType: item.distractors?.[0]?.error ?? 'case.wrong',
        message: `The mistake was elsewhere. Correct: **${expected}**.${item.explanation ? ' ' + item.explanation : ''}`,
      }
}

export function grade(item: ExerciseItem, response: Response, ctx?: GradeContext): Verdict {
  const v = gradeAny(item, response, ctx)
  if (item.reason && !v.reason) v.reason = item.reason
  return v
}

function gradeAny(item: ExerciseItem, response: Response, ctx?: GradeContext): Verdict {
  switch (response.kind) {
    case 'text':
      return item.type === 'dictation' ? gradeDictation(item, response.text) : gradeText(item, response.text, ctx)
    case 'choice':
      return gradeChoice(item, response.value, ctx)
    case 'tiles':
      return gradeTiles(item, response.tiles)
    case 'stress':
      return gradeStress(item, response.vowelIndex)
    case 'index':
      return gradeFindError(item, response.index)
    case 'match':
      return response.mistakes === 0
        ? { correct: true, expected: '' }
        : { correct: false, expected: '', errorType: 'vocab.wrong-word', message: `${response.mistakes} mismatched pair${response.mistakes === 1 ? '' : 's'}.` }
    case 'self':
      return { correct: response.ok, expected: item.model ?? '' }
  }
}

/** Options for a choice item (correct answer + distractors), in a stable shuffled order. */
export function choiceOptions(item: ExerciseItem, rng: () => number): string[] {
  if (item.choices) return item.choices
  const opts = [item.accept?.[0] ?? '', ...(item.distractors ?? []).map((d) => d.ru)]
  const uniq = [...new Map(opts.map((o) => [fold(stripStress(o)), o])).values()]
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[uniq[i], uniq[j]] = [uniq[j]!, uniq[i]!]
  }
  return uniq
}

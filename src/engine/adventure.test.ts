import { describe, expect, it } from 'vitest'
import type { AdventureChapter } from '../types/content.gen'
import { grade } from './grader'
import { availableChoices, parse, worldFor, type Outcome } from './adventure'

const files = import.meta.glob<{ default: AdventureChapter }>('../data/content/adventure/*.json', { eager: true })
const chapters = Object.values(files).map((m) => m.default).sort((a, b) => a.chapter - b.chapter)
const ch = (n: number) => chapters.find((c) => c.chapter === n)!

function run(n: number, start: string, commands: string[], flags = new Set<string>()) {
  const world = worldFor(chapters, n)
  let scene = start
  const out: Outcome[] = []
  for (const c of commands) {
    const o = parse(c, ch(n).scenes[scene]!, scene, world, flags)
    out.push(o)
    if (o.kind === 'move') {
      o.sets.forEach((f) => flags.add(f))
      scene = o.to
    }
  }
  return { scene, out, flags }
}

describe('adventure data', () => {
  it('every scene link resolves, every chapter can end, and every gate grades', () => {
    expect(chapters.map((c) => c.chapter)).toEqual([1, 2, 3, 4, 5])
    for (const c of chapters) {
      const ids = new Set(Object.keys(c.scenes))
      expect(ids.has(c.start)).toBe(true)
      expect(Object.values(c.scenes).some((s) => s.end)).toBe(true)
      for (const s of Object.values(c.scenes)) {
        for (const to of [...Object.values(s.exits ?? {}), ...(s.choices ?? []).map((x) => x.to), ...(s.commands ?? []).map((x) => x.to)]) expect(ids.has(to), `${c.id} → ${to}`).toBe(true)
        for (const x of s.choices ?? []) if (x.check) expect(grade(x.check, { kind: 'choice', value: x.check.accept![0]! }, {}).correct).toBe(true)
        const world = worldFor(chapters, c.chapter)
        for (const cmd of s.commands ?? []) {
          expect(world.verbs.some((v) => v.id === cmd.verb), cmd.verb).toBe(true)
          for (const it of [cmd.object, cmd.topic]) if (it) expect(world.items[it], `${c.id}: ${it}`).toBeTruthy()
        }
      }
    }
  })

  it('choices wait for their flags', () => {
    const museum = ch(1).scenes.museum!
    expect(availableChoices(museum, new Set()).map((x) => x.open)).toEqual([true, true, false])
    expect(availableChoices(museum, new Set(['talked_nina', 'talked_oleg']))[2]!.open).toBe(true)
  })
})

describe('parser', () => {
  it('plays chapter 3 to the end', () => {
    const r = run(3, 'gate', ['иди в сарай', 'осмотри ящик', 'возьми ключ', 'иди на улицу', 'иди к дому', 'открой дверь', 'возьми телефон', 'открой сумку'])
    expect(r.scene).toBe('end')
    expect(r.out.every((o) => o.kind === 'move')).toBe(true)
  })

  it('explains a wrong case after a verb', () => {
    const r = run(3, 'shed', ['осмотри ящик', 'возьми ключа'])
    const o = r.out[1]!
    expect(o.kind).toBe('grammar')
    if (o.kind === 'grammar') {
      expect(o.en).toContain('возьми́ ключ')
      expect(o.en).toContain('genitive')
      expect(o.graded.tag).toBe('case.acc.direct-object')
    }
  })

  it('explains where vs where to, and accepts good Russian that leads nowhere', () => {
    const [a] = run(3, 'gate', ['иди в сарае']).out
    expect(a!.kind).toBe('grammar')
    if (a!.kind === 'grammar') expect(a!.en).toMatch(/в сара́й.*accusative|accusative.*в сара́й/)
    const [b] = run(3, 'gate', ['иди сарай']).out
    expect(b!.kind).toBe('grammar')
    const [c] = run(3, 'shed', ['осмотри велосипед']).out
    expect(c).toMatchObject({ kind: 'move', to: 'shed' })
    const [d] = run(3, 'gate', ['открой дверь']).out
    expect(d).toMatchObject({ kind: 'say', ok: true })
  })

  it('checks prepositions and the dative in chapter 4', () => {
    let r = run(4, 'buffet', ['поговори Мишей'])
    expect(r.out[0]!.kind).toBe('grammar')
    r = run(4, 'buffet', ['поговори с Мишу'])
    expect(r.out[0]!.kind).toBe('grammar')
    r = run(4, 'office', ['спроси о Мише', 'спроси про Мишу'])
    expect(r.out[0]!.kind).toBe('move')
    expect(r.out[1]!.kind).toBe('grammar')
    r = run(4, 'buffet', ['поговори с парнем', 'покажи телефон Мишу'])
    expect(r.out[1]!.kind).toBe('grammar')
    r = run(4, 'buffet', ['поговори с парнем', 'покажи телефон Мише'])
    expect(r.scene).toBe('confess')
    r = run(4, 'buffet', ['поговори с парнем', 'покажи Мише билет'])
    expect(r.scene).toBe('confess')
  })

  it('finishes with на + accusative in chapter 5', () => {
    expect(run(5, 'return', ['открой коробку', 'поставь самовар на столе']).out[1]!.kind).toBe('grammar')
    expect(run(5, 'return', ['открой коробку', 'поставь самовар на стол']).scene).toBe('placed')
    expect(run(5, 'return', ['открой коробку', 'отдай самовар Нине']).scene).toBe('placed')
  })

  it('helps with unknown verbs', () => {
    const [o] = run(3, 'gate', ['прыгай']).out
    expect(o!.kind).toBe('say')
    expect(run(3, 'gate', ['помощь']).out[0]!.kind).toBe('help')
  })
})

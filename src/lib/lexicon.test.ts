import { describe, expect, it, vi } from 'vitest'
import { decodeCell, formsOf, loadChunk, loadLexemes, primaryForm, SLOTS } from './lexicon'
import { fold, stressIndex, stripStress } from './ru'
import { loadStory, STORY_INDEX } from './stories'

// The rare tail's index is a 2.7 MB runtime-cached download: content must never need it.
vi.mock('../data/lexicon/index-ext.json', () => {
  throw new Error('the rare-tail index was loaded')
})

describe('decodeCell', () => {
  it('decodes variants and markers', () => {
    expect(decodeCell('го́ды|*лета́|?годы')).toEqual([
      { form: 'го́ды', rare: false, unverified: false, usable: true },
      { form: 'лета́', rare: true, unverified: false, usable: false },
      { form: 'годы', rare: false, unverified: true, usable: false },
    ])
    expect(decodeCell('')).toEqual([])
  })
})

describe('generated lexicon', () => {
  it('has slot tables for every pos', () => {
    expect(SLOTS.noun).toContain('pl_gen')
    expect(SLOTS.verb[0]).toBe('inf')
  })

  it('loads A1 and exposes corrected, stressed forms', async () => {
    const a1 = await loadChunk('A1')
    const god = a1.find((x) => x.id === 'n:год')!
    expect(primaryForm(god, 'pl_nom')).toBe('го́ды')
    expect(primaryForm(god, 'sg_loc2')).toBe('году́')
    const ruka = a1.find((x) => x.id === 'n:рука')!
    // mobile stress: рука́ → ру́ку
    expect(stressIndex(primaryForm(ruka, 'sg_nom')!)).toBe(1)
    expect(stressIndex(primaryForm(ruka, 'sg_acc')!)).toBe(0)
  })

  it('A1 chunk is ranked and every usable polysyllabic form is stressed', async () => {
    const a1 = await loadChunk('A1')
    expect(a1.length).toBeGreaterThan(500)
    for (const lx of a1) {
      expect(lx.level).toBe('A1')
      for (const slot of SLOTS[lx.pos]) {
        for (const v of formsOf(lx, slot)) {
          if (!v.usable) continue
          const needs = [...stripStress(v.form)].filter((c) => 'аеёиоуыэюя'.includes(c.toLowerCase())).length > 1
          if (needs) expect(stressIndex(v.form), `${lx.id} ${slot} ${v.form}`).not.toBeNull()
        }
      }
    }
  })
})

describe('loadLexemes', () => {
  it('finds every word of every story without the rare-tail index (offline, no 3 MB chunks)', async () => {
    const ids = new Set<string>()
    for (const { id } of STORY_INDEX) for (const s of (await loadStory(id))!.sentences) for (const t of s.tokens) if (t.lex) ids.add(t.lex)
    const got = await loadLexemes([...ids])
    expect([...ids].filter((id) => !got.has(id))).toEqual([])
    expect(got.get('v:засмеяться')?.lemma).toBe('засмея́ться')
  })

  it('reads homograph tail words used by the trainers, and skips names', async () => {
    const got = await loadLexemes(['n:замок:2', 'n:книга', 'name:Анна'])
    expect([...got.keys()].sort()).toEqual(['n:замок:2', 'n:книга'])
  })
})

describe('ru helpers', () => {
  it('folds stress and ё', () => {
    expect(fold('Ещё ру́ку')).toBe('еще руку')
  })
})

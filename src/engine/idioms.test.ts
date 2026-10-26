import { describe, expect, it } from 'vitest'
import { loadIdioms } from '../lib/content'
import { mulberry32 } from '../lib/rng'
import { grade } from './grader'
import { idiomItem, idiomSession } from './idioms'

describe('idioms', () => {
  it('ids are unique and every entry has a meaning and an example', async () => {
    const all = await loadIdioms()
    expect(all.length).toBeGreaterThanOrEqual(75)
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length)
    for (const x of all) expect(x.examples?.length, x.id).toBeGreaterThan(0)
  })
  it('every idiom makes a four-way meaning question that grades', async () => {
    const all = await loadIdioms()
    const rng = mulberry32(2)
    for (const x of all) {
      const it = idiomItem(x, all, rng)
      expect(new Set(it.choices).size, x.id).toBe(4)
      expect(grade(it, { kind: 'choice', value: x.meaning }, {}).correct, x.id).toBe(true)
    }
    expect(idiomSession(all, rng, 10)).toHaveLength(10)
  })
})

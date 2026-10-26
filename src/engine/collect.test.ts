import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../lib/rng'
import { CARD_COUNT, CARD_SETS, loadCardSet } from '../lib/cards'
import { pickCard, rollChest, TIERS } from '../rewards/chest'
import { BUILDINGS, levelFor, townRank, townState } from './town'

describe('cards', () => {
  it('index and set files agree, and every blurb is analysed', async () => {
    expect(CARD_COUNT).toBe(32)
    for (const s of CARD_SETS) {
      const full = await loadCardSet(s.file)
      expect(full?.cards.map((c) => c.id)).toEqual(s.cards.map((c) => c.id))
      for (const c of full!.cards) {
        const words = c.blurb.sentences.flatMap((x) => x.tokens).filter((t) => /[а-яё]/i.test(t.t)) // ru-ignore
        expect(words.length).toBeGreaterThan(3)
        for (const t of words) expect(t.lemma && t.g, `${c.id}: ${t.t}`).toBeTruthy()
      }
    }
  })

  it('chests deal only unowned cards, never rarer than the chest', () => {
    const rng = mulberry32(3)
    const options = CARD_SETS.flatMap((s) => s.cards).map((c) => ({ id: c.id, rarity: c.rarity }))
    for (const tier of TIERS) {
      for (let i = 0; i < 50; i++) {
        const id = pickCard(rng, options, tier)
        const card = options.find((c) => c.id === id)!
        expect(TIERS.indexOf(card.rarity)).toBeLessThanOrEqual(TIERS.indexOf(tier))
      }
    }
    expect(pickCard(rng, [], 'legendary')).toBeNull()
    const legendary = rollChest(1, rng, { skins: [], freezes: 0, cardOptions: options }, 'legendary')
    expect(legendary.loot.some((l) => l.kind === 'card')).toBe(true)
    expect(rollChest(1, rng, { skins: [], freezes: 0 }, 'legendary').loot.some((l) => l.kind === 'card')).toBe(false)
  })
})

describe('town', () => {
  it('levels buildings by thresholds and ranks the town', () => {
    const b = BUILDINGS.find((x) => x.id === 'library')!
    expect([0, 1, 4, 5, 40, 99].map((v) => levelFor(b, v))).toEqual([0, 1, 1, 2, 5, 5])
    const st = townState({ stories: 5, units: 45 })
    expect(st.find((x) => x.building.id === 'school')).toMatchObject({ level: 5, next: undefined })
    expect(st.find((x) => x.building.id === 'library')).toMatchObject({ level: 2, next: 12 })
    expect(townRank(0)[1]).toBe('Ху́тор')
    expect(townRank(50)[1]).toBe('Столи́ца')
  })
})

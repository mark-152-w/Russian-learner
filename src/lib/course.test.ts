import { describe, expect, it } from 'vitest'
import type { Unit } from '../types/content.gen'
import { nextUnit } from './course'

const u = (level: string, number: number) => ({ id: `u-${level.toLowerCase()}-0${number}`, number, level }) as Unit
const units = [u('A1', 1), u('A2', 1), u('A2', 2), u('B1', 1), u('B1', 2)]
const done = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { lessons: 1, best: 1, completed: 1 }]))

describe('next unit', () => {
  it('starts a new learner at the very first unit', () => {
    expect(nextUnit(units, {})?.id).toBe('u-a1-01')
  })
  it('sends a learner back to a unit they skipped inside a level they have started', () => {
    expect(nextUnit(units, done('u-a1-01', 'u-a2-02'))?.id).toBe('u-a2-01')
    expect(nextUnit(units, done('u-a1-01', 'u-a2-02', 'u-b1-01'))?.id).toBe('u-a2-01')
  })
  it('does not push a level the learner went straight past', () => {
    expect(nextUnit(units, done('u-a2-01'))?.id).toBe('u-a2-02')
    expect(nextUnit(units, done('u-b1-01'))?.id).toBe('u-b1-02')
  })
  it('has nothing left once every unit that counts is done', () => {
    expect(nextUnit(units, done('u-b1-01', 'u-b1-02'))).toBeUndefined()
  })
})

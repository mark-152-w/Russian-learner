import { describe, expect, it } from 'vitest'
import { RELEARN_GAP, RELEARN_MAX, requeueMissed } from './relearn'

const q = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

describe('missed items within a session', () => {
  it('by default come back once, at the end, when the session has room', () => {
    expect(requeueMissed(q, 0, 1, 'once')).toEqual([...q, 'a'])
    expect(requeueMissed(q, 0, 2, 'once')).toBeNull()
    expect(requeueMissed(q, 5, 1, 'once')).toBeNull()
  })
  it('in review, come back a few items later until answered correctly', () => {
    const after = requeueMissed(q, 1, 1, 'until-correct')!
    expect(after.indexOf('b', 2)).toBe(1 + 1 + RELEARN_GAP)
    expect(after).toHaveLength(q.length + 1)
    // near the end of the queue the retry goes last, even as the very next item
    expect(requeueMissed(q, 6, 1, 'until-correct')).toEqual([...q, 'g'])
  })
  it('stop retrying after the cap', () => {
    expect(requeueMissed(q, 0, RELEARN_MAX, 'until-correct')).not.toBeNull()
    expect(requeueMissed(q, 0, RELEARN_MAX + 1, 'until-correct')).toBeNull()
  })
})

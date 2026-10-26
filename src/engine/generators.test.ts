import { describe, expect, it } from 'vitest'
import { overlaps } from './generators'

describe('meaning distractors', () => {
  it('treats glosses sharing a content word as too close', () => {
    expect(overlaps('first-class', 'first')).toBe(true)
    expect(overlaps('to run away', 'run')).toBe(true)
    expect(overlaps('the main', 'the first')).toBe(false)
    expect(overlaps('pancake', 'cake')).toBe(false)
  })
})

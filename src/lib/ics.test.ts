import { describe, expect, it } from 'vitest'
import { reminderIcs } from './ics'
import { pentatonicFreq } from '../audio/sound'

describe('reminder .ics', () => {
  it('is a daily recurring floating-time event starting tomorrow', () => {
    const ics = reminderIcs('19:30', new Date(2026, 9, 25, 10), 'https://example.org/')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).toContain('DTSTART:20261026T193000')
    expect(ics).toContain('DTEND:20261026T195000')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
})

describe('pentatonic combo sounds', () => {
  it('climb a C-major pentatonic scale, an octave every five steps', () => {
    expect(pentatonicFreq(0)).toBeCloseTo(523.25)
    expect(pentatonicFreq(5)).toBeCloseTo(1046.5)
    expect(pentatonicFreq(3) / pentatonicFreq(0)).toBeCloseTo(2 ** (7 / 12))
  })
})

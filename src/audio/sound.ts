// Synthesised feedback sounds (Web Audio, no asset files). Correct answers climb a pentatonic
// scale with the combo, so a streak of right answers audibly builds.

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

function ac(): AudioContext | null {
  if (!enabled || typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const PENTATONIC = [0, 2, 4, 7, 9]

/** Frequency of the n-th step up a C-major pentatonic scale starting at C5. */
export function pentatonicFreq(step: number): number {
  const semis = PENTATONIC[step % 5]! + 12 * Math.floor(step / 5)
  return 523.25 * 2 ** (semis / 12)
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'triangle', gain = 0.14, slideTo?: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(c.destination)
  o.start(at)
  o.stop(at + dur + 0.02)
}

export const sound = {
  correct(combo: number) {
    const c = ac()
    if (!c) return
    const step = Math.min(Math.max(combo - 1, 0), 14)
    const t = c.currentTime
    tone(c, pentatonicFreq(step), t, 0.22, 'triangle', 0.16)
    tone(c, pentatonicFreq(step) * 2, t + 0.01, 0.14, 'sine', 0.04)
  },
  comboUp(mult: number) {
    const c = ac()
    if (!c) return
    const t = c.currentTime + 0.12
    const base = mult >= 5 ? 10 : mult >= 3 ? 7 : 5
    ;[0, 1, 2, 3].forEach((i) => tone(c, pentatonicFreq(base + i), t + i * 0.06, 0.18, 'square', 0.05))
  },
  golden() {
    const c = ac()
    if (!c) return
    const t = c.currentTime
    ;[12, 14, 16, 17, 19].forEach((s, i) => tone(c, pentatonicFreq(s), t + i * 0.045, 0.25, 'sine', 0.07))
  },
  wrong() {
    const c = ac()
    if (!c) return
    tone(c, 150, c.currentTime, 0.22, 'sine', 0.18, 70)
  },
  tap() {
    const c = ac()
    if (!c) return
    tone(c, 880, c.currentTime, 0.04, 'sine', 0.03)
  },
  chest(tierIndex: number) {
    const c = ac()
    if (!c) return
    const t = c.currentTime
    const n = 4 + tierIndex * 2
    for (let i = 0; i < n; i++) tone(c, pentatonicFreq(3 + i), t + i * 0.07, 0.3, 'triangle', 0.08)
  },
  levelUp() {
    const c = ac()
    if (!c) return
    const t = c.currentTime
    ;[0, 2, 4, 5, 7, 10].forEach((s, i) => tone(c, pentatonicFreq(s), t + i * 0.11, i === 5 ? 0.9 : 0.3, 'triangle', 0.12))
  },
}

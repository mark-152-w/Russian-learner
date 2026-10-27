// Text-to-speech via the Web Speech API (offline when the OS has a Russian voice installed).
import { useEffect, useState } from 'react'
import { stripStress } from '../lib/ru'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function russianVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ru'))
}

/** Whether the voice list is known: the browser has listed its voices, fired voiceschanged, or the wait timed out.
 *  Kept for the whole visit, so session pages don't each wait again on devices with no Russian voice. */
let settled = false
const onSettle = new Set<() => void>()
const voicesKnown = () => settled || !ttsSupported() || speechSynthesis.getVoices().length > 0
function settle() {
  if (settled) return
  settled = true
  onSettle.forEach((l) => l())
}

/** Starts the voice check at startup, so the first session page rarely has to wait for it. */
export function primeVoices() {
  if (settled || !ttsSupported()) return
  if (speechSynthesis.getVoices().length) return settle()
  // some browsers (Chrome) fill the list asynchronously; a device without voices never fires the event
  speechSynthesis.addEventListener('voiceschanged', settle, { once: true })
  setTimeout(settle, 1500)
}

export function useRussianVoices(): { voices: SpeechSynthesisVoice[]; ready: boolean } {
  const [state, setState] = useState(() => ({ voices: russianVoices(), ready: voicesKnown() }))
  useEffect(() => {
    if (!ttsSupported()) return
    const update = () => setState({ voices: russianVoices(), ready: true })
    primeVoices()
    if (voicesKnown()) {
      settle()
      update()
    }
    onSettle.add(update)
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => {
      onSettle.delete(update)
      speechSynthesis.removeEventListener('voiceschanged', update)
    }
  }, [])
  return state
}

export interface SpeakOptions {
  rate?: number
  voice?: string
  /** 0–2; dialogues give the second speaker a different pitch when only one voice is installed. */
  pitch?: number
  onEnd?: () => void
  onBoundary?: (charIndex: number) => void
}

export function speak(text: string, opts: SpeakOptions = {}) {
  if (!ttsSupported()) return
  speechSynthesis.cancel()
  // Stress marks are combining characters some engines read out loud; ё stays.
  const u = new SpeechSynthesisUtterance(stripStress(text))
  u.lang = 'ru-RU'
  u.rate = opts.rate ?? 0.9
  if (opts.pitch !== undefined) u.pitch = opts.pitch
  const voices = russianVoices()
  const v = voices.find((x) => x.voiceURI === opts.voice) ?? voices.find((x) => x.localService) ?? voices[0]
  if (v) u.voice = v
  if (opts.onEnd) u.onend = opts.onEnd
  if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary!(e.charIndex)
  speechSynthesis.speak(u)
}

export const stopSpeaking = () => ttsSupported() && speechSynthesis.cancel()

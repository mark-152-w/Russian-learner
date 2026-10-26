// Text-to-speech via the Web Speech API (offline when the OS has a Russian voice installed).
import { useEffect, useState } from 'react'
import { stripStress } from '../lib/ru'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function russianVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ru'))
}

/** Russian voices, updating when the browser finishes loading its voice list. */
export function useRussianVoices(): { voices: SpeechSynthesisVoice[]; ready: boolean } {
  const [state, setState] = useState(() => ({ voices: russianVoices(), ready: russianVoices().length > 0 }))
  useEffect(() => {
    if (!ttsSupported()) {
      setState({ voices: [], ready: true })
      return
    }
    const update = () => setState({ voices: russianVoices(), ready: true })
    speechSynthesis.addEventListener('voiceschanged', update)
    const t = setTimeout(update, 1500)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', update)
      clearTimeout(t)
    }
  }, [])
  return state
}

export interface SpeakOptions {
  rate?: number
  voice?: string
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
  const voices = russianVoices()
  const v = voices.find((x) => x.voiceURI === opts.voice) ?? voices.find((x) => x.localService) ?? voices[0]
  if (v) u.voice = v
  if (opts.onEnd) u.onend = opts.onEnd
  if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary!(e.charIndex)
  speechSynthesis.speak(u)
}

export const stopSpeaking = () => ttsSupported() && speechSynthesis.cancel()
